import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTrial } from '../lib/trial';

/**
 * TrialBanner — shows the current trial status on the home screen.
 *   - While active: "Trial — N days left"
 *   - When expired: "Trial ended — Upgrade" (opens WhatsApp)
 *   - While loading: a subtle checking line
 *
 * Adjust the import path to wherever you placed trial.tsx.
 */

const WHATSAPP_URL = 'https://wa.me/972599601769';

export default function TrialBanner() {
  const { loading, isTrialActive, daysLeft, trialDays, offline } = useTrial();

  const openWhatsApp = () => Linking.openURL(WHATSAPP_URL);

  if (loading) {
    return (
      <View style={[styles.box, styles.boxNeutral]}>
        <Text style={styles.neutralText}>Checking trial status…</Text>
      </View>
    );
  }

  if (isTrialActive) {
    return (
      <View style={[styles.box, styles.boxActive]}>
        <Text style={styles.activeText}>
          ⭐ Trial active — {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
          {offline ? ' (offline)' : ''}
        </Text>
        <Text style={styles.activeSub}>
          All premium features unlocked ({trialDays}-day trial)
        </Text>
      </View>
    );
  }

  // expired
  return (
    <TouchableOpacity style={[styles.box, styles.boxExpired]} onPress={openWhatsApp}>
      <Text style={styles.expiredText}>🔒 Trial ended</Text>
      <Text style={styles.expiredSub}>
        Tap to contact us and unlock premium features
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
  },
  boxNeutral: { backgroundColor: '#1e293b', borderColor: '#334155' },
  neutralText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },

  boxActive: { backgroundColor: '#14532d', borderColor: '#22c55e' },
  activeText: { color: '#dcfce7', fontSize: 14, fontWeight: '800' },
  activeSub: { color: '#86efac', fontSize: 11.5, marginTop: 3, fontWeight: '600' },

  boxExpired: { backgroundColor: '#3b1d1d', borderColor: '#f87171' },
  expiredText: { color: '#fecaca', fontSize: 14, fontWeight: '800' },
  expiredSub: { color: '#fca5a5', fontSize: 11.5, marginTop: 3, fontWeight: '600' },
});
