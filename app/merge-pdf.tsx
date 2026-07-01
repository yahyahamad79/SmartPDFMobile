import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readPdfBytes, yieldToUI } from '@/lib/pdfBytes';
import React, { useState, useMemo } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useLang } from '@/lib/i18n';
import { useTheme, ThemeColors } from '@/lib/theme';
import { saveToArchive } from '@/lib/archive';

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
  const { t, isRTL } = useLang();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [outputName, setOutputName] = useState('merged');   // اسم الملف الناتج
  const [addNumbers, setAddNumbers] = useState(false);       // ترقيم الصفحات

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
          const srcBytes = await readPdfBytes(a.uri);
          const doc = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
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
          Alert.alert(t('error'), a.name);
        }
      }
      setFiles((prev) => [...prev, ...picked]);
    } catch (e) {
      Alert.alert(t('error'), t('mergeCouldNotPick'));
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
      Alert.alert(t('cancelled'), t('noFolderSaved'));
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
      Alert.alert(t('mergeNeedMoreT'), t('mergeNeedTwo'));
      return;
    }
    const totalSelected = files.reduce((sum, f) => sum + f.selected.length, 0);
    if (totalSelected === 0) {
      Alert.alert(t('mergeNoPagesT'), t('mergeNoPages'));
      return;
    }

    setBusy(true);
    try {
      const mergedPdf = await PDFDocument.create();

      for (const f of files) {
        if (f.selected.length === 0) continue;
        const srcBytes = await readPdfBytes(f.uri);
        const src = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
        const indices = f.selected.map((p) => p - 1);
        const pages = await mergedPdf.copyPages(src, indices);
        pages.forEach((p) => mergedPdf.addPage(p));
        await yieldToUI();
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
      const __s = await saveToArchive(mergedBase64, fileName, 'merge');
      if (__s) { router.push({ pathname: '/result', params: { name: __s.name, uri: __s.uri, size: String(__s.size), kind: __s.kind } }); setBusy(false); return; }

      if (Platform.OS === 'android') {
        const ok = await saveAndroid(mergedBase64, fileName);
        if (ok) Alert.alert(t('done'), fileName);
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
          Alert.alert(t('done'), t('savedToArchive'));
        }
      }
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'Unknown error';
      Alert.alert(t('mergeFailed'), msg);
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
            <Text style={styles.backText}>{isRTL ? '›' : '‹'} {t('back')}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('mergeTitle')}</Text>
          <Text style={styles.subtitle}>
            Pick PDFs, choose the pages you want from each, and combine them — all on
            your device.
          </Text>
        </View>

        {/* Pick button */}
        <TouchableOpacity style={styles.pickBtn} onPress={pickFiles} disabled={busy}>
          <Ionicons name="folder-open-outline" size={26} color={colors.primary} style={{ marginBottom: 6 }} />
          <Text style={styles.pickText}>{t('pickPdfFiles')}</Text>
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
                    <Ionicons name="close" size={15} color={colors.danger} />
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
                      <Text style={[styles.toolBtnText, { color: colors.primary }]}>All</Text>
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
            <Text style={styles.optLabel}>{t('outputName')}</Text>
            <View style={styles.nameRow}>
              <TextInput
                style={styles.input}
                value={outputName}
                onChangeText={setOutputName}
                placeholder="merged"
                placeholderTextColor={colors.textMuted}
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
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={addNumbers ? colors.primary : colors.textMuted}
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


const makeStyles = (c: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: 16 },

  header: { paddingVertical: 12 },
  backBtn: { marginBottom: 8 },
  backText: { color: c.primary, fontSize: 16, fontWeight: '700' },
  title: { fontSize: 26, fontWeight: '800', color: c.surface },
  subtitle: { fontSize: 13, color: c.textMuted, marginTop: 6, lineHeight: 19 },

  pickBtn: {
    borderWidth: 2,
    borderColor: c.primary,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 28,
    alignItems: 'center',
    backgroundColor: c.surface,
    marginTop: 16,
    marginBottom: 18,
  },
  pickIcon: { fontSize: 32, marginBottom: 6 },
  pickText: { color: c.textMuted, fontWeight: '700', fontSize: 14 },

  listBox: {
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: c.surfaceAlt,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  listTitle: { color: c.text, fontWeight: '800', fontSize: 14 },
  clearText: { color: c.danger, fontWeight: '700', fontSize: 12 },

  fileCard: {
    backgroundColor: c.bg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: c.surface,
  },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  removeBtn: { color: c.danger, fontWeight: '800', fontSize: 14 },
  fileSize: { color: c.textMuted, fontSize: 11, fontWeight: '700' },
  fileName: { flex: 1, color: c.text, fontSize: 13, fontWeight: '600', textAlign: 'right' },

  pageTools: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pageInfo: { color: c.textMuted, fontSize: 12, fontWeight: '700' },
  pageToolsBtns: { flexDirection: 'row', gap: 16 },
  toolBtnText: { color: c.textMuted, fontSize: 12, fontWeight: '700' },

  pagesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pageBtn: {
    minWidth: 38,
    height: 38,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
  pageBtnText: { color: c.textMuted, fontSize: 13, fontWeight: '700' },
  pageBtnTextActive: { color: c.surface },

  optionsBox: {
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: c.surfaceAlt,
  },
  optLabel: { color: c.text, fontWeight: '800', fontSize: 13, marginBottom: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: c.surface,
    fontSize: 15,
    fontWeight: '700',
  },
  ext: { color: c.textMuted, fontSize: 14, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  switchLabel: { color: c.textMuted, fontSize: 13, fontWeight: '600', flex: 1 },

  mergeBtn: {
    backgroundColor: c.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  mergeBtnDisabled: { opacity: 0.5 },
  mergeText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  hint: { color: c.textMuted, fontSize: 12, textAlign: 'center', marginTop: 12 },
});
