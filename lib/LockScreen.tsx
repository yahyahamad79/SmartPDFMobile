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
 * LockScreen — شاشة قفل موحّدة
 * ============================
 * بما أن كل خدمات التطبيق مدفوعة، تلفّ كل شاشة أداة بـ <PremiumGate>.
 * - أثناء الفحص: مؤشّر تحميل.
 * - التجربة فعّالة: تعرض الأداة (children).
 * - التجربة منتهية / عبث بالساعة: تعرض شاشة القفل مع زر ترقية WhatsApp.
 *
 * الاستخدام في أي شاشة أداة:
 *   import PremiumGate from '@/components/LockScreen';
 *   export default function MergePdf() {
 *     return (
 *       <PremiumGate title="Merge PDF">
 *         ... محتوى الأداة الفعلي ...
 *       </PremiumGate>
 *     );
 *   }
 */

// رقم واتساب للترقية (نفس الرقم المستخدم في سياسة الخصوصية)
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

  // أثناء الفحص الأول
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#5B9BD5" />
        <Text style={styles.loadingText}>جارٍ التحقق…</Text>
      </View>
    );
  }

  // التجربة فعّالة => اعرض الأداة
  if (isTrialActive) {
    return <>{children}</>;
  }

  // التجربة منتهية أو عبث بالساعة => شاشة القفل
  return (
    <View style={styles.lockContainer}>
      <View style={styles.lockCard}>
        <Text style={styles.lockIcon}>🔒</Text>

        <Text style={styles.lockTitle}>
          {tampered ? 'انتهت الفترة التجريبية' : 'انتهت الفترة التجريبية'}
        </Text>

        {title ? <Text style={styles.toolName}>{title}</Text> : null}

        <Text style={styles.lockMessage}>
          {tampered
            ? 'تعذّر التحقق من صلاحية الفترة التجريبية. للاستمرار في استخدام جميع الأدوات، يرجى الترقية إلى النسخة الكاملة.'
            : 'انتهت فترتك التجريبية. جميع أدوات التطبيق متاحة في النسخة الكاملة. للترقية تواصل معنا الآن.'}
        </Text>

        <TouchableOpacity style={styles.upgradeBtn} onPress={openWhatsApp}>
          <Text style={styles.upgradeBtnText}>الترقية عبر واتساب</Text>
        </TouchableOpacity>

        {offline ? (
          <TouchableOpacity style={styles.retryBtn} onPress={() => refresh()}>
            <Text style={styles.retryBtnText}>إعادة المحاولة (تحقق من الاتصال)</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.footerNote}>
          {daysLeft > 0 ? `الأيام المتبقية: ${daysLeft}` : 'الفترة التجريبية منتهية'}
        </Text>
      </View>
    </View>
  );
}

const NAVY = '#1F4E78';
const NAVY_DARK = '#0f2d4a';
const ACCENT = '#5B9BD5';

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NAVY_DARK,
  },
  loadingText: {
    color: '#cdd9e5',
    marginTop: 14,
    fontSize: 15,
  },
  lockContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NAVY_DARK,
    padding: 24,
  },
  lockCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: NAVY,
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
  },
  lockIcon: {
    fontSize: 54,
    marginBottom: 10,
  },
  lockTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  toolName: {
    color: ACCENT,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  lockMessage: {
    color: '#d6e2ef',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 24,
    writingDirection: 'rtl',
  },
  upgradeBtn: {
    backgroundColor: '#25D366', // أخضر واتساب
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  upgradeBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  retryBtn: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  retryBtnText: {
    color: ACCENT,
    fontSize: 14,
    fontWeight: '600',
  },
  footerNote: {
    color: '#8fa6bd',
    fontSize: 12,
    marginTop: 18,
  },
});
