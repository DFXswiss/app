const mockIsJwt = jest.fn();
const mockUpdateSession = jest.fn();
const mockGetSignMessage = jest.fn();
const mockLogout = jest.fn();
const mockAuthenticate = jest.fn();
const mockAddSpecialCode = jest.fn();
const mockReloadUser = jest.fn();
const mockWalletGet = jest.fn();
const mockWalletSet = jest.fn();
const mockWalletRemove = jest.fn();
const mockReadBalances = jest.fn();
const mockNavigate = jest.fn();
const mockBrowserLang = jest.fn();
const mockJwtDecode = jest.fn();
const mockOnSignMessage = jest.fn();

const mockSession = {
  isInitialized: false,
  isLoggedIn: false,
};

const mockSessionContext = {
  get isInitialized() {
    return mockSession.isInitialized;
  },
  get isLoggedIn() {
    return mockSession.isLoggedIn;
  },
  logout: (...args: unknown[]) => mockLogout(...args),
  authenticate: (...args: unknown[]) => mockAuthenticate(...args),
};

const mockParams = {
  isInitialized: false,
  current: {} as Record<string, string | undefined>,
};

let mockDetectedWallet: string | undefined;

jest.mock('@dfx.swiss/react/dist/definitions/auth', () => ({
  AuthWalletType: {
    METAMASK: 'MetaMask',
    ALBY: 'Alby',
    LEDGER: 'Ledger',
    BIT_BOX: 'BitBox',
    TREZOR: 'Trezor',
    CLI: 'Cli',
    DFX_TARO: 'DfxTaro',
    WALLET_CONNECT: 'WalletConnect',
    PHANTOM: 'Phantom',
    TRUST: 'Trust',
    TRON_LINK: 'TronLink',
    RABBY: 'Rabby',
    WALLET_BROWSER: 'WalletBrowser',
  },
}));

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {
    ARBITRUM: 'Arbitrum',
    ARKADE: 'Arkade',
    ARWEAVE: 'Arweave',
    BASE: 'Base',
    BINANCE_SMART_CHAIN: 'Bsc',
    BITCOIN: 'Bitcoin',
    CARDANO: 'Cardano',
    CITREA: 'Citrea',
    CITREA_TESTNET: 'CitreaTestnet',
    ETHEREUM: 'Ethereum',
    FIRO: 'Firo',
    GNOSIS: 'Gnosis',
    HAQQ: 'Haqq',
    INTERNET_COMPUTER: 'Icp',
    LIGHTNING: 'Lightning',
    MONERO: 'Monero',
    OPTIMISM: 'Optimism',
    POLYGON: 'Polygon',
    SEPOLIA: 'Sepolia',
    SOLANA: 'Solana',
    SPARK: 'Spark',
    TRON: 'Tron',
    ZANO: 'Zano',
  },
  Utils: {
    isJwt: (...args: unknown[]) => mockIsJwt(...args),
  },
  useApiSession: () => ({ updateSession: mockUpdateSession }),
  useAuth: () => ({ getSignMessage: mockGetSignMessage }),
  useSessionContext: () => mockSessionContext,
  useUserContext: () => ({
    addSpecialCode: mockAddSpecialCode,
    reloadUser: mockReloadUser,
  }),
}));

jest.mock('browser-lang', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockBrowserLang(...args),
}));

jest.mock('jwt-decode', () => ({
  jwtDecode: (...args: unknown[]) => mockJwtDecode(...args),
}));

jest.mock('../hooks/store.hook', () => ({
  useStore: () => ({
    activeWallet: {
      get: () => mockWalletGet(),
      set: (...args: unknown[]) => mockWalletSet(...args),
      remove: () => mockWalletRemove(),
    },
  }),
}));

jest.mock('../hooks/wallets/metamask.hook', () => ({
  WalletType: { META_MASK: 'MetaMask', RABBY: 'Rabby', IN_APP_BROWSER: 'InAppBrowser' },
  useMetaMask: () => ({
    getWalletType: () => mockDetectedWallet,
  }),
}));

jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({
    isInitialized: mockParams.isInitialized,
    params: mockParams.current,
  }),
}));

jest.mock('../contexts/balance.context', () => ({
  useBalanceContext: () => ({
    readBalances: (...args: unknown[]) => mockReadBalances(...args),
  }),
}));

