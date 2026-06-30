// ─────────────────────────────────────────────────────────────
// app/compress-pdf.tsx
// ضغط PDF عبر السيرفر — محسّن للملفات الكبيرة:
//  • يُوقظ السيرفر أولاً (Render ينام) قبل الرفع
//  • مهلة رفع طويلة صريحة (AbortController)
//  • رفع multipart (FormData)
//  • يستخدم useLang() و saveToArchive(base64, name, kind) مثل بقية الشاشات
// ─────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Archive, FileText, ChevronLeft, Check, Wifi } from 'lucide-react-native';

import { useLang } from '@/lib/i18n';
import { saveToArchive } from '@/lib/archive';
import { SERVER_URL as SERVER } from '@/lib/config';

const WAKE_TIMEOUT = 70_000;
const COMPRESS_TIMEOUT = 240_000; // 4 دقائق — الملفات الكبيرة (مئات الصفحات) على Render المجاني بطيئة

type Level = 'low' | 'medium' | 'high';

async function fetchWithTimeout(url: string, opts: any, ms: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export default function CompressScreen() {
  const router = useRouter();
  const { t, isRTL } = useLang();

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileSizeKb, setFileSizeKb] = useState<number>(0);
  const [level, setLevel] = useState<Level>('medium');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string>('');

  const txtWaking    = isRTL ? 'إيقاظ الخادم…'   : 'Waking server…';
  const txtUploading = isRTL ? 'رفع وضغط الملف…' : 'Uploading & compressing…';
  const txtSaving    = isRTL ? 'حفظ الناتج…'     : 'Saving result…';
  const txtWakeFail  = isRTL ? 'تعذّر الوصول للخادم. تأكد من اتصالك وحاول مجدداً.' : 'Could not reach the server. Check your connection and retry.';
  const txtTimeout   = isRTL ? 'الملف كبير وبه صور كثيرة، وتجاوزت معالجته وقت الخادم. جرّب تقسيمه أولاً (أداة التقسيم) ثم اضغط كل جزء.' : 'This file is large with many images and exceeded the server time. Try splitting it first, then compress each part.';
  const txtTooLarge  = isRTL ? 'الملف كبير جداً (الحد 100 ميجابايت).' : 'File too large (max 100MB).';
  const txtHint      = isRTL ? 'الملفات الكبيرة قد تستغرق وقتاً أطول. لا تُغلق الشاشة أثناء المعالجة.' : 'Large files may take longer. Keep the screen open while processing.';

  async function pickFile() {
    const res = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    setFileUri(a.uri);
    setFileName(a.name);
    const kb = a.size ? Math.round(a.size / 1024) : 0;
    setFileSizeKb(kb);
    // تحذير استباقي: الملفات الكبيرة (>8MB) على الخادم المجاني قد تتجاوز المهلة
    if (kb > 8 * 1024) {
      const warn = isRTL
        ? 'هذا الملف كبير. ضغطه قد يستغرق دقائق وربما يتجاوز وقت الخادم المجاني. الأفضل تقسيمه أولاً ثم ضغط كل جزء.'
        : 'This file is large. Compression may take minutes and could exceed the free server time. Consider splitting it first, then compress each part.';
      Alert.alert(isRTL ? 'ملف كبير' : 'Large file', warn);
    }
  }

  async function wakeServer(): Promise<boolean> {
    const deadline = Date.now() + WAKE_TIMEOUT;
    while (Date.now() < deadline) {
      try {
        const r = await fetchWithTimeout(`${SERVER}/`, { method: 'GET' }, 15_000);
        if (r.ok) return true;
      } catch {}
      await new Promise((res) => setTimeout(res, 3000));
    }
    return false;
  }

  async function run() {
    if (!fileUri) {
      Alert.alert(t('noFile'), t('noFilePick'));
      return;
    }
    setBusy(true);
    try {
      setPhase(txtWaking);
      const awake = await wakeServer();
      if (!awake) throw new Error(txtWakeFail);

      setPhase(txtUploading);
      const form = new FormData();
      // @ts-ignore — صيغة ملف React Native لـ FormData
      form.append('file', {
        uri: fileUri,
        name: fileName || 'document.pdf',
        type: 'application/pdf',
      });
      form.append('level', level);

      const resp = await fetchWithTimeout(
        `${SERVER}/compress`,
        { method: 'POST', body: form },
        COMPRESS_TIMEOUT
      );

      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        if (resp.status === 413) throw new Error(txtTooLarge);
        throw new Error(txt || `HTTP ${resp.status}`);
      }

      setPhase(txtSaving);

      // اقرأ الناتج كـ base64 عبر FileReader (موثوق للملفات الكبيرة)
      const blob = await resp.blob();
      const outB64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('read failed'));
        reader.onloadend = () => {
          const r = String(reader.result || '');
          const comma = r.indexOf(',');
          resolve(comma >= 0 ? r.slice(comma + 1) : r);
        };
        reader.readAsDataURL(blob);
      });

      let baseName = (fileName || 'document.pdf').replace(/\.pdf$/i, '');
      baseName = baseName.replace(/[\\/:*?"<>|]/g, '_');
      const outName = `${baseName}_compressed.pdf`;

      // الحفظ في الأرشيف — نفس توقيع بقية الشاشات: (base64, name, kind)
      const saved = await saveToArchive(outB64, outName, 'compress');

      if (saved) {
        router.push({
          pathname: '/result',
          params: {
            name: saved.name,
            uri: saved.uri,
            size: String(saved.size),
            kind: saved.kind,
          },
        });
      }
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? txtTimeout : (e?.message || t('error'));
      Alert.alert(t('compressFailed'), msg);
    } finally {
      setBusy(false);
      setPhase('');
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color="#5B2C9E" />
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <Archive size={22} color="#7C3AED" />
          <Text style={styles.title}>{t('compressTitle')}</Text>
        </View>
      </View>

      <View style={styles.onlineBox}>
        <Wifi size={16} color="#5B2C9E" />
        <Text style={styles.onlineText}>{t('compressOnlineNote')}</Text>
      </View>

      <TouchableOpacity style={styles.fileBox} onPress={pickFile}>
        <FileText size={20} color="#7C3AED" />
        <View style={{ flex: 1 }}>
          <Text style={styles.fileText} numberOfLines={1}>
            {fileName || t('pickPdf')}
          </Text>
          {fileSizeKb > 0 && <Text style={styles.fileSize}>{fileSizeKb} KB</Text>}
        </View>
      </TouchableOpacity>

      <Text style={styles.label}>{t('compressLevel')}</Text>
      <View style={styles.levelRow}>
        {([['low', 'compressLow'], ['medium', 'compressMedium'], ['high', 'compressHigh']] as [Level, string][]).map(
          ([lvl, key]) => {
            const active = level === lvl;
            return (
              <TouchableOpacity
                key={lvl}
                style={[styles.levelBtn, active && styles.levelBtnActive]}
                onPress={() => setLevel(lvl)}
              >
                {active && <Check size={14} color="#fff" />}
                <Text style={[styles.levelText, active && styles.levelTextActive]}>
                  {t(key)}
                </Text>
              </TouchableOpacity>
            );
          }
        )}
      </View>

      <TouchableOpacity
        style={[styles.runBtn, busy && styles.runBtnDisabled]}
        onPress={run}
        disabled={busy}
      >
        {busy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.runText}>{phase || t('compressBusy')}</Text>
          </View>
        ) : (
          <Text style={styles.runText}>{t('compressBtn')}</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.hint}>{txtHint}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F2FA' },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backBtn: { padding: 4, marginEnd: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#3D2A66' },
  onlineBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#EEE8FB', borderRadius: 12, padding: 12, marginBottom: 16,
  },
  onlineText: { color: '#5B2C9E', fontSize: 12, flex: 1, lineHeight: 18, textAlign: 'right' },
  fileBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#ECE7F5', marginBottom: 20,
  },
  fileText: { color: '#5B2C9E', fontSize: 14 },
  fileSize: { color: '#A99CC9', fontSize: 12, marginTop: 2 },
  label: { fontSize: 13, fontWeight: '600', color: '#6B5B95', marginBottom: 8, textAlign: 'right' },
  levelRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  levelBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#ECE7F5',
  },
  levelBtnActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  levelText: { fontSize: 14, color: '#6B5B95', fontWeight: '500' },
  levelTextActive: { color: '#fff' },
  runBtn: { backgroundColor: '#7C3AED', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  runBtnDisabled: { backgroundColor: '#C8BBE8' },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  runText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  hint: { color: '#A99CC9', fontSize: 11, marginTop: 12, textAlign: 'center', lineHeight: 16 },
});
