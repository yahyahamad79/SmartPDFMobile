import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode as jpegDecode, encode as jpegEncode } from 'jpeg-js';

/**
 * imageFilters — فلاتر لونية حقيقية، آمنة 100% (بلا مكتبات native).
 * =================================================================
 * الفكرة:
 *  1) نُصغّر الصورة ونحوّلها JPEG عبر expo-image-manipulator (آمن، جزء من Expo).
 *     التصغير يضمن سرعة المعالجة وعدم تجميد الواجهة.
 *  2) نفكّ JPEG إلى بكسلات عبر jpeg-js (JavaScript نقي بالكامل — لا native).
 *  3) نطبّق الفلتر على البكسلات (رمادي/أبيض-أسود/تباين).
 *  4) نعيد ترميزها JPEG عبر jpeg-js، ونكتبها لملف مؤقت.
 *  5) النتيجة ملف JPEG حقيقي مفلتر — يُضمَّن في PDF كما هو.
 *
 * كل هذا يعمل على أي بناء APK (Expo/EAS/محلي) دون إعداد native إضافي.
 */

export type Filter = 'none' | 'gray' | 'bw' | 'contrast';

// الحد الأقصى لأبعاد المعالجة (للحفاظ على السرعة والذاكرة)
const MAX_DIM = 1600;

const base64ToBytes = (b64: string): Uint8Array => {
  const binary =
    typeof atob === 'function'
      ? atob(b64)
      : // @ts-ignore
        Buffer.from(b64, 'base64').toString('binary');
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk) as unknown as number[]
    );
  }
  if (typeof btoa === 'function') return btoa(binary);
  // @ts-ignore
  return Buffer.from(binary, 'binary').toString('base64');
};

/**
 * يطبّق تدويراً (إن وُجد) وفلتراً لونياً (إن وُجد) على صورة، ويعيد uri لملف JPEG ناتج.
 * - rotation: 0|90|180|270 (يُطبَّق عبر expo-image-manipulator — حقيقي).
 * - filter: none|gray|bw|contrast (يُطبَّق عبر jpeg-js — حقيقي).
 */
export async function applyRotationAndFilter(
  uri: string,
  rotation: number,
  filter: Filter
): Promise<{ uri: string; mime: string }> {
  // 1) التدوير + توحيد JPEG + تصغير آمن عبر expo-image-manipulator
  const actions: ImageManipulator.Action[] = [];
  if (rotation !== 0) actions.push({ rotate: rotation });
  // تصغير الأبعاد الكبيرة (يحافظ على النسبة بتمرير العرض فقط)
  // نمرّر دائماً لضمان حجم معقول للمعالجة.
  // ملاحظة: لا نعرف الأبعاد مسبقاً، لذا نصغّر فقط إن لزم عبر resize بحد أقصى.
  // expo-image-manipulator يتطلب قيمة؛ نستخدم خطوة منفصلة بعد معرفة الأبعاد.

  const stage1 = await ImageManipulator.manipulateAsync(
    uri,
    actions,
    { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG, base64: false }
  );

  // إن كان الفلتر none: نكتفي بالتدوير (سريع، بلا فكّ بكسل)
  if (filter === 'none') {
    return { uri: stage1.uri, mime: 'image/jpeg' };
  }

  // 2) اقرأ JPEG وفكّه إلى بكسلات
  const b64 = await FileSystem.readAsStringAsync(stage1.uri, { encoding: 'base64' });
  let bytes = base64ToBytes(b64);
  let raw = jpegDecode(bytes, { useTArray: true, maxResolutionInMP: 50, maxMemoryUsageInMB: 1024 });

  // إن كانت الصورة ضخمة، نصغّرها أولاً عبر manipulator ثم نعيد الفكّ
  if (raw.width > MAX_DIM || raw.height > MAX_DIM) {
    const scale = MAX_DIM / Math.max(raw.width, raw.height);
    const targetW = Math.round(raw.width * scale);
    const resized = await ImageManipulator.manipulateAsync(
      stage1.uri,
      [{ resize: { width: targetW } }],
      { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG, base64: false }
    );
    const rb64 = await FileSystem.readAsStringAsync(resized.uri, { encoding: 'base64' });
    bytes = base64ToBytes(rb64);
    raw = jpegDecode(bytes, { useTArray: true, maxResolutionInMP: 50, maxMemoryUsageInMB: 1024 });
  }

  // 3) طبّق الفلتر على البكسلات (RGBA)
  const data = raw.data; // Uint8Array [r,g,b,a,...]
  applyFilterInPlace(data, filter);

  // 4) أعد الترميز JPEG
  const encoded = jpegEncode({ data, width: raw.width, height: raw.height }, 90);
  const outBytes = encoded.data instanceof Uint8Array ? encoded.data : new Uint8Array(encoded.data);
  const outB64 = bytesToBase64(outBytes);

  // 5) اكتب ملفاً مؤقتاً
  const outUri =
    FileSystem.cacheDirectory + `filtered_${Date.now()}_${Math.floor(Math.random() * 1e4)}.jpg`;
  await FileSystem.writeAsStringAsync(outUri, outB64, { encoding: 'base64' });

  return { uri: outUri, mime: 'image/jpeg' };
}

/**
 * يطبّق الفلتر مباشرة على مصفوفة البكسلات RGBA (تعديل في المكان).
 * - gray: تدرّج رمادي بمعادلة الإضاءة (luma).
 * - bw: أبيض/أسود بعتبة (threshold) — مثالي للمستندات.
 * - contrast: رفع التباين (يحسّن وضوح النص الممسوح).
 */
function applyFilterInPlace(data: Uint8Array, filter: Filter): void {
  const n = data.length;

  if (filter === 'gray') {
    for (let i = 0; i < n; i += 4) {
      const g = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
      data[i] = g; data[i + 1] = g; data[i + 2] = g;
    }
    return;
  }

  if (filter === 'bw') {
    // عتبة تكيّفية بسيطة: متوسط الإضاءة ثم تحويل لأبيض/أسود
    for (let i = 0; i < n; i += 4) {
      const g = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const v = g > 128 ? 255 : 0;
      data[i] = v; data[i + 1] = v; data[i + 2] = v;
    }
    return;
  }

  if (filter === 'contrast') {
    // رفع التباين حول المنتصف (128) بعامل ثابت
    const factor = 1.4; // 1 = بلا تغيير، >1 = تباين أعلى
    for (let i = 0; i < n; i += 4) {
      for (let c = 0; c < 3; c++) {
        let v = (data[i + c] - 128) * factor + 128;
        v = v < 0 ? 0 : v > 255 ? 255 : v;
        data[i + c] = v | 0;
      }
    }
    return;
  }
}
