const mockCreateAccount = jest.fn();
const mockUpdateAccount = jest.fn();
const mockUpdateUser = jest.fn();
const mockChangeMail = jest.fn();
const mockUpdateMail = jest.fn();
const mockVerifyMail = jest.fn();
const mockUpdateCurrency = jest.fn();
const mockUpdateCallSettings = jest.fn();
const mockUpdateLanguage = jest.fn();
const mockCall = jest.fn();
const mockGenerateKeyCT = jest.fn();
const mockDeleteKeyCT = jest.fn();
const mockBank = {
  bankAccounts: [] as Array<Record<string, unknown>> | undefined,
  isLoading: false,
  createAccount: mockCreateAccount,
  updateAccount: mockUpdateAccount,
};
const mockRenameAddress = jest.fn();
const mockDeleteAddress = jest.fn();
const mockUserAddresses: Array<{ address: string; label?: string; blockchains?: string[] }> = [];
const mockUser: { user?: Record<string, unknown>; keyCT?: string } = {
  user: { mail: 'a@b.c', currency: { id: 1, name: 'CHF' }, kyc: { level: 50 } },
};
const mockCt = { generateKeyCT: mockGenerateKeyCT as jest.Mock };
const mockFiat: { currencies?: Array<{ id: number; name: string; buyable: boolean; sellable: boolean }> } = {
  currencies: [
    { id: 1, name: 'CHF', buyable: true, sellable: true },
    { id: 2, name: 'EUR', buyable: true, sellable: true },
  ],
};

jest.mock('@dfx.swiss/react', () => ({
  ApiException: class ApiException extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  KycLevel: { Completed: 50, Sell: 30 },
  PhoneCallTime: {
    H_9_TO_10: 'H9To10',
    H_10_TO_11: 'H10To11',
    H_11_TO_12: 'H11To12',
    H_12_TO_13: 'H12To13',
    H_13_TO_14: 'H13To14',
    H_14_TO_15: 'H14To15',
    H_15_TO_16: 'H15To16',
    H_9_TO_16: 'H9To16',
  },
  Blockchain: { ETHEREUM: 'Ethereum', BITCOIN: 'Bitcoin' },
  useBankAccountContext: () => mockBank,
  useFiatContext: () => mockFiat,
  useUserContext: () => ({
    user: mockUser.user,
    userAddresses: mockUserAddresses,
    update: mockUpdateUser,
    changeMail: mockChangeMail,
    updateMail: mockUpdateMail,
    verifyMail: mockVerifyMail,
    updateCurrency: mockUpdateCurrency,
    updateCallSettings: mockUpdateCallSettings,
    updateLanguage: mockUpdateLanguage,
    renameAddress: mockRenameAddress,
    deleteAddress: mockDeleteAddress,
    keyCT: mockUser.keyCT,
    generateKeyCT: mockCt.generateKeyCT,
    deleteKeyCT: mockDeleteKeyCT,
  }),
  useApi: () => ({ call: mockCall }),
  useLanguageContext: () => ({ languages: [{ symbol: 'EN', name: 'English' }] }),
}));

jest.mock('../wallets/session', () => ({
  useWalletSession: () => ({ isLoggedIn: true, address: '0xabc', userAddresses: [] }),
}));

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiException } from '@dfx.swiss/react';
import { AccountSheets, inviteReferralView } from '../components/AccountSheets';
import { LanguageProvider } from '../i18n';
import { ToastProvider } from '../components/ui';

const defaultReferral = { code: 'AB-CD12-EF34-GH', commission: 0.25, userCount: 2 };

function renderSheet(open: Parameters<typeof AccountSheets>[0]['open'], referral: unknown = defaultReferral) {
  const onClose = jest.fn();
  const ui = (nextOpen = open, nextReferral = referral) => (
    <LanguageProvider>
      <ToastProvider>
        <AccountSheets open={nextOpen} onClose={onClose} referral={nextReferral as never} />
      </ToastProvider>
    </LanguageProvider>
  );
  const view = render(ui());
  return Object.assign(view, {
    onClose,
    rerenderSheet: (nextOpen: Parameters<typeof AccountSheets>[0]['open'], nextReferral?: unknown) =>
      view.rerender(ui(nextOpen, nextReferral ?? referral)),
  });
}