import { Blockchain } from '@dfx.swiss/react';
import { AuthWalletType } from '@dfx.swiss/react/dist/definitions/auth';
import { Router } from '@remix-run/router';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import {
  supportsBlockchain,
  useWalletContext,
  WalletBlockchains,
  WalletContextProvider,
  WalletType,
} from '../contexts/wallet.context';

let ctx: ReturnType<typeof useWalletContext>;

function Probe() {
  ctx = useWalletContext();
  return null;
}

function provider() {
  return (
    <WalletContextProvider router={{ navigate: mockNavigate } as unknown as Router}>
      <Probe />
    </WalletContextProvider>
  );
}

async function renderProvider() {
  let view: ReturnType<typeof render> | undefined;
  await act(async () => {
    view = render(provider());
  });
  return view as ReturnType<typeof render>;
}

async function rerenderProvider(view: ReturnType<typeof render>) {
  await act(async () => {
    view.rerender(provider());
  });
}

describe('supportsBlockchain', () => {
  it('is true when the wallet has no chain list', () => {
    expect(WalletBlockchains[WalletType.PASSKEY]).toBeUndefined();
    expect(supportsBlockchain(WalletType.PASSKEY, Blockchain.ETHEREUM)).toBe(true);
    expect(supportsBlockchain(WalletType.MAIL, Blockchain.BITCOIN)).toBe(true);
  });

  it('follows the wallet chain list when one exists', () => {
    expect(supportsBlockchain(WalletType.META_MASK, Blockchain.ETHEREUM)).toBe(true);
    expect(supportsBlockchain(WalletType.META_MASK, Blockchain.BITCOIN)).toBe(false);
  });
});

describe('useWalletContext', () => {
  it('returns the default outside a provider', () => {
    const { result } = renderHook(() => useWalletContext());
    expect(result.current).toBeUndefined();
  });
});

