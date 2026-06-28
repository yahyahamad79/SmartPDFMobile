import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { PDFDocument } from '@cantoo/pdf-lib';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { saveToArchive } from '@/lib/archive';

/**
 * Compress PDF — server-side compression via PyMuPDF.
 * Uploads the PDF to the server, which re-encodes embedded images
 * at a lower quality, then returns the compressed file.
 * Requires internet (like the upcoming Office->PDF tools).
 */

const COMPRESS_ENDPOINT = 'https://smartpdf-trial-server.onrender.com/compress';

type PickedFile = { uri: string; name: string; size?: number; pageCount: number };

const LEVELS = [
  { key: 'low',    label: 'compressLow' },
  { key: 'medium', label: 'compressMedium' },
  { key: 'high',   label: 'compressHigh' },
];

export default function CompressPdfScreen() {
  const router = useRouter();
  const { t, isRTL } = useLang();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [levelIdx, setLevelIdx] = useState(1);
  const [outputName, setOutputName] = useState('compressed');
  const [resultInfo, setResultInfo] = useState<{ origKB: number; newKB: number } | null>(null);

  const rowDir = isRTL ? 'row-reverse' : 'row';
  const txtAlign: 'right' | 'left' = isRTL ? 'right' : 'left';

  const readAsBase64 = async (uri: string) =>
    await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const b64 = await readAsBase64(a.uri);
      const doc = await PDFDocument.load(b64, { ignoreEncryption: true });
      setFile({ uri: a.uri, name: a.name, size: a.size ?? undefined, pageCount: doc.getPageCount() });
      setResultInfo(null);
    } catch {
      Alert.alert(t('error'), t('couldNotRead'));
    }
  };

  const finalFileName = () => {
    let n = (outputName || 'compressed').trim();
    n = n.replace(/[\\/:*?"<>|]/g, '_');
    if (!n.toLowerCase().endsWith('.pdf')) n += '.pdf';
    return n;
  };

  const compress = async () => {
    if (!file) { Alert.alert(t('noFile'), t('noFilePick')); return; }
    setBusy(true);
    setResultInfo(null);
    try {
      const form = new FormData();
      // @ts-ignore — صيغة ملف React Native
      form.append('file', { uri: file.uri, name: 'doc.pdf', type: 'application/pdf' });
      form.append('level', LEVELS[levelIdx].key);

      const resp = await fetch(COMPRESS_ENDPOINT, { method: 'POST', body: form });
      if (!resp.ok) {
        Alert.alert(t('compressFailed'), `${t('serverError')} (${resp.status})`);
        return;
      }

      const origKB = parseInt(resp.headers.get('X-Original-KB') || '0', 10);
      const newKB = parseInt(resp.headers.get('X-Compressed-KB') || '0', 10);

      // حوّل الرد (PDF) إلى base64 للحفظ
      const blob = await resp.blob();
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string; // data:application/pdf;base64,xxx
          const comma = result.indexOf(',');
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(blob);
      });

      if (origKB && newKB) setResultInfo({ origKB, newKB });
      const fileName = finalFileName();
      const saved = await saveToArchive(base64, fileName, 'compress');
      if (saved) {
        router.push({ pathname: '/result', params: { name: saved.name, uri: saved.uri, size: String(saved.size), kind: saved.kind } });
      }
    } catch (e: any) {
      Alert.alert(t('compressFailed'), e?.message ? String(e.message) : t('serverError'));
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

  const canRun = !!file && !busy;
  const savedPct = resultInfo && resultInfo.origKB > 0
    ? Math.max(0, Math.round((1 - resultInfo.newKB / resultInfo.origKB) * 100))
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.header, { flexDirection: rowDir }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>{isRTL ? '›' : '‹'} {t('back')}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('compressTitle')}</Text>
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
            <Text style={[styles.label, { textAlign: txtAlign }]}>{t('compressLevel')}</Text>
            <View style={[styles.levelRow, { flexDirection: rowDir }]}>
              {LEVELS.map((lv, i) => (
                <TouchableOpacity
                  key={lv.key}
                  style={[styles.levelChip, levelIdx === i && styles.levelChipActive]}
                  onPress={() => setLevelIdx(i)}
                >
                  <Text style={[styles.levelText, levelIdx === i && styles.levelTextActive]}>
                    {t(lv.label)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { textAlign: txtAlign }]}>{t('outputName')}</Text>
            <TextInput
              style={[styles.input, { textAlign: txtAlign }]}
              value={outputName}
              onChangeText={setOutputName}
              placeholder="compressed"
              placeholderTextColor="#A99FBE"
            />

            <View style={styles.onlineNote}>
              <Ionicons name="cloud-outline" size={15} color="#7C3AED" />
              <Text style={[styles.onlineText, { textAlign: txtAlign }]}>{t('compressOnlineNote')}</Text>
            </View>

            {resultInfo && savedPct !== null ? (
              <View style={styles.resultBox}>
                <Text style={styles.resultText}>
                  {formatSize(resultInfo.origKB * 1024)} ← {formatSize(resultInfo.newKB * 1024)}
                </Text>
                <Text style={styles.resultSaved}>{t('compressSaved')} {savedPct}%</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.runBtn, !canRun && styles.runBtnDisabled]}
              onPress={compress}
              disabled={!canRun}
              activeOpacity={0.85}
            >
              {busy ? (
                <View style={[styles.busyRow, { flexDirection: rowDir }]}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.runText}>{t('compressBusy')}</Text>
                </View>
              ) : (
                <Text style={styles.runText}>{t('compressBtn')}</Text>
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
  levelRow: { gap: 8, marginBottom: 16 },
  levelChip: { flex: 1, backgroundColor: '#fff', borderWidth: 0.5, borderColor: '#ECE7F5', borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  levelChipActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  levelText: { color: '#6B6088', fontSize: 13, fontWeight: '500' },
  levelTextActive: { color: '#fff' },
  onlineNote: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#EEE8FB', borderRadius: 12, padding: 12, marginBottom: 16 },
  onlineText: { color: '#5B2C9E', fontSize: 12, flex: 1, lineHeight: 18 },
  resultBox: { backgroundColor: '#E8F8F0', borderRadius: 12, padding: 14, marginBottom: 16, alignItems: 'center' },
  resultText: { color: '#0E7A56', fontSize: 14, fontWeight: '500' },
  resultSaved: { color: '#0E7A56', fontSize: 18, fontWeight: '700', marginTop: 4 },
  runBtn: { backgroundColor: '#7C3AED', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  runBtnDisabled: { backgroundColor: '#C8BBE8' },
  busyRow: { alignItems: 'center', gap: 8 },
  runText: { color: '#fff', fontSize: 15, fontWeight: '500' },
});
