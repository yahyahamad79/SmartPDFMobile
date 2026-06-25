import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useLang } from '@/lib/i18n';
import {
  ArchiveFile,
  ToolKind,
  listArchive,
  downloadToDevice,
  shareFile,
  deleteFromArchive,
} from '@/lib/archive';

const DIR_KEY = 'download_dir_uri_v1';

const KIND_LABEL: Record<ToolKind, { key: string; tint: string; bg: string }> = {
  merge:   { key: 'toolMerge',   tint: '#a78bfa', bg: '#312e5f' },
  split:   { key: 'toolSplit',   tint: '#a78bfa', bg: '#312e5f' },
  rotate:  { key: 'toolRotate',  tint: '#a78bfa', bg: '#312e5f' },
  delete:  { key: 'toolDelete',  tint: '#a78bfa', bg: '#312e5f' },
  img2pdf: { key: 'toolImg2Pdf', tint: '#34d399', bg: '#14463a' },
  protect: { key: 'toolProtect', tint: '#fbbf24', bg: '#4a3a0c' },
  other:   { key: 'appName',     tint: '#60a5fa', bg: '#1d3a5f' },
};

function fmtSize(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

export default function FilesScreen() {
  const router = useRouter();
  const { t, isRTL } = useLang();
  const [files, setFiles] = useState<ArchiveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await listArchive();
    setFiles(list);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const rowDir = isRTL ? 'row-reverse' : 'row';

  const onDownload = async (file: ArchiveFile) => {
    setBusyId(file.name);
    try {
      const savedDir = await AsyncStorage.getItem(DIR_KEY);
      const res = await downloadToDevice(file, savedDir);
      if (res.ok) {
        if (res.dirUri) await AsyncStorage.setItem(DIR_KEY, res.dirUri);
        Alert.alert('✓', t('download') + ' — ' + file.name);
      }
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = (file: ArchiveFile) => {
    Alert.alert(t('delete'), file.name, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => { await deleteFromArchive(file); load(); },
      },
    ]);
  };

  const fileCard = (file: ArchiveFile) => {
    const meta = KIND_LABEL[file.kind] ?? KIND_LABEL.other;
    const busy = busyId === file.name;
    return (
      <View key={file.name} style={styles.card}>
        <View style={[styles.cardTop, { flexDirection: rowDir }]}>
          <View style={styles.pdfIcon}><Ionicons name="document-text" size={22} color="#f87171" /></View>
          <View style={{ flex: 1, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
            <Text style={styles.fName} numberOfLines={1}>{file.name}</Text>
            <View style={[styles.metaRow, { flexDirection: rowDir }]}>
              <View style={[styles.kindBadge, { backgroundColor: meta.bg }]}>
                <Text style={[styles.kindText, { color: meta.tint }]}>{t(meta.key)}</Text>
              </View>
              {file.protected ? <Ionicons name="lock-closed" size={11} color="#fbbf24" /> : null}
              <Text style={styles.fInfo}>{fmtSize(file.size)}</Text>
            </View>
          </View>
        </View>
        <View style={[styles.actions, { flexDirection: rowDir }]}>
          <TouchableOpacity style={styles.dlBtn} onPress={() => onDownload(file)} disabled={busy}>
            {busy ? <ActivityIndicator size="small" color="#fff" /> : (
              <>
                <Ionicons name="download-outline" size={15} color="#fff" />
                <Text style={styles.dlText}>{t('download')}</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.miniBtn} onPress={() => shareFile(file)}>
            <Ionicons name="share-social-outline" size={15} color="#94a3b8" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.miniBtn} onPress={() => onDelete(file)}>
            <Ionicons name="trash-outline" size={15} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={[styles.headerRow, { flexDirection: rowDir }]}>
          <Ionicons name="search" size={20} color="#475569" />
          <Text style={styles.title}>{t('myFiles')}</Text>
        </View>
        <Text style={[styles.subtitle, { textAlign: isRTL ? 'right' : 'left' }]}>
          {files.length > 0 ? `${files.length} ${t('filesCount')}` : t('filesSubtitle')}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#60a5fa" /></View>
      ) : files.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Ionicons name="folder-open-outline" size={44} color="#475569" /></View>
          <Text style={styles.emptyTitle}>{t('noFilesTitle')}</Text>
          <Text style={styles.emptyDesc}>{t('noFilesDesc')}</Text>
          <TouchableOpacity style={styles.browseBtn} onPress={() => router.push('/(tabs)')}>
            <Ionicons name="apps" size={18} color="#fff" />
            <Text style={styles.browseText}>{t('browseTools')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {files.map(fileCard)}
          <View style={{ height: 20 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f172a' },
  header: { padding: 18, paddingBottom: 14 },
  headerRow: { alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#fff', fontSize: 22, fontWeight: '500' },
  subtitle: { color: '#94a3b8', fontSize: 13, marginTop: 10 },
  scroll: { paddingHorizontal: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { width: 90, height: 90, borderRadius: 24, backgroundColor: '#1e293b', borderWidth: 0.5, borderColor: '#2d3a4f', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  emptyTitle: { color: '#e2e8f0', fontSize: 17, fontWeight: '500', marginBottom: 8 },
  emptyDesc: { color: '#8896a8', fontSize: 13, lineHeight: 21, textAlign: 'center', maxWidth: 250, marginBottom: 26 },
  browseBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1d4ed8', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 28 },
  browseText: { color: '#fff', fontSize: 14, fontWeight: '500' },

  card: { backgroundColor: '#1e293b', borderRadius: 14, padding: 13, marginBottom: 10, borderWidth: 0.5, borderColor: '#2d3a4f' },
  cardTop: { alignItems: 'flex-start', gap: 10 },
  pdfIcon: { width: 40, height: 46, borderRadius: 8, backgroundColor: '#3a1a1a', alignItems: 'center', justifyContent: 'center' },
  fName: { color: '#fff', fontSize: 14, fontWeight: '500' },
  metaRow: { alignItems: 'center', gap: 6, marginTop: 4 },
  kindBadge: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8 },
  kindText: { fontSize: 10 },
  fInfo: { color: '#8896a8', fontSize: 11 },
  actions: { gap: 8, marginTop: 11, paddingTop: 11, borderTopWidth: 0.5, borderTopColor: '#2d3a4f' },
  dlBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#1d4ed8', borderRadius: 9, paddingVertical: 9 },
  dlText: { color: '#fff', fontSize: 12, fontWeight: '500' },
  miniBtn: { width: 40, backgroundColor: '#283548', borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
});