describe('WalletContextProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.isInitialized = false;
    mockSession.isLoggedIn = false;
    mockParams.isInitialized = false;
    mockParams.current = {};
    mockDetectedWallet = undefined;
    mockWalletGet.mockReturnValue(undefined);
    mockIsJwt.mockReturnValue(false);
    mockJwtDecode.mockReturnValue({});
    mockGetSignMessage.mockResolvedValue('sign-message');
    mockAuthenticate.mockResolvedValue(undefined);
    mockAddSpecialCode.mockResolvedValue(undefined);
    mockBrowserLang.mockReturnValue('en');
    mockOnSignMessage.mockResolvedValue('signature');
  });

  it('reads a stored active wallet on mount', async () => {
    mockWalletGet.mockReturnValue(WalletType.ALBY);
    await renderProvider();
    expect(ctx.activeWallet).toBe(WalletType.ALBY);
    expect(ctx.login).toEqual(expect.any(Function));
  });

  it('short-circuits isInitialized on each operand', async () => {
    mockSession.isInitialized = true;
    mockSession.isLoggedIn = true;
    mockParams.isInitialized = false;
    const view = await renderProvider();
    expect(ctx.isInitialized).toBe(false);

    mockParams.isInitialized = true;
    mockParams.current = {};
    await rerenderProvider(view);
    await waitFor(() => expect(ctx.isInitialized).toBe(true));

    mockSession.isInitialized = false;
    await rerenderProvider(view);
    expect(ctx.isInitialized).toBe(false);

    mockSession.isInitialized = true;
    mockParams.isInitialized = false;
    await rerenderProvider(view);
    expect(ctx.isInitialized).toBe(false);

    mockParams.isInitialized = true;
    await rerenderProvider(view);
    await waitFor(() => expect(ctx.isInitialized).toBe(true));
  });

  it('runs neither session-effect block while the session is uninitialized', async () => {
    mockSession.isInitialized = false;
    mockSession.isLoggedIn = false;
    mockParams.isInitialized = false;
    await renderProvider();
    expect(mockWalletRemove).not.toHaveBeenCalled();
    expect(mockReadBalances).not.toHaveBeenCalled();
    expect(mockAddSpecialCode).not.toHaveBeenCalled();
  });

  it('skips the logout block when the session is initialized and the user is logged in', async () => {
    mockSession.isInitialized = true;
    mockSession.isLoggedIn = true;
    mockParams.isInitialized = false;
    await renderProvider();
    expect(mockWalletRemove).not.toHaveBeenCalled();
    expect(mockReadBalances).not.toHaveBeenCalled();
  });

  it('clears the wallet on logout and reads balances once initialized', async () => {
    mockSession.isInitialized = true;
    mockSession.isLoggedIn = false;
    mockParams.isInitialized = false;
    const view = await renderProvider();
    expect(mockWalletRemove).toHaveBeenCalled();
    expect(mockReadBalances).not.toHaveBeenCalled();

    mockParams.isInitialized = true;
    mockParams.current = {};
    await rerenderProvider(view);
    await waitFor(() => expect(mockReadBalances).toHaveBeenCalledWith(undefined));
  });

  it('adds a special code only when set and swallows a rejection', async () => {
    mockSession.isInitialized = true;
    mockSession.isLoggedIn = true;
    mockParams.isInitialized = true;
    mockParams.current = {};
    const view = await renderProvider();
    await waitFor(() => expect(ctx.isInitialized).toBe(true));
    expect(mockAddSpecialCode).not.toHaveBeenCalled();

    mockParams.current.specialCode = 'SPECIAL';
    mockSession.isInitialized = false;
    await rerenderProvider(view);

    mockAddSpecialCode.mockResolvedValueOnce(undefined);
    mockSession.isInitialized = true;
    await rerenderProvider(view);
    await waitFor(() => expect(mockAddSpecialCode).toHaveBeenCalledWith('SPECIAL'));

    mockAddSpecialCode.mockClear();
    mockAddSpecialCode.mockRejectedValueOnce(new Error('special failed'));
    mockSession.isInitialized = false;
    await rerenderProvider(view);
    mockSession.isInitialized = true;
    await rerenderProvider(view);
    await waitFor(() => expect(mockAddSpecialCode).toHaveBeenCalledWith('SPECIAL'));
    await act(async () => {
      await Promise.resolve();
    });
  });

  it('creates a session from address and signature, then skips the same pair', async () => {
    mockSession.isInitialized = true;
    mockSession.isLoggedIn = true;
    mockParams.isInitialized = true;
    mockParams.current = {
      address: 'addr-a',
      signature: 'sig-1',
      type: WalletType.ALBY,
      redirect: '/home',
    };

    const view = await renderProvider();
    await waitFor(() => expect(mockAuthenticate).toHaveBeenCalledTimes(1));
    expect(mockWalletSet).toHaveBeenCalledWith(WalletType.ALBY);
    expect(mockNavigate).toHaveBeenCalledWith('/home');
    expect(mockAuthenticate.mock.calls[0][6]).toBeUndefined();

    mockAuthenticate.mockClear();
    mockNavigate.mockClear();
    mockParams.current = { address: 'addr-a', signature: 'sig-1' };
    await rerenderProvider(view);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockAuthenticate).not.toHaveBeenCalled();

    mockParams.current = { address: 'addr-a', signature: 'sig-2' };
    await rerenderProvider(view);
    await waitFor(() => expect(mockAuthenticate).toHaveBeenCalledTimes(1));

    mockAuthenticate.mockClear();
    mockParams.current = { address: 'addr-b', signature: 'sig-2' };
    await rerenderProvider(view);
    await waitFor(() => expect(mockAuthenticate).toHaveBeenCalledTimes(1));
  });

  it('does not authenticate with only an address or only a signature', async () => {
    mockSession.isInitialized = true;
    mockSession.isLoggedIn = true;
    mockParams.isInitialized = true;
    mockParams.current = { address: 'addr-only' };
    const view = await renderProvider();
    await waitFor(() => expect(ctx.isInitialized).toBe(true));
    expect(mockAuthenticate).not.toHaveBeenCalled();

    mockParams.current = { signature: 'sig-only' };
    await rerenderProvider(view);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockAuthenticate).not.toHaveBeenCalled();
  });

  it('resets credentials when authenticate rejects so the same pair can retry', async () => {
    mockSession.isInitialized = true;
    mockSession.isLoggedIn = true;
    mockParams.isInitialized = true;
    mockAuthenticate.mockRejectedValueOnce(new Error('auth failed'));
    mockParams.current = { address: 'addr-fail', signature: 'sig-fail' };

    const view = await renderProvider();
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
    expect(mockAuthenticate).toHaveBeenCalledTimes(1);

    mockAuthenticate.mockResolvedValue(undefined);
    mockAuthenticate.mockClear();
    mockLogout.mockClear();
    mockParams.current = { address: 'addr-fail', signature: 'sig-fail' };
    await rerenderProvider(view);
    await waitFor(() => expect(mockAuthenticate).toHaveBeenCalledTimes(1));
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('logs out when the session is not a JWT', async () => {
    mockSession.isInitialized = true;
    mockSession.isLoggedIn = true;
    mockParams.isInitialized = true;
    mockIsJwt.mockReturnValue(false);
    mockParams.current = { session: 'not-jwt' };
    await renderProvider();
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });

  it('logs out when the JWT has no numeric customer identity', async () => {
    mockSession.isInitialized = true;
    mockSession.isLoggedIn = true;
    mockParams.isInitialized = true;
    mockIsJwt.mockReturnValue(true);

    mockJwtDecode.mockReturnValueOnce({});
    mockParams.current = { session: 'jwt-missing-account' };
    const view = await renderProvider();
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
    expect(mockUpdateSession).not.toHaveBeenCalled();

    mockLogout.mockClear();
    mockJwtDecode.mockReturnValueOnce({ account: '12' });
    mockParams.current = { session: 'jwt-string-account' };
    await rerenderProvider(view);
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });

  it('applies a JWT session once and navigates only when redirect is set', async () => {
    mockSession.isInitialized = true;
    mockSession.isLoggedIn = true;
    mockParams.isInitialized = true;
    mockIsJwt.mockReturnValue(true);
    mockJwtDecode.mockReturnValue({ account: 42 });
    mockParams.current = { session: 'jwt-valid' };

    const view = await renderProvider();
    await waitFor(() => expect(mockUpdateSession).toHaveBeenCalledWith('jwt-valid'));
    expect(mockNavigate).not.toHaveBeenCalled();

    mockUpdateSession.mockClear();
    mockParams.current = { session: 'jwt-valid-2', redirect: '/go' };
    await rerenderProvider(view);
    await waitFor(() => expect(mockUpdateSession).toHaveBeenCalledWith('jwt-valid-2'));
    expect(mockNavigate).toHaveBeenCalledWith('/go');

    mockUpdateSession.mockClear();
    mockNavigate.mockClear();
    mockParams.current = { session: 'jwt-valid-2', redirect: '/go' };
    await rerenderProvider(view);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockUpdateSession).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('returns no session when params have neither credentials nor a session', async () => {
    mockSession.isInitialized = true;
    mockSession.isLoggedIn = true;
    mockParams.isInitialized = true;
    mockParams.current = {};
    await renderProvider();
    await waitFor(() => expect(ctx.isInitialized).toBe(true));
    expect(mockAuthenticate).not.toHaveBeenCalled();
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });

  it('logs in with Alby without taking the MetaMask branch', async () => {
    mockSession.isInitialized = true;
    mockSession.isLoggedIn = true;
    mockParams.isInitialized = false;
    await renderProvider();

    await act(async () => {
      await ctx.login(WalletType.ALBY, 'ln-addr', Blockchain.LIGHTNING, mockOnSignMessage);
    });

    expect(mockGetSignMessage).toHaveBeenCalledWith('ln-addr');
    expect(mockOnSignMessage).toHaveBeenCalledWith('ln-addr', 'sign-message');
    expect(mockWalletSet).toHaveBeenCalledWith(WalletType.ALBY);
    expect(ctx.blockchain).toBe(Blockchain.LIGHTNING);
    expect(mockReloadUser).toHaveBeenCalled();
    expect(mockAuthenticate.mock.calls[0][6]).toBe(AuthWalletType.ALBY);
  });

  it('logs out and rethrows when login fails', async () => {
    mockSession.isInitialized = true;
    mockSession.isLoggedIn = true;
    mockParams.isInitialized = false;
    mockGetSignMessage.mockRejectedValueOnce(new Error('sign fail'));
    await renderProvider();

    await act(async () => {
      await expect(ctx.login(WalletType.ALBY, 'ln-addr', Blockchain.LIGHTNING, mockOnSignMessage)).rejects.toThrow(
        'sign fail',
      );
    });

    expect(mockLogout).toHaveBeenCalled();
    expect(mockWalletRemove).toHaveBeenCalled();
    expect(mockReloadUser).not.toHaveBeenCalled();
    expect(ctx.blockchain).toBeUndefined();
  });

  it('maps each MetaMask detection, including an unmatched wallet', async () => {
    mockSession.isInitialized = true;
    mockSession.isLoggedIn = true;
    mockParams.isInitialized = false;
    await renderProvider();

    const cases: Array<{ detected: string | undefined; auth: AuthWalletType }> = [
      { detected: 'MetaMask', auth: AuthWalletType.METAMASK },
      { detected: 'Rabby', auth: AuthWalletType.RABBY },
      { detected: 'InAppBrowser', auth: AuthWalletType.WALLET_BROWSER },
    ];

    for (const { detected, auth } of cases) {
      mockDetectedWallet = detected;
      mockAuthenticate.mockClear();
      await act(async () => {
        await ctx.login(WalletType.META_MASK, '0x1', Blockchain.ETHEREUM, mockOnSignMessage);
      });
      expect(mockAuthenticate.mock.calls[0][6]).toBe(auth);
    }

    mockDetectedWallet = undefined;
    mockAuthenticate.mockClear();
    await act(async () => {
      await ctx.login(WalletType.META_MASK, '0x1', Blockchain.ETHEREUM, mockOnSignMessage);
    });
    expect(mockAuthenticate.mock.calls[0][6]).toBe(AuthWalletType.METAMASK);
  });

  it('uppercases a browser language and keeps undefined when browser-lang has no value', async () => {
    mockSession.isInitialized = true;
    mockSession.isLoggedIn = true;
    mockParams.isInitialized = false;
    await renderProvider();

    mockBrowserLang.mockReturnValue('de');
    await act(async () => {
      await ctx.login(WalletType.ALBY, 'ln-addr', Blockchain.LIGHTNING, mockOnSignMessage);
    });
    expect(mockAuthenticate.mock.calls[0][8]).toBe('DE');

    mockAuthenticate.mockClear();
    mockBrowserLang.mockReturnValue(undefined);
    await act(async () => {
      await ctx.login(WalletType.ALBY, 'ln-addr', Blockchain.LIGHTNING, mockOnSignMessage);
    });
    expect(mockAuthenticate.mock.calls[0][8]).toBeUndefined();
  });

  it('setSession stores a wallet or removes it when the type is missing', async () => {
    mockSession.isInitialized = true;
    mockSession.isLoggedIn = true;
    mockParams.isInitialized = false;
    await renderProvider();

    await act(async () => {
      await ctx.setSession('sess', WalletType.ALBY, Blockchain.ETHEREUM);
    });
    expect(mockUpdateSession).toHaveBeenCalledWith('sess');
    expect(mockWalletSet).toHaveBeenCalledWith(WalletType.ALBY);
    expect(ctx.blockchain).toBe(Blockchain.ETHEREUM);

    mockWalletRemove.mockClear();
    await act(async () => {
      await ctx.setSession('sess-2');
    });
    expect(mockWalletRemove).toHaveBeenCalled();
  });

  it('switchBlockchain writes the active chain', async () => {
    mockSession.isInitialized = true;
    mockSession.isLoggedIn = true;
    mockParams.isInitialized = false;
    await renderProvider();

    await act(async () => {
      ctx.switchBlockchain(Blockchain.ETHEREUM);
    });
    expect(ctx.blockchain).toBe(Blockchain.ETHEREUM);
  });

  it('setWallet writes or removes the stored wallet', async () => {
    mockSession.isInitialized = true;
    mockSession.isLoggedIn = true;
    mockParams.isInitialized = false;
    await renderProvider();

    await act(async () => {
      ctx.setWallet(WalletType.MAIL);
    });
    expect(mockWalletSet).toHaveBeenCalledWith(WalletType.MAIL);
    expect(ctx.activeWallet).toBe(WalletType.MAIL);

    await act(async () => {
      ctx.setWallet();
    });
    expect(mockWalletRemove).toHaveBeenCalled();
    expect(ctx.activeWallet).toBeUndefined();
  });
});
