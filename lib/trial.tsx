import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { Platform } from 'react-native';

/**
 * نظام تجربة هجين قوي (كل الخدمات مدفوعة)
 * =========================================
 * الهدف: تبدأ التجربة من أول فتح للتطبيق وتُحسب بصرامة،
 * سواء كان هناك إنترنت أم لا، ولا يمكن تجاوزها بـ:
 *   - إغلاق الإنترنت نهائياً.
 *   - إعادة تثبيت التطبيق.
 *   - تغيير ساعة الجهاز للخلف.
 *
 * المنطق بثلاث طبقات:
 *   (1) بداية محلية فورية: عند أول فتح نسجّل تاريخ البدء في SecureStore
 *       (تخزين آمن دائم) فيبدأ العدّ فوراً حتى بلا إنترنت.
 *   (2) مقاومة العبث بالساعة: نخزّن آخر وقت رأيناه. إن رجعت ساعة الجهاز
 *       للخلف عنه => محاولة تلاعب => تُعتبر التجربة منتهية.
 *   (3) الخادم مرجع أعلى: عند توفّر الإنترنت نأخذ تاريخ البدء من الخادم،
 *       ونستخدم الأقدم بين المحلي والخادم (فلا تُعاد التجربة بإعادة التثبيت).
 *
 * ملاحظة: مدة التجربة (trialDays) يحدّدها الخادم عبر TRIAL_DAYS،
 * ولها قيمة افتراضية محلية تُستخدم فقط قبل أول اتصال بالخادم.
 */

// ===== إعدادات =====
const SERVER_URL = 'https://smartpdf-trial-server.onrender.com';
const REQUEST_TIMEOUT_MS = 60000; // خطة Render المجانية قد تستيقظ ببطء

// مدة التجربة الافتراضية محلياً (تُستخدم فقط قبل أول رد من الخادم)
const DEFAULT_TRIAL_DAYS = 7;

// مفاتيح التخزين الآمن (لا تُمسح بسهولة)
const K_START = 'spdf_trial_start_v2';     // تاريخ بدء التجربة (ms)
const K_LASTSEEN = 'spdf_trial_lastseen_v2'; // آخر وقت رأيناه (كشف رجوع الساعة)
const K_TAMPER = 'spdf_trial_tamper_v2';   // علم اكتشاف عبث بالساعة
const K_DAYS = 'spdf_trial_days_v2';       // مدة التجربة المعروفة من الخادم
const DAY_MS = 24 * 60 * 60 * 1000;

type TrialState = {
  loading: boolean;
  isTrialActive: boolean; // هل التجربة فعّالة (تفتح كل الخدمات)
  daysLeft: number;
  trialDays: number;
  checked: boolean;
  offline: boolean;       // هل تعذّر الوصول للخادم في آخر فحص
  tampered: boolean;      // هل اكتُشف عبث بساعة الجهاز
  refresh: () => Promise<void>;
};

const TrialContext = createContext<TrialState>({
  loading: true,
  isTrialActive: false,
  daysLeft: 0,
  trialDays: DEFAULT_TRIAL_DAYS,
  checked: false,
  offline: false,
  tampered: false,
  refresh: async () => {},
});

// ===== تخزين آمن مع احتياطي =====
// SecureStore هو الأساس (دائم وآمن). إن فشل، نلجأ لـ AsyncStorage.
const secureGet = async (key: string): Promise<string | null> => {
  try {
    const v = await SecureStore.getItemAsync(key);
    if (v !== null && v !== undefined) return v;
  } catch {}
  try {
    return await AsyncStorage.getItem(key);
  } catch {}
  return null;
};

const secureSet = async (key: string, value: string): Promise<void> => {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {}
  // نكتب نسخة احتياطية أيضاً
  try {
    await AsyncStorage.setItem(key, value);
  } catch {}
};

