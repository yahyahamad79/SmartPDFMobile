import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { PDFDocument } from 'pdf-lib';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

/**
 * Merge PDF — offline tool.
 * Pick multiple PDF files, choose specific pages from each,
 * merge them on-device with pdf-lib, then save (Android) or share (iOS).
 * No internet required.
 */

type PickedFile = {
  uri: string;
  name: string;
  size?: number;
  pageCount: number;          // عدد صفحات الملف
  selected: number[];         // أرقام الصفحات المختارة (1-based)
};

export default function MergePdfScreen() {
  const router = useRouter();
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [busy, setBusy] = useState(false);

  // قراءة ملف كـ base64
  const readAsBase64 = async (uri: string) => {
    return await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });
  };

  // اختيار ملفات PDF من الجهاز + قراءة عدد صفحاتها
  const pickFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const picked: PickedFile[] = [];
      for (const a of result.assets) {
        try {
          const b64 = await readAsBase64(a.uri);
          const doc = await PDFDocument.load(b64, { ignoreEncryption: true });
          const count = doc.getPageCount();
          // افتراضياً: كل الصفحات مختارة
          const all = Array.from({ length: count }, (_, i) => i + 1);
          picked.push({
            uri: a.uri,
            name: a.name,
            size: a.size ?? undefined,
            pageCount: count,
            selected: all,
          });
        } catch {
          Alert.alert('Error', `Could not read pages of: ${a.name}`);
        }
      }
      setFiles((prev) => [...prev, ...picked]);
    } catch (e) {
      Alert.alert('Error', 'Could not pick files.');
    }
  };

  const removeFile = (uri: string) =>
    setFiles((prev) => prev.filter((f) => f.uri !== uri));

  const clearAll = () => setFiles([]);

  // تبديل اختيار صفحة معينة (1-based)
  const togglePage = (uri: string, page: number) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.uri !== uri) return f;
        const isSel = f.selected.includes(page);
        const next = isSel
          ? f.selected.filter((p) => p !== page)
          : [...f.selected, page].sort((a, b) => a - b);
        return { ...f, selected: next };
      })
    );
  };

  // تحديد كل صفحات ملف
  const selectAllPages = (uri: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.uri === uri
          ? { ...f, selected: Array.from({ length: f.pageCount }, (_, i) => i + 1) }
          : f
      )
    );
  };

  // إلغاء كل صفحات ملف
  const clearPages = (uri: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.uri === uri ? { ...f, selected: [] } : f))
    );
  };

  // حفظ مباشر على أندرويد عبر Storage Access Framework
  const saveAndroid = async (base64: string, fileName: string) => {
    const perm =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Cancelled', 'No folder selected. File was not saved.');
      return false;
    }
    const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
      perm.directoryUri,
      fileName,
      'application/pdf'
    );
    await FileSystem.writeAsStringAsync(destUri, base64, { encoding: 'base64' });
    return true;
  };

  // الدمج عبر pdf-lib (داخل الجهاز)
  const mergeFiles = async () => {
    if (files.length < 2) {
      Alert.alert('Need more files', 'Please pick at least two PDF files to merge.');
      return;
    }
    const totalSelected = files.reduce((sum, f) => sum + f.selected.length, 0);
    if (totalSelected === 0) {
      Alert.alert('No pages selected', 'Please select at least one page to merge.');
      return;
    }

    setBusy(true);
    try {
      const mergedPdf = await PDFDocument.create();

      for (const f of files) {
        if (f.selected.length === 0) continue;
        const b64 = await readAsBase64(f.uri);
        const src = await PDFDocument.load(b64, { ignoreEncryption: true });
        // تحويل الأرقام من 1-based إلى 0-based لـ pdf-lib، مع الحفاظ على الترتيب المختار
        const indices = f.selected.map((p) => p - 1);
        const pages = await mergedPdf.copyPages(src, indices);
        pages.forEach((p) => mergedPdf.addPage(p));
      }

      const mergedBase64 = await mergedPdf.saveAsBase64();
      const fileName = 'merged.pdf';

      if (Platform.OS === 'android') {
        // حفظ مباشر في مجلد يختاره المستخدم
        const ok = await saveAndroid(mergedBase64, fileName);
        if (ok) Alert.alert('Saved', 'Merged PDF saved successfully.');
      } else {
        // iOS: حفظ مؤقت ثم مشاركة (لا يوجد SAF على iOS)
        const outUri = FileSystem.cacheDirectory + fileName;
        await FileSystem.writeAsStringAsync(outUri, mergedBase64, {
          encoding: 'base64',
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(outUri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Save or share merged PDF',
          });
        } else {
          Alert.alert('Done', 'Merged PDF saved to app storage.');
        }
      }
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'Unknown error';
      Alert.alert('Merge failed', msg);
      console.log('MERGE ERROR:', e);
    } finally {
      setBusy(false);
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
  };

  const totalSelected = files.reduce((sum, f) => sum + f.selected.length, 0);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>📑 Merge PDF</Text>
          <Text style={styles.subtitle}>
            Pick PDFs, choose the pages you want from each, and combine them — all on
            your device.
          </Text>
        </View>

        {/* Pick button */}
        <TouchableOpacity style={styles.pickBtn} onPress={pickFiles} disabled={busy}>
          <Text style={styles.pickIcon}>📂</Text>
          <Text style={styles.pickText}>Tap to pick PDF files</Text>
        </TouchableOpacity>

        {/* File list */}
        {files.length > 0 && (
          <View style={styles.listBox}>
            <View style={styles.listHeader}>
              <TouchableOpacity onPress={clearAll} disabled={busy}>
                <Text style={styles.clearText}>Clear all</Text>
              </TouchableOpacity>
              <Text style={styles.listTitle}>Selected files ({files.length})</Text>
            </View>

            {files.map((f, i) => (
              <View key={f.uri} style={styles.fileCard}>
                {/* اسم الملف وحجمه */}
                <View style={styles.fileRow}>
                  <TouchableOpacity onPress={() => removeFile(f.uri)} disabled={busy}>
                    <Text style={styles.removeBtn}>✕</Text>
                  </TouchableOpacity>
                  <Text style={styles.fileSize}>{formatSize(f.size)}</Text>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {i + 1}. {f.name}
                  </Text>
                </View>

                {/* أدوات التحديد */}
                <View style={styles.pageTools}>
                  <Text style={styles.pageInfo}>
                    {f.selected.length} / {f.pageCount} pages
                  </Text>
                  <View style={styles.pageToolsBtns}>
                    <TouchableOpacity
                      onPress={() => clearPages(f.uri)}
                      disabled={busy}
                    >
                      <Text style={styles.toolBtnText}>None</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => selectAllPages(f.uri)}
                      disabled={busy}
                    >
                      <Text style={[styles.toolBtnText, { color: '#60a5fa' }]}>
                        All
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* أزرار أرقام الصفحات */}
                <View style={styles.pagesWrap}>
                  {Array.from({ length: f.pageCount }, (_, idx) => {
                    const page = idx + 1;
                    const active = f.selected.includes(page);
                    return (
                      <TouchableOpacity
                        key={page}
                        style={[styles.pageBtn, active && styles.pageBtnActive]}
                        onPress={() => togglePage(f.uri, page)}
                        disabled={busy}
                      >
                        <Text
                          style={[
                            styles.pageBtnText,
                            active && styles.pageBtnTextActive,
                          ]}
                        >
                          {page}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Merge button */}
        <TouchableOpacity
          style={[
            styles.mergeBtn,
            (files.length < 2 || totalSelected === 0 || busy) &&
              styles.mergeBtnDisabled,
          ]}
          onPress={mergeFiles}
          disabled={files.length < 2 || totalSelected === 0 || busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.mergeText}>
              🚀 Merge & {Platform.OS === 'android' ? 'Save' : 'Share'} ({totalSelected})
            </Text>
          )}
        </TouchableOpacity>

        {files.length === 1 && (
          <Text style={styles.hint}>Add at least one more file to merge.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const NAVY = '#1F4E78';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f172a' },
  scroll: { padding: 16 },

  header: { paddingVertical: 12 },
  backBtn: { marginBottom: 8 },
  backText: { color: '#60a5fa', fontSize: 16, fontWeight: '700' },
  title: { fontSize: 26, fontWeight: '800', color: '#ffffff' },
  subtitle: { fontSize: 13, color: '#94a3b8', marginTop: 6, lineHeight: 19 },

  pickBtn: {
    borderWidth: 2,
    borderColor: NAVY,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 28,
    alignItems: 'center',
    backgroundColor: '#16233a',
    marginTop: 16,
    marginBottom: 18,
  },
  pickIcon: { fontSize: 32, marginBottom: 6 },
  pickText: { color: '#cbd5e1', fontWeight: '700', fontSize: 14 },

  listBox: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#293548',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  listTitle: { color: '#e2e8f0', fontWeight: '800', fontSize: 14 },
  clearText: { color: '#f87171', fontWeight: '700', fontSize: 12 },

  fileCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  removeBtn: { color: '#f87171', fontWeight: '800', fontSize: 14 },
  fileSize: { color: '#64748b', fontSize: 11, fontWeight: '700' },
  fileName: { flex: 1, color: '#e2e8f0', fontSize: 13, fontWeight: '600', textAlign: 'right' },

  pageTools: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pageInfo: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  pageToolsBtns: { flexDirection: 'row', gap: 16 },
  toolBtnText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },

  pagesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pageBtn: {
    minWidth: 38,
    height: 38,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBtnActive: {
    backgroundColor: NAVY,
    borderColor: '#60a5fa',
  },
  pageBtnText: { color: '#94a3b8', fontSize: 13, fontWeight: '700' },
  pageBtnTextActive: { color: '#ffffff' },

  mergeBtn: {
    backgroundColor: NAVY,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  mergeBtnDisabled: { opacity: 0.5 },
  mergeText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  hint: { color: '#94a3b8', fontSize: 12, textAlign: 'center', marginTop: 12 },
});
