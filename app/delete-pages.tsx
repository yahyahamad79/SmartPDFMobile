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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLang } from '@/lib/i18n';

/**
 * Delete Pages — offline tool.
 * Pick a PDF, tap the pages you want to remove, and produce a new PDF
 * without them. Runs fully on-device with pdf-lib.
 * Saved (Android SAF) or shared (iOS). No internet required.
 */

type PickedFile = {
  uri: string;
  name: string;
  size?: number;
  pageCount: number;
  toDelete: number[]; // أرقام الصفحات المُراد حذفها (1-based)
};

export default function DeletePagesScreen() {
  const router = useRouter();
  const { t, isRTL } = useLang();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [outputName, setOutputName] = useState('edited');

  const readAsBase64 = async (uri: string) =>
    await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const a = result.assets[0];
      const b64 = await readAsBase64(a.uri);
      const doc = await PDFDocument.load(b64, { ignoreEncryption: true });
      setFile({
        uri: a.uri,
        name: a.name,
        size: a.size ?? undefined,
        pageCount: doc.getPageCount(),
        toDelete: [],
      });
      setOutputName((a.name || 'edited').replace(/\.pdf$/i, '') + '_edited');
    } catch (e) {
      Alert.alert(t('error'), t('couldNotRead'));
    }
  };

  const clearFile = () => setFile(null);

  const togglePage = (page: number) => {
    setFile((prev) => {
      if (!prev) return prev;
      const isMarked = prev.toDelete.includes(page);
      const next = isMarked
        ? prev.toDelete.filter((p) => p !== page)
        : [...prev.toDelete, page].sort((a, b) => a - b);
      return { ...prev, toDelete: next };
    });
  };

  const markAll = () =>
    setFile((prev) =>
      prev
        ? { ...prev, toDelete: Array.from({ length: prev.pageCount }, (_, i) => i + 1) }
        : prev
    );

  const clearMarks = () =>
    setFile((prev) => (prev ? { ...prev, toDelete: [] } : prev));

  const finalFileName = () => {
    let n = outputName.trim();
    if (!n) n = 'edited';
    n = n.replace(/[\\/:*?"<>|]/g, '_');
    if (!n.toLowerCase().endsWith('.pdf')) n += '.pdf';
    return n;
  };

  const saveOutput = async (base64: string, fileName: string) => {
    if (Platform.OS === 'android') {
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
      Alert.alert(t('done'), fileName);
      return true;
    } else {
      const outUri = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(outUri, base64, { encoding: 'base64' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(outUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save or share edited PDF',
        });
      } else {
        Alert.alert(t('done'), t('savedToArchive'));
      }
      return true;
    }
  };

  const deletePages = async () => {
    if (!file) {
      Alert.alert(t('noFile'), t('noFilePick'));
      return;
    }
    if (file.toDelete.length === 0) {
      Alert.alert(t('noFile'), t('deleteNoPages'));
      return;
    }
    if (file.toDelete.length >= file.pageCount) {
      Alert.alert(t('deleteCannotAllT'), t('deleteMustRemain'));
      return;
    }

    setBusy(true);
    try {
      const b64 = await readAsBase64(file.uri);
      const doc = await PDFDocument.load(b64, { ignoreEncryption: true });

      // نحذف من الأعلى للأسفل حتى لا تتغير الفهارس أثناء الحذف
      const sortedDesc = [...file.toDelete].sort((a, b) => b - a);
      for (const p of sortedDesc) {
        doc.removePage(p - 1); // 0-based
      }

      const out = await doc.saveAsBase64();
      await saveOutput(out, finalFileName());
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'Unknown error';
      Alert.alert(t('deleteFailed'), msg);
      console.log('DELETE ERROR:', e);
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

  const remaining = file ? file.pageCount - file.toDelete.length : 0;
  const canRun =
    !!file &&
    !busy &&
    file.toDelete.length > 0 &&
    file.toDelete.length < file.pageCount;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>{isRTL ? '›' : '‹'} {t('back')}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('deleteTitle')}</Text>
          <Text style={styles.subtitle}>
            Pick a PDF, tap the pages you want to remove, and save the rest — all on
            your device.
          </Text>
        </View>

        {/* Pick button */}
        <TouchableOpacity style={styles.pickBtn} onPress={pickFile} disabled={busy}>
          <Ionicons name="folder-open-outline" size={26} color="#60a5fa" style={{ marginBottom: 6 }} />
          <Text style={styles.pickText}>{file ? t('pickPdfDiff') : t('pickPdf')}</Text>
        </TouchableOpacity>

        {file && (
          <>
            {/* معلومات الملف */}
            <View style={styles.fileCard}>
              <View style={styles.fileRow}>
                <TouchableOpacity onPress={clearFile} disabled={busy}>
                  <Ionicons name="close" size={15} color="#f87171" />
                </TouchableOpacity>
                <Text style={styles.fileSize}>
                  {formatSize(file.size)} · {file.pageCount} pages
                </Text>
                <Text style={styles.fileName} numberOfLines={1}>
                  {file.name}
                </Text>
              </View>
            </View>

            {/* اختيار الصفحات المراد حذفها */}
            <View style={styles.listBox}>
              <View style={styles.pageTools}>
                <Text style={styles.pageInfo}>
                  {file.toDelete.length} to delete · {remaining} will remain
                </Text>
                <View style={styles.pageToolsBtns}>
                  <TouchableOpacity onPress={clearMarks} disabled={busy}>
                    <Text style={styles.toolBtnText}>None</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={markAll} disabled={busy}>
                    <Text style={[styles.toolBtnText, { color: '#f87171' }]}>All</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.hintSmall}>
                Tap a page to mark it for deletion (turns red).
              </Text>
              <View style={styles.pagesWrap}>
                {Array.from({ length: file.pageCount }, (_, idx) => {
                  const page = idx + 1;
                  const marked = file.toDelete.includes(page);
                  return (
                    <TouchableOpacity
                      key={page}
                      style={[styles.pageBtn, marked && styles.pageBtnMarked]}
                      onPress={() => togglePage(page)}
                      disabled={busy}
                    >
                      <Text
                        style={[styles.pageBtnText, marked && styles.pageBtnTextMarked]}
                      >
                        {page}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* اسم الملف الناتج */}
            <View style={styles.optionsBox}>
              <Text style={styles.optLabel}>{t('outputName')}</Text>
              <View style={styles.nameRow}>
                <TextInput
                  style={styles.input}
                  value={outputName}
                  onChangeText={setOutputName}
                  placeholder="edited"
                  placeholderTextColor="#64748b"
                  editable={!busy}
                  autoCapitalize="none"
                />
                <Text style={styles.ext}>.pdf</Text>
              </View>
            </View>

            {/* زر الحذف */}
            <TouchableOpacity
              style={[styles.actionBtn, !canRun && styles.actionBtnDisabled]}
              onPress={deletePages}
              disabled={!canRun}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionText}>
                  🗑️ Delete & {Platform.OS === 'android' ? 'Save' : 'Share'}
                  {file.toDelete.length > 0 ? ` (${file.toDelete.length})` : ''}
                </Text>
              )}
            </TouchableOpacity>

            {file.toDelete.length >= file.pageCount && file.pageCount > 0 && (
              <Text style={styles.warn}>At least one page must remain.</Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const NAVY = '#1F4E78';
const RED = '#dc2626';

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

  fileCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#293548',
  },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  removeBtn: { color: '#f87171', fontWeight: '800', fontSize: 14 },
  fileSize: { color: '#64748b', fontSize: 11, fontWeight: '700' },
  fileName: { flex: 1, color: '#e2e8f0', fontSize: 13, fontWeight: '600', textAlign: 'right' },

  listBox: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#293548',
  },
  pageTools: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  pageInfo: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  pageToolsBtns: { flexDirection: 'row', gap: 16 },
  toolBtnText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  hintSmall: { color: '#64748b', fontSize: 11, marginBottom: 10 },

  pagesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pageBtn: {
    minWidth: 38,
    height: 38,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBtnMarked: { backgroundColor: RED, borderColor: '#f87171' },
  pageBtnText: { color: '#94a3b8', fontSize: 13, fontWeight: '700' },
  pageBtnTextMarked: { color: '#ffffff' },

  optionsBox: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
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

  actionBtn: {
    backgroundColor: RED,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  actionBtnDisabled: { opacity: 0.5 },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  warn: { color: '#f87171', fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 12 },
});
