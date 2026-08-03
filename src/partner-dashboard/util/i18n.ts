import i18n from 'i18next';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/** Same mapping as settings.context — partner labels follow the main-app language. */
const languageToLocale: Record<string, string> = {
  en: 'en-US',
  de: 'de-CH',
  fr: 'fr-FR',
  it: 'it-IT',
};

export const PARTNER_NS = 'screens/partner';

/**
 * No-op retained only because the temporarily swapped `src/index.tsx` still
 * imports it. Language follows the main-app i18n; partner-local storage is gone.
 */
export function applyStoredPartnerLanguage(): void {
  // intentionally empty
}

/**
 * Translate under `screens/partner.<English text>`.
 * Language is the main-app i18n language (no partner-local storage override).
 */
export function partnerTranslate(
  defaultValue: string,
  interpolation?: Record<string, string | number>,
): string {
  return i18n.t([PARTNER_NS, defaultValue].join('.'), defaultValue, interpolation);
}

export function getPartnerLocale(lang?: string): string {
  const raw = lang ?? i18n.language ?? 'en';
  const base = raw.split('-')[0]?.toLowerCase() ?? 'en';
  return languageToLocale[base] ?? 'en-US';
}

export function usePartnerTranslation(): {
  translate: (defaultValue: string, interpolation?: Record<string, string | number>) => string;
  locale: string;
  language: string;
} {
  const { t, i18n: i18nInstance } = useTranslation();

  const translate = useCallback(
    (defaultValue: string, interpolation?: Record<string, string | number>) =>
      t([PARTNER_NS, defaultValue].join('.'), defaultValue, interpolation),
    [t],
  );

  const locale = getPartnerLocale(i18nInstance.language);
  return {
    translate,
    locale,
    language: i18nInstance.language,
  };
}
