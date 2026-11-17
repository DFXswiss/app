import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';

const mockNavigate = jest.fn();
const mockLogout = jest.fn();
const mockAuthenticate = jest.fn();
const mockUpdateSession = jest.fn();
const mockGetSignMessage = jest.fn();
const mockReadBalances = jest.fn();
const mockAddSpecialCode = jest.fn();
const mockReloadUser = jest.fn();
const mockGetWalletType = jest.fn();
const mockStoredWalletGet = jest.fn();
const mockStoredWalletSet = jest.fn();
const mockStoredWalletRemove = jest.fn();
const mockJwtDecode = jest.fn();
const mockBrowserLang = jest.fn();

let mockSessionInitialized = true;
let mockLoggedIn = false;
let mockParamsInitialized = true;
let mockAppParams: Record<string, string | undefined> = {};

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {
    BITCOIN: 'Bitcoin',
    LIGHTNING: 'Lightning',
    ETHEREUM: 'Ethereum',
    ARBITRUM: 'Arbitrum',
    OPTIMISM: 'Optimism',
    POLYGON: 'Polygon',
    BASE: 'Base',
    GNOSIS: 'Gnosis',
    HAQQ: 'Haqq',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
    CITREA: 'Citrea',
    CITREA_TESTNET: 'CitreaTestnet',
    SEPOLIA: 'Sepolia',
    SPARK: 'Spark',
    ARKADE: 'Arkade',
    FIRO: 'Firo',
    MONERO: 'Monero',
    ZANO: 'Zano',
    INTERNET_COMPUTER: 'InternetComputer',
    CARDANO: 'Cardano',
    ARWEAVE: 'Arweave',
    SOLANA: 'Solana',
    TRON: 'Tron',
  },
  Utils: {
    isJwt: (token: string) => token.startsWith('jwt.'),
  },
  useApiSession: () => ({ updateSession: mockUpdateSession }),
  useAuth: () => ({ getSignMessage: mockGetSignMessage }),
  useSessionContext: () => ({
    isInitialized: mockSessionInitialized,
    isLoggedIn: mockLoggedIn,
    logout: mockLogout,
    authenticate: mockAuthenticate,
  }),
  useUserContext: () => ({ addSpecialCode: mockAddSpecialCode, reloadUser: mockReloadUser }),
}));

jest.mock('@dfx.swiss/react/dist/definitions/auth', () => ({
  AuthWalletType: {
    METAMASK: 'MetaMask',
    RABBY: 'Rabby',
    WALLET_BROWSER: 'WalletBrowser',
    LEDGER: 'Ledger',
    BIT_BOX: 'BitBox',
    TREZOR: 'Trezor',
    CLI: 'Cli',
    DFX_TARO: 'DfxTaro',
    WALLET_CONNECT: 'WalletConnect',
    PHANTOM: 'Phantom',
    TRUST: 'Trust',
    TRON_LINK: 'TronLink',
  },
}));

jest.mock('browser-lang', () => ({ __esModule: true, default: (options: unknown) => mockBrowserLang(options) }));
jest.mock('jwt-decode', () => ({ jwtDecode: (token: string) => mockJwtDecode(token) }));

jest.mock('../hooks/store.hook', () => ({
  useStore: () => ({
    activeWallet: {
      get: () => mockStoredWalletGet(),
      set: mockStoredWalletSet,
      remove: mockStoredWalletRemove,
    },
  }),
}));

jest.mock('../hooks/wallets/metamask.hook', () => ({
  WalletType: { RABBY: 'Rabby', META_MASK: 'MetaMask', IN_APP_BROWSER: 'InAppBrowser' },
  useMetaMask: () => ({ getWalletType: () => mockGetWalletType() }),
}));

jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({ isInitialized: mockParamsInitialized, params: mockAppParams }),
}));

jest.mock('../contexts/balance.context', () => ({
  useBalanceContext: () => ({ readBalances: mockReadBalances }),
}));

import { Blockchain } from '@dfx.swiss/react';
import type { Router } from '@remix-run/router';
import { supportsBlockchain, useWalletContext, WalletContextProvider, WalletType } from '../contexts/wallet.context';

const router = { navigate: mockNavigate } as unknown as Router;

function wrapper({ children }: PropsWithChildren): JSX.Element {
  return <WalletContextProvider router={router}>{children}</WalletContextProvider>;
}

function renderWallet() {
  return renderHook(() => useWalletContext(), { wrapper });
}

async function ready() {
  const rendered = renderWallet();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return rendered;
}

