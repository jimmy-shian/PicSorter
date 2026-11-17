import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import zhTW from './locales/zh-TW.json';
import en from './locales/en.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';

const locales = Localization.getLocales();
const deviceLanguage = locales[0]?.languageCode ?? 'zh';
const deviceRegion = locales[0]?.regionCode ?? 'TW';

// Map device locale to supported language
const getSupportedLanguage = (lang: string): string => {
  switch (lang) {
    case 'zh': return 'zh-TW';
    case 'en': return 'en';
    case 'ja': return 'ja';
    case 'ko': return 'ko';
    default: return 'zh-TW';
  }
};

const language = getSupportedLanguage(deviceLanguage);

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      'zh-TW': { translation: zhTW },
      'en': { translation: en },
      'ja': { translation: ja },
      'ko': { translation: ko },
    },
    lng: language,
    fallbackLng: 'zh-TW',
    interpolation: {
      escapeValue: false,
    },
    compatibilityJSON: 'v4',
  });

export default i18n;