const mockCreateSession = jest.fn();
const mockGetSignMessage = jest.fn();
const mockLogout = jest.fn();
const mockChangeAddress = jest.fn();
const mockReloadUser = jest.fn();
const mockConnectInjected = jest.fn();
const mockSignInjected = jest.fn();
const mockResolveInjected = jest.fn();
const mockConnectAlby = jest.fn();
const mockConnectCardano = jest.fn();
const mockConnectChain = jest.fn();
const mockConnectHw = jest.fn();
const mockIsUserRejection = jest.fn(() => false);
const mockAuth: { session?: { address?: string; blockchains?: string[] } } = {};
const mockSessionCtx = { isLoggedIn: false, logout: mockLogout };

jest.mock('@dfx.swiss/react', () => ({
  AuthWalletType: {
    METAMASK: 'MetaMask',
    WALLET_BROWSER: 'WalletBrowser',
    RABBY: 'Rabby',
    WALLET_CONNECT: 'WalletConnect',
    BIT_BOX: 'BitBox',
    LEDGER: 'Ledger',
    TREZOR: 'Trezor',
    ALBY: 'Alby',
    PHANTOM: 'Phantom',
    TRUST: 'Trust',
    TRON_LINK: 'TronLink',
    CLI: 'CLI',
  },
  Blockchain: {
    ETHEREUM: 'Ethereum',
    ARBITRUM: 'Arbitrum',
    BITCOIN: 'Bitcoin',
    LIGHTNING: 'Lightning',
    SOLANA: 'Solana',
    TRON: 'Tron',
    CARDANO: 'Cardano',
  },
  useApi: () => ({ defaultUrl: 'https://api.dfx.swiss/v1' }),
  useApiSession: () => ({ createSessionNew: mockCreateSession, updateSession: jest.fn() }),
  useAuth: () => ({ getSignMessage: mockGetSignMessage }),
  useAuthContext: () => ({ session: mockAuth.session }),
  useSessionContext: () => mockSessionCtx,
  useUserContext: () => ({
    userAddresses: [],
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
  connectWalletConnect: jest.fn(),
  createCancelToken: jest.fn(() => ({ cancel: jest.fn(), promise: new Promise(() => undefined) })),
  disconnectWalletConnect: jest.fn().mockResolvedValue(undefined),
  getInjectedProvider: jest.fn(),
  isUserRejection: (...args: unknown[]) => mockIsUserRejection(...args),
  signWithWalletConnect: jest.fn(),
}));

jest.mock('../wallets/alby', () => ({ connectAlby: (...args: unknown[]) => mockConnectAlby(...args) }));
jest.mock('../wallets/cardano', () => ({ connectCardano: (...args: unknown[]) => mockConnectCardano(...args) }));
jest.mock('../wallets/chain-providers', () => ({
  connectChainWallet: (...args: unknown[]) => mockConnectChain(...args),
}));
jest.mock('../wallets/hardware-providers', () => ({
  connectHardware: (...args: unknown[]) => mockConnectHw(...args),
  isWebHidAvailable: () => true,
}));
jest.mock('../wallets/cli', () => ({ isPlausibleCliAddress: () => true }));
jest.mock('../wallets/seen', () => ({ rememberWallet: jest.fn(), seenWallets: () => [] }));
jest.mock('../assets/brand/dfx-mark.svg', () => 'dfx-mark.svg');
jest.mock('../assets/wallets/pecunity.png', () => 'pecunity.png');
jest.mock('../assets/wallets/realunit.svg', () => 'realunit.svg');
jest.mock('../assets/wallets/urble.webp', () => 'urble.webp');

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthWalletType } from '@dfx.swiss/react';
import { LanguageProvider } from '../i18n';
import { ToastProvider } from '../components/ui';
import { useWalletSession, WalletSessionProvider } from '../wallets/session';
import type { WalletCatalogEntry } from '../wallets/catalog';

const metamask: WalletCatalogEntry = {
  id: 'MetaMask',
  name: 'MetaMask',
  icon: 'mm.svg',
  connector: 'injected',
  walletType: AuthWalletType.METAMASK,
  injected: { flavor: 'isMetaMask' },
  evm: true,
} as WalletCatalogEntry;

const ledger: WalletCatalogEntry = {
  id: 'Ledger',
  name: 'Ledger',
  icon: 'led.svg',
  connector: 'ledger',
  walletType: AuthWalletType.LEDGER,
} as WalletCatalogEntry;

const cli: WalletCatalogEntry = {
  id: 'CLI',
  name: 'CLI',
  icon: 'cli.svg',
  connector: 'cli',
  walletType: AuthWalletType.CLI,
} as WalletCatalogEntry;

const phantom: WalletCatalogEntry = {
  id: 'Phantom',
  name: 'Phantom',
  icon: 'ph.svg',
  connector: 'solana',
  walletType: AuthWalletType.PHANTOM,
} as WalletCatalogEntry;

const nami: WalletCatalogEntry = {
  id: 'Nami',
  name: 'Nami',
  icon: 'nami.svg',
  connector: 'cardano',
  walletType: AuthWalletType.CLI,
} as WalletCatalogEntry;

const alby: WalletCatalogEntry = {
  id: 'Alby',
  name: 'Alby',
  icon: 'alby.svg',
  connector: 'alby',
  walletType: AuthWalletType.ALBY,
} as WalletCatalogEntry;

const comingSoon: WalletCatalogEntry = {
  id: 'Soon',
  name: 'Soon',
  icon: 'soon.svg',
  connector: 'soon',
} as WalletCatalogEntry;

function jwt(blockchains = ['Ethereum']): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, blockchains }))
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
      <span data-testid="sheet">{String(session.connectSheet.open)}</span>
      <button type="button" onClick={() => session.openConnect()}>
        open
      </button>
      <button type="button" onClick={() => session.closeConnect()}>
        close
      </button>
      <button type="button" onClick={() => session.openSwitcher()}>
        switcher
      </button>
      <button type="button" onClick={() => void session.logout()}>
        logout
      </button>
      <button type="button" onClick={() => void session.connectSheet.onSelectWallet(metamask)}>
        pick-mm
      </button>
      <button type="button" onClick={() => void session.connectSheet.onSelectWallet(ledger)}>
        pick-led
      </button>
      <button type="button" onClick={() => void session.connectSheet.onSelectWallet(cli)}>
        pick-cli
      </button>
      <button
        type="button"
        onClick={() =>
          void session.connectSheet.onSelectHwChain(ledger, 'btc')
        }
      >
        hw-btc
      </button>
      <button type="button" onClick={() => void session.connectSheet.onSelectWallet(phantom)}>
        pick-ph
      </button>
      <button type="button" onClick={() => void session.connectSheet.onSelectWallet(nami)}>
        pick-nami
      </button>
      <button type="button" onClick={() => void session.connectSheet.onSelectWallet(alby)}>
        pick-alby
      </button>
      <button type="button" onClick={() => void session.connectSheet.onSelectWallet(comingSoon)}>
        pick-soon
      </button>
      <button
        type="button"
        onClick={() =>
          void session.connectSheet.onCliConnect(cli, address, '0xsig')
        }
      >
        cli-ok
      </button>
      <button type="button" onClick={() => session.connectSheet.onBackToList()}>
        back-list
      </button>
      <button
        type="button"
        onClick={() =>
          void session.connectSheet.onSubmitRecommendation(
            { address, signature: '0xsig', connector: 'injected', walletType: AuthWalletType.METAMASK },
            'XY-AB12-CD34-EF',
          )
        }
      >
        rec-ok
      </button>
      <button
        type="button"
        onClick={() => {
          void session.connectSheet.requestSignMessage(address).then(
            (msg) => {
              (document.getElementById('msg') as HTMLElement).textContent = msg;
            },
            (err: Error) => {
              (document.getElementById('msg') as HTMLElement).textContent = err.message;
            },
          );
        }}
      >
        req-msg
      </button>
      <span id="msg" />
    </div>
  );
}

