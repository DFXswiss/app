import i18n from 'i18next';
import {
  applyStoredPartnerLanguage,
  getPartnerLocale,
  partnerTranslate,
  usePartnerTranslation,
} from 'src/partner-dashboard/util/i18n';
import { renderHook } from '@testing-library/react';

describe('partner i18n helpers', () => {
  it('getPartnerLocale maps known language bases and falls back to en-US', () => {
    expect(getPartnerLocale('en')).toBe('en-US');
    expect(getPartnerLocale('de')).toBe('de-CH');
    expect(getPartnerLocale('de-AT')).toBe('de-CH');
    expect(getPartnerLocale('fr')).toBe('fr-FR');
    expect(getPartnerLocale('it')).toBe('it-IT');
    expect(getPartnerLocale('xx')).toBe('en-US');
    expect(getPartnerLocale('ZH-cn')).toBe('en-US');
  });

  it('getPartnerLocale uses i18n.language when lang is omitted', () => {
    const previous = i18n.language;
    void i18n.changeLanguage('de');
    expect(getPartnerLocale()).toBe('de-CH');
    void i18n.changeLanguage(previous || 'en');
  });

  it('getPartnerLocale falls back to en when both lang and i18n.language are empty', () => {
    const previous = i18n.language;
    // Force the `lang ?? i18n.language ?? 'en'` third arm
    Object.defineProperty(i18n, 'language', {
      configurable: true,
      get: () => undefined,
    });
    try {
      expect(getPartnerLocale(undefined)).toBe('en-US');
      expect(getPartnerLocale('')).toBe('en-US');
    } finally {
      Object.defineProperty(i18n, 'language', {
        configurable: true,
        writable: true,
        value: previous,
      });
    }
  });

  it('partnerTranslate returns the default English key when no translation is loaded for en', () => {
    const text = partnerTranslate('Total volume');
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });

  it('applyStoredPartnerLanguage is a no-op (kept for index.tsx import)', () => {
    expect(() => applyStoredPartnerLanguage()).not.toThrow();
  });

  it('usePartnerTranslation exposes translate, locale, and language', () => {
    const { result } = renderHook(() => usePartnerTranslation());
    expect(result.current.translate('Buy')).toBeTruthy();
    expect(result.current.locale).toMatch(/-/);
    expect(typeof result.current.language).toBe('string');
  });

  it('resolves German partner labels and de-CH number locale via screens/partner namespace', async () => {
    // Catches PARTNER_NS → 'screens/partners' which silently falls back to English keys.
    const previous = i18n.language;
    try {
      await i18n.changeLanguage('de');
      expect(partnerTranslate('Total volume')).toBe('Gesamtvolumen');
      expect(partnerTranslate('This period')).toBe('Dieser Zeitraum');
      expect(getPartnerLocale()).toBe('de-CH');
      // de-CH formats with apostrophe thousands separators
      const formatted = (1234.5).toLocaleString(getPartnerLocale(), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      expect(formatted).toMatch(/1['’\u202f\s]?234/);
    } finally {
      await i18n.changeLanguage(previous || 'en');
    }
  });
});
