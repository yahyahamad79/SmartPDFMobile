// ─────────────────────────────────────────────────────────────
// arabicText.ts
// تجهيز النص العربي للرسم عبر pdf-lib (الذي لا يطبّق تشكيل الحروف).
// يحوّل الأحرف العربية إلى أشكالها المتصلة (Presentation Forms)
// عبر arabic-reshaper. هذا كافٍ ومثبت بصرياً للنص العربي.
//
// ملاحظة تقنية: النص العربي الخالص يظهر صحيحاً بالترتيب المنطقي
// بعد التشكيل مباشرة (pdf-lib + الخط يرسمانه من اليمين بشكل سليم).
// لذلك لا نعكس ولا نطبّق BiDi — العكس يفسد اتصال الحروف.
// ─────────────────────────────────────────────────────────────

// @ts-ignore — المكتبة بلا types رسمية
import ArabicReshaperPkg from 'arabic-reshaper';

const ArabicReshaper: any =
  (ArabicReshaperPkg as any)?.default || (ArabicReshaperPkg as any);

const ARABIC_RANGE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** هل يحتوي النص على حروف عربية؟ */
export function hasArabic(text: string): boolean {
  return ARABIC_RANGE.test(text);
}

/**
 * يجهّز النص لرسمه على PDF.
 * - عربي / مختلط: يطبّق التشكيل (ربط الحروف).
 * - لاتيني خالص: يُعاد كما هو.
 */
export function shapeForPdf(text: string): string {
  if (!text) return '';
  if (!hasArabic(text)) return text;
  try {
    return ArabicReshaper.convertArabic(text);
  } catch {
    // في أسوأ الحالات نرسم النص الخام بدل الفشل التام
    return text;
  }
}
