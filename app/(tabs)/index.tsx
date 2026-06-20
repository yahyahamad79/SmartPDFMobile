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

/**
 * Home screen for the Smart PDF mobile app.
 * Shows a grid of offline tools that run fully on-device (no internet).
 * Online tools are temporarily removed and will be added back later.
 */

type Tool = {
  id: string;
  title: string;
  icon: string;
  desc: string;
};

const OFFLINE_TOOLS: Tool[] = [
  { id: 'merge',    title: 'Merge PDF',       icon: '📑', desc: 'Combine multiple PDFs into one' },
  { id: 'split',    title: 'Split PDF',       icon: '✂️', desc: 'Split a PDF into separate files' },
  { id: 'img2pdf',  title: 'Images to PDF',   icon: '🖼️', desc: 'Convert images into a PDF' },
  { id: 'rotate',   title: 'Rotate Pages',    icon: '🔄', desc: 'Rotate pages in a PDF' },
  { id: 'imgconv',  title: 'Image Converter', icon: '🎨', desc: 'Convert between image formats' },
];

export default function HomeScreen() {
  const router = useRouter();

  const handleToolPress = (tool: Tool) => {
    // الأدوات الجاهزة لها شاشات؛ البقية ستُضاف لاحقاً
    if (tool.id === 'merge') {
      router.push('/merge-pdf');
      return;
    }
    if (tool.id === 'split') {
      router.push('/split-pdf');
      return;
    }
    if (tool.id === 'img2pdf') {
      router.push('/images-to-pdf');
      return;
    }
    // مؤقتاً: بقية الأدوات قيد البناء
    console.log('Tool pressed (coming soon):', tool.id);
  };

  const renderCard = (tool: Tool) => (
    <TouchableOpacity
      key={tool.id}
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => handleToolPress(tool)}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardIcon}>{tool.icon}</Text>
        <View style={[styles.badge, styles.badgeOffline]}>
          <Text style={styles.badgeText}>Offline</Text>
        </View>
      </View>
      <Text style={styles.cardTitle}>{tool.title}</Text>
      <Text style={styles.cardDesc}>{tool.desc}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.appName}>Smart PDF</Text>
          <Text style={styles.tagline}>Your all-in-one PDF toolkit</Text>
        </View>

        {/* Offline section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚡ Works Offline</Text>
          <Text style={styles.sectionHint}>No internet needed — runs on your device</Text>
          <View style={styles.grid}>
            {OFFLINE_TOOLS.map((t) => renderCard(t))}
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const NAVY = '#1F4E78';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f172a' },
  scroll: { padding: 16 },

  header: { paddingVertical: 20, paddingHorizontal: 4 },
  appName: { fontSize: 30, fontWeight: '800', color: '#ffffff' },
  tagline: { fontSize: 14, color: '#94a3b8', marginTop: 4 },

  section: { marginTop: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#e2e8f0', marginBottom: 2 },
  sectionHint: { fontSize: 12, color: '#64748b', marginBottom: 12 },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#293548',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardIcon: { fontSize: 28 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeOffline: { backgroundColor: '#14532d' },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#cbd5e1' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#f1f5f9' },
  cardDesc: { fontSize: 11.5, color: '#94a3b8', marginTop: 3, lineHeight: 16 },
});
