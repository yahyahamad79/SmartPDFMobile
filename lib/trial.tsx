import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

/**
 * Trial system
 * ------------
 * On app start we:
 *   1. Read a stable device id (Android ID on Android).
 *   2. Ask the server (POST /trial/check) for this device's trial status.
 *   3. Cache the result locally so the app still works briefly offline.
 *
 * The server stores the trial start date keyed by device id, so
 * reinstalling the app does NOT reset the trial.
 *
 * Free (basic) tools always work. Premium tools (e.g. Protect PDF)
 * are unlocked only while `isTrialActive` is true.
 */

const SERVER_URL = 'https://smartpdf-trial-server.onrender.com';
const CACHE_KEY = 'trial_status_cache_v1';
// مهلة الانتظار للخادم (خطة Render المجانية قد تستيقظ ببطء)
const REQUEST_TIMEOUT_MS = 60000;

type TrialState = {
  loading: boolean;
  isTrialActive: boolean; // هل التجربة فعّالة (تفتح المزايا المدفوعة)
  daysLeft: number;
  trialDays: number;
  checked: boolean;       // هل تمّ الفحص (نجح أو فشل)
  offline: boolean;       // هل تعذّر الوصول للخادم
  refresh: () => Promise<void>;
};

const TrialContext = createContext<TrialState>({
  loading: true,
  isTrialActive: false,
  daysLeft: 0,
  trialDays: 7,
  checked: false,
  offline: false,
  refresh: async () => {},
});

// قراءة معرّف ثابت للجهاز
const getDeviceId = async (): Promise<string> => {
  try {
    if (Platform.OS === 'android') {
      const id = Application.getAndroidId();
      if (id) return id;
    }
    // iOS أو احتياطي
    const iosId = await Application.getIosIdForVendorAsync?.();
    if (iosId) return iosId;
  } catch {
    // تجاهل
  }
  // احتياطي أخير: معرّف مخزّن محلياً
  let fallback = await AsyncStorage.getItem('device_fallback_id');
  if (!fallback) {
    fallback = `fb-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await AsyncStorage.setItem('device_fallback_id', fallback);
  }
  return fallback;
};

export function TrialProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isTrialActive, setIsTrialActive] = useState(false);
  const [daysLeft, setDaysLeft] = useState(0);
  const [trialDays, setTrialDays] = useState(7);
  const [checked, setChecked] = useState(false);
  const [offline, setOffline] = useState(false);

  const applyCache = async () => {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        setIsTrialActive(!!c.isTrialActive);
        setDaysLeft(c.daysLeft ?? 0);
        setTrialDays(c.trialDays ?? 7);
        return true;
      }
    } catch {}
    return false;
  };

  const check = useCallback(async () => {
    setLoading(true);
    setOffline(false);
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
      const active = data.status === 'active';
      setIsTrialActive(active);
      setDaysLeft(data.daysLeft ?? 0);
      setTrialDays(data.trialDays ?? 7);

      await AsyncStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          isTrialActive: active,
          daysLeft: data.daysLeft ?? 0,
          trialDays: data.trialDays ?? 7,
        })
      );
    } catch (e) {
      // تعذّر الوصول للخادم — نستخدم آخر حالة مخزّنة إن وُجدت
      setOffline(true);
      const had = await applyCache();
      if (!had) {
        // لا كاش: نسمح مؤقتاً (سياسة متساهلة) حتى يتصل لاحقاً
        setIsTrialActive(true);
        setDaysLeft(0);
      }
    } finally {
      setChecked(true);
      setLoading(false);
    }
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
        refresh: check,
      }}
    >
      {children}
    </TrialContext.Provider>
  );
}

export const useTrial = () => useContext(TrialContext);
