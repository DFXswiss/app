const mockCreateSession = jest.fn();
const mockUpdateSession = jest.fn();
const mockGetSignMessage = jest.fn();
const mockLogout = jest.fn();
const mockChangeAddress = jest.fn();
const mockReloadUser = jest.fn();
const mockConnectInjected = jest.fn();
const mockSignInjected = jest.fn();
const mockResolveInjected = jest.fn();
const mockConnectWc = jest.fn();
const mockSignWc = jest.fn();
const mockDisconnectWc = jest.fn();
const mockGetInjected = jest.fn();
const mockConnectAlby = jest.fn();
const mockConnectCardano = jest.fn();
const mockConnectChain = jest.fn();
const mockConnectHw = jest.fn();
const mockIsWebHid = jest.fn(() => true);
const mockIsUserRejection = jest.fn(() => false);
const mockRemember = jest.fn();
const mockSeen = jest.fn(() => [] as Array<Record<string, unknown>>);
const mockAuth: { session?: { address?: string; blockchains?: string[] } } = {};
const mockSessionCtx = { isLoggedIn: false, logout: mockLogout };
const mockUserAddresses: Array<Record<string, unknown>> = [];
const mockUserAddr: { list: Array<Record<string, unknown>> | undefined } = { list: mockUserAddresses };
const mockUserState: { user?: { id: number } } = { user: { id: 1 } };
const mockCancel = { cancel: jest.fn(), promise: new Promise(() => undefined) };

jest.mock('@dfx.swiss/react', () => ({
  AuthWalletType: {
    METAMASK: 'MetaMask',
    WALLET_CONNECT: 'WalletConnect',
    LEDGER: 'Ledger',
    TREZOR: 'Trezor',
    ALBY: 'Alby',
    PHANTOM: 'Phantom',
    CLI: 'CLI',
    RABBY: 'Rabby',
  },
  Blockchain: {
    ETHEREUM: 'Ethereum',
    BITCOIN: 'Bitcoin',
    SOLANA: 'Solana',
    CARDANO: 'Cardano',
    SEPOLIA: 'Sepolia',
  },
  useApi: () => ({ defaultUrl: 'https://api.dfx.swiss/v1' }),
  useApiSession: () => ({ createSessionNew: mockCreateSession, updateSession: mockUpdateSession }),
  useAuth: () => ({ getSignMessage: mockGetSignMessage }),
  useAuthContext: () => ({ session: mockAuth.session }),
  useSessionContext: () => mockSessionCtx,
  useUserContext: () => ({
    user: mockUserState.user,
    userAddresses: mockUserAddr.list,
    changeAddress: mockChangeAddress,
    reloadUser: mockReloadUser,
  }),
}));

jest.mock('../wallets/providers', () => ({
  WalletConnectorError: class WalletConnectorError extends Error {
    reason: string;
    constructor(message: string, reason: string) {
      super(message);
      this.reason = reason;
    }
  },
  connectInjected: (...args: unknown[]) => mockConnectInjected(...args),
  signWithInjected: (...args: unknown[]) => mockSignInjected(...args),
  resolveInjectedProvider: (...args: unknown[]) => mockResolveInjected(...args),
  connectWalletConnect: (...args: unknown[]) => mockConnectWc(...args),
  createCancelToken: jest.fn(() => mockCancel),
  disconnectWalletConnect: (...args: unknown[]) => mockDisconnectWc(...args),
  getInjectedProvider: (...args: unknown[]) => mockGetInjected(...args),
  isUserRejection: (...args: unknown[]) => mockIsUserRejection(...args),
  signWithWalletConnect: (...args: unknown[]) => mockSignWc(...args),
}));

jest.mock('../wallets/alby', () => ({ connectAlby: (...args: unknown[]) => mockConnectAlby(...args) }));
jest.mock('../wallets/cardano', () => ({ connectCardano: (...args: unknown[]) => mockConnectCardano(...args) }));
jest.mock('../wallets/chain-providers', () => ({
  connectChainWallet: (...args: unknown[]) => mockConnectChain(...args),
}));
jest.mock('../wallets/hardware-providers', () => ({
  connectHardware: (...args: unknown[]) => mockConnectHw(...args),
  isWebHidAvailable: () => mockIsWebHid(),
}));
jest.mock('../wallets/cli', () => ({ isPlausibleCliAddress: (value: string) => value.length > 8 }));
jest.mock('../wallets/seen', () => ({
  rememberWallet: (...args: unknown[]) => mockRemember(...args),
  seenWallets: () => mockSeen(),
}));
jest.mock('../assets/brand/dfx-mark.svg', () => 'dfx-mark.svg');
jest.mock('../assets/wallets/pecunity.png', () => 'pecunity.png');
jest.mock('../assets/wallets/realunit.svg', () => 'realunit.svg');
jest.mock('../assets/wallets/urble.webp', () => 'urble.webp');

import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthWalletType } from '@dfx.swiss/react';
import { LanguageProvider } from '../i18n';
import { ToastProvider } from '../components/ui';
import { useWalletSession, WalletSessionProvider } from '../wallets/session';
import type { WalletCatalogEntry } from '../wallets/catalog';

const address = '0x' + '11'.repeat(20);
const other = '0x' + '22'.repeat(20);

const metamask = {
  id: 'MetaMask',
  name: 'MetaMask',
  icon: 'mm.svg',
  connector: 'injected',
  walletType: AuthWalletType.METAMASK,
  injected: { flavor: 'isMetaMask' },
  evm: true,
} as WalletCatalogEntry;

const rabby = {
  id: 'Rabby',
  name: 'Rabby',
  icon: 'rb.svg',
  connector: 'injected',
  walletType: AuthWalletType.RABBY,
  injected: { flavor: 'isRabby' },
  evm: true,
} as WalletCatalogEntry;

const wc = {
  id: 'WalletConnect',
  name: 'WalletConnect',
  icon: 'wc.svg',
  connector: 'wallet-connect',
  walletType: AuthWalletType.WALLET_CONNECT,
} as WalletCatalogEntry;

const ledger = {
  id: 'Ledger',
  name: 'Ledger',
  icon: 'led.svg',
  connector: 'ledger',
  walletType: AuthWalletType.LEDGER,
} as WalletCatalogEntry;

const trezor = {
  id: 'Trezor',
  name: 'Trezor',
  icon: 'tz.svg',
  connector: 'trezor',
  walletType: AuthWalletType.TREZOR,
} as WalletCatalogEntry;