// ===== معرّف ثابت للجهاز =====
const getDeviceId = async (): Promise<string> => {
  try {
    if (Platform.OS === 'android') {
      const id = Application.getAndroidId();
      if (id) return id;
    }
    const iosId = await Application.getIosIdForVendorAsync?.();
    if (iosId) return iosId;
  } catch {}
  // احتياطي أخير: معرّف ثابت مخزّن
  let fallback = await secureGet('spdf_device_fallback_v2');
  if (!fallback) {
    fallback = `fb-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await secureSet('spdf_device_fallback_v2', fallback);
  }
  return fallback;
};

// ===== الطبقة 1+2: حساب الحالة محلياً (يعمل بلا نت) =====
// يضمن بداية فورية ويكشف العبث بالساعة.
async function computeLocalStatus(): Promise<{
  startMs: number;
  trialDays: number;
  tampered: boolean;
}> {
  const now = Date.now();

  // اقرأ المدة المعروفة (من آخر رد خادم) أو الافتراضية
  let trialDays = DEFAULT_TRIAL_DAYS;
  const daysRaw = await secureGet(K_DAYS);
  if (daysRaw) {
    const d = parseInt(daysRaw, 10);
    if (!isNaN(d) && d >= 0) trialDays = d;
  }

  // هل سبق اكتشاف عبث؟ يبقى دائماً.
  let tampered = (await secureGet(K_TAMPER)) === '1';

  // اقرأ تاريخ البدء، أو أنشئه الآن (أول فتح)
  let startMs: number;
  const startRaw = await secureGet(K_START);
  if (startRaw) {
    startMs = parseInt(startRaw, 10);
    if (isNaN(startMs)) {
      startMs = now;
      await secureSet(K_START, String(startMs));
    }
  } else {
    // أول فتح على الإطلاق => تبدأ التجربة الآن (حتى بلا إنترنت)
    startMs = now;
    await secureSet(K_START, String(startMs));
  }

  // كشف العبث بالساعة: إن كان "الآن" أقدم من آخر وقت رأيناه
  // بفارق ملموس (دقيقة سماح للفروقات الطبيعية) => رجوع للخلف => عبث.
  const lastSeenRaw = await secureGet(K_LASTSEEN);
  if (lastSeenRaw) {
    const lastSeen = parseInt(lastSeenRaw, 10);
    if (!isNaN(lastSeen) && now < lastSeen - 60 * 1000) {
      tampered = true;
      await secureSet(K_TAMPER, '1');
    }
  }
  // حدّث آخر وقت رأيناه دائماً للأمام (لا نسمح له بالرجوع)
  const prevLastSeen = lastSeenRaw ? parseInt(lastSeenRaw, 10) : 0;
  if (now > prevLastSeen) {
    await secureSet(K_LASTSEEN, String(now));
  }

  return { startMs, trialDays, tampered };
}

// تحويل تاريخ البدء إلى أيام متبقية
function daysLeftFrom(startMs: number, trialDays: number, now: number): number {
  const elapsedDays = Math.floor((now - startMs) / DAY_MS);
  return Math.max(0, trialDays - elapsedDays);
}

export function TrialProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isTrialActive, setIsTrialActive] = useState(false);
  const [daysLeft, setDaysLeft] = useState(0);
  const [trialDays, setTrialDays] = useState(DEFAULT_TRIAL_DAYS);
  const [checked, setChecked] = useState(false);
  const [offline, setOffline] = useState(false);
  const [tampered, setTampered] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
    setOffline(false);

    const now = Date.now();

    // ---- الطبقة 1+2: احسب الحالة المحلية أولاً (تعمل دائماً، بلا نت) ----
    const local = await computeLocalStatus();
    let effectiveStart = local.startMs;
    let effectiveDays = local.trialDays;
    let isTampered = local.tampered;

    // ---- الطبقة 3: حاول مزامنة الخادم (مرجع أعلى) ----
    try {
      const deviceId = await getDeviceId();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch(`${SERVER_URL}/trial/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) throw new Error(`Server ${res.status}`);
      const data = await res.json();

      // مدة التجربة من الخادم هي المرجع
      if (typeof data.trialDays === 'number' && data.trialDays >= 0) {
        effectiveDays = data.trialDays;
        await secureSet(K_DAYS, String(effectiveDays));
      }

      // تاريخ البدء من الخادم (firstSeen). نأخذ الأقدم بين المحلي والخادم
      // حتى لا تُعاد التجربة بإعادة التثبيت، ولا تُمدّد بمسح البيانات.
      const serverStartMs = parseServerStart(data);
      if (serverStartMs && serverStartMs > 0) {
        if (serverStartMs < effectiveStart) {
          effectiveStart = serverStartMs;
          await secureSet(K_START, String(effectiveStart));
        }
      }
    } catch {
      // لا إنترنت أو الخادم نائم => نكمل بالحالة المحلية (التجربة بدأت أصلاً)
      setOffline(true);
    }

    // ---- القرار النهائي ----
    let left = daysLeftFrom(effectiveStart, effectiveDays, now);
    let active = left > 0;

    // عبث بالساعة => إنهاء فوري مهما كانت الأيام
    if (isTampered) {
      active = false;
      left = 0;
    }

    setTrialDays(effectiveDays);
    setDaysLeft(left);
    setIsTrialActive(active);
    setTampered(isTampered);
    setChecked(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return (
    <TrialContext.Provider
      value={{
        loading,
        isTrialActive,
        daysLeft,
        trialDays,
        checked,
        offline,
        tampered,
        refresh: check,
      }}
    >
      {children}
    </TrialContext.Provider>
  );
}

// يستخرج تاريخ بدء التجربة من رد الخادم بمرونة
// يدعم firstSeen كـ ISO نصّي أو ms رقمي، أو يحسبه من daysLeft/trialDays.
function parseServerStart(data: any): number | null {
  try {
    if (data.firstSeen) {
      // قد يكون رقم ms أو نص ISO
      if (typeof data.firstSeen === 'number') return data.firstSeen;
      const t = Date.parse(data.firstSeen);
      if (!isNaN(t)) return t;
    }
    // احتياطي: استنتج البداية من (الآن - الأيام المنقضية)
    if (
      typeof data.daysLeft === 'number' &&
      typeof data.trialDays === 'number'
    ) {
      const elapsed = data.trialDays - data.daysLeft;
      if (elapsed >= 0) {
        return Date.now() - elapsed * DAY_MS;
      }
    }
  } catch {}
  return null;
}

export const useTrial = () => useContext(TrialContext);
