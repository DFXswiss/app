import type { Language } from '@dfx.swiss/react';

/** App languages (same symbols as settings.context `appLanguages`). */
export const PARTNER_TEST_LANGUAGES: Language[] = [
  { id: 1, name: 'Deutsch', symbol: 'DE', foreignName: 'German', enable: true },
  { id: 2, name: 'English', symbol: 'EN', foreignName: 'English', enable: true },
  { id: 3, name: 'Français', symbol: 'FR', foreignName: 'French', enable: true },
  { id: 4, name: 'Italiano', symbol: 'IT', foreignName: 'Italian', enable: true },
];

export const mockChangeLanguage = jest.fn();

/**
 * Mutable stand-in for `useSettingsContext` in partner dashboard tests.
 * Wire with:
 *   jest.mock('src/contexts/settings.context', () => ({
 *     useSettingsContext: () =>
 *       require('src/test-helpers/mock-settings-context').mockSettingsState,
 *   }));
 */
export const mockSettingsState = {
  language: PARTNER_TEST_LANGUAGES[1] as Language | undefined,
  availableLanguages: PARTNER_TEST_LANGUAGES as Language[],
  changeLanguage: mockChangeLanguage,
  translate: (_key: string, defaultValue: string) => defaultValue,
};

export function resetMockSettings(): void {
  mockChangeLanguage.mockReset();
  mockSettingsState.language = PARTNER_TEST_LANGUAGES[1];
  mockSettingsState.availableLanguages = PARTNER_TEST_LANGUAGES;
  mockChangeLanguage.mockImplementation((lang: Language) => {
    mockSettingsState.language = lang;
  });
}
