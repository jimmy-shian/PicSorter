import { useTranslation as useI18nTranslation } from 'react-i18next';

export function useTranslation() {
  const { t, i18n } = useI18nTranslation();

  return {
    t,
    language: i18n.language,
    changeLanguage: i18n.changeLanguage.bind(i18n),
    languages: ['zh-TW', 'en', 'ja', 'ko'] as const,
  };
}

export type SupportedLanguage = 'zh-TW' | 'en' | 'ja' | 'ko';