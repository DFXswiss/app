// Hooks for the Solana browser wallets (Phantom, Trust): wallet detection, which must match what the
// adapter's connect can actually reach, and the connect, sign and transaction calls around the adapter.

import { TextEncoder as NodeTextEncoder } from 'util';

interface MockSolanaAdapter {
  readyState: string;
  publicKey: { toBase58: () => string } | null;
  connect: jest.Mock;
  signMessage: jest.Mock;
  signTransaction: jest.Mock;
}

function createMockAdapter(): MockSolanaAdapter {
  return { readyState: '', publicKey: null, connect: jest.fn(), signMessage: jest.fn(), signTransaction: jest.fn() };
}

const mockPhantomAdapter = createMockAdapter();
const mockTrustAdapter = createMockAdapter();
const mockAdapterCreated = jest.fn();
const mockCreateCoinTransaction = jest.fn();
const mockCreateTokenTransaction = jest.fn();
const mockBroadcastTransaction = jest.fn();
const mockDelay = jest.fn();

jest.mock('@dfx.swiss/react', () => ({ AssetType: { COIN: 'Coin', TOKEN: 'Token' } }));

// plain constructor functions: CRA resets jest.fn implementations before every test
jest.mock('@solana/wallet-adapter-phantom', () => ({
  PhantomWalletAdapter: function PhantomWalletAdapter() {
    mockAdapterCreated('Phantom');
    return mockPhantomAdapter;
  },
}));

jest.mock('@solana/wallet-adapter-trust', () => ({
  TrustWalletAdapter: function TrustWalletAdapter() {
    mockAdapterCreated('Trust');
    return mockTrustAdapter;
  },
}));

jest.mock('ethers', () => ({ encodeBase58: (bytes: Uint8Array) => `base58(${Array.from(bytes).join(',')})` }));

jest.mock('../../solana.hook', () => ({
  useSolana: () => ({
    createCoinTransaction: mockCreateCoinTransaction,
    createTokenTransaction: mockCreateTokenTransaction,
    broadcastTransaction: mockBroadcastTransaction,
  }),
}));

jest.mock('../../../util/utils', () => ({ delay: (...args: unknown[]) => mockDelay(...args) }));

import { Asset, AssetType } from '@dfx.swiss/react';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { renderHook } from '@testing-library/react';
import BigNumber from 'bignumber.js';
import { AbortError } from '../../../util/abort-error';
import { usePhantom } from '../phantom.hook';
import { useTrustSol } from '../trust-sol.hook';

(global as any).TextEncoder ??= NodeTextEncoder;

beforeEach(() => {
  jest.clearAllMocks();
  mockDelay.mockResolvedValue(undefined);

  for (const adapter of [mockPhantomAdapter, mockTrustAdapter]) {
    adapter.readyState = WalletReadyState.NotDetected;
    adapter.publicKey = null;
    adapter.connect.mockReset();
    adapter.signMessage.mockReset();
    adapter.signTransaction.mockReset();
  }
});

describe('usePhantom isInstalled', () => {
  it.each([
    [WalletReadyState.Installed, true],
    [WalletReadyState.Loadable, true],
    [WalletReadyState.NotDetected, false],
    [WalletReadyState.Unsupported, false],
  ])('treats the adapter state %s as %p', (readyState, expected) => {
    mockPhantomAdapter.readyState = readyState;

    expect(renderHook(() => usePhantom()).result.current.isInstalled()).toBe(expected);
  });
});

describe('useTrustSol isInstalled', () => {
  it.each([
    [WalletReadyState.Installed, true],
    [WalletReadyState.Loadable, false],
    [WalletReadyState.NotDetected, false],
    [WalletReadyState.Unsupported, false],
  ])('treats the adapter state %s as %p', (readyState, expected) => {
    mockTrustAdapter.readyState = readyState;

    expect(renderHook(() => useTrustSol()).result.current.isInstalled()).toBe(expected);
  });
});

