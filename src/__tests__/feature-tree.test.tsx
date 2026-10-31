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
  Language: {},
  Utils: { isJwt: () => false },
  useApiSession: () => ({ updateSession: () => undefined }),
  useAuth: () => ({ getSignMessage: () => undefined }),
  useSessionContext: () => ({
    isInitialized: false,
    isLoggedIn: false,
    logout: () => undefined,
    authenticate: () => undefined,
  }),
  useUserContext: () => ({ addSpecialCode: () => undefined, reloadUser: () => undefined }),
}));

const mockSetParams = jest.fn();
const mockSetRedirectPath = jest.fn();

const mockState: { language: { symbol: string } | undefined; enabled: Set<string> } = {
  language: { symbol: 'DE' },
  enabled: new Set<string>(),
};

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

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({ language: mockState.language }),
}));

jest.mock('../hooks/feature-flag.hook', () => ({
  useFeatureFlags: () => ({
    isEnabled: (feature: string) => mockState.enabled.has(feature),
  }),
}));

jest.mock('../hooks/app-params.hook', () => ({
  useAppParams: () => ({ setParams: mockSetParams }),
}));

jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({ setRedirectPath: mockSetRedirectPath }),
}));

import { Blockchain } from '@dfx.swiss/react';
import { renderHook } from '@testing-library/react';
import { FeatureTree } from '../config/feature-tree';
import type { AppParams } from '../contexts/app-handling.context';
import { WalletType } from '../contexts/wallet.context';
import { isWallet, Tile, useFeatureTree, WalletTile } from '../hooks/feature-tree.hook';

describe('FeatureTree', () => {
  it('gates the login-with-passkey tile behind the passkey feature', () => {
    const login = FeatureTree.find((page) => page.id === 'login');
    expect(login).toBeDefined();
    const passkey = login?.tiles.find((tile) => tile.id === 'login-with-passkey');
    expect(passkey).toEqual(expect.objectContaining({ id: 'login-with-passkey', feature: 'passkey' }));
  });

  it('resolves every functional wallet selector for each blockchain and for undefined', () => {
    for (const page of FeatureTree) {
      for (const tile of page.tiles) {
        if (typeof tile.wallet !== 'function') continue;
        const select = tile.wallet;
        for (const chain of Object.values(Blockchain)) {
          const wallet = select({ blockchain: chain } as AppParams);
          expect(typeof wallet.type).toBe('string');
        }
        const unset = select({ blockchain: undefined } as AppParams);
        expect(typeof unset.type).toBe('string');
      }
    }
  });
});

describe('isWallet', () => {
  it('is true for a tile with a wallet and false otherwise', () => {
    expect(isWallet({ id: 'with', img: 'w', wallet: { type: WalletType.MAIL } } as Tile)).toBe(true);
    expect(isWallet({ id: 'next', img: 'n', next: { page: 'home' } } as Tile)).toBe(false);
    expect(isWallet(null as unknown as Tile)).toBe(false);
    expect(isWallet(undefined as unknown as Tile)).toBe(false);
    expect(isWallet({ id: 'null-wallet', img: 'n', wallet: null } as unknown as Tile)).toBe(false);
  });
});

