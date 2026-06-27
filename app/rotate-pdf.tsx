import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { PDFDocument, degrees } from 'pdf-lib';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLang } from '@/lib/i18n';
import { saveToArchive } from '@/lib/archive';
import PdfPagePreview, { clearPreviewSession, getServerPageCount, isPdfPreviewAvailable } from '@/components/PdfPagePreview';

/**
 * Rotate Pages — محسّنة بمعاينة محتوى حقيقي.
 * - معاينة محتوى الـ PDF عبر react-native-pdf-renderer (مع fallback آمن).
 * - تدوير لكل صفحة على حدة (0/90/180/270) — المستخدم يضبط كل صفحة.
 * - التطبيق الفعلي عبر pdf-lib عند الحفظ.
 * - يحفظ في الأرشيف ويوجّه لشاشة النتيجة (يحترم مجلد الإعدادات).
 */

type PickedFile = {
  uri: string;
  name: string;
  size?: number;
  pageCount: number;
};

export default function RotatePdfScreen() {
  const router = useRouter();
  const { t, isRTL } = useLang();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [outputName, setOutputName] = useState('rotated');
  // زوايا التدوير لكل صفحة (نسبية، يختارها المستخدم): { رقم الصفحة: 0|90|180|270 }
  const [rotations, setRotations] = useState<Record<number, number>>({});
  // الصفحة المعروضة في المعاينة الكبيرة (1-based) أو null
  const [previewPage, setPreviewPage] = useState<number | null>(null);

  const rowDir = isRTL ? 'row-reverse' : 'row';
  const txtAlign = isRTL ? 'right' : 'left';
  const previewSupported = isPdfPreviewAvailable();

  const readAsBase64 = async (uri: string) =>
    await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const a = result.assets[0];
      const b64 = await readAsBase64(a.uri);
      const doc = await PDFDocument.load(b64, { ignoreEncryption: true });
      const count = doc.getPageCount();
      clearPreviewSession(); // أفرغ جلسة الملف السابق
      setFile({ uri: a.uri, name: a.name, size: a.size ?? undefined, pageCount: count });
      setRotations({});
      // تصحيح عدد الصفحات من السيرفر في الخلفية (إن قرأ pdf-lib خطأً).
      // لا يعطّل الفتح — يحدث بهدوء، ويُحدّث العدد إن اختلف.
      getServerPageCount(a.uri).then((serverCount) => {
        if (serverCount && serverCount !== count) {
          console.log('[Rotate] تصحيح عدد الصفحات:', count, '->', serverCount);
          setFile((prev) => (prev && prev.uri === a.uri ? { ...prev, pageCount: serverCount } : prev));
        }
      }).catch(() => {});
      setOutputName((a.name || 'rotated').replace(/\.pdf$/i, '') + '_rotated');
    } catch (e) {
      Alert.alert(t('error'), t('couldNotRead'));
    }
  };

  const clearFile = () => { clearPreviewSession(); setFile(null); setRotations({}); };

  // تدوير صفحة واحدة +90 (نسبي)
  const rotatePage = (page: number) => {
    setRotations((prev) => ({ ...prev, [page]: ((prev[page] || 0) + 90) % 360 }));
  };

  // تدوير كل الصفحات +90
  const rotateAll = () => {
    if (!file) return;
    setRotations((prev) => {
      const next: Record<number, number> = {};
      for (let p = 1; p <= file.pageCount; p++) next[p] = ((prev[p] || 0) + 90) % 360;
      return next;
    });
  };

  const resetRotations = () => setRotations({});

  const finalFileName = () => {
    let n = outputName.trim();
    if (!n) n = 'rotated';
    n = n.replace(/[\\/:*?"<>|]/g, '_');
    if (!n.toLowerCase().endsWith('.pdf')) n += '.pdf';
    return n;
  };

  const hasAnyRotation = Object.values(rotations).some((v) => v % 360 !== 0);

  const applyAndSave = async () => {
    if (!file) {
      Alert.alert(t('noFile'), t('noFilePick'));
      return;
    }
    if (!hasAnyRotation) {
      Alert.alert(t('noFile'), t('rotateNoPages'));
      return;
    }
    setBusy(true);
    try {
      const b64 = await readAsBase64(file.uri);
      const doc = await PDFDocument.load(b64, { ignoreEncryption: true });
      const pages = doc.getPages();

      for (let p = 1; p <= file.pageCount; p++) {
        const delta = rotations[p] || 0;
        if (delta % 360 === 0) continue;
        const page = pages[p - 1];
        if (!page) continue;
        const current = page.getRotation().angle % 360;
        const newAngle = (current + delta + 360) % 360;
        page.setRotation(degrees(newAngle));
      }

      const out = await doc.saveAsBase64();
      const __s = await saveToArchive(out, finalFileName(), 'rotate');
      if (__s) {
        router.push({
          pathname: '/result',
          params: { name: __s.name, uri: __s.uri, size: String(__s.size), kind: __s.kind },
        });
        setBusy(false);
        return;
      }
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'Unknown error';
      Alert.alert(t('rotateFailed'), msg);
      console.log('ROTATE ERROR:', e);
    } finally {
      setBusy(false);
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
  };

  const rotatedCount = Object.values(rotations).filter((v) => v % 360 !== 0).length;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>{isRTL ? '›' : '‹'} {t('back')}</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { textAlign: txtAlign }]}>{t('rotateTitle')}</Text>
        </View>

        <TouchableOpacity style={styles.pickBtn} onPress={pickFile} disabled={busy}>
          <Ionicons name="folder-open-outline" size={26} color="#60a5fa" style={{ marginBottom: 6 }} />
          <Text style={styles.pickText}>{file ? t('pickPdfDiff') : t('pickPdf')}</Text>
        </TouchableOpacity>

        {file && (
          <>
            <View style={styles.fileCard}>
              <View style={[styles.fileRow, { flexDirection: rowDir }]}>
                <TouchableOpacity onPress={clearFile} disabled={busy}>
                  <Ionicons name="close" size={15} color="#f87171" />
                </TouchableOpacity>
                <Text style={styles.fileSize}>{formatSize(file.size)} · {file.pageCount} {t('pages')}</Text>
                <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
              </View>
            </View>

            {/* أزرار عامة */}
            <View style={[styles.bulkRow, { flexDirection: rowDir }]}>
              <TouchableOpacity style={styles.bulkBtn} onPress={rotateAll} disabled={busy}>
                <Ionicons name="refresh-outline" size={16} color="#cbd5e1" />
                <Text style={styles.bulkText}>{t('rotateAll')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.bulkBtn} onPress={resetRotations} disabled={busy}>
                <Ionicons name="arrow-undo-outline" size={16} color="#cbd5e1" />
                <Text style={styles.bulkText}>{t('rotateReset')}</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.hint, { textAlign: txtAlign }]}>
              {previewSupported ? t('rotateTapPreview') : t('rotateTapPage')}
            </Text>

            {/* شبكة الصفحات: بطاقة لكل صفحة مع زاويتها وزر تدوير */}
            <View style={styles.pagesGrid}>
              {Array.from({ length: file.pageCount }, (_, idx) => {
                const page = idx + 1;
                const angle = rotations[page] || 0;
                const rotated = angle % 360 !== 0;
                return (
                  <View key={page} style={[styles.pageCard, rotated && styles.pageCardActive]}>
                    <TouchableOpacity
                      style={styles.pageThumb}
                      activeOpacity={0.8}
                      onPress={() => setPreviewPage(page)}
                    >
                      <View style={[styles.pageIconWrap, { transform: [{ rotate: `${angle}deg` }] }]}>
                        <Ionicons name="document-text-outline" size={32} color={rotated ? '#60a5fa' : '#64748b'} />
                      </View>
                      <View style={styles.tapHint}>
                        <Ionicons name="eye-outline" size={11} color="#94a3b8" />
                      </View>
                      <View style={styles.pageNumBadge}>
                        <Text style={styles.pageNumText}>{page}</Text>
                      </View>
                      {rotated && (
                        <View style={styles.angleBadge}>
                          <Text style={styles.angleText}>{angle}°</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.rotateBtn} onPress={() => rotatePage(page)} disabled={busy}>
                      <Ionicons name="refresh-outline" size={15} color="#fff" />
                      <Text style={styles.rotateBtnText}>90°</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            <View style={styles.optionsBox}>
              <Text style={[styles.optLabel, { textAlign: txtAlign }]}>{t('outputName')}</Text>
              <View style={[styles.nameRow, { flexDirection: rowDir }]}>
                <TextInput
                  style={styles.input}
                  value={outputName}
                  onChangeText={setOutputName}
                  placeholder="rotated"
                  placeholderTextColor="#64748b"
                  editable={!busy}
                  autoCapitalize="none"
                />
                <Text style={styles.ext}>.pdf</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.actionBtn, (!hasAnyRotation || busy) && styles.actionBtnDisabled]}
              onPress={applyAndSave}
              disabled={!hasAnyRotation || busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : (
                <View style={[{ flexDirection: rowDir }, styles.actionInner]}>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.actionText}>
                    {t('rotateBtn')}{rotatedCount > 0 ? ` (${rotatedCount})` : ''}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* معاينة محتوى الصفحة بملء الشاشة */}
      {file && previewPage !== null && (
        <View style={styles.previewOverlay}>
          <View style={[styles.previewHeader, { flexDirection: rowDir }]}>
            <TouchableOpacity onPress={() => setPreviewPage(null)} style={styles.previewCloseBtn}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.previewTitle}>{t('pages')} {previewPage}</Text>
          </View>

          <View style={styles.previewBody}>
            <PdfPagePreview
              uri={file.uri}
              page={previewPage}
              rotationDeg={rotations[previewPage] || 0}
              fallbackLabel={`${t('pages')} ${previewPage}`}
            />
          </View>

          <View style={[styles.previewControls, { flexDirection: rowDir }]}>
            <TouchableOpacity
              style={styles.previewRotate}
              onPress={() => rotatePage(previewPage)}
            >
              <Ionicons name="refresh-outline" size={20} color="#fff" />
              <Text style={styles.previewRotateText}>
                {t('rotateTitle')} {rotations[previewPage] ? `(${rotations[previewPage]}°)` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const NAVY = '#1F4E78';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f172a' },
  scroll: { padding: 16 },
  header: { paddingVertical: 12 },
  backBtn: { marginBottom: 8 },
  backText: { color: '#60a5fa', fontSize: 16, fontWeight: '700' },
  title: { fontSize: 24, fontWeight: '800', color: '#ffffff' },

  pickBtn: { borderWidth: 2, borderColor: NAVY, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 24, alignItems: 'center', backgroundColor: '#16233a', marginTop: 8, marginBottom: 16 },
  pickText: { color: '#cbd5e1', fontWeight: '700', fontSize: 14 },

  fileCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#293548' },
  fileRow: { alignItems: 'center', gap: 10 },
  fileSize: { color: '#64748b', fontSize: 11, fontWeight: '700' },
  fileName: { flex: 1, color: '#e2e8f0', fontSize: 13, fontWeight: '600', textAlign: 'right' },

  bulkRow: { gap: 10, marginBottom: 12 },
  bulkBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1e293b', borderRadius: 10, paddingVertical: 11, borderWidth: 0.5, borderColor: '#2d3a4f' },
  bulkText: { color: '#cbd5e1', fontSize: 13, fontWeight: '600' },

  hint: { color: '#64748b', fontSize: 12, marginBottom: 12, paddingHorizontal: 2 },

  pagesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  pageCard: { width: '31%', backgroundColor: '#1e293b', borderRadius: 12, padding: 8, borderWidth: 0.5, borderColor: '#2d3a4f', alignItems: 'center' },
  pageCardActive: { borderColor: '#60a5fa', borderWidth: 1 },
  pageThumb: { width: '100%', aspectRatio: 0.85, backgroundColor: '#0b1220', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 8, position: 'relative', overflow: 'hidden' },
  pageIconWrap: { alignItems: 'center', justifyContent: 'center' },
  tapHint: { position: 'absolute', bottom: 4, left: 4, backgroundColor: '#0008', borderRadius: 6, padding: 3 },
  pageNumBadge: { position: 'absolute', top: 4, left: 4, backgroundColor: '#0008', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  pageNumText: { color: '#cbd5e1', fontSize: 10, fontWeight: '700' },
  angleBadge: { position: 'absolute', bottom: 4, right: 4, backgroundColor: '#1d4ed8', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  angleText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  rotateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#283548', borderRadius: 8, paddingVertical: 7, width: '100%' },
  rotateBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  optionsBox: { backgroundColor: '#1e293b', borderRadius: 14, padding: 14, marginTop: 8, marginBottom: 16, borderWidth: 1, borderColor: '#293548' },
  optLabel: { color: '#e2e8f0', fontWeight: '800', fontSize: 13, marginBottom: 8 },
  nameRow: { alignItems: 'center', gap: 8 },
  input: { flex: 1, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', fontSize: 15, fontWeight: '700' },
  ext: { color: '#94a3b8', fontSize: 14, fontWeight: '700' },

  actionBtn: { backgroundColor: NAVY, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  actionBtnDisabled: { opacity: 0.5 },
  actionInner: { alignItems: 'center', gap: 8 },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  previewOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0b1220' },
  previewHeader: { alignItems: 'center', gap: 12, paddingTop: 44, paddingHorizontal: 16, paddingBottom: 12 },
  previewCloseBtn: { padding: 4 },
  previewTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  previewBody: { flex: 1, margin: 12, backgroundColor: '#0b1220' },
  previewControls: { justifyContent: 'center', paddingBottom: 32, paddingTop: 8 },
  previewRotate: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1d4ed8', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  previewRotateText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
