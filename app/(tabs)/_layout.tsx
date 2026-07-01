import { useLang } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
/**
 * التبويبات السفلية الثلاث: الأدوات / الملفات / الإعدادات.
 * بألوان الهوية الداكنة، والعناوين تتبع اللغة المختارة.
 *
 * أسماء الملفات داخل (tabs):
 *   index.tsx    -> الأدوات
 *   files.tsx    -> الملفات
 *   settings.tsx -> الإعدادات
 */
export default function TabLayout() {
  const { t } = useLang();
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
          height: 62,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabTools'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="apps" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="files"
        options={{
          title: t('tabFiles'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="folder-outline" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabSettings'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size ?? 22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
