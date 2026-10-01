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

  it('is a no-op when window.localStorage is missing', () => {
    const desc = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, value: undefined });
    expect(() => clearWalletConnectStorage()).not.toThrow();
    if (desc) Object.defineProperty(window, 'localStorage', desc);
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
    const original = (global as { indexedDB?: IDBFactory }).indexedDB;
    Object.defineProperty(global, 'indexedDB', { configurable: true, value: undefined });
    await expect(clearWalletConnectIndexedDb()).resolves.toBeUndefined();
    if (original === undefined) delete (global as { indexedDB?: IDBFactory }).indexedDB;
    else Object.defineProperty(global, 'indexedDB', { configurable: true, value: original });
  });

  it('uses the global indexedDB factory when none is passed', async () => {
    const factory = {
      databases: jest.fn().mockResolvedValue([]),
      open: jest.fn(),
    };
    const original = (global as { indexedDB?: IDBFactory }).indexedDB;
    Object.defineProperty(global, 'indexedDB', { configurable: true, value: factory });
    await clearWalletConnectIndexedDb();
    expect(factory.databases).toHaveBeenCalled();
    expect(factory.open).not.toHaveBeenCalled();
    if (original === undefined) delete (global as { indexedDB?: IDBFactory }).indexedDB;
    else Object.defineProperty(global, 'indexedDB', { configurable: true, value: original });
  });

  it('opens when databases() is unavailable', async () => {
    const request: {
      result?: { objectStoreNames: { contains: () => boolean }; close: () => void };
      onsuccess: (() => void) | null;
      onerror: (() => void) | null;
      onupgradeneeded: (() => void) | null;
      onblocked: (() => void) | null;
    } = { result: undefined, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
    const factory = {
      open: jest.fn(() => {
        queueMicrotask(() => request.onerror?.());
        return request;
      }),
    } as unknown as IDBFactory;
    await clearWalletConnectIndexedDb(factory);
    expect(factory.open).toHaveBeenCalled();
  });

  it('ignores a second finish after the store has already settled', async () => {
    const clear = jest.fn();
    const close = jest.fn();
    const db = {
      objectStoreNames: { contains: () => true },
      transaction: () => ({
        objectStore: () => ({ clear }),
        set oncomplete(handler: () => void) {
          handler();
          handler();
        },
        set onerror(handler: () => void) {
          handler();
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
  });

  it('skips when the WalletConnect database is not listed', async () => {
    const factory = {
      databases: jest.fn().mockResolvedValue([{ name: 'other' }]),
      open: jest.fn(),
    } as unknown as IDBFactory;
    await clearWalletConnectIndexedDb(factory);
    expect(factory.open).not.toHaveBeenCalled();
  });

  it('skips when databases() throws and still opens', async () => {
    const request: {
      result?: { objectStoreNames: { contains: () => boolean }; close: () => void };
      onsuccess: (() => void) | null;
      onerror: (() => void) | null;
      onupgradeneeded: (() => void) | null;
      onblocked: (() => void) | null;
    } = { result: undefined, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
    const factory = {
      databases: jest.fn().mockRejectedValue(new Error('no list')),
      open: jest.fn(() => {
        queueMicrotask(() => request.onerror?.());
        return request;
      }),
    } as unknown as IDBFactory;
    await clearWalletConnectIndexedDb(factory);
    expect(factory.open).toHaveBeenCalled();
  });

  it('creates the store on upgrade, handles a missing store, tx errors and a sync open throw', async () => {
    const close = jest.fn();
    const created: string[] = [];
    const upgradeDb = {
      createObjectStore: (name: string) => created.push(name),
      objectStoreNames: { contains: () => false },
      close,
    };
    const missingStoreDb = {
      objectStoreNames: { contains: () => false },
      close,
    };
    const errorTxDb = {
      objectStoreNames: { contains: () => true },
      transaction: () => ({
        objectStore: () => ({ clear: jest.fn() }),
        set oncomplete(_handler: () => void) {
          return undefined;
        },
        set onerror(handler: () => void) {
          handler();
        },
      }),
      close,
    };
    const throwTxDb = {
      objectStoreNames: { contains: () => true },
      transaction: () => {
        throw new Error('tx');
      },
      close,
    };

    async function run(db: typeof missingStoreDb, fire: 'success' | 'upgrade' | 'blocked') {
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
          queueMicrotask(() => {
            if (fire === 'upgrade') request.onupgradeneeded?.();
            if (fire === 'blocked') request.onblocked?.();
            request.onsuccess?.();
          });
          return request;
        }),
      } as unknown as IDBFactory;
      await clearWalletConnectIndexedDb(factory);
    }

    await run(upgradeDb as never, 'upgrade');
    expect(created).toContain('keyvaluestorage');
    await run(missingStoreDb, 'success');
    await run(errorTxDb as never, 'success');
    await run(throwTxDb as never, 'success');
    await run(missingStoreDb, 'blocked');

    const throwingFactory = {
      databases: jest.fn().mockResolvedValue([{ name: 'WALLET_CONNECT_V2_INDEXED_DB' }]),
      open: () => {
        throw new Error('no idb');
      },
    } as unknown as IDBFactory;
    await expect(clearWalletConnectIndexedDb(throwingFactory)).resolves.toBeUndefined();
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
