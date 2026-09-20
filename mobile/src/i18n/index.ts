import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { resources } from './strings';
import type { Lang } from '@/theme/type';

export const supportedLangs: Lang[] = ['en', 'hi', 'te'];

export function deviceLang(): Lang {
  const code = getLocales()[0]?.languageCode;
  return supportedLangs.includes(code as Lang) ? (code as Lang) : 'en';
}

export function initI18n(lang: Lang) {
  if (i18n.isInitialized) return i18n.changeLanguage(lang);
  return i18n.use(initReactI18next).init({
    resources,
    lng: lang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}

export default i18n;
