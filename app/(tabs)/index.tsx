import { useRouter } from 'expo-router';
import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLang } from '@/lib/i18n';
import { useTrial } from '@/lib/trial';

type Tool = {
  id: string;
  route: string | null;
  titleKey: string;
  descKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  tintBg: string;
};

const ORGANIZE: Tool[] = [
  { id: 'merge',  route: '/merge-pdf',    titleKey: 'toolMerge',  descKey: 'toolMergeDesc',  icon: 'git-merge-outline', tint: '#a78bfa', tintBg: '#312e5f' },
  { id: 'split',  route: '/split-pdf',    titleKey: 'toolSplit',  descKey: 'toolSplitDesc',  icon: 'cut-outline',       tint: '#a78bfa', tintBg: '#312e5f' },
  { id: 'rotate', route: '/rotate-pdf',   titleKey: 'toolRotate', descKey: 'toolRotateDesc', icon: 'refresh-outline',   tint: '#a78bfa', tintBg: '#312e5f' },
  { id: 'delete', route: '/delete-pages', titleKey: 'toolDelete', descKey: 'toolDeleteDesc', icon: 'trash-outline',     tint: '#a78bfa', tintBg: '#312e5f' },
];

const CONVERT_TO: Tool[] = [
  { id: 'img2pdf', route: '/images-to-pdf', titleKey: 'toolImg2Pdf', descKey: 'toolImg2PdfDesc', icon: 'image-outline',    tint: '#34d399', tintBg: '#14463a' },
  { id: 'doc2pdf', route: null,             titleKey: 'toolDoc2Pdf', descKey: 'toolDoc2PdfDesc', icon: 'document-outline', tint: '#34d399', tintBg: '#14463a' },
];

const CONVERT_FROM: Tool[] = [
  { id: 'pdf2img', route: null, titleKey: 'toolPdf2Img', descKey: 'toolPdf2ImgDesc', icon: 'images-outline', tint: '#34d399', tintBg: '#14463a' },
];

const SECURITY: Tool[] = [
  { id: 'protect', route: '/protect-pdf', titleKey: 'toolProtect', descKey: 'toolProtectDesc', icon: 'lock-closed-outline', tint: '#fbbf24', tintBg: '#4a3a0c' },
];

