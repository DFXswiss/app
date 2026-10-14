// A cancel in the wallet during connect or login ends like the MetaMask cancel: no error is shown or reported, and the
// user is back at the wallet selection. Each wallet runs its real connect component and hook; only the wallet or SDK
// below the hook is replaced, answering the way it does when the user cancels.

const mockReportClientError = jest.fn();
const mockLogin = jest.fn();
const mockLogout = jest.fn();
const mockOnLogin = jest.fn();
const mockOnCancel = jest.fn();
const mockOnSwitch = jest.fn();

const mockWagmiConnect = jest.fn();
const mockWagmiDisconnect = jest.fn();
const mockWagmiSignMessage = jest.fn();
const mockConnector = { id: 'walletConnect', getProvider: () => Promise.resolve({ events: { on: () => undefined } }) };

interface MockAdapter {
  readyState: string;
  publicKey: { toBase58: () => string } | null;
  address: string | null;
  connect: jest.Mock;
  signMessage: jest.Mock;
}

function createMockAdapter(): MockAdapter {
  return { readyState: 'Installed', publicKey: null, address: null, connect: jest.fn(), signMessage: jest.fn() };
}

const mockPhantomAdapter = createMockAdapter();
const mockTrustSolAdapter = createMockAdapter();
const mockTronLinkAdapter = createMockAdapter();
const mockTrustTrxAdapter = createMockAdapter();

