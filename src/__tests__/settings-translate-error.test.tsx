jest.mock('@dfx.swiss/react', () => ({
  useCountry: () => ({ getCountries: () => Promise.resolve([]) }),
  useFiatContext: () => ({ currencies: [] }),
  useKyc: () => ({ setData: jest.fn() }),
  useLanguage: () => ({ getDefaultLanguage: (languages: any[]) => languages[0] }),
  useLanguageContext: () => ({ languages: [{ id: 1, symbol: 'EN' }] }),
  useSettings: () => ({ getInfoBanner: () => Promise.resolve(undefined) }),
  useUserContext: () => ({ user: undefined }),
}));

jest.mock('browser-lang', () => () => 'en');
jest.mock('i18next', () => ({ changeLanguage: jest.fn() }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, defaultValue: string) => `${key}|${defaultValue}` }),
}));

jest.mock('../hooks/app-params.hook', () => ({
  useAppParams: () => ({ setParams: jest.fn() }),
}));

jest.mock('../hooks/store.hook', () => ({
  useStore: () => ({
    language: { get: jest.fn(), set: jest.fn() },
    infoBanner: { get: jest.fn(), set: jest.fn(), remove: jest.fn() },
  }),
}));

jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({ isInitialized: false }),
}));

import { render, screen } from '@testing-library/react';
import { SettingsContextProvider, useSettingsContext } from '../contexts/settings.context';

function FieldError({ errorKey }: { errorKey: string }): JSX.Element {
  const { translateError } = useSettingsContext();
  return <p>{translateError(errorKey)}</p>;
}

describe('SettingsContextProvider translateError', () => {
  it('translates the unsupported characters field error from general/errors', async () => {
    const text = 'Contains unsupported characters. Use simple letters, e.g. l instead of ł.';

    render(
      <SettingsContextProvider>
        <FieldError errorKey="unsupported_characters" />
      </SettingsContextProvider>,
    );

    expect(await screen.findByText(`general/errors.${text}|${text}`)).toBeInTheDocument();
  });
});
