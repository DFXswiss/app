// A shared-browser regression: WalletConnect's keyvaluestorage migrates its session out of
// localStorage into IndexedDB (`WALLET_CONNECT_V2_INDEXED_DB` / store `keyvaluestorage`, see
// storage.ts's doc comment) and EthereumProvider.init()/enable() restore straight from there.
// Logout that only clears localStorage therefore leaves the next visitor's WalletConnect click
// able to silently resume the previous owner's session.
//
// Round 2 finding: `idb-keyval`'s `createStore()` (what `@walletconnect/keyvaluestorage` uses)
// opens the database once and never closes it or registers `onversionchange` — so
// `provider.disconnect()` never releases that connection. A same-tab `deleteDatabase()` call
// therefore sits on `onblocked` until our own timeout gives up, *without ever actually clearing
// the data* — worse than just slow. The fix clears the object store's contents via a plain
// (non-version-bumping) `open()` + `readwrite` transaction instead, which never needs exclusive
// access and so isn't affected by another open connection in the same tab. The fake IndexedDB
// below models that distinction faithfully (including `deleteDatabase()` genuinely blocking on
// an open connection) so the same-tab scenario is proven, not just asserted.
//
// Round 3 finding: on the fallback path (databases() unavailable/throws, database doesn't exist
// yet), the versionless open() from the round-2 fix still creates the database implicitly and
// fires onupgradeneeded — and `idb-keyval`'s own `createStore()` (see storage.ts) *also* only
// ever opens without a version. Real IndexedDB never fires onupgradeneeded a second time for a
// database once it exists at a given version, so leaving the database at version 1 without the
// `keyvaluestorage` store — which the round-2 code did — permanently broke WalletConnect storage
// in that browser profile: every future connect attempt's own createStore() would open at
// version 1 with no upgrade needed, and its own onupgradeneeded (which is the only place it ever
// creates the store) would simply never fire again.

import { clearWalletConnectIndexedDb } from '../wallets/storage';

const DB_NAME = 'WALLET_CONNECT_V2_INDEXED_DB';
const STORE_NAME = 'keyvaluestorage';

interface FakeRequest<T = unknown> {
  onsuccess?: (() => void) | null;
  onerror?: (() => void) | null;
  onupgradeneeded?: (() => void) | null;
  onblocked?: (() => void) | null;
  result?: T;
  error?: unknown;
}

interface FakeStoreHandle {
  clear: () => FakeRequest;
  get: (key: string) => FakeRequest;
  put: (value: unknown, key: string) => FakeRequest;
}

interface FakeTx {
  oncomplete?: (() => void) | null;
  onerror?: (() => void) | null;
  objectStore: (name: string) => FakeStoreHandle;
}

interface FakeDbHandle {
  objectStoreNames: { contains: (name: string) => boolean };
  createObjectStore: (name: string) => FakeStoreHandle;
  transaction: (name: string, mode: 'readonly' | 'readwrite') => FakeTx;
  close: () => void;
}

/** A small but behaviorally faithful fake of the IndexedDB entry points this module uses (`open`,
 * `deleteDatabase`, `databases`) — faithful specifically on two properties this suite cares
 * about: `deleteDatabase()` genuinely blocks (never resolves) while any connection to that
 * database is open, exactly like real IndexedDB, while a versionless `open()` + `readwrite`
 * transaction never does; and a versionless `open()` against a database that does not exist yet
 * creates it at version 1 and fires `onupgradeneeded` exactly once, never again for that
 * database — matching the real spec behavior the round-3 finding is about (see
 * `simulateIdbKeyvalConnectAndTransact` below). */
