// app.config.js
// =============
// يحلّ محل app.json ويقرأ نوع النسخة (beta / production) من المتغيّر
// البيئي APP_VARIANT الذي يُمرَّر وقت البناء عبر eas.json.
//
//   APP_VARIANT=beta        => Smart PDF (Beta)  | package ...SmartPdfMobile.beta
//   APP_VARIANT=production  => Smart PDF         | package ...SmartPdfMobile
//   (غير محدّد)             => production (الافتراضي الآمن)
//
// اختلاف الـ package يجعل النسختين تُثبّتان معاً على نفس الجهاز دون تعارض.

const VARIANT = process.env.APP_VARIANT === 'beta' ? 'beta' : 'production';
const IS_BETA = VARIANT === 'beta';

// الاسم وحزمة التطبيق حسب النوع
const NAME = IS_BETA ? 'Smart PDF (Beta)' : 'Smart PDF';
const PACKAGE = IS_BETA
  ? 'com.yahyahamad.SmartPdfMobile.beta'
  : 'com.yahyahamad.SmartPdfMobile';
const IOS_BUNDLE = IS_BETA
  ? 'com.yahyahamad.SmartPdfMobile.beta'
  : 'com.yahyahamad.SmartPdfMobile';
const SCHEME = IS_BETA ? 'smartpdfmobilebeta' : 'smartpdfmobile';

module.exports = {
  expo: {
    name: NAME,
    slug: 'SmartPdfMobile', // يبقى ثابتاً — مشروع Expo واحد
    version: '1.0.3',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: SCHEME,
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: IOS_BUNDLE,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#1F4E78',
        foregroundImage: './assets/images/adaptive-icon.png',
      },
      versionCode: 5,
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: PACKAGE,
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './assets/images/icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#1F4E78',
          dark: {
            backgroundColor: '#0f2d4a',
          },
        },
      ],
      'expo-secure-store',
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: '1b2d4249-161f-4b40-ade0-6839c4055907',
      },
      // يصل للتطبيق ليعرف هويته أثناء التشغيل (lib/appVariant.ts يقرأه)
      appVariant: VARIANT,
    },
  },
};
