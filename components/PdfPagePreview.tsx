import React from 'react';
import { Text, View, StyleSheet, Image, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * PdfPagePreview — معاينة صفحة PDF عبر السيرفر (نسخة نه).
 * =========================================================
 * - يعمل في Expo Go (لا مكتبة native).
 * - يرفع الملف مرة واحدة (/upload -> sessionId)، ثم يعرض الصفحة
 *   عبر رابط مباشر <Image> (الأسلوب الأوثق في React Native).
 * - علامة مميّزة "HYBRID_v3" أدناه للتأكد أن هذه النسخة وصلت فعلاً.
 */

// ====== علامة التحقق: إن رأيت HYBRID_v3 في الشاشة، النسخة الصحيحة وصلت ======
export const PREVIEW_VERSION = 'HYBRID_v3';

const BASE = 'https://smartpdf-trial-server.onrender.com';

const sessionByUri = new Map<string, string>();
const totalByUri = new Map<string, number>();

export function isPdfPreviewAvailable(): boolean { return true; }

export function clearPreviewSession(uri?: string) {
  if (uri) { sessionByUri.delete(uri); totalByUri.delete(uri); }
  else { sessionByUri.clear(); totalByUri.clear(); }
}

// يرفع الملف مرة واحدة، يعيد { sid, total }
async function ensureSession(uri: string): Promise<{ sid: string; total: number }> {
  const sid0 = sessionByUri.get(uri);
  const tot0 = totalByUri.get(uri);
  if (sid0 && tot0) return { sid: sid0, total: tot0 };

  const form = new FormData();
  // @ts-ignore — صيغة ملف React Native
  form.append('file', { uri, name: 'doc.pdf', type: 'application/pdf' });
  const resp = await fetch(`${BASE}/upload`, { method: 'POST', body: form });
  if (!resp.ok) throw new Error(`upload ${resp.status}`);
  const j = await resp.json();
  sessionByUri.set(uri, j.sessionId);
  totalByUri.set(uri, j.totalPages);
  return { sid: j.sessionId, total: j.totalPages };
}

// يعيد العدد الحقيقي من السيرفر (لتصحيح pdf-lib)
export async function getServerPageCount(uri: string): Promise<number | null> {
  try { const { total } = await ensureSession(uri); return total || null; }
  catch { return null; }
}

type Props = {
  uri: string;
  page: number;          // 1-based
  rotationDeg?: number;
  fallbackLabel?: string;
};

export default function PdfPagePreview({ uri, page, rotationDeg = 0, fallbackLabel }: Props) {
  const [imgUrl, setImgUrl] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<'loading' | 'done' | 'error'>('loading');
  const [msg, setMsg] = React.useState('');
  const reqRef = React.useRef(0);
  const triedRef = React.useRef(false);

  const load = React.useCallback(async () => {
    const my = ++reqRef.current;
    triedRef.current = false;
    setStatus('loading');
    setImgUrl(null);
    setMsg('جارٍ رفع الملف وطلب الصفحة…');
    try {
      const { sid } = await ensureSession(uri);
      if (my !== reqRef.current) return;
      const url = `${BASE}/render/${sid}/${page}?zoom=2.0&t=${Date.now()}`;
      setImgUrl(url);
      setMsg('');
      // status يبقى loading حتى onLoad/onError للصورة
    } catch (e: any) {
      if (my === reqRef.current) { setMsg('خطأ: ' + (e?.message || String(e))); setStatus('error'); }
    }
  }, [uri, page]);

  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [uri, page]);

  return (
    <View style={styles.center}>
      {imgUrl ? (
        <Image
          source={{ uri: imgUrl }}
          style={[styles.image, { transform: [{ rotate: `${rotationDeg}deg` }] }]}
          resizeMode="contain"
          onLoad={() => setStatus('done')}
          onError={(e) => {
            const err = e?.nativeEvent?.error || 'فشل التحميل';
            if (!triedRef.current) {
              // قد تكون الجلسة انتهت — أعد الرفع مرة
              triedRef.current = true;
              sessionByUri.delete(uri);
              setMsg('إعادة المحاولة…');
              load();
            } else {
              setMsg('فشل عرض الصورة: ' + err);
              setStatus('error');
            }
          }}
        />
      ) : null}

      {status === 'loading' && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#60a5fa" />
          <Text style={styles.hint}>{fallbackLabel || 'PDF'}</Text>
          {!!msg && <Text style={styles.msg}>{msg}</Text>}
          <Text style={styles.ver}>{PREVIEW_VERSION}</Text>
        </View>
      )}

      {status === 'error' && (
        <View style={styles.overlay}>
          <Ionicons name="cloud-offline-outline" size={46} color="#475569" />
          <Text style={styles.fallbackText}>{fallbackLabel || 'PDF'}</Text>
          {!!msg && <Text style={styles.msg}>{msg}</Text>}
          <TouchableOpacity style={styles.retry} onPress={load}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
          <Text style={styles.ver}>{PREVIEW_VERSION}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1220' },
  image: { width: '100%', height: '100%' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 8 },
  hint: { color: '#94a3b8', fontSize: 14, fontWeight: '700' },
  msg: { color: '#f59e0b', fontSize: 11, textAlign: 'center', paddingHorizontal: 24 },
  ver: { color: '#334155', fontSize: 9, position: 'absolute', bottom: 6 },
  fallbackText: { color: '#94a3b8', fontSize: 15, fontWeight: '700' },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1d4ed8', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18, marginTop: 4 },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
