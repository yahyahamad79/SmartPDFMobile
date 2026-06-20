import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

/**
 * Merge PDF — offline tool.
 * Pick multiple PDF files, choose specific pages from each,
 * optionally add page numbers (bottom-center) and set the output name,
 * merge them on-device with pdf-lib, then save (Android) or share (iOS).
 * No internet required.
 */

type PickedFile = {
  uri: string;
  name: string;
  size?: number;
  pageCount: number;
  selected: number[];
};

export default function MergePdfScreen() {
  const router = useRouter();
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [outputName, setOutputName] = useState('merged');   // اسم الملف الناتج
  const [addNumbers, setAddNumbers] = useState(false);       // ترقيم الصفحات

  const readAsBase64 = async (uri: string) =>
    await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });

  // اختيار ملفات PDF + قراءة عدد صفحاتها
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

  const selectAllPages = (uri: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.uri === uri
          ? { ...f, selected: Array.from({ length: f.pageCount }, (_, i) => i + 1) }
          : f
      )
    );
  };

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

  // تنظيف اسم الملف وإضافة الامتداد
  const finalFileName = () => {
    let n = outputName.trim();
    if (!n) n = 'merged';
    // إزالة الرموز غير الصالحة في أسماء الملفات
    n = n.replace(/[\\/:*?"<>|]/g, '_');
    if (!n.toLowerCase().endsWith('.pdf')) n += '.pdf';
    return n;
  };

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
        const indices = f.selected.map((p) => p - 1);
        const pages = await mergedPdf.copyPages(src, indices);
        pages.forEach((p) => mergedPdf.addPage(p));
      }

      // ترقيم الصفحات أسفل المنتصف
      if (addNumbers) {
        const font = await mergedPdf.embedFont(StandardFonts.Helvetica);
        const pages = mergedPdf.getPages();
        const fontSize = 11;
        pages.forEach((page, i) => {
          const { width } = page.getSize();
          const label = `${i + 1}`;
          const textWidth = font.widthOfTextAtSize(label, fontSize);
          page.drawText(label, {
            x: width / 2 - textWidth / 2,
            y: 18, // مسافة من أسفل الصفحة
            size: fontSize,
            font,
            color: rgb(0.2, 0.2, 0.2),
          });
        });
      }

      const mergedBase64 = await mergedPdf.saveAsBase64();
      const fileName = finalFileName();

      if (Platform.OS === 'android') {
        const ok = await saveAndroid(mergedBase64, fileName);
        if (ok) Alert.alert('Saved', `${fileName} saved successfully.`);
      } else {
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
                <View style={styles.fileRow}>
                  <TouchableOpacity onPress={() => removeFile(f.uri)} disabled={busy}>
                    <Text style={styles.removeBtn}>✕</Text>
                  </TouchableOpacity>
                  <Text style={styles.fileSize}>{formatSize(f.size)}</Text>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {i + 1}. {f.name}
                  </Text>
                </View>

                <View style={styles.pageTools}>
                  <Text style={styles.pageInfo}>
                    {f.selected.length} / {f.pageCount} pages
                  </Text>
                  <View style={styles.pageToolsBtns}>
                    <TouchableOpacity onPress={() => clearPages(f.uri)} disabled={busy}>
                      <Text style={styles.toolBtnText}>None</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => selectAllPages(f.uri)} disabled={busy}>
                      <Text style={[styles.toolBtnText, { color: '#60a5fa' }]}>All</Text>
                    </TouchableOpacity>
                  </View>
                </View>

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
                          style={[styles.pageBtnText, active && styles.pageBtnTextActive]}
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

        {/* Options: اسم الملف + الترقيم */}
        {files.length > 0 && (
          <View style={styles.optionsBox}>
            <Text style={styles.optLabel}>Output file name</Text>
            <View style={styles.nameRow}>
              <TextInput
                style={styles.input}
                value={outputName}
                onChangeText={setOutputName}
                placeholder="merged"
                placeholderTextColor="#64748b"
                editable={!busy}
                autoCapitalize="none"
              />
              <Text style={styles.ext}>.pdf</Text>
            </View>

            <View style={styles.switchRow}>
              <Switch
                value={addNumbers}
                onValueChange={setAddNumbers}
                disabled={busy}
                trackColor={{ false: '#334155', true: NAVY }}
                thumbColor={addNumbers ? '#60a5fa' : '#94a3b8'}
              />
              <Text style={styles.switchLabel}>Add page numbers (bottom-center)</Text>
            </View>
          </View>
        )}

        {/* Merge button */}
        <TouchableOpacity
          style={[
            styles.mergeBtn,
            (files.length < 2 || totalSelected === 0 || busy) && styles.mergeBtnDisabled,
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
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
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

  pagesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  pageBtnActive: { backgroundColor: NAVY, borderColor: '#60a5fa' },
  pageBtnText: { color: '#94a3b8', fontSize: 13, fontWeight: '700' },
  pageBtnTextActive: { color: '#ffffff' },

  optionsBox: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#293548',
  },
  optLabel: { color: '#e2e8f0', fontWeight: '800', fontSize: 13, marginBottom: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  ext: { color: '#94a3b8', fontSize: 14, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  switchLabel: { color: '#cbd5e1', fontSize: 13, fontWeight: '600', flex: 1 },

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
