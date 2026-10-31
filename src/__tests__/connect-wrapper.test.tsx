jest.mock('@dfx.swiss/react/dist/definitions/auth', () => ({
  AuthWalletType: { METAMASK: 'MetaMask', ALBY: 'Alby', WALLET_BROWSER: 'WalletBrowser', RABBY: 'Rabby' },
}));

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { ETHEREUM: 'Ethereum', BITCOIN: 'Bitcoin' },
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

jest.mock('../components/home/wallet/connect-alby', () => ({
  __esModule: true,
  default: (props: { wallet: string }) => <div data-testid="connect-alby">{props.wallet}</div>,
}));
jest.mock('../components/home/wallet/connect-bitbox', () => ({
  __esModule: true,
  default: (props: { wallet: string }) => <div data-testid="connect-bitbox">{props.wallet}</div>,
}));
jest.mock('../components/home/wallet/connect-cli', () => ({
  __esModule: true,
  default: (props: { wallet: string }) => <div data-testid="connect-cli">{props.wallet}</div>,
}));
jest.mock('../components/home/wallet/connect-ledger', () => ({
  __esModule: true,
  default: (props: { wallet: string }) => <div data-testid="connect-ledger">{props.wallet}</div>,
}));
jest.mock('../components/home/wallet/connect-metamask', () => ({
  __esModule: true,
  default: (props: { wallet: string }) => <div data-testid="connect-metamask">{props.wallet}</div>,
}));
jest.mock('../components/home/wallet/connect-trezor', () => ({
  __esModule: true,
  default: (props: { wallet: string }) => <div data-testid="connect-trezor">{props.wallet}</div>,
}));
jest.mock('../components/home/wallet/connect-taro', () => ({
  __esModule: true,
  default: (props: { wallet: string }) => <div data-testid="connect-taro">{props.wallet}</div>,
}));
jest.mock('../components/home/wallet/connect-wallet-connect', () => ({
  __esModule: true,
  default: (props: { wallet: string }) => <div data-testid="connect-wallet-connect">{props.wallet}</div>,
}));
jest.mock('../components/home/wallet/connect-monero', () => ({
  __esModule: true,
  default: (props: { wallet: string }) => <div data-testid="connect-monero">{props.wallet}</div>,
}));
jest.mock('../components/home/wallet/connect-phantom', () => ({
  __esModule: true,
  default: (props: { wallet: string }) => <div data-testid="connect-phantom">{props.wallet}</div>,
}));
jest.mock('../components/home/wallet/connect-trust-sol', () => ({
  __esModule: true,
  default: (props: { wallet: string }) => <div data-testid="connect-trust-sol">{props.wallet}</div>,
}));
jest.mock('../components/home/wallet/connect-trust-trx', () => ({
  __esModule: true,
  default: (props: { wallet: string }) => <div data-testid="connect-trust-trx">{props.wallet}</div>,
}));
jest.mock('../components/home/wallet/connect-tronlink-trx', () => ({
  __esModule: true,
  default: (props: { wallet: string }) => <div data-testid="connect-tronlink">{props.wallet}</div>,
}));
jest.mock('../components/home/wallet/connect-mail', () => ({
  __esModule: true,
  default: (props: { wallet: string }) => <div data-testid="connect-mail">{props.wallet}</div>,
}));
jest.mock('../components/home/wallet/connect-address', () => ({
  __esModule: true,
  default: (props: { wallet: string }) => <div data-testid="connect-address">{props.wallet}</div>,
}));
jest.mock('../components/home/wallet/connect-passkey', () => ({
  __esModule: true,
  default: (props: { wallet: string }) => <div data-testid="connect-passkey">{props.wallet}</div>,
}));

import { render, screen, waitFor } from '@testing-library/react';
import { createRef, Suspense } from 'react';
import { ConnectWrapper } from '../components/home/connect-wrapper';
import { WalletType } from '../contexts/wallet.context';

const CONNECT_TEST_ID: Record<WalletType, string> = {
  [WalletType.META_MASK]: 'connect-metamask',
  [WalletType.ALBY]: 'connect-alby',
  [WalletType.LEDGER_BTC]: 'connect-ledger',
  [WalletType.LEDGER_ETH]: 'connect-ledger',
  [WalletType.BITBOX_BTC]: 'connect-bitbox',
  [WalletType.BITBOX_ETH]: 'connect-bitbox',
  [WalletType.TREZOR_BTC]: 'connect-trezor',
  [WalletType.TREZOR_ETH]: 'connect-trezor',
  [WalletType.CLI_BTC]: 'connect-cli',
  [WalletType.CLI_SPARK]: 'connect-cli',
  [WalletType.CLI_ARK]: 'connect-cli',
  [WalletType.CLI_FIRO]: 'connect-cli',
  [WalletType.CLI_XMR]: 'connect-cli',
  [WalletType.CLI_ZANO]: 'connect-cli',
  [WalletType.CLI_ICP]: 'connect-cli',
  [WalletType.CLI_ETH]: 'connect-cli',
  [WalletType.CLI_ADA]: 'connect-cli',
  [WalletType.CLI_AR]: 'connect-cli',
  [WalletType.CLI_LN]: 'connect-cli',
  [WalletType.CLI_SOL]: 'connect-cli',
  [WalletType.CLI_TRX]: 'connect-cli',
  [WalletType.DFX_TARO]: 'connect-taro',
  [WalletType.WALLET_CONNECT]: 'connect-wallet-connect',
  [WalletType.CAKE]: 'connect-monero',
  [WalletType.MONERO]: 'connect-monero',
  [WalletType.PHANTOM_SOL]: 'connect-phantom',
  [WalletType.TRUST_SOL]: 'connect-trust-sol',
  [WalletType.TRUST_TRX]: 'connect-trust-trx',
  [WalletType.TRONLINK_TRX]: 'connect-tronlink',
  [WalletType.MAIL]: 'connect-mail',
  [WalletType.ADDRESS]: 'connect-address',
  [WalletType.PASSKEY]: 'connect-passkey',
};

describe('ConnectWrapper', () => {
  it('renders the matching connector stub for every WalletType', async () => {
    const rootRef = createRef<HTMLDivElement>();
    const mockOnLogin = jest.fn();
    const mockOnCancel = jest.fn();
    const mockOnSwitch = jest.fn();

    for (const wallet of Object.values(WalletType) as WalletType[]) {
      const { unmount } = render(
        <Suspense fallback={null}>
          <ConnectWrapper
            rootRef={rootRef}
            wallet={wallet}
            isConnect={false}
            onLogin={mockOnLogin}
            onCancel={mockOnCancel}
            onSwitch={mockOnSwitch}
          />
        </Suspense>,
      );

      const testId = CONNECT_TEST_ID[wallet];
      await waitFor(() => {
        expect(screen.getByTestId(testId)).toBeInTheDocument();
      });
      expect(screen.getByTestId(testId)).toHaveTextContent(wallet);
      unmount();
    }
  });
});
