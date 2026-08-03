import i18n from 'i18next';
import {
  applyStoredPartnerLanguage,
  PARTNER_NS,
  partnerTranslate,
} from 'src/partner-dashboard/util/i18n';
import { PARTNER_LANG_STORAGE_KEY } from 'src/partner-dashboard/util/theme';

/**
 * Regression for the entry crash that left the partner page on the static
 * "Loading ..." placeholder:
 *
 * `i18n.changeLanguage` before `i18n.init` throws synchronously
 * (`languageUtils.toResolveHierarchy` on undefined) because services are
 * only created during init. English is the partner default and has no
 * translation keys of its own (keys are English defaults) — both must work.
 */
describe('partner i18n bootstrap', () => {
  afterEach(() => {
    window.localStorage.removeItem(PARTNER_LANG_STORAGE_KEY);
    void i18n.changeLanguage('en');
  });

  it('activates English with no en key bundle (defaultValue path)', async () => {
    window.localStorage.removeItem(PARTNER_LANG_STORAGE_KEY);
    // setupTests already called setupLanguages(); English has no filled bundle.
    await i18n.changeLanguage('en');
    expect(i18n.language.split('-')[0]).toBe('en');
    // Partner keys are English source text; t must return the key/defaultValue.
    expect(partnerTranslate('Total volume')).toBe('Total volume');
    expect(i18n.t(`${PARTNER_NS}.Total volume`, 'Total volume')).toBe('Total volume');
  });

  it('applyStoredPartnerLanguage defaults to English when storage is empty', async () => {
    window.localStorage.removeItem(PARTNER_LANG_STORAGE_KEY);
    expect(() => applyStoredPartnerLanguage()).not.toThrow();
    await i18n.changeLanguage(i18n.language); // flush any pending change
    expect(i18n.language.split('-')[0]).toBe('en');
    expect(partnerTranslate('Transactions')).toBe('Transactions');
  });

  it('applyStoredPartnerLanguage restores stored German', async () => {
    window.localStorage.setItem(PARTNER_LANG_STORAGE_KEY, 'de');
    expect(() => applyStoredPartnerLanguage()).not.toThrow();
    // changeLanguage is fire-and-forget; wait until language settles
    await new Promise<void>((resolve) => {
      if (i18n.language.split('-')[0] === 'de') {
        resolve();
        return;
      }
      const onChange = (lng: string) => {
        if (lng.split('-')[0] === 'de') {
          i18n.off('languageChanged', onChange);
          resolve();
        }
      };
      i18n.on('languageChanged', onChange);
      // Fallback if already applied synchronously
      setTimeout(() => {
        i18n.off('languageChanged', onChange);
        resolve();
      }, 500);
    });
    expect(i18n.language.split('-')[0]).toBe('de');
    expect(partnerTranslate('Total volume')).toBe('Gesamtvolumen');
  });

  it('does not call changeLanguage when languageUtils is missing (pre-init safety)', () => {
    const services = i18n.services;
    const spy = jest.spyOn(i18n, 'changeLanguage');
    try {
      // Simulate the pre-init singleton state that crashed the browser entry.
      (i18n as { services: typeof services }).services = {
        ...services,
        languageUtils: undefined as unknown as typeof services.languageUtils,
      };
      expect(() => applyStoredPartnerLanguage()).not.toThrow();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      (i18n as { services: typeof services }).services = services;
      spy.mockRestore();
    }
  });

  it('documents that bare changeLanguage before languageUtils throws toResolveHierarchy', () => {
    const services = i18n.services;
    try {
      (i18n as { services: typeof services }).services = {
        ...services,
        languageUtils: undefined as unknown as typeof services.languageUtils,
      };
      expect(() => {
        i18n.changeLanguage('en');
      }).toThrow(/toResolveHierarchy/);
    } finally {
      (i18n as { services: typeof services }).services = services;
    }
  });
});
