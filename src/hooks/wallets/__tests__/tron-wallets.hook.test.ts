// Hooks for the Tron browser wallets (Trust, TronLink): wallet detection, which must match what the
// adapter's connect can actually reach, and the connect, sign and transaction calls around the adapter.

interface MockTronAdapter {
  address: string | null;
  connect: jest.Mock;
  signMessage: jest.Mock;
  signTransaction: jest.Mock;
}

function createMockAdapter(): MockTronAdapter {
  return { address: null, connect: jest.fn(), signMessage: jest.fn(), signTransaction: jest.fn() };
}

const mockTrustAdapter = createMockAdapter();
const mockTronLinkAdapter = createMockAdapter();
const mockAdapterCreated = jest.fn();
const mockIsInMobileBrowser = jest.fn();
const mockSupportTrust = jest.fn();
const mockIsTrustApp = jest.fn();
const mockSupportTronLink = jest.fn();
const mockIsInTronLinkApp = jest.fn();
const mockCreateCoinTransaction = jest.fn();
const mockCreateTokenTransaction = jest.fn();
const mockBroadcastTransaction = jest.fn();
const mockDelay = jest.fn();

jest.mock('@dfx.swiss/react', () => ({ AssetType: { COIN: 'Coin', TOKEN: 'Token' } }));

jest.mock('@tronweb3/tronwallet-abstract-adapter', () => ({ isInMobileBrowser: () => mockIsInMobileBrowser() }));

// plain constructor functions: CRA resets jest.fn implementations before every test
jest.mock('@tronweb3/tronwallet-adapter-trust', () => ({
  TrustAdapter: function TrustAdapter(config?: unknown) {
    mockAdapterCreated('Trust', config);
    return mockTrustAdapter;
  },
  supportTrust: () => mockSupportTrust(),
  isTrustApp: () => mockIsTrustApp(),
}));

jest.mock('@tronweb3/tronwallet-adapter-tronlink', () => ({
  TronLinkAdapter: function TronLinkAdapter(config?: unknown) {
    mockAdapterCreated('TronLink', config);
    return mockTronLinkAdapter;
  },
  supportTronLink: () => mockSupportTronLink(),
  isInTronLinkApp: () => mockIsInTronLinkApp(),
}));

jest.mock('../../tron.hook', () => ({
  useTron: () => ({
    createCoinTransaction: mockCreateCoinTransaction,
    createTokenTransaction: mockCreateTokenTransaction,
    broadcastTransaction: mockBroadcastTransaction,
  }),
}));

jest.mock('../../../util/utils', () => ({ delay: (...args: unknown[]) => mockDelay(...args) }));

import { Asset, AssetType } from '@dfx.swiss/react';
import { renderHook } from '@testing-library/react';
import BigNumber from 'bignumber.js';
import { AbortError } from '../../../util/abort-error';
import { useTronLinkTrx } from '../tronlink-trx.hook';
import { useTrustTrx } from '../trust-trx.hook';

const mobileMatch = ['iPhone'];

beforeEach(() => {
  jest.clearAllMocks();
  mockDelay.mockResolvedValue(undefined);

  for (const adapter of [mockTrustAdapter, mockTronLinkAdapter]) {
    adapter.address = null;
    adapter.connect.mockReset();
    adapter.signMessage.mockReset();
    adapter.signTransaction.mockReset();
  }
});

describe('adapter construction', () => {
  it('gives Trust a checkTimeout that outlives isAvailable, and leaves TronLink on the package default', () => {
    renderHook(() => useTrustTrx());
    renderHook(() => useTronLinkTrx());

    expect(mockAdapterCreated).toHaveBeenCalledWith('Trust', { checkTimeout: 3000 });
    expect(mockAdapterCreated).toHaveBeenCalledWith('TronLink', undefined);
  });
});

describe.each([
  {
    name: 'useTrustTrx',
    useHook: useTrustTrx,
    walletName: 'Trust',
    mockSupport: mockSupportTrust,
    mockInWalletApp: mockIsTrustApp,
  },
  {
    name: 'useTronLinkTrx',
    useHook: useTronLinkTrx,
    walletName: 'TronLink',
    mockSupport: mockSupportTronLink,
    mockInWalletApp: mockIsInTronLinkApp,
  },
])('$name isInstalled', ({ useHook, walletName, mockSupport, mockInWalletApp }) => {
  it.each([
    [`${walletName} is injected into the page`, true, null, false, true],
    [`a mobile browser outside the ${walletName} app, where connect opens that app`, false, mobileMatch, false, true],
    [`the ${walletName} app without an injected wallet`, false, mobileMatch, true, true],
    [`the ${walletName} app on desktop without an injected wallet`, false, null, true, true],
    [`a desktop browser without ${walletName}`, false, null, false, false],
    ['no browser at all', false, false, false, false],
  ])('for %s', (_case, isSupported, mobileBrowser, isInWalletApp, expected) => {
    mockSupport.mockReturnValue(isSupported);
    mockIsInMobileBrowser.mockReturnValue(mobileBrowser);
    mockInWalletApp.mockReturnValue(isInWalletApp);

    expect(renderHook(() => useHook()).result.current.isInstalled()).toBe(expected);
  });
});

