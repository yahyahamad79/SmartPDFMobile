import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
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
  return !!PdfRendererView && !loadError;
}

export default function PdfPagePreview({ uri, rotationDeg = 0, fallbackLabel }: Props) {
  const fallback = (
    <View style={styles.fallback}>
      <Ionicons name="document-text-outline" size={54} color="#475569" />
      <Text style={styles.fallbackText}>{fallbackLabel || 'PDF'}</Text>
    </View>
  );

  if (!PdfRendererView || loadError) {
    return fallback;
  }

  return (
    <PdfErrorBoundary fallback={fallback}>
      <View style={[styles.wrap, { transform: [{ rotate: `${rotationDeg}deg` }] }]}>
        <PdfRendererView
          source={uri}
          style={styles.renderer}
          distanceBetweenPages={12}
          maxZoom={4}
          singlePage={false}
        />
      </View>
    </PdfErrorBoundary>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, width: '100%', backgroundColor: '#0b1220' },
  renderer: { flex: 1, backgroundColor: '#0b1220' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1220', gap: 12 },
  fallbackText: { color: '#64748b', fontSize: 14, fontWeight: '600' },
});
