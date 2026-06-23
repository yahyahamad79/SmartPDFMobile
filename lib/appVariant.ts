import Constants from 'expo-constants';

/**
 * appVariant — كشف نوع النسخة (beta أم رسمية) داخل التطبيق
 * ========================================================
 * يُمرَّر المتغيّر APP_VARIANT وقت البناء عبر eas.json،
 * ويصل للتطبيق عبر extra في app.config.js، فنقرأه هنا.
 *
 * الاستخدام:
 *   import { IS_BETA, APP_VARIANT } from '@/lib/appVariant';
 *   if (IS_BETA) { ... }
 */

type Variant = 'beta' | 'production';

// نقرأ القيمة الممرّرة من app.config.js -> extra.appVariant
const raw =
  (Constants.expoConfig?.extra?.appVariant as string | undefined) ??
  'production';

export const APP_VARIANT: Variant = raw === 'beta' ? 'beta' : 'production';
export const IS_BETA = APP_VARIANT === 'beta';
export const IS_PRODUCTION = APP_VARIANT === 'production';
