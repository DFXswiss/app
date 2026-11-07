import { act, render, waitFor } from '@testing-library/react';
import { SettingsContextProvider, useSettingsContext } from '../contexts/settings.context';

const mockLanguages = [
  { id: 1, symbol: 'EN' },
  { id: 2, symbol: 'DE' },
  { id: 3, symbol: 'SQ' },
  { id: 4, symbol: 'FR' },
];
const mockCurrencies = [
  { id: 1, name: 'CHF' },
  { id: 2, name: 'EUR' },
];
const mockCountry = {
  id: 1,
  name: 'Switzerland',
  symbol: 'CH',
  kycAllowed: true,
  kycOrganizationAllowed: true,
  nationalityAllowed: true,
};
const mockGetCountries = jest.fn();
const mockGetBanner = jest.fn();
const mockSetData = jest.fn();
const mockUpdateLanguage = jest.fn();
const mockUpdateCurrency = jest.fn();
const mockUpdateMail = jest.fn();
const mockUpdatePhone = jest.fn();
const mockSetParams = jest.fn();
const mockStoredLanguage = { get: jest.fn(), set: jest.fn() };
const mockStoredBanner = { get: jest.fn(), set: jest.fn(), remove: jest.fn() };
const mockI18n = jest.fn();
let mockUser: any;
let mockParams: any;
let mockInitialized = true;
let mockLanguageList: typeof mockLanguages | undefined;
let mockCurrencyList: typeof mockCurrencies | undefined;

jest.mock('@dfx.swiss/react', () => ({
  useCountry: () => ({ getCountries: mockGetCountries }),
  useFiatContext: () => ({ currencies: mockCurrencyList }),
  useKyc: () => ({ setData: mockSetData }),
  useLanguage: () => ({ getDefaultLanguage: (languages: typeof mockLanguages) => languages[0] }),
  useLanguageContext: () => ({ languages: mockLanguageList }),
  useSettings: () => ({ getInfoBanner: mockGetBanner }),
  useUserContext: () => ({
    user: mockUser,
    updateLanguage: mockUpdateLanguage,
    updateCurrency: mockUpdateCurrency,
    updateMail: mockUpdateMail,
    updatePhone: mockUpdatePhone,
  }),
}));
jest.mock('browser-lang', () => () => 'en');
jest.mock('i18next', () => ({ changeLanguage: (...args: unknown[]) => mockI18n(...args) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, value: string) => value }) }));
jest.mock('../hooks/app-params.hook', () => ({ useAppParams: () => mockParams }));
jest.mock('../hooks/store.hook', () => ({
  useStore: () => ({ language: mockStoredLanguage, infoBanner: mockStoredBanner }),
}));
jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({ isInitialized: mockInitialized }),
}));

let current: ReturnType<typeof useSettingsContext>;
function Consumer(): null {
  current = useSettingsContext();
  return null;
}
function show() {
  return render(
    <SettingsContextProvider>
      <Consumer />
    </SettingsContextProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLanguageList = mockLanguages;
  mockCurrencyList = mockCurrencies;
  mockParams = { setParams: mockSetParams };
  mockUser = undefined;
  mockInitialized = true;
  mockGetCountries.mockResolvedValue([mockCountry]);
  mockGetBanner.mockResolvedValue(undefined);
  mockSetData.mockResolvedValue(undefined);
  mockUpdateMail.mockResolvedValue(undefined);
  mockStoredLanguage.get.mockReturnValue(undefined);
  mockStoredBanner.get.mockReturnValue(undefined);
});

it('changes the app language without updating the user and keeps the account change route', async () => {
  mockUser = { language: mockLanguages[0], kyc: {} };
  const view = show();
  await waitFor(() => expect(current.language?.symbol).toBe('EN'));
  act(() => current.changeAppLanguage(mockLanguages[1] as any));
  expect(mockI18n).toHaveBeenCalledWith('de');
  expect(mockStoredLanguage.set).toHaveBeenCalledWith('DE');
  expect(mockUpdateLanguage).not.toHaveBeenCalled();
  expect(current.language?.symbol).toBe('DE');
  view.unmount();
  show();
  await waitFor(() => expect(current.language?.symbol).toBe('EN'));
  act(() => current.changeLanguage(mockLanguages[0] as any));
  expect(mockUpdateLanguage).not.toHaveBeenCalled();
  act(() => current.changeLanguage(mockLanguages[1] as any));
  expect(mockUpdateLanguage).toHaveBeenCalledWith(mockLanguages[1]);
  expect(mockSetParams).toHaveBeenCalledWith({ lang: undefined });
  act(() => current.changeLanguage({ id: 99, symbol: 'XX' } as any));
  expect(mockUpdateLanguage).toHaveBeenCalledTimes(1);
});

