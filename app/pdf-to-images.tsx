// ─────────────────────────────────────────────────────────────
// app/pdf-to-images.tsx
// تحويل PDF كامل إلى صور عبر السيرفر — يدعم كتباً كاملة مهما كان
// عدد صفحاتها أو حجمها:
//  • يُوقظ السيرفر أولاً (Render ينام) قبل الرفع
//  • رفع multipart بلا حد أقصى فعلي على حجم الكتاب (القيد الوحيد هو
//    قرص/ذاكرة الخادم نفسه، وليس تصميم التطبيق)
//  • معالجة بدفعات صغيرة خلف الكواليس (10 صفحات بالمرة) — المستخدم
//    يرى شريط تقدّم واحداً متصلاً وسلساً، لا يشعر بالدفعات إطلاقاً
//  • تحذير استباقي بحجم الملف وعدد الصفحات والوقت المتوقع قبل البدء
//  • إعادة محاولة تلقائية للدفعة الفاشلة عند انقطاع مؤقت بالاتصال
//  • يستخدم useLang() و saveToArchive(base64, name, kind) مثل بقية الشاشات
// ─────────────────────────────────────────────────────────────

import React, { useState, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { ImageIcon, FileText, ChevronLeft, Check, Wifi } from 'lucide-react-native';

import { useLang } from '@/lib/i18n';
import { useTheme, ThemeColors } from '@/lib/theme';
import { saveToArchive } from '@/lib/archive';
import { SERVER_URL as SERVER } from '@/lib/config';

const WAKE_TIMEOUT = 70_000;
const UPLOAD_TIMEOUT = 300_000;   // 5 دقائق — رفع كتاب ضخم قد يأخذ وقتاً على اتصال بطيء
const BATCH_TIMEOUT = 60_000;     // مهلة كل دفعة (10 صفحات) على حدة
const BATCH_SIZE = 10;
const MAX_BATCH_RETRIES = 5;       // مقاومة أفضل لاتصال غير مستقر (كل دفعة قد تفشل مؤقتاً)

type Quality = 'low' | 'medium' | 'high';

// تقدير تقريبي لثانية/صفحة حسب الجودة (خبرة تجريبية بالخادم المجاني)
const SECS_PER_PAGE: Record<Quality, number> = { low: 0.25, medium: 0.4, high: 0.7 };

async function fetchWithTimeout(url: string, opts: any, ms: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export default function PdfToImagesScreen() {
  const router = useRouter();
  const { t, isRTL } = useLang();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileSizeKb, setFileSizeKb] = useState<number>(0);
  const [quality, setQuality] = useState<Quality>('medium');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string>('');
  const [progress, setProgress] = useState(0);      // 0..100
  const [pagesLabel, setPagesLabel] = useState('');

  // نستخدم ref لإيقاف الحلقة لو غادر المستخدم الشاشة أثناء المعالجة
  const cancelledRef = useRef(false);

  const txtWaking     = isRTL ? 'إيقاظ الخادم…'   : 'Waking server…';
  const txtUploading  = isRTL ? 'رفع الملف…'       : 'Uploading file…';
  const txtWakeFail   = isRTL ? 'تعذّر الوصول للخادم. تأكد من اتصالك وحاول مجدداً.' : 'Could not reach the server. Check your connection and retry.';
  const txtNetFail    = isRTL ? 'انقطع الاتصال أثناء المعالجة. تحقّق من الإنترنت وأعد المحاولة — لن تبدأ من الصفر لو أعدت المحاولة سريعاً.' : 'Connection dropped during processing. Check your internet and retry — it will not restart from scratch if you retry quickly.';
  const txtTooLarge   = isRTL ? 'الملف كبير جداً على معالجة الخادم الحالية.' : 'File too large for the current server capacity.';
  const txtInvalidPdf = isRTL ? 'تعذّرت قراءة الملف. تأكد أنه PDF سليم.' : 'Could not read the file. Make sure it is a valid PDF.';

  function fmtEta(totalPages: number, q: Quality): string {
    const secs = Math.max(5, Math.round(totalPages * SECS_PER_PAGE[q]));
    if (secs < 60) return isRTL ? `${secs} ثانية` : `${secs} sec`;
    const mins = Math.round(secs / 60);
    return isRTL ? `${mins} دقيقة تقريباً` : `~${mins} min`;
  }

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
    setProgress(0);
    setPagesLabel('');
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

  async function uploadFile(onProgress: (pct: number) => void): Promise<{ sessionId: string; totalPages: number }> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let task: ReturnType<typeof FileSystem.createUploadTask> | null = null;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        task?.cancelAsync().catch(() => {});
        reject(new Error(txtNetFail));
      }, UPLOAD_TIMEOUT);

      task = FileSystem.createUploadTask(
        `${SERVER}/pdf2img/upload`,
        fileUri as string,
        {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: 'file',
          mimeType: 'application/pdf',
          parameters: {},
        },
        (data) => {
          if (data.totalBytesExpectedToSend > 0) {
            onProgress(Math.round((data.totalBytesSent / data.totalBytesExpectedToSend) * 100));
          }
        }
      );

      task.uploadAsync()
        .then((res) => {
          if (settled) return;
          clearTimeout(timer);
          settled = true;
          if (!res) return reject(new Error(txtNetFail));
          if (res.status === 413) return reject(new Error(txtTooLarge));
          if (res.status === 400) return reject(new Error(txtInvalidPdf));
          if (res.status !== 200) return reject(new Error(res.body || `HTTP ${res.status}`));
          try {
            resolve(JSON.parse(res.body));
          } catch {
            reject(new Error(txtInvalidPdf));
          }
        })
        .catch((e) => {
          if (settled) return;
          clearTimeout(timer);
          settled = true;
          reject(e);
        });
    });
  }

  // تُعالج دفعة واحدة مع إعادة محاولة تلقائية عند انقطاع مؤقت
  async function processBatch(sessionId: string): Promise<{ processed: number; total: number; done: boolean }> {
    let lastErr: any = null;
    for (let attempt = 0; attempt < MAX_BATCH_RETRIES; attempt++) {
      if (cancelledRef.current) throw new Error('cancelled');
      try {
        const resp = await fetchWithTimeout(
          `${SERVER}/pdf2img/batch`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, quality, batchSize: BATCH_SIZE }),
          },
          BATCH_TIMEOUT
        );
        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          throw new Error(txt || `HTTP ${resp.status}`);
        }
        return await resp.json();
      } catch (e) {
        lastErr = e;
        if (attempt < MAX_BATCH_RETRIES - 1) await sleep(Math.min(8000, 1500 * (attempt + 1)));
      }
    }
    throw lastErr || new Error(txtNetFail);
  }

  async function downloadZip(sessionId: string): Promise<string> {
    const resp = await fetchWithTimeout(
      `${SERVER}/pdf2img/download/${sessionId}`,
      { method: 'GET' },
      UPLOAD_TIMEOUT
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read failed'));
      reader.onloadend = () => {
        const r = String(reader.result || '');
        const comma = r.indexOf(',');
        resolve(comma >= 0 ? r.slice(comma + 1) : r);
      };
      reader.readAsDataURL(blob);
    });
  }

  async function startConversion() {
    cancelledRef.current = false;
    setBusy(true);
    setProgress(0);
    try {
      setPhase(txtWaking);
      const awake = await wakeServer();
      if (!awake) throw new Error(txtWakeFail);

      setPhase(txtUploading);
      const { sessionId, totalPages } = await uploadFile((uploadPct) => {
        setProgress(Math.round(uploadPct * 0.2));
        setPhase(`${txtUploading} ${uploadPct}%`);
      });

      // حلقة الدفعات — شريط تقدّم واحد متصل، المستخدم لا يرى الدفعات إطلاقاً
      let done = false;
      let processed = 0;
      while (!done) {
        if (cancelledRef.current) return;
        const r = await processBatch(sessionId);
        processed = r.processed;
        done = r.done;
        const batchPct = Math.round((processed / r.total) * 100);
        setProgress(20 + Math.round(batchPct * 0.8));
        setPagesLabel(`${processed} / ${r.total}`);
        setPhase(`${t('pdf2imgBusy')} ${batchPct}%`);
      }

      setPhase(t('pdf2imgSaving'));
      const zipB64 = await downloadZip(sessionId);

      let baseName = (fileName || 'document.pdf').replace(/\.pdf$/i, '');
      baseName = baseName.replace(/[\\/:*?"<>|]/g, '_');
      const outName = `${baseName}_images.zip`;

      const saved = await saveToArchive(zipB64, outName, 'pdf2img');
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
      if (e?.message !== 'cancelled') {
        const msg = e?.name === 'AbortError' ? txtNetFail : (e?.message || t('error'));
        Alert.alert(t('pdf2imgFailed'), msg);
      }
    } finally {
      setBusy(false);
      setPhase('');
    }
  }

  function run() {
    if (!fileUri) {
      Alert.alert(t('noFile'), t('noFilePick'));
      return;
    }
    // نجهّز تقديراً تقريبياً بالاعتماد على حجم الملف (قبل معرفة عدد الصفحات
    // الحقيقي من الخادم) لإعطاء المستخدم فكرة أولية فورية، ثم نبدأ.
    const roughPages = Math.max(1, Math.round(fileSizeKb / 60)); // تقدير خام: ~60KB/صفحة PDF نصي عادي
    const sizeLabel = fileSizeKb > 1024 ? `${(fileSizeKb / 1024).toFixed(1)} MB` : `${fileSizeKb} KB`;
    const msg = isRTL
      ? `حجم الملف: ${sizeLabel}\nالوقت المتوقع تقريباً: ${fmtEta(roughPages, quality)}\n\nقد يستغرق الملف الكبير عدة دقائق. لا تُغلق الشاشة أثناء المعالجة.`
      : `File size: ${sizeLabel}\nEstimated time: ~${fmtEta(roughPages, quality)}\n\nLarge files may take several minutes. Keep the screen open while processing.`;

    Alert.alert(
      t('pdf2imgConfirmTitle'),
      msg,
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('pdf2imgConfirmProceed'), onPress: () => { startConversion(); } },
      ],
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.primaryDark} />
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <ImageIcon size={22} color={colors.primary} />
          <Text style={styles.title}>{t('pdf2imgTitle')}</Text>
        </View>
      </View>

      <View style={styles.onlineBox}>
        <Wifi size={16} color={colors.primaryDark} />
        <Text style={styles.onlineText}>{t('pdf2imgOnlineNote')}</Text>
      </View>

      <TouchableOpacity style={styles.fileBox} onPress={pickFile} disabled={busy}>
        <FileText size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.fileText} numberOfLines={1}>
            {fileName || t('pickPdf')}
          </Text>
          {fileSizeKb > 0 && <Text style={styles.fileSize}>{fileSizeKb} KB</Text>}
        </View>
      </TouchableOpacity>

      <Text style={styles.label}>{t('pdf2imgQuality')}</Text>
      <View style={styles.levelRow}>
        {([['low', 'pdf2imgLow'], ['medium', 'pdf2imgMedium'], ['high', 'pdf2imgHigh']] as [Quality, string][]).map(
          ([q, key]) => {
            const active = quality === q;
            return (
              <TouchableOpacity
                key={q}
                style={[styles.levelBtn, active && styles.levelBtnActive]}
                onPress={() => setQuality(q)}
                disabled={busy}
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
            <Text style={styles.runText}>{phase || t('pdf2imgBusy')}</Text>
          </View>
        ) : (
          <Text style={styles.runText}>{t('pdf2imgBtn')}</Text>
        )}
      </TouchableOpacity>

      {busy && (
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          {!!pagesLabel && <Text style={styles.progressLabel}>{pagesLabel}</Text>}
        </View>
      )}

      <Text style={styles.hint}>{t('pdf2imgHint')}</Text>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backBtn: { padding: 4, marginEnd: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '700', color: c.text },
  onlineBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 12, marginBottom: 16,
  },
  onlineText: { color: c.primaryDark, fontSize: 12, flex: 1, lineHeight: 18, textAlign: 'right' },
  fileBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: c.surfaceAlt, marginBottom: 20,
  },
  fileText: { color: c.primaryDark, fontSize: 14 },
  fileSize: { color: c.textMuted, fontSize: 12, marginTop: 2 },
  label: { fontSize: 13, fontWeight: '600', color: c.textMuted, marginBottom: 8, textAlign: 'right' },
  levelRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  levelBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#fff',
    borderWidth: 1, borderColor: c.surfaceAlt,
  },
  levelBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
  levelText: { fontSize: 14, color: c.textMuted, fontWeight: '500' },
  levelTextActive: { color: '#fff' },
  runBtn: { backgroundColor: c.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  runBtnDisabled: { backgroundColor: c.border },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  runText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  progressWrap: { marginTop: 14, alignItems: 'center' },
  progressTrack: { width: '100%', height: 8, borderRadius: 4, backgroundColor: c.surfaceAlt, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: c.primary, borderRadius: 4 },
  progressLabel: { marginTop: 6, color: c.textMuted, fontSize: 12, fontFamily: 'monospace' as any },
  hint: { color: c.textMuted, fontSize: 11, marginTop: 12, textAlign: 'center', lineHeight: 16 },
});
