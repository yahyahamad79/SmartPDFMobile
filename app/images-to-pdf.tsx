import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { applyRotationAndFilter, cropImage, getImageSize, Filter as ImgFilter } from '@/lib/imageFilters';
import { useRouter } from 'expo-router';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { readFileBytes } from '@/lib/pdfBytes';
import React, { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Dimensions,
  Modal,
  PanResponder,
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
import { useTheme, ThemeColors } from '@/lib/theme';
import { saveToArchive } from '@/lib/archive';

/**
 * Images to PDF — محسّنة.
 * - معاينة كبيرة لكل صورة (اضغط الصورة لفتحها بملء الشاشة).
 * - تدوير لكل صورة (0/90/180/270) يظهر فورياً على المعاينة.
 * - فلاتر لكل صورة: أصلي / رمادي / أبيض-أسود / تباين (للمستندات الممسوحة).
 * - التدوير والفلتر يُطبَّقان فعلياً عبر expo-image-manipulator قبل تضمين الصورة في PDF.
 * كل ذلك يعمل بلا أي مكتبة native خارجية (expo-image-manipulator جزء من Expo).
 */

type PickedImage = {
  uri: string;
  name: string;
  mime: string;          // image/jpeg | image/png
  rotation: number;      // 0 | 90 | 180 | 270
  filter: ImgFilter;
};

export default function ImagesToPdfScreen() {
  const router = useRouter();
  const { t, isRTL } = useLang();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [images, setImages] = useState<PickedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [outputName, setOutputName] = useState('images');
  const [addNumbers, setAddNumbers] = useState(false);
  const [autoPortrait, setAutoPortrait] = useState(true);
  const [preview, setPreview] = useState<number | null>(null);
  // وضع القص التفاعلي
  const [cropMode, setCropMode] = useState(false);
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(null);
  // مستطيل القص بإحداثيات منطقة العرض (داخل صندوق المعاينة)
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, w: 0, h: 0 });
  // أبعاد صندوق المعاينة الثابت
  const cropBox = React.useMemo(() => {
    const w = Dimensions.get('window').width * 0.9;
    const h = Dimensions.get('window').height * 0.62;
    return { w, h };
  }, []);
  // أبعاد العرض الملائمة (contain) داخل الصندوق + الإزاحة
  const fitted = React.useMemo(() => {
    if (!imgSize) return null;
    const scale = Math.min(cropBox.w / imgSize.width, cropBox.h / imgSize.height);
    const dispW = imgSize.width * scale;
    const dispH = imgSize.height * scale;
    return { scale, dispW, dispH, offX: (cropBox.w - dispW) / 2, offY: (cropBox.h - dispH) / 2 };
  }, [imgSize, cropBox]);

  // مراجع تُبقي أحدث قيم fitted و cropRect متاحة داخل PanResponder
  // (PanResponder يُنشأ مرة واحدة فيلتقط قيمًا قديمة؛ الـ refs تحلّ ذلك).
  const fittedRef = React.useRef(fitted);
  const cropRef = React.useRef(cropRect);
  React.useEffect(() => { fittedRef.current = fitted; }, [fitted]);
  React.useEffect(() => { cropRef.current = cropRect; }, [cropRect]);

  const rowDir = isRTL ? 'row-reverse' : 'row';
  const txtAlign = isRTL ? 'right' : 'left';

  const guessMime = (uri: string, mime?: string): string => {
    if (mime && (mime.includes('jpeg') || mime.includes('jpg'))) return 'image/jpeg';
    if (mime && mime.includes('png')) return 'image/png';
    const lower = uri.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    return 'image/jpeg';
  };

  const pickFromGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('imgPermT'), t('imgPerm'));
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 1,
      });
      if (res.canceled) return;
      const picked: PickedImage[] = res.assets.map((a, i) => ({
        uri: a.uri,
        name: a.fileName || `image_${Date.now()}_${i}.jpg`,
        mime: guessMime(a.uri, a.mimeType),
        rotation: 0,
        filter: 'none',
      }));
      setImages((prev) => [...prev, ...picked]);
    } catch {
      Alert.alert(t('error'), t('imgPickGalErr'));
    }
  };

  const pickFromFiles = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const picked: PickedImage[] = res.assets.map((a, i) => ({
        uri: a.uri,
        name: a.name || `image_${Date.now()}_${i}.jpg`,
        mime: guessMime(a.uri, a.mimeType),
        rotation: 0,
        filter: 'none',
      }));
      setImages((prev) => [...prev, ...picked]);
    } catch {
      Alert.alert(t('error'), t('imgPickFileErr'));
    }
  };

  const removeImage = (index: number) =>
    setImages((prev) => prev.filter((_, i) => i !== index));

  const clearAll = () => setImages([]);

  const move = (index: number, dir: -1 | 1) => {
    setImages((prev) => {
      const next = [...prev];
      const ni = index + dir;
      if (ni < 0 || ni >= next.length) return prev;
      [next[index], next[ni]] = [next[ni], next[index]];
      return next;
    });
  };

  const rotateImage = (index: number) => {
    setImages((prev) =>
      prev.map((img, i) =>
        i === index ? { ...img, rotation: (img.rotation + 90) % 360 } : img
      )
    );
  };

  const setFilter = (index: number, filter: ImgFilter) => {
    setImages((prev) =>
      prev.map((img, i) => (i === index ? { ...img, filter } : img))
    );
  };

  // ===== القص التفاعلي =====
  // فتح وضع القص: نجلب أبعاد الصورة الحقيقية ونهيّئ إطاراً افتراضياً (80% وسط).
  const openCrop = async (index: number) => {
    try {
      const size = await getImageSize(images[index].uri);
      setImgSize(size);
      const scale = Math.min(cropBox.w / size.width, cropBox.h / size.height);
      const dispW = size.width * scale;
      const dispH = size.height * scale;
      const offX = (cropBox.w - dispW) / 2;
      const offY = (cropBox.h - dispH) / 2;
      // إطار افتراضي = 80% من منطقة العرض، موسّط
      const w = dispW * 0.8;
      const h = dispH * 0.8;
      setCropRect({ x: offX + (dispW - w) / 2, y: offY + (dispH - h) / 2, w, h });
      setCropMode(true);
    } catch {
      Alert.alert(t('error'), t('couldNotRead'));
    }
  };

  const cancelCrop = () => {
    setCropMode(false);
    setImgSize(null);
  };

  // تطبيق القص فعلياً عبر expo-image-manipulator
  const applyCrop = async () => {
    if (preview === null || !imgSize || !fitted) return;
    setBusy(true);
    try {
      // حوّل مستطيل القص (إحداثيات الصندوق) إلى إحداثيات الصورة الأصلية
      let ox = (cropRect.x - fitted.offX) / fitted.scale;
      let oy = (cropRect.y - fitted.offY) / fitted.scale;
      let ow = cropRect.w / fitted.scale;
      let oh = cropRect.h / fitted.scale;
      ox = Math.max(0, Math.min(ox, imgSize.width));
      oy = Math.max(0, Math.min(oy, imgSize.height));
      ow = Math.max(1, Math.min(ow, imgSize.width - ox));
      oh = Math.max(1, Math.min(oh, imgSize.height - oy));
      const rect = { originX: Math.round(ox), originY: Math.round(oy), width: Math.round(ow), height: Math.round(oh) };
      const res = await cropImage(images[preview].uri, rect);
      // استبدل uri الصورة بالمقصوصة، وصفّر التدوير (القص يطبّق على الحالي)
      setImages((prev) => prev.map((im, i) => (i === preview ? { ...im, uri: res.uri, mime: 'image/jpeg', rotation: 0 } : im)));
      setCropMode(false);
      setImgSize(null);
    } catch (e: any) {
      Alert.alert(t('error'), e?.message ? String(e.message) : 'crop failed');
    } finally {
      setBusy(false);
    }
  };

  // مقابض السحب: نوع الزاوية يحدّد أي حواف تتغيّر.
  // نقرأ fitted و cropRect من الـ refs (أحدث قيمة) لا من closure قديم.
  // نبدأ من نقطة بداية اللمس (g.x0/y0 - بداية) ونحسب الإزاحة من قيمة الإطار وقت بدء السحب.
  const makeCorner = (corner: 'tl' | 'tr' | 'bl' | 'br') => {
    let start = { x: 0, y: 0, w: 0, h: 0 };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        // خزّن الإطار وقت بدء السحب
        start = { ...cropRef.current };
      },
      onPanResponderMove: (_, g) => {
        const fit = fittedRef.current;
        if (!fit) return;
        const minSize = 40;
        const left = fit.offX;
        const top = fit.offY;
        const right = fit.offX + fit.dispW;
        const bottom = fit.offY + fit.dispH;
        let { x, y, w, h } = start; // نحسب من قيمة البداية + إجمالي الإزاحة dx/dy
        if (corner === 'tl') {
          const nx = Math.max(left, Math.min(x + g.dx, x + w - minSize));
          const ny = Math.max(top, Math.min(y + g.dy, y + h - minSize));
          w = w + (x - nx); h = h + (y - ny); x = nx; y = ny;
        } else if (corner === 'tr') {
          const ny = Math.max(top, Math.min(y + g.dy, y + h - minSize));
          const nw = Math.max(minSize, Math.min(w + g.dx, right - x));
          h = h + (y - ny); y = ny; w = nw;
        } else if (corner === 'bl') {
          const nx = Math.max(left, Math.min(x + g.dx, x + w - minSize));
          const nh = Math.max(minSize, Math.min(h + g.dy, bottom - y));
          w = w + (x - nx); x = nx; h = nh;
        } else { // br
          w = Math.max(minSize, Math.min(w + g.dx, right - x));
          h = Math.max(minSize, Math.min(h + g.dy, bottom - y));
        }
        setCropRect({ x, y, w, h });
      },
    });
  };

  // سحب الإطار كله (تحريك دون تغيير الحجم)
  const makeMover = () => {
    let start = { x: 0, y: 0, w: 0, h: 0 };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => { start = { ...cropRef.current }; },
      onPanResponderMove: (_, g) => {
        const fit = fittedRef.current;
        if (!fit) return;
        const left = fit.offX, top = fit.offY;
        const right = fit.offX + fit.dispW, bottom = fit.offY + fit.dispH;
        let nx = start.x + g.dx;
        let ny = start.y + g.dy;
        nx = Math.max(left, Math.min(nx, right - start.w));
        ny = Math.max(top, Math.min(ny, bottom - start.h));
        setCropRect({ x: nx, y: ny, w: start.w, h: start.h });
      },
    });
  };
  const mover = React.useRef(makeMover()).current;

  const cornerTL = React.useRef(makeCorner('tl')).current;
  const cornerTR = React.useRef(makeCorner('tr')).current;
  const cornerBL = React.useRef(makeCorner('bl')).current;
  const cornerBR = React.useRef(makeCorner('br')).current;

  const finalFileName = () => {
    let n = outputName.trim();
    if (!n) n = 'images';
    n = n.replace(/[\\/:*?"<>|]/g, '_');
    if (!n.toLowerCase().endsWith('.pdf')) n += '.pdf';
    return n;
  };

  /**
   * يطبّق التدوير والفلتر فعلياً على الصورة ويعيد uri + mime للنتيجة.
   * - التدوير عبر ImageManipulator.rotate.
   * - الفلاتر: رمادي/أبيض-أسود/تباين عبر معالجة لاحقة (انظر applyTone).
   *   ImageManipulator لا يوفّر فلاتر لونية مباشرة، لذا نستخدم خاصية
   *   منفصلة: نخفض التشبع بصرياً عبر إعادة الضغط بتدرّج رمادي تقريبي.
   *   (نعتمد التدوير الفعلي + إخراج JPEG موحّد؛ الفلتر اللوني يُطبَّق
   *    بصرياً في المعاينة، وفي الإخراج نطبّق التدوير دائماً.)
   */
  // يطبّق التدوير والفلتر فعلياً عبر الوحدة الآمنة (jpeg-js + expo-image-manipulator)
  const processImage = async (img: PickedImage): Promise<{ uri: string; mime: string }> => {
    if (img.rotation === 0 && img.filter === 'none') {
      return { uri: img.uri, mime: img.mime };
    }
    return await applyRotationAndFilter(img.uri, img.rotation, img.filter);
  };

  const createPdf = async () => {
    if (images.length === 0) {
      Alert.alert(t('imgNoImagesT'), t('imgNoImages'));
      return;
    }
    setBusy(true);
    try {
      const pdfDoc = await PDFDocument.create();
      const font = addNumbers ? await pdfDoc.embedFont(StandardFonts.Helvetica) : null;
      const fontSize = 12;
      let pageNo = 1;

      for (const img of images) {
        const processed = await processImage(img);
        const bytes = await readFileBytes(processed.uri);

        let embedded;
        try {
          embedded =
            processed.mime === 'image/png'
              ? await pdfDoc.embedPng(bytes)
              : await pdfDoc.embedJpg(bytes);
        } catch {
          embedded =
            processed.mime === 'image/png'
              ? await pdfDoc.embedJpg(bytes)
              : await pdfDoc.embedPng(bytes);
        }

        const iw = embedded.width;
        const ih = embedded.height;
        const margin = 20;
        const bottomMargin = addNumbers ? 45 : 20;

        const pageW = iw + margin * 2;
        const pageH = ih + margin + bottomMargin;
        const page = pdfDoc.addPage([pageW, pageH]);

        page.drawImage(embedded, {
          x: margin,
          y: bottomMargin,
          width: iw,
          height: ih,
        });

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
      Alert.alert(t('imgFailed'), msg);
      console.log('IMG2PDF ERROR:', e);
    } finally {
      setBusy(false);
    }
  };

  // أنماط الفلتر البصري للمعاينة (تقريبية على الشاشة)
  // إيحاء بصري للفلتر في المعاينة (الفلتر الفعلي يُطبَّق عند الإنشاء).
  const filterStyle = (filter: ImgFilter): any => {
    switch (filter) {
      case 'gray': return { tintColor: undefined, opacity: 0.9 };
      case 'bw': return { opacity: 0.78 };
      case 'contrast': return { opacity: 1 };
      default: return {};
    }
  };

  const FILTERS: { key: ImgFilter; labelKey: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'none', labelKey: 'filterNone', icon: 'image-outline' },
    { key: 'gray', labelKey: 'filterGray', icon: 'contrast-outline' },
    { key: 'bw', labelKey: 'filterBw', icon: 'sunny-outline' },
    { key: 'contrast', labelKey: 'filterContrast', icon: 'aperture-outline' },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>{isRTL ? '›' : '‹'} {t('back')}</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { textAlign: txtAlign }]}>{t('imgTitle')}</Text>
        </View>

        <View style={[styles.pickRow, { flexDirection: rowDir }]}>
          <TouchableOpacity style={[styles.pickBtn, styles.pickHalf]} onPress={pickFromGallery} disabled={busy}>
            <Ionicons name="images-outline" size={22} color={colors.primary} />
            <Text style={styles.pickText}>{t('imgGallery')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pickBtn, styles.pickHalf]} onPress={pickFromFiles} disabled={busy}>
            <Ionicons name="folder-open-outline" size={22} color={colors.primary} />
            <Text style={styles.pickText}>{t('imgFiles')}</Text>
          </TouchableOpacity>
        </View>

        {images.length > 0 && (
          <>
            <View style={[styles.listHead, { flexDirection: rowDir }]}>
              <TouchableOpacity onPress={clearAll} disabled={busy}>
                <Text style={styles.clearText}>{t('imgClearAll')}</Text>
              </TouchableOpacity>
              <Text style={styles.listTitle}>{t('imgTitle')} ({images.length})</Text>
            </View>

            {images.map((img, i) => (
              <View key={`${img.uri}_${i}`} style={styles.card}>
                <View style={[styles.cardRow, { flexDirection: rowDir }]}>
                  {/* المعاينة المصغّرة — اضغط للتكبير */}
                  <TouchableOpacity onPress={() => setPreview(i)} activeOpacity={0.8}>
                    <Image
                      source={{ uri: img.uri }}
                      style={[styles.thumb, filterStyle(img.filter), { transform: [{ rotate: `${img.rotation}deg` }] }]}
                    />
                    <View style={styles.zoomBadge}>
                      <Ionicons name="expand-outline" size={12} color="#fff" />
                    </View>
                  </TouchableOpacity>

                  <View style={{ flex: 1, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
                    <Text style={styles.imgName} numberOfLines={1}>{img.name}</Text>

                    {/* أزرار التدوير والترتيب */}
                    <View style={[styles.actionsRow, { flexDirection: rowDir }]}>
                      <TouchableOpacity style={styles.miniBtn} onPress={() => rotateImage(i)} disabled={busy}>
                        <Ionicons name="refresh-outline" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.miniBtn} onPress={() => move(i, -1)} disabled={busy || i === 0}>
                        <Ionicons name="arrow-up" size={16} color={i === 0 ? colors.border : colors.textMuted} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.miniBtn} onPress={() => move(i, 1)} disabled={busy || i === images.length - 1}>
                        <Ionicons name="arrow-down" size={16} color={i === images.length - 1 ? colors.border : colors.textMuted} />
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.miniBtn, styles.delBtn]} onPress={() => removeImage(i)} disabled={busy}>
                        <Ionicons name="trash-outline" size={16} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* شريط الفلاتر */}
                <View style={[styles.filterRow, { flexDirection: rowDir }]}>
                  {FILTERS.map((f) => {
                    const active = img.filter === f.key;
                    return (
                      <TouchableOpacity
                        key={f.key}
                        style={[styles.filterChip, active && styles.filterChipActive]}
                        onPress={() => setFilter(i, f.key)}
                        disabled={busy}
                      >
                        <Ionicons name={f.icon} size={13} color={active ? colors.bg : colors.textMuted} />
                        <Text style={[styles.filterText, active && styles.filterTextActive]}>{t(f.labelKey)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}

            {/* الخيارات */}
            <View style={styles.optionsBox}>
              <Text style={[styles.optLabel, { textAlign: txtAlign }]}>{t('outputName')}</Text>
              <View style={[styles.nameRow, { flexDirection: rowDir }]}>
                <TextInput
                  style={styles.input}
                  value={outputName}
                  onChangeText={setOutputName}
                  placeholder="images"
                  placeholderTextColor={colors.textMuted}
                  editable={!busy}
                  autoCapitalize="none"
                />
                <Text style={styles.ext}>.pdf</Text>
              </View>

              <View style={[styles.switchRow, { flexDirection: rowDir }]}>
                <Switch
                  value={addNumbers}
                  onValueChange={setAddNumbers}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={addNumbers ? colors.primary : colors.textMuted}
                  disabled={busy}
                />
                <Text style={[styles.switchLabel, { textAlign: txtAlign }]}>{t('imgAddNums')}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
              onPress={createPdf}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : (
                <View style={[{ flexDirection: rowDir }, styles.actionInner]}>
                  <Ionicons name="document-outline" size={18} color="#fff" />
                  <Text style={styles.actionText}>{t('imgBtn')}</Text>
                </View>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* معاينة كبيرة بملء الشاشة */}
      <Modal visible={preview !== null} transparent animationType="fade" onRequestClose={() => { setCropMode(false); setPreview(null); }}>
        <View style={styles.modalBg}>
          <TouchableOpacity style={styles.modalClose} onPress={() => { setCropMode(false); setImgSize(null); setPreview(null); }}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          {preview !== null && images[preview] && !cropMode && (
            <>
              <Image
                source={{ uri: images[preview].uri }}
                style={[styles.previewImg, filterStyle(images[preview].filter), { transform: [{ rotate: `${images[preview].rotation}deg` }] }]}
                resizeMode="contain"
              />
              <View style={styles.previewBar}>
                <TouchableOpacity style={styles.previewBtn} onPress={() => rotateImage(preview)}>
                  <Ionicons name="refresh-outline" size={20} color="#fff" />
                  <Text style={styles.previewBtnText}>{t('rotateTitle')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.previewBtn} onPress={() => openCrop(preview)}>
                  <Ionicons name="crop-outline" size={20} color="#fff" />
                  <Text style={styles.previewBtnText}>{t('cropTitle')}</Text>
                </TouchableOpacity>
                {FILTERS.map((f) => {
                  const active = images[preview].filter === f.key;
                  return (
                    <TouchableOpacity key={f.key} style={[styles.previewChip, active && styles.filterChipActive]} onPress={() => setFilter(preview, f.key)}>
                      <Ionicons name={f.icon} size={15} color={active ? colors.bg : colors.surface} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {preview !== null && images[preview] && cropMode && fitted && (
            <>
              <View style={[styles.cropArea, { width: cropBox.w, height: cropBox.h }]}>
                <Image
                  source={{ uri: images[preview].uri }}
                  style={{ width: cropBox.w, height: cropBox.h }}
                  resizeMode="contain"
                />
                {/* تظليل خارج إطار القص (أربع مناطق) */}
                <View pointerEvents="none" style={[styles.shade, { left: 0, top: 0, width: cropBox.w, height: cropRect.y }]} />
                <View pointerEvents="none" style={[styles.shade, { left: 0, top: cropRect.y + cropRect.h, width: cropBox.w, height: cropBox.h - cropRect.y - cropRect.h }]} />
                <View pointerEvents="none" style={[styles.shade, { left: 0, top: cropRect.y, width: cropRect.x, height: cropRect.h }]} />
                <View pointerEvents="none" style={[styles.shade, { left: cropRect.x + cropRect.w, top: cropRect.y, width: cropBox.w - cropRect.x - cropRect.w, height: cropRect.h }]} />
                {/* إطار القص */}
                <View pointerEvents="none" style={[styles.cropFrame, { left: cropRect.x, top: cropRect.y, width: cropRect.w, height: cropRect.h }]} />
                {/* منطقة سحب الإطار كله */}
                <View {...mover.panHandlers} style={{ position: 'absolute', left: cropRect.x + 18, top: cropRect.y + 18, width: Math.max(1, cropRect.w - 36), height: Math.max(1, cropRect.h - 36) }} />
                {/* المقابض الأربعة */}
                <View {...cornerTL.panHandlers} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} style={[styles.handle, { left: cropRect.x - 16, top: cropRect.y - 16 }]} />
                <View {...cornerTR.panHandlers} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} style={[styles.handle, { left: cropRect.x + cropRect.w - 16, top: cropRect.y - 16 }]} />
                <View {...cornerBL.panHandlers} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} style={[styles.handle, { left: cropRect.x - 16, top: cropRect.y + cropRect.h - 16 }]} />
                <View {...cornerBR.panHandlers} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} style={[styles.handle, { left: cropRect.x + cropRect.w - 16, top: cropRect.y + cropRect.h - 16 }]} />
              </View>
              <View style={styles.previewBar}>
                <TouchableOpacity style={[styles.previewBtn, { backgroundColor: colors.primary }]} onPress={applyCrop} disabled={busy}>
                  {busy ? <ActivityIndicator color="#fff" size="small" /> : (
                    <>
                      <Ionicons name="checkmark" size={20} color="#fff" />
                      <Text style={styles.previewBtnText}>{t('cropApply')}</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.previewBtn} onPress={cancelCrop} disabled={busy}>
                  <Ionicons name="close" size={20} color="#fff" />
                  <Text style={styles.previewBtnText}>{t('cancel')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}


const makeStyles = (c: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: 16 },
  header: { paddingVertical: 12 },
  backBtn: { marginBottom: 8 },
  backText: { color: c.primary, fontSize: 16, fontWeight: '700' },
  title: { fontSize: 24, fontWeight: '800', color: c.surface },

  pickRow: { gap: 12, marginTop: 8, marginBottom: 16 },
  pickBtn: {
    borderWidth: 2, borderColor: c.primary, borderStyle: 'dashed', borderRadius: 14,
    paddingVertical: 20, alignItems: 'center', backgroundColor: c.surface, gap: 6,
  },
  pickHalf: { flex: 1 },
  pickText: { color: c.textMuted, fontWeight: '700', fontSize: 13 },

  listHead: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 2 },
  listTitle: { color: c.text, fontWeight: '700', fontSize: 14 },
  clearText: { color: c.danger, fontSize: 12, fontWeight: '600' },

  card: { backgroundColor: c.surface, borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 0.5, borderColor: c.surfaceAlt },
  cardRow: { alignItems: 'center', gap: 12 },
  thumb: { width: 66, height: 66, borderRadius: 8, backgroundColor: c.bg },
  zoomBadge: { position: 'absolute', right: 3, bottom: 3, backgroundColor: '#000a', borderRadius: 6, padding: 2 },
  imgName: { color: c.text, fontSize: 12, fontWeight: '600', marginBottom: 8 },

  actionsRow: { gap: 8 },
  miniBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  delBtn: { backgroundColor: c.danger },

  filterRow: { gap: 6, marginTop: 10, justifyContent: 'flex-start' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.bg, borderWidth: 0.5, borderColor: c.border, borderRadius: 16, paddingHorizontal: 9, paddingVertical: 5 },
  filterChipActive: { backgroundColor: c.primary, borderColor: c.primary },
  filterText: { color: c.textMuted, fontSize: 10, fontWeight: '600' },
  filterTextActive: { color: c.bg },

  optionsBox: { backgroundColor: c.surface, borderRadius: 14, padding: 14, marginTop: 6, marginBottom: 16, borderWidth: 0.5, borderColor: c.surfaceAlt },
  optLabel: { color: c.text, fontWeight: '700', fontSize: 13, marginBottom: 8 },
  nameRow: { alignItems: 'center', gap: 8 },
  input: { flex: 1, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', fontSize: 15, fontWeight: '600' },
  ext: { color: c.textMuted, fontSize: 14, fontWeight: '700' },
  switchRow: { alignItems: 'center', gap: 10, marginTop: 14 },
  switchLabel: { color: c.textMuted, fontSize: 13, flex: 1 },

  actionBtn: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  actionBtnDisabled: { opacity: 0.5 },
  actionInner: { alignItems: 'center', gap: 8 },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  modalBg: { flex: 1, backgroundColor: '#000d', alignItems: 'center', justifyContent: 'center' },
  modalClose: { position: 'absolute', top: 44, right: 20, zIndex: 2, padding: 6 },
  previewImg: { width: '90%', height: '70%' },
  previewBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 16 },
  previewBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  previewBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  previewChip: { width: 42, height: 42, borderRadius: 10, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },

  cropArea: { position: 'relative', backgroundColor: '#000', overflow: 'hidden' },
  shade: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  cropFrame: { position: 'absolute', borderWidth: 2, borderColor: c.primary },
  handle: { position: 'absolute', width: 32, height: 32, borderRadius: 16, backgroundColor: c.primary, borderWidth: 2, borderColor: '#fff' },
});
