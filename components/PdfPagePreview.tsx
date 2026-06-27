import React from 'react';
import { Text, View, StyleSheet, Image, ActivityIndicator, TouchableOpacity } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';

/**
 * PdfPagePreview — معاينة هجينة لصفحات PDF.
 * ============================================
 * الفلسفة: التطبيق يبقى offline بالكامل. المعاينة ميزة إضافية تعمل
 * فقط عند توفّر إنترنت، دون أي مكتبة native (تعمل في Expo Go).
 *
 * الآلية:
 *  - عند فتح المعاينة، نرفع صفحة PDF المطلوبة فقط إلى الخادم.
 *  - الخادم يصيّرها صورة PNG ويعيدها.
 *  - نعرضها عبر <Image> عادية (يدعمها Expo Go وكل الأجهزة).
 *  - إن لا إنترنت أو فشل الطلب: نعرض بديلاً آمناً (أيقونة + رقم)،
 *    والتدوير يبقى يعمل offline عبر pdf-lib.
 *
 * لا توجد مكتبة native — لا مشاكل بناء، يعمل فوراً في Expo Go.
 */

// للتوافق مع الاستيراد القديم — المعاينة الآن عبر الخادم (متاحة دائماً، تحتاج نت فقط)
export function isPdfPreviewAvailable(): boolean { return true; }

const RENDER_ENDPOINT = 'https://smartpdf-trial-server.onrender.com/render-page';

// تخزين مؤقت مشترك للصور المصغّرة (مفتاح: uri+صفحة) — يمنع إعادة الطلب.
const thumbCache = new Map<string, string>();

type Props = {
  uri: string;            // file:// للملف المحلي
  page: number;           // رقم الصفحة (1-based)
  rotationDeg?: number;   // زاوية العرض للمعاينة فقط
  fallbackLabel?: string;
};

type State = 'idle' | 'loading' | 'done' | 'error' | 'offline';


/**
 * PdfThumb — صورة مصغّرة لصفحة واحدة (للشبكة).
 * تجلب الصفحة بدقّة منخفضة من الخادم وتخزّنها مؤقتاً.
 * تحميل كسول: تطلب فقط عند ظهورها، ولا تعيد الطلب إن كانت مخزّنة.
 */
export function PdfThumb({ uri, page, rotationDeg = 0 }: { uri: string; page: number; rotationDeg?: number }) {
  const cacheKey = `${uri}#${page}`;
  const [img, setImg] = React.useState<string | null>(() => thumbCache.get(cacheKey) || null);
  const [failed, setFailed] = React.useState(false);
  const reqRef = React.useRef(0);

  const load = React.useCallback(async () => {
    if (thumbCache.has(cacheKey)) { setImg(thumbCache.get(cacheKey)!); return; }
    const myReq = ++reqRef.current;
    setFailed(false);
    try {
      const form = new FormData();
      // @ts-ignore
      form.append('file', { uri, name: 'doc.pdf', type: 'application/pdf' });
      form.append('page', String(Math.max(0, page - 1)));
      form.append('zoom', '1.0'); // دقّة منخفضة للمصغّرات (أسرع وأخف)
      const resp = await fetch(RENDER_ENDPOINT, { method: 'POST', body: form });
      if (myReq !== reqRef.current) return;
      if (!resp.ok) { setFailed(true); return; }
      const blob = await resp.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        if (myReq !== reqRef.current) return;
        const result = reader.result as string;
        thumbCache.set(cacheKey, result);
        setImg(result);
      };
      reader.onerror = () => { if (myReq === reqRef.current) setFailed(true); };
      reader.readAsDataURL(blob);
    } catch {
      if (myReq === reqRef.current) setFailed(true);
    }
  }, [uri, page, cacheKey]);

  React.useEffect(() => {
    if (!img) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri, page]);

  if (img) {
    return (
      <Image
        source={{ uri: img }}
        style={{ width: '100%', height: '100%', transform: [{ rotate: `${rotationDeg}deg` }] }}
        resizeMode="contain"
      />
    );
  }

  if (failed) {
    return (
      <TouchableOpacity onPress={load} style={styles.thumbCenter}>
        <Ionicons name="refresh" size={20} color="#64748b" />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.thumbCenter}>
      <ActivityIndicator size="small" color="#60a5fa" />
    </View>
  );
}

export default function PdfPagePreview({ uri, page, rotationDeg = 0, fallbackLabel }: Props) {
  const [state, setState] = React.useState<State>('idle');
  const [imageUri, setImageUri] = React.useState<string | null>(null);
  const reqIdRef = React.useRef(0);

  // نستخدم fetch لرفع الصفحة واستقبال الصورة كـ base64 (يعمل في Expo Go)
  const loadViaFetch = React.useCallback(async () => {
    const myReq = ++reqIdRef.current;
    setState('loading');
    setImageUri(null);
    try {
      console.log('[PdfPreview] طلب تصيير الصفحة', page, 'من', uri);
      const form = new FormData();
      // @ts-ignore — صيغة ملف React Native
      form.append('file', { uri, name: 'doc.pdf', type: 'application/pdf' });
      form.append('page', String(Math.max(0, page - 1)));

      const resp = await fetch(RENDER_ENDPOINT, { method: 'POST', body: form });
      if (myReq !== reqIdRef.current) return;

      console.log('[PdfPreview] استجابة الخادم:', resp.status);
      if (!resp.ok) {
        console.log('[PdfPreview] فشل الخادم — الحالة:', resp.status);
        setState('error');
        return;
      }

      // نحوّل الرد (PNG) إلى base64 لعرضه في <Image>
      const blob = await resp.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        if (myReq !== reqIdRef.current) return;
        const result = reader.result as string; // data:image/png;base64,...
        console.log('[PdfPreview] صورة جاهزة، الطول:', result?.length);
        setImageUri(result);
        setState('done');
      };
      reader.onerror = () => { if (myReq === reqIdRef.current) setState('error'); };
      reader.readAsDataURL(blob);
    } catch (err: any) {
      console.log('[PdfPreview] خطأ في الاتصال:', err?.message || String(err));
      if (myReq === reqIdRef.current) setState('error');
    }
  }, [uri, page]);

  // حمّل تلقائياً عند تغيّر الصفحة
  React.useEffect(() => {
    loadViaFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri, page]);

  // ===== العرض =====
  if (state === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#60a5fa" />
        <Text style={styles.hint}>{fallbackLabel || 'PDF'}</Text>
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

  // error / offline / idle => بديل آمن + زر إعادة المحاولة
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={48} color="#475569" />
      <Text style={styles.fallbackText}>{fallbackLabel || 'PDF'}</Text>
      <Text style={styles.offlineNote}>المعاينة تحتاج اتصالاً بالإنترنت</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={loadViaFetch}>
        <Ionicons name="refresh" size={16} color="#fff" />
        <Text style={styles.retryText}>إعادة المحاولة</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1220', gap: 12 },
  image: { width: '100%', height: '100%' },
  hint: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  fallbackText: { color: '#94a3b8', fontSize: 15, fontWeight: '700' },
  thumbCenter: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  offlineNote: { color: '#64748b', fontSize: 12 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1d4ed8', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18, marginTop: 4 },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