jest.mock('@dfx.swiss/react', () => ({
  AssetType: { COIN: 'Coin', TOKEN: 'Token' },
  Blockchain: { ETHEREUM: 'Ethereum', POLYGON: 'Polygon', SOLANA: 'Solana', TRON: 'Tron' },
  useAuthContext: () => ({ session: undefined }),
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
  StyledButtonWidth: { MIN: 'min' },
  StyledLoadingSpinner: () => null,
  StyledSearchInput: () => null,
  StyledVerticalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('react-device-detect', () => ({ isMobile: false }));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('../contexts/wallet.context', () => {
  const WalletBlockchains: Record<string, string[]> = {
    MetaMask: ['Ethereum', 'Polygon'],
    WalletConnect: ['Ethereum'],
    PhantomSol: ['Solana'],
    TrustSol: ['Solana'],
    TronLinkTrx: ['Tron'],
    TrustTrx: ['Tron'],
  };

  return {
    WalletType: {
      META_MASK: 'MetaMask',
      WALLET_CONNECT: 'WalletConnect',
      PHANTOM_SOL: 'PhantomSol',
      TRUST_SOL: 'TrustSol',
      TRONLINK_TRX: 'TronLinkTrx',
      TRUST_TRX: 'TrustTrx',
    },
    WalletBlockchains,
    supportsBlockchain: (wallet: string, blockchain: string) => WalletBlockchains[wallet]?.includes(blockchain),
    useWalletContext: () => ({ login: mockLogin, activeWallet: undefined }),
  };
});

jest.mock('../components/home/sign-hint', () => ({ SignHint: () => null }));

jest.mock('src/util/client-error', () => ({
  ...jest.requireActual('src/util/client-error'),
  reportClientError: (...args: unknown[]) => mockReportClientError(...args),
}));

jest.mock('../hooks/web3.hook', () => ({
  useWeb3: () => ({
    toBlockchain: (chainId: string | number) => (Number(chainId) === 1 ? 'Ethereum' : 'Polygon'),
    toChainHex: (blockchain: string) => (blockchain === 'Ethereum' ? '0x1' : '0x89'),
    toChainId: () => '1',
    toChainObject: () => ({ chainId: '0x89' }),
  }),
}));

// the real viem, which needs the encoders jsdom does not provide
jest.mock('viem', () => {
  const { TextDecoder, TextEncoder } = jest.requireActual('util');
  Object.assign(global, { TextDecoder, TextEncoder });
  return jest.requireActual('viem');
});

jest.mock('../wagmi.config', () => ({ config: {}, WALLET_CONNECT_PROJECT_ID: 'test' }));

jest.mock('@wagmi/core', () => ({
  BaseError: class BaseError extends Error {},
  getAccount: () => ({ isDisconnected: false }),
  getConnectors: () => [mockConnector],
  connect: (...args: unknown[]) => mockWagmiConnect(...args),
  disconnect: (...args: unknown[]) => mockWagmiDisconnect(...args),
  reconnect: () => Promise.resolve(),
  signMessage: (...args: unknown[]) => mockWagmiSignMessage(...args),
}));

jest.mock('@solana/wallet-adapter-phantom', () => ({
  PhantomWalletAdapter: function PhantomWalletAdapter() {
    return mockPhantomAdapter;
  },
}));

jest.mock('@solana/wallet-adapter-trust', () => ({
  TrustWalletAdapter: function TrustWalletAdapter() {
    return mockTrustSolAdapter;
  },
}));

jest.mock('../hooks/solana.hook', () => ({ useSolana: () => ({}) }));

jest.mock('../hooks/tron.hook', () => ({ useTron: () => ({}) }));

jest.mock('ethers', () => ({ encodeBase58: () => 'signature' }));

jest.mock('@tronweb3/tronwallet-abstract-adapter', () => ({
  ...jest.requireActual('@tronweb3/tronwallet-abstract-adapter'),
  isInMobileBrowser: () => false,
}));

jest.mock('@tronweb3/tronwallet-adapter-tronlink', () => ({
  TronLinkAdapter: function TronLinkAdapter() {
    return mockTronLinkAdapter;
  },
  supportTronLink: () => true,
  isInTronLinkApp: () => false,
}));

jest.mock('@tronweb3/tronwallet-adapter-trust', () => ({
  TrustAdapter: function TrustAdapter() {
    return mockTrustTrxAdapter;
  },
  supportTrust: () => true,
  isTrustApp: () => false,
}));

import { Blockchain } from '@dfx.swiss/react';
import { WalletConnectionError as SolanaConnectionError, WalletSignMessageError } from '@solana/wallet-adapter-base';
import { getDefaultNormalizer, render, screen, waitFor } from '@testing-library/react';
import { WalletConnectionError as TronConnectionError } from '@tronweb3/tronwallet-abstract-adapter';
import { createRef } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { UserRejectedRequestError } from 'viem';
import Web3 from 'web3';
import ConnectMetaMask from '../components/home/wallet/connect-metamask';
import ConnectPhantom from '../components/home/wallet/connect-phantom';
import ConnectTronLinkTrx from '../components/home/wallet/connect-tronlink-trx';
import ConnectTrustSol from '../components/home/wallet/connect-trust-sol';
import ConnectTrustTrx from '../components/home/wallet/connect-trust-trx';
import ConnectWalletConnect from '../components/home/wallet/connect-wallet-connect';
import { ConnectProps } from '../components/home/connect-shared';
import { WalletType } from '../contexts/wallet.context';

const ADDRESS = '0x1234567890123456789012345678901234567890';

type ConnectComponent = (props: ConnectProps) => JSX.Element;

function renderConnect(Component: ConnectComponent, wallet: WalletType, blockchain: Blockchain) {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Component
        rootRef={createRef<HTMLDivElement>()}
        wallet={wallet}
        blockchain={blockchain}
        isConnect={false}
        onLogin={mockOnLogin}
        onCancel={mockOnCancel}
        onSwitch={mockOnSwitch}
      />
    </MemoryRouter>,
  );
}

async function expectCancelled() {
  await waitFor(() => expect(mockOnCancel).toHaveBeenCalledTimes(1));
  // the report runs in an effect after the error is rendered, so give it the chance to happen
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(screen.queryByText('Connection failed!')).not.toBeInTheDocument();
  expect(mockReportClientError).not.toHaveBeenCalled();
  expect(mockOnLogin).not.toHaveBeenCalled();
}

async function expectFailed(message: string) {
  expect(await screen.findByText('Connection failed!')).toBeInTheDocument();
  // web3 appends the data of a failure on new lines, which the default matcher would collapse
  const normalizer = getDefaultNormalizer({ collapseWhitespace: false, trim: false });
  expect(screen.getByText(message, { normalizer })).toBeInTheDocument();
  await waitFor(() => expect(mockReportClientError).toHaveBeenCalledTimes(1));
  expect(mockReportClientError.mock.calls[0][0]).toMatchObject({ message, name: 'HandledError' });
  expect(mockOnCancel).not.toHaveBeenCalled();
}

// the login asks for the signature right away, as the wallet context does after fetching the sign message
function loginSigns() {
  mockLogin.mockImplementation(
    (_wallet: string, address: string, _chain: string, onSign: (a: string, m: string) => Promise<string>) =>
      onSign(address, 'sign this'),
  );
}

const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  mockLogin.mockResolvedValue(undefined);
  mockLogout.mockResolvedValue(undefined);
  (global as any).fetch = jest.fn().mockRejectedValue(new Error('offline'));
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);

  for (const adapter of [mockPhantomAdapter, mockTrustSolAdapter, mockTronLinkAdapter, mockTrustTrxAdapter]) {
    adapter.publicKey = { toBase58: () => 'SoLAddress' };
    adapter.address = 'TAddress';
    adapter.connect.mockReset().mockResolvedValue(undefined);
    adapter.signMessage.mockReset().mockResolvedValue(new Uint8Array([1]));
  }
});

