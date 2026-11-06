jest.mock('@dfx.swiss/react/dist/definitions/auth', () => ({
  AuthWalletType: { METAMASK: 'MetaMask', ALBY: 'Alby', WALLET_BROWSER: 'WalletBrowser', RABBY: 'Rabby' },
}));

const mockLogout = jest.fn(() => Promise.resolve());
let mockCurrency: { name: string } | undefined;
let mockUser: { id: number } | undefined;
let mockCurrencies: { name: string }[] | undefined;
const mockChangeCurrency = jest.fn();
const mockGetAuthToken = jest.fn((): string | undefined => undefined);

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { ETHEREUM: 'Ethereum', BITCOIN: 'Bitcoin' },
  Utils: { isJwt: () => false },
  useApiSession: () => ({ updateSession: () => undefined }),
  useAuth: () => ({ getSignMessage: () => undefined }),
  useAuthContext: () => ({ getAuthToken: () => mockGetAuthToken() }),
  useFiatContext: () => ({ currencies: mockCurrencies }),
  useSessionContext: () => ({
    isInitialized: false,
    isLoggedIn: false,
    logout: () => mockLogout(),
    authenticate: () => undefined,
  }),
  useUserContext: () => ({ user: mockUser, addSpecialCode: () => undefined, reloadUser: () => undefined }),
}));

const mockNavigate = jest.fn();
const mockOnLogin = jest.fn();
const mockOnCancel = jest.fn();
const mockOnSwitch = jest.fn();

jest.mock('../hooks/navigation.hook', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

jest.mock('../hooks/wallets/metamask.hook', () => ({
  WalletType: { META_MASK: 'MetaMask', RABBY: 'Rabby', IN_APP_BROWSER: 'InAppBrowser' },
  useMetaMask: () => ({ getWalletType: () => undefined }),
}));

jest.mock('../hooks/store.hook', () => ({
  useStore: () => ({
    activeWallet: { get: () => undefined, set: () => undefined, remove: () => undefined },
  }),
}));

jest.mock('../contexts/balance.context', () => ({
  useBalanceContext: () => ({ readBalances: () => undefined }),
}));

jest.mock('browser-lang', () => ({
  __esModule: true,
  default: () => 'en',
}));

jest.mock('jwt-decode', () => ({
  jwtDecode: () => ({}),
}));

jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({ isInitialized: true, params: {}, setRedirectPath: () => undefined }),
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_key: string, defaultText: string) => defaultText,
    availableLanguages: [],
    locale: 'en-US',
    currency: mockCurrency,
    changeCurrency: mockChangeCurrency,
    changeLanguage: () => undefined,
  }),
}));

jest.mock('../components/payment/qr-code', () => ({
  QrCopy: ({ data }: { data: string }) => <div data-testid="receive-qr">{data}</div>,
}));

const mockCheckPasskeyPlatform = jest.fn(() => new Promise(() => undefined));
const mockRegister = jest.fn();
const mockLogin = jest.fn();
const mockClaim = jest.fn();
const mockLink = jest.fn();
const mockUnlock = jest.fn();
const mockRevoke = jest.fn();
const mockExport = jest.fn();
const mockVerify = jest.fn();
const mockWallets = jest.fn();
const mockBackupSeen = jest.fn();
const mockRevokeById = jest.fn();
const mockCredentialStatus = jest.fn();
const mockDiagnostics = jest.fn();
const mockOpenInSystemBrowser = jest.fn();
const mockSetSession = jest.fn(() => Promise.resolve());
let mockBuildLoginRing = (_mnemonic: unknown): { wipe: () => void } => {
  throw new Error('unexpected login ring');
};

// Plain constructors, not jest.fn(). This Jest drops mock implementations in clearAllMocks,
// which runs before every test and would remove register, login and the account routes.
jest.mock(
  '@dfx.swiss/wallet',
  () => ({
    RP_IDS: { prd: 'app.dfx.swiss', dev: 'dev.app.dfx.swiss', stg: 'stg.app.dfx.swiss', loc: 'localhost' },
    checkPasskeyPlatform: (...args: unknown[]) => mockCheckPasskeyPlatform(...args),
    openInSystemBrowser: (...args: unknown[]) => mockOpenInSystemBrowser(...args),
    PasskeyCeremonies: function PasskeyCeremonies() {
      return {};
    },
    CredentialCache: function CredentialCache() {
      return {};
    },
    KeyRing: {
      fromMnemonic: (mnemonic: unknown) => mockBuildLoginRing(mnemonic),
    },
    PasskeyAuth: function PasskeyAuth() {
      return {
        register: (...args: unknown[]) => mockRegister(...args),
        login: (...args: unknown[]) => mockLogin(...args),
        claim: (...args: unknown[]) => mockClaim(...args),
        link: (...args: unknown[]) => mockLink(...args),
        unlock: (...args: unknown[]) => mockUnlock(...args),
        revoke: (...args: unknown[]) => mockRevoke(...args),
        exportMnemonic: (...args: unknown[]) => mockExport(...args),
        verifyServerAddresses: (...args: unknown[]) => mockVerify(...args),
      };
    },
  }),
  { virtual: true },
);

jest.mock(
  '@dfx.swiss/core',
  () => ({
    DfxApiClient: function DfxApiClient() {
      return {
        passkey: {
          wallets: (...args: unknown[]) => mockWallets(...args),
          backupSeen: (...args: unknown[]) => mockBackupSeen(...args),
          revoke: (...args: unknown[]) => mockRevokeById(...args),
          credentialStatus: (...args: unknown[]) => mockCredentialStatus(...args),
          diagnostics: (...args: unknown[]) => mockDiagnostics(...args),
        },
      };
    },
  }),
  { virtual: true },
);

jest.mock('../contexts/wallet.context', () => ({
  WalletType: { PASSKEY: 'Passkey' },
  useWalletContext: () => ({ setSession: (...args: unknown[]) => mockSetSession(...args) }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  StyledVerticalStack: ({ children }: { children?: unknown }) => <div>{children}</div>,
  StyledButton: ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} data-disabled={disabled ? 'true' : undefined}>
      {label}
    </button>
  ),
  StyledButtonWidth: { FULL: 'FULL' },
  StyledButtonColor: { GRAY: 'GRAY', RED: 'RED' },
}));