function reset(): void {
  jest.clearAllMocks();
  mockSessionInitialized = true;
  mockLoggedIn = false;
  mockParamsInitialized = true;
  mockAppParams = {};
  mockStoredWalletGet.mockReturnValue(undefined);
  mockBrowserLang.mockReturnValue('en');
  mockAuthenticate.mockResolvedValue('session-token');
  mockGetSignMessage.mockResolvedValue('sign this');
  mockJwtDecode.mockReturnValue({ account: 7 });
  mockAddSpecialCode.mockResolvedValue(undefined);
}

beforeEach(reset);

describe('supportsBlockchain', () => {
  it('accepts any blockchain for a wallet without a restriction', () => {
    expect(supportsBlockchain(WalletType.MAIL, Blockchain.BITCOIN)).toBe(true);
    expect(supportsBlockchain(WalletType.ADDRESS, Blockchain.ETHEREUM)).toBe(true);
  });

  it('accepts a supported blockchain and rejects an unsupported one', () => {
    expect(supportsBlockchain(WalletType.LEDGER_BTC, Blockchain.BITCOIN)).toBe(true);
    expect(supportsBlockchain(WalletType.LEDGER_BTC, Blockchain.ETHEREUM)).toBe(false);
    expect(supportsBlockchain(WalletType.META_MASK, Blockchain.ETHEREUM)).toBe(true);
  });
});

describe('useWalletContext', () => {
  it('returns undefined outside the provider', () => {
    const { result } = renderHook(() => useWalletContext());
    expect(result.current).toBeUndefined();
  });
});

describe('WalletContextProvider initialisation', () => {
  it('keeps a stored wallet type that is still known', async () => {
    mockLoggedIn = true;
    mockStoredWalletGet.mockReturnValue('MetaMask');
    const { result } = await ready();

    expect(mockStoredWalletGet).toHaveBeenCalled();
    expect(result.current.activeWallet).toBe(WalletType.META_MASK);
    expect(result.current.isInitialized).toBe(true);
  });

  it('discards a stored wallet type that is no longer known', async () => {
    mockLoggedIn = true;
    mockStoredWalletGet.mockReturnValue('Alby');
    const { result } = await ready();

    expect(result.current.activeWallet).toBeUndefined();
    expect(result.current.isInitialized).toBe(true);
  });

  it('has no active wallet when nothing is stored', async () => {
    mockLoggedIn = true;
    mockStoredWalletGet.mockReturnValue(undefined);
    const { result } = await ready();

    expect(result.current.activeWallet).toBeUndefined();
  });

  it('clears the wallet and reads balances when the session is initialized and logged out', async () => {
    mockLoggedIn = false;
    const { result } = await ready();

    expect(mockStoredWalletRemove).toHaveBeenCalled();
    expect(mockReadBalances).toHaveBeenCalledWith(undefined);
    expect(result.current.activeWallet).toBeUndefined();
    expect(result.current.isInitialized).toBe(true);
  });

  it('does not clear the wallet before the session is initialized', async () => {
    mockSessionInitialized = false;
    const { result } = await ready();

    expect(mockStoredWalletRemove).not.toHaveBeenCalled();
    expect(mockReadBalances).not.toHaveBeenCalled();
    expect(result.current.isInitialized).toBe(false);
  });

  it('does not initialize while the app params are not initialized', async () => {
    mockParamsInitialized = false;
    const { result } = await ready();

    expect(mockAuthenticate).not.toHaveBeenCalled();
    expect(result.current.isInitialized).toBe(false);
  });

  it('adds the special code once the session and the app params are initialized', async () => {
    mockLoggedIn = true;
    mockAddSpecialCode.mockRejectedValue(new Error('special code failed'));
    mockAppParams = { specialCode: 'code' };
    await ready();

    await waitFor(() => expect(mockAddSpecialCode).toHaveBeenCalledWith('code'));
  });
});

