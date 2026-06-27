import React from 'react';
import { Text, View, StyleSheet, Image, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * PdfPagePreview — معاينة صفحة PDF عند الطلب فقط (الخيار ب).
 * ===========================================================
 * الفلسفة:
 *  - التطبيق يفتح الملف ويعمل offline بالكامل (عبر pdf-lib في الشاشة).
 *  - لا تُطلب أي صورة تلقائياً. الصورة تُجلب من السيرفر فقط عند فتح
 *    المعاينة الكبيرة لصفحة محددة (ضغط المستخدم).
 *  - كفاءة عالية للملفات الكبيرة (91 صفحة): يُرفع الملف مرة واحدة
 *    (/upload يعيد sessionId)، ثم تُطلب الصفحات بالمعرّف بلا إعادة رفع.
 *
 * لا مكتبة native — يعرض صورة عادية <Image>. يعمل في Expo Go.
 */

const BASE = 'https://smartpdf-trial-server.onrender.com';
const UPLOAD_ENDPOINT = `${BASE}/upload`;

// ===== جلسة الرفع المشتركة (رفع مرة واحدة لكل ملف) =====
// مفتاحها uri الملف؛ تخزّن sessionId القادم من السيرفر.
const sessionByUri = new Map<string, string>();
// تخزين مؤقت للصور المعروضة (مفتاح: uri#page) — لا إعادة طلب.
const imageCache = new Map<string, string>();

export function clearPreviewSession(uri?: string) {
  if (uri) {
    sessionByUri.delete(uri);
    // امسح صور هذا الملف من الكاش
    for (const k of Array.from(imageCache.keys())) {
      if (k.startsWith(uri + '#')) imageCache.delete(k);
    }
  } else {
    sessionByUri.clear();
    imageCache.clear();
  }
}

// للتوافق مع الاستيراد القديم
export function isPdfPreviewAvailable(): boolean { return true; }

// يرفع الملف مرة واحدة ويعيد sessionId (يعيد المخزّن إن وُجد)
async function ensureSession(uri: string): Promise<string> {
  const existing = sessionByUri.get(uri);
  if (existing) return existing;
  const form = new FormData();
  // @ts-ignore — صيغة ملف React Native
  form.append('file', { uri, name: 'doc.pdf', type: 'application/pdf' });
  const resp = await fetch(UPLOAD_ENDPOINT, { method: 'POST', body: form });
  if (!resp.ok) throw new Error(`upload failed: ${resp.status}`);
  const json = await resp.json();
  const sid = json.sessionId as string;
  sessionByUri.set(uri, sid);
  return sid;
}

// يجلب صورة صفحة عبر الجلسة (يعيد الرفع تلقائياً إن انتهت الجلسة 410)
async function fetchPageImage(uri: string, page: number, zoom: number): Promise<string> {
  const cacheKey = `${uri}#${page}@${zoom}`;
  const cached = imageCache.get(cacheKey);
  if (cached) return cached;

  const getOnce = async (sid: string) => {
    const url = `${BASE}/render/${sid}/${page}?zoom=${zoom}`;
    return await fetch(url);
  };

  let sid = await ensureSession(uri);
  let resp = await getOnce(sid);
  if (resp.status === 410) {
    // الجلسة انتهت — أعد الرفع مرة واحدة وحاول ثانيةً
    sessionByUri.delete(uri);
    sid = await ensureSession(uri);
    resp = await getOnce(sid);
  }
  if (!resp.ok) throw new Error(`render failed: ${resp.status}`);

  const blob = await resp.blob();
  const dataUri: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(blob);
  });
  imageCache.set(cacheKey, dataUri);
  return dataUri;
}

type Props = {
  uri: string;
  page: number;           // 1-based
  rotationDeg?: number;
  fallbackLabel?: string;
};

export default function PdfPagePreview({ uri, page, rotationDeg = 0, fallbackLabel }: Props) {
  const [state, setState] = React.useState<'loading' | 'done' | 'error'>('loading');
  const [imageUri, setImageUri] = React.useState<string | null>(null);
  const reqRef = React.useRef(0);

  const load = React.useCallback(async () => {
    const myReq = ++reqRef.current;
    setState('loading');
    setImageUri(null);
    try {
      console.log('[PdfPreview] جلب الصفحة', page);
      const dataUri = await fetchPageImage(uri, page, 2.0); // دقّة عالية للمعاينة
      if (myReq !== reqRef.current) return;
      console.log('[PdfPreview] الصفحة جاهزة');
      setImageUri(dataUri);
      setState('done');
    } catch (err: any) {
      console.log('[PdfPreview] خطأ:', err?.message || String(err));
      if (myReq === reqRef.current) setState('error');
    }
  }, [uri, page]);

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri, page]);

  if (state === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#60a5fa" />
        <Text style={styles.hint}>{fallbackLabel || 'PDF'}</Text>
        <Text style={styles.subHint}>جارٍ تحميل الصفحة…</Text>
      </View>
    );
  }

  if (state === 'done' && imageUri) {
    return (
      <View style={styles.center}>
        <Image
          source={{ uri: imageUri }}
          style={[styles.image, { transform: [{ rotate: `${rotationDeg}deg` }] }]}
          resizeMode="contain"
        />
      </View>
    );
  }

  // error
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={48} color="#475569" />
      <Text style={styles.fallbackText}>{fallbackLabel || 'PDF'}</Text>
      <Text style={styles.offlineNote}>تعذّر تحميل المعاينة</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={load}>
        <Ionicons name="refresh" size={16} color="#fff" />
        <Text style={styles.retryText}>إعادة المحاولة</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1220', gap: 10 },
  image: { width: '100%', height: '100%' },
  hint: { color: '#94a3b8', fontSize: 14, fontWeight: '700' },
  subHint: { color: '#64748b', fontSize: 12 },
  fallbackText: { color: '#94a3b8', fontSize: 15, fontWeight: '700' },
  offlineNote: { color: '#64748b', fontSize: 12 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1d4ed8', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18, marginTop: 4 },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
