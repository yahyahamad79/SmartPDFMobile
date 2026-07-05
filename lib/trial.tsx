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
 * نظام تجربة هجين قوي — مدة ثابتة 3 أيام
 * =======================================
 * القاعدة:
 *   - مدة التجربة ثابتة في الكود (TRIAL_DAYS = 3). لا تأتي من الخادم.
 *   - التجربة تبدأ من أول فتح وتُحسب من تاريخ البدء — حتى بلا إنترنت.
 *   - الخادم يحفظ تاريخ البدء لكل جهاز (Android ID) ويُستخدم لـ:
 *       (أ) منع إعادة التثبيت من تصفير التجربة (نأخذ الأقدم).
 *       (ب) طبقة تحقق إضافية.
 *   - القفل يحدث فقط حين تمرّ 3 أيام حقيقية على الجهاز.
 *   - فتح النت لا يقفل مستخدماً بدأ حديثاً — فقط يصحّح تاريخ بدئه.
 *
 * الحماية:
 *   - بداية فورية محلية (SecureStore) تعمل بلا نت.
 *   - كشف العبث بالساعة (رجوع الوقت للخلف => إنهاء فوري).
 *   - مزامنة الخادم تأخذ الأقدم بين المحلي والخادم.
 */

// ===== إعدادات =====
const SERVER_URL = 'https://smartpdf-trial-server.onrender.com';
const REQUEST_TIMEOUT_MS = 60000;

// مدة التجربة ثابتة في الكود (لا تأتي من الخادم)
const TRIAL_DAYS = 7;

// مفاتيح التخزين الآمن
const K_START = 'spdf_trial_start_v3';      // تاريخ بدء التجربة (ms)
const K_LASTSEEN = 'spdf_trial_lastseen_v3'; // آخر وقت رأيناه (كشف رجوع الساعة)
const K_TAMPER = 'spdf_trial_tamper_v3';    // علم اكتشاف عبث بالساعة
const DAY_MS = 24 * 60 * 60 * 1000;

type TrialState = {
  loading: boolean;
  isTrialActive: boolean;
  daysLeft: number;
  trialDays: number;
  checked: boolean;
  offline: boolean;
  tampered: boolean;
  refresh: () => Promise<void>;
};

const TrialContext = createContext<TrialState>({
  loading: true,
  isTrialActive: false,
  daysLeft: 7,
  trialDays: TRIAL_DAYS,
  checked: false,
  offline: false,
  tampered: false,
  refresh: async () => {},
});

// ===== تخزين آمن مع احتياطي =====
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
  let fallback = await secureGet('spdf_device_fallback_v3');
  if (!fallback) {
    fallback = `fb-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await secureSet('spdf_device_fallback_v3', fallback);
  }
  return fallback;
};

// ===== الطبقة المحلية: تاريخ البدء + كشف العبث (تعمل بلا نت) =====
async function computeLocalStart(): Promise<{
  startMs: number;
  tampered: boolean;
}> {
  const now = Date.now();

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

  // كشف العبث بالساعة: إن رجع "الآن" خلف آخر وقت رأيناه (بدقيقة سماح)
  const lastSeenRaw = await secureGet(K_LASTSEEN);
  if (lastSeenRaw) {
    const lastSeen = parseInt(lastSeenRaw, 10);
    if (!isNaN(lastSeen) && now < lastSeen - 60 * 1000) {
      tampered = true;
      await secureSet(K_TAMPER, '1');
    }
  }
  // حدّث آخر وقت رأيناه للأمام فقط
  const prevLastSeen = lastSeenRaw ? parseInt(lastSeenRaw, 10) : 0;
  if (now > prevLastSeen) {
    await secureSet(K_LASTSEEN, String(now));
  }

  return { startMs, tampered };
}

// الأيام المتبقية من تاريخ البدء (المدة ثابتة TRIAL_DAYS)
function daysLeftFrom(startMs: number, now: number): number {
  const elapsedDays = Math.floor((now - startMs) / DAY_MS);
  return Math.max(0, TRIAL_DAYS - elapsedDays);
}

export function TrialProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isTrialActive, setIsTrialActive] = useState(false);
  const [daysLeft, setDaysLeft] = useState(0);
  const [checked, setChecked] = useState(false);
  const [offline, setOffline] = useState(false);
  const [tampered, setTampered] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
    setOffline(false);

    const now = Date.now();

    // ---- الطبقة المحلية: احتياطية فقط (عند انقطاع النت) ----
    const local = await computeLocalStart();
    let effectiveStart = local.startMs;
    let isTampered = local.tampered;

    // القيم النهائية — الأولوية للخادم
    let left: number;
    let active: boolean;
    let gotServer = false;

    // ---- الخادم مصدر الحقيقة: يقرّر المدة والأيام المتبقية ----
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

      // الخادم يرسل daysLeft/days_remaining + expired — نطيعه مباشرة
      const serverDays =
        typeof data.daysLeft === 'number' ? data.daysLeft
        : typeof data.days_remaining === 'number' ? data.days_remaining
        : null;

      if (serverDays !== null) {
        left = serverDays;
        active = !data.expired && serverDays > 0;
        gotServer = true;

        // نحفظ تاريخ بدء الخادم محلياً (للاحتياطي عند انقطاع النت لاحقاً)
        const serverStartMs = parseServerStart(data);
        if (serverStartMs && serverStartMs > 0) {
          effectiveStart = serverStartMs;
          await secureSet(K_START, String(effectiveStart));
        }
      }
    } catch {
      setOffline(true);
    }

    // ---- احتياطي: إن لم يرد الخادم، نستخدم الحساب المحلي ----
    if (!gotServer) {
      left = daysLeftFrom(effectiveStart, now);
      active = left > 0;
      // كشف العبث بالساعة يُطبّق فقط في الوضع المحلي (بلا خادم)
      if (isTampered) {
        active = false;
        left = 0;
      }
    } else {
      // الخادم مصدر الحقيقة: إن قال "فعّالة" نفتح ونمسح أي علامة عبث قديمة.
      // (كشف العبث المحلي احتياطي فقط، لا يتجاوز قرار الخادم.)
      if (active) {
        isTampered = false;
        await secureSet(K_TAMPER, '0');
      }
    }

    setDaysLeft(left!);
    setIsTrialActive(active!);
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
        trialDays: TRIAL_DAYS,
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
function parseServerStart(data: any): number | null {
  try {
    // الخادم يرسل firstSeen و started_at (ISO). نقبل الاثنين.
    const iso = data.firstSeen || data.started_at;
    if (iso) {
      if (typeof iso === 'number') return iso;
      const t = Date.parse(iso);
      if (!isNaN(t)) return t;
    }
  } catch {}
  return null;
}

export const useTrial = () => useContext(TrialContext);
