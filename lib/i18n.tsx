import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

/**
 * نظام اللغة المزدوجة (Arabic / English)
 * ======================================
 * - يوفّر نصوص الواجهة بلغتين عبر دالة t('key').
 * - يحفظ اختيار اللغة محلياً ويستعيده عند التشغيل.
 * - يوفّر isRTL لضبط اتجاه الواجهة في كل شاشة.
 *
 * الاستخدام:
 *   const { t, lang, isRTL, toggleLang } = useLang();
 *   <Text>{t('tools')}</Text>
 */

type Lang = 'ar' | 'en';
const STORE_KEY = 'app_lang_v1';

// قاموس النصوص — أضف أي مفتاح جديد هنا باللغتين
const STRINGS: Record<string, { ar: string; en: string }> = {
  // عام
  appName: { ar: 'Smart PDF', en: 'Smart PDF' },
  welcome: { ar: 'أهلاً بك', en: 'Welcome' },
  worksOffline: { ar: 'يعمل دون إنترنت', en: 'Works offline' },
  offline: { ar: 'أوفلاين', en: 'Offline' },
  comingSoon: { ar: 'قريباً', en: 'Soon' },

  // التبويبات السفلية
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

  // الأدوات
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

  // شاشة الملفات
  myFiles: { ar: 'ملفاتي', en: 'My Files' },
  filesSubtitle: { ar: 'كل ما تنشئه يُحفظ هنا تلقائياً', en: 'Everything you create is saved here' },
  filesCount: { ar: 'ملفات', en: 'files' },
  today: { ar: 'اليوم', en: 'Today' },
  yesterday: { ar: 'أمس', en: 'Yesterday' },
  earlier: { ar: 'سابقاً', en: 'Earlier' },
  download: { ar: 'تحميل', en: 'Download' },
  share: { ar: 'مشاركة', en: 'Share' },
  delete: { ar: 'حذف', en: 'Delete' },
  noFilesTitle: { ar: 'لا توجد ملفات بعد', en: 'No files yet' },
  noFilesDesc: { ar: 'ابدأ بإنشاء أول ملف من الأدوات، وسيظهر هنا محفوظاً وجاهزاً للتحميل في أي وقت.', en: 'Create your first file from the tools, and it will appear here ready to download anytime.' },
  browseTools: { ar: 'تصفّح الأدوات', en: 'Browse tools' },

  // شاشة الإعدادات
  settings: { ar: 'الإعدادات', en: 'Settings' },
  trialVersion: { ar: 'النسخة التجريبية', en: 'Trial version' },
  active: { ar: 'نشطة', en: 'Active' },
  ended: { ar: 'منتهية', en: 'Ended' },
  daysLeftLabel: { ar: 'متبقٍ', en: 'left' },
  daysWord: { ar: 'أيام', en: 'days' },
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

  // رسالة تأكيد الحذف
  clearTitle: { ar: 'تفريغ كل الملفات؟', en: 'Clear all files?' },
  clearWarning: { ar: 'سيتم حذف جميع الملفات المحفوظة في الأرشيف نهائياً ولا يمكن التراجع.', en: 'All saved files will be permanently deleted. This cannot be undone.' },
  cancel: { ar: 'إلغاء', en: 'Cancel' },

  // شاشة النتيجة
  done: { ar: 'تمّت العملية بنجاح', en: 'Done successfully' },
  resultReady: { ar: 'ملفك جاهز', en: 'Your file is ready' },
  open: { ar: 'فتح', en: 'Open' },
  backToTools: { ar: 'العودة للأدوات', en: 'Back to tools' },
  savedToArchive: { ar: 'حُفظ في ملفاتك', en: 'Saved to your files' },
};

type LangState = {
  lang: Lang;
  isRTL: boolean;
  t: (key: string) => string;
  setLang: (l: Lang) => Promise<void>;
  toggleLang: () => Promise<void>;
};

const LangContext = createContext<LangState>({
  lang: 'ar',
  isRTL: true,
  t: (k) => k,
  setLang: async () => {},
  toggleLang: async () => {},
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
    try {
      await AsyncStorage.setItem(STORE_KEY, l);
    } catch {}
  }, []);

  const toggleLang = useCallback(async () => {
    const next: Lang = lang === 'ar' ? 'en' : 'ar';
    await setLang(next);
  }, [lang, setLang]);

  const t = useCallback(
    (key: string) => {
      const entry = STRINGS[key];
      if (!entry) return key;
      return entry[lang];
    },
    [lang]
  );

  return (
    <LangContext.Provider
      value={{ lang, isRTL: lang === 'ar', t, setLang, toggleLang }}
    >
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);