export default function ToolsScreen() {
  const router = useRouter();
  const { t, isRTL } = useLang();
  const { daysLeft, isTrialActive } = useTrial();

  const go = (tool: Tool) => {
    if (tool.route) router.push(tool.route as any);
  };

  const rowDir = isRTL ? 'row-reverse' : 'row';
  const txtAlign = isRTL ? 'right' : 'left';

  const gridCard = (tool: Tool) => (
    <TouchableOpacity key={tool.id} style={styles.gCard} activeOpacity={0.75} onPress={() => go(tool)}>
      <View style={[styles.gIconBox, { backgroundColor: tool.tintBg }]}>
        <Ionicons name={tool.icon} size={20} color={tool.tint} />
      </View>
      <Text style={[styles.gTitle, { textAlign: txtAlign }]}>{t(tool.titleKey)}</Text>
      <Text style={[styles.gDesc, { textAlign: txtAlign }]}>{t(tool.descKey)}</Text>
    </TouchableOpacity>
  );

  const listRow = (tool: Tool, last: boolean) => {
    const soon = !tool.route;
    return (
      <TouchableOpacity
        key={tool.id}
        activeOpacity={soon ? 1 : 0.7}
        disabled={soon}
        onPress={() => go(tool)}
        style={[styles.lRow, { flexDirection: rowDir }, !last && styles.lRowBorder, soon && { opacity: 0.45 }]}
      >
        {soon ? (
          <View style={styles.soonBadge}><Text style={styles.soonText}>{t('comingSoon')}</Text></View>
        ) : (
          <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color="#475569" />
        )}
        <View style={[styles.lRight, { flexDirection: rowDir }]}>
          <View style={{ alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
            <Text style={styles.lTitle}>{t(tool.titleKey)}</Text>
            <Text style={styles.lDesc}>{t(tool.descKey)}</Text>
          </View>
          <View style={[styles.lIconBox, { backgroundColor: tool.tintBg }]}>
            <Ionicons name={tool.icon} size={19} color={tool.tint} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const sectionHeader = (titleKey: string, icon: keyof typeof Ionicons.glyphMap, color: string) => (
    <View style={[styles.secHead, { flexDirection: rowDir }]}>
      <Text style={styles.secTitle}>{t(titleKey)}</Text>
      <Ionicons name={icon} size={17} color={color} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={[styles.headerRow, { flexDirection: rowDir }]}>
            <View style={styles.offlinePill}>
              <Ionicons name="cloud-offline-outline" size={13} color="#34d399" />
              <Text style={styles.offlineText}>{t('offline')}</Text>
            </View>
            <Text style={styles.appName}>{t('appName')}</Text>
          </View>
          <Text style={[styles.welcome, { textAlign: txtAlign }]}>{t('welcome')} 👋</Text>
          <Text style={[styles.tagline, { textAlign: txtAlign }]}>{t('homeTagline')}</Text>
          {isTrialActive && daysLeft > 0 ? (
            <Text style={[styles.trialHint, { textAlign: txtAlign }]}>
              {t('daysLeftLabel')} {daysLeft} {t('daysWord')}
            </Text>
          ) : null}
        </View>

        {sectionHeader('catOrganize', 'grid-outline', '#a78bfa')}
        <View style={styles.grid}>{ORGANIZE.map(gridCard)}</View>

        {sectionHeader('catConvert', 'swap-horizontal-outline', '#34d399')}
        <Text style={[styles.subLabel, { textAlign: txtAlign }]}>{t('convertTo')}</Text>
        <View style={styles.listBox}>
          {CONVERT_TO.map((tool, i) => listRow(tool, i === CONVERT_TO.length - 1))}
        </View>
        <Text style={[styles.subLabel, { textAlign: txtAlign, marginTop: 12 }]}>{t('convertFrom')}</Text>
        <View style={styles.listBox}>
          {CONVERT_FROM.map((tool, i) => listRow(tool, i === CONVERT_FROM.length - 1))}
        </View>

        {sectionHeader('catSecurity', 'shield-checkmark-outline', '#fbbf24')}
        <View style={styles.listBox}>
          {SECURITY.map((tool, i) => listRow(tool, i === SECURITY.length - 1))}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f172a' },
  scroll: { padding: 16, paddingTop: 8 },
  header: { paddingVertical: 14, paddingHorizontal: 2 },
  headerRow: { alignItems: 'center', justifyContent: 'space-between' },
  appName: { fontSize: 18, fontWeight: '500', color: '#cbd5e1' },
  offlinePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#14463a', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  offlineText: { color: '#34d399', fontSize: 11, fontWeight: '500' },
  welcome: { color: '#ffffff', fontSize: 22, fontWeight: '500', marginTop: 16 },
  tagline: { color: '#94a3b8', fontSize: 13, marginTop: 4 },
  trialHint: { color: '#60a5fa', fontSize: 12, marginTop: 8, fontWeight: '500' },
  secHead: { alignItems: 'center', gap: 7, justifyContent: 'flex-end', marginTop: 22, marginBottom: 12, paddingHorizontal: 4 },
  secTitle: { color: '#e2e8f0', fontSize: 14, fontWeight: '500' },
  subLabel: { color: '#64748b', fontSize: 11, fontWeight: '500', marginBottom: 8, paddingHorizontal: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gCard: { width: '48.5%', backgroundColor: '#1e293b', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: '#2d3a4f' },
  gIconBox: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  gTitle: { color: '#fff', fontSize: 14, fontWeight: '500' },
  gDesc: { color: '#8896a8', fontSize: 11, marginTop: 2 },
  listBox: { backgroundColor: '#1e293b', borderRadius: 14, borderWidth: 0.5, borderColor: '#2d3a4f', overflow: 'hidden' },
  lRow: { alignItems: 'center', justifyContent: 'space-between', padding: 12 },
  lRowBorder: { borderBottomWidth: 0.5, borderBottomColor: '#2d3a4f' },
  lRight: { alignItems: 'center', gap: 11 },
  lIconBox: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  lTitle: { color: '#fff', fontSize: 14, fontWeight: '500' },
  lDesc: { color: '#8896a8', fontSize: 11, marginTop: 1 },
  soonBadge: { borderWidth: 0.5, borderColor: '#334155', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  soonText: { color: '#475569', fontSize: 10 },
});