const address = '0x' + '11'.repeat(20);

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

describe('WalletSessionProvider', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionCtx.isLoggedIn = false;
    mockAuth.session = undefined;
    mockLogout.mockResolvedValue(undefined);
    mockCreateSession.mockResolvedValue(jwt());
    mockGetSignMessage.mockResolvedValue(`by_signing_this_message ${address} dfx.swiss`);
    mockResolveInjected.mockReturnValue({ request: jest.fn(), on: jest.fn(), removeListener: jest.fn() });
    mockConnectInjected.mockResolvedValue(address);
    mockSignInjected.mockResolvedValue('0xsig');
    mockConnectAlby.mockResolvedValue({ kind: 'session', session: { address } });
    mockConnectCardano.mockResolvedValue({ address, sign: jest.fn().mockResolvedValue({ signature: 's', key: 'k' }) });
    mockConnectChain.mockResolvedValue({ address, sign: jest.fn().mockResolvedValue('sig') });
    jest.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    (window.open as jest.Mock).mockRestore();
  });

  it('throws outside the provider', () => {
    expect(() => render(<Probe />)).toThrow('useWalletSession must be used within WalletSessionProvider');
  });

  it('opens, closes, logs out and routes hardware / CLI picks', async () => {
    renderSession();
    expect(screen.getByTestId('in')).toHaveTextContent('false');
    fireEvent.click(screen.getByText('open'));
    expect(screen.getByTestId('sheet')).toHaveTextContent('true');
    fireEvent.click(screen.getByText('close'));
    expect(screen.getByTestId('sheet')).toHaveTextContent('false');

    fireEvent.click(screen.getByText('pick-led'));
    expect(screen.getByTestId('view')).toHaveTextContent('hw-chain');
    fireEvent.click(screen.getByText('pick-cli'));
    expect(screen.getByTestId('view')).toHaveTextContent('cli');

    mockSessionCtx.isLoggedIn = true;
    fireEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
  });

  it('connects an injected wallet and signs in', async () => {
    renderSession();
    fireEvent.click(screen.getByText('pick-mm'));
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    expect(mockConnectInjected).toHaveBeenCalled();
    expect(mockSignInjected).toHaveBeenCalled();
  });

  it('toasts when MetaMask is missing and opens the install page', async () => {
    mockResolveInjected.mockReturnValue(undefined);
    renderSession();
    fireEvent.click(screen.getByText('pick-mm'));
    await waitFor(() => expect(window.open).toHaveBeenCalled());
    expect(screen.getByTestId('view')).toHaveTextContent('list');
  });

  it('opens the recommendation gate when the API asks for a code', async () => {
    mockCreateSession.mockRejectedValueOnce({ message: 'RecommendationRequired' });
    renderSession();
    fireEvent.click(screen.getByText('pick-mm'));
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('recommend'));
  });

  it('connects hardware after a chain pick', async () => {
    mockConnectHw.mockResolvedValue({
      address,
      sign: jest.fn().mockResolvedValue('hw-sig'),
    });
    renderSession();
    fireEvent.click(screen.getByText('hw-btc'));
    await waitFor(() => expect(mockConnectHw).toHaveBeenCalled());
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
  });

  it('connects Phantom, Nami and Alby and ignores a soon tile', async () => {
    renderSession();
    fireEvent.click(screen.getByText('pick-soon'));
    expect(screen.getByTestId('view')).toHaveTextContent('list');

    fireEvent.click(screen.getByText('pick-ph'));
    await waitFor(() => expect(mockConnectChain).toHaveBeenCalled());
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());

    mockCreateSession.mockClear();
    fireEvent.click(screen.getByText('pick-nami'));
    await waitFor(() => expect(mockConnectCardano).toHaveBeenCalled());
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());

    mockCreateSession.mockClear();
    mockConnectAlby.mockResolvedValueOnce({
      kind: 'session',
      session: { address, sign: jest.fn().mockResolvedValue('ln-sig') },
    });
    fireEvent.click(screen.getByText('pick-alby'));
    await waitFor(() => expect(mockConnectAlby).toHaveBeenCalled());
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
  });

  it('stops on an Alby OAuth redirect without signing in', async () => {
    mockConnectAlby.mockResolvedValueOnce({ kind: 'redirected' });
    renderSession();
    fireEvent.click(screen.getByText('pick-alby'));
    await waitFor(() => expect(mockConnectAlby).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('refuses to sign an unexpected auth message', async () => {
    mockGetSignMessage.mockResolvedValue('totally-unrelated');
    renderSession();
    fireEvent.click(screen.getByText('pick-mm'));
    await waitFor(() => expect(mockGetSignMessage).toHaveBeenCalled());
    expect(mockSignInjected).not.toHaveBeenCalled();
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('toasts a connector error and a user rejection', async () => {
    const { WalletConnectorError } = jest.requireMock('../wallets/providers') as {
      WalletConnectorError: new (message: string, reason: string) => Error;
    };
    mockConnectInjected.mockRejectedValueOnce(new WalletConnectorError('nope', 'failed'));
    renderSession();
    fireEvent.click(screen.getByText('pick-mm'));
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('list'));

    mockIsUserRejection.mockReturnValueOnce(true);
    mockConnectInjected.mockRejectedValueOnce(new Error('user rejected'));
    fireEvent.click(screen.getByText('pick-mm'));
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('list'));
  });

  it('submits a CLI signature and returns to the wallet list', async () => {
    renderSession();
    fireEvent.click(screen.getByText('cli-ok'));
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    fireEvent.click(screen.getByText('back-list'));
    expect(screen.getByTestId('view')).toHaveTextContent('list');
  });

  it('submits a recommendation code and fetches a CLI sign message', async () => {
    renderSession();
    fireEvent.click(screen.getByText('rec-ok'));
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());

    fireEvent.click(screen.getByText('req-msg'));
    await waitFor(() => expect(screen.getByText(`by_signing_this_message ${address} dfx.swiss`)).toBeInTheDocument());

    mockGetSignMessage.mockResolvedValueOnce('not-a-dfx-message');
    fireEvent.click(screen.getByText('req-msg'));
    await waitFor(() => expect(screen.getByText(/unexpected sign-in message/i)).toBeInTheDocument());
  });

  it('toasts a hardware connect failure', async () => {
    mockConnectHw.mockRejectedValueOnce(new Error('hid down'));
    renderSession();
    fireEvent.click(screen.getByText('hw-btc'));
    await waitFor(() => expect(mockConnectHw).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('list'));
  });
});
