const mockGetSignMessage = jest.fn();
const mockAuthenticate = jest.fn();
const mockLogout = jest.fn();
const mockUpdateSession = jest.fn();
const mockReloadUser = jest.fn();
const mockStoreSet = jest.fn();
const mockStoreRemove = jest.fn();
const mockAppParams = {};
let mockSession: { address?: string } | undefined;
const mockSessionContext = {
  isInitialized: false,
  get isLoggedIn() {
    return Boolean(mockSession);
  },
  authenticate: mockAuthenticate,
  logout: mockLogout,
};

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { ETHEREUM: 'Ethereum' },
  Utils: { isJwt: jest.fn() },
  useApiSession: () => ({ updateSession: mockUpdateSession }),
  useAuth: () => ({ getSignMessage: mockGetSignMessage }),
  useAuthContext: () => ({ session: mockSession }),
  useSessionContext: () => mockSessionContext,
  useUserContext: () => ({ addSpecialCode: jest.fn(), reloadUser: mockReloadUser }),
}));

jest.mock('@dfx.swiss/react/dist/definitions/auth', () => ({
  AuthWalletType: {
    METAMASK: 'MetaMask',
    RABBY: 'Rabby',
    WALLET_BROWSER: 'WalletBrowser',
    TRUST: 'Trust',
    PHANTOM: 'Phantom',
    TRON_LINK: 'TronLink',
    CLI: 'CLI',
    LEDGER: 'Ledger',
    BIT_BOX: 'BitBox',
    TREZOR: 'Trezor',
    ALBY: 'Alby',
    WALLET_CONNECT: 'WalletConnect',
    DFX_TARO: 'DfxTaro',
  },
}));

jest.mock('browser-lang', () => jest.fn(() => 'en'));

jest.mock('../hooks/store.hook', () => ({
  useStore: () => ({
    activeWallet: { get: () => undefined, set: mockStoreSet, remove: mockStoreRemove },
  }),
}));

jest.mock('../hooks/wallets/metamask.hook', () => ({
  WalletType: { META_MASK: 'MetaMask', RABBY: 'Rabby', IN_APP_BROWSER: 'InAppBrowser' },
  useMetaMask: () => ({ getWalletType: jest.fn() }),
}));

jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({ isInitialized: false, params: mockAppParams }),
}));

jest.mock('../contexts/balance.context', () => ({
  useBalanceContext: () => ({ readBalances: jest.fn() }),
}));

import { Blockchain } from '@dfx.swiss/react';
import { act, renderHook } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { WalletContextProvider, WalletType, useWalletContext } from '../contexts/wallet.context';

const router = { navigate: jest.fn() };

function wrapper({ children }: PropsWithChildren) {
  return <WalletContextProvider router={router as any}>{children}</WalletContextProvider>;
}

describe('WalletContextProvider login errors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = undefined;
    mockGetSignMessage.mockResolvedValue('message');
    mockAuthenticate.mockRejectedValue(new Error('Authentication failed'));
  });

  it('keeps an existing address-less session when wallet login fails', async () => {
    const { result, rerender } = renderHook(() => useWalletContext(), { wrapper });

    mockSession = {};
    rerender();

    await act(async () => {
      await expect(
        result.current.login(
          WalletType.META_MASK,
          '0xabc',
          Blockchain.ETHEREUM,
          jest.fn().mockResolvedValue('signature'),
        ),
      ).rejects.toThrow('Authentication failed');
    });

    expect(mockLogout).not.toHaveBeenCalled();
  });

  it.each<[string, { address?: string } | undefined]>([
    ['an addressed session', { address: '0xexisting' }],
    ['no existing session', undefined],
  ])('logs out after wallet login fails with %s', async (_case, session) => {
    mockSession = session;
    const { result } = renderHook(() => useWalletContext(), { wrapper });

    await act(async () => {
      await expect(
        result.current.login(
          WalletType.META_MASK,
          '0xabc',
          Blockchain.ETHEREUM,
          jest.fn().mockResolvedValue('signature'),
        ),
      ).rejects.toThrow('Authentication failed');
    });

    expect(mockLogout).toHaveBeenCalled();
  });
});
