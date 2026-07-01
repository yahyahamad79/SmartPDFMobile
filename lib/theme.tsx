// ─────────────────────────────────────────────────────────────
// lib/theme.tsx
// نظام الثيمات المركزي لتطبيق Smart PDF.
// يدعم: ثيمات جاهزة + ثيمات مخصّصة ينشئها المستخدم (تُحفظ على الجهاز).
//
// الاستخدام في أي شاشة:
//   const { colors, themeId, setTheme, allThemes } = useTheme();
//   ... style={{ backgroundColor: colors.bg }}
//
// إنشاء ثيم مخصّص:
//   const { addCustomTheme } = useTheme();
//   addCustomTheme({ name, primary, dark });  // الباقي يُشتقّ تلقائياً
// ─────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext, useCallback, useContext, useEffect, useState,
} from 'react';

const STORE_KEY = 'app_theme_v1';          // معرّف الثيم المختار
const CUSTOM_KEY = 'app_custom_themes_v1';  // قائمة الثيمات المخصّصة

// ── مفاتيح الألوان التي تستخدمها كل الشاشات (لوحة موحّدة) ──
export interface ThemeColors {
  bg: string;          // خلفية الشاشة الرئيسية
  surface: string;     // خلفية البطاقات/العناصر
  surfaceAlt: string;  // خلفية ثانوية (حقول، أشرطة)
  border: string;      // حدود العناصر
  text: string;        // النص الأساسي
  textMuted: string;   // النص الثانوي/الخافت
  primary: string;     // اللون الأساسي (أزرار، تحديد)
  primaryDark: string; // درجة أغمق من الأساسي
  onPrimary: string;   // نص فوق اللون الأساسي
  accent: string;      // لون مميّز (لمسات)
  success: string;     // نجاح
  danger: string;      // خطر/حذف
  warning: string;     // تحذير
}

export interface Theme {
  id: string;
  name: { ar: string; en: string };
  dark: boolean;       // هل الثيم داكن؟ (لضبط StatusBar)
  colors: ThemeColors;
  custom?: boolean;    // هل أنشأه المستخدم؟
}

// ─────────────────────────────────────────────────────────────
// أدوات الألوان — لاشتقاق لوحة متناسقة من لون أساسي واحد
// ─────────────────────────────────────────────────────────────

// تحويل HEX -> {r,g,b}
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
    .toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

// تفتيح/تغميق لون بنسبة (amt موجب=أفتح، سالب=أغمق)
function shade(hex: string, amt: number): string {
  const { r, g, b } = hexToRgb(hex);
  if (amt >= 0) {
    return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
  }
  const k = 1 + amt;
  return rgbToHex(r * k, g * k, b * k);
}

// مزج لونين بنسبة t (0..1)
function mix(a: string, b: string, t: number): string {
  const c1 = hexToRgb(a), c2 = hexToRgb(b);
  return rgbToHex(
    c1.r + (c2.r - c1.r) * t,
    c1.g + (c2.g - c1.g) * t,
    c1.b + (c2.b - c1.b) * t,
  );
}

// سطوع نسبي (لتحديد لون النص فوق الأساسي)
function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * يشتقّ لوحة ألوان كاملة (13 لون) من لون أساسي + وضع (داكن/فاتح).
 * هذا قلب ميزة الثيم المخصّص: المستخدم يختار لوناً واحداً، والباقي متناسق.
 */
export function deriveColors(primary: string, dark: boolean): ThemeColors {
  const onPrimary = luminance(primary) > 0.55 ? '#1a1a1a' : '#ffffff';
  if (dark) {
    // خلفيات داكنة مائلة قليلاً للون الأساسي (تناسق)
    const bg = mix('#0f172a', primary, 0.05);
    return {
      bg,
      surface: mix('#1e293b', primary, 0.06),
      surfaceAlt: mix('#2d3a4f', primary, 0.08),
      border: mix('#334155', primary, 0.10),
      text: '#f1f5f9',
      textMuted: '#94a3b8',
      primary,
      primaryDark: shade(primary, -0.25),
      onPrimary,
      accent: shade(primary, 0.20),
      success: '#34d399',
      danger: '#f87171',
      warning: '#fbbf24',
    };
  }
  // وضع فاتح
  return {
    bg: mix('#f8fafc', primary, 0.05),
    surface: '#ffffff',
    surfaceAlt: mix('#f1f5f9', primary, 0.10),
    border: mix('#e2e8f0', primary, 0.12),
    text: shade(primary, -0.65),
    textMuted: '#64748b',
    primary,
    primaryDark: shade(primary, -0.25),
    onPrimary,
    accent: shade(primary, 0.15),
    success: '#10B981',
    danger: '#DC2626',
    warning: '#F97316',
  };
}