function makeFakeIndexedDb(options: { withDatabasesApi?: boolean; databasesThrows?: boolean } = {}) {
  const dbs = new Map<string, { stores: Map<string, Map<string, unknown>> }>();
  const openConnectionCount = new Map<string, number>();

  function makeStoreHandle(store: Map<string, unknown>): FakeStoreHandle {
    return {
      clear: () => {
        store.clear();
        return {};
      },
      get: (key: string) => {
        const req: FakeRequest = {};
        queueMicrotask(() => {
          req.result = store.get(key);
          req.onsuccess?.();
        });
        return req;
      },
      put: (value: unknown, key: string) => {
        store.set(key, value);
        return {};
      },
    };
  }

  function makeDbHandle(name: string, db: { stores: Map<string, Map<string, unknown>> }): FakeDbHandle {
    openConnectionCount.set(name, (openConnectionCount.get(name) ?? 0) + 1);
    let closed = false;
    return {
      objectStoreNames: { contains: (storeName) => db.stores.has(storeName) },
      createObjectStore: (storeName) => {
        const store = new Map<string, unknown>();
        db.stores.set(storeName, store);
        return makeStoreHandle(store);
      },
      transaction: (storeName) => {
        const store = db.stores.get(storeName);
        if (!store) throw new Error(`NotFoundError: no object store "${storeName}"`);
        const handle = makeStoreHandle(store);
        const tx: FakeTx = { objectStore: () => handle };
        queueMicrotask(() => tx.oncomplete?.());
        return tx;
      },
      close: () => {
        if (closed) return;
        closed = true;
        openConnectionCount.set(name, Math.max(0, (openConnectionCount.get(name) ?? 1) - 1));
      },
    };
  }

  const idb = {
    open: (name: string) => {
      const req: FakeRequest<FakeDbHandle> = {};
      queueMicrotask(() => {
        const isNew = !dbs.has(name);
        const db = dbs.get(name) ?? { stores: new Map() };
        if (isNew) dbs.set(name, db);
        const handle = makeDbHandle(name, db);
        req.result = handle;
        if (isNew) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req as unknown as IDBOpenDBRequest;
    },
    deleteDatabase: (name: string) => {
      const req: FakeRequest = {};
      queueMicrotask(() => {
        if ((openConnectionCount.get(name) ?? 0) > 0) {
          req.onblocked?.();
          return; // real IndexedDB: never settles while a connection stays open
        }
        dbs.delete(name);
        req.onsuccess?.();
      });
      return req as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory & { databases?: () => Promise<{ name?: string }[]> };

  if (options.databasesThrows) {
    (idb as { databases: () => Promise<{ name?: string }[]> }).databases = async () => {
      throw new Error('databases() not supported in this browser');
    };
  } else if (options.withDatabasesApi !== false) {
    (idb as { databases: () => Promise<{ name?: string }[]> }).databases = async () =>
      Array.from(dbs.keys()).map((name) => ({ name }));
  }

  return { idb, openConnectionCount, dbs };
}

/** Opens a connection with the store pre-created and primed with one entry — simulating "this tab
 * already used WalletConnect", the exact scenario the same-tab bug is about. The returned
 * connection is deliberately left open (never `.close()`d) by the caller. */
async function primeOpenConnection(idb: IDBFactory): Promise<FakeDbHandle> {
  return new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME) as unknown as FakeRequest<FakeDbHandle>;
    // `result` is always set (synchronously, before either handler fires — see `open` above)
    // by the time onupgradeneeded/onsuccess run; `as FakeDbHandle` documents that invariant
    // without a non-null assertion.
    req.onupgradeneeded = () => (req.result as FakeDbHandle).createObjectStore(STORE_NAME);
    req.onsuccess = () => {
      const db = req.result as FakeDbHandle;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put('session-payload', 'wc@2:client:session');
      tx.oncomplete = () => resolve(db);
      tx.onerror = () => reject(new Error('priming failed'));
    };
    req.onerror = () => reject(req.error);
  });
}

function readValue(db: FakeDbHandle, key: string): Promise<unknown> {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const getReq = tx.objectStore(STORE_NAME).get(key);
    getReq.onsuccess = () => resolve(getReq.result);
  });
}

/** Replays exactly what `@walletconnect/keyvaluestorage`'s own `createStore()` does on the very
 * next WalletConnect connect attempt after our cleanup ran: a versionless `open()`, relying on
 * `onupgradeneeded` to create the store if the database is brand new. Real IndexedDB never fires
 * `onupgradeneeded` a second time for a database once it exists at a given version — so if our
 * cleanup had already claimed version 1 without creating the `keyvaluestorage` store (round-3
 * finding), this `db.transaction()` call throws `NotFoundError` here exactly as it would for the
 * real SDK, permanently breaking WalletConnect storage in that browser profile. */
function simulateIdbKeyvalConnectAndTransact(idb: IDBFactory): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME) as unknown as FakeRequest<FakeDbHandle>;
    req.onupgradeneeded = () => (req.result as FakeDbHandle).createObjectStore(STORE_NAME);
    req.onsuccess = () => {
      const db = req.result as FakeDbHandle;
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(new Error('transaction failed'));
        };
      } catch (error) {
        db.close();
        reject(error as Error);
      }
    };
    req.onerror = () => reject(req.error ?? new Error('open failed'));
  });
}

