// ─────────────────────────────────────────────────────────────
// app/watermark-pdf.tsx
// العلامة المائية (offline) — مع دعم العربية ومعالجة الملفات الكبيرة:
//  • base64 سريع عبر base64-js (بدل الحلقات اليدوية البطيئة على Hermes)
//  • شريط تقدّم + yield للواجهة كل دفعة صفحات (يمنع التجمّد)
//  • دعم العربية الكامل (تشكيل الحروف عبر arabic-reshaper + خط Amiri مضمّن)
// ─────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { PDFDocument, degrees, rgb } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { toByteArray, fromByteArray } from 'base64-js';
import { Stamp, FileText, ChevronLeft, Check } from 'lucide-react-native';

import { t } from '@/lib/i18n';
import { saveToArchive } from '@/lib/archive';
import { AMIRI_FONT_BASE64 } from '@/lib/amiriFont';
import { shapeForPdf, hasArabic } from '@/lib/arabicText';

type Opacity = 'light' | 'medium' | 'strong';
const OPACITY_VALUES: Record<Opacity, number> = {
  light: 0.12, medium: 0.22, strong: 0.35,
};

// يترك الواجهة تتنفّس (يمنع التجمّد على JS thread)
const yieldToUI = () => new Promise((r) => setTimeout(r, 0));

export default function WatermarkScreen() {
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [wmText, setWmText] = useState('');
  const [opacity, setOpacity] = useState<Opacity>('medium');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0); // 0..100

  async function pickFile() {
    const res = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf', copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;
    setFileUri(res.assets[0].uri);
    setFileName(res.assets[0].name);
  }

  async function run() {
    if (!fileUri) { Alert.alert(t('wmNoFileT'), t('wmNoFile')); return; }
    if (!wmText.trim()) { Alert.alert(t('wmNoTextT'), t('wmNoText')); return; }

    setBusy(true);
    setProgress(0);
    try {
      // 1) اقرأ الملف (base64) ثم حوّله لبايتات بسرعة
      const b64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await yieldToUI();
      const srcBytes = toByteArray(b64);
      await yieldToUI();

      // 2) جهّز المستند والخط
      const doc = await PDFDocument.load(srcBytes);
      doc.registerFontkit(fontkit);
      const font = await doc.embedFont(toByteArray(AMIRI_FONT_BASE64), { subset: false });
      const drawText = shapeForPdf(wmText.trim());
      const op = OPACITY_VALUES[opacity];

      // 3) ارسم على كل صفحة، على دفعات مع تحديث التقدّم
      const pages = doc.getPages();
      const total = pages.length;
      const BATCH = 15;
      for (let i = 0; i < total; i++) {
        const page = pages[i];
        const { width, height } = page.getSize();
        const size = Math.max(28, Math.min(width, height) / 12);
        const tw = font.widthOfTextAtSize(drawText, size);
        page.drawText(drawText, {
          x: width / 2 - (tw / 2) * 0.7071,
          y: height / 2 - (tw / 2) * 0.7071,
          size, font, color: rgb(0.5, 0.5, 0.5),
          opacity: op, rotate: degrees(45),
        });
        if ((i + 1) % BATCH === 0 || i === total - 1) {
          setProgress(Math.round(((i + 1) / total) * 90)); // حتى 90%
          await yieldToUI();
        }
      }

      // 4) احفظ (useObjectStreams:false للتوافق)
      const outBytes = await doc.save({ useObjectStreams: false });
      await yieldToUI();
      setProgress(95);
      const outB64 = fromByteArray(outBytes);
      await yieldToUI();

      // 5) خزّن في الأرشيف
      const baseName = (fileName || 'document.pdf').replace(/\.pdf$/i, '');
      const savedPath = await saveToArchive(`${baseName}_watermarked.pdf`, outB64);
      setProgress(100);

      router.push({
        pathname: '/result',
        params: { path: savedPath, name: `${baseName}_watermarked.pdf` },
      });
    } catch (e: any) {
      Alert.alert(t('wmErrorT'), e?.message || t('wmError'));
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  const isAr = hasArabic(wmText);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color="#5B2C9E" />
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <Stamp size={22} color="#7C3AED" />
          <Text style={styles.title}>{t('wmTitle')}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.fileBox} onPress={pickFile}>
        <FileText size={20} color="#7C3AED" />
        <Text style={styles.fileText} numberOfLines={1}>
          {fileName || t('wmPickFile')}
        </Text>
      </TouchableOpacity>

      <Text style={styles.label}>{t('wmTextLabel')}</Text>
      <TextInput
        style={styles.input}
        placeholder={t('wmTextPlaceholder')}
        placeholderTextColor="#A99CC9"
        value={wmText}
        onChangeText={setWmText}
        textAlign={isAr ? 'right' : 'left'}
      />

      <Text style={styles.label}>{t('wmOpacity')}</Text>
      <View style={styles.opacityRow}>
        {(['light', 'medium', 'strong'] as Opacity[]).map((lvl) => {
          const active = opacity === lvl;
          return (
            <TouchableOpacity
              key={lvl}
              style={[styles.opacityBtn, active && styles.opacityBtnActive]}
              onPress={() => setOpacity(lvl)}
            >
              {active && <Check size={14} color="#fff" />}
              <Text style={[styles.opacityText, active && styles.opacityTextActive]}>
                {t(`wmOpacity_${lvl}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.noteBox}>
        <Text style={styles.noteText}>{t('wmNote')}</Text>
      </View>

      <TouchableOpacity
        style={[styles.runBtn, busy && styles.runBtnDisabled]}
        onPress={run}
        disabled={busy}
      >
        {busy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.runText}>
              {progress > 0 ? `${t('wmRunning')} ${progress}%` : t('wmRunning')}
            </Text>
          </View>
        ) : (
          <Text style={styles.runText}>{t('wmBtn')}</Text>
        )}
      </TouchableOpacity>

      {busy && progress > 0 && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F2FA' },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backBtn: { padding: 4, marginEnd: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#3D2A66' },
  fileBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#ECE7F5', marginBottom: 20,
  },
  fileText: { flex: 1, color: '#5B2C9E', fontSize: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#6B5B95', marginBottom: 8, textAlign: 'right' },
  input: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 15,
    color: '#3D2A66', borderWidth: 1, borderColor: '#ECE7F5', marginBottom: 20,
  },
  opacityRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  opacityBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#ECE7F5',
  },
  opacityBtnActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  opacityText: { fontSize: 14, color: '#6B5B95', fontWeight: '500' },
  opacityTextActive: { color: '#fff' },
  noteBox: { backgroundColor: '#EEE8FB', borderRadius: 12, padding: 12, marginBottom: 20 },
  noteText: { color: '#5B2C9E', fontSize: 12, lineHeight: 18, textAlign: 'right' },
  runBtn: { backgroundColor: '#7C3AED', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  runBtnDisabled: { backgroundColor: '#C8BBE8' },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  runText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  progressTrack: {
    height: 6, backgroundColor: '#E5DEF5', borderRadius: 3,
    marginTop: 12, overflow: 'hidden',
  },
  progressFill: { height: 6, backgroundColor: '#7C3AED', borderRadius: 3 },
});