it('hydrates a new user language after a local selection', async () => {
  mockUser = { language: mockLanguages[0], kyc: {} };
  const view = show();
  await waitFor(() => expect(current.language?.symbol).toBe('EN'));
  act(() => current.changeAppLanguage(mockLanguages[1] as any));
  expect(current.language?.symbol).toBe('DE');
  mockUser = { language: mockLanguages[3], kyc: {} };
  view.rerender(
    <SettingsContextProvider>
      <Consumer />
    </SettingsContextProvider>,
  );
  await waitFor(() => expect(current.language?.symbol).toBe('FR'));
  expect(mockUpdateLanguage).not.toHaveBeenCalled();
});

it('hydrates a changed language parameter after a local selection', async () => {
  mockParams = { setParams: mockSetParams, lang: 'en' };
  const view = show();
  await waitFor(() => expect(current.language?.symbol).toBe('EN'));
  act(() => current.changeAppLanguage(mockLanguages[1] as any));
  expect(current.language?.symbol).toBe('DE');
  mockParams = { setParams: mockSetParams, lang: 'fr' };
  view.rerender(
    <SettingsContextProvider>
      <Consumer />
    </SettingsContextProvider>,
  );
  await waitFor(() => expect(current.language?.symbol).toBe('FR'));
  expect(mockUpdateLanguage).not.toHaveBeenCalled();
});

it('hydrates the user language when it becomes available after a local selection', async () => {
  mockUser = { language: mockLanguages[3], kyc: {} };
  mockLanguageList = mockLanguages.slice(0, 3);
  const view = show();
  await waitFor(() => expect(current.language?.symbol).toBe('EN'));
  act(() => current.changeAppLanguage(mockLanguages[1] as any));
  expect(current.language?.symbol).toBe('DE');
  mockLanguageList = [...mockLanguages];
  view.rerender(
    <SettingsContextProvider>
      <Consumer />
    </SettingsContextProvider>,
  );
  await waitFor(() => expect(current.language?.symbol).toBe('FR'));
  expect(mockUpdateLanguage).not.toHaveBeenCalled();
});

it('updates currency, mail, phone and the local store through their respective handlers', async () => {
  mockUser = { currency: mockCurrencies[0], language: mockLanguages[0], kyc: {} };
  show();
  await waitFor(() => expect(current.currency?.name).toBe('CHF'));
  act(() => current.changeCurrency(mockCurrencies[0] as any));
  act(() => current.changeCurrency({ id: 9 } as any));
  expect(mockUpdateCurrency).not.toHaveBeenCalled();
  act(() => current.changeCurrency(mockCurrencies[1] as any));
  expect(mockUpdateCurrency).toHaveBeenCalledWith(mockCurrencies[1]);
  act(() => current.changeMail('person@example.com'));
  act(() => current.changePhone('123'));
  expect(mockUpdateMail).toHaveBeenCalledWith('person@example.com');
  expect(mockUpdatePhone).toHaveBeenCalledWith('123');
  expect(mockSetParams).toHaveBeenCalledWith({ mail: 'person@example.com' });
  expect(mockSetParams).toHaveBeenCalledWith({ phone: '123' });
  act(() => current.put('key', 'value'));
  expect(current.get('key')).toBe('value');
  expect(current.translateError('required')).toBe('Mandatory field');
  expect(current.translate('example', 'Text')).toBe('Text');
});

it('shows a new banner and records it when closed', async () => {
  const banner = { id: 5, message: 'Hello' };
  mockGetBanner.mockResolvedValue(banner);
  show();
  await waitFor(() => expect(current.infoBanner).toEqual(banner));
  expect(mockStoredBanner.remove).toHaveBeenCalled();
  act(() => current.closeInfoBanner());
  expect(mockStoredBanner.set).toHaveBeenCalledWith(banner);
  act(() => current.closeInfoBanner());
  expect(mockStoredBanner.set).toHaveBeenCalledTimes(1);
});

it('handles unavailable languages, currencies and a rejected KYC submission', async () => {
  mockLanguageList = undefined;
  mockCurrencyList = undefined;
  mockUser = { language: mockLanguages[0], kyc: { hash: 'hash' } };
  mockParams = {
    setParams: mockSetParams,
    accountType: 'Organization',
    country: 'CH',
    organizationName: 'Org',
    organizationCountry: 'CH',
  };
  mockSetData.mockRejectedValueOnce(new Error('failed'));
  show();
  await waitFor(() => expect(mockSetData).toHaveBeenCalled());
  await waitFor(() => expect(current.processingKycData).toBe(false));
  expect(current.availableLanguages).toEqual([]);
  expect(current.availableStickerLanguages).toEqual([]);
  act(() => current.changeCurrency(mockCurrencies[0] as any));
  expect(mockUpdateCurrency).not.toHaveBeenCalled();
});

it('finishes KYC processing without account type', async () => {
  mockUser = { language: mockLanguages[0], kyc: { hash: 'hash' } };
  show();
  await waitFor(() => expect(current.processingKycData).toBe(false));
  expect(mockSetData).not.toHaveBeenCalled();
});
