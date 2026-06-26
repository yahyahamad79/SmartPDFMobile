import { Ionicons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

type Props = {
  uri: string;           // file:// للملف المحلي
  rotationDeg?: number;  // زاوية العرض الإضافية للمعاينة فقط
  fallbackLabel?: string;
};

const pdfJsModule = require('../assets/pdfjs/pdf.min.txt');
const pdfWorkerModule = require('../assets/pdfjs/pdf.worker.min.txt');

export function isPdfPreviewAvailable(): boolean {
  return true;
}

function buildPdfViewerHtml(base64: string, rotationDeg: number, fallbackLabel: string) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <style>
    body { margin: 0; background: #0b1220; color: #cbd5e1; display: flex; flex-direction: column; height: 100vh; }
    #viewer { flex: 1; display: flex; justify-content: center; align-items: center; overflow: hidden; }
    canvas { max-width: 100%; height: auto; }
    #label { padding: 12px; font-size: 14px; text-align: center; color: #94a3b8; }
  </style>
</head>
<body>
  <div id="viewer">
    <canvas id="pdfCanvas"></canvas>
  </div>
  <div id="label">${fallbackLabel}${rotationDeg ? ` · ${rotationDeg}°` : ''}</div>
  <script src="./pdf.min.txt"></script>
  <script>
    const data = atob('${base64}');
    const pdfData = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i += 1) {
      pdfData[i] = data.charCodeAt(i);
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.txt';
    pdfjsLib.getDocument({ data: pdfData }).promise
      .then((pdf) => pdf.getPage(1))
      .then((page) => {
        const viewport = page.getViewport({ scale: 1 });
        const scale = Math.min(window.innerWidth / viewport.width, (window.innerHeight - 40) / viewport.height);
        const scaledViewport = page.getViewport({ scale });
        const canvas = document.getElementById('pdfCanvas');
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        const context = canvas.getContext('2d');
        page.render({ canvasContext: context, viewport: scaledViewport });
      })
      .catch(() => {
        document.body.innerHTML = '<div style="color:#f87171;padding:20px;text-align:center;">فشل تحميل معاينة PDF</div>';
      });
  </script>
</body>
</html>`;
}

export default function PdfPagePreview({ uri, rotationDeg = 0, fallbackLabel = 'PDF' }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState<string | undefined>(undefined);
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
    setBaseUrl(undefined);

    async function preparePreview() {
      try {
        if (!normalizedUri) {
          throw new Error('Invalid URI');
        }

        const [loadedPdfJsAsset, loadedPdfWorkerAsset] = await Asset.loadAsync([
          pdfJsModule as number,
          pdfWorkerModule as number,
        ]);
        if (!active) return;

        const loadedPdfJsUri = loadedPdfJsAsset.localUri || loadedPdfJsAsset.uri;
        let baseDir = loadedPdfJsUri?.replace(/pdf\.min\.txt$/, '') || undefined;
        if (baseDir && !baseDir.endsWith('/')) {
          baseDir += '/';
        }
        if (!baseDir) {
          throw new Error('Unable to resolve PDF.js base URL');
        }

        const base64 = await FileSystem.readAsStringAsync(normalizedUri, { encoding: 'base64' });
        if (!active) return;

        setBaseUrl(baseDir);
        setHtml(buildPdfViewerHtml(base64, rotationDeg, fallbackLabel));
      } catch {
        if (!active) return;
        setError(true);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    preparePreview();
    return () => { active = false; };
  }, [normalizedUri, rotationDeg, fallbackLabel]);

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
      {html && baseUrl ? (
        <WebView
          originWhitelist={['*']}
          source={{ html, baseUrl }}
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