jest.mock('react-qr-code', () => ({
  __esModule: true,
  default: ({ value }: { value: string }) => <div data-testid="qr-code">{value}</div>,
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { RP_IDS } from '@dfx.swiss/wallet';
import ConnectPasskey, { passkeyPlatformBlock, walletEnvForHost } from '../components/home/wallet/connect-passkey';
import PasskeyDesk from '../components/home/wallet/passkey-desk';
import {
  PASSKEY_IN_APP_BODY,
  PASSKEY_UNKNOWN_BODY,
  passkeyDismissed,
  passkeyOsTooOld,
  passkeyPlatformView,
  passkeyPrfUnsupported,
  passkeyShowIosHint,
  passkeyUnknownCredential,
} from '../components/home/wallet/passkey-host';
import * as passkeySession from '../components/home/wallet/passkey-session';
import { setOpenPasskey, type OpenPasskey } from '../components/home/wallet/passkey-session';
import { WalletType } from '../contexts/wallet.context';

const SEED = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const GENERIC = 'Something went wrong. Please try again.';
const PRF = 'This passkey cannot hold a wallet on this device.';
const IOS_HINT = "On iPhone, you'll find the compass or Safari icon at the top right.";

function ring(address: string) {
  return { evm: () => ({ address }) };
}

function requireWallet() {
  const session = passkeySession.getOpenPasskey();
  if (!session?.wallet) throw new Error('expected an open passkey wallet');
  return { session, wallet: session.wallet };
}

function authResult(state: string, keys?: unknown, includeBitcoin = true) {
  return {
    accessToken: 'token',
    state,
    keys,
    wallet: {
      id: 7,
      credentialId: 'cred',
      status: 'Active',
      created: '2026-11-04',
      derivationVersion: 'V1',
      seedCheckAddress: SEED,
      backupEligible: true,
      backedUp: false,
      backupRequired: true,
      addresses: [
        { address: SEED, family: 'Evm', path: "m/44'/60'/0'/0/0", status: 'Active', blockchains: [] },
        ...(includeBitcoin
          ? [{ address: 'bc1qlogin', family: 'Bitcoin', path: "m/84'/0'/0'/0/0", status: 'Active', blockchains: [] }]
          : []),
      ],
    },
  };
}

function namedError(name: string, message = name): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

function setUserAgent(value: string): () => void {
  const previous = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value });
  return () => {
    if (previous) Object.defineProperty(navigator, 'userAgent', previous);
    else delete (navigator as { userAgent?: string }).userAgent;
  };
}

function stubExecCommand(impl: () => boolean): { exec: jest.Mock; restore: () => void } {
  const previous = Object.getOwnPropertyDescriptor(document, 'execCommand');
  const exec = jest.fn(impl);
  Object.defineProperty(document, 'execCommand', { configurable: true, writable: true, value: exec });
  return {
    exec,
    restore: () => {
      if (previous) Object.defineProperty(document, 'execCommand', previous);
      else delete (document as { execCommand?: Document['execCommand'] }).execCommand;
    },
  };
}

describe('ConnectPasskey', () => {
  beforeEach(() => {
    setOpenPasskey(undefined);
    mockBuildLoginRing = () => {
      throw new Error('unexpected login ring');
    };
    jest.clearAllMocks();
    mockGetAuthToken.mockReturnValue(undefined);
    mockCurrency = undefined;
    mockUser = undefined;
    mockCurrencies = undefined;
    mockLogout.mockResolvedValue(undefined);
    mockSetSession.mockResolvedValue(undefined);
    mockCheckPasskeyPlatform.mockImplementation(() => new Promise(() => undefined));
    mockOpenInSystemBrowser.mockReset();
  });

  function renderPasskey() {
    return render(
      <ConnectPasskey
        rootRef={createRef<HTMLDivElement>()}
        wallet={WalletType.PASSKEY}
        isConnect={false}
        onLogin={mockOnLogin}
        onCancel={mockOnCancel}
        onSwitch={mockOnSwitch}
      />,
    );
  }

  async function goToChoice(): Promise<void> {
    mockLogin.mockRejectedValueOnce(namedError('NotAllowedError'));
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Do you already have an account?')).toBeInTheDocument();
  }

  async function goToEmail(): Promise<void> {
    await goToChoice();
    fireEvent.click(screen.getByRole('button', { name: 'Open a new account' }));
    expect(await screen.findByText('Your email')).toBeInTheDocument();
  }

  it('uses an explicitly supplied handbook history fixture', async () => {
    window.__dfxHandbookPasskeyHistory = { items: [], hasMore: false, loadMore: async () => undefined };
    try {
      mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
      mockLogin.mockResolvedValue(authResult('unlocked', ring(SEED)));
      renderPasskey();
      fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
      expect(await screen.findByText('No transactions yet.')).toBeInTheDocument();
    } finally {
      delete window.__dfxHandbookPasskeyHistory;
    }
  });

  it('does not use a handbook fixture when NODE_ENV is production', () => {
    const previous = process.env.NODE_ENV;
    window.__dfxHandbookPasskeyHistory = { items: [], hasMore: false, loadMore: async () => undefined };
    process.env.NODE_ENV = 'production';
    try {
      setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
      renderPasskey();
      expect(screen.getByLabelText('Loading transactions')).toBeInTheDocument();
      expect(screen.queryByText('No transactions yet.')).not.toBeInTheDocument();
    } finally {
      process.env.NODE_ENV = previous;
      delete window.__dfxHandbookPasskeyHistory;
    }
  });

  it('shows a balance placeholder or the supplied balance and exposes the send fallback', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    const view = render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    expect(screen.getByLabelText('Loading balance')).toBeInTheDocument();
    view.rerender(
      <PasskeyDesk
        onOpenApp={mockOnLogin}
        onCancel={mockOnCancel}
        onRevoked={mockOnSwitch}
        balance={{ chf: 1234.5, eur: 1000 }}
      />,
    );
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('.50')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Coming soon');
  });

  it('changes both balance and asset currency locally without a DFX user', () => {
    mockCurrencies = [{ name: 'CHF' }, { name: 'EUR' }];
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    render(
      <PasskeyDesk
        onOpenApp={mockOnLogin}
        onCancel={mockOnCancel}
        onRevoked={mockOnSwitch}
        balance={{ chf: 100, eur: 90 }}
        assets={[{ name: 'Bitcoin', amount: '1 BTC', chf: 100, eur: 90 }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
    expect(screen.getByText('CHF 100.00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'EUR' }));
    expect(screen.getByRole('button', { name: 'EUR' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('90')).toBeInTheDocument();
    expect(screen.getByText('EUR 90.00')).toBeInTheDocument();
    expect(mockChangeCurrency).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'CHF' }));
    expect(screen.getByText('CHF 100.00')).toBeInTheDocument();
  });

  it('updates the DFX currency only when a user and matching currency exist', () => {
    mockUser = { id: 1 };
    mockCurrencies = [{ name: 'CHF' }, { name: 'EUR' }];
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    const view = render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'EUR' }));
    expect(screen.getByRole('button', { name: 'EUR' })).toHaveAttribute('aria-pressed', 'true');
    expect(mockChangeCurrency).toHaveBeenCalledWith(mockCurrencies[1]);
    mockCurrencies = [];
    view.rerender(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'CHF' }));
    expect(screen.getByRole('button', { name: 'CHF' })).toHaveAttribute('aria-pressed', 'true');
    expect(mockChangeCurrency).toHaveBeenCalledTimes(1);
  });

  it('starts with the context currency and follows later account currency changes', () => {
    mockCurrency = { name: 'EUR' };
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    const view = render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    expect(screen.getByRole('button', { name: 'EUR' })).toHaveAttribute('aria-pressed', 'true');
    mockCurrency = { name: 'CHF' };
    view.rerender(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    expect(screen.getByRole('button', { name: 'CHF' })).toHaveAttribute('aria-pressed', 'true');
    mockCurrency = undefined;
    view.rerender(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    expect(screen.getByRole('button', { name: 'CHF' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'EUR' }));
    mockCurrency = { name: 'USD' };
    view.rerender(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    expect(screen.getByRole('button', { name: 'EUR' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('forwards service, send and paste actions and displays supplied assets', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    const openApp = jest.fn(),
      send = jest.fn(),
      paste = jest.fn();
    render(
      <PasskeyDesk
        onOpenApp={openApp}
        onCancel={mockOnCancel}
        onRevoked={mockOnSwitch}
        onSend={send}
        onPasteLink={paste}
        assets={[{ name: 'Bitcoin', amount: '1 BTC', chf: 100, eur: 90, network: 'Bitcoin' }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sell' }));
    fireEvent.click(screen.getByRole('button', { name: 'Swap' }));
    expect(openApp).toHaveBeenCalledWith('/sell');
    expect(openApp).toHaveBeenCalledWith('/swap');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(send).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
    expect(screen.getByText('1 BTC')).toBeInTheDocument();
    expect(screen.getByText('CHF 100.00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pay' }));
    fireEvent.click(screen.getByRole('button', { name: 'Paste payment link' }));
    expect(paste).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  });

  it('shows a coming-soon toast when there is no paste callback', () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pay' }));
    fireEvent.click(screen.getByRole('button', { name: 'Paste payment link' }));
    expect(screen.getByRole('status')).toHaveTextContent('Coming soon');
  });

  it('copies a listed address and reports clipboard failure', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    const writeText = jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('clipboard denied'));
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
      fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
      fireEvent.click(screen.getByRole('button', { name: 'Copy address Ethereum & EVM' }));
      expect(await screen.findByRole('status')).toHaveTextContent('Address copied');
      expect(writeText).toHaveBeenCalledWith(SEED);
      fireEvent.click(screen.getByRole('status'));
      fireEvent.click(screen.getByRole('button', { name: 'Copy address Ethereum & EVM' }));
      expect(await screen.findByRole('status')).toHaveTextContent('clipboard denied');
    } finally {
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else delete (navigator as { clipboard?: Clipboard }).clipboard;
    }
  });

  it('labels Spark and EVM addresses and displays supplied EUR values', () => {
    mockCurrency = { name: 'EUR' };
    const session = authResult('unlocked', ring(SEED));
    session.wallet.addresses.push({
      address: 'spark1example',
      family: 'Spark',
      path: 'm/1',
      status: 'Active',
      blockchains: [],
    });
    setOpenPasskey(session as unknown as OpenPasskey);
    render(
      <PasskeyDesk
        onOpenApp={mockOnLogin}
        onCancel={mockOnCancel}
        onRevoked={mockOnSwitch}
        assets={[{ name: 'Ether', amount: '1 ETH', chf: 100, eur: 90 }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
    expect(screen.getByText('Lightning (Spark)')).toBeInTheDocument();
    expect(screen.getByText('Ethereum & EVM')).toBeInTheDocument();
    expect(screen.getByText('EUR 90.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy address Lightning (Spark)' })).toBeInTheDocument();
  });

  it('reports SDK errors inside the open settings dialog', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    mockCredentialStatus.mockRejectedValueOnce(new Error('status unavailable'));
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check passkey status' }));
    expect(await screen.findByText('status unavailable')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Settings' })).toContainElement(screen.getByText('status unavailable'));
  });

  it('keeps settings open and shows a pending action error when dialog changes are disabled', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    let reject: (error: Error) => void = () => undefined;
    mockDiagnostics.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        }),
    );
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send diagnostics to support' }));
    const block = screen.getByRole('button', { name: 'Block passkey' });
    const words = screen.getByRole('button', { name: /Recovery words/ });
    expect(block).toBeDisabled();
    expect(words).toBeDisabled();
    fireEvent.click(block);
    fireEvent.click(words);
    await act(async () => reject(new Error('diagnostic failed')));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog).toContainElement(screen.getByText('diagnostic failed'));
    expect(screen.queryByRole('dialog', { name: 'Block passkey' })).not.toBeInTheDocument();
  });

  it('disables settings and service actions while receive unlock is pending', async () => {
    setOpenPasskey(authResult('locked') as unknown as OpenPasskey);
    let finish: (value: unknown) => void = () => undefined;
    mockUnlock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    for (const name of ['Settings', 'Buy', 'Sell', 'Swap']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(mockOnLogin).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
    await act(async () => finish({ state: 'unlocked', keys: ring(SEED) }));
    expect(screen.getByRole('dialog', { name: 'Receive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeEnabled();
  });

  it('keeps service actions disabled while an EVM link is pending', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    let fail: (error: Error) => void = () => undefined;
    mockLink.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    for (const name of ['Buy', 'Sell', 'Swap']) expect(screen.getByRole('button', { name })).toBeDisabled();
    await act(async () => fail(new Error('link failed')));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toContainElement(screen.getByText('link failed'));
    expect(screen.getByRole('button', { name: 'Buy' })).toBeEnabled();
  });

  it('disables all actions during the automatic Bitcoin link and retains its error', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED), false) as unknown as OpenPasskey);
    let fail: (error: Error) => void = () => undefined;
    mockLink.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    await waitFor(() => expect(mockLink).toHaveBeenCalledTimes(1));
    for (const name of ['Buy', 'Sell', 'Swap', 'Send', 'Receive', 'Pay']) {
      const action = screen.getByRole('button', { name });
      expect(action).toBeDisabled();
      fireEvent.click(action);
    }
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockOnLogin).not.toHaveBeenCalled();
    await act(async () => fail(new Error('Bitcoin link failed')));
    expect(await screen.findByRole('status')).toHaveTextContent('Bitcoin link failed');
    for (const name of ['Buy', 'Sell', 'Swap', 'Send', 'Receive', 'Pay']) {
      expect(screen.getByRole('button', { name })).toBeEnabled();
    }
  });

  it('ignores a block request during the synchronous start of another action', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const block = screen.getByRole('button', { name: 'Block passkey' });
    mockDiagnostics.mockImplementationOnce(() => {
      fireEvent.click(block);
      return Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send diagnostics to support' }));
    expect(await screen.findByText('Sent. Thank you!')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
  });

  it('returns focus to settings trigger after closing the block dialog', () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    const settings = screen.getByRole('button', { name: 'Settings' });
    settings.focus();
    fireEvent.click(settings);
    const block = screen.getByRole('button', { name: 'Block passkey' });
    block.focus();
    fireEvent.click(block);
    expect(screen.getByRole('dialog', { name: 'Block passkey' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Block passkey' })).not.toBeInTheDocument();
    expect(settings).toHaveFocus();
  });

  it.each(['wallet', 'credential', 'token', 'missing', 'unmount'] as const)(
    'does not apply a late refresh after a %s change',
    async (change) => {
      const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
      setOpenPasskey(session);
      let finish: (value: unknown) => void = () => undefined;
      mockWallets.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const view = render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
      fireEvent.click(screen.getByRole('button', { name: 'Reload data' }));
      const next = {
        ...session,
        accessToken: change === 'token' ? 'new-token' : session.accessToken,
        wallet: {
          ...session.wallet,
          id: change === 'wallet' ? 8 : session.wallet.id,
          credentialId: change === 'credential' ? 'other-credential' : session.wallet.credentialId,
        },
      };
      if (change === 'unmount') view.unmount();
      else act(() => setOpenPasskey(change === 'missing' ? undefined : next));
      const before = passkeySession.getOpenPasskey();
      await act(async () => finish([{ ...session.wallet, backupSeenDate: 'old-result' }]));
      expect(passkeySession.getOpenPasskey()).toBe(before);
    },
  );

  it('does not apply or close on a late backup confirmation after a session change', async () => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    mockExport.mockResolvedValueOnce(['alpha']);
    let finish: (value: unknown) => void = () => undefined;
    mockBackupSeen.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    await screen.findByTestId('passkey-recovery-words');
    fireEvent.click(screen.getByLabelText('I have written the words down on paper.'));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    const next = { ...session, wallet: { ...session.wallet, credentialId: 'new-credential' } };
    act(() => setOpenPasskey(next));
    await act(async () => finish({ ...session.wallet, backupSeenDate: 'old-result' }));
    expect(passkeySession.getOpenPasskey()).toBe(next);
    expect(screen.getByRole('dialog', { name: 'Recovery words' })).toBeInTheDocument();
  });

  it('does not apply a late backup confirmation after the desk unmounts', async () => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    mockExport.mockResolvedValueOnce(['alpha']);
    let finish: (value: unknown) => void = () => undefined;
    mockBackupSeen.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    await screen.findByTestId('passkey-recovery-words');
    fireEvent.click(screen.getByLabelText('I have written the words down on paper.'));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    view.unmount();
    await act(async () => finish({ ...session.wallet, backupSeenDate: 'old-result' }));
    expect(passkeySession.getOpenPasskey()).toBe(session);
  });

  it('does not show a verification result after the session changes during verification', async () => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    const next = { ...session, wallet: { ...session.wallet, credentialId: 'new-credential' } };
    mockVerify.mockImplementationOnce(() => {
      setOpenPasskey(next);
      return [{ family: 'Evm', address: SEED, matches: true }];
    });
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Check addresses/ }));
    await waitFor(() => expect(mockVerify).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('1 / 1 addresses match')).not.toBeInTheDocument();
    expect(passkeySession.getOpenPasskey()).toBe(next);
  });

  it('keeps settings open and shows a link refresh error while actions are disabled', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    mockLink.mockResolvedValueOnce({ address: { family: 'Evm', address: OTHER } });
    let fail: (error: Error) => void = () => undefined;
    mockWallets.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    await waitFor(() => expect(mockWallets).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Receive' })).toBeDisabled();
    await act(async () => fail(new Error('old refresh error')));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText(/old refresh error/)).toBeInTheDocument();
  });

  it('ignores a link refresh error after the desk unmounts', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    mockLink.mockResolvedValueOnce({ address: { family: 'Evm', address: OTHER } });
    let fail: (error: Error) => void = () => undefined;
    mockWallets.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const view = render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    await waitFor(() => expect(mockWallets).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => fail(new Error('late error')));
    expect(screen.queryByText(/late error/)).not.toBeInTheDocument();
  });

  it('keeps settings open for a pending passkey status', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    let finish: (value: unknown) => void = () => undefined;
    mockCredentialStatus.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check passkey status' }));
    expect(screen.getByRole('button', { name: 'Receive' })).toBeDisabled();
    await act(async () => finish([{ credentialId: 'cred', status: 'Active' }]));
    expect(screen.getByText('cred: Active')).toBeInTheDocument();
  });

  it('ignores passkey status after the desk unmounts', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    let finish: (value: unknown) => void = () => undefined;
    mockCredentialStatus.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check passkey status' }));
    view.unmount();
    await act(async () => finish([{ credentialId: 'cred', status: 'Active' }]));
    expect(screen.queryByText('cred: Active')).not.toBeInTheDocument();
  });

  it.each(['success', 'error'] as const)('discards a diagnostic %s after the desk unmounts', async (outcome) => {
    const react = jest.requireActual<typeof import('react')>('react');
    const originalUseState = react.useState;
    const staleWrite = jest.fn();
    const spy = jest.spyOn(react, 'useState').mockImplementation(((initial: unknown) => {
      const [value, setValue] = originalUseState<unknown>(initial);
      return [
        value,
        (next: unknown) => {
          if (next === 'Sent. Thank you!' || next === 'late diagnostic error') staleWrite(next);
          setValue(next);
        },
      ];
    }) as typeof react.useState);
    try {
      setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
      let finish: () => void = () => undefined;
      let fail: (error: Error) => void = () => undefined;
      mockDiagnostics.mockImplementationOnce(
        () =>
          new Promise<void>((resolve, reject) => {
            finish = resolve;
            fail = reject;
          }),
      );
      const view = render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
      fireEvent.click(screen.getByRole('button', { name: 'Send diagnostics to support' }));
      expect(mockDiagnostics).toHaveBeenCalledTimes(1);
      view.unmount();
      await act(async () => {
        if (outcome === 'success') finish();
        else fail(new Error('late diagnostic error'));
      });
      expect(staleWrite).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('does not close receive on Escape while the Bitcoin link is busy', async () => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    let fail: (error: Error) => void = () => undefined;
    mockLink.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    act(() => setOpenPasskey({ ...session, wallet: { ...session.wallet, addresses: [] } }));
    await waitFor(() => expect(mockLink).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Receive' })).toBeDisabled();
    expect(screen.getByRole('dialog', { name: 'Receive' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Receive' })).toBeInTheDocument();
    await act(async () => fail(new Error('link failed')));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Receive' })).not.toBeInTheDocument();
  });

  it.each(['close', 'another', 'revoke'] as const)('clears address checks on %s', async (action) => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    mockVerify.mockReturnValueOnce([{ family: 'Evm', address: SEED, matches: true }]);
    mockGetAuthToken.mockReturnValue('mail-token');
    mockRevokeById.mockResolvedValueOnce({ ...session.wallet, status: 'Active' });
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Check addresses/ }));
    expect(await screen.findByText('1 / 1 addresses match')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Use another passkey' })).toBeEnabled());
    if (action === 'close') {
      fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
    } else if (action === 'another') {
      fireEvent.click(screen.getByRole('button', { name: 'Use another passkey' }));
      act(() => setOpenPasskey(session));
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
      fireEvent.click(screen.getByLabelText('New login'));
      fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
      fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
      await screen.findByText('Not blocked yet');
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.queryByText('1 / 1 addresses match')).not.toBeInTheDocument();
  });

  it('keeps settings open and disables both close buttons while unlock is pending', async () => {
    setOpenPasskey(authResult('locked') as unknown as OpenPasskey);
    let finish: (value: unknown) => void = () => undefined;
    mockUnlock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(2);
    screen.getAllByRole('button', { name: 'Close' }).forEach((button) => expect(button).toBeDisabled());
    fireEvent.keyDown(document, { key: 'Escape' });
    if (!dialog.parentElement) throw new Error('Missing backdrop');
    fireEvent.mouseDown(dialog.parentElement);
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(mockOnCancel).not.toHaveBeenCalled();
    mockExport.mockResolvedValueOnce(['alpha']);
    await act(async () => finish({ state: 'unlocked', keys: ring(SEED) }));
    expect(await screen.findByTestId('passkey-recovery-words')).toHaveTextContent('alpha');
  });

  it('shows an asynchronous export error in the recovery dialog', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    mockExport.mockRejectedValueOnce(new Error('export failed'));
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    const dialog = await screen.findByRole('dialog', { name: 'Recovery words' });
    expect(await screen.findByText('export failed')).toBeInTheDocument();
    expect(dialog).toContainElement(screen.getByText('export failed'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps wallet actions disabled until backup confirmation completes', async () => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    mockExport.mockResolvedValueOnce(['alpha']);
    let finish: (value: unknown) => void = () => undefined;
    mockBackupSeen.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    await screen.findByTestId('passkey-recovery-words');
    fireEvent.click(screen.getByLabelText('I have written the words down on paper.'));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Receive' })).toBeDisabled();
    await act(async () => finish(session.wallet));
    expect(screen.queryByRole('dialog', { name: 'Recovery words' })).not.toBeInTheDocument();
  });

  it('shows a revocation failure in the still-open dialog', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    let fail: (error: Error) => void = () => undefined;
    mockRevoke.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    expect(screen.getByRole('button', { name: 'Receive' })).toBeDisabled();
    await act(async () => fail(new Error('late revoke error')));
    expect(screen.getByRole('dialog', { name: 'Block passkey' })).toBeInTheDocument();
    expect(screen.getByText('late revoke error')).toBeInTheDocument();
    expect(mockOnSwitch).not.toHaveBeenCalled();
  });

  it.each(['passkey', 'login'] as const)('does not close a newer dialog after late %s revocation', async (method) => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    mockGetAuthToken.mockReturnValue('mail-token');
    let finish: (value: unknown) => void = () => undefined;
    const revoke = method === 'passkey' ? mockRevoke : mockRevokeById;
    revoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    if (method === 'login') fireEvent.click(screen.getByLabelText('New login'));
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    view.unmount();
    act(() => setOpenPasskey({ ...session, wallet: { ...session.wallet, id: 8 } }));
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await act(async () => finish({ status: 'Lost' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(mockOnSwitch).not.toHaveBeenCalled();
  });

  it.each(['passkey', 'login'] as const)('clears the same session after late %s revocation', async (method) => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    mockGetAuthToken.mockReturnValue('mail-token');
    let finish: (value: unknown) => void = () => undefined;
    const revoke = method === 'passkey' ? mockRevoke : mockRevokeById;
    revoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    if (method === 'login') fireEvent.click(screen.getByLabelText('New login'));
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    view.unmount();
    await act(async () => finish({ status: 'Lost' }));
    expect(passkeySession.getOpenPasskey()).toBeUndefined();
    expect(mockOnSwitch).toHaveBeenCalledTimes(1);
  });

  it('shows each verified address and marks mismatches red', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    mockVerify.mockReturnValue([
      { family: 'Bitcoin', address: 'bc1q12345678901234567890', matches: true },
      { family: 'Evm', address: SEED, matches: false },
    ]);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Check addresses/ }));
    expect(await screen.findByText('1 / 2 addresses match')).toHaveClass('text-dfxRed-150');
    expect(screen.getByText(/Bitcoin.*Matches/)).toHaveClass('text-dfxGreen-300');
    expect(screen.getByText(/Evm.*Differs/)).toHaveClass('text-dfxRed-150');
  });

  it('unlocks before exporting recovery words from settings', async () => {
    setOpenPasskey(authResult('locked') as unknown as OpenPasskey);
    mockUnlock
      .mockResolvedValueOnce({ state: 'locked' })
      .mockResolvedValueOnce({ state: 'unlocked', keys: ring(SEED) });
    mockExport.mockResolvedValue(['alpha', 'bravo']);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    await waitFor(() => expect(mockUnlock).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('passkey-recovery-words')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Recovery words/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    expect(await screen.findByTestId('passkey-recovery-words')).toHaveTextContent('alpha');
    expect(mockUnlock).toHaveBeenCalledTimes(2);
  });

  it('does not abandon the session while an SDK action remains in progress', async () => {
    setOpenPasskey(authResult('seed-mismatch') as unknown as OpenPasskey);
    let resolve: () => void = () => undefined;
    mockDiagnostics.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send diagnostics to support' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Use another passkey' })[0]);
    expect(passkeySession.getOpenPasskey()).toBeDefined();
    await act(async () => resolve());
    fireEvent.click(screen.getAllByRole('button', { name: 'Use another passkey' })[0]);
    expect(passkeySession.getOpenPasskey()).toBeUndefined();
  });

  it('refuses to verify if the session has locked before the handler starts', async () => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const stale = jest.spyOn(passkeySession, 'getOpenPasskey').mockReturnValue({ ...session, state: 'locked' });
    try {
      fireEvent.click(screen.getByRole('button', { name: /Check addresses/ }));
      expect(mockVerify).not.toHaveBeenCalled();
      await act(async () => undefined);
    } finally {
      stale.mockRestore();
    }
  });

  it('links EVM account zero', async () => {
    const keys = ring(SEED);
    setOpenPasskey(authResult('unlocked', keys) as unknown as OpenPasskey);
    mockLink.mockResolvedValue({ address: { family: 'Evm', address: OTHER } });
    mockWallets.mockResolvedValue([authResult('unlocked', keys).wallet]);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText(/Another EVM account/), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Link' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    await waitFor(() => expect(mockLink).toHaveBeenCalledWith('evm', 'token', keys, 0));
    expect(await screen.findByText(`Linked Evm ${OTHER}.`)).toBeInTheDocument();
  });

  it('discards a recovery export after the session locks and does not reveal it during a later export', async () => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    let resolveFirst: (words: string[]) => void = () => undefined;
    let resolveSecond: (words: string[]) => void = () => undefined;
    mockExport.mockImplementationOnce(
      () =>
        new Promise<string[]>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    mockExport.mockImplementationOnce(
      () =>
        new Promise<string[]>((resolve) => {
          resolveSecond = resolve;
        }),
    );
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    expect(screen.getByRole('dialog', { name: 'Recovery words' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Recovery words' })).toBeInTheDocument();
    act(() => setOpenPasskey({ ...session, state: 'locked', keys: undefined }));
    expect(screen.queryByRole('dialog', { name: 'Recovery words' })).not.toBeInTheDocument();
    await act(async () => resolveFirst(['old-secret']));
    expect(screen.queryByText('old-secret')).not.toBeInTheDocument();
    act(() => setOpenPasskey(session));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back up now' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    expect(screen.getByRole('dialog', { name: 'Recovery words' })).toBeInTheDocument();
    expect(screen.queryByTestId('passkey-recovery-words')).not.toBeInTheDocument();
    expect(screen.queryByText('old-secret')).not.toBeInTheDocument();
    await act(async () => resolveSecond(['new-secret']));
    expect(screen.getByTestId('passkey-recovery-words')).toHaveTextContent('new-secret');
    expect(screen.queryByText('old-secret')).not.toBeInTheDocument();
  });

  it('never writes recovery words after the session has locked into React state', async () => {
    const react = jest.requireActual<typeof import('react')>('react');
    const originalUseState = react.useState;
    const forbiddenWrite = jest.fn();
    const observedWrite = jest.fn();
    const spy = jest.spyOn(react, 'useState').mockImplementation(((initial: unknown) => {
      const [value, setValue] = originalUseState<unknown>(initial);
      return [
        value,
        (next: unknown) => {
          if (Array.isArray(next)) observedWrite(next);
          if (Array.isArray(next) && next.includes('late-secret')) forbiddenWrite(next);
          setValue(next);
        },
      ];
    }) as typeof react.useState);
    try {
      const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
      setOpenPasskey(session);
      let resolveExport: (words: string[]) => void = () => undefined;
      mockExport.mockImplementationOnce(
        () =>
          new Promise<string[]>((resolve) => {
            resolveExport = resolve;
          }),
      );
      render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
      fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
      act(() => setOpenPasskey({ ...session, state: 'locked', keys: undefined }));
      await act(async () => resolveExport(['late-secret']));
      expect(forbiddenWrite).not.toHaveBeenCalled();
      act(() => setOpenPasskey(session));
      mockExport.mockResolvedValueOnce(['valid-secret']);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Back up now' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
      expect(await screen.findByTestId('passkey-recovery-words')).toHaveTextContent('valid-secret');
      expect(observedWrite).toHaveBeenCalledWith(['valid-secret']);
    } finally {
      spy.mockRestore();
    }
  });

  it('discards a recovery export if keys are lost before it completes', async () => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    let resolveExport: (words: string[]) => void = () => undefined;
    mockExport.mockImplementationOnce(
      () =>
        new Promise<string[]>((resolve) => {
          resolveExport = resolve;
        }),
    );
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    expect(screen.getByRole('dialog', { name: 'Recovery words' })).toBeInTheDocument();
    act(() => setOpenPasskey({ ...session, wallet: { ...session.wallet, backupSeenDate: '2026-11-06' } }));
    expect(screen.getByRole('dialog', { name: 'Recovery words' })).toBeInTheDocument();
    act(() => setOpenPasskey({ ...session, state: 'locked', keys: undefined }));
    expect(screen.queryByRole('dialog', { name: 'Recovery words' })).not.toBeInTheDocument();
    await act(async () => resolveExport(['lost-secret']));
    expect(screen.queryByText('lost-secret')).not.toBeInTheDocument();
    act(() => setOpenPasskey(session));
    mockExport.mockResolvedValueOnce(['fresh-secret']);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back up now' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    expect(await screen.findByTestId('passkey-recovery-words')).toHaveTextContent('fresh-secret');
    expect(screen.queryByText('lost-secret')).not.toBeInTheDocument();
  });

  it('discards recovery words when the key ring changes during export', async () => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    let resolveExport: (words: string[]) => void = () => undefined;
    mockExport.mockImplementationOnce(
      () =>
        new Promise<string[]>((resolve) => {
          resolveExport = resolve;
        }),
    );
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    act(() => setOpenPasskey({ ...session, keys: ring(OTHER) as unknown as OpenPasskey['keys'] }));
    expect(screen.queryByRole('dialog', { name: 'Recovery words' })).not.toBeInTheDocument();
    await act(async () => resolveExport(['old-key-secret']));
    expect(screen.queryByText('old-key-secret')).not.toBeInTheDocument();
  });

  it('clears already displayed recovery words as soon as the wallet locks', async () => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    mockExport.mockResolvedValueOnce(['private-words']);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    expect(await screen.findByTestId('passkey-recovery-words')).toHaveTextContent('private-words');
    act(() => setOpenPasskey({ ...session, state: 'locked', keys: undefined }));
    expect(screen.queryByText('private-words')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Recovery words' })).not.toBeInTheDocument();
  });

  it('does not reopen recovery words if keys disappear when export starts', async () => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    mockExport.mockImplementationOnce(async () => {
      setOpenPasskey({ ...session, state: 'locked', keys: undefined });
      return ['unavailable-secret'];
    });
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    await waitFor(() => expect(mockExport).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: 'Recovery words' })).not.toBeInTheDocument();
    expect(screen.queryByText('unavailable-secret')).not.toBeInTheDocument();
  });

  it('ignores a second backup request while the export is starting', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    const backup = screen.getByRole('button', { name: 'Back up now' });
    mockExport.mockImplementationOnce(() => {
      fireEvent.click(backup);
      return Promise.resolve(['alpha']);
    });
    fireEvent.click(backup);
    expect(await screen.findByTestId('passkey-recovery-words')).toHaveTextContent('alpha');
    expect(mockExport).toHaveBeenCalledTimes(1);
  });

  it('does not export if the session locks before the backup click is processed', async () => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    const backup = screen.getByRole('button', { name: 'Back up now' });
    act(() => {
      setOpenPasskey({ ...session, state: 'locked', keys: undefined });
      fireEvent.click(backup);
    });
    await waitFor(() => expect(screen.getByText('Wallet locked')).toBeInTheDocument());
    expect(mockExport).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Recovery words' })).not.toBeInTheDocument();
  });

  it('does not open the recovery dialog if export cannot start', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    mockExport.mockImplementationOnce(() => {
      throw new Error('export did not start');
    });
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    expect(await screen.findByText('export did not start')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Recovery words' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('passkey-recovery-words')).not.toBeInTheDocument();
  });

  it('does not carry the revocation acknowledgement into recovery words', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    mockExport.mockResolvedValue(['alpha', 'bravo']);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    expect(screen.getByRole('button', { name: 'Block', exact: true })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Back up first' }));
    expect(await screen.findByTestId('passkey-recovery-words')).toBeInTheDocument();
    expect(screen.getByLabelText('I have written the words down on paper.')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
  });

  it('disables all backup entry points while another wallet request is running', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    let resolveDiagnostic: () => void = () => undefined;
    mockDiagnostics.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDiagnostic = resolve;
        }),
    );
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send diagnostics to support' }));
    expect(screen.getByRole('button', { name: /Recovery words/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back up now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Block passkey' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    await act(async () => resolveDiagnostic());
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    let resolveRevoke: () => void = () => undefined;
    mockRevoke.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRevoke = resolve;
        }),
    );
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    expect(screen.getByRole('button', { name: 'Back up first' })).toBeDisabled();
    expect(screen.queryByRole('dialog', { name: 'Recovery words' })).not.toBeInTheDocument();
    expect(mockExport).not.toHaveBeenCalled();
    await act(async () => resolveRevoke());
  });

  it('accepts EVM account 99 and does not link invalid account indices', async () => {
    const keys = ring(SEED);
    setOpenPasskey(authResult('unlocked', keys) as unknown as OpenPasskey);
    mockLink.mockResolvedValue({ address: { family: 'Evm', address: OTHER } });
    mockWallets.mockResolvedValue([authResult('unlocked', keys).wallet]);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const input = screen.getByLabelText(/Another EVM account/);
    expect(input).toHaveAttribute('inputmode', 'numeric');
    for (const value of ['', '100', '1.5']) {
      fireEvent.change(input, { target: { value } });
      expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled();
    }
    expect(mockLink).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    await waitFor(() => expect(mockLink).toHaveBeenCalledWith('evm', 'token', keys, 99));
    expect(await screen.findByText(`Linked Evm ${OTHER}.`)).toBeInTheDocument();
  });

  it('reports a successful linked EVM address in its settings row', async () => {
    const keys = ring(SEED);
    setOpenPasskey(authResult('unlocked', keys) as unknown as OpenPasskey);
    mockLink.mockResolvedValue({ address: { family: 'Evm', address: OTHER } });
    mockWallets.mockResolvedValue([authResult('unlocked', keys).wallet]);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect(await screen.findByText(`Linked Evm ${OTHER}.`)).toBeInTheDocument();
    expect(mockLink).toHaveBeenCalledWith('evm', 'token', keys, 1);
  });

  it('ignores a reconnect when the session or usable keys disappeared', async () => {
    const session = authResult('unlocked', ring(SEED), false) as unknown as OpenPasskey;
    mockLink.mockRejectedValueOnce(new Error('link unavailable'));
    setOpenPasskey(session);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    expect(await screen.findByText('link unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
    const reconnect = screen.getByRole('button', { name: 'Connect again' });
    await waitFor(() => expect(reconnect).toBeEnabled());
    const stale = jest.spyOn(passkeySession, 'getOpenPasskey');
    try {
      stale.mockReturnValueOnce(undefined);
      fireEvent.click(reconnect);
      stale.mockReturnValueOnce({ ...session, wallet: undefined } as unknown as OpenPasskey);
      fireEvent.click(reconnect);
      stale.mockReturnValueOnce({ ...session, state: 'locked' });
      fireEvent.click(reconnect);
      expect(mockLink).toHaveBeenCalledTimes(1);
    } finally {
      stale.mockRestore();
    }
  });

  it('shows local EVM index zero and hides it when the dialog closes', () => {
    const keys = { evm: jest.fn((index: number) => ({ address: index === 0 ? SEED : OTHER })) };
    const session = authResult('unlocked', keys);
    session.wallet.addresses[0].address = '0x3333333333333333333333333333333333333333';
    setOpenPasskey(session as unknown as OpenPasskey);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);

    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    expect(keys.evm).toHaveBeenCalledWith(0);
    expect(screen.getByTestId('passkey-receive-address').textContent).toBe(SEED);
    expect(screen.getByTestId('receive-qr').textContent).toBe(SEED);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('passkey-receive-address')).not.toBeInTheDocument();
  });

  it('unlocks before showing an address when receive is selected while locked', async () => {
    setOpenPasskey(authResult('locked') as unknown as OpenPasskey);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    mockUnlock.mockResolvedValue({ state: 'locked' });
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    await waitFor(() => expect(mockUnlock).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('passkey-receive-address')).not.toBeInTheDocument();
  });

  it('hides the receive address when the session locks', () => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    expect(screen.getByTestId('passkey-receive-address')).toBeInTheDocument();
    act(() => setOpenPasskey({ ...session, state: 'locked', keys: undefined }));
    expect(screen.queryByTestId('passkey-receive-address')).not.toBeInTheDocument();
  });

  it.each(['locked', 'compromised', 'open-elsewhere', 'seed-mismatch'] as const)(
    'hides the receive address when the session leaves the unlocked state but still holds keys',
    (state) => {
      const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
      setOpenPasskey(session);
      render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
      fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
      expect(screen.getByTestId('passkey-receive-address')).toBeInTheDocument();
      act(() => setOpenPasskey({ ...session, state }));
      expect(screen.queryByTestId('passkey-receive-address')).not.toBeInTheDocument();
    },
  );

  it('does not render an address when key derivation throws', () => {
    const keys = {
      evm: () => {
        throw new Error('wiped');
      },
    };
    setOpenPasskey(authResult('unlocked', keys) as unknown as OpenPasskey);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Receive' }))).not.toThrow();
    expect(screen.queryByTestId('passkey-receive-address')).not.toBeInTheDocument();
  });

  it('does not render an empty derived address', () => {
    setOpenPasskey(authResult('unlocked', ring('')) as unknown as OpenPasskey);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    expect(screen.queryByTestId('passkey-receive-address')).not.toBeInTheDocument();
  });

  it.each(['Start another ceremony', 'Revoke with passkey as lost', 'Revoke this wallet by id as lost'])(
    'resets receive after %s',
    async (action) => {
      const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
      setOpenPasskey(session);
      mockGetAuthToken.mockReturnValue('mail-token');
      mockRevoke.mockResolvedValue(undefined);
      mockRevokeById.mockResolvedValue({ status: 'Lost' });
      render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
      fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
      expect(screen.getByTestId('passkey-receive-address')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
      if (action === 'Start another ceremony') {
        fireEvent.click(screen.getByRole('button', { name: 'Use another passkey' }));
      } else {
        fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
        if (action === 'Revoke this wallet by id as lost') {
          fireEvent.click(screen.getByLabelText('New login'));
        }
        fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
        fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
      }
      await waitFor(() => expect(passkeySession.getOpenPasskey()).toBeUndefined());
      act(() => setOpenPasskey(session));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Receive' })).toBeInTheDocument());
      expect(screen.queryByTestId('passkey-receive-address')).not.toBeInTheDocument();
    },
  );

  it('shows preparing while the platform check is pending', () => {
    renderPasskey();

    expect(screen.getByText('Preparing your login…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Passkey' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log in' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(mockOnCancel).toHaveBeenCalledTimes(1);

    expect(mockOnLogin).not.toHaveBeenCalled();
    expect(mockOnSwitch).not.toHaveBeenCalled();
    expect(mockCheckPasskeyPlatform).toHaveBeenCalledWith('loc');
  });

  it('shows the platform block when the browser cannot use passkeys', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: false, reason: 'no-webauthn', prf: 'unknown' });

    renderPasskey();

    expect(await screen.findByText('This browser has no passkey support')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Passkey' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log in' })).not.toBeInTheDocument();
    expect(mockOnLogin).not.toHaveBeenCalled();
    expect(mockOnSwitch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('registers a passkey and opens buy from the desk', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const keys = { id: 'keys' };
    mockLogin.mockRejectedValueOnce(namedError('NotAllowedError'));
    mockRegister.mockResolvedValue(authResult('unlocked', keys));

    renderPasskey();

    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Do you already have an account?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open a new account' }));
    expect(mockRegister).not.toHaveBeenCalled();

    fireEvent.change(await screen.findByLabelText('Email address'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(mockRegister).toHaveBeenCalledWith({ mail: 'user@example.com' }));
    expect(await screen.findByRole('button', { name: 'Buy' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
    expect(screen.getByTitle(SEED)).toBeInTheDocument();
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockOnLogin).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    await waitFor(() => expect(mockSetSession).toHaveBeenCalledWith('token', WalletType.PASSKEY));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/buy'));
    expect(mockOnLogin).not.toHaveBeenCalled();
    expect(mockOnCancel).not.toHaveBeenCalled();
    expect(mockOnSwitch).not.toHaveBeenCalled();
  });

  it.each([
    ['Sell', '/sell'],
    ['Swap', '/swap'],
  ])('opens %s at %s after establishing the passkey session', async (action, path) => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    let completeSession: () => void = () => undefined;
    mockSetSession.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          completeSession = resolve;
        }),
    );

    renderPasskey();
    fireEvent.click(screen.getByRole('button', { name: action, exact: true }));
    expect(mockSetSession).toHaveBeenCalledTimes(1);
    expect(mockSetSession).toHaveBeenCalledWith('token', WalletType.PASSKEY);
    expect(mockNavigate).not.toHaveBeenCalled();

    await act(async () => completeSession());
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(path);
  });

  it('logs in with an existing passkey without creating a DFX session', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValue(authResult('unlocked', { id: 'keys' }));

    renderPasskey();

    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockOnLogin).not.toHaveBeenCalled();
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('logs in from the choice card and opens the desk', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    renderPasskey();
    await goToChoice();
    mockLogin.mockResolvedValueOnce(authResult('unlocked', { id: 'keys' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log in with existing account' }));
    expect(await screen.findByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(mockLogin).toHaveBeenCalledTimes(2);
    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockOnLogin).not.toHaveBeenCalled();
  });

  it('unlocks a locked wallet and starts buy with the DFX session', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValue(authResult('locked'));
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Wallet locked')).toBeInTheDocument();
    expect(mockLink).not.toHaveBeenCalled();
    expect(mockExport).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
    const keys = ring(SEED);
    mockUnlock.mockResolvedValue({ state: 'unlocked', keys });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(mockUnlock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(passkeySession.getOpenPasskey()?.state).toBe('unlocked'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Buy' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    await waitFor(() => expect(mockSetSession).toHaveBeenCalledWith('token', WalletType.PASSKEY));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/buy'));
  });

  it('reports a wallet refresh error after the automatic Bitcoin link', async () => {
    const keys = ring(SEED);
    mockLink.mockResolvedValue({ address: { family: 'Bitcoin', address: 'bc1qlogin' } });
    mockWallets.mockRejectedValue(new Error('wallet refresh failed'));
    setOpenPasskey(authResult('unlocked', keys, false) as unknown as OpenPasskey);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    expect(await screen.findByRole('status')).toHaveTextContent('wallet refresh failed');
    expect(mockLink).toHaveBeenCalledWith('bitcoin', 'token', keys, 0);
    expect(mockWallets).toHaveBeenCalledWith('token');
  });

  it('opens recovery words from the backup prompt and clears them after closing', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    mockExport.mockResolvedValue(['alpha', 'bravo']);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    expect(await screen.findByTestId('passkey-recovery-words')).toHaveTextContent('alpha');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('passkey-recovery-words')).not.toBeInTheDocument();
  });

  it('opens recovery words from the revocation warning', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    mockExport.mockResolvedValue(['alpha', 'bravo']);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back up first' }));
    expect(await screen.findByTestId('passkey-recovery-words')).toHaveTextContent('alpha');
    expect(screen.queryByRole('dialog', { name: 'Block passkey' })).not.toBeInTheDocument();
  });

  it('clears a wrong passkey session from its warning', () => {
    setOpenPasskey(authResult('seed-mismatch') as unknown as OpenPasskey);
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use another passkey' }));
    expect(passkeySession.getOpenPasskey()).toBeUndefined();
  });

  it('reloads the page from the other-tab warning', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'location');
    const reload = jest.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } });
    try {
      setOpenPasskey(authResult('open-elsewhere') as unknown as OpenPasskey);
      render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
      fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      if (original) Object.defineProperty(window, 'location', original);
    }
  });

  it('copies the local receive address from its dialog', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    const writeText = jest.fn().mockResolvedValue(undefined);
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
      fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
      fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
      expect(await screen.findByRole('status')).toHaveTextContent('Address copied');
      expect(writeText).toHaveBeenCalledWith(SEED);
    } finally {
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else delete (navigator as { clipboard?: Clipboard }).clipboard;
    }
  });

  it('links bitcoin once when the unlocked server list has no bitcoin address', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const keys = { id: 'keys' };
    mockLogin.mockResolvedValue(authResult('unlocked', keys, false));
    mockLink.mockResolvedValue({
      accessToken: 'linked-token',
      address: { family: 'Bitcoin', address: 'bc1qlogin', path: "m/84'/0'/0'/0/0" },
    });
    mockWallets.mockResolvedValue([authResult('unlocked', keys).wallet]);

    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(mockLink).toHaveBeenCalledTimes(1));
    expect(mockLink).toHaveBeenCalledWith('bitcoin', 'token', keys, 0);
    await waitFor(() =>
      expect(passkeySession.getOpenPasskey()?.wallet.addresses.some((row) => row.address === 'bc1qlogin')).toBe(true),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
    expect(screen.getByTitle('bc1qlogin')).toBeInTheDocument();
  });

  it('does not link bitcoin when the unlocked session has no wallet', () => {
    act(() => {
      setOpenPasskey({ ...authResult('unlocked', { id: 'keys' }), wallet: undefined } as OpenPasskey);
    });
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
    expect(mockLink).not.toHaveBeenCalled();
  });

  it('adds a passkey to the signed-in account without logging that account out', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockClaim.mockResolvedValue(authResult('unlocked', { id: 'keys' }));

    renderPasskey();
    await goToChoice();
    fireEvent.click(screen.getByRole('button', { name: 'Add passkey to this account' }));
    expect(
      await screen.findByText('Sign in with mail first. The passkey is added to that account.'),
    ).toBeInTheDocument();
    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();

    mockGetAuthToken.mockReturnValue('mail-token');
    fireEvent.click(screen.getByRole('button', { name: 'Add passkey to this account' }));
    await waitFor(() => expect(mockClaim).toHaveBeenCalledWith('mail-token'));
    expect(await screen.findByRole('button', { name: 'Buy' })).toBeInTheDocument();
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('retries Bitcoin, sends diagnostics and displays recovery words', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const keys = { id: 'keys' };
    mockLogin.mockResolvedValue(authResult('unlocked', keys, false));
    mockLink.mockRejectedValueOnce(new Error('link failed')).mockResolvedValueOnce({
      accessToken: 'linked-token',
      address: { family: 'Bitcoin', address: 'tb1qexample', path: "m/84'/1'/0'/0/0" },
    });
    mockWallets.mockResolvedValue([authResult('unlocked', keys).wallet]);
    mockDiagnostics.mockResolvedValue(undefined);
    mockExport.mockResolvedValue(['alpha', 'bravo']);
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('link failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Connect again' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Connect again' }));
    await waitFor(() => expect(mockLink).toHaveBeenCalledWith('bitcoin', 'token', keys, 0));
    await waitFor(() => expect(mockWallets).toHaveBeenCalledWith('token'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Settings' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send diagnostics to support' }));
    await waitFor(() => expect(mockDiagnostics).toHaveBeenCalledWith({ stage: 'Authentication', outcome: 'Success' }));
    expect(await screen.findByText('Sent. Thank you!')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    expect(await screen.findByTestId('passkey-recovery-words')).toHaveTextContent('alpha');
    expect(screen.getByTestId('passkey-recovery-words')).toHaveTextContent('bravo');
    expect(mockExport).toHaveBeenCalledWith(Uint8Array.from(atob('cred'), (char) => char.charCodeAt(0)));
    fireEvent.click(screen.getByRole('dialog').querySelector('button[aria-label="Close"]') as HTMLElement);
    expect(screen.queryByTestId('passkey-recovery-words')).not.toBeInTheDocument();
  });

  it('links and checks the mainnet login ring when the open wallet uses testnet Bitcoin', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const wiped = jest.fn();
    const loginRing = { bitcoinNetwork: 'mainnet', wipe: wiped };
    const phrases: unknown[] = [];
    mockBuildLoginRing = (mnemonic: unknown) => {
      phrases.push(mnemonic);
      return loginRing;
    };
    const keys = { bitcoinNetwork: 'testnet4', mnemonic: () => 'seed phrase', wipe: jest.fn() };
    mockLogin.mockResolvedValue(authResult('unlocked', keys, false));
    mockLink.mockRejectedValueOnce(new Error('link failed')).mockResolvedValueOnce({
      accessToken: 'linked-token',
      address: { family: 'Bitcoin', address: 'bc1qlogin', path: "m/84'/0'/0'/0/0" },
    });
    mockWallets.mockResolvedValue([authResult('unlocked', keys).wallet]);
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('link failed')).toBeInTheDocument();
    expect(wiped).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Connect again' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Connect again' }));
    await waitFor(() => expect(mockLink).toHaveBeenCalledWith('bitcoin', 'token', loginRing, 0));
    await waitFor(() => expect(mockWallets).toHaveBeenCalledWith('token'));
    expect(wiped).toHaveBeenCalledTimes(2);
    expect(keys.wipe).not.toHaveBeenCalled();
    mockVerify.mockReturnValue([{ address: 'bc1qlogin', family: 'Bitcoin', matches: true }]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Settings' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Check addresses/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Check addresses/ }));
    await waitFor(() => expect(mockVerify).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), loginRing));
    expect(screen.getByText('1 / 1 addresses match')).toBeInTheDocument();
    expect(wiped).toHaveBeenCalledTimes(3);
    expect(phrases).toEqual(['seed phrase', 'seed phrase', 'seed phrase']);
  });

  it('lists wallets, marks the backup and reads credential status', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const keys = ring(SEED);
    const wallet = authResult('unlocked', keys).wallet;
    mockLogin.mockResolvedValue(authResult('unlocked', keys));
    mockWallets.mockResolvedValue([wallet]);
    mockBackupSeen.mockResolvedValue({ ...wallet, backupRequired: false, backupSeenDate: '2026-11-06' });
    mockCredentialStatus.mockResolvedValue([{ credentialId: 'cred', status: 'Active' }]);
    mockExport.mockResolvedValue(['alpha', 'bravo']);
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reload data' }));
    await waitFor(() => expect(mockWallets).toHaveBeenCalledWith('token'));
    expect(await screen.findByText('Wallets on this account: 1.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    expect(await screen.findByTestId('passkey-recovery-words')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('I have written the words down on paper.'));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(mockBackupSeen).toHaveBeenCalledWith(7, 'token'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check passkey status' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Check passkey status' }));
    await waitFor(() => expect(mockCredentialStatus).toHaveBeenCalledWith(['cred']));
    expect(await screen.findByText('cred: Active')).toBeInTheDocument();
  });

  it('returns to the form after the passkey revokes the wallet', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValue(authResult('seed-mismatch', { id: 'keys' }));
    mockRevoke.mockResolvedValue({ status: 'Lost' });
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Wrong passkey')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    expect(await screen.findByText('The passkey wallet was revoked.')).toBeInTheDocument();
    expect(screen.getByText('Log in with your device')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(mockRevoke).toHaveBeenCalledWith('Lost');
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('shows the ceremony error and stays on the form', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockRejectedValue(new Error('The authenticator returned no credential'));

    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));

    expect(await screen.findByText(GENERIC)).toBeInTheDocument();
    expect(screen.queryByText('The authenticator returned no credential')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('keeps the account token after a link and refuses a second passkey on unlock', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const keys = ring(SEED);
    mockLogin.mockResolvedValue(authResult('locked'));
    mockUnlock.mockResolvedValueOnce({ state: 'unlocked', keys: ring(OTHER) });
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText('Wrong passkey')).toBeInTheDocument();
    expect(passkeySession.getOpenPasskey()?.keys).toBeUndefined();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Settings' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const recovery = screen.getByRole('button', { name: /Recovery words/ });
    expect(recovery).toBeDisabled();
    fireEvent.click(recovery);
    expect(mockExport).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Receive' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    expect(screen.getByRole('button', { name: 'Back up first' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Back up first' }));
    expect(mockExport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    act(() => {
      const current = requireWallet();
      setOpenPasskey({ ...current.session, state: 'locked' });
    });
    mockUnlock.mockResolvedValueOnce({ state: 'unlocked', keys });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(passkeySession.getOpenPasskey()?.state).toBe('unlocked'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Settings' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const input = screen.getByLabelText(/Another EVM account/);
    fireEvent.change(input, { target: { value: 'nope' } });
    expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled();
    fireEvent.change(input, { target: { value: '100' } });
    expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled();
    fireEvent.change(input, { target: { value: '2' } });
    mockLink.mockResolvedValue({
      accessToken: 'linked-token',
      address: { family: 'Evm', address: OTHER, path: "m/44'/60'/0'/0/2" },
    });
    mockWallets.mockRejectedValueOnce(new Error('list failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    await waitFor(() => expect(mockLink).toHaveBeenCalledWith('evm', 'token', keys, 2));
    expect(
      await screen.findByText('Linked Evm 0x2222222222222222222222222222222222222222. list failed'),
    ).toBeInTheDocument();
    expect(mockWallets).toHaveBeenCalledWith('token');
    expect(passkeySession.getOpenPasskey()?.accessToken).toBe('token');
  });

  it('revokes by id only with a fresh login token', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValue(authResult('unlocked', ring(SEED)));
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    fireEvent.click(screen.getByLabelText('New login'));
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    expect(await screen.findByText('Revoke by id needs a fresh mail or wallet login.')).toBeInTheDocument();
    expect(mockRevokeById).not.toHaveBeenCalled();
    mockGetAuthToken.mockReturnValue('mail-token');
    mockRevokeById.mockResolvedValueOnce({ ...authResult('unlocked').wallet, status: 'Active' });
    fireEvent.click(screen.getByLabelText('Passkey compromised'));
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    await waitFor(() => expect(mockRevokeById).toHaveBeenCalledWith(7, 'Compromised', 'mail-token'));
    expect(await screen.findByText('Not blocked yet')).toBeInTheDocument();
    mockRevokeById.mockResolvedValueOnce({ status: 'Lost' });
    fireEvent.click(screen.getByLabelText('Passkey lost'));
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    expect(await screen.findByText('The passkey wallet was revoked.')).toBeInTheDocument();
  });

  it('shows other wallet states, compares addresses and leaves the desk', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValueOnce(authResult('compromised', ring(SEED)));
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Passkey blocked')).toBeInTheDocument();
    act(() => setOpenPasskey(undefined));
    mockLogin.mockResolvedValueOnce(authResult('open-elsewhere', ring(SEED)));
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Open in another tab')).toBeInTheDocument();
    act(() => {
      const current = requireWallet();
      setOpenPasskey({ ...current.session, state: 'unlocked' });
    });
    mockVerify.mockReturnValue([{ address: SEED, family: 'Evm', matches: false }]);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Check addresses/ }));
    expect(await screen.findByText('0 / 1 addresses match')).toBeInTheDocument();
    expect(mockVerify).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Use another passkey' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Use another passkey' }));
    expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByText('Log in with your device')).toBeInTheDocument();
  });

  it('stays on the desk when opening buy is refused', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValue(authResult('unlocked', ring(SEED)));
    mockSetSession.mockRejectedValueOnce(new Error('The session was refused'));
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Buy' }));
    expect(await screen.findByText('The session was refused')).toBeInTheDocument();
    mockSetSession.mockRejectedValueOnce(new Error('   '));
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    expect(await screen.findByText(GENERIC)).toBeInTheDocument();
    mockSetSession.mockRejectedValueOnce('nope');
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    await waitFor(() => expect(mockSetSession).toHaveBeenCalledTimes(3));
    expect(await screen.findByText(GENERIC)).toBeInTheDocument();
    expect(mockOnCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Buy' })).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('uses the generic sentence when the ceremony rejects without an error', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockRejectedValue('nope');
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText(GENERIC)).toBeInTheDocument();
    expect(screen.queryByText('nope')).not.toBeInTheDocument();
  });

  it('does not log out when the tile is already a connect step', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValue(authResult('unlocked', ring(SEED)));
    render(
      <ConnectPasskey
        rootRef={createRef<HTMLDivElement>()}
        wallet={WalletType.PASSKEY}
        isConnect
        onLogin={mockOnLogin}
        onCancel={mockOnCancel}
        onSwitch={mockOnSwitch}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('button', { name: 'Buy' })).toBeInTheDocument();
    expect(mockLogout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    await waitFor(() => expect(mockOnCancel).toHaveBeenCalledTimes(1));
    expect(mockSetSession).toHaveBeenCalledWith('token', WalletType.PASSKEY);
    expect(mockOnLogin).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockSetSession.mock.invocationCallOrder[0]).toBeLessThan(mockOnLogin.mock.invocationCallOrder[0]);
    expect(mockOnLogin.mock.invocationCallOrder[0]).toBeLessThan(mockOnCancel.mock.invocationCallOrder[0]);
  });

  it('ignores a platform report that arrives after the tile unmounts', async () => {
    let settle: (report: { available: boolean; reason: string; prf: string }) => void = () => undefined;
    mockCheckPasskeyPlatform.mockImplementation(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );

    const { unmount } = renderPasskey();
    unmount();

    await act(async () => {
      settle({ available: false, reason: 'no-webauthn', prf: 'unknown' });
    });
  });

  it('covers the remaining ceremony and desk branches', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const first = renderPasskey();
    await goToEmail();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(mockRegister).not.toHaveBeenCalled();
    first.unmount();
    setOpenPasskey(undefined);
    mockLogin.mockClear();

    mockLogin.mockRejectedValueOnce(new Error('   '));
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText(GENERIC)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log in' })).not.toBeInTheDocument();

    let releaseLogin: (value: ReturnType<typeof authResult>) => void = () => undefined;
    mockLogin.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseLogin = resolve;
        }),
    );
    const retry = screen.getByRole('button', { name: 'Try again' });
    act(() => {
      retry.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      retry.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      releaseLogin(authResult('unlocked', ring(SEED)));
    });
    await screen.findByRole('button', { name: 'Buy' });
    expect(mockLogin).toHaveBeenCalledTimes(2);

    let releaseSession: () => void = () => undefined;
    mockSetSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseSession = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    await act(async () => {
      releaseSession();
    });
    expect(mockSetSession).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/buy');
    expect(mockOnCancel).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Buy' })).toBeInTheDocument());

    const closedSession = jest.spyOn(passkeySession, 'getOpenPasskey').mockReturnValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    closedSession.mockRestore();
    expect(mockSetSession).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText(/Another EVM account/), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    fireEvent.change(screen.getByLabelText(/Another EVM account/), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    fireEvent.change(screen.getByLabelText(/Another EVM account/), { target: { value: '9007199254740993' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect(mockLink).not.toHaveBeenCalled();

    mockWallets.mockResolvedValueOnce([{ id: 8 }]);
    fireEvent.click(screen.getByRole('button', { name: 'Reload data' }));
    expect(await screen.findByText('Wallets on this account: 1.')).toBeInTheDocument();

    mockVerify.mockReturnValue([{ address: SEED, family: 'Evm', matches: true }]);
    fireEvent.click(screen.getByRole('button', { name: /Check addresses/ }));
    expect(await screen.findByText('1 / 1 addresses match')).toBeInTheDocument();

    mockCredentialStatus.mockResolvedValueOnce([]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check passkey status' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Check passkey status' }));
    expect(await screen.findByText('No credential status.')).toBeInTheDocument();

    const open = requireWallet();
    act(() => {
      setOpenPasskey({
        ...open.session,
        wallet: { ...open.wallet, credentialId: '' },
      });
    });
    mockExport.mockResolvedValueOnce(['one', 'two']);
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    expect(await screen.findByTestId('passkey-recovery-words')).toHaveTextContent('one');
    expect(screen.getByTestId('passkey-recovery-words')).toHaveTextContent('two');
    await waitFor(() => expect(mockExport).toHaveBeenCalledWith(undefined));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('passkey-recovery-words')).not.toBeInTheDocument();

    act(() => {
      const current = requireWallet();
      setOpenPasskey({ ...current.session, state: 'locked', keys: undefined });
    });
    mockUnlock.mockResolvedValueOnce({ state: 'locked' });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(mockUnlock).toHaveBeenCalledTimes(1));
    mockUnlock.mockResolvedValueOnce({
      state: 'unlocked',
      keys: {
        evm: () => {
          throw new Error('missing');
        },
      },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText('Wrong passkey')).toBeInTheDocument();
    act(() => {
      const current = requireWallet();
      setOpenPasskey({
        ...current.session,
        state: 'locked',
        wallet: { ...current.wallet, seedCheckAddress: 'not-hex' },
      });
    });
    mockUnlock.mockResolvedValueOnce({ state: 'unlocked', keys: ring(SEED) });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText('Wrong passkey')).toBeInTheDocument();
    expect(mockUnlock).toHaveBeenCalledTimes(3);
    act(() => {
      const current = requireWallet();
      setOpenPasskey({ ...current.session, state: 'locked' });
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled());
    mockUnlock.mockImplementationOnce(async () => {
      setOpenPasskey(undefined);
      return { state: 'unlocked', keys: ring(SEED) };
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument();

    mockLogin.mockResolvedValueOnce(authResult('unlocked', ring(SEED)));
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    fireEvent.click(screen.getByLabelText('Passkey compromised'));
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    mockRevoke.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    expect(await screen.findByText('The passkey wallet was revoked.')).toBeInTheDocument();
    expect(mockRevoke).toHaveBeenCalledWith('Compromised');
  });

  it('ignores another ceremony while a diagnostic is pending and ignores a missing session', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    let release: () => void = () => undefined;
    mockDiagnostics.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send diagnostics to support' }));
    expect(screen.getByRole('button', { name: 'Use another passkey' })).toBeDisabled();
    expect(passkeySession.getOpenPasskey()).toBeDefined();
    await act(async () => release());
    expect(await screen.findByText('Sent. Thank you!')).toBeInTheDocument();
    const missing = jest.spyOn(passkeySession, 'getOpenPasskey').mockReturnValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Send diagnostics to support' }));
    missing.mockRestore();
    expect(mockDiagnostics).toHaveBeenCalledTimes(1);
  });

  it('renders no desk without a session and ignores routes after the session is gone', async () => {
    const empty = render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
    empty.unmount();
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValueOnce(authResult('unlocked', ring(SEED)));
    const view = renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    fireEvent.click(screen.getByLabelText('New login'));
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    const originalSession = requireWallet().session;
    const gone = jest.spyOn(passkeySession, 'getOpenPasskey').mockReturnValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    gone.mockRestore();
    expect(mockRevokeById).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
    view.unmount();
    renderPasskey();
    act(() => {
      const current = requireWallet();
      setOpenPasskey({
        ...current.session,
        state: 'locked',
        wallet: { ...current.wallet, status: undefined as unknown as string, addresses: undefined },
      });
    });
    expect(screen.getByRole('button', { name: 'Show wallet' })).toBeInTheDocument();
    const current = requireWallet();
    act(() => setOpenPasskey({ ...current.session, wallet: undefined }));
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
    act(() => setOpenPasskey(originalSession));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    mockWallets.mockImplementationOnce(() => {
      setOpenPasskey(undefined);
      return [{ id: 7 }];
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reload data' }));
    expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument();
  });

  it('shows idle login when the platform is ready', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    renderPasskey();
    expect(await screen.findByText('Log in with your device')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open a new account' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add passkey to this account' })).not.toBeInTheDocument();
  });

  it('opens choice after a dismissed first login', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    renderPasskey();
    await goToChoice();
    expect(screen.queryByText(GENERIC)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in with existing account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open a new account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add passkey to this account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('opens choice after an aborted first login', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockRejectedValueOnce(namedError('AbortError'));
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Do you already have an account?')).toBeInTheDocument();
    expect(screen.queryByText(GENERIC)).not.toBeInTheDocument();
  });

  it('stays on choice when an existing-account login is dismissed', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockRejectedValue(namedError('NotAllowedError'));
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Do you already have an account?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Log in with existing account' }));
    expect(await screen.findByText('Do you already have an account?')).toBeInTheDocument();
    expect(screen.queryByText('This passkey is not an account')).not.toBeInTheDocument();
    expect(screen.queryByText(GENERIC)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Log in$/ })).not.toBeInTheDocument();
  });

  it('opens the unknown card from an authenticate login', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    renderPasskey();
    await goToChoice();
    mockLogin.mockRejectedValueOnce({ statusCode: 400, message: 'Unknown credential' });
    fireEvent.click(screen.getByRole('button', { name: 'Log in with existing account' }));
    expect(await screen.findByText('This passkey is not an account')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('shows the PRF sentence when authenticate cannot hold a wallet', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    renderPasskey();
    await goToChoice();
    mockLogin.mockRejectedValueOnce({ code: 'prf-unavailable', message: 'no' });
    fireEvent.click(screen.getByRole('button', { name: 'Log in with existing account' }));
    expect(await screen.findByText(PRF)).toBeInTheDocument();
    mockLogin.mockImplementation(() => new Promise(() => undefined));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(3));
  });

  it('keeps the typed email when register is dismissed', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    renderPasskey();
    await goToEmail();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'user@example.com' } });
    mockRegister.mockRejectedValueOnce(namedError('NotAllowedError'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByLabelText('Email address')).toHaveValue('user@example.com');
    expect(screen.getByText('Your email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.queryByText(GENERIC)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('retries a generic login error without showing the raw message', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockRejectedValue(new Error('boom'));
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText(GENERIC)).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(2));
  });

  it('returns to the email form after a PRF failure during register', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    renderPasskey();
    await goToEmail();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'user@example.com' } });
    mockRegister.mockRejectedValueOnce({ code: 'prf-unavailable', message: 'no' });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(PRF)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Your email')).toBeInTheDocument();
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  it('keeps the unknown card when a later login is dismissed', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin
      .mockRejectedValueOnce({ statusCode: 400, message: 'Unknown credential' })
      .mockRejectedValueOnce(namedError('NotAllowedError'));
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('This passkey is not an account')).toBeInTheDocument();
    expect(screen.getByText(PASSKEY_UNKNOWN_BODY)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('This passkey is not an account')).toBeInTheDocument();
    expect(screen.queryByText('Do you already have an account?')).not.toBeInTheDocument();
  });

  it('treats UnknownCredential as an unknown passkey', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockRejectedValueOnce({ code: 'UnknownCredential', message: 'nope' });
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('This passkey is not an account')).toBeInTheDocument();
  });

  it('shows a generic error when register reports an unknown credential', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    renderPasskey();
    await goToEmail();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'user@example.com' } });
    mockRegister.mockRejectedValueOnce({ statusCode: 400, message: 'Unknown credential' });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(GENERIC)).toBeInTheDocument();
    expect(screen.queryByText('This passkey is not an account')).not.toBeInTheDocument();
  });

  it('shows the PRF sentence when the first login cannot hold a wallet', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockRejectedValueOnce({ code: 'prf-unavailable', message: 'no' });
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText(PRF)).toBeInTheDocument();
  });

  it('stays on choice when claim is dismissed', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    renderPasskey();
    await goToChoice();
    mockGetAuthToken.mockReturnValue('mail-token');
    mockClaim.mockRejectedValueOnce(namedError('NotAllowedError'));
    fireEvent.click(screen.getByRole('button', { name: 'Add passkey to this account' }));
    expect(await screen.findByText('Do you already have an account?')).toBeInTheDocument();
    expect(mockClaim).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(GENERIC)).not.toBeInTheDocument();
  });

  it('returns to choice after a generic claim failure without calling claim again', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    renderPasskey();
    await goToChoice();
    mockGetAuthToken.mockReturnValue('mail-token');
    mockClaim.mockRejectedValueOnce(new Error('raw claim'));
    fireEvent.click(screen.getByRole('button', { name: 'Add passkey to this account' }));
    expect(await screen.findByText(GENERIC)).toBeInTheDocument();
    expect(screen.queryByText('raw claim')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Do you already have an account?')).toBeInTheDocument();
    expect(mockClaim).toHaveBeenCalledTimes(1);
  });

  it('shows the PRF sentence when claim cannot hold a wallet', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    renderPasskey();
    await goToChoice();
    mockGetAuthToken.mockReturnValue('mail-token');
    mockClaim.mockRejectedValueOnce({ code: 'prf-unavailable', message: 'no' });
    fireEvent.click(screen.getByRole('button', { name: 'Add passkey to this account' }));
    expect(await screen.findByText(PRF)).toBeInTheDocument();
  });

  it('opens the email form from the unknown card without registering', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockRejectedValueOnce({ code: 'UnknownCredential', message: 'nope' });
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('This passkey is not an account')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open a new account' }));
    expect(await screen.findByText('Your email')).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('shows the in-app card and opens the hash-stripped url', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: false, reason: 'in-app-browser', prf: 'unknown' });
    const previousHref = window.location.href;
    try {
      // Assigning location.href in this jsdom does not leave the fragment in place; replaceState writes the full URL.
      window.history.replaceState(undefined, '', 'http://localhost/login?feature=Passkey#frag');
      renderPasskey();
      expect(await screen.findByText('Open this page in your browser')).toBeInTheDocument();
      expect(screen.getByText(PASSKEY_IN_APP_BODY)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Log in' })).not.toBeInTheDocument();
      expect(screen.queryByText(IOS_HINT)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open in browser' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
      expect(window.location.href).toBe('http://localhost/login?feature=Passkey#frag');
      fireEvent.click(screen.getByRole('button', { name: 'Open in browser' }));
      expect(mockOpenInSystemBrowser).toHaveBeenCalledTimes(1);
      expect(mockOpenInSystemBrowser).toHaveBeenCalledWith('http://localhost/login?feature=Passkey');
    } finally {
      window.history.replaceState(undefined, '', previousHref);
    }
  });

  it('shows the iOS hint only for an iPhone user agent', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: false, reason: 'in-app-browser', prf: 'unknown' });
    const restore = setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
    try {
      renderPasskey();
      expect(await screen.findByText(IOS_HINT)).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('copies the link and restores the label after 1200ms', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: false, reason: 'in-app-browser', prf: 'unknown' });
    const writeText = jest.fn(() => Promise.resolve());
    const previous = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    jest.useFakeTimers();
    const { unmount } = renderPasskey();
    try {
      fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Copied' }));
      await act(async () => {
        await Promise.resolve();
      });
      expect(writeText).toHaveBeenCalledTimes(2);
      act(() => {
        jest.advanceTimersByTime(1200);
      });
      expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    } finally {
      unmount();
      jest.useRealTimers();
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: previous });
    }
  });

  it('leaves the copy label when writeText rejects and execCommand returns false', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: false, reason: 'in-app-browser', prf: 'unknown' });
    const writeText = jest.fn(() => Promise.reject(new Error('denied')));
    const previous = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { exec, restore } = stubExecCommand(() => false);
    try {
      renderPasskey();
      fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));
      expect(await screen.findByRole('button', { name: 'Copy link' })).toBeInTheDocument();
      expect(exec).toHaveBeenCalledWith('copy');
      expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument();
    } finally {
      restore();
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: previous });
    }
  });

  it('copies with execCommand when clipboard is missing', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: false, reason: 'in-app-browser', prf: 'unknown' });
    const previous = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    let textarea: HTMLTextAreaElement | undefined;
    const { exec, restore } = stubExecCommand(() => {
      const node = document.querySelector('textarea');
      if (node instanceof HTMLTextAreaElement && document.body.contains(node)) textarea = node;
      return true;
    });
    const { unmount } = renderPasskey();
    try {
      fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));
      expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
      expect(exec).toHaveBeenCalledWith('copy');
      expect(textarea?.hasAttribute('hidden')).toBe(false);
      expect(textarea?.style.position).toBe('fixed');
      expect(textarea?.style.left).toBe('-9999px');
      expect(textarea?.readOnly).toBe(true);
      expect(textarea?.value).toBe(window.location.href.split('#')[0]);
    } finally {
      unmount();
      restore();
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: previous });
    }
  });

  it('copies with execCommand when writeText is missing', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: false, reason: 'in-app-browser', prf: 'unknown' });
    const previous = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {} });
    const { exec, restore } = stubExecCommand(() => true);
    const { unmount } = renderPasskey();
    try {
      fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));
      expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
      expect(exec).toHaveBeenCalledWith('copy');
    } finally {
      unmount();
      restore();
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: previous });
    }
  });

  it('copies with execCommand after writeText rejects', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: false, reason: 'in-app-browser', prf: 'unknown' });
    const writeText = jest.fn(() => Promise.reject(new Error('denied')));
    const previous = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { exec, restore } = stubExecCommand(() => true);
    const { unmount } = renderPasskey();
    try {
      fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));
      expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
      expect(exec).toHaveBeenCalledWith('copy');
    } finally {
      unmount();
      restore();
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: previous });
    }
  });

  it('leaves the copy label when writeText and execCommand throw', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: false, reason: 'in-app-browser', prf: 'unknown' });
    const writeText = jest.fn(() => Promise.reject(new Error('denied')));
    const previous = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { exec, restore } = stubExecCommand(() => {
      throw new Error('nope');
    });
    try {
      renderPasskey();
      fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));
      expect(await screen.findByRole('button', { name: 'Copy link' })).toBeInTheDocument();
      expect(exec).toHaveBeenCalledWith('copy');
      expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument();
    } finally {
      restore();
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: previous });
    }
  });

  it('does not throw when unmounting while the copied timer is pending', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: false, reason: 'in-app-browser', prf: 'unknown' });
    const writeText = jest.fn(() => Promise.resolve());
    const previous = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    jest.useFakeTimers();
    try {
      const { unmount } = renderPasskey();
      fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));
      await act(async () => {
        await Promise.resolve();
      });
      unmount();
      act(() => {
        jest.advanceTimersByTime(1200);
      });
    } finally {
      jest.useRealTimers();
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: previous });
    }
  });

  it('shows the OS version when the operating system is too old', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({
      available: false,
      reason: 'os-too-old',
      prf: 'unknown',
      os: '17.0',
    });
    renderPasskey();
    expect(await screen.findByText('This operating system (17.0) cannot sign in with a passkey.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log in' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('shows the OS sentence without parentheses when the version is omitted', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: false, reason: 'os-too-old', prf: 'unknown' });
    renderPasskey();
    expect(await screen.findByText('This operating system cannot sign in with a passkey.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log in' })).not.toBeInTheDocument();
  });

  it('shows the OS sentence without parentheses when the version is whitespace', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({
      available: false,
      reason: 'os-too-old',
      prf: 'unknown',
      os: '   ',
    });
    renderPasskey();
    expect(await screen.findByText('This operating system cannot sign in with a passkey.')).toBeInTheDocument();
  });

  it('treats a missing PRF as the blocked card', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: false, reason: 'no-prf', prf: 'no' });
    renderPasskey();
    expect(await screen.findByText('This browser has no passkey support')).toBeInTheDocument();
    expect(screen.queryByText('Open this page in your browser')).not.toBeInTheDocument();
    expect(screen.queryByText('This operating system cannot sign in with a passkey.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log in' })).not.toBeInTheDocument();
  });

  it('clears the no-account alert when another choice button is clicked', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    renderPasskey();
    await goToChoice();
    fireEvent.click(screen.getByRole('button', { name: 'Add passkey to this account' }));
    expect(
      await screen.findByText('Sign in with mail first. The passkey is added to that account.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open a new account' }));
    expect(
      screen.queryByText('Sign in with mail first. The passkey is added to that account.'),
    ).not.toBeInTheDocument();
  });

  it('hides the other controls while a ceremony is preparing', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockImplementation(() => new Promise(() => undefined));
    renderPasskey();
    const login = await screen.findByRole('button', { name: 'Log in' });
    fireEvent.click(login);
    expect(await screen.findByText('Preparing your login…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log in' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockLogin).toHaveBeenCalledTimes(1);
    const returned = mockLogin.mock.results[0];
    if (returned === undefined || returned.type !== 'return' || !(returned.value instanceof Promise)) {
      throw new Error('login did not return a promise');
    }
    const pending = returned.value as Promise<unknown>;
    let settled = false;
    pending.then(() => {
      settled = true;
    });
    pending.catch(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it('A login that resolves after unmount does not log out and does not store a session.', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const gate: { promise?: Promise<unknown>; resolve?: (value: ReturnType<typeof authResult>) => void } = {};
    mockLogin.mockImplementation(() => {
      gate.promise = new Promise((resolve) => {
        gate.resolve = resolve;
      });
      return gate.promise;
    });
    const { unmount } = renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Preparing your login…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
    expect(mockLogout).not.toHaveBeenCalled();
    unmount();
    const resolve = gate.resolve;
    if (resolve === undefined) throw new Error('login gate was not opened');
    await act(async () => {
      resolve(authResult('unlocked'));
      await Promise.resolve();
    });
    expect(mockLogout).not.toHaveBeenCalled();
    expect(passkeySession.getOpenPasskey()).toBeUndefined();
  });

  it('A login that rejects after unmount does not log out and does not store a session.', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const gate: { promise?: Promise<unknown>; reject?: (reason: unknown) => void } = {};
    mockLogin.mockImplementation(() => {
      gate.promise = new Promise((_resolve, reject) => {
        gate.reject = reject;
      });
      return gate.promise;
    });
    const { unmount } = renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Preparing your login…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
    expect(mockLogout).not.toHaveBeenCalled();
    unmount();
    const reject = gate.reject;
    if (reject === undefined) throw new Error('login gate was not opened');
    await act(async () => {
      reject(new Error('login failed'));
      await Promise.resolve();
    });
    expect(mockLogout).not.toHaveBeenCalled();
    expect(passkeySession.getOpenPasskey()).toBeUndefined();
  });

  describe('desk transfer actions', () => {
    it('closes receive and send when the same action is clicked again', () => {
      openDesk({ evm: () => ({ path: 'm/0', address: '0xabc' }) });

      fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
      expect(screen.getByRole('button', { name: /^EVM$/ })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
      expect(screen.queryByRole('button', { name: /^EVM$/ })).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      expect(screen.getByLabelText('Destination')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      expect(screen.queryByLabelText('Destination')).toBeNull();
    });

    it('shows the receive failure as a desk note', () => {
      openDesk({
        evm: () => {
          throw new Error('no address');
        },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
      fireEvent.click(screen.getByRole('button', { name: /^EVM$/ }));

      expect(screen.queryByTestId('passkey-receive-address')).toBeNull();
      expect(screen.queryByTestId('qr-code')).toBeNull();
      expect(screen.getByText('no address', { selector: 'p' })).toBeInTheDocument();
    });

    it('leaves the scan video idle when the detector disappears as the camera opens', async () => {
      const previousDetectorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'BarcodeDetector');
      const previousMediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
      const stop = jest.fn();

      class MockBarcodeDetector {
        detect = jest.fn().mockResolvedValue([]);
      }

      Object.defineProperty(globalThis, 'BarcodeDetector', {
        configurable: true,
        value: MockBarcodeDetector,
      });
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: jest.fn().mockImplementation(async () => {
            Reflect.deleteProperty(globalThis, 'BarcodeDetector');
            return { getTracks: () => [{ stop }] };
          }),
        },
      });

      try {
        openDesk({ evm: () => ({ path: 'm/0', address: '0xabc' }) });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        fireEvent.click(screen.getByRole('button', { name: 'Scan' }));

        expect(await screen.findByTestId('passkey-send-scan')).toBeInTheDocument();
        expect(screen.getByLabelText('Destination')).toHaveValue('');
      } finally {
        if (previousDetectorDescriptor) {
          Object.defineProperty(globalThis, 'BarcodeDetector', previousDetectorDescriptor);
        } else {
          Reflect.deleteProperty(globalThis, 'BarcodeDetector');
        }
        if (previousMediaDevicesDescriptor) {
          Object.defineProperty(navigator, 'mediaDevices', previousMediaDevicesDescriptor);
        } else {
          Reflect.deleteProperty(navigator, 'mediaDevices');
        }
      }
    });

    it('ignores a camera rejection from an older scan', async () => {
      const previousDetectorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'BarcodeDetector');
      const previousMediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
      let rejectFirst: (reason?: unknown) => void = () => undefined;
      const firstRequest = new Promise<MediaStream>((_, reject) => {
        rejectFirst = reject;
      });
      const getUserMedia = jest.fn().mockReturnValueOnce(firstRequest).mockRejectedValue(new Error('denied'));

      class MockBarcodeDetector {
        detect = jest.fn().mockResolvedValue([]);
      }

      Object.defineProperty(globalThis, 'BarcodeDetector', {
        configurable: true,
        value: MockBarcodeDetector,
      });
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia },
      });

      try {
        openDesk({ evm: () => ({ path: 'm/0', address: '0xabc' }) });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        fireEvent.click(screen.getByRole('button', { name: 'Scan' }));

        await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));

        fireEvent.click(screen.getByRole('button', { name: 'Scan' }));

        const unavailable = 'QR scanning is not available in this browser.';
        expect(await screen.findByText(unavailable)).toBeInTheDocument();

        await act(async () => {
          rejectFirst(new Error('older scan failed'));
          await firstRequest.catch(() => undefined);
        });

        expect(screen.getAllByText(unavailable)).toHaveLength(1);
        expect(screen.getByLabelText('Destination')).toHaveValue('');
      } finally {
        if (previousDetectorDescriptor) {
          Object.defineProperty(globalThis, 'BarcodeDetector', previousDetectorDescriptor);
        } else {
          Reflect.deleteProperty(globalThis, 'BarcodeDetector');
        }
        if (previousMediaDevicesDescriptor) {
          Object.defineProperty(navigator, 'mediaDevices', previousMediaDevicesDescriptor);
        } else {
          Reflect.deleteProperty(navigator, 'mediaDevices');
        }
      }
    });

    function renderDesk() {
      return render(<PasskeyDesk onOpenApp={mockOnLogin} onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    }

    function openDesk(keys?: unknown, state = 'unlocked') {
      act(() => {
        setOpenPasskey(authResult(state, keys) as OpenPasskey);
      });
      return renderDesk();
    }


    test('keeps the current receive address when the same family is clicked twice', () => {
      const evm = jest.fn(() => ({ path: 'm/0', address: '0xabc' }));
      openDesk({ evm });

      fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
      fireEvent.click(screen.getByRole('button', { name: /^EVM$/ }));
      expect(screen.getByTestId('passkey-receive-address')).toHaveTextContent('0xabc');

      fireEvent.click(screen.getByRole('button', { name: /^EVM$/ }));
      expect(screen.getByTestId('passkey-receive-address')).toHaveTextContent('0xabc');
      expect(evm).toHaveBeenCalledTimes(1);
    });

    test.each(['resolved play', 'rejected play'])('scans after a %s promise', async (playCase) => {
      const stop = jest.fn();
      const getUserMedia = jest.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
      const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
      const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
      const previousDetector = globalWithDetector.BarcodeDetector;
      const play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
        if (playCase === 'resolved play') return Promise.resolve();
        const rejected = Promise.reject(new Error('no play'));
        rejected.catch(() => undefined);
        return rejected;
      });

      class MockBarcodeDetector {
        detect(): Promise<{ rawValue: string }[]> {
          return Promise.resolve([{ rawValue: 'bc1qplayed' }]);
        }
      }
      globalWithDetector.BarcodeDetector = MockBarcodeDetector;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia },
      });

      try {
        openDesk({ id: 'keys' });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
        await waitFor(() => expect(screen.getByLabelText('Destination')).toHaveValue('bc1qplayed'));
        expect(play).toHaveBeenCalled();
      } finally {
        play.mockRestore();
        if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
        else globalWithDetector.BarcodeDetector = previousDetector;
        if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
        else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
      }
    });

    test('schedules another scan frame and cancels it when the send panel closes', async () => {
      const stop = jest.fn();
      const getUserMedia = jest.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
      const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
      const previousRaf = window.requestAnimationFrame;
      const previousCancelRaf = window.cancelAnimationFrame;
      const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
      const previousDetector = globalWithDetector.BarcodeDetector;
      let frameCallback: FrameRequestCallback = () => undefined;
      const requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
        frameCallback = callback;
        return 7;
      });
      const cancelAnimationFrame = jest.fn();

      class MockBarcodeDetector {
        detect(): Promise<{ rawValue: string }[]> {
          return Promise.resolve([]);
        }
      }
      globalWithDetector.BarcodeDetector = MockBarcodeDetector;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia },
      });
      window.requestAnimationFrame = requestAnimationFrame;
      window.cancelAnimationFrame = cancelAnimationFrame;

      try {
        openDesk({ id: 'keys' });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
        await waitFor(() => expect(frameCallback).toBeDefined());
        await waitFor(() => expect(requestAnimationFrame).toHaveBeenCalledTimes(1));
        act(() => {
          frameCallback(0);
        });
        await waitFor(() => expect(requestAnimationFrame).toHaveBeenCalledTimes(2));
        expect(screen.getByLabelText('Destination')).toHaveValue('');
        expect(mockLink).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        expect(cancelAnimationFrame).toHaveBeenCalledWith(7);

        act(() => {
          frameCallback(0);
        });
      } finally {
        window.requestAnimationFrame = previousRaf;
        window.cancelAnimationFrame = previousCancelRaf;
        if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
        else globalWithDetector.BarcodeDetector = previousDetector;
        if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
        else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
      }
    });

    test('ignores a detection result from an earlier scan', async () => {
      const firstStop = jest.fn();
      const secondStop = jest.fn();
      const getUserMedia = jest
        .fn()
        .mockResolvedValueOnce({ getTracks: () => [{ stop: firstStop }] })
        .mockResolvedValueOnce({ getTracks: () => [{ stop: secondStop }] });
      const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
      const previousRaf = window.requestAnimationFrame;
      const previousCancelRaf = window.cancelAnimationFrame;
      const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
      const previousDetector = globalWithDetector.BarcodeDetector;
      const requestAnimationFrame = jest.fn((_callback: FrameRequestCallback) => 7);
      const cancelAnimationFrame = jest.fn();
      let resolveFirst: (codes: { rawValue: string }[]) => void = () => undefined;
      const firstDetect = new Promise<{ rawValue: string }[]>((resolve) => {
        resolveFirst = resolve;
      });
      const detect = jest.fn().mockImplementationOnce(() => firstDetect).mockResolvedValueOnce([]);

      class MockBarcodeDetector {
        detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> {
          return detect(source);
        }
      }
      globalWithDetector.BarcodeDetector = MockBarcodeDetector;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia },
      });
      window.requestAnimationFrame = requestAnimationFrame;
      window.cancelAnimationFrame = cancelAnimationFrame;

      const view = openDesk({ id: 'keys' });
      try {
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
        await waitFor(() => expect(screen.getByTestId('passkey-send-scan')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
        await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
        await act(async () => {
          resolveFirst([{ rawValue: 'bc1qignored' }]);
          await firstDetect;
        });

        await waitFor(() => expect(requestAnimationFrame).toHaveBeenCalled());
        expect(screen.getByTestId('passkey-send-scan')).toBeInTheDocument();
        expect(screen.getByLabelText('Destination')).toHaveValue('');
        expect(firstStop).toHaveBeenCalled();
        expect(mockLink).not.toHaveBeenCalled();
      } finally {
        view.unmount();
        window.requestAnimationFrame = previousRaf;
        window.cancelAnimationFrame = previousCancelRaf;
        if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
        else globalWithDetector.BarcodeDetector = previousDetector;
        if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
        else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
      }
    });

    it('shows receive and send on an unlocked desk with the existing actions', () => {
      openDesk({ id: 'keys' });

      expect(screen.getByRole('button', { name: 'Open the app' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Link Bitcoin' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Receive' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    });

    it('shows the evm(0) receive address and qr without using the account index field', () => {
      const evm = jest.fn((index: number) => ({ path: `m/${index}`, address: `addr-${index}` }));
      openDesk({ evm });

      fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
      fireEvent.click(screen.getByRole('button', { name: /^EVM$/ }));

      expect(screen.getByTestId('passkey-receive-address')).toHaveTextContent('addr-0');
      expect(screen.getByTestId('qr-code')).toHaveTextContent('addr-0');
      expect(screen.getByLabelText('EVM account index')).toHaveValue('1');
      expect(evm).toHaveBeenCalledWith(0);
      expect(evm).not.toHaveBeenCalledWith(1);
    });

    it('hides the previous receive address before the next family is read', () => {
      const evm = jest.fn((index: number) => ({ path: `m/${index}`, address: `addr-${index}` }));
      const bitcoinAddress = jest.fn(() => {
        expect(screen.queryByText('addr-0')).not.toBeInTheDocument();
        return { path: "m/84'/0'/0'/0/0", address: 'bc1qnext', publicKey: new Uint8Array() };
      });
      openDesk({ evm, bitcoinNetwork: 'mainnet', bitcoinAddress });

      fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
      fireEvent.click(screen.getByRole('button', { name: /^EVM$/ }));
      expect(screen.getByTestId('passkey-receive-address')).toHaveTextContent('addr-0');

      fireEvent.click(screen.getByRole('button', { name: /^Bitcoin$/ }));

      expect(screen.getByTestId('passkey-receive-address')).toHaveTextContent('bc1qnext');
      expect(screen.queryByText('addr-0')).not.toBeInTheDocument();
      expect(bitcoinAddress).toHaveBeenCalledWith(0, 0);
      expect(evm).toHaveBeenCalledWith(0);
      expect(evm).not.toHaveBeenCalledWith(1);
    });

    it('shows the spark identity receive address', () => {
      openDesk({
        sparkIdentity: () => ({ path: "m/879'/0'/0'", publicKey: new Uint8Array(), address: 'spark1identity' }),
      });

      fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
      fireEvent.click(screen.getByRole('button', { name: 'Spark' }));

      expect(screen.getByTestId('passkey-receive-address')).toHaveTextContent('spark1identity');
    });

    it('shows bitcoinAddress(0, 0) on a mainnet ring without building a login ring', () => {
      const bitcoinAddress = jest.fn((_chain: 0 | 1, _index: number) => ({
        path: "m/84'/0'/0'/0/0",
        address: 'bc1qreceive',
        publicKey: new Uint8Array(),
      }));
      openDesk({ bitcoinNetwork: 'mainnet', bitcoinAddress });

      fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
      fireEvent.click(screen.getByRole('button', { name: /^Bitcoin$/ }));

      expect(bitcoinAddress).toHaveBeenCalledWith(0, 0);
      expect(screen.getByTestId('passkey-receive-address')).toHaveTextContent('bc1qreceive');
    });

    it('shows the mainnet login receive address for a testnet4 ring and wipes that ring', () => {
      const wipe = jest.fn();
      mockBuildLoginRing = () => {
        const loginRing = {
          wipe,
          bitcoinAddress: (_chain: 0 | 1, _index: number) => ({
            path: "m/84'/0'/0'/0/0",
            address: 'bc1qmain',
            publicKey: new Uint8Array(),
          }),
        };
        return loginRing;
      };
      const sessionBitcoinAddress = jest.fn(() => ({
        path: "m/84'/1'/0'/0/0",
        address: 'tb1qsession',
        publicKey: new Uint8Array(),
      }));
      openDesk({
        bitcoinNetwork: 'testnet4',
        mnemonic: () => 'seed phrase',
        bitcoinAddress: sessionBitcoinAddress,
      });

      fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
      fireEvent.click(screen.getByRole('button', { name: /^Bitcoin$/ }));

      expect(screen.getByTestId('passkey-receive-address')).toHaveTextContent('bc1qmain');
      expect(screen.queryByText('tb1qsession')).not.toBeInTheDocument();
      expect(wipe).toHaveBeenCalled();
    });

    it('asks to unlock instead of showing a receive address when the desk is locked', () => {
      openDesk(undefined, 'locked');

      fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
      fireEvent.click(screen.getByRole('button', { name: /^EVM$/ }));

      expect(screen.getByText('Unlock the wallet to show this address.')).toBeInTheDocument();
      expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument();
      expect(screen.queryByTestId('passkey-receive-address')).not.toBeInTheDocument();
    });

    it('copies the shown receive address', async () => {
      const writeText = jest.fn().mockResolvedValue(undefined);
      const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

      try {
        openDesk({ evm: () => ({ path: 'm/0', address: '0xcopyme' }) });
        fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
        fireEvent.click(screen.getByRole('button', { name: /^EVM$/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith('0xcopyme'));
      } finally {
        if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard);
        else delete (navigator as { clipboard?: Clipboard }).clipboard;
      }
    });

    it('keeps a typed send destination and amount without sending', () => {
      openDesk({ id: 'keys' });

      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'bc1qdest' } });
      fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1.5abc' } });

      expect(screen.getByLabelText('Destination')).toHaveValue('bc1qdest');
      expect(screen.getByLabelText('Amount')).toHaveValue('1.5abc');
      expect(screen.getByText('Sending is not active yet.')).toBeInTheDocument();
      expect(mockLink).not.toHaveBeenCalled();
      expect(mockWallets).not.toHaveBeenCalled();
      expect(mockDiagnostics).not.toHaveBeenCalled();
    });

    it('pastes into the destination and leaves a typed value when paste is rejected', async () => {
      const readText = jest.fn();
      const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });

      try {
        openDesk({ id: 'keys' });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));

        readText.mockResolvedValueOnce('bc1qpasted');
        fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
        await waitFor(() => expect(screen.getByLabelText('Destination')).toHaveValue('bc1qpasted'));

        fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'keep-typed' } });
        readText.mockRejectedValueOnce(new Error('denied'));
        fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
        await waitFor(() => expect(screen.getByText('Paste is not available in this browser.')).toBeInTheDocument());
        expect(screen.getByLabelText('Destination')).toHaveValue('keep-typed');
      } finally {
        if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard);
        else delete (navigator as { clipboard?: Clipboard }).clipboard;
      }
    });

    it('fills the destination from a scanned qr and stops the camera', async () => {
      const stop = jest.fn();
      const getUserMedia = jest.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
      const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
      const previousRaf = window.requestAnimationFrame;
      const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
      const previousDetector = globalWithDetector.BarcodeDetector;

      class MockBarcodeDetector {
        detect(): Promise<{ rawValue: string }[]> {
          return Promise.resolve([{ rawValue: 'bc1qfromqr' }]);
        }
      }
      globalWithDetector.BarcodeDetector = MockBarcodeDetector;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia },
      });
      window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }) as typeof requestAnimationFrame;

      try {
        openDesk({ id: 'keys' });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
        await waitFor(() => expect(screen.getByLabelText('Destination')).toHaveValue('bc1qfromqr'));
        expect(stop).toHaveBeenCalled();
        expect(mockLink).not.toHaveBeenCalled();
      } finally {
        window.requestAnimationFrame = previousRaf;
        if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
        else globalWithDetector.BarcodeDetector = previousDetector;
        if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
        else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
      }
    });

    it('stops the first camera when scan is pressed again', async () => {
      const firstStop = jest.fn();
      const secondStop = jest.fn();
      let resolveFirst: (stream: { getTracks: () => { stop: () => void }[] }) => void = () => undefined;
      const getUserMedia = jest
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveFirst = resolve;
            }),
        )
        .mockResolvedValueOnce({ getTracks: () => [{ stop: secondStop }] });
      const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
      const previousRaf = window.requestAnimationFrame;
      const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
      const previousDetector = globalWithDetector.BarcodeDetector;

      class MockBarcodeDetector {
        detect(): Promise<{ rawValue: string }[]> {
          return Promise.resolve([]);
        }
      }
      globalWithDetector.BarcodeDetector = MockBarcodeDetector;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia },
      });
      window.requestAnimationFrame = ((_callback: FrameRequestCallback) => 1) as typeof requestAnimationFrame;

      try {
        openDesk({ id: 'keys' });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
        fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
        resolveFirst({ getTracks: () => [{ stop: firstStop }] });
        await waitFor(() => expect(firstStop).toHaveBeenCalled());
        expect(getUserMedia).toHaveBeenCalledTimes(2);
        expect(secondStop).not.toHaveBeenCalled();
        expect(screen.getByLabelText('Destination')).toHaveValue('');
        expect(mockLink).not.toHaveBeenCalled();
      } finally {
        window.requestAnimationFrame = previousRaf;
        if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
        else globalWithDetector.BarcodeDetector = previousDetector;
        if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
        else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
      }
    });

    it('explains when qr scanning is not available', () => {
      const getUserMedia = jest.fn();
      const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
      const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
      const previousDetector = globalWithDetector.BarcodeDetector;
      delete globalWithDetector.BarcodeDetector;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia },
      });

      try {
        openDesk({ id: 'keys' });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
        expect(screen.getByText('QR scanning is not available in this browser.')).toBeInTheDocument();
        expect(getUserMedia).not.toHaveBeenCalled();
      } finally {
        if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
        else globalWithDetector.BarcodeDetector = previousDetector;
        if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
        else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
      }
    });

    it('explains when the camera rejects the scan', async () => {
      const getUserMedia = jest.fn().mockRejectedValue(new Error('denied'));
      const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
      const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
      const previousDetector = globalWithDetector.BarcodeDetector;

      class MockBarcodeDetector {
        detect(): Promise<{ rawValue: string }[]> {
          return Promise.resolve([]);
        }
      }
      globalWithDetector.BarcodeDetector = MockBarcodeDetector;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia },
      });

      try {
        openDesk({ id: 'keys' });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
        await waitFor(() =>
          expect(screen.getByText('QR scanning is not available in this browser.')).toBeInTheDocument(),
        );
        expect(getUserMedia).toHaveBeenCalledTimes(1);
      } finally {
        if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
        else globalWithDetector.BarcodeDetector = previousDetector;
        if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
        else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
      }
    });

    it('explains when paste has no clipboard', () => {
      const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });

      try {
        openDesk({ id: 'keys' });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'keep-typed' } });
        fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
        expect(screen.getByText('Paste is not available in this browser.')).toBeInTheDocument();
        expect(screen.getByLabelText('Destination')).toHaveValue('keep-typed');
      } finally {
        if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard);
        else delete (navigator as { clipboard?: Clipboard }).clipboard;
      }
    });
  });
});