describe('WalletContextProvider param sessions', () => {
  it('creates a session from address and signature, sets the wallet and follows the redirect', async () => {
    mockAppParams = {
      address: 'address',
      signature: 'signature',
      pubkey: 'pubkey',
      type: 'LedgerBtc',
      redirect: '/next',
      wallet: 'partner-wallet',
      refcode: 'ref',
      recommendationCode: 'recommendation',
    };
    mockBrowserLang.mockReturnValue('de');
    const { result } = await ready();

    expect(mockAuthenticate).toHaveBeenCalledWith(
      'address',
      'signature',
      'pubkey',
      undefined,
      'partner-wallet',
      'ref',
      undefined,
      'recommendation',
      'DE',
    );
    expect(mockBrowserLang).toHaveBeenCalledWith({ languages: ['de', 'en', 'fr', 'it'], fallback: 'en' });
    expect(mockStoredWalletSet).toHaveBeenCalledWith(WalletType.LEDGER_BTC);
    expect(mockNavigate).toHaveBeenCalledWith('/next');
    expect(result.current.isInitialized).toBe(true);
  });

  it('skips duplicate credentials and does not navigate without a redirect', async () => {
    mockLoggedIn = true;
    mockAppParams = { address: 'address', signature: 'signature' };
    const { rerender } = await ready();

    expect(mockAuthenticate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();

    mockAppParams = { address: 'address', signature: 'signature' };
    rerender();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockAuthenticate).toHaveBeenCalledTimes(1);
  });

  it('creates a new session when only the signature changes', async () => {
    mockLoggedIn = true;
    mockAppParams = { address: 'address', signature: 'signature' };
    const { rerender } = await ready();

    expect(mockAuthenticate).toHaveBeenCalledTimes(1);

    mockAppParams = { address: 'address', signature: 'other-signature' };
    rerender();

    await waitFor(() => expect(mockAuthenticate).toHaveBeenCalledTimes(2));
    expect(mockAuthenticate).toHaveBeenLastCalledWith(
      'address',
      'other-signature',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'EN',
    );
  });

  it('logs out when creating the session from credentials fails', async () => {
    mockAppParams = { address: 'address', signature: 'signature' };
    mockAuthenticate.mockRejectedValue(new Error('authentication failed'));
    const { result } = await ready();

    expect(mockLogout).toHaveBeenCalled();
    expect(result.current.isInitialized).toBe(true);
  });

  it('does not take a session path when an address has no signature', async () => {
    mockAppParams = { address: 'address' };
    await ready();

    expect(mockAuthenticate).not.toHaveBeenCalled();
    expect(mockUpdateSession).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('applies a valid JWT session and its customer identity', async () => {
    mockAppParams = { session: 'jwt.token', type: 'MetaMask', redirect: '/account' };
    const { result } = await ready();

    expect(mockJwtDecode).toHaveBeenCalledWith('jwt.token');
    expect(mockUpdateSession).toHaveBeenCalledWith('jwt.token');
    expect(mockStoredWalletSet).toHaveBeenCalledWith(WalletType.META_MASK);
    expect(mockNavigate).toHaveBeenCalledWith('/account');
    expect(result.current.isInitialized).toBe(true);
  });

  it('does not apply the same session twice', async () => {
    mockLoggedIn = true;
    mockAppParams = { session: 'jwt.token' };
    const { rerender } = await ready();

    expect(mockUpdateSession).toHaveBeenCalledTimes(1);

    mockAppParams = { session: 'jwt.token' };
    rerender();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockUpdateSession).toHaveBeenCalledTimes(1);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('logs out for a session that is not a JWT', async () => {
    mockAppParams = { session: 'not-a-jwt' };
    await ready();

    expect(mockLogout).toHaveBeenCalled();
    expect(mockUpdateSession).not.toHaveBeenCalled();
    expect(mockJwtDecode).not.toHaveBeenCalled();
  });

  it('logs out for a JWT without a customer identity', async () => {
    mockAppParams = { session: 'jwt.token' };
    mockJwtDecode.mockReturnValue({});
    await ready();

    expect(mockLogout).toHaveBeenCalled();
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });
});

describe('WalletContextProvider public API', () => {
  it('logs in, sets the wallet and blockchain and reloads the user', async () => {
    mockLoggedIn = true;
    const { result } = await ready();
    const onSignMessage = jest.fn().mockResolvedValue('signature');

    await act(async () => {
      await result.current.login(WalletType.LEDGER_BTC, 'address', Blockchain.BITCOIN, onSignMessage, 'key');
    });

    expect(mockGetSignMessage).toHaveBeenCalledWith('address');
    expect(onSignMessage).toHaveBeenCalledWith('address', 'sign this');
    expect(mockAuthenticate).toHaveBeenCalledWith(
      'address',
      'signature',
      'key',
      undefined,
      undefined,
      undefined,
      'Ledger',
      undefined,
      'EN',
    );
    expect(mockStoredWalletSet).toHaveBeenCalledWith(WalletType.LEDGER_BTC);
    expect(result.current.activeWallet).toBe(WalletType.LEDGER_BTC);
    expect(result.current.blockchain).toBe(Blockchain.BITCOIN);
    expect(mockReloadUser).toHaveBeenCalled();
  });

  it('uses the detected MetaMask wallet type for a MetaMask login', async () => {
    mockLoggedIn = true;
    const { result } = await ready();
    const onSignMessage = jest.fn().mockResolvedValue('signature');

    mockGetWalletType.mockReturnValueOnce('MetaMask');
    mockGetWalletType.mockReturnValueOnce('Rabby');
    mockGetWalletType.mockReturnValueOnce('InAppBrowser');
    mockGetWalletType.mockReturnValueOnce(undefined);

    for (let i = 0; i < 4; i += 1) {
      await act(async () => {
        await result.current.login(WalletType.META_MASK, 'address', Blockchain.ETHEREUM, onSignMessage);
      });
    }

    expect(mockGetWalletType).toHaveBeenCalledTimes(4);
    expect(mockAuthenticate.mock.calls[0][6]).toBe('MetaMask');
    expect(mockAuthenticate.mock.calls[1][6]).toBe('Rabby');
    expect(mockAuthenticate.mock.calls[2][6]).toBe('WalletBrowser');
    expect(mockAuthenticate.mock.calls[3][6]).toBe('MetaMask');
  });

  it('maps a wallet without an auth type to no auth wallet', async () => {
    mockLoggedIn = true;
    const { result } = await ready();
    const onSignMessage = jest.fn().mockResolvedValue('signature');

    await act(async () => {
      await result.current.login(WalletType.MAIL, 'address', Blockchain.BITCOIN, onSignMessage);
    });

    expect(mockAuthenticate.mock.calls[0][6]).toBeUndefined();
  });

  it('logs out, clears the wallet and rethrows when signing in fails', async () => {
    mockLoggedIn = true;
    const { result } = await ready();
    mockGetSignMessage.mockRejectedValue(new Error('sign message failed'));

    await act(async () => {
      await expect(
        result.current.login(WalletType.META_MASK, 'address', Blockchain.ETHEREUM, jest.fn()),
      ).rejects.toThrow('sign message failed');
    });

    expect(mockLogout).toHaveBeenCalled();
    expect(mockStoredWalletRemove).toHaveBeenCalled();
    expect(mockReloadUser).not.toHaveBeenCalled();
  });

  it('logs out, clears the wallet and rethrows when the session cannot be created', async () => {
    mockLoggedIn = true;
    const { result } = await ready();
    const onSignMessage = jest.fn().mockResolvedValue('signature');
    mockAuthenticate.mockRejectedValue(new Error('session failed'));

    await act(async () => {
      await expect(
        result.current.login(WalletType.META_MASK, 'address', Blockchain.ETHEREUM, onSignMessage),
      ).rejects.toThrow('session failed');
    });

    expect(mockLogout).toHaveBeenCalled();
    expect(mockStoredWalletRemove).toHaveBeenCalled();
  });

  it('passes a browser language made upper case or none at all', async () => {
    mockLoggedIn = true;
    const { result } = await ready();
    mockBrowserLang.mockReturnValue(undefined);

    await act(async () => {
      await result.current.login(WalletType.LEDGER_BTC, 'address', Blockchain.BITCOIN, jest.fn());
    });

    expect(mockAuthenticate.mock.calls[0][8]).toBeUndefined();
  });

  it('sets a session with and without a wallet and blockchain', async () => {
    mockLoggedIn = true;
    const { result } = await ready();

    await act(async () => {
      await result.current.setSession('session-one', WalletType.META_MASK, Blockchain.ETHEREUM);
    });

    expect(mockUpdateSession).toHaveBeenCalledWith('session-one');
    expect(mockStoredWalletSet).toHaveBeenCalledWith(WalletType.META_MASK);
    expect(result.current.activeWallet).toBe(WalletType.META_MASK);
    expect(result.current.blockchain).toBe(Blockchain.ETHEREUM);

    await act(async () => {
      await result.current.setSession('session-two');
    });

    expect(mockUpdateSession).toHaveBeenLastCalledWith('session-two');
    expect(mockStoredWalletRemove).toHaveBeenCalled();
    expect(result.current.activeWallet).toBeUndefined();
    expect(result.current.blockchain).toBeUndefined();
  });

  it('switches the blockchain', async () => {
    mockLoggedIn = true;
    const { result } = await ready();

    act(() => {
      result.current.switchBlockchain(Blockchain.BITCOIN);
    });

    expect(result.current.blockchain).toBe(Blockchain.BITCOIN);
  });
});
