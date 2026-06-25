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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveToArchive, DIR_KEY } from '@/lib/archive';

/**
 * Split PDF — offline tool.
 * Modes: extract (tap pages) / custom (range text) / perPage / ranges (fixed size).
 * Output name is configurable. Runs on-device with pdf-lib.
 * Uses save({ useObjectStreams: false }) + manual base64 for reliable output.
 */

type PickedFile = {
  uri: string;
  name: string;
  size?: number;
  pageCount: number;
  selected: number[];
};

type Mode = 'extract' | 'custom' | 'perPage' | 'ranges';

export default function SplitPdfScreen() {
  const router = useRouter();
  const { t, isRTL } = useLang();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>('extract');
  const [chunkSize, setChunkSize] = useState('5');
  const [rangeText, setRangeText] = useState('');
  const [outputName, setOutputName] = useState('split');

  const readAsBase64 = async (uri: string) =>
    await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });

  // Uint8Array -> base64 (للكتابة بعد save)
  const bytesToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(i, i + chunk) as unknown as number[]
      );
    }
    if (typeof btoa === 'function') return btoa(binary);
    // @ts-ignore
    return Buffer.from(binary, 'binary').toString('base64');
  };

  const cleanBase = () => {
    let n = outputName.trim();
    if (!n) n = 'split';
    n = n.replace(/\.pdf$/i, '');
    n = n.replace(/[\\/:*?"<>|]/g, '_');
    return n;
  };

  const parseRangeText = (text: string, max: number): number[] => {
    const pages: number[] = [];
    const parts = text.split(',');
    for (const raw of parts) {
      const part = raw.trim();
      if (!part) continue;
      if (part.includes('-')) {
        const [aStr, bStr] = part.split('-').map((s) => s.trim());
        let a = parseInt(aStr, 10);
        let b = parseInt(bStr, 10);
        if (isNaN(a) || isNaN(b)) continue;
        if (a > b) [a, b] = [b, a];
        for (let p = a; p <= b; p++) {
          if (p >= 1 && p <= max) pages.push(p);
        }
      } else {
        const p = parseInt(part, 10);
        if (!isNaN(p) && p >= 1 && p <= max) pages.push(p);
      }
    }
    return [...new Set(pages)];
  };

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
      const count = doc.getPageCount();
      setFile({
        uri: a.uri,
        name: a.name,
        size: a.size ?? undefined,
        pageCount: count,
        selected: Array.from({ length: count }, (_, i) => i + 1),
      });
      setOutputName((a.name || 'split').replace(/\.pdf$/i, '') + '_split');
    } catch (e) {
      Alert.alert(t('error'), t('couldNotRead'));
    }
  };

  const clearFile = () => setFile(null);

  const togglePage = (page: number) => {
    setFile((prev) => {
      if (!prev) return prev;
      const isSel = prev.selected.includes(page);
      const next = isSel
        ? prev.selected.filter((p) => p !== page)
        : [...prev.selected, page].sort((a, b) => a - b);
      return { ...prev, selected: next };
    });
  };

  const selectAll = () =>
    setFile((prev) =>
      prev
        ? { ...prev, selected: Array.from({ length: prev.pageCount }, (_, i) => i + 1) }
        : prev
    );

  const clearPages = () =>
    setFile((prev) => (prev ? { ...prev, selected: [] } : prev));

  const outputOne = async (
    base64: string,
    fileName: string,
    dirUri: string | null
  ) => {
    if (Platform.OS === 'android' && dirUri) {
      const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
        dirUri,
        fileName,
        'application/pdf'
      );
      await FileSystem.writeAsStringAsync(destUri, base64, { encoding: 'base64' });
      return destUri;
    } else {
      const outUri = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(outUri, base64, { encoding: 'base64' });
      return outUri;
    }
  };

  // بناء مستند من مجموعة صفحات (0-based) -> base64 موثوق
  // نعيد تحميل المصدر لكل ملف لضمان نسخ سليم
  const buildPdfBase64 = async (
    srcBase64: string,
    indices: number[]
  ): Promise<string> => {
    const src = await PDFDocument.load(srcBase64, { ignoreEncryption: true });
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, indices);
    pages.forEach((p) => out.addPage(p));
    const bytes = await out.save({ useObjectStreams: false });
    return bytesToBase64(bytes);
  };

  const split = async () => {
    if (!file) {
      Alert.alert(t('noFile'), t('noFilePick'));
      return;
    }

    let customPages: number[] = [];
    if (mode === 'extract' && file.selected.length === 0) {
      Alert.alert(t('noFile'), t('splitNoPages'));
      return;
    }
    if (mode === 'custom') {
      customPages = parseRangeText(rangeText, file.pageCount);
      if (customPages.length === 0) {
        Alert.alert(t('splitInvalidRangeT'), t('splitInvalidRange'));
        return;
      }
    }
    let size = 0;
    if (mode === 'ranges') {
      size = parseInt(chunkSize, 10);
      if (!size || size < 1) {
        Alert.alert(t('splitInvalidSizeT'), t('splitInvalidSize'));
        return;
      }
    }

    setBusy(true);
    try {
      // نقرأ المصدر مرة واحدة كـ base64، ونعيد تحميله داخل buildPdfBase64 لكل ملف
      const srcBase64 = await readAsBase64(file.uri);
      const probe = await PDFDocument.load(srcBase64, { ignoreEncryption: true });
      const total = probe.getPageCount();

      // نحدد قوائم الصفحات لكل ملف ناتج أولاً (قبل طلب الصلاحية)
      const jobs: { indices: number[]; name: string }[] = [];
      const base = cleanBase();

      if (mode === 'extract') {
        jobs.push({ indices: file.selected.map((p) => p - 1), name: `${base}.pdf` });
      } else if (mode === 'custom') {
        jobs.push({ indices: customPages.map((p) => p - 1), name: `${base}.pdf` });
      } else if (mode === 'perPage') {
        for (let i = 0; i < total; i++) {
          jobs.push({ indices: [i], name: `${base}_page_${i + 1}.pdf` });
        }
      } else {
        for (let start = 0; start < total; start += size) {
          const indices: number[] = [];
          for (let j = start; j < Math.min(start + size, total); j++) indices.push(j);
          const from = start + 1;
          const to = Math.min(start + size, total);
          jobs.push({ indices, name: `${base}_${from}-${to}.pdf` });
        }
      }

      // نبني كل الملفات في الذاكرة أولاً
      const built: { base64: string; name: string }[] = [];
      for (const job of jobs) {
        const b64 = await buildPdfBase64(srcBase64, job.indices);
        built.push({ base64: b64, name: job.name });
        await saveToArchive(b64, job.name, 'split');
      }

      // نستخدم المجلد المحفوظ في الإعدادات إن وُجد وكان صالحاً، وإلا نطلبه مرة
      let dirUri: string | null = null;
      if (Platform.OS === 'android') {
        let saved = null;
        try { saved = await AsyncStorage.getItem(DIR_KEY); } catch {}
        if (saved) {
          try {
            await FileSystem.StorageAccessFramework.readDirectoryAsync(saved);
            dirUri = saved;
          } catch {
            dirUri = null; // لم يعد صالحاً
          }
        }
        if (!dirUri) {
          const perm =
            await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert(t('cancelled'), t('noFolderSaved'));
            setBusy(false);
            return;
          }
          dirUri = perm.directoryUri;
          try { await AsyncStorage.setItem(DIR_KEY, dirUri); } catch {}
        }
      }

      const outputs: string[] = [];
      for (const b of built) {
        const uri = await outputOne(b.base64, b.name, dirUri);
        outputs.push(uri);
      }

      if (Platform.OS === 'android') {
        Alert.alert(t('filesSaved'), String(outputs.length));
      } else {
        if (await Sharing.isAvailableAsync()) {
          for (const uri of outputs) {
            await Sharing.shareAsync(uri, {
              mimeType: 'application/pdf',
              dialogTitle: 'Save or share split PDF',
            });
          }
        } else {
          Alert.alert(t('done'), t('savedToArchive'));
        }
      }
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'Unknown error';
      Alert.alert(t('splitFailed'), msg);
      console.log('SPLIT ERROR:', e);
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

  const customCount = file ? parseRangeText(rangeText, file.pageCount).length : 0;

  const actionLabel = () => {
    const verb = Platform.OS === 'android' ? 'Save' : 'Share';
    if (mode === 'extract') return `✂️ Extract & ${verb}`;
    if (mode === 'custom') return `✂️ Extract range & ${verb}`;
    if (mode === 'perPage') return `✂️ Split each page & ${verb}`;
    return `✂️ Split by ${chunkSize || '?'} & ${verb}`;
  };

  const nameHint = () => {
    if (mode === 'perPage') return 'Used as prefix: name_page_1.pdf, name_page_2.pdf …';
    if (mode === 'ranges') return 'Used as prefix: name_1-5.pdf, name_6-10.pdf …';
    return 'The output file will be saved as name.pdf';
  };

  const canRun =
    !!file &&
    !busy &&
    (mode !== 'extract' || file.selected.length > 0) &&
    (mode !== 'custom' || customCount > 0);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>{isRTL ? '›' : '‹'} {t('back')}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('splitTitle')}</Text>
          <Text style={styles.subtitle}>
            Extract pages, type a custom range, split each page, or break the PDF into
            fixed-size parts — all on your device.
          </Text>
        </View>

        <TouchableOpacity style={styles.pickBtn} onPress={pickFile} disabled={busy}>
          <Ionicons name="folder-open-outline" size={26} color="#60a5fa" style={{ marginBottom: 6 }} />
          <Text style={styles.pickText}>{file ? t('pickPdfDiff') : t('pickPdf')}</Text>
        </TouchableOpacity>

        {file && (
          <>
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

            <View style={styles.modeRow}>
              {([
                ['extract', 'Extract'],
                ['custom', 'Range'],
                ['perPage', 'Each'],
                ['ranges', 'By size'],
              ] as [Mode, string][]).map(([m, label]) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
                  onPress={() => setMode(m)}
                  disabled={busy}
                >
                  <Text
                    style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {mode === 'extract' && (
              <View style={styles.listBox}>
                <View style={styles.pageTools}>
                  <Text style={styles.pageInfo}>
                    {file.selected.length} / {file.pageCount} selected
                  </Text>
                  <View style={styles.pageToolsBtns}>
                    <TouchableOpacity onPress={clearPages} disabled={busy}>
                      <Text style={styles.toolBtnText}>None</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={selectAll} disabled={busy}>
                      <Text style={[styles.toolBtnText, { color: '#60a5fa' }]}>All</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.pagesWrap}>
                  {Array.from({ length: file.pageCount }, (_, idx) => {
                    const page = idx + 1;
                    const active = file.selected.includes(page);
                    return (
                      <TouchableOpacity
                        key={page}
                        style={[styles.pageBtn, active && styles.pageBtnActive]}
                        onPress={() => togglePage(page)}
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
            )}

            {mode === 'custom' && (
              <View style={styles.listBox}>
                <Text style={styles.modeHint}>
                  Enter pages and ranges (1–{file.pageCount}):
                </Text>
                <TextInput
                  style={styles.input}
                  value={rangeText}
                  onChangeText={setRangeText}
                  keyboardType="numbers-and-punctuation"
                  placeholder="e.g. 1-5, 8, 11-13"
                  placeholderTextColor="#64748b"
                  editable={!busy}
                  autoCapitalize="none"
                />
                {rangeText.trim().length > 0 && (
                  <Text style={styles.modeHintSmall}>
                    {customCount > 0
                      ? `${customCount} page(s) will be extracted into one file.`
                      : 'No valid pages in range yet.'}
                  </Text>
                )}
                <Text style={styles.modeHintSmall}>
                  Use commas to separate, and a dash for a range. Order is preserved.
                </Text>
              </View>
            )}

            {mode === 'perPage' && (
              <View style={styles.listBox}>
                <Text style={styles.modeHint}>
                  Each of the {file.pageCount} pages will be saved as a separate PDF
                  file.
                </Text>
              </View>
            )}

            {mode === 'ranges' && (
              <View style={styles.listBox}>
                <Text style={styles.modeHint}>Pages per file:</Text>
                <TextInput
                  style={styles.input}
                  value={chunkSize}
                  onChangeText={(t) => setChunkSize(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="e.g. 5"
                  placeholderTextColor="#64748b"
                  editable={!busy}
                />
                {!!chunkSize && parseInt(chunkSize, 10) > 0 && (
                  <Text style={styles.modeHintSmall}>
                    {Math.ceil(file.pageCount / parseInt(chunkSize, 10))} file(s) will
                    be created.
                  </Text>
                )}
              </View>
            )}

            <View style={styles.optionsBox}>
              <Text style={styles.optLabel}>{t('outputName')}</Text>
              <View style={styles.nameRow}>
                <TextInput
                  style={styles.input}
                  value={outputName}
                  onChangeText={setOutputName}
                  placeholder="split"
                  placeholderTextColor="#64748b"
                  editable={!busy}
                  autoCapitalize="none"
                />
                <Text style={styles.ext}>.pdf</Text>
              </View>
              <Text style={styles.modeHintSmall}>{nameHint()}</Text>
            </View>

            <TouchableOpacity
              style={[styles.actionBtn, !canRun && styles.actionBtnDisabled]}
              onPress={split}
              disabled={!canRun}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionText}>{actionLabel()}</Text>
              )}
            </TouchableOpacity>
          </>
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

  modeRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  modeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  modeBtnActive: { backgroundColor: NAVY, borderColor: '#60a5fa' },
  modeBtnText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  modeBtnTextActive: { color: '#ffffff' },

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
    marginBottom: 10,
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
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBtnActive: { backgroundColor: NAVY, borderColor: '#60a5fa' },
  pageBtnText: { color: '#94a3b8', fontSize: 13, fontWeight: '700' },
  pageBtnTextActive: { color: '#ffffff' },

  modeHint: { color: '#cbd5e1', fontSize: 13, fontWeight: '600' },
  modeHintSmall: { color: '#94a3b8', fontSize: 12, marginTop: 8 },

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
  ext: { color: '#94a3b8', fontSize: 14, fontWeight: '700' },

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

  actionBtn: {
    backgroundColor: NAVY,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  actionBtnDisabled: { opacity: 0.5 },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
