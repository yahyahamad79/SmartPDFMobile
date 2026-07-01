// ─────────────────────────────────────────────────────────────
// lib/theme.tsx
// نظام الثيمات المركزي لتطبيق Smart PDF.
// يقلّد بنية i18n.tsx: Context + AsyncStorage + hook.
//
// الاستخدام في أي شاشة:
//   const { colors, themeId, setTheme, THEMES } = useTheme();
//   ... style={{ backgroundColor: colors.bg }}
//
// كل شاشة تبني أنماطها ديناميكياً من colors (لا StyleSheet ثابت للألوان).
// ─────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext, useCallback, useContext, useEffect, useState,
} from 'react';

const STORE_KEY = 'app_theme_v1';

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
      border: '#22574733', text: '#e6fff5', textMuted: '#8fc9b5',
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
const getTheme = (id: string): Theme =>
  THEMES.find((t) => t.id === id) ?? THEMES[0];

interface ThemeCtx {
  themeId: string;
  theme: Theme;
  colors: ThemeColors;
  setTheme: (id: string) => void;
  THEMES: Theme[];
  ready: boolean;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<string>(DEFAULT_ID);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORE_KEY);
        if (saved && THEMES.some((t) => t.id === saved)) setThemeId(saved);
      } catch {}
      setReady(true);
    })();
  }, []);

  const setTheme = useCallback((id: string) => {
    setThemeId(id);
    AsyncStorage.setItem(STORE_KEY, id).catch(() => {});
  }, []);

  const theme = getTheme(themeId);

  return (
    <Ctx.Provider
      value={{ themeId, theme, colors: theme.colors, setTheme, THEMES, ready }}
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
