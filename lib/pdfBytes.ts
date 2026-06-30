// ─────────────────────────────────────────────────────────────
// lib/pdfBytes.ts
// قراءة/كتابة PDF بكفاءة للملفات الكبيرة (يمنع انهيار الذاكرة).
//
// المشكلة التي يحلّها:
//   تمرير سلسلة base64 خام إلى PDFDocument.load(b64) يجبر pdf-lib على
//   فكّ ترميزها داخلياً بطريقة بطيئة وكثيفة الذاكرة → مع ملف 18M+ ينهار
//   التطبيق على أندرويد ("غير قادر على فتح الملف").
//
// الحل (القاعدة الذهبية #3): حوّل base64 → Uint8Array عبر base64-js
//   (سريع وخفيف)، ومرّر البايتات مباشرة إلى pdf-lib، مع yieldToUI()
//   بين الخطوات الثقيلة حتى لا تتجمّد الواجهة.
// ─────────────────────────────────────────────────────────────

import * as FileSystem from 'expo-file-system/legacy';
import { toByteArray, fromByteArray } from 'base64-js';

/** يترك الخيط الرئيسي يتنفّس بين العمليات الثقيلة (يمنع تجمّد الواجهة). */
export const yieldToUI = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

/**
 * يقرأ ملف PDF من uri ويعيده كـ Uint8Array جاهز لـ PDFDocument.load().
 * هذه الطريقة الموحّدة والآمنة للملفات الكبيرة في كل الشاشات.
 */
export async function readPdfBytes(uri: string): Promise<Uint8Array> {
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  await yieldToUI();
  const bytes = toByteArray(b64);
  await yieldToUI();
  return bytes;
}

/** يحوّل Uint8Array (مخرجات pdf-lib) إلى base64 بسرعة عبر base64-js. */
export function bytesToBase64(bytes: Uint8Array): string {
  return fromByteArray(bytes);
}

/** يكتب base64 إلى ملف على القرص (للحفظ/المشاركة). */
export async function writeBase64ToFile(uri: string, base64: string): Promise<void> {
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' });
}

/** يحوّل سلسلة base64 إلى Uint8Array بسرعة (لأي ملف: صورة/خط/…). */
export function base64ToBytes(b64: string): Uint8Array {
  return toByteArray(b64);
}

/** يقرأ أي ملف (صورة مثلاً) من uri ويعيده كـ Uint8Array بكفاءة. */
export async function readFileBytes(uri: string): Promise<Uint8Array> {
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  await yieldToUI();
  return toByteArray(b64);
}