describe('usePhantom connect redirect', () => {
  it('aborts after forwarding to the Phantom app when Loadable and no public key', async () => {
    mockPhantomAdapter.readyState = WalletReadyState.Loadable;
    mockPhantomAdapter.connect.mockResolvedValue(undefined);

    const connectPromise = renderHook(() => usePhantom()).result.current.connect();
    await expect(connectPromise).rejects.toBeInstanceOf(AbortError);
    await expect(connectPromise).rejects.toHaveProperty('message', 'Forwarded to Phantom app');
    expect(mockDelay).toHaveBeenCalledWith(5);
  });
});

describe('useTrustSol connect with Loadable', () => {
  it('still fails with no public key when Loadable', async () => {
    mockTrustAdapter.readyState = WalletReadyState.Loadable;
    mockTrustAdapter.connect.mockResolvedValue(undefined);

    await expect(renderHook(() => useTrustSol()).result.current.connect()).rejects.toThrow('No public key found');
    expect(mockDelay).not.toHaveBeenCalled();
  });
});

describe.each([
  { name: 'usePhantom', useHook: usePhantom, walletName: 'Phantom', adapter: mockPhantomAdapter },
  { name: 'useTrustSol', useHook: useTrustSol, walletName: 'Trust', adapter: mockTrustAdapter },
])('$name', ({ useHook, walletName, adapter }) => {
  function setup() {
    return renderHook(() => useHook()).result.current;
  }

  it('creates its adapter once', () => {
    const { rerender } = renderHook(() => useHook());
    rerender();

    expect(mockAdapterCreated).toHaveBeenCalledTimes(1);
    expect(mockAdapterCreated).toHaveBeenCalledWith(walletName);
  });

  it('reads the adapter state when asked, so a wallet detected later counts', () => {
    const { isInstalled } = setup();
    expect(isInstalled()).toBe(false);

    adapter.readyState = WalletReadyState.Installed;

    expect(isInstalled()).toBe(true);
  });

  describe('connect', () => {
    it('returns the public key of the connected wallet', async () => {
      adapter.connect.mockImplementation(async () => {
        adapter.publicKey = { toBase58: () => 'SolanaAddress' };
      });

      await expect(setup().connect()).resolves.toBe('SolanaAddress');
    });

    it('fails when the wallet provides no public key', async () => {
      adapter.connect.mockResolvedValue(undefined);

      await expect(setup().connect()).rejects.toThrow('No public key found');
    });

    it('rethrows the wallet error message', async () => {
      adapter.connect.mockRejectedValue(new Error('User rejected the request.'));

      await expect(setup().connect()).rejects.toThrow('User rejected the request.');
    });

    it('uses a generic message when the wallet error has none', async () => {
      adapter.connect.mockRejectedValue({});

      await expect(setup().connect()).rejects.toThrow('An unexpected error occurred.');
    });
  });

  describe('signMessage', () => {
    it('signs the encoded message and returns the signature in base58', async () => {
      adapter.signMessage.mockResolvedValue(new Uint8Array([1, 2, 3]));

      await expect(setup().signMessage('SolanaAddress', 'hi')).resolves.toBe('base58(1,2,3)');
      expect(Array.from(adapter.signMessage.mock.calls[0][0])).toEqual([104, 105]);
    });

    it('rethrows the signing error message', async () => {
      adapter.signMessage.mockRejectedValue(new Error('Signing rejected'));

      await expect(setup().signMessage('SolanaAddress', 'hi')).rejects.toThrow('Signing rejected');
    });
  });

  describe('createTransaction', () => {
    const amount = new BigNumber(1.5);

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
      mockBroadcastTransaction.mockRejectedValue(new Error('Blockhash not found'));

      await expect(setup().createTransaction(amount, { type: AssetType.COIN } as Asset, 'from', 'to')).rejects.toThrow(
        'Blockhash not found',
      );
    });
  });
});
