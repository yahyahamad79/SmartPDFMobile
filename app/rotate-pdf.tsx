import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { saveToArchive } from '@/lib/archive';
import * as Sharing from 'expo-sharing';
import { PDFDocument, degrees } from 'pdf-lib';
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

/**
 * Rotate Pages — offline tool.
 * Pick a PDF, choose pages (or all), and rotate them.
 * Quick actions: make landscape / make portrait (orientation-aware),
 * plus manual 90° left / 90° right / 180°. Saved (Android) or shared (iOS).
 * Runs fully on-device with pdf-lib. No internet required.
 */

type PickedFile = {
  uri: string;
  name: string;
  size?: number;
  pageCount: number;
  selected: number[]; // الصفحات المختارة (1-based)
};

// نوع التدوير المطلوب
type RotateAction =
  | { kind: 'delta'; value: 90 | -90 | 180 } // تدوير نسبي
  | { kind: 'toLandscape' }                   // اجعلها أفقية
  | { kind: 'toPortrait' };                   // اجعلها عمودية

export default function RotatePdfScreen() {
  const router = useRouter();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [outputName, setOutputName] = useState('rotated');

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
      const count = doc.getPageCount();
      setFile({
        uri: a.uri,
        name: a.name,
        size: a.size ?? undefined,
        pageCount: count,
        selected: Array.from({ length: count }, (_, i) => i + 1),
      });
      setOutputName((a.name || 'rotated').replace(/\.pdf$/i, '') + '_rotated');
    } catch (e) {
      Alert.alert('Error', 'Could not read the PDF file.');
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

  const finalFileName = () => {
    let n = outputName.trim();
    if (!n) n = 'rotated';
    n = n.replace(/[\\/:*?"<>|]/g, '_');
    if (!n.toLowerCase().endsWith('.pdf')) n += '.pdf';
    return n;
  };

  const saveOutput = async (base64: string, fileName: string) => {
    if (Platform.OS === 'android') {
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
      Alert.alert('Saved', `${fileName} saved successfully.`);
      return true;
    } else {
      const outUri = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(outUri, base64, { encoding: 'base64' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(outUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save or share rotated PDF',
        });
      } else {
        Alert.alert('Done', 'Rotated PDF saved to app storage.');
      }
      return true;
    }
  };

  // تطبيق التدوير وحفظ الملف
  const applyRotation = async (action: RotateAction) => {
    if (!file) {
      Alert.alert('No file', 'Please pick a PDF file first.');
      return;
    }
    if (file.selected.length === 0) {
      Alert.alert('No pages', 'Please select at least one page to rotate.');
      return;
    }

    setBusy(true);
    try {
      const b64 = await readAsBase64(file.uri);
      const doc = await PDFDocument.load(b64, { ignoreEncryption: true });
      const pages = doc.getPages();

      for (const p of file.selected) {
        const page = pages[p - 1];
        if (!page) continue;

        const current = page.getRotation().angle % 360; // الزاوية الحالية
        const { width, height } = page.getSize();
        // ملاحظة: getSize يعيد الأبعاد قبل التدوير؛ نحدد الاتجاه الظاهر بدمج البُعد والزاوية
        const rotatedSideways = current === 90 || current === 270;
        const baseLandscape = width > height;
        // الاتجاه الظاهر حالياً: أفقي إن (أفقي أصلاً وغير مائل) أو (عمودي أصلاً ومائل)
        const isLandscapeNow = rotatedSideways ? !baseLandscape : baseLandscape;

        let newAngle = current;

        if (action.kind === 'delta') {
          newAngle = (current + action.value + 360) % 360;
        } else if (action.kind === 'toLandscape') {
          // إن كانت عمودية الآن، ندوّرها 90° لتصبح أفقية؛ وإلا نتركها
          if (!isLandscapeNow) newAngle = (current + 90) % 360;
        } else if (action.kind === 'toPortrait') {
          // إن كانت أفقية الآن، ندوّرها 90° لتصبح عمودية؛ وإلا نتركها
          if (isLandscapeNow) newAngle = (current + 90) % 360;
        }

        page.setRotation(degrees(newAngle));
      }

      const out = await doc.saveAsBase64();
      await saveOutput(out, finalFileName());
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'Unknown error';
      Alert.alert('Rotate failed', msg);
      console.log('ROTATE ERROR:', e);
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

  const canRun = !!file && !busy && file.selected.length > 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>🔄 Rotate Pages</Text>
          <Text style={styles.subtitle}>
            Pick a PDF, choose pages, and rotate them — switch between portrait and
            landscape, all on your device.
          </Text>
        </View>

        {/* Pick button */}
        <TouchableOpacity style={styles.pickBtn} onPress={pickFile} disabled={busy}>
          <Text style={styles.pickIcon}>📂</Text>
          <Text style={styles.pickText}>
            {file ? 'Pick a different PDF' : 'Tap to pick a PDF file'}
          </Text>
        </TouchableOpacity>

        {file && (
          <>
            {/* معلومات الملف */}
            <View style={styles.fileCard}>
              <View style={styles.fileRow}>
                <TouchableOpacity onPress={clearFile} disabled={busy}>
                  <Text style={styles.removeBtn}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.fileSize}>
                  {formatSize(file.size)} · {file.pageCount} pages
                </Text>
                <Text style={styles.fileName} numberOfLines={1}>
                  {file.name}
                </Text>
              </View>
            </View>

            {/* اختيار الصفحات */}
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

            {/* اسم الملف الناتج */}
            <View style={styles.optionsBox}>
              <Text style={styles.optLabel}>Output file name</Text>
              <View style={styles.nameRow}>
                <TextInput
                  style={styles.input}
                  value={outputName}
                  onChangeText={setOutputName}
                  placeholder="rotated"
                  placeholderTextColor="#64748b"
                  editable={!busy}
                  autoCapitalize="none"
                />
                <Text style={styles.ext}>.pdf</Text>
              </View>
            </View>

            {/* الخياران الرئيسيان: أفقي / عمودي */}
            <View style={styles.bigRow}>
              <TouchableOpacity
                style={[styles.bigBtn, !canRun && styles.btnDisabled]}
                onPress={() => applyRotation({ kind: 'toLandscape' })}
                disabled={!canRun}
              >
                <Text style={styles.bigIcon}>🖥️</Text>
                <Text style={styles.bigText}>Make Landscape</Text>
                <Text style={styles.bigSub}>Portrait → Landscape</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bigBtn, !canRun && styles.btnDisabled]}
                onPress={() => applyRotation({ kind: 'toPortrait' })}
                disabled={!canRun}
              >
                <Text style={styles.bigIcon}>📄</Text>
                <Text style={styles.bigText}>Make Portrait</Text>
                <Text style={styles.bigSub}>Landscape → Portrait</Text>
              </TouchableOpacity>
            </View>

            {/* تدوير يدوي */}
            <Text style={styles.manualLabel}>Or rotate manually:</Text>
            <View style={styles.manualRow}>
              <TouchableOpacity
                style={[styles.manualBtn, !canRun && styles.btnDisabled]}
                onPress={() => applyRotation({ kind: 'delta', value: -90 })}
                disabled={!canRun}
              >
                <Text style={styles.manualText}>↺ 90°</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.manualBtn, !canRun && styles.btnDisabled]}
                onPress={() => applyRotation({ kind: 'delta', value: 90 })}
                disabled={!canRun}
              >
                <Text style={styles.manualText}>↻ 90°</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.manualBtn, !canRun && styles.btnDisabled]}
                onPress={() => applyRotation({ kind: 'delta', value: 180 })}
                disabled={!canRun}
              >
                <Text style={styles.manualText}>⤧ 180°</Text>
              </TouchableOpacity>
            </View>

            {busy && (
              <View style={styles.busyRow}>
                <ActivityIndicator color="#60a5fa" />
                <Text style={styles.busyText}>Processing…</Text>
              </View>
            )}
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

  listBox: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
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

  bigRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  bigBtn: {
    flex: 1,
    backgroundColor: NAVY,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a5a8a',
  },
  bigIcon: { fontSize: 26, marginBottom: 6 },
  bigText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  bigSub: { color: '#cbd5e1', fontSize: 10.5, marginTop: 3 },
  btnDisabled: { opacity: 0.5 },

  manualLabel: { color: '#94a3b8', fontSize: 13, fontWeight: '700', marginBottom: 10 },
  manualRow: { flexDirection: 'row', gap: 10 },
  manualBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  manualText: { color: '#e2e8f0', fontWeight: '800', fontSize: 15 },

  busyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 18 },
  busyText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
});