// ── الثيمات الجاهزة ──
export const THEMES: Theme[] = [
  {
    id: 'violet-dark',
    name: { ar: 'بنفسجي داكن', en: 'Violet Dark' },
    dark: true,
    colors: {
      bg: '#0f172a', surface: '#1e293b', surfaceAlt: '#2d3a4f',
      border: '#334155', text: '#f1f5f9', textMuted: '#94a3b8',
      primary: '#7C3AED', primaryDark: '#5B2C9E', onPrimary: '#ffffff',
      accent: '#8B5CF6', success: '#34d399', danger: '#f87171', warning: '#fbbf24',
    },
  },
  {
    id: 'light',
    name: { ar: 'فاتح', en: 'Light' },
    dark: false,
    colors: {
      bg: '#F4F2FA', surface: '#ffffff', surfaceAlt: '#ECE7F5',
      border: '#E5DEF2', text: '#1e293b', textMuted: '#64748b',
      primary: '#7C3AED', primaryDark: '#5B2C9E', onPrimary: '#ffffff',
      accent: '#8B5CF6', success: '#10B981', danger: '#DC2626', warning: '#F97316',
    },
  },
  {
    id: 'ocean-dark',
    name: { ar: 'أزرق محيطي', en: 'Ocean Dark' },
    dark: true,
    colors: {
      bg: '#0b1a2b', surface: '#132a42', surfaceAlt: '#1c3a58',
      border: '#22485f', text: '#e6f1ff', textMuted: '#8fb2c9',
      primary: '#0EA5E9', primaryDark: '#0369a1', onPrimary: '#ffffff',
      accent: '#38bdf8', success: '#34d399', danger: '#f87171', warning: '#fbbf24',
    },
  },
  {
    id: 'emerald-dark',
    name: { ar: 'أخضر زمردي', en: 'Emerald Dark' },
    dark: true,
    colors: {
      bg: '#0a1f1a', surface: '#12332b', surfaceAlt: '#1b4a3d',
      border: '#225747', text: '#e6fff5', textMuted: '#8fc9b5',
      primary: '#10B981', primaryDark: '#047857', onPrimary: '#ffffff',
      accent: '#34d399', success: '#34d399', danger: '#f87171', warning: '#fbbf24',
    },
  },
  {
    id: 'rose-light',
    name: { ar: 'وردي فاتح', en: 'Rose Light' },
    dark: false,
    colors: {
      bg: '#FDF2F8', surface: '#ffffff', surfaceAlt: '#FCE3EE',
      border: '#F9D0E4', text: '#831843', textMuted: '#9d5878',
      primary: '#EC4899', primaryDark: '#A62D5E', onPrimary: '#ffffff',
      accent: '#F472B6', success: '#10B981', danger: '#DC2626', warning: '#F97316',
    },
  },
];

const DEFAULT_ID = 'violet-dark';

interface ThemeCtx {
  themeId: string;
  theme: Theme;
  colors: ThemeColors;
  setTheme: (id: string) => void;
  THEMES: Theme[];              // الجاهزة فقط
  customThemes: Theme[];        // المخصّصة فقط
  allThemes: Theme[];           // الاثنتان معاً
  addCustomTheme: (opts: { name: string; primary: string; dark: boolean }) => string;
  deleteCustomTheme: (id: string) => void;
  ready: boolean;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<string>(DEFAULT_ID);
  const [customThemes, setCustomThemes] = useState<Theme[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const rawCustom = await AsyncStorage.getItem(CUSTOM_KEY);
        const customs: Theme[] = rawCustom ? JSON.parse(rawCustom) : [];
        setCustomThemes(customs);

        const saved = await AsyncStorage.getItem(STORE_KEY);
        const exists =
          THEMES.some((t) => t.id === saved) || customs.some((t) => t.id === saved);
        if (saved && exists) setThemeId(saved);
      } catch {}
      setReady(true);
    })();
  }, []);

  const setTheme = useCallback((id: string) => {
    setThemeId(id);
    AsyncStorage.setItem(STORE_KEY, id).catch(() => {});
  }, []);

  const persistCustoms = useCallback((list: Theme[]) => {
    AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(list)).catch(() => {});
  }, []);

  // إنشاء ثيم مخصّص: يشتقّ اللوحة كاملة من لون أساسي + وضع
  const addCustomTheme = useCallback(
    (opts: { name: string; primary: string; dark: boolean }): string => {
      const id = 'custom_' + Date.now();
      const theme: Theme = {
        id,
        name: { ar: opts.name || 'ثيم مخصّص', en: opts.name || 'Custom' },
        dark: opts.dark,
        colors: deriveColors(opts.primary, opts.dark),
        custom: true,
      };
      setCustomThemes((prev) => {
        const next = [...prev, theme];
        persistCustoms(next);
        return next;
      });
      // نطبّقه فوراً
      setThemeId(id);
      AsyncStorage.setItem(STORE_KEY, id).catch(() => {});
      return id;
    },
    [persistCustoms],
  );

  const deleteCustomTheme = useCallback(
    (id: string) => {
      setCustomThemes((prev) => {
        const next = prev.filter((t) => t.id !== id);
        persistCustoms(next);
        return next;
      });
      // إن كان الثيم المحذوف مختاراً، نعود للافتراضي
      setThemeId((cur) => {
        if (cur === id) {
          AsyncStorage.setItem(STORE_KEY, DEFAULT_ID).catch(() => {});
          return DEFAULT_ID;
        }
        return cur;
      });
    },
    [persistCustoms],
  );

  const allThemes = [...THEMES, ...customThemes];
  const theme =
    allThemes.find((t) => t.id === themeId) ?? THEMES[0];

  return (
    <Ctx.Provider
      value={{
        themeId, theme, colors: theme.colors, setTheme,
        THEMES, customThemes, allThemes,
        addCustomTheme, deleteCustomTheme, ready,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme must be used inside ThemeProvider');
  return v;
}