afterEach(() => {
  jest.restoreAllMocks();
  global.fetch = originalFetch;
});

describe('MetaMask and other injected EVM wallets (through web3)', () => {
  // How an injected wallet rejects: a plain object, not an Error, carrying the EIP-1193 code and often data.
  // web3 turns such an object into a new Error with the data appended to the message and drops the code.
  function rejection(code: number, message: string, data?: unknown) {
    return data === undefined ? { code, message } : { code, message, data };
  }

  let provider: { request: jest.Mock; on: jest.Mock; isMetaMask: boolean };
  let givenProvider: unknown;

  function answer(method: string, handler: () => Promise<unknown>) {
    const previous = provider.request.getMockImplementation();
    provider.request.mockImplementation((args: { method: string }) =>
      args.method === method ? handler() : previous?.(args),
    );
  }

  beforeEach(() => {
    provider = { request: jest.fn(), on: jest.fn(), isMetaMask: true };
    provider.request.mockImplementation(({ method }: { method: string }) => {
      switch (method) {
        case 'eth_accounts':
        case 'eth_requestAccounts':
          return Promise.resolve([ADDRESS]);
        case 'eth_chainId':
          return Promise.resolve('0x1');
        case 'personal_sign':
          return Promise.resolve('0xsignature');
      }
      return Promise.reject(new Error(`unexpected ${method}`));
    });

    (window as any).ethereum = provider;
    // its keccak rejects the Uint8Array of jsdom, and the address is checksummed already
    jest.spyOn(Web3.utils, 'toChecksumAddress').mockImplementation((address: string) => address);
    givenProvider = (Web3 as any).givenProvider;
    (Web3 as any).givenProvider = provider;
  });

  afterEach(() => {
    delete (window as any).ethereum;
    (Web3 as any).givenProvider = givenProvider;
  });

  it.each([
    ['without data', undefined],
    ['with the cause of a reject-all', { cause: 'rejectAllApprovals' }],
    ['with the confirmation location', { location: 'confirmation', cause: null }],
    ['with the throttle location', { location: 'origin_throttle_modal', cause: null }],
  ])('a cancelled account request %s is no error', async (_case, data) => {
    answer('eth_requestAccounts', () => Promise.reject(rejection(4001, 'User rejected the request.', data)));

    renderConnect(ConnectMetaMask, WalletType.META_MASK, Blockchain.ETHEREUM);

    await expectCancelled();
  });

  it.each([
    ['without data', undefined],
    ['with the cause of a reject-all', { cause: 'rejectAllApprovals' }],
    ['with the confirmation location', { location: 'confirmation', cause: null }],
  ])('a cancelled login signature %s is no error', async (_case, data) => {
    loginSigns();
    answer('personal_sign', () => Promise.reject(rejection(4001, 'User rejected the request.', data)));

    renderConnect(ConnectMetaMask, WalletType.META_MASK, Blockchain.ETHEREUM);

    await expectCancelled();
    expect(provider.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'personal_sign' }));
  });

  it('a cancelled request to add the chain is no error', async () => {
    answer('wallet_switchEthereumChain', () => Promise.reject(rejection(4902, 'Unrecognized chain ID.')));
    answer('wallet_addEthereumChain', () =>
      Promise.reject(rejection(4001, 'User rejected the request.', { location: 'confirmation', cause: null })),
    );

    renderConnect(ConnectMetaMask, WalletType.META_MASK, Blockchain.POLYGON);

    await expectCancelled();
  });

  it('a failed login signature is still shown and reported', async () => {
    loginSigns();
    answer('personal_sign', () => Promise.reject(rejection(-32603, 'Internal error', { reason: 'locked' })));

    renderConnect(ConnectMetaMask, WalletType.META_MASK, Blockchain.ETHEREUM);

    await expectFailed('Internal error\n{\n  "reason": "locked"\n}');
  });

  it('a pending request is still shown with its hint', async () => {
    answer('eth_requestAccounts', () => Promise.reject(rejection(-32002, 'Already processing eth_requestAccounts.')));

    renderConnect(ConnectMetaMask, WalletType.META_MASK, Blockchain.ETHEREUM);

    await expectFailed('There is already a request pending. Please confirm it in your MetaMask and retry.');
  });

  it('a failed request to add the chain is still shown and reported', async () => {
    answer('wallet_switchEthereumChain', () => Promise.reject(rejection(4902, 'Unrecognized chain ID.')));
    answer('wallet_addEthereumChain', () => Promise.reject(rejection(-32602, 'Invalid chain parameters.')));

    renderConnect(ConnectMetaMask, WalletType.META_MASK, Blockchain.POLYGON);

    await expectFailed('Invalid chain parameters.');
  });
});

