import React from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTrial } from '@/lib/trial';

/**
 * PremiumGate — unified lock screen
 * =================================
 * Every tool in the app is premium. Wrap each tool screen's body with
 * <PremiumGate> so it is shown only while the trial is active.
 *
 * - loading            -> spinner
 * - isTrialActive      -> render the tool (children)
 * - expired / tampered -> lock screen with WhatsApp upgrade button
 *
 * Usage inside a tool screen (keep your own Header outside the gate):
 *   import PremiumGate from '@/components/LockScreen';
 *   ...
 *   {loading ? null : (
 *     <PremiumGate>
 *       ...the tool UI...
 *     </PremiumGate>
 *   )}
 *
 * Or wrap the whole body — see protect-pdf.tsx sample.
 */

const WHATSAPP_URL = 'https://wa.me/972599601769';

function openWhatsApp() {
  Linking.openURL(WHATSAPP_URL).catch(() => {});
}

export default function PremiumGate({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const { loading, isTrialActive, daysLeft, tampered, offline, refresh } =
    useTrial();

  // Checking trial status
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#60a5fa" size="large" />
        <Text style={styles.loadingText}>Checking access…</Text>
      </View>
    );
  }

  // Trial active -> show the tool
  if (isTrialActive) {
    return <>{children}</>;
  }

  // Expired or clock tampering -> lock screen
  return (
    <View style={styles.lockedBox}>
      <Text style={styles.lockIcon}>🔒</Text>
      <Text style={styles.lockTitle}>Premium feature</Text>
      {title ? <Text style={styles.toolName}>{title}</Text> : null}

      <Text style={styles.lockDesc}>
        {tampered
          ? 'We could not verify your trial period. To keep using the app, please upgrade to the full version.'
          : 'Your free trial has ended. All tools are available in the full version. Contact us to unlock everything.'}
      </Text>

      <TouchableOpacity style={styles.upgradeBtn} onPress={openWhatsApp}>
        <Text style={styles.upgradeText}>💬 Contact us to upgrade</Text>
      </TouchableOpacity>

      {offline ? (
        <TouchableOpacity style={styles.retryBtn} onPress={() => refresh()}>
          <Text style={styles.retryText}>Retry (check your connection)</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  loadingText: { color: '#94a3b8', fontSize: 14, fontWeight: '600', marginTop: 14 },

  lockedBox: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 28,
    marginTop: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  lockIcon: { fontSize: 56, marginBottom: 14 },
  lockTitle: { color: '#ffffff', fontSize: 20, fontWeight: '800', marginBottom: 6 },
  toolName: { color: '#60a5fa', fontSize: 14, fontWeight: '700', marginBottom: 10 },
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