describe('useFeatureTree', () => {
  beforeEach(() => {
    mockSetParams.mockClear();
    mockSetRedirectPath.mockClear();
    mockState.language = { symbol: 'DE' };
    mockState.enabled = new Set<string>();
  });

  it('returns undefined from getPage when language is missing', () => {
    mockState.language = undefined;
    const { result } = renderHook(() => useFeatureTree());
    expect(result.current.getPage('login')).toBeUndefined();
  });

  it('builds login image URLs with known language symbols and falls back to EN', () => {
    for (const symbol of ['EN', 'DE', 'IT', 'FR']) {
      mockState.language = { symbol };
      const { result, unmount } = renderHook(() => useFeatureTree());
      const page = result.current.getPage('login');
      expect(page).toBeDefined();
      const suffix = `_${symbol.toLowerCase()}.jpg`;
      for (const tile of page!.tiles) {
        expect(tile.img.startsWith('https://dfx.swiss/images/app/')).toBe(true);
        expect(tile.img.endsWith(suffix)).toBe(true);
      }
      unmount();
    }

    mockState.language = { symbol: 'ES' };
    const { result } = renderHook(() => useFeatureTree());
    const page = result.current.getPage('login');
    expect(page).toBeDefined();
    for (const tile of page!.tiles) {
      expect(tile.img.startsWith('https://dfx.swiss/images/app/')).toBe(true);
      expect(tile.img.endsWith('_en.jpg')).toBe(true);
    }
  });

  it('hides the passkey tile until the flag is enabled', () => {
    const { result } = renderHook(() => useFeatureTree());

    const withoutFlag = result.current.getPage('login')!.tiles.map((tile) => tile.id);
    expect(withoutFlag).toContain('login-with-crypto-wallet');
    expect(withoutFlag).toContain('login-with-mail');
    expect(withoutFlag).not.toContain('login-with-passkey');

    mockState.enabled.add('passkey');
    const withFlag = result.current.getPage('login')!.tiles.map((tile) => tile.id);
    expect(withFlag).toContain('login-with-passkey');
    expect(withFlag).toContain('login-with-crypto-wallet');
    expect(withFlag).toContain('login-with-mail');
  });

  it('keeps every visible tile without allowedTiles and filters when the list is set', () => {
    const { result } = renderHook(() => useFeatureTree());

    const unrestricted = result.current.getPage('login')!.tiles.map((tile) => tile.id);
    expect(unrestricted.length).toBeGreaterThan(1);
    expect(unrestricted).toContain('login-with-crypto-wallet');
    expect(unrestricted).toContain('login-with-mail');

    const restricted = result.current.getPage('login', ['login-with-mail'])!.tiles.map((tile) => tile.id);
    expect(restricted).toEqual(['login-with-mail']);
  });

  it('returns a known page by id and falls back to home for an unknown id', () => {
    const { result } = renderHook(() => useFeatureTree());
    expect(result.current.getPage('login')!.id).toBe('login');
    expect(result.current.getPage('no-such-page')!.id).toBe('home');
    expect(FeatureTree[0].id).toBe('home');
  });

  it('returns an object wallet by reference and calls a function wallet with params.blockchain', () => {
    const { result } = renderHook(() => useFeatureTree());
    const objectTile = FeatureTree.flatMap((page) => page.tiles).find(
      (tile) => tile.wallet && typeof tile.wallet !== 'function',
    ) as WalletTile;
    const functionTile = FeatureTree.flatMap((page) => page.tiles).find(
      (tile) => typeof tile.wallet === 'function',
    ) as WalletTile;

    expect(objectTile).toBeDefined();
    expect(functionTile).toBeDefined();
    expect(result.current.getWallet(objectTile, {})).toBe(objectTile.wallet);

    const params = { blockchain: Blockchain.BITCOIN } as AppParams;
    const selected = result.current.getWallet(functionTile, params);
    expect(typeof selected.type).toBe('string');
  });

  it('applies setOptions service and query independently', () => {
    const { result } = renderHook(() => useFeatureTree());

    result.current.setOptions({ service: 'buy' });
    expect(mockSetRedirectPath).toHaveBeenCalledWith('/buy');
    expect(mockSetParams).not.toHaveBeenCalled();

    mockSetRedirectPath.mockClear();
    mockSetParams.mockClear();

    result.current.setOptions({ query: { blockchain: 'Bitcoin' } });
    expect(mockSetParams).toHaveBeenCalledWith({ blockchain: 'Bitcoin' });
    expect(mockSetRedirectPath).not.toHaveBeenCalled();

    mockSetRedirectPath.mockClear();
    mockSetParams.mockClear();

    result.current.setOptions({ service: 'sell', query: { blockchain: 'Bitcoin' } });
    expect(mockSetRedirectPath).toHaveBeenCalledWith('/sell');
    expect(mockSetParams).toHaveBeenCalledWith({ blockchain: 'Bitcoin' });

    mockSetRedirectPath.mockClear();
    mockSetParams.mockClear();

    result.current.setOptions({});
    expect(mockSetRedirectPath).not.toHaveBeenCalled();
    expect(mockSetParams).not.toHaveBeenCalled();
  });
});