describe.each([
  {
    name: 'useTrustTrx',
    useHook: useTrustTrx,
    mockSupport: mockSupportTrust,
    mockInWalletApp: mockIsTrustApp,
  },
  {
    name: 'useTronLinkTrx',
    useHook: useTronLinkTrx,
    mockSupport: mockSupportTronLink,
    mockInWalletApp: mockIsInTronLinkApp,
  },
])('$name isAvailable', ({ useHook, mockSupport, mockInWalletApp }) => {
  beforeEach(() => {
    mockSupport.mockReturnValue(false);
    mockIsInMobileBrowser.mockReturnValue(false);
    mockInWalletApp.mockReturnValue(false);
  });

  it('resolves true immediately when the wallet is already detected', async () => {
    mockSupport.mockReturnValue(true);

    const { result } = renderHook(() => useHook());

    await expect(result.current.isAvailable()).resolves.toBe(true);
    expect(mockDelay).not.toHaveBeenCalled();
  });

  it('resolves true when the wallet appears after a few delay attempts', async () => {
    let calls = 0;
    mockDelay.mockImplementation(async () => {
      calls += 1;
      if (calls === 3) {
        mockSupport.mockReturnValue(true);
      }
    });

    const { result } = renderHook(() => useHook());

    await expect(result.current.isAvailable()).resolves.toBe(true);
    expect(mockDelay).toHaveBeenCalled();
    expect(mockDelay.mock.calls.every((call) => call[0] === 0.1)).toBe(true);
  });

  it('resolves false after 20 attempts when the wallet never appears', async () => {
    const { result } = renderHook(() => useHook());

    await expect(result.current.isAvailable()).resolves.toBe(false);
    expect(mockDelay).toHaveBeenCalledTimes(20);
    expect(mockDelay.mock.calls.every((call) => call[0] === 0.1)).toBe(true);
  });

  it('resolves true when the wallet appears during the last delay', async () => {
    let calls = 0;
    mockDelay.mockImplementation(async () => {
      calls += 1;
      if (calls === 20) {
        mockSupport.mockReturnValue(true);
      }
    });

    const { result } = renderHook(() => useHook());

    await expect(result.current.isAvailable()).resolves.toBe(true);
    expect(mockDelay).toHaveBeenCalledTimes(20);
    expect(mockDelay.mock.calls.every((call) => call[0] === 0.1)).toBe(true);
  });
});