describe('passkey platform helpers', () => {
  it('maps the page host onto the wallet environment', () => {
    expect(walletEnvForHost('localhost')).toBe('loc');
    expect(walletEnvForHost('127.0.0.1')).toBe('loc');
    expect(walletEnvForHost('dev.app.dfx.swiss')).toBe('dev');
    expect(String(walletEnvForHost('stg.app.dfx.swiss'))).toBe('stg');
    expect(walletEnvForHost('app.dfx.swiss')).toBe('prd');
    expect(walletEnvForHost('example.test')).toBe('prd');
  });

  it('keeps an older wallet package on the production check for the staging host', () => {
    const ids = RP_IDS as { stg?: string };
    const previous = ids.stg;
    delete ids.stg;
    expect(walletEnvForHost('stg.app.dfx.swiss')).toBe('prd');
    ids.stg = previous;
  });

  it('explains only an unavailable platform', () => {
    expect(passkeyPlatformBlock(undefined)).toBeUndefined();
    expect(passkeyPlatformBlock({ available: true, prf: 'yes' })).toBeUndefined();
    expect(passkeyPlatformBlock({ available: false, prf: 'unknown' })).toBeUndefined();
    expect(passkeyPlatformBlock({ available: false, reason: 'no-webauthn', prf: 'unknown' })).toBe(
      'This browser has no passkey support',
    );
    expect(passkeyPlatformBlock({ available: false, reason: 'no-prf', prf: 'no' })).toBe(
      'This browser has no passkey support',
    );
    expect(passkeyPlatformBlock({ available: false, reason: 'in-app-browser', prf: 'unknown' })).toBe(
      'This browser has no passkey support',
    );
    expect(passkeyPlatformBlock({ available: false, reason: 'embedded', prf: 'unknown' })).toBe(
      'This browser has no passkey support',
    );
    expect(passkeyPlatformBlock({ available: false, reason: 'wrong-origin', prf: 'unknown' })).toBe(
      'This browser has no passkey support',
    );
    expect(passkeyPlatformBlock({ available: false, reason: 'os-too-old', prf: 'unknown', os: '17.5' })).toBe(
      'This browser has no passkey support',
    );
  });
});

