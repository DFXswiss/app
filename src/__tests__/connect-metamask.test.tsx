// Component-level coverage for ConnectMetaMask: isInstalled gate, auto-connect, blockchain
// switch, permission-denied, signMessage forwarding, Content error / spinner, mobile fallback,
// and the key remount when isInstalled flips (ConnectBase only evaluates isSupported on mount).

const mockIsInstalled = jest.fn();
const mockRequestAccount = jest.fn();
const mockRequestBlockchain = jest.fn();
const mockRequestChangeToBlockchain = jest.fn();
const mockSign = jest.fn();
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
  Blockchain: { ETHEREUM: 'Ethereum', POLYGON: 'Polygon' },
  useAuthContext: () => ({ session: mockSession }),
  useSessionContext: () => ({ logout: mockLogout }),
  useUserContext: () => ({ user: undefined }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledButton: ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  StyledButtonColor: { GRAY_OUTLINE: 'gray-outline' },
  StyledButtonWidth: { MIN: 'min', SM: 'sm' },
  StyledLoadingSpinner: () => null,
  StyledVerticalStack: ({ children }: { children: JSX.Element | JSX.Element[] }) => <div>{children}</div>,
  StyledLink: ({ label }: { label: string }) => <a>{label}</a>,
  DfxIcon: () => null,
  IconVariant: { SIGNATURE_POPUP: 'signature-popup' },
}));

