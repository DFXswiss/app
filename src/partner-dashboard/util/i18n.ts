import i18n from 'i18next';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/** Same mapping as settings.context — partner has no SettingsContext. */
const languageToLocale: Record<string, string> = {
  en: 'en-US',
  de: 'de-CH',
  fr: 'fr-FR',
  it: 'it-IT',
};

export const PARTNER_NS = 'screens/partner';

/**
 * Mirror of SettingsContext.translate for the partner shell (no Dfx/Settings providers).
 * Keys are English defaults under `screens/partner.<English text>`.
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
  return { translate, locale, language: i18nInstance.language };
}
