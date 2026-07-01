import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useLang } from '@/lib/i18n';
import { useTrial } from '@/lib/trial';
import { clearArchive } from '@/lib/archive';
import { useTheme, ThemeColors, deriveColors } from '@/lib/theme';

const WHATSAPP_URL = 'https://wa.me/972599601769';
const PRIVACY_URL = 'https://yahyahamad79.github.io/smartpdf-privacy/';
const DIR_KEY = 'download_dir_uri_v1';

export default function SettingsScreen() {
  const router = useRouter();
  const { t, lang, isRTL, toggleLang } = useLang();
  const { isTrialActive, daysLeft, tampered } = useTrial();
  const { colors, themeId, setTheme, allThemes, addCustomTheme, deleteCustomTheme } = useTheme();
  const [dirLabel, setDirLabel] = useState<string>('Downloads/SmartPDF');

  // حالة نافذة إنشاء ثيم مخصّص
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#7C3AED');
  const [newDark, setNewDark] = useState(true);

  // ألوان جاهزة للاختيار السريع عند إنشاء ثيم
  const PALETTE = [
    '#7C3AED', '#EC4899', '#EF4444', '#F97316', '#F59E0B',
    '#10B981', '#14B8A6', '#0EA5E9', '#3B82F6', '#6366F1',
    '#8B5CF6', '#A855F7',
  ];

  const createTheme = () => {
    addCustomTheme({ name: newName.trim() || (isRTL ? 'ثيم مخصّص' : 'Custom'), primary: newColor, dark: newDark });
    setShowCreate(false);
    setNewName('');
    setNewColor('#7C3AED');
    setNewDark(true);
  };

  const confirmDeleteTheme = (id: string, name: string) => {
    Alert.alert(
      isRTL ? 'حذف الثيم' : 'Delete theme',
      (isRTL ? 'حذف الثيم "' : 'Delete "') + name + (isRTL ? '"؟' : '"?'),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: () => deleteCustomTheme(id) },
      ],
    );
  };

  // نبني الأنماط ديناميكياً من ألوان الثيم الحالي
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
        <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.textMuted} />
      </View>
      <View style={[styles.rowStart, { flexDirection: rowDir }]}>
        <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{t(labelKey)}</Text>
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
            <View style={[styles.statusBadge, { backgroundColor: statusActive ? colors.success + '22' : colors.danger + '22' }]}>
              <Text style={[styles.statusText, { color: statusActive ? colors.success : colors.danger }]}>
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
            <Ionicons name="diamond-outline" size={17} color={colors.onPrimary} />
            <Text style={styles.upgradeText}>{t('upgradeFull')}</Text>
          </TouchableOpacity>
        </View>

        {/* المظهر — منتقي الثيمات */}
        <Text style={[styles.groupLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('appearance')}</Text>
        <View style={styles.group}>
          <View style={styles.themeWrap}>
            {allThemes.map((th) => {
              const selected = th.id === themeId;
              return (
                <TouchableOpacity
                  key={th.id}
                  style={[
                    styles.themeCard,
                    { borderColor: selected ? colors.primary : colors.border },
                    selected && { borderWidth: 2 },
                  ]}
                  onPress={() => setTheme(th.id)}
                  onLongPress={() => th.custom && confirmDeleteTheme(th.id, isRTL ? th.name.ar : th.name.en)}
                  activeOpacity={0.8}
                >
                  {/* معاينة مصغّرة لألوان الثيم */}
                  <View style={styles.swatchRow}>
                    <View style={[styles.swatch, { backgroundColor: th.colors.bg }]} />
                    <View style={[styles.swatch, { backgroundColor: th.colors.surface }]} />
                    <View style={[styles.swatch, { backgroundColor: th.colors.primary }]} />
                    <View style={[styles.swatch, { backgroundColor: th.colors.accent }]} />
                  </View>
                  <View style={[styles.themeNameRow, { flexDirection: rowDir }]}>
                    <Text style={styles.themeName} numberOfLines={1}>{isRTL ? th.name.ar : th.name.en}</Text>
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                    ) : th.custom ? (
                      <Ionicons name="trash-outline" size={13} color={colors.textMuted} />
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* بطاقة إنشاء ثيم جديد */}
            <TouchableOpacity
              style={[styles.themeCard, styles.createCard]}
              onPress={() => setShowCreate(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle-outline" size={26} color={colors.primary} />
              <Text style={[styles.themeName, { marginTop: 6 }]}>{t('createTheme')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.themeHint}>{t('themeLongPressHint')}</Text>
        </View>

        {/* عام */}
        <Text style={[styles.groupLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('general')}</Text>
        <View style={styles.group}>
          {navRow('language', 'language-outline', colors.primary, toggleLang, false, lang === 'ar' ? 'عربي ⇄ EN' : 'EN ⇄ عربي')}
          {navRow('downloadFolder', 'folder-outline', colors.primary, pickFolder, true, dirLabel)}
        </View>

        {/* إدارة الملفات */}
        <Text style={[styles.groupLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('storageMgmt')}</Text>
        <View style={styles.group}>
          {navRow('clearAll', 'trash-outline', colors.danger, confirmClear, true, undefined, true)}
        </View>

        {/* حول ودعم */}
        <Text style={[styles.groupLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('aboutSupport')}</Text>
        <View style={styles.group}>
          {navRow('rateApp', 'star-outline', colors.warning, () => {}, false)}
          {navRow('shareApp', 'share-social-outline', colors.success, shareApp, false)}
          {navRow('contactUs', 'logo-whatsapp', '#25D366', openWhatsApp, false)}
          {navRow('privacyPolicy', 'shield-checkmark-outline', colors.primary, openPrivacy, true)}
        </View>

        <Text style={styles.versionText}>{t('version')} 1.0.2</Text>
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* نافذة إنشاء ثيم مخصّص */}
      <Modal
        visible={showCreate}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreate(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('createTheme')}</Text>

            {/* معاينة حية للثيم قيد الإنشاء */}
            <View style={styles.previewRow}>
              {(() => {
                const p = deriveColors(newColor, newDark);
                return (
                  <>
                    <View style={[styles.previewSwatch, { backgroundColor: p.bg }]} />
                    <View style={[styles.previewSwatch, { backgroundColor: p.surface }]} />
                    <View style={[styles.previewSwatch, { backgroundColor: p.primary }]} />
                    <View style={[styles.previewSwatch, { backgroundColor: p.accent }]} />
                    <View style={[styles.previewSwatch, { backgroundColor: p.border }]} />
                  </>
                );
              })()}
            </View>

            {/* اسم الثيم */}
            <Text style={styles.fieldLabel}>{t('themeName')}</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder={t('themeNamePlaceholder')}
              placeholderTextColor={colors.textMuted}
              textAlign={isRTL ? 'right' : 'left'}
            />

            {/* اللون الأساسي */}
            <Text style={styles.fieldLabel}>{t('themeColor')}</Text>
            <View style={styles.paletteWrap}>
              {PALETTE.map((col) => (
                <TouchableOpacity
                  key={col}
                  style={[
                    styles.paletteDot,
                    { backgroundColor: col },
                    newColor === col && styles.paletteDotSel,
                  ]}
                  onPress={() => setNewColor(col)}
                  activeOpacity={0.8}
                />
              ))}
            </View>

            {/* الوضع: داكن / فاتح */}
            <Text style={styles.fieldLabel}>{t('themeMode')}</Text>
            <View style={[styles.modeRow, { flexDirection: rowDir }]}>
              <TouchableOpacity
                style={[styles.modeBtn, newDark && styles.modeBtnSel]}
                onPress={() => setNewDark(true)}
              >
                <Ionicons name="moon" size={15} color={newDark ? colors.onPrimary : colors.textMuted} />
                <Text style={[styles.modeText, newDark && { color: colors.onPrimary }]}>{t('themeDark')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, !newDark && styles.modeBtnSel]}
                onPress={() => setNewDark(false)}
              >
                <Ionicons name="sunny" size={15} color={!newDark ? colors.onPrimary : colors.textMuted} />
                <Text style={[styles.modeText, !newDark && { color: colors.onPrimary }]}>{t('themeLight')}</Text>
              </TouchableOpacity>
            </View>

            {/* أزرار */}
            <View style={[styles.modalActions, { flexDirection: rowDir }]}>
              <TouchableOpacity style={styles.btnGhost} onPress={() => setShowCreate(false)}>
                <Text style={styles.btnGhostText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={createTheme}>
                <Text style={styles.btnPrimaryText}>{t('themeCreate')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// الأنماط تُبنى من ألوان الثيم الحالي
const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    scroll: { padding: 16 },
    title: { color: c.text, fontSize: 22, fontWeight: '500', marginVertical: 10 },

    trialCard: { backgroundColor: c.surface, borderRadius: 16, padding: 16, borderWidth: 0.5, borderColor: c.border, marginBottom: 20 },
    trialTop: { alignItems: 'center', justifyContent: 'space-between' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
    statusText: { fontSize: 11, fontWeight: '500' },
    trialName: { color: c.text, fontSize: 15, fontWeight: '500' },
    trialDays: { color: c.textMuted, fontSize: 12, marginTop: 3 },
    upgradeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.primaryDark, borderRadius: 11, paddingVertical: 12, marginTop: 14 },
    upgradeText: { color: c.onPrimary, fontSize: 14, fontWeight: '500' },

    groupLabel: { color: c.textMuted, fontSize: 11, fontWeight: '500', marginBottom: 8, paddingHorizontal: 4 },
    group: { backgroundColor: c.surface, borderRadius: 14, borderWidth: 0.5, borderColor: c.border, marginBottom: 20, overflow: 'hidden' },
    row: { alignItems: 'center', justifyContent: 'space-between', padding: 14 },
    rowBorder: { borderBottomWidth: 0.5, borderBottomColor: c.border },
    rowStart: { alignItems: 'center', gap: 11 },
    rowEnd: { alignItems: 'center', gap: 8 },
    rowLabel: { color: c.text, fontSize: 14 },
    rowValue: { color: c.textMuted, fontSize: 12 },

    themeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12 },
    themeCard: { width: '47%', borderRadius: 12, borderWidth: 1, padding: 10, backgroundColor: c.surfaceAlt },
    swatchRow: { flexDirection: 'row', gap: 4, marginBottom: 8 },
    swatch: { flex: 1, height: 22, borderRadius: 5 },
    themeNameRow: { alignItems: 'center', justifyContent: 'space-between' },
    themeName: { color: c.text, fontSize: 12, fontWeight: '600', flex: 1 },
    themeHint: { color: c.textMuted, fontSize: 10, textAlign: 'center', paddingBottom: 10, paddingHorizontal: 12 },

    createCard: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderColor: c.primary, backgroundColor: 'transparent' },

    // نافذة إنشاء الثيم
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
    modalCard: { backgroundColor: c.surface, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: c.border },
    modalTitle: { color: c.text, fontSize: 17, fontWeight: '700', marginBottom: 14, textAlign: 'center' },
    previewRow: { flexDirection: 'row', gap: 6, marginBottom: 16, justifyContent: 'center' },
    previewSwatch: { width: 40, height: 40, borderRadius: 8, borderWidth: 1, borderColor: c.border },
    fieldLabel: { color: c.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 7, marginTop: 4 },
    input: { backgroundColor: c.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: c.border, color: c.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 6 },
    paletteWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
    paletteDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'transparent' },
    paletteDotSel: { borderColor: c.text },
    modeRow: { gap: 10, marginBottom: 18 },
    modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border },
    modeBtnSel: { backgroundColor: c.primary, borderColor: c.primary },
    modeText: { color: c.textMuted, fontSize: 13, fontWeight: '600' },
    modalActions: { gap: 10 },
    btnGhost: { flex: 1, paddingVertical: 12, borderRadius: 11, alignItems: 'center', backgroundColor: c.surfaceAlt },
    btnGhostText: { color: c.text, fontSize: 14, fontWeight: '600' },
    btnPrimary: { flex: 1, paddingVertical: 12, borderRadius: 11, alignItems: 'center', backgroundColor: c.primary },
    btnPrimaryText: { color: c.onPrimary, fontSize: 14, fontWeight: '700' },

    versionText: { color: c.textMuted, fontSize: 11, textAlign: 'center' },
  });