describe.each([
  {
    name: 'useTrustTrx',
    useHook: useTrustTrx,
    walletName: 'Trust',
    adapter: mockTrustAdapter,
    mockSupport: mockSupportTrust,
    mockInWalletApp: mockIsTrustApp,
    abortMessage: 'Forwarded to Trust app',
  },
  {
    name: 'useTronLinkTrx',
    useHook: useTronLinkTrx,
    walletName: 'TronLink',
    adapter: mockTronLinkAdapter,
    mockSupport: mockSupportTronLink,
    mockInWalletApp: mockIsInTronLinkApp,
    abortMessage: 'Forwarded to TronLink app',
  },
])('$name', ({ useHook, walletName, adapter, mockSupport, mockInWalletApp, abortMessage }) => {
  function setup() {
    return renderHook(() => useHook()).result.current;
  }

  it('creates its adapter once', () => {
    const { rerender } = renderHook(() => useHook());
    rerender();

    expect(mockAdapterCreated).toHaveBeenCalledTimes(1);
    expect(mockAdapterCreated.mock.calls[0][0]).toBe(walletName);
  });

  describe('connect', () => {
    it('returns the address of the connected wallet', async () => {
      adapter.connect.mockImplementation(async () => {
        adapter.address = 'TronAddress';
      });

      await expect(setup().connect()).resolves.toBe('TronAddress');
    });

    it('fails when the wallet provides no address', async () => {
      adapter.connect.mockResolvedValue(undefined);

      await expect(setup().connect()).rejects.toThrow('No address found');
    });

    it('rethrows the wallet error message', async () => {
      mockSupport.mockReturnValue(true);
      mockIsInMobileBrowser.mockReturnValue(false);
      mockInWalletApp.mockReturnValue(false);
      adapter.connect.mockRejectedValue(new Error('The user rejected connection.'));

      await expect(setup().connect()).rejects.toThrow('The user rejected connection.');
    });

    it('uses a generic message when the wallet error has none', async () => {
      mockSupport.mockReturnValue(true);
      mockIsInMobileBrowser.mockReturnValue(false);
      mockInWalletApp.mockReturnValue(false);
      adapter.connect.mockRejectedValue({});

      await expect(setup().connect()).rejects.toThrow('An unexpected error occurred.');
    });

    it(`aborts after forwarding to the ${walletName} app on mobile`, async () => {
      mockSupport.mockReturnValue(false);
      mockIsInMobileBrowser.mockReturnValue(mobileMatch);
      mockInWalletApp.mockReturnValue(false);
      adapter.connect.mockRejectedValue(new Error('Wallet not found'));

      const connectPromise = setup().connect();
      await expect(connectPromise).rejects.toBeInstanceOf(AbortError);
      await expect(connectPromise).rejects.toHaveProperty('message', abortMessage);
      expect(mockDelay).toHaveBeenCalledWith(5);
    });

    it(`rethrows when already inside the ${walletName} app on mobile`, async () => {
      mockSupport.mockReturnValue(false);
      mockIsInMobileBrowser.mockReturnValue(mobileMatch);
      mockInWalletApp.mockReturnValue(true);
      adapter.connect.mockRejectedValue(new Error('The user rejected connection.'));

      await expect(setup().connect()).rejects.toThrow('The user rejected connection.');
      expect(mockDelay).not.toHaveBeenCalled();
    });

    it('rethrows the original error when the redirect predicate flips during connect', async () => {
      mockSupport.mockReturnValue(true);
      mockIsInMobileBrowser.mockReturnValue(false);
      mockInWalletApp.mockReturnValue(false);

      adapter.connect.mockImplementation(async () => {
        mockSupport.mockReturnValue(false);
        mockIsInMobileBrowser.mockReturnValue(mobileMatch);
        mockInWalletApp.mockReturnValue(false);
        throw new Error('The user rejected connection.');
      });

      await expect(setup().connect()).rejects.toThrow('The user rejected connection.');
      expect(mockDelay).not.toHaveBeenCalledWith(5);
    });
  });

  describe('signMessage', () => {
    it('returns the signature of the message', async () => {
      adapter.signMessage.mockResolvedValue('signature');

      await expect(setup().signMessage('TronAddress', 'message')).resolves.toBe('signature');
      expect(adapter.signMessage).toHaveBeenCalledWith('message');
    });

    it('rethrows the signing error message', async () => {
      adapter.signMessage.mockRejectedValue(new Error('Signing rejected'));

      await expect(setup().signMessage('TronAddress', 'message')).rejects.toThrow('Signing rejected');
    });
  });

  describe('createTransaction', () => {
    const amount = new BigNumber(10);

    beforeEach(() => {
      mockCreateCoinTransaction.mockResolvedValue('coin-transaction');
      mockCreateTokenTransaction.mockResolvedValue('token-transaction');
      adapter.signTransaction.mockImplementation(async (transaction: string) => `signed-${transaction}`);
      mockBroadcastTransaction.mockResolvedValue('transaction-id');
    });

    it('signs and broadcasts a coin transaction', async () => {
      const asset = { type: AssetType.COIN } as Asset;

      await expect(setup().createTransaction(amount, asset, 'from', 'to')).resolves.toBe('transaction-id');

      expect(mockCreateCoinTransaction).toHaveBeenCalledWith('from', 'to', amount);
      expect(mockCreateTokenTransaction).not.toHaveBeenCalled();
      expect(mockBroadcastTransaction).toHaveBeenCalledWith('signed-coin-transaction');
    });

    it('signs and broadcasts a token transaction', async () => {
      const asset = { type: AssetType.TOKEN } as Asset;

      await expect(setup().createTransaction(amount, asset, 'from', 'to')).resolves.toBe('transaction-id');

      expect(mockCreateTokenTransaction).toHaveBeenCalledWith('from', 'to', asset, amount);
      expect(mockCreateCoinTransaction).not.toHaveBeenCalled();
      expect(mockBroadcastTransaction).toHaveBeenCalledWith('signed-token-transaction');
    });

    it('rethrows the transaction error message', async () => {
      mockBroadcastTransaction.mockRejectedValue(new Error('Transaction expired'));

      await expect(setup().createTransaction(amount, { type: AssetType.COIN } as Asset, 'from', 'to')).rejects.toThrow(
        'Transaction expired',
      );
    });
  });
});