jest.mock('react-i18next', () => ({
  Trans: ({ children }: { children: JSX.Element }) => <>{children}</>,
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
    MetaMask: ['Ethereum', 'Polygon'],
  };

  return {
    WalletType: { META_MASK: 'MetaMask', WALLET_CONNECT: 'WalletConnect' },
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

jest.mock('../hooks/wallets/metamask.hook', () => ({
  useMetaMask: () => ({
    isInstalled: (...args: unknown[]) => mockIsInstalled(...args),
    requestAccount: (...args: unknown[]) => mockRequestAccount(...args),
    requestBlockchain: (...args: unknown[]) => mockRequestBlockchain(...args),
    requestChangeToBlockchain: (...args: unknown[]) => mockRequestChangeToBlockchain(...args),
    sign: (...args: unknown[]) => mockSign(...args),
  }),
}));

import { Blockchain } from '@dfx.swiss/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import ConnectMetaMask from '../components/home/wallet/connect-metamask';
import { WalletType } from '../contexts/wallet.context';

const TEST_ACCOUNT = '0x1111111111111111111111111111111111111111';

function renderComponent() {
  return render(
    <ConnectMetaMask
      rootRef={createRef<HTMLDivElement>()}
      wallet={WalletType.META_MASK}
      blockchain={Blockchain.ETHEREUM}
      isConnect={false}
      onLogin={mockOnLogin}
      onCancel={mockOnCancel}
      onSwitch={mockOnSwitch}
    />,
  );
}

describe('ConnectMetaMask', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsMobile = false;
    mockActiveWallet = undefined;
    mockSession = undefined;
    mockIsInstalled.mockReturnValue(true);
    mockRequestAccount.mockResolvedValue(TEST_ACCOUNT);
    mockRequestBlockchain.mockResolvedValue(Blockchain.ETHEREUM);
    mockRequestChangeToBlockchain.mockResolvedValue(undefined);
    mockSign.mockResolvedValue('0xsignature');
    mockLogin.mockResolvedValue(undefined);
    mockLogout.mockResolvedValue(undefined);
    mockSwitchBlockchain.mockResolvedValue(undefined);
  });

  it('shows the install hint and does not request an account when MetaMask is missing', async () => {
    mockIsInstalled.mockReturnValue(false);

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => expect(screen.getByText('Please install MetaMask or Rabby!')).toBeInTheDocument());
    expect(mockRequestAccount).not.toHaveBeenCalled();
    expect(mockOnSwitch).not.toHaveBeenCalled();
  });

  it('switches to WalletConnect when MetaMask is missing on mobile', async () => {
    mockIsMobile = true;
    mockIsInstalled.mockReturnValue(false);

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => expect(mockOnSwitch).toHaveBeenCalledWith(WalletType.WALLET_CONNECT));
    expect(mockRequestAccount).not.toHaveBeenCalled();
  });

  it('auto-connects and logs in when MetaMask is installed on the current chain', async () => {
    await act(async () => {
      renderComponent();
    });

    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith(
        WalletType.META_MASK,
        TEST_ACCOUNT,
        Blockchain.ETHEREUM,
        expect.any(Function),
        undefined,
      ),
    );
    expect(mockRequestAccount).toHaveBeenCalled();
    expect(mockRequestBlockchain).toHaveBeenCalled();
    expect(mockRequestChangeToBlockchain).not.toHaveBeenCalled();
    expect(mockOnLogin).toHaveBeenCalled();
  });

  it('switches the wallet to the requested chain when it does not match', async () => {
    mockRequestBlockchain.mockResolvedValue(Blockchain.POLYGON);

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => expect(mockRequestChangeToBlockchain).toHaveBeenCalledWith(Blockchain.ETHEREUM));
    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith(
        WalletType.META_MASK,
        TEST_ACCOUNT,
        Blockchain.ETHEREUM,
        expect.any(Function),
        undefined,
      ),
    );
  });

  it('surfaces Permission denied when the wallet returns no address', async () => {
    mockRequestAccount.mockResolvedValue(undefined);

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => expect(screen.getByText('Permission denied or account not verified')).toBeInTheDocument());
    expect(screen.getByText('Connection failed!')).toBeInTheDocument();
    expect(mockRequestBlockchain).not.toHaveBeenCalled();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('renders the connect error and Back calls onCancel when requestAccount rejects', async () => {
    mockRequestAccount.mockRejectedValue(new Error('User rejected'));

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => expect(screen.getByText('User rejected')).toBeInTheDocument());
    expect(screen.getByText('Connection failed!')).toBeInTheDocument();

    screen.getByText('Back').click();
    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('shows the confirm-connection spinner text while the account request is pending', async () => {
    mockRequestAccount.mockReturnValue(new Promise(() => undefined));

    await act(async () => {
      renderComponent();
    });

    await waitFor(() =>
      expect(screen.getByText('Please confirm the connection in your MetaMask.')).toBeInTheDocument(),
    );
  });

  it('forwards signMessage as sign(address, message)', async () => {
    mockLogin.mockImplementation((_wallet, _address, _blockchain, signer) => signer('some-address', 'some-message'));

    await act(async () => {
      renderComponent();
    });

    await waitFor(() => expect(mockSign).toHaveBeenCalledWith('some-address', 'some-message'));
  });

  it('remounts ConnectBase when isInstalled flips so auto-connect runs on the new instance', async () => {
    mockIsInstalled.mockReturnValue(false);

    const view = renderComponent();

    await waitFor(() => expect(screen.getByText('Please install MetaMask or Rabby!')).toBeInTheDocument());
    expect(mockRequestAccount).not.toHaveBeenCalled();

    mockIsInstalled.mockReturnValue(true);
    view.rerender(
      <ConnectMetaMask
        rootRef={createRef<HTMLDivElement>()}
        wallet={WalletType.META_MASK}
        blockchain={Blockchain.ETHEREUM}
        isConnect={false}
        onLogin={mockOnLogin}
        onCancel={mockOnCancel}
        onSwitch={mockOnSwitch}
      />,
    );

    await waitFor(() => expect(mockRequestAccount).toHaveBeenCalled());
    await waitFor(() => expect(mockLogin).toHaveBeenCalled());
    expect(screen.queryByText('Please install MetaMask or Rabby!')).not.toBeInTheDocument();
  });
});
