import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLang } from '@/lib/i18n';
import { saveToArchive } from '@/lib/archive';

/**
 * Images to PDF — offline tool.
 * Pick images (JPG/PNG) from gallery or files, reorder/remove them,
 * auto-rotate landscape images to portrait, optionally add page numbers,
 * set the output name, then combine into a single PDF on-device with pdf-lib.
 * No internet required.
 */

type PickedImage = {
  uri: string;
  name: string;
  mime: string; // image/jpeg | image/png
};

export default function ImagesToPdfScreen() {
  const router = useRouter();
  const { t, isRTL } = useLang();
  const [images, setImages] = useState<PickedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [outputName, setOutputName] = useState('images');  // اسم الملف الناتج
  const [addNumbers, setAddNumbers] = useState(false);      // ترقيم الصفحات
  const [autoPortrait, setAutoPortrait] = useState(true);   // تدوير الصور الأفقية لعمودية

  // استنتاج نوع الصورة من الامتداد أو الـ mime
  const guessMime = (uri: string, mime?: string): string => {
    if (mime && (mime.includes('jpeg') || mime.includes('jpg'))) return 'image/jpeg';
    if (mime && mime.includes('png')) return 'image/png';
    const lower = uri.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    return 'image/jpeg'; // الافتراضي
  };

  const nameFromUri = (uri: string, fallback: string) => {
    const parts = uri.split('/');
    const last = parts[parts.length - 1];
    return last && last.length > 0 ? decodeURIComponent(last) : fallback;
  };

  // اختيار من معرض الصور
  const pickFromGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('imgPermT'), t('imgPerm'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 1,
      });
      if (result.canceled) return;
      const picked: PickedImage[] = result.assets.map((a, i) => ({
        uri: a.uri,
        name: a.fileName || nameFromUri(a.uri, `image_${i + 1}`),
        mime: guessMime(a.uri, a.mimeType ?? undefined),
      }));
      setImages((prev) => [...prev, ...picked]);
    } catch (e) {
      Alert.alert(t('error'), t('imgPickGalErr'));
    }
  };

  // اختيار من الملفات
  const pickFromFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const picked: PickedImage[] = result.assets.map((a, i) => ({
        uri: a.uri,
        name: a.name || nameFromUri(a.uri, `image_${i + 1}`),
        mime: guessMime(a.name || a.uri, a.mimeType ?? undefined),
      }));
      setImages((prev) => [...prev, ...picked]);
    } catch (e) {
      Alert.alert(t('error'), t('imgPickFileErr'));
    }
  };

  const removeImage = (index: number) =>
    setImages((prev) => prev.filter((_, i) => i !== index));

  const clearAll = () => setImages([]);

  // تحريك صورة لأعلى/أسفل في الترتيب
  const moveImage = (index: number, dir: -1 | 1) => {
    setImages((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  // قراءة الصورة كـ base64
  const readAsBase64 = async (uri: string) =>
    await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });

  // base64 -> Uint8Array
  const base64ToBytes = (b64: string): Uint8Array => {
    const binary =
      typeof atob === 'function'
        ? atob(b64)
        : Buffer.from(b64, 'base64').toString('binary');
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  };

  // تنظيف اسم الملف وإضافة الامتداد
  const finalFileName = () => {
    let n = outputName.trim();
    if (!n) n = 'images';
    n = n.replace(/[\\/:*?"<>|]/g, '_');
    if (!n.toLowerCase().endsWith('.pdf')) n += '.pdf';
    return n;
  };

  // الحفظ المباشر (أندرويد SAF / iOS مشاركة)
  const saveOutput = async (base64: string, fileName: string) => {
    if (Platform.OS === 'android') {
      const perm =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('cancelled'), t('noFolderSaved'));
        return false;
      }
      const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
        perm.directoryUri,
        fileName,
        'application/pdf'
      );
      await FileSystem.writeAsStringAsync(destUri, base64, { encoding: 'base64' });
      Alert.alert(t('done'), fileName);
      return true;
    } else {
      const outUri = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(outUri, base64, { encoding: 'base64' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(outUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save or share PDF',
        });
      } else {
        Alert.alert(t('done'), t('savedToArchive'));
      }
      return true;
    }
  };

  // التحويل عبر pdf-lib
  const convert = async () => {
    if (images.length === 0) {
      Alert.alert(t('imgNoImagesT'), t('imgNoImages'));
      return;
    }
    setBusy(true);
    try {
      const pdfDoc = await PDFDocument.create();

      const font = addNumbers
        ? await pdfDoc.embedFont(StandardFonts.Helvetica)
        : null;
      const fontSize = 12;

      let pageNo = 1;
      for (const img of images) {
        const b64 = await readAsBase64(img.uri);
        const bytes = base64ToBytes(b64);

        let embedded;
        try {
          embedded =
            img.mime === 'image/png'
              ? await pdfDoc.embedPng(bytes)
              : await pdfDoc.embedJpg(bytes);
        } catch {
          embedded =
            img.mime === 'image/png'
              ? await pdfDoc.embedJpg(bytes)
              : await pdfDoc.embedPng(bytes);
        }

        const iw = embedded.width;
        const ih = embedded.height;
        const isLandscape = iw > ih;
        // ندوّر الصورة الأفقية 90° لتصبح عمودية إن كان الخيار مفعّلاً
        const rotate = autoPortrait && isLandscape;

        const margin = 20;
        const bottomMargin = addNumbers ? 45 : 20;

        // أبعاد الصورة بعد التدوير المنطقي (العرض/الارتفاع يتبادلان عند الدوران)
        const drawnW = rotate ? ih : iw;
        const drawnH = rotate ? iw : ih;

        const pageW = drawnW + margin * 2;
        const pageH = drawnH + margin + bottomMargin;
        const page = pdfDoc.addPage([pageW, pageH]);

        if (rotate) {
          // عند الدوران 90°، نضع نقطة الأصل بحيث تملأ الصورة المساحة عمودياً
          // الصورة تُرسم بأبعادها الأصلية (iw×ih) لكن مدوّرة، فتشغل drawnW×drawnH
          page.drawImage(embedded, {
            x: margin + drawnW, // الزاوية تنتقل لليمين بمقدار العرض المرسوم
            y: bottomMargin,
            width: iw,
            height: ih,
            rotate: degrees(90),
          });
        } else {
          page.drawImage(embedded, {
            x: margin,
            y: bottomMargin,
            width: iw,
            height: ih,
          });
        }

        if (addNumbers && font) {
          const label = `${pageNo}`;
          const textWidth = font.widthOfTextAtSize(label, fontSize);
          page.drawText(label, {
            x: pageW / 2 - textWidth / 2,
            y: 18,
            size: fontSize,
            font,
            color: rgb(0.2, 0.2, 0.2),
          });
        }
        pageNo++;
      }

      const base64 = await pdfDoc.saveAsBase64();
      const __s = await saveToArchive(base64, finalFileName(), 'img2pdf');
      if (__s) { router.push({ pathname: '/result', params: { name: __s.name, uri: __s.uri, size: String(__s.size), kind: __s.kind } }); setBusy(false); return; }
      await saveOutput(base64, finalFileName());
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'Unknown error';
      Alert.alert(t('imgFailed'), msg);
      console.log('IMG2PDF ERROR:', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>{isRTL ? '›' : '‹'} {t('back')}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('imgTitle')}</Text>
          <Text style={styles.subtitle}>
            Pick JPG or PNG images, arrange them, and combine into one PDF — all on
            your device.
          </Text>
        </View>

        {/* Pick buttons */}
        <View style={styles.pickRow}>
          <TouchableOpacity
            style={[styles.pickBtn, styles.pickHalf]}
            onPress={pickFromGallery}
            disabled={busy}
          >
            <Text style={styles.pickIcon}>🖼️</Text>
            <Text style={styles.pickText}>Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pickBtn, styles.pickHalf]}
            onPress={pickFromFiles}
            disabled={busy}
          >
            <Text style={styles.pickIcon}>📂</Text>
            <Text style={styles.pickText}>Files</Text>
          </TouchableOpacity>
        </View>

        {/* Image list */}
        {images.length > 0 && (
          <View style={styles.listBox}>
            <View style={styles.listHeader}>
              <TouchableOpacity onPress={clearAll} disabled={busy}>
                <Text style={styles.clearText}>Clear all</Text>
              </TouchableOpacity>
              <Text style={styles.listTitle}>Images ({images.length})</Text>
            </View>

            {images.map((img, i) => (
              <View key={`${img.uri}-${i}`} style={styles.imgRow}>
                <View style={styles.orderBtns}>
                  <TouchableOpacity
                    onPress={() => moveImage(i, -1)}
                    disabled={busy || i === 0}
                  >
                    <Text style={[styles.orderBtn, i === 0 && styles.orderBtnDisabled]}>
                      ▲
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => moveImage(i, 1)}
                    disabled={busy || i === images.length - 1}
                  >
                    <Text
                      style={[
                        styles.orderBtn,
                        i === images.length - 1 && styles.orderBtnDisabled,
                      ]}
                    >
                      ▼
                    </Text>
                  </TouchableOpacity>
                </View>

                <Image source={{ uri: img.uri }} style={styles.thumb} />

                <Text style={styles.imgName} numberOfLines={1}>
                  {i + 1}. {img.name}
                </Text>

                <TouchableOpacity onPress={() => removeImage(i)} disabled={busy}>
                  <Ionicons name="close" size={15} color="#f87171" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Options: اسم الملف + التدوير + الترقيم */}
        {images.length > 0 && (
          <View style={styles.optionsBox}>
            <Text style={styles.optLabel}>{t('outputName')}</Text>
            <View style={styles.nameRow}>
              <TextInput
                style={styles.input}
                value={outputName}
                onChangeText={setOutputName}
                placeholder="images"
                placeholderTextColor="#64748b"
                editable={!busy}
                autoCapitalize="none"
              />
              <Text style={styles.ext}>.pdf</Text>
            </View>

            <View style={styles.switchRow}>
              <Switch
                value={autoPortrait}
                onValueChange={setAutoPortrait}
                disabled={busy}
                trackColor={{ false: '#334155', true: NAVY }}
                thumbColor={autoPortrait ? '#60a5fa' : '#94a3b8'}
              />
              <Text style={styles.switchLabel}>
                Auto-rotate landscape images to portrait (90°)
              </Text>
            </View>

            <View style={styles.switchRow}>
              <Switch
                value={addNumbers}
                onValueChange={setAddNumbers}
                disabled={busy}
                trackColor={{ false: '#334155', true: NAVY }}
                thumbColor={addNumbers ? '#60a5fa' : '#94a3b8'}
              />
              <Text style={styles.switchLabel}>Add page numbers (bottom-center)</Text>
            </View>
          </View>
        )}

        {/* Convert button */}
        <TouchableOpacity
          style={[styles.actionBtn, (images.length === 0 || busy) && styles.actionBtnDisabled]}
          onPress={convert}
          disabled={images.length === 0 || busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.actionText}>
              🚀 Create PDF {Platform.OS === 'android' ? '& Save' : '& Share'}
              {images.length > 0 ? ` (${images.length})` : ''}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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
  title: { fontSize: 26, fontWeight: '800', color: '#ffffff' },
  subtitle: { fontSize: 13, color: '#94a3b8', marginTop: 6, lineHeight: 19 },

  pickRow: { flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 18 },
  pickBtn: {
    borderWidth: 2,
    borderColor: NAVY,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 22,
    alignItems: 'center',
    backgroundColor: '#16233a',
  },
  pickHalf: { flex: 1 },
  pickIcon: { fontSize: 28, marginBottom: 6 },
  pickText: { color: '#cbd5e1', fontWeight: '700', fontSize: 14 },

  listBox: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#293548',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  listTitle: { color: '#e2e8f0', fontWeight: '800', fontSize: 14 },
  clearText: { color: '#f87171', fontWeight: '700', fontSize: 12 },

  imgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
  },
  orderBtns: { justifyContent: 'center', gap: 2 },
  orderBtn: { color: '#60a5fa', fontSize: 14, fontWeight: '800', paddingHorizontal: 4 },
  orderBtnDisabled: { color: '#334155' },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#334155',
  },
  imgName: { flex: 1, color: '#e2e8f0', fontSize: 13, fontWeight: '600' },
  removeBtn: { color: '#f87171', fontWeight: '800', fontSize: 14, paddingHorizontal: 4 },

  optionsBox: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#293548',
  },
  optLabel: { color: '#e2e8f0', fontWeight: '800', fontSize: 13, marginBottom: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  ext: { color: '#94a3b8', fontSize: 14, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  switchLabel: { color: '#cbd5e1', fontSize: 13, fontWeight: '600', flex: 1 },

  actionBtn: {
    backgroundColor: NAVY,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  actionBtnDisabled: { opacity: 0.5 },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
