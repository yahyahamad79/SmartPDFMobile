// ─────────────────────────────────────────────────────────────
// app/compress-pdf.tsx
// شاشة ضغط PDF عبر السيرفر — محسّنة للملفات الكبيرة:
//  • تُوقظ السيرفر أولاً (Render Free ينام) قبل رفع الملف
//  • مهلة رفع طويلة صريحة (AbortController) لتفادي قطع الطلب
//  • رفع multipart (FormData) — لا base64 ضخم
//  • رسائل حالة واضحة لكل مرحلة
// ─────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Archive, FileText, ChevronLeft, Check, Wifi } from 'lucide-react-native';

import { t } from '@/lib/i18n';
import { saveToArchive } from '@/lib/archive';
import { SERVER_URL as SERVER } from '@/lib/config';

// المهل (ms)
const WAKE_TIMEOUT = 70_000;   // إيقاظ السيرفر من السبات
const COMPRESS_TIMEOUT = 180_000; // المعالجة (الملفات الكبيرة)

type Level = 'low' | 'medium' | 'high';

// fetch مع مهلة صريحة عبر AbortController
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
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileSizeKb, setFileSizeKb] = useState<number>(0);
  const [level, setLevel] = useState<Level>('medium');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string>('');
  const [result, setResult] = useState<string | null>(null);

  async function pickFile() {
    const res = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    setFileUri(a.uri);
    setFileName(a.name);
    setFileSizeKb(a.size ? Math.round(a.size / 1024) : 0);
    setResult(null);
  }

  // يوقظ السيرفر (Render Free) ويعيد المحاولة حتى يستجيب
  async function wakeServer(): Promise<boolean> {
    const deadline = Date.now() + WAKE_TIMEOUT;
    while (Date.now() < deadline) {
      try {
        const r = await fetchWithTimeout(`${SERVER}/`, { method: 'GET' }, 15_000);
        if (r.ok) return true;
      } catch {
        // ما زال نائماً — أعد المحاولة
      }
      await new Promise((res) => setTimeout(res, 3000));
    }
    return false;
  }

  async function run() {
    if (!fileUri) {
      Alert.alert(t('cmpNoFileT'), t('cmpNoFile'));
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      // 1) أيقظ السيرفر أولاً
      setPhase(t('cmpWaking'));
      const awake = await wakeServer();
      if (!awake) {
        throw new Error(t('cmpWakeFail'));
      }

      // 2) ارفع الملف (multipart) واطلب الضغط
      setPhase(t('cmpUploading'));
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
        if (resp.status === 413) throw new Error(t('cmpTooLarge'));
        throw new Error(txt || `HTTP ${resp.status}`);
      }

      // 3) احفظ الناتج
      setPhase(t('cmpSaving'));
      const origKb = Number(resp.headers.get('x-original-kb')) || fileSizeKb;
      const compKb = Number(resp.headers.get('x-compressed-kb')) || 0;
      const saved = Number(resp.headers.get('x-saved-percent')) || 0;

      // اقرأ كـ blob ثم حوّل لـ base64 عبر FileReader (موثوق للملفات الكبيرة)
      const blob = await resp.blob();
      const outB64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('read failed'));
        reader.onloadend = () => {
          const r = String(reader.result || '');
          // data:application/pdf;base64,XXXX  → خذ ما بعد الفاصلة
          const comma = r.indexOf(',');
          resolve(comma >= 0 ? r.slice(comma + 1) : r);
        };
        reader.readAsDataURL(blob);
      });

      const baseName = (fileName || 'document.pdf').replace(/\.pdf$/i, '');
      const savedPath = await saveToArchive(
        `${baseName}_compressed.pdf`,
        outB64
      );

      setResult(
        t('cmpDone')
          .replace('{from}', String(origKb))
          .replace('{to}', String(compKb))
          .replace('{pct}', String(saved))
      );

      router.push({
        pathname: '/result',
        params: { path: savedPath, name: `${baseName}_compressed.pdf` },
      });
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? t('cmpTimeout') : (e?.message || t('cmpError'));
      Alert.alert(t('cmpErrorT'), msg);
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
          <Text style={styles.title}>{t('cmpTitle')}</Text>
        </View>
      </View>

      {/* تنبيه الاتصال */}
      <View style={styles.onlineBox}>
        <Wifi size={16} color="#5B2C9E" />
        <Text style={styles.onlineText}>{t('cmpOnlineNote')}</Text>
      </View>

      {/* اختيار الملف */}
      <TouchableOpacity style={styles.fileBox} onPress={pickFile}>
        <FileText size={20} color="#7C3AED" />
        <View style={{ flex: 1 }}>
          <Text style={styles.fileText} numberOfLines={1}>
            {fileName || t('cmpPickFile')}
          </Text>
          {fileSizeKb > 0 && (
            <Text style={styles.fileSize}>{fileSizeKb} KB</Text>
          )}
        </View>
      </TouchableOpacity>

      {/* المستوى */}
      <Text style={styles.label}>{t('cmpLevel')}</Text>
      <View style={styles.levelRow}>
        {(['low', 'medium', 'high'] as Level[]).map((lvl) => {
          const active = level === lvl;
          return (
            <TouchableOpacity
              key={lvl}
              style={[styles.levelBtn, active && styles.levelBtnActive]}
              onPress={() => setLevel(lvl)}
            >
              {active && <Check size={14} color="#fff" />}
              <Text style={[styles.levelText, active && styles.levelTextActive]}>
                {t(`cmpLevel_${lvl}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* نتيجة */}
      {result && (
        <View style={styles.resultBox}>
          <Check size={18} color="#0E7A56" />
          <Text style={styles.resultText}>{result}</Text>
        </View>
      )}

      {/* زر التنفيذ */}
      <TouchableOpacity
        style={[styles.runBtn, busy && styles.runBtnDisabled]}
        onPress={run}
        disabled={busy}
      >
        {busy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.runText}>{phase || t('cmpRunning')}</Text>
          </View>
        ) : (
          <Text style={styles.runText}>{t('cmpBtn')}</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.hint}>{t('cmpHint')}</Text>
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
  resultBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#E8F8F0', borderRadius: 12, padding: 14, marginBottom: 16,
  },
  resultText: { color: '#0E7A56', fontSize: 14, fontWeight: '500', flex: 1, textAlign: 'right' },
  runBtn: { backgroundColor: '#7C3AED', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  runBtnDisabled: { backgroundColor: '#C8BBE8' },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  runText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  hint: { color: '#A99CC9', fontSize: 11, marginTop: 12, textAlign: 'center', lineHeight: 16 },
});
