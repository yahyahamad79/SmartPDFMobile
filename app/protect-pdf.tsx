import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { PDFDocument } from '@cantoo/pdf-lib';
import { readPdfBytes, bytesToBase64 } from '@/lib/pdfBytes';
import React, { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLang } from '@/lib/i18n';
import { useTheme, ThemeColors } from '@/lib/theme';
import { saveToArchive } from '@/lib/archive';

/**
 * Protect PDF — encrypts a PDF with a password (on-device).
 * Trial/premium gating is handled centrally in app/_layout.tsx
 * (PremiumGuard), so this screen contains no trial logic at all.
 */

type PickedFile = {
  uri: string;
  name: string;
  size?: number;
  pageCount: number;
};

export default function ProtectPdfScreen() {
  const router = useRouter();
  const { t, isRTL } = useLang();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [outputName, setOutputName] = useState('protected');


  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const a = result.assets[0];
      const srcBytes = await readPdfBytes(a.uri);
      const doc = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
      setFile({
        uri: a.uri,
        name: a.name,
        size: a.size ?? undefined,
        pageCount: doc.getPageCount(),
      });
      setOutputName((a.name || 'protected').replace(/\.pdf$/i, '') + '_protected');
    } catch (e) {
      Alert.alert(t('error'), t('couldNotRead'));
    }
  };

  const clearFile = () => setFile(null);

  const finalFileName = () => {
    let n = outputName.trim();
    if (!n) n = 'protected';
    n = n.replace(/[\\/:*?"<>|]/g, '_');
    if (!n.toLowerCase().endsWith('.pdf')) n += '.pdf';
    return n;
  };

  const saveOutput = async (base64: string, fileName: string) => {
    if (Platform.OS === 'android') {
      const perm =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('cancelled'), t('noFolderSaved'));
        return false;
      }
      const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
        perm.directoryUri,
        fileName,
        'application/pdf'
      );
      await FileSystem.writeAsStringAsync(destUri, base64, { encoding: 'base64' });
      Alert.alert(t('done'), fileName);
      return true;
    } else {
      const outUri = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(outUri, base64, { encoding: 'base64' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(outUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save or share protected PDF',
        });
      } else {
        Alert.alert(t('done'), t('savedToArchive'));
      }
      return true;
    }
  };

  const protect = async () => {
    if (!file) {
      Alert.alert(t('noFile'), t('noFilePick'));
      return;
    }
    if (password.length < 4) {
      Alert.alert(t('protectWeakT'), t('protectWeak'));
      return;
    }
    if (password !== confirm) {
      Alert.alert(t('protectMismatchT'), t('protectMismatch'));
      return;
    }

    setBusy(true);
    try {
      const srcBytes = await readPdfBytes(file.uri);
      const doc = await PDFDocument.load(srcBytes, { ignoreEncryption: true });

      // @ts-ignore
      doc.encrypt({
        userPassword: password,
        ownerPassword: password,
        permissions: { modifying: false, copying: false, annotating: false },
      });

      const bytes = await doc.save({ useObjectStreams: false });
      const encryptedBase64 = bytesToBase64(bytes);

      const __s = await saveToArchive(encryptedBase64, finalFileName(), 'protect', { protected: true });
      if (__s) { router.push({ pathname: '/result', params: { name: __s.name, uri: __s.uri, size: String(__s.size), kind: __s.kind } }); setPassword(''); setConfirm(''); setBusy(false); return; }
      await saveOutput(encryptedBase64, finalFileName());
      setPassword('');
      setConfirm('');
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'Unknown error';
      Alert.alert(t('protectFailed'), msg);
      console.log('PROTECT ERROR:', e);
    } finally {
      setBusy(false);
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
  };

  const canRun =
    !!file && !busy && password.length >= 4 && password === confirm;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>{isRTL ? '›' : '‹'} {t('back')}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('protectTitle')}</Text>
          <Text style={styles.subtitle}>
            Pick a PDF and set a password to encrypt it — all on your device.
          </Text>
        </View>

        {/* Pick button */}
        <TouchableOpacity style={styles.pickBtn} onPress={pickFile} disabled={busy}>
          <Ionicons name="folder-open-outline" size={26} color={colors.primary} style={{ marginBottom: 6 }} />
          <Text style={styles.pickText}>{file ? t('pickPdfDiff') : t('pickPdf')}</Text>
        </TouchableOpacity>

        {file && (
          <>
            <View style={styles.fileCard}>
              <View style={styles.fileRow}>
                <TouchableOpacity onPress={clearFile} disabled={busy}>
                  <Ionicons name="close" size={15} color={colors.danger} />
                </TouchableOpacity>
                <Text style={styles.fileSize}>
                  {formatSize(file.size)} · {file.pageCount} pages
                </Text>
                <Text style={styles.fileName} numberOfLines={1}>
                  {file.name}
                </Text>
              </View>
            </View>

            <View style={styles.optionsBox}>
              <Text style={styles.optLabel}>{t('protectPassword')}</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPass}
                editable={!busy}
                autoCapitalize="none"
              />
              <Text style={[styles.optLabel, { marginTop: 12 }]}>
                {t('protectConfirm')}
              </Text>
              <TextInput
                style={styles.input}
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Re-enter password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPass}
                editable={!busy}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.showRow}
                onPress={() => setShowPass((s) => !s)}
                disabled={busy}
              >
                <Text style={styles.showText}>
                  {showPass ? '🙈 Hide password' : '👁️ Show password'}
                </Text>
              </TouchableOpacity>
              {confirm.length > 0 && password !== confirm && (
                <Text style={styles.warn}>Passwords do not match.</Text>
              )}
            </View>

            <View style={styles.optionsBox}>
              <Text style={styles.optLabel}>{t('outputName')}</Text>
              <View style={styles.nameRow}>
                <TextInput
                  style={styles.input}
                  value={outputName}
                  onChangeText={setOutputName}
                  placeholder="protected"
                  placeholderTextColor={colors.textMuted}
                  editable={!busy}
                  autoCapitalize="none"
                />
                <Text style={styles.ext}>.pdf</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.actionBtn, !canRun && styles.actionBtnDisabled]}
              onPress={protect}
              disabled={!canRun}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionText}>
                  🔒 Protect & {Platform.OS === 'android' ? 'Save' : 'Share'}
                </Text>
              )}
            </TouchableOpacity>

            <Text style={styles.note}>
              You'll need this password to open the PDF. Keep it safe — it can't be
              recovered.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}


