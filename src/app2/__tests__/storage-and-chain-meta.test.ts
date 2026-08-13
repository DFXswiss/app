jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {
    BITCOIN: 'Bitcoin',
    SEPOLIA: 'Sepolia',
    CITREA_TESTNET: 'CitreaTestnet',
    ETHEREUM: 'Ethereum',
    UNKNOWN: 'UnknownChain',
  },
}));

import { Blockchain } from '@dfx.swiss/react';
import { chainName, hashColor, isTestnetChain, mainnetOnly } from '../screens/trade/blockchain-meta';
import { clearWalletConnectIndexedDb, clearWalletConnectStorage } from '../wallets/storage';

describe('clearWalletConnectStorage', () => {
  it('removes only WalletConnect keys', () => {
    const store = new Map<string, string>([
      ['wc@2:session', '1'],
      ['@walletconnect/foo', '2'],
      ['dfx.keep', '3'],
    ]);
    const storage = {
      get length() {
        return store.size;
      },
      key(index: number) {
        return [...store.keys()][index] ?? null;
      },
      removeItem(key: string) {
        store.delete(key);
      },
    };
    clearWalletConnectStorage(storage);
    expect([...store.keys()]).toEqual(['dfx.keep']);
  });

  it('is a no-op without storage', () => {
    expect(() => clearWalletConnectStorage(undefined)).not.toThrow();
  });

  it('swallows storage that throws', () => {
    expect(() =>
      clearWalletConnectStorage({
        get length() {
          throw new Error('blocked');
        },
        key: () => null,
        removeItem: () => undefined,
      }),
    ).not.toThrow();
  });
});

describe('clearWalletConnectIndexedDb', () => {
  it('returns when indexedDB is missing', async () => {
    await expect(clearWalletConnectIndexedDb(undefined)).resolves.toBeUndefined();
  });

  it('skips when the WalletConnect database is not listed', async () => {
    const factory = {
      databases: jest.fn().mockResolvedValue([{ name: 'other' }]),
      open: jest.fn(),
    } as unknown as IDBFactory;
    await clearWalletConnectIndexedDb(factory);
    expect(factory.open).not.toHaveBeenCalled();
  });

  it('clears an existing store', async () => {
    const clear = jest.fn();
    const close = jest.fn();
    const db = {
      objectStoreNames: { contains: () => true },
      transaction: () => ({
        objectStore: () => ({ clear }),
        set oncomplete(handler: () => void) {
          handler();
        },
        set onerror(_handler: () => void) {
          return undefined;
        },
      }),
      close,
    };
    const request: {
      result: typeof db;
      onsuccess: (() => void) | null;
      onerror: (() => void) | null;
      onupgradeneeded: (() => void) | null;
      onblocked: (() => void) | null;
    } = { result: db, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
    const factory = {
      databases: jest.fn().mockResolvedValue([{ name: 'WALLET_CONNECT_V2_INDEXED_DB' }]),
      open: jest.fn(() => {
        queueMicrotask(() => request.onsuccess?.());
        return request;
      }),
    } as unknown as IDBFactory;
    await clearWalletConnectIndexedDb(factory);
    expect(clear).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
});

describe('blockchain meta', () => {
  it('names known chains and falls back to the enum value', () => {
    expect(chainName(Blockchain.BITCOIN)).toBe('Bitcoin');
    expect(chainName(Blockchain.UNKNOWN as Blockchain)).toBe('UnknownChain');
  });

  it('filters testnets and hashes a stable color', () => {
    expect(isTestnetChain(Blockchain.SEPOLIA)).toBe(true);
    expect(isTestnetChain(Blockchain.BITCOIN)).toBe(false);
    expect(mainnetOnly([Blockchain.BITCOIN, Blockchain.SEPOLIA])).toEqual([Blockchain.BITCOIN]);
    expect(hashColor('BTC')).toMatch(/^hsl\(\d+, 58%, 34%\)$/);
  });
});