describe('clearWalletConnectIndexedDb', () => {
  it('empties the store even while another connection from this tab is still open — proven, not just non-hanging', async () => {
    const { idb } = makeFakeIndexedDb();
    const openConnection = await primeOpenConnection(idb);
    expect(await readValue(openConnection, 'wc@2:client:session')).toBe('session-payload');

    // The bug this guards against: with the old deleteDatabase()-based implementation, this call
    // would sit on onblocked forever (see the 'would have blocked forever' test below) because
    // `openConnection` above is never closed. No fake timers are used here at all — if the
    // implementation still depended on a timeout to "give up" rather than genuinely succeeding
    // via open()+clear(), this test would hang instead of resolving.
    await clearWalletConnectIndexedDb(idb);

    // Still open, still the same connection — and now provably empty.
    expect(await readValue(openConnection, 'wc@2:client:session')).toBeUndefined();
  });

  it('would have blocked forever on deleteDatabase() while that same connection stays open (documents why open()+clear() was necessary)', async () => {
    const { idb } = makeFakeIndexedDb();
    const openConnection = await primeOpenConnection(idb);
    void openConnection; // kept open on purpose — never closed

    let settled = false;
    const deleteReq = idb.deleteDatabase(DB_NAME);
    (deleteReq as unknown as FakeRequest).onsuccess = () => {
      settled = true;
    };
    (deleteReq as unknown as FakeRequest).onblocked = () => {
      // real IndexedDB: fires, but the request still never completes while blocked
    };

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it('resolves once the store is cleared when there is no other open connection', async () => {
    const { idb, dbs } = makeFakeIndexedDb();
    const openConnection = await primeOpenConnection(idb);
    openConnection.close();

    await clearWalletConnectIndexedDb(idb);

    expect(dbs.get(DB_NAME)?.stores.get(STORE_NAME)?.size).toBe(0);
  });

  it('skips without creating a database when it does not exist (databases() available)', async () => {
    const { idb, dbs } = makeFakeIndexedDb();

    await clearWalletConnectIndexedDb(idb);

    expect(dbs.has(DB_NAME)).toBe(false);
  });

  it('never leaves the database in a state the SDK itself cannot use — databases() unavailable, database does not exist yet', async () => {
    const { idb, dbs } = makeFakeIndexedDb({ withDatabasesApi: false });

    await clearWalletConnectIndexedDb(idb);

    // A versionless open() on a database that doesn't exist yet unavoidably creates it (that's
    // just what IndexedDB does) — the assertion that matters is not "it didn't throw" but that
    // *if* a database now exists, it has the exact store idb-keyval needs, because a database
    // that version without that store can never get it later (see the helper's doc comment).
    const created = dbs.get(DB_NAME);
    if (created) expect(created.stores.has(STORE_NAME)).toBe(true);

    // The real proof: replay the SDK's own connect-time open()+transaction() against the same
    // factory and confirm it actually succeeds, not just "resolved without throwing" on our side.
    await expect(simulateIdbKeyvalConnectAndTransact(idb)).resolves.toBeUndefined();
  });

  it('never leaves the database in a state the SDK itself cannot use — databases() throws, database does not exist yet', async () => {
    const { idb, dbs } = makeFakeIndexedDb({ databasesThrows: true });

    await clearWalletConnectIndexedDb(idb);

    const created = dbs.get(DB_NAME);
    if (created) expect(created.stores.has(STORE_NAME)).toBe(true);

    await expect(simulateIdbKeyvalConnectAndTransact(idb)).resolves.toBeUndefined();
  });

  it('resolves without touching indexedDB when it is unavailable (jsdom, private mode)', async () => {
    await expect(clearWalletConnectIndexedDb(undefined)).resolves.toBeUndefined();
  });

  it('still resolves within its timeout if the open request itself never settles (defensive backstop)', async () => {
    jest.useFakeTimers();
    const neverSettles = {
      open: () => ({}) as FakeRequest, // no handlers ever fire
    } as unknown as IDBFactory;

    let resolved = false;
    const promise = clearWalletConnectIndexedDb(neverSettles).then(() => {
      resolved = true;
    });

    jest.advanceTimersByTime(999);
    await Promise.resolve();
    expect(resolved).toBe(false);

    jest.advanceTimersByTime(1);
    await promise;
    expect(resolved).toBe(true);

    jest.useRealTimers();
  });
});

describe('disconnectWalletConnect call site', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('clears the WalletConnect IndexedDB store on every disconnect, not just localStorage — a refactor that drops this call must fail here', async () => {
    jest.doMock('../wallets/storage', () => ({
      clearWalletConnectStorage: jest.fn(),
      clearWalletConnectIndexedDb: jest.fn().mockResolvedValue(undefined),
    }));

    // jsdom's test environment does not expose TextEncoder/TextDecoder globally, but
    // @walletconnect/ethereum-provider's dependency chain (viem) needs them at import time — this
    // only matters here, the first place in this file to import wallets/providers.ts.
    const { TextDecoder, TextEncoder } = await import('util');
    if (typeof (global as { TextEncoder?: unknown }).TextEncoder === 'undefined') {
      (global as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;
    }
    if (typeof (global as { TextDecoder?: unknown }).TextDecoder === 'undefined') {
      (global as unknown as { TextDecoder: typeof TextDecoder }).TextDecoder = TextDecoder;
    }

    const storage = await import('../wallets/storage');
    const { disconnectWalletConnect } = await import('../wallets/providers');

    // No provider has been created in this module instance — exactly the state after a page
    // reload, which is the scenario the merge-gate finding describes (logout + reload, then the
    // next visitor clicks WalletConnect).
    await disconnectWalletConnect();

    expect(storage.clearWalletConnectIndexedDb).toHaveBeenCalledTimes(1);
    expect(storage.clearWalletConnectStorage).toHaveBeenCalled();
  });
});
