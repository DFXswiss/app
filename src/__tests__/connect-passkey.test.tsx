jest.mock('@dfx.swiss/react/dist/definitions/auth', () => ({
  AuthWalletType: { METAMASK: 'MetaMask', ALBY: 'Alby', WALLET_BROWSER: 'WalletBrowser', RABBY: 'Rabby' },
}));

const mockLogout = jest.fn(() => Promise.resolve());
let mockCurrency: { name: string } | undefined;
let mockLocale = 'en-US';
const mockChangeCurrency = jest.fn();
function interpolate(text: string, values?: Record<string, string | number>): string {
  return text.replace(/{{(\w+)}}/g, (match, key: string) =>
    values?.[key] === undefined ? match : String(values[key]),
  );
}
const mockTranslate = jest.fn((_key: string, text: string, values?: Record<string, string | number>) =>
  interpolate(text, values),
);

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { ETHEREUM: 'Ethereum', BITCOIN: 'Bitcoin' },
  Utils: { isJwt: () => false },
  useSessionContext: () => ({
    isInitialized: false,
    isLoggedIn: false,
    logout: () => mockLogout(),
    authenticate: () => undefined,
  }),
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

jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({ isInitialized: true, params: {}, setRedirectPath: () => undefined }),
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: mockTranslate,
    availableLanguages: [],
    locale: mockLocale,
    currency: mockCurrency,
    changeCurrency: mockChangeCurrency,
  }),
}));

jest.mock('../components/payment/qr-code', () => ({
  QrBasic: ({ data }: { data: string }) => <div data-testid="qr-code">{data}</div>,
}));

const mockCheckPasskeyPlatform = jest.fn(() => new Promise(() => undefined));
const mockRegister = jest.fn();
const mockLogin = jest.fn();
const mockLink = jest.fn();
const mockUnlock = jest.fn();
const mockRevoke = jest.fn();
const mockExport = jest.fn();
const mockVerify = jest.fn();
const mockWallets = jest.fn();
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
    KeyRing: {
      fromMnemonic: (mnemonic: unknown) => mockBuildLoginRing(mnemonic),
    },
  }),
  { virtual: true },
);

jest.mock('../contexts/wallet.context', () => ({
  WalletType: { PASSKEY: 'Passkey' },
}));

