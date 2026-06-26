import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

type Props = {
  uri: string;           // file:// للملف المحلي
  rotationDeg?: number;  // زاوية العرض الإضافية للمعاينة فقط
  fallbackLabel?: string;
  pageNumber?: number;   // رقم الصفحة المراد عرضها ديناميكياً
};

export function isPdfPreviewAvailable(): boolean {
  return true;
}

function buildPdfViewerHtml(
  base64: string,
  rotationDeg: number,
  fallbackLabel: string,
  pageNumber: number,
) {
  // روابط CDN مستقرة وآمنة تعمل على الكمبيوتر (Web) والهواتف (Expo Go) دون مشاكل أذونات الـ Blob أو الملفات المحلية
  const pdfJsCDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const pdfWorkerCDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <style>
    body { margin: 0; background: #0b1220; color: #cbd5e1; display: flex; flex-direction: column; height: 100vh; justify-content: center; align-items: center; font-family: system-ui, sans-serif; }
    #viewer { flex: 1; display: flex; justify-content: center; align-items: center; overflow: hidden; width: 100%; }
    canvas { max-width: 100%; max-height: 100%; object-fit: contain; }
    #label { padding: 12px; font-size: 14px; text-align: center; color: #94a3b8; width: 100%; background: #0b1220; box-sizing: border-box; }
  </style>
  <script src="${pdfJsCDN}"></script>
</head>
<body>
  <div id="viewer">
    <canvas id="pdfCanvas"></canvas>
  </div>
  <div id="label">${fallbackLabel}${rotationDeg ? ` · ${rotationDeg}°` : ''}</div>
  
  <script>
    window.addEventListener('error', (event) => {
      event.preventDefault();
      const message = event.message || 'unknown error';
      document.body.innerHTML = '<div style="color:#f87171;padding:20px;text-align:center;">خطأ في معاينة PDF: ' + message + '</div>';
    });

    try {
      const pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
      // تعيين الـ Worker مباشرة من رابط الـ CDN لتجنب قيود الحماية المتصفح
      pdfjsLib.GlobalWorkerOptions.workerSrc = "${pdfWorkerCDN}";

      const data = atob('${base64}');
      const pdfData = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i += 1) {
        pdfData[i] = data.charCodeAt(i);
      }

      pdfjsLib.getDocument({ data: pdfData }).promise
        .then((pdf) => pdf.getPage(${pageNumber}))
        .then((page) => {
          // دمج زاوية الصفحة الأصلية مع زاوية التدوير التي اختارها المستخدم
          const currentRotation = (page.rotate + ${rotationDeg}) % 360;
          
          // تحديث الـ viewport بأبعاد الزاوية الجديدة تلقائياً
          const viewport = page.getViewport({ scale: 1, rotation: currentRotation });
          
          const scale = Math.min(window.innerWidth / viewport.width, (window.innerHeight - 60) / viewport.height);
          const scaledViewport = page.getViewport({ scale, rotation: currentRotation });
          
          const canvas = document.getElementById('pdfCanvas');
          canvas.width = scaledViewport.width;
          canvas.height = scaledViewport.height;
          
          const context = canvas.getContext('2d');
          return page.render({ canvasContext: context, viewport: scaledViewport }).promise;
        })
        .catch((err) => {
          const message = (err && err.message) ? err.message : 'unknown';
          document.body.innerHTML = '<div style="color:#f87171;padding:20px;text-align:center;">فشل معاينة PDF: ' + message + '</div>';
        });
    } catch (e) {
      document.body.innerHTML = '<div style="color:#f87171;padding:20px;text-align:center;">خطأ في تحميل المكتبة: ' + e.message + '</div>';
    }
  </script>
</body>
</html>`;
}

export default function PdfPagePreview({ uri, rotationDeg = 0, fallbackLabel = 'PDF', pageNumber = 1 }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const normalizedUri = useMemo(() => {
    if (!uri) return uri;
    if (uri.startsWith('file://') || uri.startsWith('content://')) return uri;
    if (uri.startsWith('/')) return 'file://' + uri;
    return uri;
  }, [uri]);

  useEffect(() => {
    let active = true;
    setError(false);
    setLoading(true);
    setHtml(null);

    async function preparePreview() {
      try {
        if (!normalizedUri) {
          throw new Error('Invalid URI');
        }

        // قراءة الملف مباشرة وتحويله إلى قاعدة base64
        const pdfBase64 = await FileSystem.readAsStringAsync(normalizedUri, { encoding: 'base64' });
        
        if (!active) return;

        // بناء مستند الـ HTML وتمريره للـ WebView
        setHtml(buildPdfViewerHtml(pdfBase64, rotationDeg, fallbackLabel, pageNumber));
      } catch (err) {
        if (!active) return;
        setError(true);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    preparePreview();
    return () => { active = false; };
  }, [normalizedUri, rotationDeg, fallbackLabel, pageNumber]);

  const fallback = (
    <View style={styles.fallback}>
      <Ionicons name="document-text-outline" size={54} color="#475569" />
      <Text style={styles.fallbackText}>{fallbackLabel}</Text>
      {rotationDeg ? <Text style={styles.rotationText}>{rotationDeg}°</Text> : null}
    </View>
  );

  if (error) {
    return fallback;
  }

  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator color="#60a5fa" />
          <Text style={styles.loadingText}>جارٍ تحميل معاينة PDF...</Text>
        </View>
      )}
      {html ? (
        <WebView
          originWhitelist={['*']}
          source={{ html }}
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          scalesPageToFit
          allowFileAccess
          allowUniversalAccessFromFileURLs
          allowFileAccessFromFileURLs
          onError={() => setError(true)}
        />
      ) : null}
      {loading && !html ? fallback : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1220' },
  webview: { flex: 1, backgroundColor: '#0b1220' },
  loader: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  loadingText: { marginTop: 12, color: '#94a3b8', fontSize: 13 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1220', gap: 12 },
  fallbackText: { color: '#64748b', fontSize: 14, fontWeight: '600' },
  rotationText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
});