describe('WalletConnect', () => {
  it('a rejected session proposal is no error', async () => {
    mockWagmiConnect.mockRejectedValue(new UserRejectedRequestError(new Error('User rejected.')));

    renderConnect(ConnectWalletConnect, WalletType.WALLET_CONNECT, Blockchain.ETHEREUM);

    await expectCancelled();
  });

  it('a rejected login signature is no error', async () => {
    loginSigns();
    mockWagmiConnect.mockResolvedValue({ accounts: [ADDRESS] });
    mockWagmiSignMessage.mockRejectedValue(new UserRejectedRequestError(new Error('User rejected.')));

    renderConnect(ConnectWalletConnect, WalletType.WALLET_CONNECT, Blockchain.ETHEREUM);

    await expectCancelled();
    expect(mockWagmiSignMessage).toHaveBeenCalled();
  });

  it('a failed login signature is still shown and reported', async () => {
    loginSigns();
    mockWagmiConnect.mockResolvedValue({ accounts: [ADDRESS] });
    mockWagmiSignMessage.mockRejectedValue(
      Object.assign(new Error('long message'), { shortMessage: 'Request expired.' }),
    );

    renderConnect(ConnectWalletConnect, WalletType.WALLET_CONNECT, Blockchain.ETHEREUM);

    await expectFailed('Request expired.');
  });
});

describe.each([
  ['Phantom', ConnectPhantom, WalletType.PHANTOM_SOL, mockPhantomAdapter],
  ['Trust (Solana)', ConnectTrustSol, WalletType.TRUST_SOL, mockTrustSolAdapter],
])('%s', (_name, Component, wallet, adapter) => {
  // the adapter wraps the wallet's own error, which carries the EIP-1193 code
  const walletRejection = { code: 4001, message: 'User rejected the request.' };

  it('a rejected connection is no error', async () => {
    adapter.connect.mockRejectedValue(new SolanaConnectionError(walletRejection.message, walletRejection));

    renderConnect(Component, wallet, Blockchain.SOLANA);

    await expectCancelled();
  });

  it('a rejected login signature is no error', async () => {
    loginSigns();
    adapter.signMessage.mockRejectedValue(new WalletSignMessageError(walletRejection.message, walletRejection));

    renderConnect(Component, wallet, Blockchain.SOLANA);

    await expectCancelled();
  });

  it('a failed connection is still shown and reported', async () => {
    adapter.connect.mockRejectedValue(
      new SolanaConnectionError('Unexpected error', { code: -32603, message: 'Unexpected error' }),
    );

    renderConnect(Component, wallet, Blockchain.SOLANA);

    await expectFailed('Unexpected error');
  });
});

describe.each([
  ['TronLink', ConnectTronLinkTrx, WalletType.TRONLINK_TRX, mockTronLinkAdapter],
  ['Trust (Tron)', ConnectTrustTrx, WalletType.TRUST_TRX, mockTrustTrxAdapter],
])('%s', (_name, Component, wallet, adapter) => {
  it('a rejected connection answered with an error is no error', async () => {
    const walletRejection = { code: 4001, message: 'User rejected the request.' };
    adapter.connect.mockRejectedValue(new TronConnectionError('The user rejected connection.', walletRejection));

    renderConnect(Component, wallet, Blockchain.TRON);

    await expectCancelled();
  });

  it('a rejected connection answered with a result is no error', async () => {
    // the adapter keeps only its own message: it throws it inside its request and wraps it again
    const inner = new TronConnectionError('The user rejected connection.');
    adapter.connect.mockRejectedValue(new TronConnectionError(inner.message, inner));

    renderConnect(Component, wallet, Blockchain.TRON);

    await expectCancelled();
  });

  it('a failed connection is still shown and reported', async () => {
    adapter.connect.mockRejectedValue(new TronConnectionError('Cannot connect wallet.'));

    renderConnect(Component, wallet, Blockchain.TRON);

    await expectFailed('Cannot connect wallet.');
  });
});
