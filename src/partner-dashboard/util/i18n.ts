import i18n from 'i18next';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PartnerLanguage,
  persistLanguage,
  readStoredLanguage,
} from './theme';

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

export function resolvePartnerLanguage(lang?: string): PartnerLanguage {
  const raw = (lang ?? i18n.language ?? 'en').split('-')[0]?.toLowerCase() ?? 'en';
  return raw === 'de' ? 'de' : 'en';
}

/**
 * Apply partner language preference at shell start.
 * Default is English when the user has not chosen; browser language is ignored.
 * A stored selection (localStorage) always wins.
 *
 * Must run only after `setupLanguages()` / `i18n.init()`. Calling
 * `changeLanguage` before init throws synchronously:
 * `Cannot read properties of undefined (reading 'toResolveHierarchy')`
 * because `services.languageUtils` is created during init — that crash
 * aborts the entry module and leaves the static "Loading ..." placeholder.
 */
export function applyStoredPartnerLanguage(): void {
  const preferred = readStoredLanguage() ?? 'en';
  if (!i18n.services?.languageUtils) {
    return;
  }
  void i18n.changeLanguage(preferred);
}

export function usePartnerTranslation(): {
  translate: (defaultValue: string, interpolation?: Record<string, string | number>) => string;
  locale: string;
  language: string;
  partnerLanguage: PartnerLanguage;
  setPartnerLanguage: (lang: PartnerLanguage) => void;
} {
  const { t, i18n: i18nInstance } = useTranslation();
  const [partnerLanguage, setLangState] = useState<PartnerLanguage>(
    () => readStoredLanguage() ?? 'en',
  );

  // Re-assert preference after LanguageDetector / late i18n init may have run.
  useEffect(() => {
    const preferred = readStoredLanguage() ?? 'en';
    setLangState(preferred);
    if (resolvePartnerLanguage(i18nInstance.language) !== preferred) {
      void i18nInstance.changeLanguage(preferred);
    }
  }, [i18nInstance]);

  useEffect(() => {
    const onLang = (lng: string) => {
      setLangState(resolvePartnerLanguage(lng));
    };
    i18nInstance.on('languageChanged', onLang);
    return () => {
      i18nInstance.off('languageChanged', onLang);
    };
  }, [i18nInstance]);

  const translate = useCallback(
    (defaultValue: string, interpolation?: Record<string, string | number>) =>
      t([PARTNER_NS, defaultValue].join('.'), defaultValue, interpolation),
    [t],
  );

  const setPartnerLanguage = useCallback(
    (lang: PartnerLanguage) => {
      persistLanguage(lang);
      setLangState(lang);
      void i18nInstance.changeLanguage(lang);
    },
    [i18nInstance],
  );

  const locale = getPartnerLocale(i18nInstance.language);
  return {
    translate,
    locale,
    language: i18nInstance.language,
    partnerLanguage,
    setPartnerLanguage,
  };
}