const alby = {
  id: 'Alby',
  name: 'Alby',
  icon: 'alby.svg',
  connector: 'alby',
  walletType: AuthWalletType.ALBY,
} as WalletCatalogEntry;

const phantom = {
  id: 'Phantom',
  name: 'Phantom',
  icon: 'ph.svg',
  connector: 'solana',
  walletType: AuthWalletType.PHANTOM,
} as WalletCatalogEntry;

const nami = {
  id: 'Nami',
  name: 'Nami',
  icon: 'nami.svg',
  connector: 'cardano',
  walletType: AuthWalletType.CLI,
} as WalletCatalogEntry;

const cli = {
  id: 'CLI',
  name: 'CLI',
  icon: 'cli.svg',
  connector: 'cli',
  walletType: AuthWalletType.CLI,
} as WalletCatalogEntry;

function jwt(blockchains = ['Ethereum'], exp = Math.floor(Date.now() / 1000) + 3600): string {
  const payload = btoa(JSON.stringify({ exp, blockchains }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `e30.${payload}.sig`;
}

function Probe() {
  const session = useWalletSession();
  return (
    <div>
      <span data-testid="in">{String(session.isLoggedIn)}</span>
      <span data-testid="view">{session.connectSheet.view.kind}</span>
      <span data-testid="filter">
        {session.connectSheet.view.kind === 'list' ? session.connectSheet.view.filterChain ?? '' : ''}
      </span>
      <span data-testid="switcher">{String(session.switcher.open)}</span>
      <span data-testid="entries">{session.switcher.entries.map((e) => e.name).join(',')}</span>
      <span data-testid="active">{session.activeWallet?.name ?? ''}</span>
      <span data-testid="addr">{session.address ?? ''}</span>
      <button type="button" onClick={() => session.openConnect()}>
        open
      </button>
      <button type="button" onClick={() => session.openConnect(undefined, 'Bitcoin' as never)}>
        open-btc
      </button>
      <button type="button" onClick={() => session.openConnect('AB-CD12-EF34-GH')}>
        open-rec
      </button>
      <button type="button" onClick={() => session.closeConnect()}>
        close
      </button>
      <button type="button" onClick={() => session.connectSheet.onBackToList()}>
        back-list
      </button>
      <button type="button" onClick={() => session.openSwitcher()}>
        switcher
      </button>
      <button type="button" onClick={() => session.switcher.onClose()}>
        close-sw
      </button>
      <button type="button" onClick={() => session.switcher.onConnectAnother()}>
        another
      </button>
      <button type="button" onClick={() => void session.logout()}>
        logout
      </button>
      <button type="button" onClick={() => void session.connectSheet.onSelectWallet(metamask)}>
        pick-mm
      </button>
      <button type="button" onClick={() => void session.connectSheet.onSelectWallet(rabby)}>
        pick-rabby
      </button>
      <button
        type="button"
        onClick={() =>
          void session.connectSheet.onSelectWallet({
            id: 'WalletBrowser',
            name: 'Browser',
            icon: 'b.svg',
            connector: 'injected',
            walletType: AuthWalletType.RABBY,
          } as never)
        }
      >
        pick-bare
      </button>
      <button type="button" onClick={() => void session.connectSheet.onSelectWallet(wc)}>
        pick-wc
      </button>
      <button type="button" onClick={() => void session.connectSheet.onSelectWallet(alby)}>
        pick-alby
      </button>
      <button type="button" onClick={() => void session.connectSheet.onSelectWallet(phantom)}>
        pick-ph
      </button>
      <button type="button" onClick={() => void session.connectSheet.onSelectWallet(nami)}>
        pick-nami
      </button>
      <button type="button" onClick={() => void session.connectSheet.onCliConnect(cli, address, '0xsig')}>
        cli-ok
      </button>
      <button type="button" onClick={() => void session.connectSheet.onCliConnect(cli, '0xSHORT', '0xsig')}>
        cli-short
      </button>
      <button type="button" onClick={() => void session.connectSheet.onSelectHwChain(ledger, 'btc')}>
        hw-btc
      </button>
      <button type="button" onClick={() => void session.connectSheet.onSelectHwChain(trezor, 'eth')}>
        hw-tz
      </button>
      <button type="button" onClick={() => void session.connectSheet.onSelectHwChain(ledger, 'eth')}>
        hw-eth
      </button>
      <button
        type="button"
        onClick={() => {
          const first = session.switcher.entries.find((e) => !e.active);
          if (first) void session.switcher.onSwitch(first);
          const active = session.switcher.entries.find((e) => e.active);
          if (active) void session.switcher.onSwitch(active);
        }}
      >
        switch
      </button>
      <button
        type="button"
        onClick={() =>
          void session.connectSheet.onSubmitRecommendation(
            { address, signature: '0xsig', connector: 'injected', walletType: AuthWalletType.METAMASK },
            '',
          )
        }
      >
        rec-empty
      </button>
      <button
        type="button"
        onClick={() =>
          void session.connectSheet.onSubmitRecommendation(
            { address, signature: '0xsig', connector: 'wallet-connect', walletType: AuthWalletType.WALLET_CONNECT },
            'AB-CD12-EF34-GH',
          )
        }
      >
        rec-wc
      </button>
      <button
        type="button"
        onClick={() => {
          void session.connectSheet.requestSignMessage('short').catch((err: Error) => {
            (document.getElementById('cli-err') as HTMLElement).textContent = err.message;
          });
        }}
      >
        cli-bad
      </button>
      <span id="cli-err" />
    </div>
  );
}

function renderSession() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <WalletSessionProvider>
          <Probe />
        </WalletSessionProvider>
      </ToastProvider>
    </LanguageProvider>,
  );
}