describe('AccountSheets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.setItem('dfx_lang', 'en');
    mockBank.bankAccounts = [];
    mockBank.isLoading = false;
    mockCreateAccount.mockResolvedValue(undefined);
    mockUpdateAccount.mockResolvedValue(undefined);
    mockUpdateUser.mockResolvedValue(undefined);
    mockChangeMail.mockResolvedValue(undefined);
    mockUpdateMail.mockResolvedValue(undefined);
    mockUpdateCurrency.mockResolvedValue(undefined);
    mockUpdateCallSettings.mockResolvedValue(undefined);
    mockUpdateLanguage.mockResolvedValue(undefined);
    mockCall.mockResolvedValue([]);
    mockGenerateKeyCT.mockResolvedValue({ secret: 'ct-secret' });
    mockDeleteKeyCT.mockResolvedValue(undefined);
    mockRenameAddress.mockResolvedValue(undefined);
    mockDeleteAddress.mockResolvedValue(undefined);
    mockVerifyMail.mockResolvedValue(undefined);
    mockUserAddresses.length = 0;
    mockUser.user = { mail: 'a@b.c', currency: { id: 1, name: 'CHF' }, kyc: { level: 50 } };
    mockUser.keyCT = undefined;
    mockCt.generateKeyCT = mockGenerateKeyCT;
    mockFiat.currencies = [
      { id: 1, name: 'CHF', buyable: true, sellable: true },
      { id: 2, name: 'EUR', buyable: true, sellable: true },
    ];
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
  });

  it('lists bank accounts, edits, sets default, removes and adds', async () => {
    mockBank.bankAccounts = [
      {
        id: 1,
        iban: 'CH9300762011623852957',
        label: 'Main',
        default: true,
        preferredCurrency: { id: 1, name: 'CHF' },
      },
      { id: 2, iban: 'DE89370400440532013000', active: true },
    ];
    renderSheet('bankaccts');
    expect(screen.getByText('Main')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
    expect(screen.getByRole('button', { name: 'Set as default' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set as default' }));
    await waitFor(() => expect(mockUpdateAccount).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    fireEvent.change(screen.getByDisplayValue('Main'), { target: { value: 'Salary' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockUpdateAccount).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));
    await waitFor(() => expect(mockUpdateAccount).toHaveBeenCalledTimes(3));

    fireEvent.change(screen.getByPlaceholderText('CH.. / DE..'), { target: { value: 'not-iban' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(screen.getByText(/invalid iban/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('CH.. / DE..'), { target: { value: 'CH93 0076 2011 6238 5295 7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    await waitFor(() => expect(mockCreateAccount).toHaveBeenCalled());
  });

  it('opens email, currency, referral and verification sheets', async () => {
    const email = renderSheet('email');
    expect(screen.getByDisplayValue('a@b.c')).toBeInTheDocument();
    email.unmount();

    const currency = renderSheet('currency');
    fireEvent.click(screen.getByRole('button', { name: 'EUR' }));
    await waitFor(() => expect(mockUpdateCurrency).toHaveBeenCalled());
    currency.unmount();

    const referral = renderSheet('referral');
    expect(screen.getAllByText('AB-CD12-EF34-GH')[0]).toBeInTheDocument();
    referral.unmount();

    const vcall = renderSheet('vcall');
    fireEvent.click(screen.getByText('09:00–10:00'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockUpdateCallSettings).toHaveBeenCalled());
    vcall.unmount();

    const language = renderSheet('language');
    expect(screen.getAllByText(/english|deutsch/i)[0]).toBeInTheDocument();
    language.unmount();

    renderSheet('addresses');
    expect(screen.getAllByText(/no addresses|keine adressen|nessun indirizzo|aucune adresse/i)[0]).toBeInTheDocument();
  });

  it('generates, copies and deletes a CoinTracking key', async () => {
    mockGenerateKeyCT.mockResolvedValue({ secret: 'ct-secret' });
    mockDeleteKeyCT.mockResolvedValue(undefined);
    const view = renderSheet('ctkey');
    expect(await screen.findByText('ct-secret')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /secret|geheim/i }));
    fireEvent.click(screen.getByRole('button', { name: /remove connection|verbindung entfernen|rimuovi|supprimer la connexion/i }));
    await waitFor(() => expect(mockDeleteKeyCT).toHaveBeenCalled());
    view.unmount();
  });

  it('saves a new email address', async () => {
    renderSheet('email');
    const input = screen.getByDisplayValue('a@b.c');
    fireEvent.change(input, { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send code|code senden|invia codice|envoyer le code/i }));
    await waitFor(() => expect(mockUpdateMail).toHaveBeenCalled());
  });

  it('builds a referral view-model only when a code exists', () => {
    expect(inviteReferralView(undefined)).toBeNull();
    expect(inviteReferralView({} as never)).toBeNull();
    expect(inviteReferralView({ code: 'AB-CD12-EF34-GH', commission: 0.2, userCount: 3 } as never)).toEqual({
      code: 'AB-CD12-EF34-GH',
      link: 'https://app.dfx.swiss/login?code=AB-CD12-EF34-GH',
      commission: 0.2,
      userCount: 3,
    });
  });

  it('surfaces CoinTracking generate errors', async () => {
    mockGenerateKeyCT.mockRejectedValueOnce(new ApiException(409, 'exists'));
    const conflict = renderSheet('ctkey');
    expect(await screen.findByText('Connected')).toBeInTheDocument();
    conflict.unmount();

    mockGenerateKeyCT.mockRejectedValueOnce(new Error('down'));
    renderSheet('ctkey');
    expect(await screen.findByText(/something went wrong|schiefgelaufen|storto|produite/i)).toBeInTheDocument();
  });

  it('shows bank loading and a short unlabelled IBAN', () => {
    mockBank.isLoading = true;
    mockBank.bankAccounts = undefined;
    mockFiat.currencies = undefined;
    const loading = renderSheet('bankaccts');
    expect(within(screen.getByRole('dialog')).getByText('Loading…')).toBeInTheDocument();
    loading.unmount();

    mockBank.isLoading = false;
    mockBank.bankAccounts = [
      { id: 9, iban: '12', active: false },
      { id: 3, iban: 'AB12', default: false },
      { id: 4, iban: undefined },
    ];
    renderSheet('bankaccts');
    expect(within(screen.getByRole('dialog')).getByText('AB12')).toBeInTheDocument();
    expect(screen.queryByText('12')).not.toBeInTheDocument();
    expect(screen.queryByText('No bank accounts yet.')).not.toBeInTheDocument();
  });

  it('toggles bank edit/remove and surfaces save, default, remove and add errors', async () => {
    mockBank.bankAccounts = [{ id: 3, iban: 'AB12', default: false }];
    renderSheet('bankaccts');
    const bank = () => screen.getByRole('dialog');
    fireEvent.change(within(bank()).getByRole('combobox'), { target: { value: '' } });
    fireEvent.keyDown(within(bank()).getByPlaceholderText('CH.. / DE..'), { key: 'Tab' });
    fireEvent.keyDown(within(bank()).getByPlaceholderText('CH.. / DE..'), { key: 'Enter' });
    expect(within(bank()).getByText('Invalid IBAN length')).toBeInTheDocument();

    fireEvent.click(within(bank()).getByRole('button', { name: 'Edit' }));
    fireEvent.click(within(bank()).getByRole('button', { name: 'Edit' }));
    fireEvent.click(within(bank()).getByRole('button', { name: 'Remove' }));
    fireEvent.click(within(bank()).getByRole('button', { name: 'Remove' }));
    fireEvent.click(within(bank()).getByRole('button', { name: 'Remove' }));
    fireEvent.click(within(bank()).getByRole('button', { name: 'Cancel' }));

    mockUpdateAccount.mockRejectedValueOnce(new Error('save'));
    fireEvent.click(within(bank()).getByRole('button', { name: 'Edit' }));
    fireEvent.change(within(bank()).getAllByRole('combobox')[0], { target: { value: '' } });
    fireEvent.click(within(bank()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeInTheDocument());

    mockUpdateAccount.mockRejectedValueOnce(new Error('default'));
    fireEvent.click(within(bank()).getByRole('button', { name: 'Set as default' }));
    await waitFor(() => expect(mockUpdateAccount).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeInTheDocument());

    mockUpdateAccount.mockRejectedValueOnce(new Error('remove'));
    fireEvent.click(within(bank()).getByRole('button', { name: 'Remove' }));
    fireEvent.click(within(bank()).getByRole('button', { name: 'Yes, remove' }));
    await waitFor(() => expect(mockUpdateAccount).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeInTheDocument());

    mockCreateAccount.mockRejectedValueOnce(new Error('add'));
    fireEvent.change(within(bank()).getByPlaceholderText('CH.. / DE..'), { target: { value: 'CH93 0076 2011 6238 5295 7' } });
    fireEvent.change(within(bank()).getAllByRole('textbox')[1], { target: { value: 'Savings' } });
    fireEvent.change(within(bank()).getAllByRole('combobox')[0], { target: { value: '2' } });
    fireEvent.click(within(bank()).getByRole('button', { name: 'Add account' }));
    await waitFor(() => expect(within(bank()).getByText('Something went wrong')).toBeInTheDocument());
  });

  it('adds a labelled bank account via Enter and preferred currency', async () => {
    mockBank.bankAccounts = [];
    renderSheet('bankaccts');
    expect(screen.getByText(/no bank accounts yet|noch keine bankkonten|nessun conto|aucun compte/i)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('CH.. / DE..'), { target: { value: 'CH93 0076 2011 6238 5295 7' } });
    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'Salary' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
    fireEvent.keyDown(screen.getByPlaceholderText('CH.. / DE..'), { key: 'Enter' });
    await waitFor(() =>
      expect(mockCreateAccount).toHaveBeenCalledWith({
        iban: 'CH9300762011623852957',
        label: 'Salary',
        preferredCurrency: { id: 1, name: 'CHF', buyable: true, sellable: true },
      }),
    );
  });

  it('renames, removes and toggles linked wallet addresses', async () => {
    mockUserAddresses.push(
      { address: '0xAAA111222333', label: 'Hot' },
      { address: '0xBBB444555666' },
    );
    mockUser.user = {
      mail: 'a@b.c',
      currency: { id: 1, name: 'CHF' },
      kyc: { level: 50 },
      activeAddress: { address: '0xAAA111222333' },
    };
    const view = renderSheet('addresses');
    const addr = () => screen.getByRole('dialog');
    expect(within(addr()).getByText('Hot')).toBeInTheDocument();
    expect(within(addr()).getByText('Active')).toBeInTheDocument();

    fireEvent.click(within(addr()).getAllByRole('button', { name: 'Rename' })[0]);
    fireEvent.click(within(addr()).getAllByRole('button', { name: 'Rename' })[0]);
    fireEvent.click(within(addr()).getAllByRole('button', { name: 'Rename' })[0]);
    fireEvent.change(within(addr()).getByDisplayValue('Hot'), { target: { value: 'Cold' } });
    fireEvent.click(within(addr()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockRenameAddress).toHaveBeenCalledWith('0xAAA111222333', 'Cold'));

    mockRenameAddress.mockRejectedValueOnce(new Error('rename'));
    fireEvent.click(within(addr()).getAllByRole('button', { name: 'Rename' })[1]);
    fireEvent.click(within(addr()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockRenameAddress).toHaveBeenCalledTimes(2));

    fireEvent.click(within(addr()).getAllByRole('button', { name: 'Remove' })[1]);
    fireEvent.click(within(addr()).getAllByRole('button', { name: 'Remove' })[1]);
    fireEvent.click(within(addr()).getAllByRole('button', { name: 'Remove' })[1]);
    fireEvent.click(within(addr()).getByRole('button', { name: 'Cancel' }));

    mockDeleteAddress.mockRejectedValueOnce(new Error('del'));
    fireEvent.click(within(addr()).getAllByRole('button', { name: 'Remove' })[1]);
    fireEvent.click(within(addr()).getByRole('button', { name: 'Yes, remove' }));
    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeInTheDocument());

    mockDeleteAddress.mockResolvedValueOnce(undefined);
    fireEvent.click(within(addr()).getByRole('button', { name: 'Yes, remove' }));
    await waitFor(() => expect(mockDeleteAddress).toHaveBeenCalledWith('0xBBB444555666'));
    expect(view.onClose).not.toHaveBeenCalled();

    mockDeleteAddress.mockResolvedValueOnce(undefined);
    fireEvent.click(within(addr()).getAllByRole('button', { name: 'Remove' })[0]);
    fireEvent.click(within(addr()).getByRole('button', { name: 'Yes, remove' }));
    await waitFor(() => expect(view.onClose).toHaveBeenCalled());
  });

  it('validates, sends and verifies a new email including error paths', async () => {
    mockUser.user = { kyc: { level: 50 } };
    const view = renderSheet('email');
    const sheet = () => screen.getByRole('dialog');
    const mail = within(sheet()).getByPlaceholderText('you@email.com');
    fireEvent.keyDown(mail, { key: 'Tab' });
    fireEvent.click(within(sheet()).getByRole('button', { name: /send code|code senden|invia codice|envoyer le code/i }));
    expect(within(sheet()).getByText(/add an email|gib eine e-mail|aggiungi un'email|ajoute un e-mail/i)).toBeInTheDocument();

    fireEvent.change(mail, { target: { value: 'not-mail' } });
    fireEvent.keyDown(mail, { key: 'Enter' });
    expect(mockUpdateMail).not.toHaveBeenCalled();

    mockUpdateMail.mockRejectedValueOnce(new ApiException(409, 'taken'));
    fireEvent.change(mail, { target: { value: 'taken@example.com' } });
    fireEvent.click(within(sheet()).getByRole('button', { name: /send code|code senden|invia codice|envoyer le code/i }));
    await waitFor(() =>
      expect(within(sheet()).getByText(/already belongs|gehört bereits|appartiene già|appartient déjà/i)).toBeInTheDocument(),
    );

    mockUpdateMail.mockRejectedValueOnce(new Error('down'));
    fireEvent.click(within(sheet()).getByRole('button', { name: /send code|code senden|invia codice|envoyer le code/i }));
    await waitFor(() =>
      expect(within(sheet()).getByText(/could not send|konnte den code|impossibile inviare|impossible d'envoyer/i)).toBeInTheDocument(),
    );

    mockUpdateMail.mockResolvedValueOnce(undefined);
    fireEvent.click(within(sheet()).getByRole('button', { name: /send code|code senden|invia codice|envoyer le code/i }));
    const code = await screen.findByPlaceholderText('000000');
    fireEvent.keyDown(code, { key: 'Tab' });
    fireEvent.click(within(sheet()).getByRole('button', { name: /verify|bestätigen|verifica|vérifier/i }));
    expect(mockVerifyMail).not.toHaveBeenCalled();

    fireEvent.change(code, { target: { value: '12' } });
    fireEvent.keyDown(code, { key: 'Enter' });
    expect(mockVerifyMail).not.toHaveBeenCalled();

    mockVerifyMail.mockRejectedValueOnce(new Error('bad'));
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.keyDown(code, { key: 'Enter' });
    await waitFor(() =>
      expect(within(sheet()).getByText(/invalid or expired|ungültiger oder|non valido o scaduto|invalide ou expiré/i)).toBeInTheDocument(),
    );

    mockVerifyMail.mockResolvedValueOnce(undefined);
    fireEvent.change(code, { target: { value: '654321' } });
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(view.onClose).toHaveBeenCalled());
  });

  it('toggles verification-call slots and surfaces a save error', async () => {
    mockUser.user = {
      mail: 'a@b.c',
      kyc: { level: 50, phoneCallAccepted: true, preferredPhoneTimes: ['H9To10'] },
    };
    mockUpdateCallSettings.mockRejectedValueOnce(new Error('down'));
    renderSheet('vcall');
    const accept = screen.getByRole('checkbox');
    expect(accept).toBeChecked();
    fireEvent.click(accept);
    fireEvent.click(screen.getByText('09:00–10:00'));
    fireEvent.click(screen.getByText('10:00–11:00'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeInTheDocument());
  });

  it('copies and deletes an existing CoinTracking key and reports copy/delete failures', async () => {
    mockUser.keyCT = 'stored-key';
    renderSheet('ctkey');
    expect(screen.getByText('stored-key')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /api key|api-schlüssel|chiave api|clé api/i }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('stored-key'));

    mockDeleteKeyCT.mockRejectedValueOnce(new Error('del'));
    fireEvent.click(screen.getByRole('button', { name: /remove connection|verbindung entfernen|rimuovi|supprimer la connexion/i }));
    await waitFor(() => expect(mockDeleteKeyCT).toHaveBeenCalled());

    const clipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    fireEvent.click(screen.getByRole('button', { name: /api key|api-schlüssel|chiave api|clé api/i }));
    expect(screen.getByText(/couldn't copy|kopieren fehlgeschlagen|copia non riuscita|copie impossible/i)).toBeInTheDocument();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: jest.fn().mockRejectedValue(new Error('denied')) },
    });
    fireEvent.click(screen.getByRole('button', { name: /api key|api-schlüssel|chiave api|clé api/i }));
    await waitFor(() =>
      expect(screen.getByText(/couldn't copy|kopieren fehlgeschlagen|copia non riuscita|copie impossible/i)).toBeInTheDocument(),
    );
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
  });

  it('skips generating a CoinTracking key when one is already in flight', async () => {
    let finish: (value: { secret: string }) => void = () => undefined;
    mockGenerateKeyCT.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const view = renderSheet('ctkey');
    await waitFor(() => expect(mockGenerateKeyCT).toHaveBeenCalledTimes(1));
    mockCt.generateKeyCT = jest.fn().mockResolvedValue({ secret: 'other' });
    view.rerenderSheet('ctkey');
    expect(mockCt.generateKeyCT).not.toHaveBeenCalled();
    finish({ secret: 'ct-secret' });
    expect(await screen.findByText('ct-secret')).toBeInTheDocument();
  });

  it('toasts when display-currency update fails', async () => {
    mockUpdateCurrency.mockRejectedValueOnce(new Error('down'));
    renderSheet('currency');
    fireEvent.click(screen.getByRole('button', { name: 'EUR' }));
    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeInTheDocument());
  });

  it('treats a non-array recommendation payload as an empty list', async () => {
    mockCall.mockResolvedValueOnce({ not: 'a-list' });
    renderSheet('referral', null);
    expect(await screen.findByText("You haven't invited anyone yet.")).toBeInTheDocument();
  });

  it('loads referral recs, copies the link and covers every status chip', async () => {
    mockUser.user = { mail: 'a@b.c', kyc: { level: 20 } };
    mockCall.mockResolvedValueOnce([
      { id: 1, name: 'Ada', mail: 'ada@x.c', status: 'Completed' },
      { id: 2, mail: 'only@x.c', status: 'Pending' },
      { id: 3, status: 'Rejected' },
      { id: 4, status: 'Expired' },
      { id: 5, name: 'Bob', code: 'ZZ-YY', status: 'Created' },
      { id: 6, status: 'Unknown' },
    ]);
    renderSheet('referral', { code: 'AB-CD12-EF34-GH', commission: 0, userCount: 0 });
    expect(await screen.findByText('Ada')).toBeInTheDocument();
    expect(screen.getByText(/you need a verified|du brauchst ein verifiziertes|serve un account verificato|un compte vérifié/i)).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('only@x.c')).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();
    expect(screen.getByText(/confirmed|bestätigt|confirmé/i)).toBeInTheDocument();
    expect(screen.getByText(/rejected|abgelehnt|rifiutato|refusée/i)).toBeInTheDocument();
    expect(screen.getByText(/expired|abgelaufen|scaduto|expiré/i)).toBeInTheDocument();

    const copies = screen.getAllByRole('button', { name: /copy invite link|einladungslink kopieren|copia link|copier le lien/i });
    copies.forEach((btn) => fireEvent.click(btn));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
  });

  it('creates personal invites and confirms or rejects pending ones', async () => {
    mockCall.mockImplementation(async (req: { url: string; method: string; data?: Record<string, string> }) => {
      if (req.method === 'GET') {
        return [{ id: 8, name: 'Pat', status: 'Pending' }];
      }
      return {};
    });
    renderSheet('referral');
    expect(await screen.findByText('Pat')).toBeInTheDocument();

    const generate = () => within(screen.getByRole('dialog')).getByRole('button', { name: 'Generate invite' });
    fireEvent.click(generate());
    expect(mockCall.mock.calls.some((call) => call[0].method === 'POST')).toBe(false);

    const invite = () => screen.getByRole('dialog');
    fireEvent.change(within(invite()).getByPlaceholderText('e.g. Anna M.'), { target: { value: 'Sam' } });
    fireEvent.change(within(invite()).getByPlaceholderText('you@email.com'), { target: { value: 'not-mail' } });
    fireEvent.click(generate());
    expect(mockCall.mock.calls.some((call) => call[0].method === 'POST')).toBe(false);

    fireEvent.change(within(invite()).getByPlaceholderText('you@email.com'), { target: { value: '' } });
    fireEvent.click(generate());
    await waitFor(() => expect(screen.getByText('Invite created')).toBeInTheDocument());
    expect(mockCall).toHaveBeenCalledWith({
      url: '/recommendation',
      method: 'POST',
      data: { recommendedAlias: 'Sam' },
    });

    fireEvent.change(within(invite()).getByPlaceholderText('e.g. Anna M.'), { target: { value: 'Sam' } });
    fireEvent.change(within(invite()).getByPlaceholderText('you@email.com'), { target: { value: 'sam@x.c' } });
    fireEvent.click(generate());
    await waitFor(() =>
      expect(mockCall).toHaveBeenCalledWith({
        url: '/recommendation',
        method: 'POST',
        data: { recommendedAlias: 'Sam', recommendedMail: 'sam@x.c' },
      }),
    );
    await waitFor(() => expect(generate()).not.toBeDisabled());

    fireEvent.click(within(invite()).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.getByText('Invitation confirmed')).toBeInTheDocument());
    fireEvent.click(within(invite()).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(screen.getByText('Invitation rejected')).toBeInTheDocument());
  });

  it('surfaces invite load, submit and confirm failures', async () => {
    mockCall.mockRejectedValueOnce(new Error('down'));
    const loadFail = renderSheet('referral', null);
    expect(await screen.findByText("Couldn't load — check your connection.")).toBeInTheDocument();
    mockCall.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText("You haven't invited anyone yet.")).toBeInTheDocument());

    const invite = () => screen.getByRole('dialog');
    const generate = () => within(invite()).getByRole('button', { name: 'Generate invite' });
    mockCall.mockImplementation(async (req: { method: string }) => {
      if (req.method === 'GET') return [];
      throw new ApiException(403, 'KYC level too low');
    });
    fireEvent.change(within(invite()).getByPlaceholderText('e.g. Anna M.'), { target: { value: 'Sam' } });
    fireEvent.click(generate());
    await waitFor(() => expect(screen.getByText(/You need a verified account/)).toBeInTheDocument());

    mockCall.mockImplementation(async (req: { method: string }) => {
      if (req.method === 'GET') return [];
      throw new ApiException(500, '');
    });
    fireEvent.click(generate());
    await waitFor(() => expect(screen.getAllByText('Something went wrong').length).toBeGreaterThan(0));

    mockCall.mockImplementation(async (req: { method: string }) => {
      if (req.method === 'GET') return [];
      throw new Error('nope');
    });
    fireEvent.click(generate());
    await waitFor(() => expect(screen.getAllByText('Something went wrong').length).toBeGreaterThan(0));
    loadFail.unmount();

    mockCall.mockImplementation(async (req: { url: string; method: string }) => {
      if (req.method === 'GET') return [{ id: 9, name: 'Pat', status: 'Pending' }];
      if (req.method === 'PUT') throw new Error('busy');
      return {};
    });
    renderSheet('referral');
    expect(await screen.findByText('Pat')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeInTheDocument());
  });
});
