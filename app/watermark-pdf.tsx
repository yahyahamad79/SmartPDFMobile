import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { PDFDocument, rgb, degrees, StandardFonts } from '@cantoo/pdf-lib';
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
 * Watermark PDF — adds a diagonal semi-transparent TEXT watermark on
 * every page. Fully offline (pdf-lib). No native libs, no internet.
 */

type PickedFile = { uri: string; name: string; size?: number; pageCount: number };

const OPACITIES = [
  { key: 'light',  value: 0.12 },
  { key: 'medium', value: 0.22 },
  { key: 'strong', value: 0.35 },
];

export default function WatermarkPdfScreen() {
  const router = useRouter();
  const { t, isRTL } = useLang();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [opacityIdx, setOpacityIdx] = useState(1);
  const [outputName, setOutputName] = useState('watermarked');

  const rowDir = isRTL ? 'row-reverse' : 'row';
  const txtAlign: 'right' | 'left' = isRTL ? 'right' : 'left';

  const readAsBase64 = async (uri: string) =>
    await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });

  const bytesToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
    }
    if (typeof btoa === 'function') return btoa(binary);
    // @ts-ignore
    return Buffer.from(binary, 'binary').toString('base64');
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const b64 = await readAsBase64(a.uri);
      const doc = await PDFDocument.load(b64, { ignoreEncryption: true });
      setFile({ uri: a.uri, name: a.name, size: a.size ?? undefined, pageCount: doc.getPageCount() });
    } catch {
      Alert.alert(t('error'), t('couldNotRead'));
    }
  };

  const finalFileName = () => {
    let n = (outputName || 'watermarked').trim();
    n = n.replace(/[\\/:*?"<>|]/g, '_');
    if (!n.toLowerCase().endsWith('.pdf')) n += '.pdf';
    return n;
  };

  const saveOutput = async (base64: string, fileName: string) => {
    if (Platform.OS === 'android') {
      const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) { Alert.alert(t('cancelled'), t('noFolderSaved')); return false; }
      const destUri = await FileSystem.StorageAccessFramework.createFileAsync(perm.directoryUri, fileName, 'application/pdf');
      await FileSystem.writeAsStringAsync(destUri, base64, { encoding: 'base64' });
      Alert.alert(t('done'), fileName);
      return true;
    } else {
      const outUri = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(outUri, base64, { encoding: 'base64' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(outUri, { mimeType: 'application/pdf', dialogTitle: 'Save watermarked PDF' });
      } else { Alert.alert(t('done'), t('savedToArchive')); }
      return true;
    }
  };

  const applyWatermark = async () => {
    if (!file) { Alert.alert(t('noFile'), t('noFilePick')); return; }
    if (!text.trim()) { Alert.alert(t('wmNoTextT'), t('wmNoText')); return; }

    setBusy(true);
    try {
      const b64 = await readAsBase64(file.uri);
      const doc = await PDFDocument.load(b64, { ignoreEncryption: true });
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const opacity = OPACITIES[opacityIdx].value;
      const wm = text.trim();

      const pages = doc.getPages();
      for (const page of pages) {
        const { width, height } = page.getSize();
        // حجم خp يتناسب مع عرض الصفحة وطول النص
        const size = Math.max(24, Math.min(width, height) / Math.max(6, wm.length) * 1.6);
        const textWidth = font.widthOfTextAtSize(wm, size);
        // وسّط النص قطرياً (45 درجة)
        const cx = width / 2;
        const cy = height / 2;
        // إزاحة لمنتصف النص بعد الدوران
        const angleRad = (45 * Math.PI) / 180;
        const offX = (textWidth / 2) * Math.cos(angleRad);
        const offY = (textWidth / 2) * Math.sin(angleRad);
        page.drawText(wm, {
          x: cx - offX,
          y: cy - offY,
          size,
          font,
          color: rgb(0.5, 0.5, 0.5),
          opacity,
          rotate: degrees(45),
        });
      }

      const bytes = await doc.save({ useObjectStreams: false });
      const outB64 = bytesToBase64(bytes);
      await saveOutput(outB64, finalFileName());
    } catch (e: any) {
      Alert.alert(t('wmFailed'), e?.message ? String(e.message) : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const formatSize = (b?: number) => {
    if (!b) return '';
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(2)} MB`;
  };

  const canRun = !!file && !busy && !!text.trim();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.header, { flexDirection: rowDir }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>{isRTL ? '›' : '‹'} {t('back')}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('wmTitle')}</Text>
        </View>

        <TouchableOpacity style={styles.pickBox} onPress={pickFile} activeOpacity={0.8}>
          <View style={styles.pickIcon}><Ionicons name="document-text-outline" size={26} color="#7C3AED" /></View>
          <Text style={[styles.pickTitle, { textAlign: txtAlign }]}>
            {file ? file.name : t('pickPdf')}
          </Text>
          {file ? (
            <Text style={[styles.pickMeta, { textAlign: txtAlign }]}>
              {file.pageCount} {t('pages')} · {formatSize(file.size)}
            </Text>
          ) : null}
        </TouchableOpacity>

        {file ? (
          <>
            <Text style={[styles.label, { textAlign: txtAlign }]}>{t('wmTextLabel')}</Text>
            <TextInput
              style={[styles.input, { textAlign: txtAlign }]}
              placeholder={t('wmTextPlaceholder')}
              placeholderTextColor="#A99FBE"
              value={text}
              onChangeText={setText}
              maxLength={40}
            />

            <Text style={[styles.label, { textAlign: txtAlign }]}>{t('wmOpacity')}</Text>
            <View style={[styles.opacityRow, { flexDirection: rowDir }]}>
              {OPACITIES.map((o, i) => (
                <TouchableOpacity
                  key={o.key}
                  style={[styles.opacityChip, opacityIdx === i && styles.opacityChipActive]}
                  onPress={() => setOpacityIdx(i)}
                >
                  <Text style={[styles.opacityText, opacityIdx === i && styles.opacityTextActive]}>
                    {t('wmOpacity_' + o.key)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { textAlign: txtAlign }]}>{t('outputName')}</Text>
            <TextInput
              style={[styles.input, { textAlign: txtAlign }]}
              value={outputName}
              onChangeText={setOutputName}
              placeholder="watermarked"
              placeholderTextColor="#A99FBE"
            />

            <Text style={[styles.note, { textAlign: txtAlign }]}>{t('wmNote')}</Text>

            <TouchableOpacity
              style={[styles.runBtn, !canRun && styles.runBtnDisabled]}
              onPress={applyWatermark}
              disabled={!canRun}
              activeOpacity={0.85}
            >
              {busy ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.runText}>{t('wmBtn')}</Text>
              )}
            </TouchableOpacity>
          </>
        ) : null}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F2FA' },
  scroll: { padding: 16 },
  header: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  backBtn: { padding: 4 },
  backText: { color: '#7C3AED', fontSize: 15, fontWeight: '500' },
  title: { color: '#2E2148', fontSize: 18, fontWeight: '500' },
  pickBox: { backgroundColor: '#fff', borderWidth: 0.5, borderColor: '#ECE7F5', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 16 },
  pickIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: '#EEE8FB', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  pickTitle: { color: '#2E2148', fontSize: 14, fontWeight: '500', width: '100%' },
  pickMeta: { color: '#9388AE', fontSize: 12, marginTop: 4, width: '100%' },
  label: { color: '#6B6088', fontSize: 13, fontWeight: '500', marginBottom: 8, marginTop: 4 },
  input: { backgroundColor: '#fff', borderWidth: 0.5, borderColor: '#ECE7F5', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#2E2148', fontSize: 15, marginBottom: 16 },
  opacityRow: { gap: 8, marginBottom: 16 },
  opacityChip: { flex: 1, backgroundColor: '#fff', borderWidth: 0.5, borderColor: '#ECE7F5', borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  opacityChipActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  opacityText: { color: '#6B6088', fontSize: 13, fontWeight: '500' },
  opacityTextActive: { color: '#fff' },
  note: { color: '#9388AE', fontSize: 12, marginBottom: 16, lineHeight: 18 },
  runBtn: { backgroundColor: '#7C3AED', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  runBtnDisabled: { backgroundColor: '#C8BBE8' },
  runText: { color: '#fff', fontSize: 15, fontWeight: '500' },
});
