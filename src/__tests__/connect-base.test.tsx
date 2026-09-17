// Component-level: ConnectBase only auto-connects to a wallet that is supported in this browser,
// plus the connect and login flow behind the connect call.

const mockLogin = jest.fn();
const mockSetSession = jest.fn();
const mockSwitchBlockchain = jest.fn();
const mockLogout = jest.fn();
const mockGetAccount = jest.fn();
const mockSignMessage = jest.fn();
const mockOnLogin = jest.fn();
const mockOnCancel = jest.fn();
const mockOnSwitch = jest.fn();
let mockActiveWallet: string | undefined;
let mockSession: { address?: string } | undefined;

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { ETHEREUM: 'Ethereum', POLYGON: 'Polygon', BITCOIN: 'Bitcoin' },
  useAuthContext: () => ({ session: mockSession }),
  useSessionContext: () => ({ logout: mockLogout }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { LG: 'lg' },
  StyledLoadingSpinner: () => <div>loading</div>,
}));

jest.mock('../contexts/wallet.context', () => {
  const WalletBlockchains: Record<string, string[] | undefined> = { MetaMask: ['Ethereum', 'Polygon'] };

  return {
    WalletType: { META_MASK: 'MetaMask', ALBY: 'Alby', WALLET_CONNECT: 'WalletConnect', MAIL: 'Mail' },
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

jest.mock('../components/home/install-hint', () => ({
  InstallHint: ({ type, onConfirm }: { type: string; onConfirm: () => void }) => (
    <button type="button" onClick={onConfirm}>
      install {type}
    </button>
  ),
}));

jest.mock('../components/home/sign-hint', () => ({
  SignHint: () => <div>sign hint</div>,
}));

import { Blockchain } from '@dfx.swiss/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { ComponentProps, createRef } from 'react';
import { BitcoinAddressType } from '../config/key-path';
import { ConnectBase } from '../components/home/connect-base';
import { ConnectContentProps } from '../components/home/connect-shared';
import { WalletType } from '../contexts/wallet.context';
import { AbortError } from '../util/abort-error';
import { WalletSwitchError } from '../util/wallet-switch-error';

let contentProps: ConnectContentProps | undefined;

function renderContent(props: ConnectContentProps): JSX.Element {
  contentProps = props;

  return (
    <div>
      content
      {props.isConnecting && <span>connecting</span>}
      {props.error && <span>error: {props.error}</span>}
    </div>
  );
}

function content(): ConnectContentProps {
  expect(contentProps).toBeDefined();
  return contentProps as ConnectContentProps;
}

function renderBase(overrides: Partial<ComponentProps<typeof ConnectBase>> = {}) {
  return render(
    <ConnectBase
      rootRef={createRef<HTMLDivElement>()}
      wallet={WalletType.META_MASK}
      blockchain={Blockchain.ETHEREUM}
      isConnect={false}
      isSupported={() => true}
      getAccount={mockGetAccount}
      signMessage={mockSignMessage}
      renderContent={renderContent}
      onLogin={mockOnLogin}
      onCancel={mockOnCancel}
      onSwitch={mockOnSwitch}
      {...overrides}
    />,
  );
}

async function renderReady(overrides: Partial<ComponentProps<typeof ConnectBase>> = {}) {
  const result = renderBase(overrides);
  await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  contentProps = undefined;
  mockActiveWallet = undefined;
  mockSession = undefined;
  mockGetAccount.mockResolvedValue({ address: '0xabc' });
  mockLogin.mockResolvedValue(undefined);
  mockSetSession.mockResolvedValue(undefined);
  mockSwitchBlockchain.mockResolvedValue(undefined);
  mockLogout.mockResolvedValue(undefined);
});

describe('ConnectBase auto-connect', () => {
  it('shows a spinner and hides the content until isSupported resolves', async () => {
    let resolveSupported: (supported: boolean) => void = () => undefined;
    renderBase({ isSupported: () => new Promise<boolean>((resolve) => (resolveSupported = resolve)) });

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.getByText('content').parentElement).toHaveClass('hidden');

    await act(async () => resolveSupported(true));

    expect(screen.queryByText('loading')).not.toBeInTheDocument();
    expect(screen.getByText('content').parentElement).not.toHaveClass('hidden');
  });

  it('does not auto-connect when isSupported resolves true after unmount', async () => {
    let resolveSupported: (supported: boolean) => void = () => undefined;
    const { unmount } = renderBase({
      autoConnect: true,
      isSupported: () => new Promise<boolean>((resolve) => (resolveSupported = resolve)),
    });

    expect(screen.getByText('loading')).toBeInTheDocument();

    unmount();

    await act(async () => resolveSupported(true));

    expect(mockGetAccount).not.toHaveBeenCalled();
  });

  it('does not switch to the fallback wallet when isSupported resolves false after unmount', async () => {
    let resolveSupported: (supported: boolean) => void = () => undefined;
    const { unmount } = renderBase({
      autoConnect: true,
      fallback: WalletType.WALLET_CONNECT,
      isSupported: () => new Promise<boolean>((resolve) => (resolveSupported = resolve)),
    });

    expect(screen.getByText('loading')).toBeInTheDocument();

    unmount();

    await act(async () => resolveSupported(false));

    expect(mockOnSwitch).not.toHaveBeenCalled();
  });

  it('does not connect an unsupported wallet and shows the install hint', async () => {
    renderBase({ autoConnect: true, isSupported: () => false });

    expect(await screen.findByText('install MetaMask')).toBeInTheDocument();
    expect(screen.getByText('content').parentElement).toHaveClass('hidden');
    expect(mockGetAccount).not.toHaveBeenCalled();
    expect(mockOnSwitch).not.toHaveBeenCalled();
    expect(screen.queryByText(/^error:/)).not.toBeInTheDocument();
  });

  it('switches to the fallback wallet instead of connecting an unsupported one', async () => {
    renderBase({ autoConnect: true, isSupported: async () => false, fallback: WalletType.WALLET_CONNECT });

    await waitFor(() => expect(mockOnSwitch).toHaveBeenCalledWith(WalletType.WALLET_CONNECT));
    expect(mockGetAccount).not.toHaveBeenCalled();
  });

  it('connects a supported wallet right away', async () => {
    await renderReady({ autoConnect: true });

    expect(mockGetAccount).toHaveBeenCalledWith(WalletType.META_MASK, Blockchain.ETHEREUM, false);
    await waitFor(() => expect(mockOnLogin).toHaveBeenCalled());
  });

  it('waits for an explicit connect when autoConnect is not set', async () => {
    await renderReady();

    expect(mockGetAccount).not.toHaveBeenCalled();

    await act(() => content().connect());

    expect(mockGetAccount).toHaveBeenCalledWith(WalletType.META_MASK, Blockchain.ETHEREUM, false);
  });

  it('treats a rejecting isSupported as unsupported and clears the spinner', async () => {
    renderBase({ isSupported: () => Promise.reject(new Error('not available')) });

    expect(await screen.findByText('install MetaMask')).toBeInTheDocument();
    expect(screen.queryByText('loading')).not.toBeInTheDocument();
    expect(mockGetAccount).not.toHaveBeenCalled();
  });

  it('does not auto-connect when isSupported rejects', async () => {
    renderBase({ autoConnect: true, isSupported: () => Promise.reject(new Error('not available')) });

    expect(await screen.findByText('install MetaMask')).toBeInTheDocument();
    expect(mockGetAccount).not.toHaveBeenCalled();
  });

  it('treats a synchronously throwing isSupported as unsupported', async () => {
    renderBase({
      autoConnect: true,
      isSupported: () => {
        throw new Error('no provider');
      },
    });

    expect(await screen.findByText('install MetaMask')).toBeInTheDocument();
    expect(screen.queryByText('loading')).not.toBeInTheDocument();
    expect(mockGetAccount).not.toHaveBeenCalled();
  });
});

describe('ConnectBase connect', () => {
  it('uses the chain passed to connect when the wallet supports it', async () => {
    await renderReady();

    await act(() => content().connect(Blockchain.POLYGON));

    expect(mockGetAccount).toHaveBeenCalledWith(WalletType.META_MASK, Blockchain.POLYGON, false);
  });

  it('falls back to the first wallet chain when the requested chain is not supported', async () => {
    await renderReady({ blockchain: Blockchain.BITCOIN });

    await act(() => content().connect());

    expect(mockGetAccount).toHaveBeenCalledWith(WalletType.META_MASK, Blockchain.ETHEREUM, false);
  });

  it('falls back to the first wallet chain when no chain is given', async () => {
    await renderReady({ blockchain: undefined });

    await act(() => content().connect());

    expect(mockGetAccount).toHaveBeenCalledWith(WalletType.META_MASK, Blockchain.ETHEREUM, false);
  });

  it('rejects when no blockchain can be determined for the wallet', async () => {
    await renderReady({ wallet: WalletType.MAIL, blockchain: undefined });

    await act(async () => {
      await expect(content().connect()).rejects.toThrow('No blockchain');
    });

    expect(mockGetAccount).not.toHaveBeenCalled();
  });

  it('marks the connect as a reconnect when the wallet is already active', async () => {
    mockActiveWallet = WalletType.META_MASK;
    await renderReady();

    await act(() => content().connect());

    expect(mockGetAccount).toHaveBeenCalledWith(WalletType.META_MASK, Blockchain.ETHEREUM, true);
  });

  it('cancels when the wallet aborts', async () => {
    mockGetAccount.mockRejectedValue(new AbortError('User cancelled'));
    await renderReady();

    await act(() => content().connect());

    expect(mockOnCancel).toHaveBeenCalled();
    expect(content().isConnecting).toBe(false);
    expect(content().error).toBeUndefined();
  });

  it('does not call onCancel when AbortError arrives after unmount', async () => {
    let rejectAccount: (error: Error) => void = () => undefined;
    mockGetAccount.mockReturnValue(new Promise<never>((_resolve, reject) => (rejectAccount = reject)));
    const { unmount } = await renderReady();

    act(() => {
      content().connect();
    });

    unmount();

    await act(async () => rejectAccount(new AbortError('Forwarded to Phantom app')));

    expect(mockOnCancel).not.toHaveBeenCalled();
  });

  it('does not log in when getAccount resolves after unmount', async () => {
    let resolveAccount: (account: { address: string }) => void = () => undefined;
    mockGetAccount.mockReturnValue(new Promise((resolve) => (resolveAccount = resolve)));
    const { unmount } = await renderReady();

    act(() => {
      content().connect();
    });

    unmount();

    await act(async () => resolveAccount({ address: '0xabc' }));

    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockSwitchBlockchain).not.toHaveBeenCalled();
    expect(mockOnLogin).not.toHaveBeenCalled();
  });

  // Declared pre-existing defect (see the pull request description): the WalletSwitchError branch does not
  // chain the retried getAccount promise, so its result is dropped and a rejection is unhandled. The
  // assertions below record what the code does today, not what it should do.
  it('switches the wallet and requests the account there on a wallet switch error', async () => {
    mockGetAccount
      .mockRejectedValueOnce(new WalletSwitchError(WalletType.ALBY))
      .mockResolvedValueOnce({ address: 'x' });
    await renderReady();

    await act(() => content().connect());

    expect(mockOnSwitch).toHaveBeenCalledWith(WalletType.ALBY);
    expect(mockGetAccount).toHaveBeenLastCalledWith(WalletType.ALBY, Blockchain.ETHEREUM, false);
    expect(mockOnLogin).not.toHaveBeenCalled();
  });

  it('shows the message of any other connect error', async () => {
    mockGetAccount.mockRejectedValue(new Error('Provider not set or invalid'));
    await renderReady();

    await act(() => content().connect());

    expect(screen.getByText('error: Provider not set or invalid')).toBeInTheDocument();
    expect(screen.queryByText('connecting')).not.toBeInTheDocument();
    expect(mockOnLogin).not.toHaveBeenCalled();
  });

  it('clears the previous error when connecting again', async () => {
    mockGetAccount.mockRejectedValueOnce(new Error('first failure')).mockReturnValueOnce(new Promise(() => undefined));
    await renderReady();

    await act(() => content().connect());
    expect(screen.getByText('error: first failure')).toBeInTheDocument();

    act(() => {
      content().connect();
    });

    expect(screen.queryByText('error: first failure')).not.toBeInTheDocument();
    expect(screen.getByText('connecting')).toBeInTheDocument();
  });
});

