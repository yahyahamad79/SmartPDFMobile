import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
  ActivityIndicator,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { TrialProvider, useTrial } from '@/lib/trial';

export const unstable_settings = {
  anchor: '(tabs)',
};

const WHATSAPP_URL = 'https://wa.me/972599601769';

/**
 * PremiumGuard — البوابة المركزية
 * ================================
 * تحمي التطبيق بالكامل دفعة واحدة (كل الخدمات مدفوعة).
 * لا حاجة لتعديل أي شاشة أداة على حدة — الحماية مركزية هنا.
 *
 *  - أثناء الفحص          => مؤشّر تحميل كامل الشاشة
 *  - التجربة فعّالة        => يعرض التطبيق كاملاً (كل الشاشات)
 *  - التجربة منتهية/عبث    => شاشة قفل تحجب التطبيق كله
 */
function PremiumGuard({ children }: { children: React.ReactNode }) {
  const { loading, isTrialActive, tampered, offline, refresh } = useTrial();

  // أثناء الفحص الأول
  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#60a5fa" />
        <Text style={styles.splashText}>Checking access…</Text>
      </View>
    );
  }

  // التجربة فعّالة — اعرض التطبيق كاملاً
  if (isTrialActive) {
    return <>{children}</>;
  }

  // التجربة منتهية أو عبث بالساعة — قفل كامل
  return (
    <SafeAreaView style={styles.lockRoot}>
      <ScrollView contentContainerStyle={styles.lockScroll}>
        <View style={styles.lockedBox}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.lockTitle}>Smart PDF — Premium</Text>
          <Text style={styles.lockDesc}>
            {tampered
              ? 'We could not verify your trial period. To keep using the app, please upgrade to the full version.'
              : 'Your free trial has ended. The full version unlocks all PDF tools. Contact us to upgrade and continue.'}
          </Text>

          <TouchableOpacity
            style={styles.upgradeBtn}
            onPress={() => Linking.openURL(WHATSAPP_URL).catch(() => {})}
          >
            <Text style={styles.upgradeText}>💬 Contact us to upgrade</Text>
          </TouchableOpacity>

          {offline ? (
            <TouchableOpacity style={styles.retryBtn} onPress={() => refresh()}>
              <Text style={styles.retryText}>Retry (check your connection)</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <TrialProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <PremiumGuard>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
        </PremiumGuard>
        <StatusBar style="auto" />
      </ThemeProvider>
    </TrialProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  splashText: { color: '#94a3b8', fontSize: 14, fontWeight: '600', marginTop: 14 },

  lockRoot: { flex: 1, backgroundColor: '#0f172a' },
  lockScroll: { flexGrow: 1, justifyContent: 'center', padding: 16 },

  lockedBox: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  lockIcon: { fontSize: 56, marginBottom: 14 },
  lockTitle: { color: '#ffffff', fontSize: 22, fontWeight: '800', marginBottom: 10 },
  lockDesc: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 22,
  },
  upgradeBtn: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  upgradeText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
  retryBtn: { marginTop: 16, paddingVertical: 8, paddingHorizontal: 16 },
  retryText: { color: '#60a5fa', fontSize: 13, fontWeight: '700' },
});
