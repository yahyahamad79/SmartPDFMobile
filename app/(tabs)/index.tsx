import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Combine,
  RotateCw,
  Trash2,
  Scissors,
  FileSpreadsheet,
  Presentation,
  Files,
  Image as ImageIcon,
  FileType,
  FileType2,
  Lock,
  Stamp,
  Archive,
  ChevronLeft,
  ChevronRight,
  WifiOff,
  Clock,
  type LucideIcon,
} from 'lucide-react-native';
import { useLang } from '@/lib/i18n';
import { useTrial } from '@/lib/trial';
import { useTheme, ThemeColors } from '@/lib/theme';

/**
 * شاشة الأدوات (الرئيسية) — تتبع نظام الثيم.
 * ملاحظة: ألوان مربّعات أيقونات الأدوات (iconBg) تبقى ثابتة لأنها
 * هوية بصرية لكل أداة (مثل الشعارات). ألوان الواجهة فقط تتبع الثيم.
 */

type Tool = {
  id: string;
  route: string | null;
  titleKey: string;
  descKey: string;
  Icon: LucideIcon;
  iconBg: string;
};

const ORGANIZE: Tool[] = [
  { id: 'merge',  route: '/merge-pdf',    titleKey: 'toolMerge',  descKey: 'toolMergeDesc',  Icon: Combine,  iconBg: '#7C3AED' },
  { id: 'rotate', route: '/rotate-pdf',   titleKey: 'toolRotate', descKey: 'toolRotateDesc', Icon: RotateCw, iconBg: '#6366F1' },
  { id: 'delete', route: '/delete-pages', titleKey: 'toolDelete', descKey: 'toolDeleteDesc', Icon: Trash2,   iconBg: '#EC4899' },
  { id: 'split',  route: '/split-pdf',    titleKey: 'toolSplit',  descKey: 'toolSplitDesc',  Icon: Scissors, iconBg: '#8B5CF6' },
];

const CONVERT_TO: Tool[] = [
  { id: 'xls2pdf', route: null, titleKey: 'toolXls2Pdf', descKey: 'toolXls2PdfDesc', Icon: FileSpreadsheet, iconBg: '#10B981' },
  { id: 'ppt2pdf', route: null, titleKey: 'toolPpt2Pdf', descKey: 'toolPpt2PdfDesc', Icon: Presentation,    iconBg: '#F97316' },
  { id: 'doc2pdf', route: null, titleKey: 'toolDoc2Pdf', descKey: 'toolDoc2PdfDesc', Icon: Files,           iconBg: '#6366F1' },
];

const CONVERT_FROM: Tool[] = [
  { id: 'pdf2img', route: '/images-to-pdf', titleKey: 'toolPdf2Img', descKey: 'toolPdf2ImgDesc', Icon: ImageIcon, iconBg: '#0EA5E9' },
  { id: 'pdf2doc', route: null,             titleKey: 'toolPdf2Doc', descKey: 'toolPdf2DocDesc', Icon: FileType,  iconBg: '#2563EB' },
  { id: 'pdf2ppt', route: null,             titleKey: 'toolPdf2Ppt', descKey: 'toolPdf2PptDesc', Icon: FileType2, iconBg: '#DC2626' },
];

const SECURITY: Tool[] = [
  { id: 'protect',   route: '/protect-pdf',   titleKey: 'toolProtect',   descKey: 'toolProtectDesc',   Icon: Lock,    iconBg: '#9333EA' },
  { id: 'watermark', route: '/watermark-pdf', titleKey: 'toolWatermark', descKey: 'toolWatermarkDesc', Icon: Stamp,   iconBg: '#7C3AED' },
  { id: 'compress',  route: '/compress-pdf',  titleKey: 'toolCompress',  descKey: 'toolCompressDesc',  Icon: Archive, iconBg: '#0EA5E9' },
];

