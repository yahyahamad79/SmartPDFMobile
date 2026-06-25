import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useLang } from '@/lib/i18n';
import { ArchiveFile, ToolKind, downloadToDevice } from '@/lib/archive';

const DIR_KEY = 'download_dir_uri_v1';

/**
 * شاشة النتيجة الموحّدة.
 * تستقبل عبر params: name, uri, size, kind (للملف الناتج المحفوظ في الأرشيف).
 * كل أداة، بعد saveToArchive، توجّه هنا:
 *   router.push({ pathname: '/result', params: { name, uri, size, kind } });
 */
export default function ResultScreen() {
  const router = useRouter();
  const { t, isRTL } = useLang();
  const params = useLocalSearchParams<{ name?: string; uri?: string; size?: string; kind?: string }>();
  const [busy, setBusy] = useState(false);

  const file: ArchiveFile = {
    name: params.name || 'file.pdf',
    uri: params.uri || '',
    size: params.size ? parseInt(params.size, 10) : 0,
    createdAt: Date.now(),
    kind: (params.kind as ToolKind) || 'other',
  };

  const rowDir = isRTL ? 'row-reverse' : 'row';

  const onDownload = async () => {
    setBusy(true);
    try {
      const savedDir = await AsyncStorage.getItem(DIR_KEY);
      const res = await downloadToDevice(file, savedDir);
      if (res.ok) {
        if (res.dirUri) await AsyncStorage.setItem(DIR_KEY, res.dirUri);
        Alert.alert('✓', t('download') + ' — ' + file.name);
      }
    } finally {
      setBusy(false);
    }
  };

  const onShare = async () => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: file.name });
      }
    } catch {}
  };

  const fmtSize = (b: number) => {
    if (!b) return '';
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(2)} MB`;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <View style={styles.checkCircle}>
          <Ionicons name="checkmark" size={44} color="#34d399" />
        </View>
        <Text style={styles.doneTitle}>{t('done')}</Text>
        <Text style={styles.savedNote}>{t('savedToArchive')}</Text>

        <View style={styles.fileBox}>
          <View style={[styles.fileRow, { flexDirection: rowDir }]}>
            <View style={styles.pdfIcon}><Ionicons name="document-text" size={24} color="#f87171" /></View>
            <View style={{ flex: 1, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
              <Text style={styles.fName} numberOfLines={1}>{file.name}</Text>
              <Text style={styles.fSize}>{fmtSize(file.size)}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={onDownload} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="download-outline" size={18} color="#fff" />
              <Text style={styles.primaryText}>{t('download')}</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={[styles.secondaryRow, { flexDirection: rowDir }]}>
          <TouchableOpacity style={styles.secBtn} onPress={onShare}>
            <Ionicons name="share-social-outline" size={17} color="#cbd5e1" />
            <Text style={styles.secText}>{t('share')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secBtn} onPress={() => router.replace('/(tabs)')}>
            <Ionicons name="apps-outline" size={17} color="#cbd5e1" />
            <Text style={styles.secText}>{t('backToTools')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  checkCircle: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#14463a', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  doneTitle: { color: '#fff', fontSize: 20, fontWeight: '500', marginBottom: 6 },
  savedNote: { color: '#8896a8', fontSize: 13, marginBottom: 28 },
  fileBox: { width: '100%', maxWidth: 360, backgroundColor: '#1e293b', borderRadius: 14, padding: 14, borderWidth: 0.5, borderColor: '#2d3a4f', marginBottom: 24 },
  fileRow: { alignItems: 'center', gap: 12 },
  pdfIcon: { width: 42, height: 48, borderRadius: 8, backgroundColor: '#3a1a1a', alignItems: 'center', justifyContent: 'center' },
  fName: { color: '#fff', fontSize: 14, fontWeight: '500' },
  fSize: { color: '#8896a8', fontSize: 12, marginTop: 3 },
  primaryBtn: { width: '100%', maxWidth: 360, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1d4ed8', borderRadius: 12, paddingVertical: 15, marginBottom: 12 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '500' },
  secondaryRow: { width: '100%', maxWidth: 360, gap: 10 },
  secBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1e293b', borderRadius: 12, paddingVertical: 13, borderWidth: 0.5, borderColor: '#2d3a4f' },
  secText: { color: '#cbd5e1', fontSize: 13, fontWeight: '500' },
});