const makeStyles = (c: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: 16 },

  header: { paddingVertical: 12 },
  backBtn: { marginBottom: 8 },
  backText: { color: c.primary, fontSize: 16, fontWeight: '700' },
  title: { fontSize: 26, fontWeight: '800', color: c.surface },
  subtitle: { fontSize: 13, color: c.textMuted, marginTop: 6, lineHeight: 19 },

  pickBtn: {
    borderWidth: 2,
    borderColor: c.primary,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 28,
    alignItems: 'center',
    backgroundColor: c.surface,
    marginTop: 16,
    marginBottom: 18,
  },
  pickIcon: { fontSize: 32, marginBottom: 6 },
  pickText: { color: c.textMuted, fontWeight: '700', fontSize: 14 },

  fileCard: {
    backgroundColor: c.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: c.surfaceAlt,
  },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  removeBtn: { color: c.danger, fontWeight: '800', fontSize: 14 },
  fileSize: { color: c.textMuted, fontSize: 11, fontWeight: '700' },
  fileName: { flex: 1, color: c.text, fontSize: 13, fontWeight: '600', textAlign: 'right' },

  optionsBox: {
    backgroundColor: c.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: c.surfaceAlt,
  },
  optLabel: { color: c.text, fontWeight: '800', fontSize: 13, marginBottom: 8 },
  input: {
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: c.surface,
    fontSize: 15,
    fontWeight: '700',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ext: { color: c.textMuted, fontSize: 14, fontWeight: '700' },
  showRow: { marginTop: 12 },
  showText: { color: c.primary, fontSize: 13, fontWeight: '700' },
  warn: { color: c.danger, fontSize: 12, fontWeight: '700', marginTop: 10 },

  actionBtn: {
    backgroundColor: c.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  actionBtnDisabled: { opacity: 0.5 },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  note: { color: c.textMuted, fontSize: 12, textAlign: 'center', marginTop: 14, lineHeight: 17 },
});