describe('passkey ceremony helpers', () => {
  it('classifies dismissed, unknown, prf and platform reports', () => {
    expect(passkeyDismissed(null)).toBe(false);
    expect(passkeyDismissed('nope')).toBe(false);
    expect(passkeyDismissed(1)).toBe(false);
    expect(passkeyDismissed(namedError('TimeoutError'))).toBe(false);
    expect(passkeyDismissed(namedError('UserActivationMissingError'))).toBe(false);
    expect(passkeyDismissed(new Error('boom'))).toBe(false);
    expect(passkeyDismissed(namedError('NotAllowedError'))).toBe(true);
    expect(passkeyDismissed(namedError('AbortError'))).toBe(true);
    expect(passkeyDismissed({ code: 'ceremony-cancelled' })).toBe(true);

    expect(passkeyUnknownCredential(null)).toBe(false);
    expect(passkeyUnknownCredential('unknown credential')).toBe(false);
    expect(passkeyUnknownCredential(1)).toBe(false);
    expect(passkeyUnknownCredential({ message: 'Unknown credential' })).toBe(true);
    expect(passkeyUnknownCredential({ code: 'UNKNOWN CREDENTIAL' })).toBe(true);
    expect(passkeyUnknownCredential({ code: 'UnknownCredential', message: 'nope' })).toBe(true);
    expect(passkeyUnknownCredential({ code: 'UnknownCredential' })).toBe(true);
    expect(passkeyUnknownCredential({ code: 'unknown' })).toBe(false);
    expect(passkeyUnknownCredential({ message: 1 })).toBe(false);

    expect(passkeyPrfUnsupported(null)).toBe(false);
    expect(passkeyPrfUnsupported('no prf')).toBe(false);
    expect(passkeyPrfUnsupported(1)).toBe(false);
    expect(passkeyPrfUnsupported({ message: 'no PRF' })).toBe(true);
    expect(passkeyPrfUnsupported({ code: 'prf-unavailable' })).toBe(true);

    expect(passkeyOsTooOld(undefined)).toBe('This operating system cannot sign in with a passkey.');
    expect(passkeyOsTooOld('')).toBe('This operating system cannot sign in with a passkey.');
    expect(passkeyOsTooOld('   ')).toBe('This operating system cannot sign in with a passkey.');
    expect(passkeyOsTooOld('17.0')).toBe('This operating system (17.0) cannot sign in with a passkey.');
    expect(passkeyOsTooOld(' 17.0 ')).toBe('This operating system (17.0) cannot sign in with a passkey.');

    expect(passkeyShowIosHint('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(passkeyShowIosHint('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe(true);
    expect(passkeyShowIosHint('Mozilla/5.0 (iPod touch; CPU iPhone OS 16_0 like Mac OS X)')).toBe(true);
    expect(passkeyShowIosHint('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(false);

    expect(passkeyPlatformView(undefined)).toBe('pending');
    expect(passkeyPlatformView({ available: false, reason: 'in-app-browser', prf: 'unknown' })).toBe('in-app');
    expect(passkeyPlatformView({ available: true, reason: 'in-app-browser', prf: 'yes' })).toBe('in-app');
    expect(passkeyPlatformView({ available: false, reason: 'os-too-old', prf: 'unknown', os: '16.0' })).toBe('os-old');
    expect(passkeyPlatformView({ available: false, reason: 'no-webauthn', prf: 'unknown' })).toBe('blocked');
    expect(passkeyPlatformView({ available: false, prf: 'unknown' })).toBe('blocked');
    expect(passkeyPlatformView({ available: false, reason: 'no-prf', prf: 'no' })).toBe('blocked');
    expect(passkeyPlatformView({ available: true, prf: 'yes' })).toBe('ready');
  });
});
