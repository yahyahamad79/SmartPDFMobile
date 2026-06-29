// ─────────────────────────────────────────────────────────────
// lib/useServerWarmup.ts
// إيقاظ استباقي خفيف لخادم Render (الذي ينام بعد الخمول).
//
// السلوك:
//  • ping واحد عند فتح التطبيق (أول mount).
//  • ping واحد عند عودة التطبيق من الخلفية إلى المقدّمة.
//  • لا تكرار دوري — لا هدر بطارية، ولا إبقاء صناعي للخادم.
//  • صامت تماماً: لا يؤثر على الواجهة ولا يُظهر أخطاء للمستخدم.
//
// الاستخدام: استدعِه مرة واحدة في الجذر (app/_layout.tsx):
//    useServerWarmup();
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { SERVER_URL as SERVER } from '@/lib/config';

// مهلة كل محاولة ping (قصيرة — مجرد إيقاظ، لا ننتظر النتيجة)
const PING_TIMEOUT = 12_000;

// لا نُعيد الإيقاظ إن مرّ وقت قصير فقط منذ آخر ping ناجح
// (الخادم يبقى مستيقظاً ~١٥ دقيقة على Render؛ نتحفّظ بنصفها)
const SKIP_IF_RECENT_MS = 7 * 60 * 1000; // 7 دقائق

async function pingOnce(): Promise<boolean> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), PING_TIMEOUT);
  try {
    const r = await fetch(`${SERVER}/`, {
      method: 'GET',
      signal: controller.signal,
    });
    return r.ok;
  } catch {
    // فشل ping لا يهم — الخادم سيُوقَظ لاحقاً عند الحاجة الفعلية
    return false;
  } finally {
    clearTimeout(id);
  }
}

export function useServerWarmup() {
  const lastPingRef = useRef<number>(0);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  // محاولة إيقاظ مع تجنّب التكرار القريب
  const warmUp = async () => {
    const now = Date.now();
    if (now - lastPingRef.current < SKIP_IF_RECENT_MS) return;
    lastPingRef.current = now;
    await pingOnce();
  };

  useEffect(() => {
    // ① ping عند فتح التطبيق
    warmUp();

    // ② ping عند العودة من الخلفية
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appState.current;
      appState.current = next;
      // من خلفية/غير-نشط → نشط
      if (
        (prev === 'background' || prev === 'inactive') &&
        next === 'active'
      ) {
        warmUp();
      }
    });

    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
