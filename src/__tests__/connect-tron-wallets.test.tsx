// Component-level coverage for ConnectTrustTrx and ConnectTronLinkTrx: isAvailable gate,
// auto-connect, reconnect, connect error / Back, spinner text, and signMessage forwarding.

const mockTrustIsAvailable = jest.fn();
const mockTrustConnect = jest.fn();
const mockTrustSignMessage = jest.fn();
const mockTronLinkIsAvailable = jest.fn();
const mockTronLinkConnect = jest.fn();
const mockTronLinkSignMessage = jest.fn();
const mockOnCancel = jest.fn();
const mockOnLogin = jest.fn();
const mockOnSwitch = jest.fn();
const mockLogin = jest.fn();
const mockLogout = jest.fn();
const mockSetSession = jest.fn();
const mockSwitchBlockchain = jest.fn();

let mockIsMobile = false;
let mockActiveWallet: string | undefined;
let mockSession: { address?: string } | undefined;

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { TRON: 'Tron' },
  useAuthContext: () => ({ session: mockSession }),
  useSessionContext: () => ({ logout: mockLogout }),
  useUserContext: () => ({ user: undefined }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledButton: ({ label, onClick }: any) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  StyledButtonColor: { GRAY_OUTLINE: 'gray-outline' },
  StyledButtonWidth: { MIN: 'min', SM: 'sm' },
  StyledLoadingSpinner: () => null,
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
  StyledLink: ({ label }: any) => <a>{label}</a>,
  DfxIcon: () => null,
  IconVariant: { SIGNATURE_POPUP: 'signature-popup' },
}));

jest.mock('react-i18next', () => ({
  Trans: ({ children }: any) => <>{children}</>,
}));

jest.mock('react-device-detect', () => ({
  get isMobile() {
    return mockIsMobile;
  },
}));

jest.mock('../hooks/report-displayed-error.hook', () => ({
  useReportDisplayedError: () => undefined,
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, key: string) => key,
  }),
}));

jest.mock('../contexts/wallet.context', () => {
  const WalletBlockchains: Record<string, string[] | undefined> = {
    TrustTrx: ['Tron'],
    TronLinkTrx: ['Tron'],
  };

  return {
    WalletType: { TRUST_TRX: 'TrustTrx', TRONLINK_TRX: 'TronLinkTrx' },
    WalletBlockchains,
    supportsBlockchain: (wallet: string, blockchain: string) => {
      const chains = WalletBlockchains[wallet];
      return !chains || chains.includes(blockchain);
    },
    useWalletContext: () => ({
      login: mockLogin,
      setSession: mockSetSession,
      switchBlockchain: mockSwitchBlockchain,
      activeWallet: mockActiveWallet,
    }),
  };
});

jest.mock('src/hooks/wallets/trust-trx.hook', () => ({
  useTrustTrx: () => ({
    isAvailable: (...args: unknown[]) => mockTrustIsAvailable(...args),
    connect: (...args: unknown[]) => mockTrustConnect(...args),
    signMessage: (...args: unknown[]) => mockTrustSignMessage(...args),
  }),
}));

jest.mock('src/hooks/wallets/tronlink-trx.hook', () => ({
  useTronLinkTrx: () => ({
    isAvailable: (...args: unknown[]) => mockTronLinkIsAvailable(...args),
    connect: (...args: unknown[]) => mockTronLinkConnect(...args),
    signMessage: (...args: unknown[]) => mockTronLinkSignMessage(...args),
  }),
}));

import { Blockchain } from '@dfx.swiss/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import ConnectTronLinkTrx from '../components/home/wallet/connect-tronlink-trx';
import ConnectTrustTrx from '../components/home/wallet/connect-trust-trx';
import { WalletType } from '../contexts/wallet.context';

