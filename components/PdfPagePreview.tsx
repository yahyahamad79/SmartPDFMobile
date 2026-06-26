import React from 'react';
import { Text, View, StyleSheet, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * PdfPagePreview — معاينة محتوى صفحات PDF بشكل آمن.
 * ====================================================
 * يحاول استخدام react-native-pdf-renderer لعرض المحتوى الحقيقي.
 * إن لم تكن المكتبة متوفّرة أو فشل التصيير (مثلاً في Expo Go أو مشكلة بناء)،
 * يسقط تلقائياً إلى عرض بديل آمن (لا ينهار التطبيق أبداً).
 *
 * هذا fallback مزدوج الحماية:
 *  1) require داخل try (يلتقط غياب الوحدة).
 *  2) ErrorBoundary يلتقط أي خطأ تصيير وقت التشغيل.
 */

// محاولة تحميل الوحدة بأمان (لا تتعطّل إن غابت)
let PdfRendererView: any = null;
let loadError = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('react-native-pdf-renderer');
  PdfRendererView = mod?.default ?? mod?.PdfRendererView ?? null;
} catch {
  loadError = true;
}

// التحقق أن المكوّن الأصلي (ViewManager) مسجّل فعلاً في الـ runtime.
// في Expo Go أو بناء بلا المكتبة، يكون require ناجحاً لكن ViewManager غائباً،
// فيظهر خطأ "Can't find ViewManager 'RNPDFRenderView'". هذا الفحص يمنعه.
function isNativeViewRegistered(): boolean {
  try {
    const names = ['RNPDFRenderView', 'RNPdfRendererView', 'PdfRendererView'];
    const cfg: any = (UIManager as any).getViewManagerConfig
      ? (UIManager as any).getViewManagerConfig.bind(UIManager)
      : null;
    if (cfg) {
      return names.some((n) => !!cfg(n));
    }
    // fallback لإصدارات قديمة: تحقق من وجود الاسم على UIManager
    return names.some((n) => !!(UIManager as any)[n]);
  } catch {
    return false;
  }
}

const nativeReady = !loadError && !!PdfRendererView && isNativeViewRegistered();

type Props = {
  uri: string;           // file:// للملف المحلي
  rotationDeg?: number;  // زاوية العرض الإضافية للمعاينة فقط
  fallbackLabel?: string;
};

class PdfErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() { /* يُمتص الخطأ بهدوء */ }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

export function isPdfPreviewAvailable(): boolean {
  return nativeReady;
}

export default function PdfPagePreview({ uri, rotationDeg = 0, fallbackLabel }: Props) {
  const [box, setBox] = React.useState({ width: 0, height: 0 });

  // المكتبة تتطلب مساراً محلياً بصيغة file://. نضمن ذلك.
  const normalizedUri = React.useMemo(() => {
    if (!uri) return uri;
    if (uri.startsWith('file://') || uri.startsWith('content://')) return uri;
    if (uri.startsWith('/')) return 'file://' + uri;
    return uri;
  }, [uri]);

  const fallback = (
    <View style={styles.fallback}>
      <Ionicons name="document-text-outline" size={54} color="#475569" />
      <Text style={styles.fallbackText}>{fallbackLabel || 'PDF'}</Text>
    </View>
  );

  if (!nativeReady) {
    return fallback;
  }

  return (
    <PdfErrorBoundary fallback={fallback}>
      <View style={styles.wrap} onLayout={(e) => setBox(e.nativeEvent.layout)}>
        {box.width > 0 && box.height > 0 ? (
          <PdfRendererView
            source={normalizedUri}
            style={{ width: box.width, height: box.height, backgroundColor: '#0b1220' }}
            distanceBetweenPages={12}
            maxZoom={4}
            singlePage={false}
            onPageChange={() => { /* تحميل ناجح */ }}
          />
        ) : null}
      </View>
    </PdfErrorBoundary>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, width: '100%', height: '100%', backgroundColor: '#0b1220', alignItems: 'stretch', justifyContent: 'center' },
  renderer: { flex: 1, backgroundColor: '#0b1220' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1220', gap: 12 },
  fallbackText: { color: '#64748b', fontSize: 14, fontWeight: '600' },
});
