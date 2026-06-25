import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Linking,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useLang } from '@/lib/i18n';
import { useTrial } from '@/lib/trial';
import { clearArchive } from '@/lib/archive';

const WHATSAPP_URL = 'https://wa.me/972599601769';
const PRIVACY_URL = 'https://yahyahamad79.github.io/smartpdf-privacy/';
const DIR_KEY = 'download_dir_uri_v1';

export default function SettingsScreen() {
  const router = useRouter();
  const { t, lang, isRTL, toggleLang } = useLang();
  const { isTrialActive, daysLeft, tampered } = useTrial();
  const [dirLabel, setDirLabel] = useState<string>('Downloads/SmartPDF');

  const rowDir = isRTL ? 'row-reverse' : 'row';

  const pickFolder = async () => {
    try {
      const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (perm.granted) {
        await AsyncStorage.setItem(DIR_KEY, perm.directoryUri);
        const parts = decodeURIComponent(perm.directoryUri).split(/[:/]/);
        setDirLabel(parts[parts.length - 1] || 'Selected folder');
      }
    } catch {}
  };

  const confirmClear = () => {
    Alert.alert(t('clearTitle'), t('clearWarning'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          await clearArchive();
          Alert.alert('✓', t('clearAll'));
        },
      },
    ]);
  };

  const openWhatsApp = () => Linking.openURL(WHATSAPP_URL).catch(() => {});
  const openPrivacy = () => Linking.openURL(PRIVACY_URL).catch(() => {});
  const shareApp = () =>
    Share.share({ message: 'Smart PDF — ' + WHATSAPP_URL }).catch(() => {});

  const statusActive = isTrialActive && !tampered;

  const navRow = (
    labelKey: string,
    icon: keyof typeof Ionicons.glyphMap,
    color: string,
    onPress: () => void,
    last = false,
    valueText?: string,
    danger = false,
  ) => (
    <TouchableOpacity
      style={[styles.row, { flexDirection: rowDir }, !last && styles.rowBorder]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[{ flexDirection: rowDir }, styles.rowEnd]}>
        {valueText ? <Text style={styles.rowValue}>{valueText}</Text> : null}
        <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color="#475569" />
      </View>
      <View style={[styles.rowStart, { flexDirection: rowDir }]}>
        <Text style={[styles.rowLabel, danger && { color: '#f87171' }]}>{t(labelKey)}</Text>
        <Ionicons name={icon} size={19} color={color} />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{t('settings')}</Text>

        {/* بطاقة التجربة */}
        <View style={styles.trialCard}>
          <View style={[styles.trialTop, { flexDirection: rowDir }]}>
            <View style={[styles.statusBadge, { backgroundColor: statusActive ? '#14463a' : '#3a1a1a' }]}>
              <Text style={[styles.statusText, { color: statusActive ? '#34d399' : '#f87171' }]}>
                {statusActive ? t('active') : t('ended')}
              </Text>
            </View>
            <View style={{ alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
              <Text style={styles.trialName}>{t('trialVersion')}</Text>
              {statusActive ? (
                <Text style={styles.trialDays}>{t('daysLeftLabel')} {daysLeft} {t('daysWord')}</Text>
              ) : null}
            </View>
          </View>
          <TouchableOpacity style={styles.upgradeBtn} onPress={openWhatsApp}>
            <Ionicons name="diamond-outline" size={17} color="#fff" />
            <Text style={styles.upgradeText}>{t('upgradeFull')}</Text>
          </TouchableOpacity>
        </View>

        {/* عام */}
        <Text style={[styles.groupLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('general')}</Text>
        <View style={styles.group}>
          {navRow('language', 'language-outline', '#60a5fa', toggleLang, false, lang === 'ar' ? 'عربي ⇄ EN' : 'EN ⇄ عربي')}
          {navRow('downloadFolder', 'folder-outline', '#60a5fa', pickFolder, true, dirLabel)}
        </View>

        {/* إدارة الملفات */}
        <Text style={[styles.groupLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('storageMgmt')}</Text>
        <View style={styles.group}>
          {navRow('clearAll', 'trash-outline', '#f87171', confirmClear, true, undefined, true)}
        </View>

        {/* حول ودعم */}
        <Text style={[styles.groupLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('aboutSupport')}</Text>
        <View style={styles.group}>
          {navRow('rateApp', 'star-outline', '#fbbf24', () => {}, false)}
          {navRow('shareApp', 'share-social-outline', '#34d399', shareApp, false)}
          {navRow('contactUs', 'logo-whatsapp', '#25D366', openWhatsApp, false)}
          {navRow('privacyPolicy', 'shield-checkmark-outline', '#60a5fa', openPrivacy, true)}
        </View>

        <Text style={styles.versionText}>{t('version')} 1.0.2</Text>
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f172a' },
  scroll: { padding: 16 },
  title: { color: '#fff', fontSize: 22, fontWeight: '500', marginVertical: 10 },

  trialCard: { backgroundColor: '#1e293b', borderRadius: 16, padding: 16, borderWidth: 0.5, borderColor: '#2d3a4f', marginBottom: 20 },
  trialTop: { alignItems: 'center', justifyContent: 'space-between' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '500' },
  trialName: { color: '#fff', fontSize: 15, fontWeight: '500' },
  trialDays: { color: '#8896a8', fontSize: 12, marginTop: 3 },
  upgradeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1d4ed8', borderRadius: 11, paddingVertical: 12, marginTop: 14 },
  upgradeText: { color: '#fff', fontSize: 14, fontWeight: '500' },

  groupLabel: { color: '#64748b', fontSize: 11, fontWeight: '500', marginBottom: 8, paddingHorizontal: 4 },
  group: { backgroundColor: '#1e293b', borderRadius: 14, borderWidth: 0.5, borderColor: '#2d3a4f', marginBottom: 20, overflow: 'hidden' },
  row: { alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: '#2d3a4f' },
  rowStart: { alignItems: 'center', gap: 11 },
  rowEnd: { alignItems: 'center', gap: 8 },
  rowLabel: { color: '#fff', fontSize: 14 },
  rowValue: { color: '#8896a8', fontSize: 12 },

  versionText: { color: '#475569', fontSize: 11, textAlign: 'center' },
});
