let mockIsMobile = false;

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

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_key: string, defaultText: string) => defaultText,
  }),
}));

jest.mock('react-i18next', () => ({
  Trans: ({ children }: { children?: unknown }) => <>{children}</>,
}));

jest.mock('react-device-detect', () => ({
  get isMobile() {
    return mockIsMobile;
  },
}));

jest.mock('@dfx.swiss/react-components', () => ({
  StyledVerticalStack: ({ children }: { children?: unknown }) => <div>{children}</div>,
  StyledLink: ({ label, url }: { label: string; url: string }) => <a href={url}>{label}</a>,
  StyledButton: ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  StyledButtonWidth: { SM: 'SM' },
}));

import { render, screen } from '@testing-library/react';
import { InstallHint } from '../components/home/install-hint';
import { WalletType } from '../contexts/wallet.context';

function expectedHeading(type: WalletType): string | undefined {
  switch (type) {
    case WalletType.META_MASK:
      return 'Please install MetaMask or Rabby!';
    case WalletType.ALBY:
      return 'Please install Alby!';
    case WalletType.LEDGER_BTC:
    case WalletType.LEDGER_ETH:
    case WalletType.BITBOX_BTC:
    case WalletType.BITBOX_ETH:
      return mockIsMobile ? 'Mobile not supported!' : 'Browser not supported!';
    case WalletType.TREZOR_BTC:
    case WalletType.TREZOR_ETH:
      return 'Trezor Bridge not installed!';
    case WalletType.PHANTOM_SOL:
      return 'Please install Phantom!';
    case WalletType.TRUST_SOL:
    case WalletType.TRUST_TRX:
      return 'Please install Trust!';
    case WalletType.TRONLINK_TRX:
      return 'Please install TronLink!';
    case WalletType.PASSKEY:
    case WalletType.CLI_BTC:
    case WalletType.CLI_LN:
    case WalletType.CLI_FIRO:
    case WalletType.CLI_XMR:
    case WalletType.CLI_ZANO:
    case WalletType.CLI_ICP:
    case WalletType.CLI_ETH:
    case WalletType.CLI_ADA:
    case WalletType.CLI_AR:
    case WalletType.CLI_SOL:
    case WalletType.CLI_TRX:
    case WalletType.CLI_SPARK:
    case WalletType.CLI_ARK:
    case WalletType.DFX_TARO:
    case WalletType.WALLET_CONNECT:
    case WalletType.CAKE:
    case WalletType.MONERO:
    case WalletType.MAIL:
    case WalletType.ADDRESS:
      return undefined;
  }
}

function expectedLinks(type: WalletType): string[] {
  switch (type) {
    case WalletType.META_MASK:
      return ['metamask.io', 'rabby.io'];
    case WalletType.ALBY:
      return ['getalby.com'];
    case WalletType.LEDGER_BTC:
    case WalletType.LEDGER_ETH:
    case WalletType.BITBOX_BTC:
    case WalletType.BITBOX_ETH:
      return ['caniuse.com'];
    case WalletType.TREZOR_BTC:
    case WalletType.TREZOR_ETH:
      return ['trezor.io'];
    case WalletType.PHANTOM_SOL:
      return ['phantom.app'];
    case WalletType.TRUST_SOL:
    case WalletType.TRUST_TRX:
      return ['trustwallet.com'];
    case WalletType.TRONLINK_TRX:
      return ['tronlink.org'];
    default:
      return [];
  }
}

describe('InstallHint', () => {
  const mockOnConfirm = jest.fn();

  beforeEach(() => {
    mockIsMobile = false;
    mockOnConfirm.mockClear();
  });

  it('renders the matching hint or an empty fragment for every WalletType', () => {
    for (const type of Object.values(WalletType) as WalletType[]) {
      const { unmount } = render(<InstallHint type={type} onConfirm={mockOnConfirm} />);
      const heading = expectedHeading(type);

      if (heading) {
        expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
        for (const label of expectedLinks(type)) {
          expect(screen.getByText(label)).toBeInTheDocument();
        }
      } else {
        expect(screen.queryByRole('heading')).toBeNull();
      }

      unmount();
    }
  });

  it('uses the mobile heading when WebHID is opened on a phone', () => {
    mockIsMobile = true;
    render(<InstallHint type={WalletType.LEDGER_BTC} onConfirm={mockOnConfirm} />);
    expect(screen.getByRole('heading', { name: 'Mobile not supported!' })).toBeInTheDocument();
  });

  it('uses the browser heading when WebHID is opened on desktop', () => {
    mockIsMobile = false;
    render(<InstallHint type={WalletType.BITBOX_BTC} onConfirm={mockOnConfirm} />);
    expect(screen.getByRole('heading', { name: 'Browser not supported!' })).toBeInTheDocument();
  });
});