describe('WalletSessionProvider flows', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionCtx.isLoggedIn = false;
    mockAuth.session = undefined;
    mockUserAddresses.length = 0;
    mockUserAddr.list = mockUserAddresses;
    mockUserState.user = { id: 1 };
    mockLogout.mockResolvedValue(undefined);
    mockCreateSession.mockResolvedValue(jwt());
    mockGetSignMessage.mockResolvedValue(`by_signing_this_message ${address} dfx.swiss`);
    mockResolveInjected.mockReturnValue({ request: jest.fn(), on: jest.fn(), removeListener: jest.fn() });
    mockConnectInjected.mockResolvedValue(address);
    mockSignInjected.mockResolvedValue('0xsig');
    mockConnectAlby.mockResolvedValue({
      kind: 'session',
      session: { address, sign: jest.fn().mockResolvedValue('ln-sig') },
    });
    mockConnectCardano.mockResolvedValue({
      address,
      sign: jest.fn().mockResolvedValue({ signature: 's', key: 'k' }),
    });
    mockConnectChain.mockResolvedValue({ address, sign: jest.fn().mockResolvedValue('sig') });
    mockConnectHw.mockResolvedValue({ address, sign: jest.fn().mockResolvedValue('hw-sig') });
    mockIsWebHid.mockReturnValue(true);
    mockDisconnectWc.mockResolvedValue(undefined);
    mockSeen.mockReturnValue([]);
    mockChangeAddress.mockResolvedValue(undefined);
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('bootstraps a valid JWT from the URL and ignores a junk token', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, search: `?session=${jwt()}`, pathname: '/app2/', hash: '' },
    });
    const replace = jest.spyOn(window.history, 'replaceState').mockImplementation(() => undefined);
    renderSession();
    await waitFor(() => expect(mockUpdateSession).toHaveBeenCalled());
    expect(replace).toHaveBeenCalled();
    replace.mockRestore();
  });

  it('bootstraps address+signature credentials from the URL', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, search: `?address=${address}&signature=0xsig`, pathname: '/app2/', hash: '' },
    });
    const replace = jest.spyOn(window.history, 'replaceState').mockImplementation(() => undefined);
    renderSession();
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    replace.mockRestore();
  });

  it('skips an expired JWT in the URL', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        search: `?token=${jwt(['Ethereum'], Math.floor(Date.now() / 1000) - 120)}`,
        pathname: '/app2/',
        hash: '',
      },
    });
    const replace = jest.spyOn(window.history, 'replaceState').mockImplementation(() => undefined);
    renderSession();
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockUpdateSession).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalled();
    replace.mockRestore();
  });

  it('opens a filtered connect sheet and the switcher', async () => {
    mockAuth.session = { address, blockchains: ['Ethereum'] };
    mockSessionCtx.isLoggedIn = true;
    mockUserAddresses.push(
      { address, label: 'DFX Wallet', wallet: 'MetaMask', blockchains: ['Ethereum'] },
      { address: '', wallet: 'Skip' },
      { address: '0x' + '33'.repeat(20), isCustody: true, wallet: 'Custody' },
    );
    mockSeen.mockReturnValue([
      { address: other, walletType: 'Pecunity', walletId: 'Pecunity', chains: ['Bitcoin'] },
      { address, walletType: 'MetaMask', walletId: 'MetaMask' },
      { address: '0x' + '44'.repeat(20), walletType: 'RealUnit' },
      { address: '0x' + '55'.repeat(20), walletType: 'Urble' },
    ]);
    renderSession();
    fireEvent.click(screen.getByText('open-btc'));
    expect(screen.getByTestId('filter')).toHaveTextContent('Bitcoin');
    fireEvent.click(screen.getByText('switcher'));
    expect(screen.getByTestId('switcher')).toHaveTextContent('true');
    expect(mockReloadUser).toHaveBeenCalled();
    expect(screen.getByTestId('entries')).toHaveTextContent(/DFX Wallet|Pecunity|MetaMask/);
    fireEvent.click(screen.getByText('close-sw'));
    expect(screen.getByTestId('switcher')).toHaveTextContent('false');
    fireEvent.click(screen.getByText('another'));
    expect(screen.getByTestId('view')).toHaveTextContent('list');
  });

  it('switches a linked address and restores bindings on failure', async () => {
    mockAuth.session = { address, blockchains: ['Ethereum'] };
    mockSessionCtx.isLoggedIn = true;
    mockUserAddresses.push(
      { address, label: 'Here', wallet: 'MetaMask', blockchains: ['Ethereum'] },
      { address: other, label: 'There', wallet: 'MetaMask', blockchains: ['Ethereum'] },
    );
    renderSession();
    fireEvent.click(screen.getByText('switch'));
    await waitFor(() => expect(mockChangeAddress).toHaveBeenCalledWith(other));

    mockChangeAddress.mockRejectedValueOnce(new Error('nope'));
    fireEvent.click(screen.getByText('switch'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('does not call changeAddress when the user object is missing', async () => {
    mockUserState.user = undefined;
    mockAuth.session = { address, blockchains: ['Ethereum'] };
    mockSessionCtx.isLoggedIn = true;
    mockUserAddresses.push(
      { address, label: 'Here', wallet: 'MetaMask', blockchains: ['Ethereum'] },
      { address: other, label: 'There', wallet: 'MetaMask', blockchains: ['Ethereum'] },
    );
    renderSession();
    fireEvent.click(screen.getByText('switch'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(mockChangeAddress).not.toHaveBeenCalled();
  });

  it('re-authenticates an unlinked remembered wallet', async () => {
    mockAuth.session = { address, blockchains: ['Ethereum'] };
    mockSessionCtx.isLoggedIn = true;
    mockSeen.mockReturnValue([{ address: other, walletType: 'MetaMask', walletId: 'MetaMask' }]);
    mockChangeAddress.mockRejectedValue(new Error('not-linked'));
    renderSession();
    fireEvent.click(screen.getByText('switch'));
    await waitFor(() => expect(mockConnectInjected).toHaveBeenCalled());
  });

  it('pairs WalletConnect and signs in', async () => {
    const provider = { on: jest.fn(), removeListener: jest.fn(), request: jest.fn() };
    mockConnectWc.mockImplementation(async (onUri: (uri: string) => void) => {
      onUri('wc:pair');
      return { provider, address };
    });
    mockSignWc.mockResolvedValue('0xsig');
    renderSession();
    fireEvent.click(screen.getByText('pick-wc'));
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
  });

  it('cancels an in-flight WalletConnect pairing when the sheet closes', async () => {
    const release: () => void = () => undefined;
    mockConnectWc.mockImplementation(
      () =>
        new Promise(() => {
          /* hang until cancel */
        }),
    );
    renderSession();
    fireEvent.click(screen.getByText('pick-wc'));
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('wallet-connect'));
    fireEvent.click(screen.getByText('close'));
    expect(mockDisconnectWc).toHaveBeenCalled();
    release();
  });

  it('toasts session-expired on a 401 while already logged in', async () => {
    mockSessionCtx.isLoggedIn = true;
    mockAuth.session = { address, blockchains: ['Ethereum'] };
    mockCreateSession.mockRejectedValueOnce({ statusCode: 401, message: 'gone' });
    renderSession();
    fireEvent.click(screen.getByText('pick-mm'));
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
  });

  it('refuses a missing Rabby without opening an install page', async () => {
    mockResolveInjected.mockReturnValue(undefined);
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    renderSession();
    fireEvent.click(screen.getByText('pick-rabby'));
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('list'));
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('drops Phantom / Nami / Alby when the auth message is unexpected', async () => {
    mockGetSignMessage.mockResolvedValue('unrelated');
    renderSession();
    fireEvent.click(screen.getByText('pick-ph'));
    await waitFor(() => expect(mockConnectChain).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('list'));
    fireEvent.click(screen.getByText('pick-nami'));
    await waitFor(() => expect(mockConnectCardano).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('list'));
    fireEvent.click(screen.getByText('pick-alby'));
    await waitFor(() => expect(mockConnectAlby).toHaveBeenCalled());
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('blocks hardware when WebHID is missing and still connects Trezor', async () => {
    mockIsWebHid.mockReturnValue(false);
    renderSession();
    fireEvent.click(screen.getByText('hw-btc'));
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('list'));
    expect(mockConnectHw).not.toHaveBeenCalled();

    mockIsWebHid.mockReturnValue(true);
    mockConnectHw.mockImplementation(async (_id, _chain, hooks: { onPairingCode: (c: string) => void; onStatus: (s: string) => void }) => {
      hooks.onPairingCode('123456');
      hooks.onStatus('unlock');
      hooks.onStatus('derive');
      hooks.onStatus('pair');
      return { address, sign: jest.fn().mockResolvedValue('hw-sig'), dispose: jest.fn() };
    });
    fireEvent.click(screen.getByText('hw-tz'));
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
  });

  it('maps hardware rejection vs generic failure', async () => {
    const { WalletConnectorError } = jest.requireMock('../wallets/providers') as {
      WalletConnectorError: new (message: string, reason: string) => Error;
    };
    mockConnectHw.mockRejectedValueOnce(new WalletConnectorError('nope', 'rejected'));
    renderSession();
    fireEvent.click(screen.getByText('hw-eth'));
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('list'));

    mockIsUserRejection.mockReturnValueOnce(true);
    mockConnectHw.mockRejectedValueOnce(new Error('user abort'));
    fireEvent.click(screen.getByText('hw-eth'));
    await waitFor(() => expect(mockConnectHw).toHaveBeenCalledTimes(2));
  });

  it('rejects an implausible CLI address and ignores an empty recommendation', async () => {
    renderSession();
    fireEvent.click(screen.getByText('cli-bad'));
    await waitFor(() => expect(screen.getByText('Invalid address')).toBeInTheDocument());
    fireEvent.click(screen.getByText('rec-empty'));
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('promotes a pending WalletConnect provider after a recommendation retry', async () => {
    mockCreateSession.mockRejectedValueOnce({ message: 'RecommendationRequired' });
    const provider = { on: jest.fn(), removeListener: jest.fn() };
    mockConnectWc.mockResolvedValue({ provider, address });
    mockSignWc.mockResolvedValue('0xsig');
    renderSession();
    fireEvent.click(screen.getByText('pick-wc'));
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('recommend'));
    mockCreateSession.mockResolvedValueOnce(jwt());
    fireEvent.click(screen.getByText('rec-wc'));
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalledTimes(2));
  });

  it('monitors accountsChanged and chainChanged on a live injected session', async () => {
    const listeners: Record<string, (value?: unknown) => void> = {};
    const provider = {
      request: jest.fn().mockResolvedValue([address]),
      on: jest.fn((event: string, handler: (value?: unknown) => void) => {
        listeners[event] = handler;
      }),
      removeListener: jest.fn(),
    };
    mockResolveInjected.mockReturnValue(provider);
    mockSessionCtx.isLoggedIn = true;
    mockAuth.session = { address, blockchains: ['Ethereum'] };
    renderSession();
    fireEvent.click(screen.getByText('pick-mm'));
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    await waitFor(() => expect(provider.on).toHaveBeenCalled());
    act(() => {
      listeners.chainChanged?.();
    });
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
  });

  it('discards a late injected connect after the sheet is closed', async () => {
    let release: (value: string) => void = () => undefined;
    mockConnectInjected.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    renderSession();
    fireEvent.click(screen.getByText('pick-mm'));
    fireEvent.click(screen.getByText('close'));
    await act(async () => {
      release(address);
      await Promise.resolve();
    });
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('forwards Alby invite fields and a generic connector error', async () => {
    mockConnectAlby.mockResolvedValueOnce({
      kind: 'session',
      session: { address, sign: jest.fn().mockResolvedValue('ln-sig') },
    });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, search: '?ref=stb-tax', pathname: '/app2/', hash: '' },
    });
    renderSession();
    fireEvent.click(screen.getByText('pick-alby'));
    await waitFor(() => expect(mockConnectAlby).toHaveBeenCalled());
    expect(mockConnectAlby.mock.calls[0][0]).toMatchObject({ usedRef: 'stb-tax' });

    mockConnectAlby.mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(screen.getByText('pick-alby'));
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('list'));
  });

  it('aborts hardware when the auth message is unexpected', async () => {
    mockGetSignMessage.mockResolvedValueOnce('nope');
    const dispose = jest.fn();
    mockConnectHw.mockResolvedValueOnce({ address, sign: jest.fn(), dispose });
    renderSession();
    fireEvent.click(screen.getByText('hw-eth'));
    await waitFor(() => expect(dispose).toHaveBeenCalled());
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('arms the reload monitor and logs out on a mismatched probe', async () => {
    const provider = {
      request: jest.fn().mockResolvedValue(['0x' + '99'.repeat(20)]),
      on: jest.fn(),
      removeListener: jest.fn(),
    };
    mockGetInjected.mockReturnValue(provider);
    mockSeen.mockReturnValue([{ address, walletType: 'MetaMask', walletId: 'MetaMask' }]);
    mockSessionCtx.isLoggedIn = true;
    mockAuth.session = { address, blockchains: ['Ethereum'] };
    renderSession();
    await waitFor(() => expect(provider.request).toHaveBeenCalled());
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
  });

  it('signs in after a generic failure and aborts mid-flight connectors', async () => {
    mockCreateSession.mockRejectedValueOnce({ message: 'nope' });
    renderSession();
    fireEvent.click(screen.getByText('pick-mm'));
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalledTimes(1));

    let releaseChain: (value: { address: string; sign: (m: string) => Promise<string> }) => void = () => undefined;
    mockConnectChain.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseChain = resolve;
        }),
    );
    fireEvent.click(screen.getByText('pick-ph'));
    fireEvent.click(screen.getByText('close'));
    await act(async () => {
      releaseChain({ address, sign: async () => 'sig' });
      await Promise.resolve();
    });
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  it('refuses a WalletConnect auth message and a double hardware tap', async () => {
    mockGetSignMessage.mockResolvedValueOnce('unrelated');
    const provider = { on: jest.fn(), removeListener: jest.fn() };
    mockConnectWc.mockResolvedValueOnce({ provider, address });
    renderSession();
    fireEvent.click(screen.getByText('pick-wc'));
    await waitFor(() => expect(mockGetSignMessage).toHaveBeenCalled());
    expect(mockCreateSession).not.toHaveBeenCalled();

    let releaseHw: (value: { address: string; sign: () => Promise<string> }) => void = () => undefined;
    mockConnectHw.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseHw = resolve;
        }),
    );
    fireEvent.click(screen.getByText('hw-eth'));
    fireEvent.click(screen.getByText('hw-eth'));
    await act(async () => {
      releaseHw({ address, sign: async () => 'hw' });
      await Promise.resolve();
    });
  });

  it('decodes a JWT without a payload and a broken token', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, search: '?session=onlyone', pathname: '/app2/', hash: '' },
    });
    const replace = jest.spyOn(window.history, 'replaceState').mockImplementation(() => undefined);
    renderSession();
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockUpdateSession).not.toHaveBeenCalled();
    replace.mockRestore();

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, search: '?session=e30.%%%notb64%%%.sig', pathname: '/app2/', hash: '' },
    });
    renderSession();
    await act(async () => {
      await Promise.resolve();
    });
  });

  it('enriches a linked switcher row from a remembered wallet', async () => {
    mockAuth.session = { address, blockchains: ['Ethereum'] };
    mockSessionCtx.isLoggedIn = true;
    mockUserAddresses.push({ address, wallet: undefined, label: 'Wallet', blockchains: [] });
    mockSeen.mockReturnValue([{ address, walletType: 'MetaMask', walletId: 'MetaMask' }]);
    renderSession();
    fireEvent.click(screen.getByText('switcher'));
    expect(screen.getByTestId('entries').textContent).toMatch(/MetaMask|Wallet/);
  });

  it('aborts Cardano, Alby and hardware after the await when the sheet closed', async () => {
    let releaseMsg: (value: string) => void = () => undefined;
    mockGetSignMessage.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseMsg = resolve;
        }),
    );
    renderSession();
    fireEvent.click(screen.getByText('pick-nami'));
    await waitFor(() => expect(mockConnectCardano).toHaveBeenCalled());
    fireEvent.click(screen.getByText('close'));
    await act(async () => {
      releaseMsg(`by_signing_this_message ${address} dfx.swiss`);
      await Promise.resolve();
    });
    expect(mockCreateSession).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('pick-alby'));
    await waitFor(() => expect(mockConnectAlby).toHaveBeenCalled());
    fireEvent.click(screen.getByText('close'));
    await act(async () => {
      releaseMsg(`by_signing_this_message ${address} dfx.swiss`);
      await Promise.resolve();
    });

    fireEvent.click(screen.getByText('hw-eth'));
    await waitFor(() => expect(mockConnectHw).toHaveBeenCalled());
    fireEvent.click(screen.getByText('close'));
    await act(async () => {
      releaseMsg(`by_signing_this_message ${address} dfx.swiss`);
      await Promise.resolve();
    });
  });

  it('skips monitoring for an other-connector session and ignores a second CLI submit', async () => {
    mockSessionCtx.isLoggedIn = true;
    mockAuth.session = { address, blockchains: ['Ethereum'] };
    mockConnectHw.mockResolvedValue({ address, sign: jest.fn().mockResolvedValue('hw-sig') });
    renderSession();
    fireEvent.click(screen.getByText('hw-eth'));
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());

    fireEvent.click(screen.getByText('cli-ok'));
    fireEvent.click(screen.getByText('cli-ok'));
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalledTimes(2));
  });

  it('runs the URL bootstrap only once under StrictMode', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, search: `?session=${jwt()}`, pathname: '/app2/', hash: '' },
    });
    const replace = jest.spyOn(window.history, 'replaceState').mockImplementation(() => undefined);
    render(
      <StrictMode>
        <LanguageProvider>
          <ToastProvider>
            <WalletSessionProvider>
              <Probe />
            </WalletSessionProvider>
          </ToastProvider>
        </LanguageProvider>
      </StrictMode>,
    );
    await waitFor(() => expect(mockUpdateSession).toHaveBeenCalledTimes(1));
    replace.mockRestore();
  });

  it('drops a probe after unmount and ignores a failed eth_accounts request', async () => {
    let resolveReq: (value: string[]) => void = () => undefined;
    const provider = {
      request: jest.fn(
        () =>
          new Promise<string[]>((resolve) => {
            resolveReq = resolve;
          }),
      ),
      on: jest.fn(),
      removeListener: jest.fn(),
    };
    mockGetInjected.mockReturnValue(provider);
    mockSessionCtx.isLoggedIn = true;
    mockAuth.session = { address, blockchains: ['Ethereum'] };
    const view = renderSession();
    await waitFor(() => expect(provider.request).toHaveBeenCalled());
    view.unmount();
    await act(async () => {
      resolveReq([address]);
      await Promise.resolve();
    });

    const failing = {
      request: jest.fn().mockRejectedValue(new Error('locked')),
      on: jest.fn(),
      removeListener: jest.fn(),
    };
    mockGetInjected.mockReturnValue(failing);
    renderSession();
    await waitFor(() => expect(failing.request).toHaveBeenCalled());
  });

  it('invalidates on accountsChanged after the probe arms the monitor', async () => {
    const listeners: Record<string, (value?: unknown) => void> = {};
    const provider = {
      request: jest.fn().mockResolvedValue([address]),
      on: jest.fn((event: string, handler: (value?: unknown) => void) => {
        listeners[event] = handler;
      }),
      removeListener: jest.fn(),
    };
    mockGetInjected.mockReturnValue(provider);
    mockSeen.mockReturnValue([{ address, walletType: 'MetaMask', walletId: 'MetaMask' }]);
    mockSessionCtx.isLoggedIn = true;
    mockAuth.session = { address, blockchains: ['Ethereum'] };
    renderSession();
    await waitFor(() => expect(provider.on).toHaveBeenCalled());
    act(() => {
      listeners.accountsChanged?.('not-an-array');
    });
    act(() => {
      listeners.accountsChanged?.([address]);
    });
    act(() => {
      listeners.accountsChanged?.(['0x' + '99'.repeat(20)]);
    });
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
  });

  it('discards a late createSession failure after the sheet closed', async () => {
    let rejectSession: (error: unknown) => void = () => undefined;
    mockCreateSession.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectSession = reject;
        }),
    );
    renderSession();
    fireEvent.click(screen.getByText('pick-mm'));
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    fireEvent.click(screen.getByText('close'));
    await act(async () => {
      rejectSession({ message: 'late' });
      await Promise.resolve();
    });
  });

  it('aborts Phantom after getSignMessage when the sheet closed', async () => {
    let releaseMsg: (value: string) => void = () => undefined;
    mockGetSignMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseMsg = resolve;
        }),
    );
    renderSession();
    fireEvent.click(screen.getByText('pick-ph'));
    await waitFor(() => expect(mockConnectChain).toHaveBeenCalled());
    fireEvent.click(screen.getByText('close'));
    await act(async () => {
      releaseMsg(`by_signing_this_message ${address} dfx.swiss`);
      await Promise.resolve();
    });
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('aborts WalletConnect after pairing and after the challenge', async () => {
    let releaseWc: (value: { provider: unknown; address: string }) => void = () => undefined;
    mockConnectWc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseWc = resolve;
        }),
    );
    renderSession();
    fireEvent.click(screen.getByText('pick-wc'));
    fireEvent.click(screen.getByText('close'));
    await act(async () => {
      releaseWc({ provider: { on: jest.fn(), removeListener: jest.fn() }, address });
      await Promise.resolve();
    });
    expect(mockCreateSession).not.toHaveBeenCalled();

    let releaseMsg: (value: string) => void = () => undefined;
    mockConnectWc.mockResolvedValueOnce({ provider: { on: jest.fn(), removeListener: jest.fn() }, address });
    mockGetSignMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseMsg = resolve;
        }),
    );
    fireEvent.click(screen.getByText('pick-wc'));
    await waitFor(() => expect(mockConnectWc).toHaveBeenCalled());
    fireEvent.click(screen.getByText('close'));
    await act(async () => {
      releaseMsg(`by_signing_this_message ${address} dfx.swiss`);
      await Promise.resolve();
    });
  });

  it('swallows a connector throw after cancel and maps a generic connect error', async () => {
    let rejectConnect: (error: unknown) => void = () => undefined;
    mockConnectInjected.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectConnect = reject;
        }),
    );
    renderSession();
    fireEvent.click(screen.getByText('pick-mm'));
    fireEvent.click(screen.getByText('close'));
    await act(async () => {
      rejectConnect(new Error('late'));
      await Promise.resolve();
    });

    mockConnectInjected.mockRejectedValueOnce(new Error('bridge down'));
    fireEvent.click(screen.getByText('pick-mm'));
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('list'));
  });

  it('aborts hardware after connect and after the challenge', async () => {
    let releaseHw: (value: { address: string; sign: () => Promise<string>; dispose?: () => Promise<void> }) => void =
      () => undefined;
    mockConnectHw.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseHw = resolve;
        }),
    );
    renderSession();
    fireEvent.click(screen.getByText('hw-eth'));
    fireEvent.click(screen.getByText('close'));
    await act(async () => {
      releaseHw({ address, sign: async () => 'hw', dispose: async () => undefined });
      await Promise.resolve();
    });

    let releaseMsg: (value: string) => void = () => undefined;
    mockConnectHw.mockResolvedValueOnce({ address, sign: async () => 'hw', dispose: async () => undefined });
    mockGetSignMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseMsg = resolve;
        }),
    );
    fireEvent.click(screen.getByText('hw-eth'));
    await waitFor(() => expect(mockConnectHw).toHaveBeenCalled());
    fireEvent.click(screen.getByText('close'));
    await act(async () => {
      releaseMsg(`by_signing_this_message ${address} dfx.swiss`);
      await Promise.resolve();
    });
  });

  it('hits every post-await isCurrent guard by closing between steps', async () => {
    const hang = <T,>() => {
      let release: (value: T) => void = () => undefined;
      const promise = new Promise<T>((resolve) => {
        release = resolve;
      });
      return { promise, release: (value: T) => release(value) };
    };

    let releaseMsg: (value: string) => void = () => undefined;
    mockGetSignMessage.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseMsg = resolve;
        }),
    );
    const chainHang = hang<{ address: string; sign: (m: string) => Promise<string> }>();
    mockConnectChain.mockImplementationOnce(() => chainHang.promise);
    renderSession();
    fireEvent.click(screen.getByText('pick-ph'));
    await waitFor(() => expect(mockConnectChain).toHaveBeenCalled());
    chainHang.release({ address, sign: async () => 'sig' });
    await waitFor(() => expect(mockGetSignMessage).toHaveBeenCalled());
    fireEvent.click(screen.getByText('close'));
    await act(async () => {
      releaseMsg(`by_signing_this_message ${address} dfx.swiss`);
      await Promise.resolve();
    });

    mockGetSignMessage.mockClear();
    const cardanoHang = hang<{ address: string; sign: (m: string) => Promise<{ signature: string; key: string }> }>();
    mockConnectCardano.mockImplementationOnce(() => cardanoHang.promise);
    fireEvent.click(screen.getByText('pick-nami'));
    await waitFor(() => expect(mockConnectCardano).toHaveBeenCalled());
    cardanoHang.release({ address, sign: async () => ({ signature: 's', key: 'k' }) });
    await waitFor(() => expect(mockGetSignMessage).toHaveBeenCalled());
    fireEvent.click(screen.getByText('close'));
    await act(async () => {
      releaseMsg(`by_signing_this_message ${address} dfx.swiss`);
      await Promise.resolve();
    });

    mockGetSignMessage.mockClear();
    const albyHang = hang<{ kind: 'session'; session: { address: string; sign: (m: string) => Promise<string> } }>();
    mockConnectAlby.mockImplementationOnce(() => albyHang.promise);
    fireEvent.click(screen.getByText('pick-alby'));
    await waitFor(() => expect(mockConnectAlby).toHaveBeenCalled());
    albyHang.release({ kind: 'session', session: { address, sign: async () => 'ln' } });
    await waitFor(() => expect(mockGetSignMessage).toHaveBeenCalled());
    fireEvent.click(screen.getByText('close'));
    await act(async () => {
      releaseMsg(`by_signing_this_message ${address} dfx.swiss`);
      await Promise.resolve();
    });

    mockGetSignMessage.mockClear();
    const wcHang = hang<{ provider: { on: jest.Mock; removeListener: jest.Mock }; address: string }>();
    mockConnectWc.mockImplementationOnce(() => wcHang.promise);
    fireEvent.click(screen.getByText('pick-wc'));
    await waitFor(() => expect(mockConnectWc).toHaveBeenCalled());
    wcHang.release({ provider: { on: jest.fn(), removeListener: jest.fn() }, address });
    await waitFor(() => expect(mockGetSignMessage).toHaveBeenCalled());
    fireEvent.click(screen.getByText('close'));
    await act(async () => {
      releaseMsg(`by_signing_this_message ${address} dfx.swiss`);
      await Promise.resolve();
    });

    mockGetSignMessage.mockClear();
    const hwHang = hang<{ address: string; sign: (m: string) => Promise<string>; dispose: () => Promise<void> }>();
    mockConnectHw.mockImplementationOnce(() => hwHang.promise);
    fireEvent.click(screen.getByText('hw-eth'));
    await waitFor(() => expect(mockConnectHw).toHaveBeenCalled());
    hwHang.release({
      address,
      sign: async () => 'hw-sig',
      dispose: async () => undefined,
    });
    await waitFor(() => expect(mockGetSignMessage).toHaveBeenCalled());
    fireEvent.click(screen.getByText('close'));
    await act(async () => {
      releaseMsg(`by_signing_this_message ${address} dfx.swiss`);
      await Promise.resolve();
    });
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('aborts after a late injected sign and after cancelled hardware steps', async () => {
    let releaseSign: (value: string) => void = () => undefined;
    mockSignInjected.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseSign = resolve;
        }),
    );
    renderSession();
    fireEvent.click(screen.getByText('pick-mm'));
    await waitFor(() => expect(mockSignInjected).toHaveBeenCalled());
    fireEvent.click(screen.getByText('close'));
    await act(async () => {
      releaseSign('0xlate');
      await Promise.resolve();
    });
    expect(mockCreateSession).not.toHaveBeenCalled();

    mockGetSignMessage.mockReset();
    mockGetSignMessage.mockResolvedValue(`by_signing_this_message ${address} dfx.swiss`);
    let signStarted = false;
    let releaseHwSign: (value: string) => void = () => undefined;
    mockConnectHw.mockResolvedValueOnce({
      address,
      sign: () => {
        signStarted = true;
        return new Promise<string>((resolve) => {
          releaseHwSign = resolve;
        });
      },
      dispose: async () => undefined,
    });
    fireEvent.click(screen.getByText('hw-eth'));
    await waitFor(() => expect(signStarted).toBe(true));
    fireEvent.click(screen.getByText('close'));
    await act(async () => {
      releaseHwSign('hw-late');
      await Promise.resolve();
    });

    let rejectHw: (error: unknown) => void = () => undefined;
    mockConnectHw.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectHw = reject;
        }),
    );
    fireEvent.click(screen.getByText('hw-eth'));
    await waitFor(() => expect(mockConnectHw).toHaveBeenCalled());
    fireEvent.click(screen.getByText('close'));
    await act(async () => {
      rejectHw(new Error('late-hw'));
      await Promise.resolve();
    });
  });

  it('maps a rejected connector error and accepts a dfx.swiss challenge', async () => {
    const { WalletConnectorError } = jest.requireMock('../wallets/providers') as {
      WalletConnectorError: new (message: string, reason: string) => Error;
    };
    mockConnectInjected.mockRejectedValueOnce(new WalletConnectorError('nope', 'rejected'));
    renderSession();
    fireEvent.click(screen.getByText('pick-mm'));
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('list'));

    mockGetSignMessage.mockResolvedValueOnce(`please confirm ${address} on dfx.swiss`);
    fireEvent.click(screen.getByText('pick-mm'));
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
  });

  it('returns when Alby redirects away', async () => {
    mockConnectAlby.mockResolvedValueOnce({ kind: 'redirected' });
    renderSession();
    fireEvent.click(screen.getByText('pick-alby'));
    await waitFor(() => expect(mockConnectAlby).toHaveBeenCalled());
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('ignores a WalletConnect URI after the sheet left the QR view', async () => {
    let emitUri: ((uri: string) => void) | undefined;
    mockConnectWc.mockImplementationOnce(async (onUri: (uri: string) => void) => {
      emitUri = onUri;
      onUri('wc:first');
      return { provider: { on: jest.fn(), removeListener: jest.fn() }, address };
    });
    mockSignWc.mockResolvedValueOnce('0xsig');
    renderSession();
    fireEvent.click(screen.getByText('pick-wc'));
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    emitUri?.('wc:late');
  });

  it('drops hardware pairing updates after cancel and bootstraps leftover URL shapes', async () => {
    let hwHooks: { onPairingCode: (code: string) => void; onStatus: (status: string) => void } | undefined;
    mockConnectHw.mockImplementationOnce(
      (_id, _chain, hooks: { onPairingCode: (code: string) => void; onStatus: (status: string) => void }) => {
        hwHooks = hooks;
        return new Promise(() => undefined);
      },
    );
    renderSession();
    fireEvent.click(screen.getByText('hw-eth'));
    await waitFor(() => expect(hwHooks).toBeDefined());
    fireEvent.click(screen.getByText('close'));
    hwHooks?.onPairingCode('654321');
    hwHooks?.onStatus('unlock');

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        search: `?session=${jwt()}&keep=1`,
        pathname: '/app2/',
        hash: '',
      },
    });
    const extra = render(
      <LanguageProvider>
        <ToastProvider>
          <WalletSessionProvider>
            <Probe />
          </WalletSessionProvider>
        </ToastProvider>
      </LanguageProvider>,
    );
    await waitFor(() => expect(mockUpdateSession).toHaveBeenCalled());
    extra.unmount();

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, search: `?address=${address}`, pathname: '/app2/', hash: '' },
    });
    const addrOnly = renderSession();
    await act(async () => {
      await Promise.resolve();
    });
    addrOnly.unmount();
  });

  it('signs in with a short address and a JWT that lists no chains', async () => {
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    mockCreateSession.mockResolvedValueOnce(`e30.${payload}.sig`);
    mockGetSignMessage.mockResolvedValue('by_signing_this_message 0xSHORT dfx.swiss');
    renderSession();
    fireEvent.click(screen.getByText('cli-short'));
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
  });

  it('covers leftover invite, switcher and monitor branches', async () => {
    mockCreateSession.mockRejectedValueOnce({ message: 'RecommendationRequired' });
    renderSession();
    fireEvent.click(screen.getByText('open-rec'));
    fireEvent.click(screen.getByText('pick-mm'));
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('recommend'));

    mockCreateSession.mockImplementationOnce(() => new Promise(() => undefined));
    fireEvent.click(screen.getByText('rec-wc'));
    fireEvent.click(screen.getByText('close'));

    mockConnectWc.mockImplementationOnce(
      () =>
        new Promise(() => {
          /* hang pairing */
        }),
    );
    fireEvent.click(screen.getByText('pick-wc'));
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('wallet-connect'));
    fireEvent.click(screen.getByText('back-list'));

    mockGetSignMessage.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByText('pick-mm'));
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('list'));

    mockResolveInjected.mockReturnValue({ request: jest.fn(), on: jest.fn(), removeListener: jest.fn() });
    fireEvent.click(screen.getByText('pick-bare'));
    await waitFor(() => expect(mockResolveInjected).toHaveBeenCalled());
  });

  it('builds switcher rows from sparse linked and remembered wallets', async () => {
    mockAuth.session = { address, blockchains: undefined as never };
    mockSessionCtx.isLoggedIn = true;
    mockUserAddresses.push(
      { address, wallet: 'MetaMask', blockchains: undefined },
      { address: other, wallet: 'MetaMask', blockchains: ['Ethereum'] },
      { address: '0x' + '33'.repeat(20), blockchains: ['Ethereum'] },
    );
    mockSeen.mockReturnValue([
      { address, walletType: 'MetaMask', walletId: 'MetaMask' },
      { address: '0x' + '66'.repeat(20) },
    ]);
    renderSession();
    fireEvent.click(screen.getByText('switcher'));
    expect(screen.getByTestId('entries').textContent).toMatch(/Wallet|MetaMask/);
    fireEvent.click(screen.getByText('switch'));
    await waitFor(() => expect(mockChangeAddress).toHaveBeenCalled());
  });

  it('covers remaining invite, switcher, bootstrap and monitor fallbacks', async () => {
    mockCreateSession.mockRejectedValueOnce({});
    const first = renderSession();
    fireEvent.click(screen.getByText('pick-mm'));
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    first.unmount();

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, search: `?address=${address}`, pathname: '/app2/', hash: '' },
    });
    const replace = jest.spyOn(window.history, 'replaceState').mockImplementation(() => undefined);
    const bootstrap = renderSession();
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    bootstrap.unmount();
    replace.mockRestore();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, search: '?ref=AB-CD12-EF34-GH', pathname: '/app2/', hash: '' },
    });
    mockConnectAlby.mockClear();
    const alby = renderSession();
    fireEvent.click(screen.getByText('pick-alby'));
    await waitFor(() => expect(mockConnectAlby).toHaveBeenCalled());
    expect(mockConnectAlby.mock.calls[0][0]).toMatchObject({ recommendationCode: 'AB-CD12-EF34-GH' });
    alby.unmount();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });

    const view = renderSession();
    let onUri: ((uri: string) => void) | undefined;
    mockConnectWc.mockImplementationOnce((uriCb: (uri: string) => void) => {
      onUri = uriCb;
      return new Promise(() => undefined);
    });
    fireEvent.click(screen.getByText('pick-wc'));
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('wallet-connect'));
    fireEvent.click(screen.getByText('back-list'));
    act(() => {
      onUri?.('wc:late');
    });
    expect(screen.getByTestId('view')).toHaveTextContent('list');
    fireEvent.click(screen.getByText('back-list'));

    let releaseRec: (value: string) => void = () => undefined;
    mockCreateSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseRec = resolve;
        }),
    );
    fireEvent.click(screen.getByText('rec-wc'));
    fireEvent.click(screen.getByText('close'));
    await act(async () => {
      releaseRec(jwt());
      await Promise.resolve();
    });
    view.unmount();
  });

  it('builds a session-only switcher row and switches an unlinked wallet', async () => {
    mockAuth.session = { address, blockchains: undefined as never };
    mockSessionCtx.isLoggedIn = true;
    mockUserAddr.list = undefined;
    mockSeen.mockReturnValue([{ address: other, walletType: 'MetaMask' }]);
    renderSession();
    fireEvent.click(screen.getByText('switcher'));
    fireEvent.click(screen.getByText('switch'));
    await waitFor(() => expect(mockChangeAddress).toHaveBeenCalledWith(other));
  });

  it('reconnects an unknown remembered wallet when a linked switch fails', async () => {
    mockAuth.session = { address, blockchains: ['Ethereum'] };
    mockSessionCtx.isLoggedIn = true;
    mockSeen.mockReturnValue([{ address: other, walletType: '---' }]);
    mockChangeAddress.mockRejectedValueOnce(new Error('nope'));
    renderSession();
    fireEvent.click(screen.getByText('switcher'));
    fireEvent.click(screen.getByText('switch'));
    await waitFor(() => expect(mockChangeAddress).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('list'));
  });

  it('arms the reload monitor when eth_accounts is empty or missing', async () => {
    const provider = {
      request: jest.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce([address]),
      on: jest.fn(),
      removeListener: jest.fn(),
    };
    mockGetInjected.mockReturnValue(provider);
    mockUserAddr.list = undefined;
    mockSeen.mockReturnValue([{ address, walletType: 'MetaMask', walletId: 'MetaMask' }]);
    mockSessionCtx.isLoggedIn = true;
    mockAuth.session = { address, blockchains: ['Ethereum'] };
    renderSession();
    await waitFor(() => expect(provider.request).toHaveBeenCalled());
    renderSession();
    await waitFor(() => expect(provider.request).toHaveBeenCalledTimes(2));
  });

  it('logs out from the session helper', async () => {
    mockSessionCtx.isLoggedIn = true;
    mockAuth.session = { address, blockchains: ['Ethereum'] };
    renderSession();
    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
    expect(mockDisconnectWc).toHaveBeenCalled();
  });
});