export default function ToolsScreen() {
  const router = useRouter();
  const { t, isRTL } = useLang();
  const { daysLeft, isTrialActive } = useTrial();
  const { colors } = useTheme();

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const rowDir = isRTL ? 'row-reverse' : 'row';
  const txtAlign: 'right' | 'left' = isRTL ? 'right' : 'left';
  const Chevron = isRTL ? ChevronLeft : ChevronRight;

  const go = (tool: Tool) => {
    if (tool.route) router.push(tool.route as any);
  };

  const listRow = (tool: Tool, last: boolean) => {
    const soon = !tool.route;
    const { Icon } = tool;
    return (
      <TouchableOpacity
        key={tool.id}
        activeOpacity={soon ? 1 : 0.7}
        disabled={soon}
        onPress={() => go(tool)}
        style={[styles.card, { flexDirection: rowDir }, soon && { opacity: 0.6 }]}
      >
        <View style={[styles.iconBox, { backgroundColor: tool.iconBg }]}>
          <Icon color="#ffffff" size={21} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
          <Text style={[styles.cardTitle, { textAlign: txtAlign }]}>{t(tool.titleKey)}</Text>
          <Text style={[styles.cardDesc, { textAlign: txtAlign }]}>{t(tool.descKey)}</Text>
        </View>
        {soon ? (
          <View style={styles.soonBadge}><Text style={styles.soonText}>{t('comingSoon')}</Text></View>
        ) : (
          <Chevron color={colors.textMuted} size={18} strokeWidth={2} />
        )}
      </TouchableOpacity>
    );
  };

  const sectionHeader = (titleKey: string) => (
    <View style={[styles.secHead, { flexDirection: rowDir }]}>
      <Text style={styles.secTitle}>{t(titleKey)}</Text>
      <View style={styles.secLine} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <View style={[styles.topRow, { flexDirection: rowDir }]}>
          <View style={[styles.brand, { flexDirection: rowDir }]}>
            <View style={styles.logo}><Text style={styles.logoText}>SP</Text></View>
            <Text style={styles.appName}>{t('appName')}</Text>
          </View>
          <View style={[styles.badges, { flexDirection: rowDir }]}>
            <View style={styles.offlinePill}>
              <WifiOff color={colors.primaryDark} size={12} strokeWidth={2.2} />
              <Text style={styles.offlineText}>{t('offline')}</Text>
            </View>
            {isTrialActive && daysLeft > 0 ? (
              <View style={styles.daysPill}>
                <Clock color={colors.accent} size={12} strokeWidth={2.2} />
                <Text style={styles.daysText}>{daysLeft} {t('daysWord')}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {sectionHeader('catOrganize')}
        {ORGANIZE.map((tool, i) => listRow(tool, i === ORGANIZE.length - 1))}

        {sectionHeader('convertTo')}
        {CONVERT_TO.map((tool, i) => listRow(tool, i === CONVERT_TO.length - 1))}

        {sectionHeader('convertFrom')}
        {CONVERT_FROM.map((tool, i) => listRow(tool, i === CONVERT_FROM.length - 1))}

        {sectionHeader('catSecurity')}
        {SECURITY.map((tool, i) => listRow(tool, i === SECURITY.length - 1))}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },

    topBar: { backgroundColor: c.surface, borderBottomWidth: 0.5, borderBottomColor: c.border, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12 },
    topRow: { alignItems: 'center', justifyContent: 'space-between' },
    brand: { alignItems: 'center', gap: 10 },
    logo: { width: 38, height: 38, borderRadius: 11, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    logoText: { color: c.onPrimary, fontWeight: '500', fontSize: 13 },
    appName: { fontSize: 18, fontWeight: '500', color: c.text },
    badges: { alignItems: 'center', gap: 6 },
    offlinePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.surfaceAlt, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
    offlineText: { color: c.primaryDark, fontSize: 11, fontWeight: '500' },
    daysPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.accent + '22', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
    daysText: { color: c.accent, fontSize: 11, fontWeight: '500' },

    scroll: { padding: 14, paddingTop: 4 },

    secHead: { alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 10, paddingHorizontal: 4 },
    secTitle: { color: c.textMuted, fontSize: 13, fontWeight: '500' },
    secLine: { flex: 1, height: 0.5, backgroundColor: c.border },

    card: { alignItems: 'center', gap: 12, backgroundColor: c.surface, borderWidth: 0.5, borderColor: c.border, borderRadius: 14, padding: 11, paddingHorizontal: 13, marginBottom: 7 },
    iconBox: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { color: c.text, fontSize: 14, fontWeight: '500' },
    cardDesc: { color: c.textMuted, fontSize: 11, marginTop: 1 },

    soonBadge: { backgroundColor: c.accent + '22', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
    soonText: { color: c.accent, fontSize: 10, fontWeight: '500' },
  });