jest.mock('../components/home/wallet/wallet-client', () => ({
  createWalletClient: () => ({
    login: (...args: unknown[]) => mockLogin(...args),
    register: (...args: unknown[]) => mockRegister(...args),
    unlock: (...args: unknown[]) => mockUnlock(...args),
    link: (...args: unknown[]) => mockLink(...args),
    revoke: (...args: unknown[]) => mockRevoke(...args),
    exportMnemonic: (...args: unknown[]) => mockExport(...args),
    verifyServerAddresses: (...args: unknown[]) => mockVerify(...args),
    wallets: (...args: unknown[]) => mockWallets(...args),
    credentialStatus: (...args: unknown[]) => mockCredentialStatus(...args),
    diagnostics: (...args: unknown[]) => mockDiagnostics(...args),
  }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  StyledVerticalStack: ({ children, full }: { children?: unknown; full?: boolean }) => (
    <div data-full={full ? 'true' : undefined}>{children}</div>
  ),
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
import { PasskeyReceivePanel } from '../components/home/wallet/passkey-transfer';
import PasskeySheet from '../components/home/wallet/passkey-sheet';
import {
  PASSKEY_GENERIC_ERROR,
  PASSKEY_IN_APP_BODY,
  PASSKEY_UNKNOWN_BODY,
  passkeyDismissed,
  passkeyMessage,
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
  return { evm: () => ({ address }), wipe: jest.fn() };
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
      backupEligible: false,
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
    localStorage.removeItem('dfx.wallet.currency');
    mockBuildLoginRing = () => {
      throw new Error('unexpected login ring');
    };
    jest.clearAllMocks();
    mockTranslate.mockImplementation((_key, text, values) => interpolate(text, values));
    mockCurrency = undefined;
    mockLocale = 'en-US';
    mockLogout.mockResolvedValue(undefined);
    mockSetSession.mockResolvedValue(undefined);
    mockRevoke.mockResolvedValue({ id: 7, status: 'Lost' });
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

  it('places the desk in a full-width stack', () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    renderPasskey();
    expect(screen.getByRole('main').parentElement).toHaveAttribute('data-full', 'true');
    expect(screen.getByRole('main')).toHaveClass('w-full', 'max-w-[560px]');
  });

  it('shows a balance placeholder or the supplied balance and opens send', () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    const view = render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    expect(screen.getByLabelText('Loading balance')).toBeInTheDocument();
    view.rerender(
      <PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} balance={{ chf: 1234.5, eur: 1000 }} />,
    );
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('.50')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByRole('dialog', { name: 'Send' })).toBeInTheDocument();
  });

  it('changes both balance and asset currency locally without a DFX user', () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    render(
      <PasskeyDesk
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

  it('formats asset values with the same locale as the balance', () => {
    mockLocale = 'de-DE';
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    render(
      <PasskeyDesk
        onCancel={mockOnCancel}
        onRevoked={mockOnSwitch}
        balance={{ chf: 1234.5, eur: 1000 }}
        assets={[{ name: 'Bitcoin', amount: '1 BTC', chf: 1234.5, eur: 1000 }]}
      />,
    );
    expect(screen.getByText('1.234')).toBeInTheDocument();
    expect(screen.getByText(',50')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
    expect(screen.getByText('CHF 1.234,50')).toBeInTheDocument();
  });

  it('stores wallet currency without calling changeCurrency', () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    const view = render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'EUR' }));
    expect(screen.getByRole('button', { name: 'EUR' })).toHaveAttribute('aria-pressed', 'true');
    expect(mockChangeCurrency).not.toHaveBeenCalled();
    expect(localStorage.getItem('dfx.wallet.currency')).toBe('EUR');
    view.rerender(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'CHF' }));
    expect(screen.getByRole('button', { name: 'CHF' })).toHaveAttribute('aria-pressed', 'true');
    expect(mockChangeCurrency).not.toHaveBeenCalled();
  });

  it('does not call changeCurrency when selecting EUR', () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'EUR' }));
    expect(screen.getByRole('button', { name: 'EUR' })).toHaveAttribute('aria-pressed', 'true');
    expect(mockChangeCurrency).not.toHaveBeenCalled();
  });

  it('restores the wallet currency independently of the account currency', () => {
    mockCurrency = { name: 'EUR' };
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    const view = render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    expect(screen.getByRole('button', { name: 'CHF' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'EUR' }));
    view.unmount();
    mockCurrency = { name: 'CHF' };
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    expect(screen.getByRole('button', { name: 'EUR' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses CHF for invalid or unavailable storage and retains an in-memory choice', () => {
    localStorage.setItem('dfx.wallet.currency', 'USD');
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    const view = render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    expect(screen.getByRole('button', { name: 'CHF' })).toHaveAttribute('aria-pressed', 'true');
    view.unmount();
    const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage');
    });
    const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage');
    });
    try {
      render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
      expect(screen.getByRole('button', { name: 'CHF' })).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByRole('button', { name: 'EUR' }));
      expect(screen.getByRole('button', { name: 'EUR' })).toHaveAttribute('aria-pressed', 'true');
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });

  it('leaves buy, sell, swap and pay on the desk and still shows assets and send', () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    render(
      <PasskeyDesk
        onCancel={mockOnCancel}
        onRevoked={mockOnSwitch}
        assets={[{ name: 'Bitcoin', amount: '1 BTC', chf: 100, eur: 90, network: 'Bitcoin' }]}
      />,
    );
    for (const name of ['Buy', 'Sell', 'Swap', 'Pay']) {
      fireEvent.click(screen.getByRole('button', { name }));
    }
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByRole('dialog', { name: 'Send' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
    expect(screen.getByText('1 BTC')).toBeInTheDocument();
    expect(screen.getByText('CHF 100.00')).toBeInTheDocument();
  });

  it('dismisses a toast after 4000 milliseconds', () => {
    jest.useFakeTimers();
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    const view = render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
      fireEvent.click(screen.getByRole('button', { name: 'Copy address Ethereum & EVM' }));
      expect(screen.getByRole('status')).toHaveTextContent('Clipboard is not available.');
      act(() => jest.advanceTimersByTime(3999));
      expect(screen.getByRole('status')).toHaveTextContent('Clipboard is not available.');
      act(() => jest.advanceTimersByTime(1));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      view.unmount();
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else delete (navigator as { clipboard?: Clipboard }).clipboard;
      jest.useRealTimers();
    }
  });

  it('restarts the toast timeout when a newer toast replaces it', () => {
    jest.useFakeTimers();
    let messages = 0;
    mockTranslate.mockImplementation((_namespace, text) =>
      text === 'Clipboard is not available.' ? `Message ${++messages}` : text,
    );
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    const view = render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
      fireEvent.click(screen.getByRole('button', { name: 'Copy address Ethereum & EVM' }));
      expect(screen.getByRole('status')).toHaveTextContent('Message 1');
      act(() => jest.advanceTimersByTime(3000));
      fireEvent.click(screen.getByRole('button', { name: 'Copy address Ethereum & EVM' }));
      expect(screen.getByRole('status')).toHaveTextContent('Message 2');
      act(() => jest.advanceTimersByTime(1000));
      expect(screen.getByRole('status')).toHaveTextContent('Message 2');
      act(() => jest.advanceTimersByTime(3000));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      view.unmount();
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else delete (navigator as { clipboard?: Clipboard }).clipboard;
      jest.useRealTimers();
    }
  });

  it('dismisses a clicked toast and cancels its timeout', () => {
    jest.useFakeTimers();
    const clear = jest.spyOn(global, 'clearTimeout');
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    const view = render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
      fireEvent.click(screen.getByRole('button', { name: 'Copy address Ethereum & EVM' }));
      fireEvent.click(screen.getByRole('status'));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(clear).toHaveBeenCalledTimes(1);
      act(() => jest.advanceTimersByTime(4000));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      view.unmount();
      clear.mockRestore();
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else delete (navigator as { clipboard?: Clipboard }).clipboard;
      jest.useRealTimers();
    }
  });

  it('clears a pending toast timeout when the desk unmounts', () => {
    jest.useFakeTimers();
    const clear = jest.spyOn(global, 'clearTimeout');
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    const view = render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
      fireEvent.click(screen.getByRole('button', { name: 'Copy address Ethereum & EVM' }));
      expect(screen.getByRole('status')).toHaveTextContent('Clipboard is not available.');
      view.unmount();
      expect(clear).toHaveBeenCalledTimes(1);
      act(() => jest.advanceTimersByTime(4000));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      clear.mockRestore();
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else delete (navigator as { clipboard?: Clipboard }).clipboard;
      jest.useRealTimers();
    }
  });

  it('copies a listed address and reports clipboard failure', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    const writeText = jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('clipboard denied'));
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
      fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
      fireEvent.click(screen.getByRole('button', { name: 'Copy address Ethereum & EVM' }));
      expect(await screen.findByRole('status')).toHaveTextContent('Address copied');
      expect(writeText).toHaveBeenCalledWith(SEED);
      fireEvent.click(screen.getByRole('status'));
      fireEvent.click(screen.getByRole('button', { name: 'Copy address Ethereum & EVM' }));
      expect(await screen.findByRole('status')).toHaveTextContent('clipboard denied');
      expect(mockTranslate).toHaveBeenCalledWith('screens/home', 'clipboard denied');
    } finally {
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else delete (navigator as { clipboard?: Clipboard }).clipboard;
    }
  });

  it.each(['missing', 'throws'] as const)('reports a %s clipboard without throwing', async (mode) => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = jest.fn(() => {
      throw new Error('clipboard denied');
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: mode === 'missing' ? undefined : { writeText },
    });
    try {
      render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
      fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
      fireEvent.click(screen.getByRole('button', { name: 'Copy address Ethereum & EVM' }));
      expect(await screen.findByRole('status')).toHaveTextContent(
        mode === 'missing' ? 'Clipboard is not available.' : 'clipboard denied',
      );
    } finally {
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else delete (navigator as { clipboard?: Clipboard }).clipboard;
    }
  });

  it('labels Spark and EVM addresses and displays supplied EUR values', () => {
    mockTranslate.mockImplementation((_namespace, text) => {
      if (text === 'Lightning (Spark)') return 'Spark translated';
      if (text === 'Ethereum & EVM') return 'EVM translated';
      if (text === 'Copy address') return 'Copy translated';
      return text;
    });
    localStorage.setItem('dfx.wallet.currency', 'EUR');
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
        onCancel={mockOnCancel}
        onRevoked={mockOnSwitch}
        assets={[{ name: 'Ether', amount: '1 ETH', chf: 100, eur: 90 }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
    expect(screen.getByText('Spark translated')).toBeInTheDocument();
    expect(screen.getByText('EVM translated')).toBeInTheDocument();
    expect(screen.getByText('EUR 90.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy translated Spark translated' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy translated EVM translated' })).toBeInTheDocument();
  });

  it('reports SDK errors inside the open settings dialog', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    mockCredentialStatus.mockRejectedValueOnce(new Error('status unavailable'));
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
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
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record a diagnostic' }));
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
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    for (const name of ['Settings', 'Buy', 'Sell', 'Swap']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
    await act(async () => finish({ state: 'unlocked', keys: ring(SEED) }));
    expect(screen.getByRole('dialog', { name: 'Receive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeEnabled();
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
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    await waitFor(() => expect(mockLink).toHaveBeenCalledTimes(1));
    for (const name of ['Buy', 'Sell', 'Swap', 'Send', 'Receive', 'Pay']) {
      const action = screen.getByRole('button', { name });
      expect(action).toBeDisabled();
      fireEvent.click(action);
    }
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await act(async () => fail(new Error('Bitcoin link failed')));
    expect(await screen.findByRole('status')).toHaveTextContent('Bitcoin link failed');
    for (const name of ['Buy', 'Sell', 'Swap', 'Send', 'Receive', 'Pay']) {
      expect(screen.getByRole('button', { name })).toBeEnabled();
    }
  });

  it('ignores a block request during the synchronous start of another action', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const block = screen.getByRole('button', { name: 'Block passkey' });
    mockDiagnostics.mockImplementationOnce(() => {
      fireEvent.click(block);
      return Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record a diagnostic' }));
    expect(await screen.findByText('Diagnostic recorded.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
  });

  it('returns focus to settings trigger after closing the block dialog', () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
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
      const view = render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
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

  it('does not show a verification result after the session changes during verification', async () => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    const next = { ...session, wallet: { ...session.wallet, credentialId: 'new-credential' } };
    mockVerify.mockImplementationOnce(() => {
      setOpenPasskey(next);
      return [{ family: 'Evm', address: SEED, matches: true }];
    });
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Check addresses/ }));
    await waitFor(() => expect(mockVerify).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('1 / 1 addresses match')).not.toBeInTheDocument();
    expect(passkeySession.getOpenPasskey()).toBe(next);
  });

  it('ignores a Bitcoin link refresh error after the desk unmounts', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED), false) as unknown as OpenPasskey);
    mockLink.mockResolvedValueOnce({ address: { family: 'Bitcoin', address: 'bc1qlogin' } });
    let fail: (error: Error) => void = () => undefined;
    mockWallets.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const view = render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    await waitFor(() => expect(mockWallets).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => fail(new Error('late error')));
    expect(mockTranslate).not.toHaveBeenCalledWith('screens/home', 'late error');
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
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check passkey status' }));
    expect(screen.getByRole('button', { name: 'Receive' })).toBeDisabled();
    await act(async () => finish([{ credentialId: 'cred', status: 'Active' }]));
    expect(screen.getByText('cred: Active')).toBeInTheDocument();
  });

  it('disables Use another passkey during a pending status check and keeps the open session and its keys', async () => {
    const keys = ring(SEED);
    const session = authResult('unlocked', keys) as unknown as OpenPasskey;
    setOpenPasskey(session);
    let finish: (value: unknown) => void = () => undefined;
    mockCredentialStatus.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check passkey status' }));
    expect(mockCredentialStatus).toHaveBeenCalledWith(['cred']);
    expect(screen.getByRole('button', { name: 'Use another passkey' })).toBeDisabled();
    expect(passkeySession.getOpenPasskey()).toBe(session);
    expect(keys.wipe).not.toHaveBeenCalled();
    await act(async () => finish([{ credentialId: 'cred', status: 'Active' }]));
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
    const view = render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
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
          if (next === 'Diagnostic recorded.' || next === 'late diagnostic error') staleWrite(next);
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
      const view = render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
      fireEvent.click(screen.getByRole('button', { name: 'Record a diagnostic' }));
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
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
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
    mockRevoke.mockResolvedValueOnce({ id: 7, status: 'Lost' });
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
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
      fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
      fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
      await waitFor(() => expect(passkeySession.getOpenPasskey()).toBeUndefined());
      act(() => setOpenPasskey(session));
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
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
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
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Recovery words' });
    expect(await screen.findByText('export failed')).toBeInTheDocument();
    expect(dialog).toContainElement(screen.getByText('export failed'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
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
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
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

  it.each([7, 8])('keeps the wallet open when revocation returns Active for wallet %s', async (id) => {
    const keys = ring(SEED);
    const session = authResult('unlocked', keys) as unknown as OpenPasskey;
    setOpenPasskey(session);
    mockRevoke.mockResolvedValueOnce({ id, status: 'Active' });
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The passkey was not blocked. Please try again.');
    expect(screen.getByLabelText('I understand that this cannot be undone.')).toBeChecked();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Block', exact: true })).toBeEnabled());
    expect(screen.queryByText(/That passkey is now blocked/)).not.toBeInTheDocument();
    expect(passkeySession.getOpenPasskey()).toBe(session);
    expect(keys.wipe).not.toHaveBeenCalled();
    expect(mockOnSwitch).not.toHaveBeenCalled();
  });

  it.each(['changed', 'unmounted'] as const)('does not show an Active result after the desk is %s', async (change) => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    let finish: (value: { id: number; status: string }) => void = () => undefined;
    mockRevoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    const replacement = { ...session, wallet: { ...session.wallet, credentialId: 'other' } };
    if (change === 'unmounted') view.unmount();
    else act(() => setOpenPasskey(replacement));
    await act(async () => finish({ id: 7, status: 'Active' }));
    expect(screen.queryByText('The passkey was not blocked. Please try again.')).not.toBeInTheDocument();
    expect(passkeySession.getOpenPasskey()).toBe(change === 'unmounted' ? session : replacement);
    expect(mockOnSwitch).not.toHaveBeenCalled();
  });

  it('keeps the current wallet open when a different passkey is revoked', async () => {
    const keys = ring(SEED);
    const session = authResult('unlocked', keys) as unknown as OpenPasskey;
    setOpenPasskey(session);
    mockRevoke.mockResolvedValueOnce({ id: 8, status: 'Lost' });
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You confirmed with a different passkey. That passkey is now blocked; this wallet is still active.',
    );
    expect(screen.getByLabelText('I understand that this cannot be undone.')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Block', exact: true })).toBeDisabled();
    expect(passkeySession.getOpenPasskey()).toBe(session);
    expect(keys.wipe).not.toHaveBeenCalled();
    expect(mockOnSwitch).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Block passkey' })).toBeInTheDocument();
  });

  it.each(['changed', 'unmounted'] as const)(
    'ignores a different revoked passkey after the desk is %s',
    async (change) => {
      const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
      setOpenPasskey(session);
      let finish: (value: { id: number; status: string }) => void = () => undefined;
      mockRevoke.mockImplementationOnce(
        () =>
          new Promise<{ id: number; status: string }>((resolve) => {
            finish = resolve;
          }),
      );
      const view = render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
      fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
      fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
      fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
      const next = { ...session, wallet: { ...session.wallet, credentialId: 'other' } };
      if (change === 'unmounted') view.unmount();
      else act(() => setOpenPasskey(next));
      await act(async () => finish({ id: 8, status: 'Lost' }));
      expect(mockOnSwitch).not.toHaveBeenCalled();
      expect(passkeySession.getOpenPasskey()).toBe(change === 'unmounted' ? session : next);
      expect(
        screen.queryByText(
          'You confirmed with a different passkey. That passkey is now blocked; this wallet is still active.',
        ),
      ).not.toBeInTheDocument();
    },
  );

  it('does not close a newer dialog after late passkey revocation', async () => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    let finish: (value: unknown) => void = () => undefined;
    mockRevoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    view.unmount();
    act(() => setOpenPasskey({ ...session, wallet: { ...session.wallet, id: 8 } }));
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await act(async () => finish({ id: 7, status: 'Lost' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(mockOnSwitch).not.toHaveBeenCalled();
  });

  it('clears the same session after late passkey revocation', async () => {
    const keys = ring(SEED);
    setOpenPasskey(authResult('unlocked', keys) as unknown as OpenPasskey);
    let finish: (value: unknown) => void = () => undefined;
    mockRevoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    view.unmount();
    await act(async () => finish({ id: 7, status: 'Lost' }));
    expect(passkeySession.getOpenPasskey()).toBeUndefined();
    expect(keys.wipe).toHaveBeenCalledTimes(1);
    expect(mockOnSwitch).toHaveBeenCalledTimes(1);
  });

  it('does not wipe a session that disappeared during revocation', async () => {
    const keys = ring(SEED);
    setOpenPasskey(authResult('unlocked', keys) as unknown as OpenPasskey);
    let finish: (value: { id: number }) => void = () => undefined;
    mockRevoke.mockImplementationOnce(
      () =>
        new Promise<{ id: number }>((resolve) => {
          finish = resolve;
        }),
    );
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    act(() => setOpenPasskey(undefined));
    await act(async () => finish({ id: 7 }));
    expect(keys.wipe).not.toHaveBeenCalled();
    expect(mockOnSwitch).not.toHaveBeenCalled();
  });

  it('clears a revoked locked session that has no keys', async () => {
    setOpenPasskey(authResult('locked') as unknown as OpenPasskey);
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    await waitFor(() => expect(passkeySession.getOpenPasskey()).toBeUndefined());
    expect(mockOnSwitch).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('preserves a replacement credential during revocation (unmounted: %s)', async (unmount) => {
    const keys = ring(SEED);
    const session = authResult('unlocked', keys) as unknown as OpenPasskey;
    setOpenPasskey(session);
    let finish: (value: unknown) => void = () => undefined;
    mockRevoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    if (unmount) view.unmount();
    const replacement = { ...session, wallet: { ...session.wallet, credentialId: 'other' } };
    act(() => setOpenPasskey(replacement));
    await act(async () => finish({ id: 7, status: 'Lost' }));
    expect(passkeySession.getOpenPasskey()).toBe(replacement);
    expect(keys.wipe).not.toHaveBeenCalled();
    expect(mockOnSwitch).not.toHaveBeenCalled();
  });

  it('wipes keys from an unlock that completes after the credential changes', async () => {
    const session = authResult('locked') as unknown as OpenPasskey;
    setOpenPasskey(session);
    let finish: (value: unknown) => void = () => undefined;
    mockUnlock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    const replacement = { ...session, wallet: { ...session.wallet, credentialId: 'other' } };
    act(() => setOpenPasskey(replacement));
    const keys = { ...ring(SEED), wipe: jest.fn() };
    await act(async () => finish({ state: 'unlocked', keys }));
    expect(keys.wipe).toHaveBeenCalledTimes(1);
    expect(passkeySession.getOpenPasskey()).toBe(replacement);
    expect(passkeySession.getOpenPasskey()?.state).toBe('locked');
    expect(passkeySession.getOpenPasskey()?.keys).toBeUndefined();
  });

  it.each(['toast', 'settings'] as const)('shows a translated locked-unlock message in %s', async (location) => {
    const message = 'This passkey did not unlock the wallet. Please try again with the passkey of this wallet.';
    mockTranslate.mockImplementation((_namespace, text) => (text === message ? 'Translated unlock message' : text));
    setOpenPasskey(authResult('locked') as unknown as OpenPasskey);
    mockUnlock.mockResolvedValueOnce({ state: 'locked' });
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    if (location === 'settings') {
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
      fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Translated unlock message');
      expect(screen.getByRole('dialog', { name: 'Settings' })).toContainElement(screen.getByRole('alert'));
      expect(mockExport).not.toHaveBeenCalled();
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
      expect(await screen.findByRole('status')).toHaveTextContent('Translated unlock message');
    }
    expect(mockTranslate).toHaveBeenCalledWith('screens/home', message);
  });

  it('does not show a locked-unlock message after the session is replaced', async () => {
    const session = authResult('locked') as unknown as OpenPasskey;
    setOpenPasskey(session);
    let finish: (value: { state: string }) => void = () => undefined;
    mockUnlock.mockImplementationOnce(
      () =>
        new Promise<{ state: string }>((resolve) => {
          finish = resolve;
        }),
    );
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    const replacement = { ...session, wallet: { ...session.wallet, credentialId: 'other' } };
    act(() => setOpenPasskey(replacement));
    await act(async () => finish({ state: 'locked' }));
    expect(passkeySession.getOpenPasskey()).toBe(replacement);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not show a locked-unlock message after the desk unmounts during key cleanup', async () => {
    setOpenPasskey(authResult('locked') as unknown as OpenPasskey);
    let finish: (value: unknown) => void = () => undefined;
    mockUnlock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    const keys = { ...ring(SEED), wipe: jest.fn(() => view.unmount()) };
    await act(async () => finish({ state: 'locked', keys }));
    expect(keys.wipe).toHaveBeenCalledTimes(1);
    expect(mockTranslate).not.toHaveBeenCalledWith(
      'screens/home',
      'This passkey did not unlock the wallet. Please try again with the passkey of this wallet.',
    );
  });

  it('does not open send when an unlock finishes after another unlocked session replaces it', async () => {
    const session = authResult('locked') as unknown as OpenPasskey;
    setOpenPasskey(session);
    let finish: (value: unknown) => void = () => undefined;
    mockUnlock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const replacement = {
      ...session,
      state: 'unlocked' as const,
      keys: ring(SEED) as unknown as OpenPasskey['keys'],
      wallet: { ...session.wallet, credentialId: 'other' },
    };
    act(() => setOpenPasskey(replacement));
    const keys = ring(SEED);
    await act(async () => finish({ state: 'unlocked', keys }));
    expect(keys.wipe).toHaveBeenCalledTimes(1);
    expect(passkeySession.getOpenPasskey()).toBe(replacement);
    expect(screen.queryByRole('dialog', { name: 'Send' })).not.toBeInTheDocument();
  });

  it.each([
    { label: 'seed mismatch', state: 'unlocked', address: OTHER },
    { label: 'non-unlocked state', state: 'seed-mismatch', address: SEED },
  ])('wipes keys discarded on $label during unlock', async ({ state, address }) => {
    const session = authResult('locked') as unknown as OpenPasskey;
    const keys = ring(address);
    setOpenPasskey(session);
    mockUnlock.mockResolvedValueOnce({ state, keys });
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(passkeySession.getOpenPasskey()?.state).toBe('seed-mismatch'));
    expect(keys.wipe).toHaveBeenCalledTimes(1);
    expect(passkeySession.getOpenPasskey()?.keys).toBeUndefined();
  });

  it('shows each verified address and marks mismatches red', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    mockVerify.mockReturnValue([
      { family: 'Bitcoin', address: 'bc1q12345678901234567890', matches: true },
      { family: 'Evm', address: SEED, matches: false },
    ]);
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Check addresses/ }));
    expect(await screen.findByText('1 / 2 addresses match')).toHaveClass('text-dfxRed-150');
    const bitcoin = screen.getByText(/Bitcoin.*Matches/);
    expect(bitcoin).toHaveClass('text-dfxGreen-300');
    expect(bitcoin).toHaveTextContent('bc1q123456…34567890');
    const evm = screen.getByText(/Ethereum & EVM.*Differs/);
    expect(evm).toHaveClass('text-dfxRed-150');
    expect(evm).toHaveTextContent(`${SEED.slice(0, 10)}…${SEED.slice(-8)}`);
  });

  it('unlocks before exporting recovery words from settings', async () => {
    setOpenPasskey(authResult('locked') as unknown as OpenPasskey);
    mockUnlock
      .mockResolvedValueOnce({ state: 'locked' })
      .mockResolvedValueOnce({ state: 'unlocked', keys: ring(SEED) });
    mockExport.mockResolvedValue(['alpha', 'bravo']);
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    await waitFor(() => expect(mockUnlock).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('passkey-recovery-words')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Recovery words/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    expect(await screen.findByTestId('passkey-recovery-words')).toHaveTextContent('alpha');
    expect(mockUnlock).toHaveBeenCalledTimes(2);
  });

  it('shows the wrong-passkey explanation in the settings dialog when recovery unlock fails', async () => {
    setOpenPasskey(authResult('locked') as unknown as OpenPasskey);
    mockUnlock.mockResolvedValueOnce({ state: 'unlocked', keys: ring(OTHER) });
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This passkey belongs to a different wallet. Sign in with the right passkey.');
    expect(screen.getByRole('dialog', { name: 'Settings' })).toContainElement(alert);
    expect(mockExport).not.toHaveBeenCalled();
  });

  it.each([
    ['compromised', 'This passkey was blocked as compromised and no longer opens the wallet.'],
    ['open-elsewhere', 'The wallet is already open in another tab. Close it and reload this page.'],
  ] as const)('shows the %s explanation in settings when recovery unlock fails', async (state, message) => {
    setOpenPasskey(authResult('locked') as unknown as OpenPasskey);
    mockUnlock.mockResolvedValueOnce({ state });
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(screen.getByRole('dialog', { name: 'Settings' })).toContainElement(alert);
    expect(mockExport).not.toHaveBeenCalled();
  });

  it('keeps the unlock error in settings when recovery authentication is cancelled', async () => {
    setOpenPasskey(authResult('locked') as unknown as OpenPasskey);
    mockUnlock.mockRejectedValueOnce(new Error('Authentication cancelled'));
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Authentication cancelled');
    expect(mockExport).not.toHaveBeenCalled();
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
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record a diagnostic' }));
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
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
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
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    expect(screen.getByRole('dialog', { name: 'Recovery words' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Recovery words' })).toBeInTheDocument();
    act(() => setOpenPasskey({ ...session, state: 'locked', keys: undefined }));
    expect(screen.queryByRole('dialog', { name: 'Recovery words' })).not.toBeInTheDocument();
    await act(async () => resolveFirst(['old-secret']));
    expect(screen.queryByText('old-secret')).not.toBeInTheDocument();
    act(() => setOpenPasskey(session));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Settings' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
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
      render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
      fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
      act(() => setOpenPasskey({ ...session, state: 'locked', keys: undefined }));
      await act(async () => resolveExport(['late-secret']));
      expect(forbiddenWrite).not.toHaveBeenCalled();
      act(() => setOpenPasskey(session));
      mockExport.mockResolvedValueOnce(['valid-secret']);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Settings' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
      fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
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
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    expect(screen.getByRole('dialog', { name: 'Recovery words' })).toBeInTheDocument();
    act(() => setOpenPasskey({ ...session, wallet: { ...session.wallet, backupSeenDate: '2026-11-06' } }));
    expect(screen.getByRole('dialog', { name: 'Recovery words' })).toBeInTheDocument();
    act(() => setOpenPasskey({ ...session, state: 'locked', keys: undefined }));
    expect(screen.queryByRole('dialog', { name: 'Recovery words' })).not.toBeInTheDocument();
    await act(async () => resolveExport(['lost-secret']));
    expect(screen.queryByText('lost-secret')).not.toBeInTheDocument();
    act(() => setOpenPasskey(session));
    mockExport.mockResolvedValueOnce(['fresh-secret']);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Settings' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
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
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    act(() => setOpenPasskey({ ...session, keys: ring(OTHER) as unknown as OpenPasskey['keys'] }));
    expect(screen.queryByRole('dialog', { name: 'Recovery words' })).not.toBeInTheDocument();
    await act(async () => resolveExport(['old-key-secret']));
    expect(screen.queryByText('old-key-secret')).not.toBeInTheDocument();
  });

  it('clears already displayed recovery words as soon as the wallet locks', async () => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    mockExport.mockResolvedValueOnce(['private-words']);
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
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
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    await waitFor(() => expect(mockExport).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: 'Recovery words' })).not.toBeInTheDocument();
    expect(screen.queryByText('unavailable-secret')).not.toBeInTheDocument();
  });

  it('ignores a second recovery export while the export is starting', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const words = screen.getByRole('button', { name: /Recovery words/ });
    mockExport.mockImplementationOnce(() => {
      fireEvent.click(words);
      return Promise.resolve(['alpha']);
    });
    fireEvent.click(words);
    expect(await screen.findByTestId('passkey-recovery-words')).toHaveTextContent('alpha');
    expect(mockExport).toHaveBeenCalledTimes(1);
  });

  it('does not export if the session locks before the recovery click is processed', async () => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const words = screen.getByRole('button', { name: /Recovery words/ });
    act(() => {
      setOpenPasskey({ ...session, state: 'locked', keys: undefined });
      fireEvent.click(words);
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
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    expect(await screen.findByText('export did not start')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Recovery words' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('passkey-recovery-words')).not.toBeInTheDocument();
  });

  it('disables recovery words and block while another wallet request is running', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    let resolveDiagnostic: () => void = () => undefined;
    mockDiagnostics.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDiagnostic = resolve;
        }),
    );
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record a diagnostic' }));
    expect(screen.getByRole('button', { name: /Recovery words/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Block passkey' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    await act(async () => resolveDiagnostic());
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    let resolveRevoke: (value: { id: number; status: string }) => void = () => undefined;
    mockRevoke.mockImplementationOnce(
      () =>
        new Promise<{ id: number; status: string }>((resolve) => {
          resolveRevoke = resolve;
        }),
    );
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    expect(screen.queryByRole('dialog', { name: 'Recovery words' })).not.toBeInTheDocument();
    expect(mockExport).not.toHaveBeenCalled();
    await act(async () => resolveRevoke({ id: 7, status: 'Lost' }));
  });

  it('renders translated wallet count and credential status in their settings rows', async () => {
    const translations: Record<string, string> = {
      'Wallets on this account: {{count}}.': 'Konten: {{count}}.',
      '{{credentialId}}: {{status}}': '{{credentialId}}: {{status}}',
      Active: 'Aktiv',
      Lost: 'Verloren',
      Compromised: 'Kompromittiert',
      Unknown: 'Unbekannt',
    };
    mockTranslate.mockImplementation((_namespace, text, values) => interpolate(translations[text] ?? text, values));
    const keys = ring(SEED);
    const wallet = authResult('unlocked', keys).wallet;
    setOpenPasskey(authResult('unlocked', keys) as unknown as OpenPasskey);
    mockWallets.mockResolvedValue([wallet]);
    mockCredentialStatus.mockResolvedValue([
      { credentialId: 'cred', status: 'Active' },
      { credentialId: 'lost', status: 'Lost' },
      { credentialId: 'bad', status: 'Compromised' },
      { credentialId: 'unknown', status: 'Unknown' },
    ]);
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reload data' }));
    expect(await screen.findByText('Konten: 1.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload data' })).toHaveTextContent('Konten: 1.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check passkey status' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Check passkey status' }));
    expect(
      await screen.findByText('cred: Aktiv, lost: Verloren, bad: Kompromittiert, unknown: Unbekannt'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check passkey status' })).toHaveTextContent('cred: Aktiv');
  });

  it('ignores a reconnect when the session or usable keys disappeared', async () => {
    const session = authResult('unlocked', ring(SEED), false) as unknown as OpenPasskey;
    mockLink.mockRejectedValueOnce(new Error('link unavailable'));
    setOpenPasskey(session);
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
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
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);

    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    fireEvent.click(screen.getByRole('button', { name: 'EVM' }));
    expect(keys.evm).toHaveBeenCalledWith(0);
    expect(screen.getByTestId('passkey-receive-address').textContent).toBe(SEED);
    expect(screen.getByTestId('qr-code').textContent).toBe(SEED);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('passkey-receive-address')).not.toBeInTheDocument();
  });

  it('unlocks before showing an address when receive is selected while locked', async () => {
    setOpenPasskey(authResult('locked') as unknown as OpenPasskey);
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    mockUnlock.mockResolvedValue({ state: 'locked' });
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    await waitFor(() => expect(mockUnlock).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('passkey-receive-address')).not.toBeInTheDocument();
  });

  it('hides the receive address when the session locks', () => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    fireEvent.click(screen.getByRole('button', { name: 'EVM' }));
    expect(screen.getByTestId('passkey-receive-address')).toBeInTheDocument();
    act(() => setOpenPasskey({ ...session, state: 'locked', keys: undefined }));
    expect(screen.queryByTestId('passkey-receive-address')).not.toBeInTheDocument();
  });

  it.each(['locked', 'compromised', 'open-elsewhere', 'seed-mismatch'] as const)(
    'hides the receive address when the session leaves the unlocked state but still holds keys',
    (state) => {
      const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
      setOpenPasskey(session);
      render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
      fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
      fireEvent.click(screen.getByRole('button', { name: 'EVM' }));
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
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Receive' }))).not.toThrow();
    fireEvent.click(screen.getByRole('button', { name: 'EVM' }));
    expect(screen.getByRole('alert')).toHaveTextContent('wiped');
    expect(screen.queryByTestId('passkey-receive-address')).not.toBeInTheDocument();
  });

  it('shows an empty derived address without inventing a value', () => {
    setOpenPasskey(authResult('unlocked', ring('')) as unknown as OpenPasskey);
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    fireEvent.click(screen.getByRole('button', { name: 'EVM' }));
    expect(screen.getByTestId('passkey-receive-address')).toBeEmptyDOMElement();
  });

  it.each(['Use another passkey', 'Block passkey as lost'])('resets receive after %s', async (action) => {
    const keys = ring(SEED);
    const session = authResult('unlocked', keys) as unknown as OpenPasskey;
    setOpenPasskey(session);
    mockRevoke.mockResolvedValue({ id: 7, status: 'Lost' });
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    fireEvent.click(screen.getByRole('button', { name: 'EVM' }));
    expect(screen.getByTestId('passkey-receive-address')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    if (action === 'Use another passkey') {
      fireEvent.click(screen.getByRole('button', { name: 'Use another passkey' }));
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
      fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
      fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    }
    await waitFor(() => expect(passkeySession.getOpenPasskey()).toBeUndefined());
    expect(keys.wipe).toHaveBeenCalledTimes(1);
    act(() => setOpenPasskey(session));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Receive' })).toBeInTheDocument());
    expect(screen.queryByTestId('passkey-receive-address')).not.toBeInTheDocument();
  });

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

  it('registers a passkey and opens the desk', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const keys = ring(SEED);
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
    expect(mockOnCancel).not.toHaveBeenCalled();
    expect(mockOnSwitch).not.toHaveBeenCalled();
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

  it('navigates home without discarding the open passkey session', () => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    renderPasskey();
    fireEvent.click(screen.getByRole('link', { name: 'DFX home' }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
    expect(passkeySession.getOpenPasskey()).toBe(session);
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

  it('unlocks a locked wallet from the desk', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValue(authResult('locked'));
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Wallet locked')).toBeInTheDocument();
    expect(
      screen.getByText('To use the wallet, unlock briefly with Face ID, fingerprint or device PIN.'),
    ).toBeInTheDocument();
    expect(mockLink).not.toHaveBeenCalled();
    expect(mockExport).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
    const keys = ring(SEED);
    mockUnlock.mockResolvedValue({ state: 'unlocked', keys });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(mockUnlock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(passkeySession.getOpenPasskey()?.state).toBe('unlocked'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Buy' })).toBeEnabled());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('links Bitcoin once after an unlock without a Bitcoin address finishes', async () => {
    const keys = ring(SEED);
    setOpenPasskey(authResult('locked', undefined, false) as unknown as OpenPasskey);
    let finishUnlock: (value: unknown) => void = () => undefined;
    mockUnlock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishUnlock = resolve;
        }),
    );
    mockLink.mockRejectedValueOnce(new Error('link failed'));
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(mockUnlock).toHaveBeenCalledTimes(1);
    expect(mockLink).not.toHaveBeenCalled();
    await act(async () => finishUnlock({ state: 'unlocked', keys }));
    await waitFor(() => expect(mockLink).toHaveBeenCalledWith('bitcoin', 'token', keys, 0));
    expect(await screen.findByRole('status')).toHaveTextContent('link failed');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Settings' })).toBeEnabled());
    await act(async () => undefined);
    expect(mockLink).toHaveBeenCalledTimes(1);
  });

  it('waits for another action before trying the automatic Bitcoin link once', async () => {
    const keys = ring(SEED);
    const session = authResult('unlocked', keys) as unknown as OpenPasskey;
    setOpenPasskey(session);
    let finishDiagnostics: () => void = () => undefined;
    mockDiagnostics.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishDiagnostics = resolve;
        }),
    );
    mockLink.mockRejectedValueOnce(new Error('link failed'));
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record a diagnostic' }));
    expect(mockDiagnostics).toHaveBeenCalledTimes(1);
    act(() => setOpenPasskey({ ...session, wallet: { ...session.wallet, addresses: [] } }));
    expect(mockLink).not.toHaveBeenCalled();
    await act(async () => finishDiagnostics());
    await waitFor(() => expect(mockLink).toHaveBeenCalledWith('bitcoin', 'token', keys, 0));
    expect(await screen.findByRole('alert')).toHaveTextContent('link failed');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Record a diagnostic' })).toBeEnabled());
    await act(async () => undefined);
    expect(mockLink).toHaveBeenCalledTimes(1);
  });

  it('reports the Bitcoin link and translated refresh error in a toast', async () => {
    const keys = ring(SEED);
    mockTranslate.mockImplementation((namespace, text, values) =>
      namespace === 'screens/home' && text === 'wallet refresh failed'
        ? 'translated refresh error'
        : interpolate(text, values),
    );
    mockLink.mockResolvedValue({ address: { family: 'Bitcoin', address: 'bc1qlogin' } });
    mockWallets.mockRejectedValue(new Error('wallet refresh failed'));
    setOpenPasskey(authResult('unlocked', keys, false) as unknown as OpenPasskey);
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    expect(await screen.findByRole('status')).toHaveTextContent('Linked Bitcoin bc1qlogin. translated refresh error');
    expect(mockTranslate).toHaveBeenCalledWith('screens/home', 'wallet refresh failed');
    expect(mockLink).toHaveBeenCalledWith('bitcoin', 'token', keys, 0);
    expect(mockWallets).toHaveBeenCalledWith('token');
  });

  it('reports a Bitcoin link and refresh error inside an open settings dialog', async () => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    mockTranslate.mockImplementation((namespace, text, values) =>
      namespace === 'screens/home' && text === 'wallet refresh failed'
        ? 'translated refresh error'
        : interpolate(text, values),
    );
    mockLink.mockResolvedValueOnce({ address: { family: 'Bitcoin', address: 'bc1qlogin' } });
    mockWallets.mockRejectedValueOnce(new Error('wallet refresh failed'));
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    act(() => setOpenPasskey({ ...session, wallet: { ...session.wallet, addresses: [] } }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Linked Bitcoin bc1qlogin. translated refresh error');
    expect(mockTranslate).toHaveBeenCalledWith('screens/home', 'wallet refresh failed');
    expect(screen.getByRole('dialog', { name: 'Settings' })).toContainElement(screen.getByRole('alert'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not show a wallet count after automatic Bitcoin linking while Receive is open', async () => {
    const keys = ring(SEED);
    const session = authResult('unlocked', keys) as unknown as OpenPasskey;
    setOpenPasskey(session);
    mockLink.mockResolvedValueOnce({ address: { family: 'Bitcoin', address: 'bc1qlogin' } });
    mockWallets.mockResolvedValueOnce([session.wallet]);
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    fireEvent.click(screen.getByRole('button', { name: 'EVM', exact: true }));
    expect(screen.getByTestId('passkey-receive-address')).toHaveTextContent(SEED);
    act(() => setOpenPasskey({ ...session, wallet: { ...session.wallet, addresses: [] } }));
    await waitFor(() => expect(mockWallets).toHaveBeenCalledWith('token'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Settings' })).toBeEnabled());
    await act(async () => undefined);
    expect(screen.getByRole('dialog', { name: 'Receive' })).toBeInTheDocument();
    expect(screen.queryByText('Wallets on this account: 1.')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps a Bitcoin link error in Receive after a successful address derivation', async () => {
    const keys = ring(SEED);
    const session = authResult('unlocked', keys) as unknown as OpenPasskey;
    setOpenPasskey(session);
    mockLink.mockRejectedValueOnce(new Error('link failed'));
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
    act(() => setOpenPasskey({ ...session, wallet: { ...session.wallet, addresses: [] } }));
    expect(await screen.findByRole('alert')).toHaveTextContent('link failed');
    fireEvent.click(screen.getByRole('button', { name: 'EVM', exact: true }));
    expect(screen.getByTestId('passkey-receive-address')).toHaveTextContent(SEED);
    expect(screen.getByRole('alert')).toHaveTextContent('link failed');
  });

  it('shows an automatic Bitcoin link failure as a toast while the send dialog is open', async () => {
    const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
    setOpenPasskey(session);
    mockLink.mockRejectedValueOnce(new Error('link failed'));
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByRole('dialog', { name: 'Send' })).toBeInTheDocument();
    act(() => setOpenPasskey({ ...session, wallet: { ...session.wallet, addresses: [] } }));
    expect(await screen.findByRole('status')).toHaveTextContent('link failed');
    expect(screen.getByRole('dialog', { name: 'Send' })).toBeInTheDocument();
  });

  it('shows the automatic Bitcoin link without a toast and reports a manual reconnect', async () => {
    const keys = ring(SEED);
    mockLink.mockResolvedValue({ address: { family: 'Bitcoin', address: 'bc1qlogin' } });
    mockWallets.mockResolvedValue([authResult('unlocked', keys).wallet]);
    setOpenPasskey(authResult('unlocked', keys, false) as unknown as OpenPasskey);
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Show wallet' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
    expect(await screen.findByTitle('bc1qlogin')).toBeInTheDocument();
    await waitFor(() => expect(mockWallets).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Settings' })).toBeEnabled());
    await act(async () => undefined);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    const current = passkeySession.getOpenPasskey();
    if (!current) throw new Error('Missing passkey session');
    act(() => setOpenPasskey({ ...current, wallet: { ...current.wallet, addresses: [] } }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Connect again' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Connect again' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Linked Bitcoin bc1qlogin.');
    expect(mockLink).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not report a link success after the desk unmounts during refresh', async () => {
    const session = authResult('unlocked', ring(SEED), false) as unknown as OpenPasskey;
    setOpenPasskey(session);
    mockLink
      .mockRejectedValueOnce(new Error('automatic link failed'))
      .mockResolvedValueOnce({ address: { family: 'Bitcoin', address: 'bc1qlogin' } });
    let finish: (wallets: unknown[]) => void = () => undefined;
    mockWallets.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(await screen.findByRole('status'));
    fireEvent.click(screen.getByRole('button', { name: 'Show wallet' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Connect again' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Connect again' }));
    await waitFor(() => expect(mockWallets).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => finish([session.wallet]));
    expect(mockTranslate).not.toHaveBeenCalledWith('screens/home', 'Linked Bitcoin bc1qlogin.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('opens recovery words from settings and clears them after closing', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    mockExport.mockResolvedValue(['alpha', 'bravo']);
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: /Recovery words/ }));
    expect(await screen.findByTestId('passkey-recovery-words')).toHaveTextContent('alpha');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('passkey-recovery-words')).not.toBeInTheDocument();
  });

  it('clears a wrong passkey session from settings', () => {
    setOpenPasskey(authResult('seed-mismatch') as unknown as OpenPasskey);
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use another passkey' }));
    expect(passkeySession.getOpenPasskey()).toBeUndefined();
  });

  it('handles a missing session when choosing another passkey', () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const missing = jest.spyOn(passkeySession, 'getOpenPasskey').mockReturnValueOnce(undefined);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Use another passkey' }));
    } finally {
      missing.mockRestore();
    }
    expect(passkeySession.getOpenPasskey()).toBeUndefined();
  });

  it('copies the local receive address from its dialog', async () => {
    setOpenPasskey(authResult('unlocked', ring(SEED)) as unknown as OpenPasskey);
    const writeText = jest.fn().mockResolvedValue(undefined);
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
      fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
      fireEvent.click(screen.getByRole('button', { name: 'EVM' }));
      fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
      expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
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
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
    expect(mockLink).not.toHaveBeenCalled();
  });

  it('does not offer claim on the account choice card', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    renderPasskey();
    await goToChoice();
    expect(screen.queryByRole('button', { name: 'Add passkey to this account' })).not.toBeInTheDocument();
    expect(mockLogout).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByRole('button', { name: 'Record a diagnostic' }));
    await waitFor(() => expect(mockDiagnostics).toHaveBeenCalledWith({ stage: 'Authentication', outcome: 'Success' }));
    expect(await screen.findByText('Diagnostic recorded.')).toBeInTheDocument();
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

  it('lists wallets and reads credential status', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const keys = ring(SEED);
    const wallet = authResult('unlocked', keys).wallet;
    mockLogin.mockResolvedValue(authResult('unlocked', keys));
    mockWallets.mockResolvedValue([wallet]);
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
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check passkey status' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Check passkey status' }));
    await waitFor(() => expect(mockCredentialStatus).toHaveBeenCalledWith(['cred']));
    expect(await screen.findByText('cred: Active')).toBeInTheDocument();
  });

  it('returns to the form after the passkey revokes the wallet', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValue(authResult('seed-mismatch', ring(SEED)));
    mockRevoke.mockResolvedValue({ id: 7, status: 'Lost' });
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Wallet locked')).toBeInTheDocument();
    expect(passkeySession.getOpenPasskey()?.state).toBe('seed-mismatch');
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
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

  it('refuses a second passkey on unlock', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValue(authResult('locked'));
    mockUnlock.mockResolvedValueOnce({ state: 'unlocked', keys: ring(OTHER) });
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(passkeySession.getOpenPasskey()?.state).toBe('seed-mismatch'));
    expect(passkeySession.getOpenPasskey()?.keys).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Buy' })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Settings' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const recovery = screen.getByRole('button', { name: /Recovery words/ });
    expect(recovery).toBeDisabled();
    fireEvent.click(recovery);
    expect(mockExport).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Receive' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Block passkey' })).not.toBeInTheDocument();
  });

  it('shows other wallet states, compares addresses and leaves the desk', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValueOnce(authResult('compromised', ring(SEED)));
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Wallet locked')).toBeInTheDocument();
    expect(passkeySession.getOpenPasskey()?.state).toBe('compromised');
    act(() => setOpenPasskey(undefined));
    mockLogin.mockResolvedValueOnce(authResult('open-elsewhere', ring(SEED)));
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Wallet locked')).toBeInTheDocument();
    expect(passkeySession.getOpenPasskey()?.state).toBe('open-elsewhere');
    act(() => {
      const current = requireWallet();
      setOpenPasskey({ ...current.session, state: 'unlocked', keys: ring(SEED) as unknown as OpenPasskey['keys'] });
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
  });

  it('ignores a platform report that arrives after the tile unmounts', async () => {
    const react = jest.requireActual<typeof import('react')>('react');
    const originalUseState = react.useState;
    const lateReport = { available: false, reason: 'no-webauthn', prf: 'unknown' };
    const staleWrite = jest.fn();
    const spy = jest.spyOn(react, 'useState').mockImplementation(((initial: unknown) => {
      const [value, setValue] = originalUseState<unknown>(initial);
      return [
        value,
        (next: unknown) => {
          if (next === lateReport) staleWrite(next);
          setValue(next);
        },
      ];
    }) as typeof react.useState);
    let settle: (report: { available: boolean; reason: string; prf: string }) => void = () => undefined;
    mockCheckPasskeyPlatform.mockImplementation(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );

    try {
      const { unmount } = renderPasskey();
      unmount();
      await act(async () => settle(lateReport));
      expect(staleWrite).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
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

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
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
        wipe: jest.fn(),
        evm: () => {
          throw new Error('missing');
        },
      },
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(passkeySession.getOpenPasskey()?.state).toBe('seed-mismatch'));
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
    await waitFor(() => expect(passkeySession.getOpenPasskey()?.state).toBe('seed-mismatch'));
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
    mockRevoke.mockResolvedValueOnce({ id: 7, status: 'Lost' });
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
    render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record a diagnostic' }));
    expect(screen.getByRole('button', { name: 'Use another passkey' })).toBeDisabled();
    expect(passkeySession.getOpenPasskey()).toBeDefined();
    await act(async () => release());
    expect(await screen.findByText('Diagnostic recorded.')).toBeInTheDocument();
    const missing = jest.spyOn(passkeySession, 'getOpenPasskey').mockReturnValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Record a diagnostic' }));
    missing.mockRestore();
    expect(mockDiagnostics).toHaveBeenCalledTimes(1);
  });

  it('renders no desk without a session and ignores routes after the session is gone', async () => {
    const empty = render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
    empty.unmount();
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    mockLogin.mockResolvedValueOnce(authResult('unlocked', ring(SEED)));
    const view = renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block passkey' }));
    fireEvent.click(screen.getByLabelText('I understand that this cannot be undone.'));
    const originalSession = requireWallet().session;
    const gone = jest.spyOn(passkeySession, 'getOpenPasskey').mockReturnValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Block', exact: true }));
    gone.mockRestore();
    expect(mockRevoke).not.toHaveBeenCalled();
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
    expect(screen.queryByRole('button', { name: 'Add passkey to this account' })).not.toBeInTheDocument();
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

  it.each([true, false])('discards a login result after unmount (keys: %s)', async (withKeys) => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const keys = withKeys ? ring(SEED) : undefined;
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
      resolve(authResult('unlocked', keys));
      await Promise.resolve();
    });
    expect(mockLogout).not.toHaveBeenCalled();
    expect(passkeySession.getOpenPasskey()).toBeUndefined();
    if (keys) expect(keys.wipe).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])('discards a login result when unmounted during logout (keys: %s)', async (withKeys) => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const keys = withKeys ? ring(SEED) : undefined;
    mockLogin.mockResolvedValueOnce(authResult('unlocked', keys));
    let finish: () => void = () => undefined;
    mockLogout.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { unmount } = renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => finish());
    expect(passkeySession.getOpenPasskey()).toBeUndefined();
    if (keys) expect(keys.wipe).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])('discards a login result when logout fails (keys: %s)', async (withKeys) => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const keys = withKeys ? ring(SEED) : undefined;
    mockLogin.mockResolvedValueOnce(authResult('unlocked', keys));
    mockLogout.mockRejectedValueOnce(new Error('logout failed'));
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText(GENERIC)).toBeInTheDocument();
    expect(passkeySession.getOpenPasskey()).toBeUndefined();
    if (keys) expect(keys.wipe).toHaveBeenCalledTimes(1);
  });

  it('keeps the keys of a stored login result', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const keys = ring(SEED);
    const result = authResult('unlocked', keys);
    mockLogin.mockResolvedValueOnce(result);
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(passkeySession.getOpenPasskey()).toBe(result));
    expect(keys.wipe).not.toHaveBeenCalled();
  });

  it('wipes login keys before storing a seed-mismatch session', async () => {
    mockCheckPasskeyPlatform.mockResolvedValue({ available: true, prf: 'yes' });
    const keys = ring(SEED);
    mockLogin.mockResolvedValueOnce(authResult('seed-mismatch', keys));
    renderPasskey();
    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Wallet locked')).toBeInTheDocument();
    expect(keys.wipe).toHaveBeenCalledTimes(1);
    expect(passkeySession.getOpenPasskey()?.state).toBe('seed-mismatch');
    expect(passkeySession.getOpenPasskey()?.keys).toBeUndefined();
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
    it('clears receive and send state when their dialogs close', () => {
      const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
      try {
        openDesk({ evm: () => ({ path: 'm/0', address: '0xabc' }) });
        fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
        fireEvent.click(screen.getByRole('button', { name: 'EVM' }));
        expect(screen.getByTestId('passkey-receive-address')).toHaveTextContent('0xabc');
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
        expect(screen.getByRole('button', { name: 'EVM' })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.queryByTestId('passkey-receive-address')).not.toBeInTheDocument();
        fireEvent.keyDown(document, { key: 'Escape' });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'bc1qdest' } });
        fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
        expect(screen.getByText('Paste is not available in this browser.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        expect(screen.getByLabelText('Destination')).toHaveValue('');
        expect(screen.queryByText('Paste is not available in this browser.')).not.toBeInTheDocument();
      } finally {
        if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard);
        else delete (navigator as { clipboard?: Clipboard }).clipboard;
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
      return render(<PasskeyDesk onCancel={mockOnCancel} onRevoked={mockOnSwitch} />);
    }

    function openDesk(keys?: unknown, state = 'unlocked') {
      act(() => {
        setOpenPasskey(authResult(state, keys) as OpenPasskey);
      });
      return renderDesk();
    }

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
      const detect = jest
        .fn()
        .mockImplementationOnce(() => firstDetect)
        .mockResolvedValueOnce([]);

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
    it('does not derive a selected receive family while locked or when it becomes locked', () => {
      const readReceive = jest.fn(() => 'local-address');
      const onReceiveError = jest.fn();
      const panel = (unlocked: boolean) => (
        <PasskeySheet title="Receive" onClose={() => undefined}>
          <PasskeyReceivePanel unlocked={unlocked} readReceive={readReceive} onReceiveError={onReceiveError} />
        </PasskeySheet>
      );
      const view = render(panel(false));
      fireEvent.click(screen.getByRole('button', { name: 'EVM' }));
      expect(screen.getByText('Unlock the wallet to show this address.')).toBeInTheDocument();
      expect(readReceive).not.toHaveBeenCalled();
      expect(onReceiveError).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByTestId('passkey-receive-qr')).not.toBeInTheDocument();
      view.rerender(panel(true));
      expect(screen.getByTestId('passkey-receive-address')).toHaveTextContent('local-address');
      expect(screen.getByTestId('passkey-receive-qr')).toBeInTheDocument();
      expect(readReceive).toHaveBeenCalledTimes(1);
      expect(onReceiveError).toHaveBeenCalledTimes(1);
      expect(onReceiveError).toHaveBeenCalledWith(undefined);
      view.rerender(panel(false));
      expect(screen.getByText('Unlock the wallet to show this address.')).toBeInTheDocument();
      expect(screen.queryByTestId('passkey-receive-address')).not.toBeInTheDocument();
      expect(screen.queryByTestId('passkey-receive-qr')).not.toBeInTheDocument();
      expect(readReceive).toHaveBeenCalledTimes(1);
      expect(onReceiveError).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it.each(['Receive', 'Send'] as const)('unlocks before opening the %s dialog', async (action) => {
      openDesk(undefined, 'locked');
      mockUnlock.mockResolvedValueOnce({ state: 'unlocked', keys: ring(SEED) });
      fireEvent.click(screen.getByRole('button', { name: action }));
      expect(await screen.findByRole('dialog', { name: action })).toBeInTheDocument();
      expect(mockUnlock).toHaveBeenCalledTimes(1);
    });

    it('shows a receive derivation failure inside the dialog', () => {
      openDesk({
        evm: () => {
          throw new Error('derivation failed');
        },
        sparkIdentity: () => ({ address: 'spark1local' }),
      });
      fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
      fireEvent.click(screen.getByRole('button', { name: 'EVM' }));
      expect(screen.getByRole('dialog', { name: 'Receive' })).toContainElement(screen.getByRole('alert'));
      expect(screen.getByRole('alert')).toHaveTextContent('derivation failed');
      expect(screen.queryByTestId('passkey-receive-address')).not.toBeInTheDocument();
      expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Spark', exact: true }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByTestId('passkey-receive-address')).toHaveTextContent('spark1local');
      expect(screen.getByTestId('qr-code')).toHaveTextContent('spark1local');
    });

    it.each(['missing', 'locked'] as const)(
      'shows a locked receive error when the session is %s at derivation',
      (state) => {
        const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
        setOpenPasskey(session);
        renderDesk();
        fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
        const stale = jest.spyOn(passkeySession, 'getOpenPasskey');
        try {
          stale.mockReturnValueOnce(state === 'missing' ? undefined : { ...session, state: 'locked', keys: undefined });
          fireEvent.click(screen.getByRole('button', { name: 'EVM' }));
          const alert = screen.getByRole('alert');
          expect(alert).toHaveTextContent('locked');
          expect(screen.getByRole('dialog', { name: 'Receive' })).toContainElement(alert);
          expect(screen.queryByTestId('passkey-receive-address')).not.toBeInTheDocument();
          expect(screen.queryByTestId('passkey-receive-qr')).not.toBeInTheDocument();
        } finally {
          stale.mockRestore();
        }
      },
    );

    it('shows receive and send on an unlocked desk with the existing actions', () => {
      openDesk({ id: 'keys' });

      expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Buy' })).toBeInTheDocument();
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
      expect(evm).toHaveBeenCalledWith(0);
      expect(evm).not.toHaveBeenCalledWith(1);
    });

    it('keeps the address without deriving again when the selected family is clicked twice', () => {
      const evm = jest.fn(() => ({ address: 'addr-0' }));
      openDesk({ evm });
      fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
      fireEvent.click(screen.getByRole('button', { name: 'EVM' }));
      expect(screen.getByTestId('passkey-receive-address')).toHaveTextContent('addr-0');
      fireEvent.click(screen.getByRole('button', { name: 'EVM' }));
      expect(screen.getByTestId('passkey-receive-address')).toHaveTextContent('addr-0');
      expect(evm).toHaveBeenCalledTimes(1);
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
      const session = authResult('unlocked', ring(SEED)) as unknown as OpenPasskey;
      setOpenPasskey(session);
      renderDesk();
      fireEvent.click(screen.getByRole('button', { name: 'Receive' }));
      fireEvent.click(screen.getByRole('button', { name: /^EVM$/ }));
      act(() => setOpenPasskey({ ...session, state: 'locked', keys: undefined }));

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

    it('ignores a late QR detection after the send dialog closes', async () => {
      const react = jest.requireActual<typeof import('react')>('react');
      const originalUseState = react.useState;
      const destinationWrite = jest.fn();
      const spy = jest.spyOn(react, 'useState').mockImplementation(((initial: unknown) => {
        const [value, setValue] = originalUseState<unknown>(initial);
        return [
          value,
          (next: unknown) => {
            if (next === 'bc1qlate') destinationWrite(next);
            setValue(next);
          },
        ];
      }) as typeof react.useState);
      const stop = jest.fn();
      let finish: (codes: { rawValue: string }[]) => void = () => undefined;
      const detect = jest.fn(
        () =>
          new Promise<{ rawValue: string }[]>((resolve) => {
            finish = resolve;
          }),
      );
      const schedule = jest.fn(() => 42);
      const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
      const previousRaf = window.requestAnimationFrame;
      const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
      const previousDetector = globalWithDetector.BarcodeDetector;
      globalWithDetector.BarcodeDetector = class {
        detect = detect;
      };
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop }] }) },
      });
      window.requestAnimationFrame = schedule;
      try {
        openDesk({ id: 'keys' });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
        await waitFor(() => expect(detect).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(stop).toHaveBeenCalledTimes(1);
        await act(async () => finish([{ rawValue: 'bc1qlate' }]));
        expect(destinationWrite).not.toHaveBeenCalled();
        expect(schedule).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
        window.requestAnimationFrame = previousRaf;
        if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
        else globalWithDetector.BarcodeDetector = previousDetector;
        if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
        else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
      }
    });

    it('retries a failed detect on the next frame and uses a later result', async () => {
      const stop = jest.fn();
      const detect = jest
        .fn()
        .mockRejectedValueOnce(new Error('frame failed'))
        .mockResolvedValueOnce([{ rawValue: 'bc1qretry' }]);
      let nextFrame: FrameRequestCallback | undefined;
      const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
      const previousRaf = window.requestAnimationFrame;
      const previousCancel = window.cancelAnimationFrame;
      const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
      const previousDetector = globalWithDetector.BarcodeDetector;
      globalWithDetector.BarcodeDetector = class {
        detect = detect;
      };
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop }] }) },
      });
      window.requestAnimationFrame = (callback) => {
        nextFrame = callback;
        return 17;
      };
      window.cancelAnimationFrame = jest.fn();
      try {
        openDesk({ id: 'keys' });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
        await waitFor(() => expect(nextFrame).toBeDefined());
        expect(screen.getByTestId('passkey-send-scan')).toBeInTheDocument();
        const callback = nextFrame;
        if (!callback) throw new Error('Expected a retry frame');
        await act(async () => callback(0));
        expect(detect).toHaveBeenCalledTimes(2);
        expect(screen.getByLabelText('Destination')).toHaveValue('bc1qretry');
        expect(stop).toHaveBeenCalledTimes(1);
      } finally {
        window.requestAnimationFrame = previousRaf;
        window.cancelAnimationFrame = previousCancel;
        if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
        else globalWithDetector.BarcodeDetector = previousDetector;
        if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
        else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
      }
    });

    it.each(['missing', 'undefined', 'throws', 'rejects'] as const)(
      'continues scanning when video play is %s and stream assignment throws',
      async (mode) => {
        const stop = jest.fn();
        const detect = jest.fn().mockResolvedValue([{ rawValue: 'bc1qvideo' }]);
        const assign = jest.fn((value: unknown) => {
          if (value !== null) throw new Error('stream rejected');
        });
        const play = jest.fn(() => {
          if (mode === 'throws') throw new Error('play failed');
          if (mode === 'rejects') return Promise.reject(new Error('play rejected'));
          return undefined;
        });
        const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
        const previousSource = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject');
        const previousPlay = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'play');
        const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
        const previousDetector = globalWithDetector.BarcodeDetector;
        globalWithDetector.BarcodeDetector = class {
          detect = detect;
        };
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop }] }) },
        });
        Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, set: assign });
        Object.defineProperty(HTMLMediaElement.prototype, 'play', {
          configurable: true,
          value: mode === 'missing' ? undefined : play,
        });
        try {
          openDesk({ id: 'keys' });
          fireEvent.click(screen.getByRole('button', { name: 'Send' }));
          fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
          await waitFor(() => expect(screen.getByLabelText('Destination')).toHaveValue('bc1qvideo'));
          expect(assign).toHaveBeenCalled();
          expect(detect).toHaveBeenCalledTimes(1);
          expect(stop).toHaveBeenCalledTimes(1);
          expect(play).toHaveBeenCalledTimes(mode === 'missing' ? 0 : 1);
        } finally {
          if (previousSource) Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', previousSource);
          else delete (HTMLMediaElement.prototype as { srcObject?: unknown }).srcObject;
          if (previousPlay) Object.defineProperty(HTMLMediaElement.prototype, 'play', previousPlay);
          else delete (HTMLMediaElement.prototype as { play?: unknown }).play;
          if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
          else globalWithDetector.BarcodeDetector = previousDetector;
          if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
          else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
        }
      },
    );

    it('stops the acquired stream if BarcodeDetector disappears before the camera effect', async () => {
      const stop = jest.fn();
      const stopSecond = jest.fn();
      const detect = jest.fn();
      const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
      const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
      const previousDetector = globalWithDetector.BarcodeDetector;
      globalWithDetector.BarcodeDetector = class {
        detect = detect;
      };
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: () => {
            delete globalWithDetector.BarcodeDetector;
            return Promise.resolve({ getTracks: () => [{ stop }, { stop: stopSecond }] });
          },
        },
      });
      try {
        openDesk({ id: 'keys' });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
        await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
        expect(stopSecond).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('passkey-send-scan')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Destination')).toHaveValue('');
        expect(detect).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(stop).toHaveBeenCalledTimes(1);
      } finally {
        if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
        else globalWithDetector.BarcodeDetector = previousDetector;
        if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
        else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
      }
    });

    it.each(['next frame', 'scan again', 'close'] as const)('handles a scheduled scan frame on %s', async (action) => {
      const stop = jest.fn();
      const detect = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(action === 'close' ? [] : [{ rawValue: 'bc1qsecond' }]);
      const getUserMedia = jest
        .fn()
        .mockResolvedValueOnce({ getTracks: () => [{ stop }] })
        .mockImplementationOnce(() => new Promise(() => undefined));
      const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
      const previousRaf = window.requestAnimationFrame;
      const previousCancel = window.cancelAnimationFrame;
      const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
      const previousDetector = globalWithDetector.BarcodeDetector;
      let frame: FrameRequestCallback | undefined;
      const cancel = jest.fn();
      globalWithDetector.BarcodeDetector = class {
        detect = detect;
      };
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
      const schedule = jest.fn((callback: FrameRequestCallback) => {
        frame = callback;
        return 42;
      });
      window.requestAnimationFrame = schedule;
      window.cancelAnimationFrame = cancel;
      try {
        openDesk({ id: 'keys' });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
        await waitFor(() => expect(frame).toBeDefined());
        expect(detect).toHaveBeenCalledTimes(1);
        if (action === 'next frame') {
          const callback = frame;
          if (!callback) throw new Error('Expected a scheduled frame');
          await act(async () => callback(0));
          expect(detect).toHaveBeenCalledTimes(2);
          expect(screen.getByLabelText('Destination')).toHaveValue('bc1qsecond');
        } else if (action === 'scan again') {
          fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
          expect(getUserMedia).toHaveBeenCalledTimes(2);
        } else {
          const firstFrame = frame;
          if (!firstFrame) throw new Error('Expected a scheduled frame');
          await act(async () => firstFrame(0));
          expect(detect).toHaveBeenCalledTimes(2);
          expect(schedule).toHaveBeenCalledTimes(2);
          expect(screen.getByLabelText('Destination')).toHaveValue('');
          expect(mockLink).not.toHaveBeenCalled();
          fireEvent.click(screen.getByRole('button', { name: 'Close' }));
          expect(screen.queryByRole('dialog', { name: 'Send' })).not.toBeInTheDocument();
          const callback = frame;
          if (!callback) throw new Error('Expected a scheduled frame');
          act(() => callback(0));
          expect(detect).toHaveBeenCalledTimes(2);
        }
        expect(cancel).toHaveBeenCalledWith(42);
        expect(stop).toHaveBeenCalledTimes(1);
      } finally {
        window.requestAnimationFrame = previousRaf;
        window.cancelAnimationFrame = previousCancel;
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

    it.each(['running', 'pending'] as const)('stops a %s camera when the send dialog closes', async (state) => {
      const stop = jest.fn();
      let finish: (stream: unknown) => void = () => undefined;
      const stream = { getTracks: () => [{ stop }] };
      const getUserMedia = jest.fn(() =>
        state === 'pending'
          ? new Promise((resolve) => {
              finish = resolve;
            })
          : Promise.resolve(stream),
      );
      const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
      const previousRaf = window.requestAnimationFrame;
      const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
      const previousDetector = globalWithDetector.BarcodeDetector;
      globalWithDetector.BarcodeDetector = class {
        detect() {
          return Promise.resolve([]);
        }
      };
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
      window.requestAnimationFrame = ((_callback: FrameRequestCallback) => 1) as typeof requestAnimationFrame;
      try {
        openDesk({ id: 'keys' });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
        if (state === 'running') await screen.findByTestId('passkey-send-scan');
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        if (state === 'pending') await act(async () => finish(stream));
        await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
        expect(screen.queryByRole('dialog', { name: 'Send' })).not.toBeInTheDocument();
      } finally {
        window.requestAnimationFrame = previousRaf;
        if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
        else globalWithDetector.BarcodeDetector = previousDetector;
        if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
        else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
      }
    });

    it('ignores a camera rejection after the send dialog closes', async () => {
      const react = jest.requireActual<typeof import('react')>('react');
      const originalUseState = react.useState;
      const staleWrite = jest.fn();
      const spy = jest.spyOn(react, 'useState').mockImplementation(((initial: unknown) => {
        const [value, setValue] = originalUseState<unknown>(initial);
        return [
          value,
          (next: unknown) => {
            if (next === 'QR scanning is not available in this browser.') staleWrite(next);
            setValue(next);
          },
        ];
      }) as typeof react.useState);
      let fail: (error: Error) => void = () => undefined;
      const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
      const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
      const previousDetector = globalWithDetector.BarcodeDetector;
      globalWithDetector.BarcodeDetector = class {
        detect() {
          return Promise.resolve([]);
        }
      };
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: () =>
            new Promise((_resolve, reject) => {
              fail = reject;
            }),
        },
      });
      try {
        openDesk({ id: 'keys' });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        await act(async () => fail(new Error('camera denied')));
        expect(staleWrite).not.toHaveBeenCalled();
        expect(screen.queryByText('QR scanning is not available in this browser.')).not.toBeInTheDocument();
      } finally {
        spy.mockRestore();
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

  it('returns the generic sentence for a non-error and a blank message', () => {
    expect(passkeyMessage('nope')).toBe(PASSKEY_GENERIC_ERROR);
    expect(passkeyMessage(new Error('  '))).toBe(PASSKEY_GENERIC_ERROR);
  });
});
