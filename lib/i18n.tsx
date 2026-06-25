import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext, useCallback, useContext, useEffect, useState,
} from 'react';

type Lang = 'ar' | 'en';
const STORE_KEY = 'app_lang_v1';

const STRINGS: Record<string, { ar: string; en: string }> = {
  // عام
  appName: { ar: 'Smart PDF', en: 'Smart PDF' },
  welcome: { ar: 'أهلاً بك', en: 'Welcome' },
  offline: { ar: 'أوفلاين', en: 'Offline' },
  comingSoon: { ar: 'قريباً', en: 'Soon' },
  back: { ar: 'رجوع', en: 'Back' },
  save: { ar: 'حفظ', en: 'Save' },
  processing: { ar: 'جارٍ المعالجة…', en: 'Processing…' },
  outputName: { ar: 'اسم الملف الناتج', en: 'Output file name' },
  none: { ar: 'لا شيء', en: 'None' },
  all: { ar: 'الكل', en: 'All' },
  error: { ar: 'خطأ', en: 'Error' },
  done: { ar: 'تمّ', en: 'Done' },
  cancelled: { ar: 'أُلغيت', en: 'Cancelled' },
  noFolderSaved: { ar: 'لم يُختر مجلد. لم يُحفظ الملف.', en: 'No folder selected. File was not saved.' },

  // التبويبات
  tabTools: { ar: 'الأدوات', en: 'Tools' },
  tabFiles: { ar: 'الملفات', en: 'Files' },
  tabSettings: { ar: 'الإعدادات', en: 'Settings' },

  // شاشة الأدوات
  homeTagline: { ar: 'صندوق أدواتك الكامل للـ PDF — اختر ما تحتاجه', en: 'Your complete PDF toolkit — pick what you need' },
  catOrganize: { ar: 'تنظيم الصفحات', en: 'Organize Pages' },
  catConvert: { ar: 'التحويل', en: 'Convert' },
  catSecurity: { ar: 'الأمان', en: 'Security' },
  convertTo: { ar: 'إلى PDF', en: 'To PDF' },
  convertFrom: { ar: 'من PDF', en: 'From PDF' },
  toolMerge: { ar: 'دمج', en: 'Merge' },
  toolMergeDesc: { ar: 'ملفات في واحد', en: 'Files into one' },
  toolSplit: { ar: 'تقسيم', en: 'Split' },
  toolSplitDesc: { ar: 'فصل الصفحات', en: 'Separate pages' },
  toolRotate: { ar: 'تدوير', en: 'Rotate' },
  toolRotateDesc: { ar: 'تصحيح الاتجاه', en: 'Fix orientation' },
  toolDelete: { ar: 'حذف صفحات', en: 'Delete pages' },
  toolDeleteDesc: { ar: 'إزالة الزائد', en: 'Remove extras' },
  toolImg2Pdf: { ar: 'صور إلى PDF', en: 'Images to PDF' },
  toolImg2PdfDesc: { ar: 'حوّل صورك إلى مستند', en: 'Turn images into a document' },
  toolProtect: { ar: 'حماية PDF', en: 'Protect PDF' },
  toolProtectDesc: { ar: 'تشفير بكلمة مرور', en: 'Encrypt with a password' },
  toolPdf2Img: { ar: 'PDF إلى صور', en: 'PDF to Images' },
  toolPdf2ImgDesc: { ar: 'استخراج الصفحات كصور', en: 'Export pages as images' },
  toolDoc2Pdf: { ar: 'Word / Excel إلى PDF', en: 'Word / Excel to PDF' },
  toolDoc2PdfDesc: { ar: 'تحويل المستندات', en: 'Convert documents' },
  daysLeftLabel: { ar: 'متبقٍ', en: 'left' },
  daysWord: { ar: 'أيام', en: 'days' },

  // شاشة الملفات
  myFiles: { ar: 'ملفاتي', en: 'My Files' },
  filesSubtitle: { ar: 'كل ما تنشئه يُحفظ هنا تلقائياً', en: 'Everything you create is saved here' },
  filesCount: { ar: 'ملفات', en: 'files' },
  download: { ar: 'تحميل', en: 'Download' },
  share: { ar: 'مشاركة', en: 'Share' },
  delete: { ar: 'حذف', en: 'Delete' },
  noFilesTitle: { ar: 'لا توجد ملفات بعد', en: 'No files yet' },
  noFilesDesc: { ar: 'ابدأ بإنشاء أول ملف من الأدوات، وسيظهر هنا محفوظاً وجاهزاً للتحميل في أي وقت.', en: 'Create your first file from the tools, and it will appear here ready to download anytime.' },
  browseTools: { ar: 'تصفّح الأدوات', en: 'Browse tools' },

  // الإعدادات
  settings: { ar: 'الإعدادات', en: 'Settings' },
  trialVersion: { ar: 'النسخة التجريبية', en: 'Trial version' },
  active: { ar: 'نشطة', en: 'Active' },
  ended: { ar: 'منتهية', en: 'Ended' },
  upgradeFull: { ar: 'الترقية للنسخة الكاملة', en: 'Upgrade to full version' },
  general: { ar: 'عام', en: 'General' },
  language: { ar: 'اللغة', en: 'Language' },
  downloadFolder: { ar: 'مجلد التحميل', en: 'Download folder' },
  storageMgmt: { ar: 'إدارة الملفات', en: 'Storage' },
  clearAll: { ar: 'تفريغ المجلد', en: 'Clear all files' },
  aboutSupport: { ar: 'حول ودعم', en: 'About & Support' },
  rateApp: { ar: 'تقييم التطبيق', en: 'Rate the app' },
  shareApp: { ar: 'مشاركة التطبيق', en: 'Share the app' },
  contactUs: { ar: 'التواصل معنا', en: 'Contact us' },
  privacyPolicy: { ar: 'سياسة الخصوصية', en: 'Privacy policy' },
  version: { ar: 'الإصدار', en: 'Version' },
  clearTitle: { ar: 'تفريغ كل الملفات؟', en: 'Clear all files?' },
  clearWarning: { ar: 'سيتم حذف جميع الملفات المحفوظة في الأرشيف نهائياً ولا يمكن التراجع.', en: 'All saved files will be permanently deleted. This cannot be undone.' },
  cancel: { ar: 'إلغاء', en: 'Cancel' },

  // شاشة النتيجة
  doneSuccess: { ar: 'تمّت العملية بنجاح', en: 'Done successfully' },
  open: { ar: 'فتح', en: 'Open' },
  backToTools: { ar: 'العودة للأدوات', en: 'Back to tools' },
  savedToArchive: { ar: 'حُفظ في ملفاتك', en: 'Saved to your files' },

  // مشترك بين الأدوات
  pickPdf: { ar: 'اضغط لاختيار ملف PDF', en: 'Tap to pick a PDF file' },
  pickPdfDiff: { ar: 'اختيار ملف PDF آخر', en: 'Pick a different PDF' },
  pickPdfFiles: { ar: 'اضغط لاختيار ملفات PDF', en: 'Tap to pick PDF files' },
  pages: { ar: 'صفحات', en: 'pages' },
  noFile: { ar: 'لا يوجد ملف', en: 'No file' },
  noFilePick: { ar: 'يرجى اختيار ملف PDF أولاً.', en: 'Please pick a PDF file first.' },
  couldNotRead: { ar: 'تعذّر قراءة ملف PDF.', en: 'Could not read the PDF file.' },

  // merge
  mergeTitle: { ar: 'دمج PDF', en: 'Merge PDF' },
  mergeAddNums: { ar: 'إضافة أرقام الصفحات (أسفل-وسط)', en: 'Add page numbers (bottom-center)' },
  mergeNeedMore: { ar: 'أضف ملفاً آخر على الأقل للدمج.', en: 'Add at least one more file to merge.' },
  mergeNeedMoreT: { ar: 'تحتاج ملفات أكثر', en: 'Need more files' },
  mergeNeedTwo: { ar: 'اختر ملفّين PDF على الأقل للدمج.', en: 'Please pick at least two PDF files to merge.' },
  mergeNoPagesT: { ar: 'لم تُحدّد صفحات', en: 'No pages selected' },
  mergeNoPages: { ar: 'اختر صفحة واحدة على الأقل للدمج.', en: 'Please select at least one page to merge.' },
  mergeCouldNotPick: { ar: 'تعذّر اختيار الملفات.', en: 'Could not pick files.' },
  mergeFailed: { ar: 'فشل الدمج', en: 'Merge failed' },
  mergeBtn: { ar: 'دمج وحفظ', en: 'Merge & Save' },

  // split
  splitTitle: { ar: 'تقسيم PDF', en: 'Split PDF' },
  splitPerFile: { ar: 'صفحات لكل ملف:', en: 'Pages per file:' },
  splitNoPages: { ar: 'اختر صفحة واحدة على الأقل للاستخراج.', en: 'Please select at least one page to extract.' },
  splitInvalidRangeT: { ar: 'نطاق غير صالح', en: 'Invalid range' },
  splitInvalidRange: { ar: 'أدخل نطاقاً صحيحاً، مثل 1-5، 8، 11-13.', en: 'Please enter a valid range, e.g. 1-5, 8, 11-13.' },
  splitInvalidSizeT: { ar: 'حجم غير صالح', en: 'Invalid size' },
  splitInvalidSize: { ar: 'أدخل عدد صفحات صحيحاً لكل ملف.', en: 'Please enter a valid pages-per-file number.' },
  splitBtn: { ar: 'تقسيم وحفظ', en: 'Split & Save' },

  // rotate
  rotateTitle: { ar: 'تدوير الصفحات', en: 'Rotate Pages' },
  rotateLandscape: { ar: 'جعلها أفقية', en: 'Make Landscape' },
  rotatePortToLand: { ar: 'عمودي ← أفقي', en: 'Portrait → Landscape' },
  rotatePortrait: { ar: 'جعلها عمودية', en: 'Make Portrait' },
  rotateLandToPort: { ar: 'أفقي ← عمودي', en: 'Landscape → Portrait' },
  rotateManual: { ar: 'أو دوّر يدوياً:', en: 'Or rotate manually:' },
  rotateNoPages: { ar: 'اختر صفحة واحدة على الأقل للتدوير.', en: 'Please select at least one page to rotate.' },
  rotateBtn: { ar: 'تدوير وحفظ', en: 'Rotate & Save' },

  // images
  imgTitle: { ar: 'صور إلى PDF', en: 'Images to PDF' },
  imgGallery: { ar: 'المعرض', en: 'Gallery' },
  imgFiles: { ar: 'الملفات', en: 'Files' },
  imgAutoRotate: { ar: 'تدوير الصور الأفقية تلقائياً للعمودي (90°)', en: 'Auto-rotate landscape images to portrait (90°)' },
  imgAddNums: { ar: 'إضافة أرقام الصفحات (أسفل-وسط)', en: 'Add page numbers (bottom-center)' },
  imgPermT: { ar: 'إذن مطلوب', en: 'Permission needed' },
  imgPerm: { ar: 'يرجى السماح بالوصول إلى صورك.', en: 'Please allow access to your photos.' },
  imgPickGalErr: { ar: 'تعذّر اختيار الصور من المعرض.', en: 'Could not pick images from gallery.' },
  imgPickFileErr: { ar: 'تعذّر اختيار ملفات الصور.', en: 'Could not pick image files.' },
  imgNoImagesT: { ar: 'لا صور', en: 'No images' },
  imgNoImages: { ar: 'أضف صورة واحدة على الأقل.', en: 'Please add at least one image.' },
  imgClearAll: { ar: 'مسح الكل', en: 'Clear all' },
  imgBtn: { ar: 'إنشاء وحفظ', en: 'Create & Save' },

  // delete
  deleteTitle: { ar: 'حذف الصفحات', en: 'Delete Pages' },
  deleteTapHint: { ar: 'اضغط على صفحة لتحديدها للحذف (تتحوّل للأحمر).', en: 'Tap a page to mark it for deletion (turns red).' },
  deleteMustRemain: { ar: 'يجب أن تبقى صفحة واحدة على الأقل.', en: 'At least one page must remain.' },
  deleteNoPages: { ar: 'اختر صفحة واحدة على الأقل للحذف.', en: 'Please select at least one page to delete.' },
  deleteCannotAllT: { ar: 'لا يمكن حذف الكل', en: 'Cannot delete all' },
  deleteBtn: { ar: 'حذف وحفظ', en: 'Delete & Save' },

  // protect
  protectTitle: { ar: 'حماية PDF', en: 'Protect PDF' },
  protectPassword: { ar: 'كلمة المرور', en: 'Password' },
  protectConfirm: { ar: 'تأكيد كلمة المرور', en: 'Confirm password' },
  protectEnter: { ar: 'أدخل كلمة المرور', en: 'Enter password' },
  protectReenter: { ar: 'أعد إدخال كلمة المرور', en: 'Re-enter password' },
  protectMismatch: { ar: 'كلمتا المرور غير متطابقتين.', en: 'Passwords do not match.' },
  protectShow: { ar: 'إظهار كلمة المرور', en: 'Show password' },
  protectHide: { ar: 'إخفاء كلمة المرور', en: 'Hide password' },
  protectWeakT: { ar: 'كلمة مرور ضعيفة', en: 'Weak password' },
  protectWeak: { ar: 'يجب ألا تقل كلمة المرور عن 4 أحرف.', en: 'Password must be at least 4 characters.' },
  protectMismatchT: { ar: 'عدم تطابق', en: 'Mismatch' },
  protectNote: { ar: 'ستحتاج كلمة المرور هذه لفتح الملف. احفظها جيداً — لا يمكن استرجاعها.', en: "You'll need this password to open the PDF. Keep it safe — it can't be recovered." },
  protectBtn: { ar: 'حماية وحفظ', en: 'Protect & Save' },
  splitFailed: { ar: 'فشل التقسيم', en: 'Split failed' },
  rotateFailed: { ar: 'فشل التدوير', en: 'Rotate failed' },
  imgFailed: { ar: 'فشل التحويل', en: 'Conversion failed' },
  deleteFailed: { ar: 'فشل الحذف', en: 'Delete failed' },
  protectFailed: { ar: 'فشل الحماية', en: 'Protection failed' },
  filesSaved: { ar: 'تم حفظ الملفات', en: 'Files saved' },
};

type LangState = {
  lang: Lang; isRTL: boolean;
  t: (key: string) => string;
  setLang: (l: Lang) => Promise<void>;
  toggleLang: () => Promise<void>;
};

const LangContext = createContext<LangState>({
  lang: 'ar', isRTL: true, t: (k) => k,
  setLang: async () => {}, toggleLang: async () => {},
});

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ar');

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORE_KEY);
        if (saved === 'ar' || saved === 'en') setLangState(saved);
      } catch {}
    })();
  }, []);

  const setLang = useCallback(async (l: Lang) => {
    setLangState(l);
    try { await AsyncStorage.setItem(STORE_KEY, l); } catch {}
  }, []);

  const toggleLang = useCallback(async () => {
    await setLang(lang === 'ar' ? 'en' : 'ar');
  }, [lang, setLang]);

  const t = useCallback((key: string) => {
    const e = STRINGS[key];
    return e ? e[lang] : key;
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, isRTL: lang === 'ar', t, setLang, toggleLang }}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);