describe('ConnectBase login', () => {
  it('only switches the blockchain when the active wallet returns the session address', async () => {
    mockActiveWallet = WalletType.META_MASK;
    mockSession = { address: '0xABC' };
    await renderReady();

    await act(() => content().connect(Blockchain.POLYGON));

    expect(mockSwitchBlockchain).toHaveBeenCalledWith(Blockchain.POLYGON);
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockOnLogin).toHaveBeenCalled();
  });

  it.each([
    ['another wallet is active', WalletType.ALBY, { address: '0xabc' }],
    ['the address differs from the session', WalletType.META_MASK, { address: '0xdef' }],
    ['the session has no address', WalletType.META_MASK, {}],
    ['there is no session', WalletType.META_MASK, undefined],
  ])('logs out and logs in again when %s', async (_case, activeWallet, session) => {
    mockActiveWallet = activeWallet;
    mockSession = session;
    await renderReady();

    await act(() => content().connect());

    expect(mockSwitchBlockchain).not.toHaveBeenCalled();
    expect(mockLogout).toHaveBeenCalled();
    expect(mockLogin).toHaveBeenCalledWith(
      WalletType.META_MASK,
      '0xabc',
      Blockchain.ETHEREUM,
      expect.any(Function),
      undefined,
    );
    expect(mockOnLogin).toHaveBeenCalled();
  });

  it('logs in without logging out or switching the blockchain on an explicit connect', async () => {
    mockActiveWallet = WalletType.META_MASK;
    mockSession = { address: '0xabc' };
    mockGetAccount.mockResolvedValue({ address: '0xabc', key: 'public-key' });
    await renderReady({ isConnect: true });

    await act(() => content().connect());

    expect(mockSwitchBlockchain).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockLogin).toHaveBeenCalledWith(
      WalletType.META_MASK,
      '0xabc',
      Blockchain.ETHEREUM,
      expect.any(Function),
      'public-key',
    );
  });

  it('sets the session when the wallet returns a session', async () => {
    mockActiveWallet = WalletType.META_MASK;
    mockGetAccount.mockResolvedValue({ session: 'access-token' });
    await renderReady();

    await act(() => content().connect());

    expect(mockSwitchBlockchain).not.toHaveBeenCalled();
    expect(mockLogout).toHaveBeenCalled();
    expect(mockSetSession).toHaveBeenCalledWith('access-token', WalletType.META_MASK, Blockchain.ETHEREUM);
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockOnLogin).toHaveBeenCalled();
  });

  it('uses the signature the account already carries', async () => {
    mockGetAccount.mockResolvedValue({ address: '0xabc', signature: 'existing-signature' });
    mockLogin.mockImplementation((_wallet, address, _chain, sign) => sign(address, 'message'));
    await renderReady();

    await act(() => content().connect());

    await expect(mockLogin.mock.results[0].value).resolves.toBe('existing-signature');
    expect(mockSignMessage).not.toHaveBeenCalled();
  });

  it('asks the wallet to sign and shows the sign hint while it does', async () => {
    let resolveSignature: (signature: string) => void = () => undefined;
    mockSignMessage.mockReturnValue(new Promise<string>((resolve) => (resolveSignature = resolve)));
    mockGetAccount.mockResolvedValue({ address: '0xabc', accountIndex: 1, index: 2, type: BitcoinAddressType.TAPROOT });
    mockLogin.mockImplementation((_wallet, address, _chain, sign) => sign(address, 'message'));
    await renderReady();

    act(() => {
      content().connect();
    });

    expect(await screen.findByText('sign hint')).toBeInTheDocument();
    expect(screen.getByText('content').parentElement).toHaveClass('hidden');
    expect(mockSignMessage).toHaveBeenCalledWith(
      'message',
      '0xabc',
      Blockchain.ETHEREUM,
      1,
      2,
      BitcoinAddressType.TAPROOT,
    );

    await act(async () => resolveSignature('wallet-signature'));

    expect(screen.queryByText('sign hint')).not.toBeInTheDocument();
    await expect(mockLogin.mock.results[0].value).resolves.toBe('wallet-signature');
    expect(mockOnLogin).toHaveBeenCalled();
  });

  it('keeps the wallet signature request running after unmount', async () => {
    let resolveSignature: (signature: string) => void = () => undefined;
    mockSignMessage.mockReturnValue(new Promise<string>((resolve) => (resolveSignature = resolve)));
    mockGetAccount.mockResolvedValue({ address: '0xabc', accountIndex: 1, index: 2, type: BitcoinAddressType.TAPROOT });
    mockLogin.mockImplementation((_wallet, address, _chain, sign) => sign(address, 'message'));
    const { unmount } = await renderReady();

    act(() => {
      content().connect();
    });

    expect(await screen.findByText('sign hint')).toBeInTheDocument();

    unmount();

    await act(async () => resolveSignature('wallet-signature'));

    await expect(mockLogin.mock.results[0].value).resolves.toBe('wallet-signature');
    expect(mockOnLogin).not.toHaveBeenCalled();
  });

  it('keeps requesting the wallet signature when sign is requested after unmount', async () => {
    let requestSign: (address: string, message: string) => Promise<string> = () => Promise.resolve('');
    mockSignMessage.mockResolvedValue('wallet-signature');
    mockGetAccount.mockResolvedValue({ address: '0xabc' });
    mockLogin.mockImplementation((_wallet, _address, _chain, sign) => {
      requestSign = sign;
      return new Promise(() => undefined);
    });
    const { unmount } = await renderReady();

    act(() => {
      content().connect();
    });

    await waitFor(() => expect(mockLogin).toHaveBeenCalled());

    unmount();

    await act(async () => {
      await requestSign('0xabc', 'message');
    });

    expect(screen.queryByText('sign hint')).not.toBeInTheDocument();
    expect(mockSignMessage).toHaveBeenCalledWith(
      'message',
      '0xabc',
      Blockchain.ETHEREUM,
      undefined,
      undefined,
      undefined,
    );
  });
});