describe.each([
  {
    name: 'ConnectTrustTrx',
    Component: ConnectTrustTrx,
    walletType: WalletType.TRUST_TRX,
    walletName: 'Trust',
    confirmText: 'Please confirm the connection in your Trust browser extension.',
    mockIsAvailable: mockTrustIsAvailable,
    mockConnect: mockTrustConnect,
    mockSignMessage: mockTrustSignMessage,
  },
  {
    name: 'ConnectTronLinkTrx',
    Component: ConnectTronLinkTrx,
    walletType: WalletType.TRONLINK_TRX,
    walletName: 'TronLink',
    confirmText: 'Please confirm the connection in your TronLink browser extension.',
    mockIsAvailable: mockTronLinkIsAvailable,
    mockConnect: mockTronLinkConnect,
    mockSignMessage: mockTronLinkSignMessage,
  },
])('$name', ({ Component, walletType, walletName, confirmText, mockIsAvailable, mockConnect, mockSignMessage }) => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsMobile = false;
    mockActiveWallet = undefined;
    mockSession = undefined;
    mockIsAvailable.mockResolvedValue(true);
    mockConnect.mockResolvedValue('TronAddress');
    mockSignMessage.mockResolvedValue('signature');
    mockLogin.mockResolvedValue(undefined);
    mockLogout.mockResolvedValue(undefined);
    mockSwitchBlockchain.mockResolvedValue(undefined);
  });

  function renderComponent(isConnect = false) {
    return render(
      <Component
        rootRef={createRef<HTMLDivElement>()}
        wallet={walletType}
        blockchain={Blockchain.TRON}
        isConnect={isConnect}
        onLogin={mockOnLogin}
        onCancel={mockOnCancel}
        onSwitch={mockOnSwitch}
      />,
    );
  }

  it('shows the install hint and does not connect when isAvailable resolves false', async () => {
    mockIsAvailable.mockResolvedValue(false);

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => expect(screen.getByText(`Please install ${walletName}!`)).toBeInTheDocument());
    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockOnSwitch).not.toHaveBeenCalled();
  });

  it('switches to the mobile fallback when isAvailable is false on mobile', async () => {
    mockIsMobile = true;
    mockIsAvailable.mockResolvedValue(false);

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => expect(mockOnSwitch).toHaveBeenCalledWith(walletType));
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('auto-connects and logs in with the returned address when isAvailable is true', async () => {
    await act(async () => {
      renderComponent();
    });

    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith(
        walletType,
        'TronAddress',
        Blockchain.TRON,
        expect.any(Function),
        undefined,
      ),
    );
    expect(mockConnect).toHaveBeenCalled();
    expect(mockOnLogin).toHaveBeenCalled();
  });

  it('reuses the session address on reconnect and does not call connect', async () => {
    mockActiveWallet = walletType;
    mockSession = { address: 'SessionAddress' };

    await act(async () => {
      renderComponent(true);
    });

    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith(
        walletType,
        'SessionAddress',
        Blockchain.TRON,
        expect.any(Function),
        undefined,
      ),
    );
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('calls connect on reconnect when the session has no address', async () => {
    mockActiveWallet = walletType;
    mockSession = undefined;

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => expect(mockConnect).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith(
        walletType,
        'TronAddress',
        Blockchain.TRON,
        expect.any(Function),
        undefined,
      ),
    );
  });

  it('renders the connect error and Back calls onCancel when connect rejects', async () => {
    mockConnect.mockRejectedValue(new Error('User rejected'));

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => expect(screen.getByText('User rejected')).toBeInTheDocument());
    expect(screen.getByText('Connection failed!')).toBeInTheDocument();

    screen.getByText('Back').click();
    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('shows the confirm-connection spinner text while connect is pending', async () => {
    mockConnect.mockReturnValue(new Promise(() => undefined));

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => expect(screen.getByText(confirmText)).toBeInTheDocument());
  });

  it('forwards signMessage through the login signer callback', async () => {
    mockLogin.mockImplementation((_wallet, _address, _blockchain, signer) => signer('some-address', 'some-message'));

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => expect(mockSignMessage).toHaveBeenCalledWith('some-address', 'some-message'));
  });
});
