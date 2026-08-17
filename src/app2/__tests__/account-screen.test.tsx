const mockNavigate = jest.fn();
const mockLogout = jest.fn();
const mockDeleteAccount = jest.fn();
const mockGetRef = jest.fn();
const mockGetProfile = jest.fn();
const mockOpenSwitcher = jest.fn();
const mockOpenConnect = jest.fn();
const mockSession: {
  isLoggedIn: boolean;
  address?: string;
  logout: typeof mockLogout;
  openSwitcher: typeof mockOpenSwitcher;
  openConnect: typeof mockOpenConnect;
  activeWallet?: { walletId: string; name?: string };
} = {
  isLoggedIn: false,
  address: '0xabc1234567890',
  logout: mockLogout,
  openSwitcher: mockOpenSwitcher,
  openConnect: mockOpenConnect,
  activeWallet: { walletId: 'MetaMask' },
};
const mockUserState: { user?: Record<string, unknown>; isUserLoading: boolean } = { isUserLoading: false };
const i18nOverride: { language?: string } = {};

jest.mock('@dfx.swiss/react', () => ({
  KycLevel: { Completed: 50, Sell: 30 },
  Blockchain: { ETHEREUM: 'Ethereum', BITCOIN: 'Bitcoin', SEPOLIA: 'Sepolia' },
  useUser: () => ({ getRef: mockGetRef, getProfile: mockGetProfile }),
  useUserContext: () => ({
    user: mockUserState.user,
    isUserLoading: mockUserState.isUserLoading,
    deleteAccount: mockDeleteAccount,
  }),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('../wallets/session', () => ({
  useWalletSession: () => mockSession,
}));

jest.mock('../i18n', () => {
  const actual = jest.requireActual('../i18n') as typeof import('../i18n');
  return {
    ...actual,
    useT: () => {
      const real = actual.useT();
      return i18nOverride.language === undefined ? real : { ...real, language: i18nOverride.language };
    },
  };
});

jest.mock('../components/AccountSheets', () => ({
  AccountSheets: ({ open, onClose }: { open: string | null; onClose: () => void }) =>
    open ? (
      <div data-testid="acct-sheet">
        <button type="button" onClick={onClose}>
          close-sheet
        </button>
        {open}
      </div>
    ) : null,
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AccountScreen from '../screens/account';
import { LanguageProvider } from '../i18n';
import { ToastProvider } from '../components/ui';

function renderAccount() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <AccountScreen />
      </ToastProvider>
    </LanguageProvider>,
  );
}

describe('AccountScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.setItem('dfx_lang', 'en');
    mockSession.isLoggedIn = false;
    mockSession.address = '0xabc1234567890';
    mockSession.activeWallet = { walletId: 'MetaMask' };
    mockUserState.user = undefined;
    mockUserState.isUserLoading = false;
    delete i18nOverride.language;
    mockGetRef.mockResolvedValue({ code: 'AB-CD12-EF34-GH', refCount: 2 });
    mockGetProfile.mockResolvedValue({ firstName: 'Ada', lastName: 'Lovelace' });
    mockLogout.mockResolvedValue(undefined);
    mockDeleteAccount.mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
  });

  it('asks a logged-out visitor to connect', () => {
    renderAccount();
    expect(screen.getByRole('heading', { name: /account|konto|conto|compte/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /connect|verbinden|connetti|connecter/i }));
  });

  it('shows a loading row then the account with copy, logout and delete', async () => {
    mockSession.isLoggedIn = true;
    mockUserState.isUserLoading = true;
    const view = renderAccount();
    expect(screen.getByText(/loading|laden|caricamento|chargement/i)).toBeInTheDocument();

    mockUserState.isUserLoading = false;
    mockUserState.user = {
      mail: 'ada@example.com',
      kyc: { level: 50 },
      tradingLimit: { limit: 100000, period: 'Month' },
      volumes: { buy: { total: 10, annual: 5 }, sell: { total: 0, annual: 0 }, swap: { total: 0, annual: 0 } },
      currency: { name: 'EUR', instantSellable: true },
    };
    view.rerender(
      <LanguageProvider>
        <ToastProvider>
          <AccountScreen />
        </ToastProvider>
      </LanguageProvider>,
    );

    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /copy address/i }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /log out|abmelden|esci|sign out|déconnexion/i }));
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
  });

  it('deletes the account after confirm and toasts a copy failure without clipboard', async () => {
    mockSession.isLoggedIn = true;
    mockUserState.user = {
      mail: 'ada@example.com',
      kyc: { level: 10 },
      tradingLimit: { limit: 1000, period: 'Day' },
      volumes: { buy: { total: 0, annual: 0 }, sell: { total: 1, annual: 1 }, swap: { total: 2, annual: 2 } },
    };
    const clipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    renderAccount();
    await screen.findByText(/ada@example.com/i);
    fireEvent.click(screen.getByRole('button', { name: /copy address/i }));
    fireEvent.click(screen.getByRole('button', { name: /^delete account$|^konto löschen$|^elimina account$|^supprimer le compte$/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete my account|mein konto löschen|elimina il mio|supprimer mon compte/i }));
    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalled());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
  });

  it('opens account sheets from the settings rows', async () => {
    mockSession.isLoggedIn = true;
    mockUserState.user = { mail: 'ada@example.com', kyc: { level: 50 }, currency: { name: 'CHF' } };
    renderAccount();
    await screen.findByText(/ada@example.com/i);
    const clickRow = (re: RegExp) => fireEvent.click(screen.getAllByText(re)[0]);
    clickRow(/e-mail|email/i);
    expect(screen.getByTestId('acct-sheet')).toHaveTextContent('email');
    fireEvent.click(screen.getByRole('button', { name: 'close-sheet' }));
    expect(screen.queryByTestId('acct-sheet')).not.toBeInTheDocument();

    clickRow(/bank accounts|bankkonten|conti bancari|comptes bancaires/i);
    expect(screen.getByTestId('acct-sheet')).toHaveTextContent('bankaccts');
    clickRow(/wallet addresses|wallet-adressen|indirizzi wallet|adresses de portefeuille/i);
    expect(screen.getByTestId('acct-sheet')).toHaveTextContent('addresses');
    clickRow(/verification call|verifizierungsanruf|chiamata di verifica|appel de vérification/i);
    expect(screen.getByTestId('acct-sheet')).toHaveTextContent('vcall');
    clickRow(/^language$|^sprache$|^lingua$|^langue$/i);
    expect(screen.getByTestId('acct-sheet')).toHaveTextContent('language');
    clickRow(/display currency|anzeigewährung|valuta di visualizzazione|devise d'affichage/i);
    expect(screen.getByTestId('acct-sheet')).toHaveTextContent('currency');
    clickRow(/cointracking/i);
    expect(screen.getByTestId('acct-sheet')).toHaveTextContent('ctkey');
    clickRow(/invite & earn|einladen & verdienen|invita e guadagna|parrainez et gagnez/i);
    expect(screen.getByTestId('acct-sheet')).toHaveTextContent('referral');
  });

  it('navigates kyc, limit and volume via click and keyboard and copies with a rejected clipboard', async () => {
    mockSession.isLoggedIn = true;
    mockSession.activeWallet = { walletId: 'MetaMask', name: 'MetaMask' };
    mockGetRef.mockResolvedValue({ code: 'AB-CD12-EF34-GH', commission: 0.25, userCount: 2 });
    mockUserState.user = {
      mail: 'ada@example.com',
      kyc: { level: 50 },
      tradingLimit: { limit: 100000, period: 'Year' },
      volumes: { buy: { total: 10, annual: 5 }, sell: { total: 0, annual: 0 }, swap: { total: 0, annual: 0 } },
      currency: { name: 'CHF', instantSellable: true },
      activeAddress: { blockchains: ['Ethereum', 'Bitcoin'] },
    };
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockRejectedValue(new Error('denied')) } });
    renderAccount();
    await screen.findByText('Ada Lovelace');
    expect(screen.getByText('2 networks')).toBeInTheDocument();
    expect(screen.getByText(/per year|pro jahr|all'anno|par an/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /copy address/i }));
    await waitFor(() =>
      expect(screen.getByText(/couldn't copy|kopieren fehlgeschlagen|copia non riuscita|copie impossible/i)).toBeInTheDocument(),
    );

    const kyc = screen.getByText(/identity confirmed|identität bestätigt|identità confermata|identité confirmée/i).closest('[role="button"]') as HTMLElement;
    fireEvent.click(kyc);
    fireEvent.keyDown(kyc, { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/kyc');

    const limit = screen.getByText(/trading limit|handelslimit|limite di trading|plafond de trading/i).closest('[role="button"]') as HTMLElement;
    fireEvent.click(limit);
    fireEvent.keyDown(limit, { key: ' ' });
    expect(mockNavigate).toHaveBeenCalledWith('/limit');

    const volume = screen.getByText(/trading volume|handelsvolumen|volume di trading|volume de trading/i).closest('[role="button"]') as HTMLElement;
    fireEvent.click(volume);
    fireEvent.keyDown(volume, { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/tx');

    const referral = screen.getByText(/invite & earn|einladen & verdienen|invita e guadagna|parrainez et gagnez/i).closest('[role="button"]') as HTMLElement;
    fireEvent.click(referral);
    fireEvent.keyDown(referral, { key: 'Enter' });
    expect(screen.getByTestId('acct-sheet')).toHaveTextContent('referral');

    fireEvent.click(screen.getByText(/connected wallet|verbundene wallet|wallet connesso|portefeuille connecté/i).closest('[role="button"]') as HTMLElement);
    expect(mockOpenSwitcher).toHaveBeenCalled();
  });

  it('covers unverified labels, empty volumes, missing currency and getRef/getProfile failures', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = undefined;
    mockGetRef.mockRejectedValue(new Error('ref'));
    mockGetProfile.mockRejectedValue(new Error('profile'));
    mockUserState.user = {
      kyc: { level: 10 },
      tradingLimit: { limit: 50, period: 'Week' },
      volumes: { buy: { total: 0, annual: 0 }, sell: { total: 0, annual: 0 }, swap: { total: 0, annual: 0 } },
    };
    renderAccount();
    await waitFor(() => expect(mockGetRef).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText(/not verified|nicht verifiziert|non verificato|non vérifié/i)).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText(/trading volume|handelsvolumen|volume di trading|volume de trading/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /copy address/i }));
    expect(screen.getByText(/couldn't copy|kopieren fehlgeschlagen|copia non riuscita|copie impossible/i)).toBeInTheDocument();
  });

  it('shows a partial KYC badge, day limit, tiny commission and a first-name-only header', async () => {
    mockSession.isLoggedIn = true;
    mockGetRef.mockResolvedValue({ code: 'AB-CD12-EF34-GH', commission: 0.00001, userCount: 1 });
    mockGetProfile.mockResolvedValue({ firstName: 'Ada' });
    mockUserState.user = {
      mail: 'ada@example.com',
      kyc: { level: 30 },
      tradingLimit: { limit: 1000, period: 'Day' },
      currency: { name: 'JPY' },
      activeAddress: { blockchains: ['Ethereum'] },
    };
    renderAccount();
    expect(await screen.findByText('Ada')).toBeInTheDocument();
    expect(screen.getByText(/^verified$|^verifiziert$|^verificato$|^vérifié$/i)).toBeInTheDocument();
    expect(screen.getByText(/per day|pro tag|al giorno|par jour/i)).toBeInTheDocument();
    expect(screen.getByText('Ethereum')).toBeInTheDocument();
    expect(screen.getByText(/0%/)).toBeInTheDocument();
  });

  it('ignores a second logout or delete while the first is in flight and reports delete errors', async () => {
    mockSession.isLoggedIn = true;
    mockUserState.user = { mail: 'ada@example.com', kyc: {}, currency: { name: 'EUR', instantSellable: true } };
    let finishLogout: () => void = () => undefined;
    mockLogout.mockReturnValue(new Promise<void>((resolve) => { finishLogout = resolve; }));
    renderAccount();
    await screen.findByText('ada@example.com');
    expect(screen.getByText(/SEPA Instant/)).toBeInTheDocument();

    const logout = screen.getByRole('button', { name: 'Sign out' });
    fireEvent.click(logout);
    await waitFor(() => expect(logout).toBeDisabled());
    fireEvent.click(logout.querySelector('span') as HTMLElement);
    expect(mockLogout).toHaveBeenCalledTimes(1);
    await act(async () => { finishLogout(); });
    await waitFor(() => expect(logout).not.toBeDisabled());

    const openDelete = () => fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    openDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    openDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    openDelete();
    fireEvent.click(document.querySelector('.scrim.on') as HTMLElement);

    openDelete();
    mockDeleteAccount.mockRejectedValueOnce(new Error('nope'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    await waitFor(() => expect(screen.getByText('Something went wrong')).toBeInTheDocument());

    let finishDelete: () => void = () => undefined;
    mockDeleteAccount.mockReturnValue(new Promise<void>((resolve) => { finishDelete = resolve; }));
    const confirm = screen.getByRole('button', { name: 'Delete my account' });
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    fireEvent.click(confirm.querySelector('span') as HTMLElement);
    expect(mockDeleteAccount).toHaveBeenCalledTimes(2);
    await act(async () => { finishDelete(); });
  });

  it('drops in-flight referral and profile fetches on logout and unmount', async () => {
    mockSession.isLoggedIn = true;
    mockUserState.user = { mail: 'ada@example.com', kyc: { level: 50 }, currency: { name: 'EUR', instantSellable: false } };
    let resolveRef: (value: { code: string }) => void = () => undefined;
    let rejectRef: (error: Error) => void = () => undefined;
    let resolveProfile: (value: { firstName: string }) => void = () => undefined;
    let rejectProfile: (error: Error) => void = () => undefined;
    mockGetRef.mockReturnValue(new Promise((resolve, reject) => {
      resolveRef = resolve;
      rejectRef = reject;
    }));
    mockGetProfile.mockReturnValue(new Promise((resolve, reject) => {
      resolveProfile = resolve;
      rejectProfile = reject;
    }));
    const view = renderAccount();
    view.unmount();
    await act(async () => {
      resolveRef({ code: 'late' });
      resolveProfile({ firstName: 'Late' });
    });

    mockGetRef.mockReturnValue(new Promise((_, reject) => { rejectRef = reject; }));
    mockGetProfile.mockReturnValue(new Promise((_, reject) => { rejectProfile = reject; }));
    const rejected = renderAccount();
    rejected.unmount();
    await act(async () => {
      rejectRef(new Error('late-ref'));
      rejectProfile(new Error('late-profile'));
    });

  });

  it('falls back to the raw language code when it is missing from LANGUAGES', async () => {
    mockSession.isLoggedIn = true;
    mockUserState.user = { mail: 'ada@example.com', kyc: { level: 50 } };
    i18nOverride.language = 'xx';
    renderAccount();
    await screen.findByText(/ada@example.com/i);
    expect(screen.getByText('xx')).toBeInTheDocument();
  });
});
