interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

const WALLET_CONNECT_STORAGE_PREFIXES = ['wc@2:', '@walletconnect'] as const;

/**
 * WalletConnect restores sessions from localStorage before a provider instance exists. Clearing
 * only an in-memory provider therefore cannot sign a shared browser out after a reload.
 *
 * This only ever helps a pre-migration install — see `clearWalletConnectIndexedDb` below for the
 * layer the SDK actually restores sessions from once it has migrated.
 */
export function clearWalletConnectStorage(storage?: StorageLike): void {
  const target = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
  if (!target) return;

  try {
    const keys = Array.from({ length: target.length }, (_, index) => target.key(index)).filter(
      (key): key is string => !!key && WALLET_CONNECT_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)),
    );
    keys.forEach((key) => target.removeItem(key));
  } catch {
    // Storage may be unavailable in private/sandboxed contexts. Provider teardown still runs.
  }
}

/** Name/store of the IndexedDB database `@walletconnect/keyvaluestorage` (a transitive dependency
 * of `@walletconnect/core`, pinned at 1.1.1) migrates every `wc@`/`walletconnect`-prefixed
 * localStorage key into on first use — and removes the source keys from localStorage once the
 * migration completes. From that point on, `clearWalletConnectStorage` above sweeps nothing:
 * `EthereumProvider.init()` restores the persisted session straight from this database, with no
 * localStorage entry left to see. On a shared browser this means logout + reload does not stop
 * the next visitor's WalletConnect click from silently resuming the previous owner's session.
 *
 * Verified against the installed bundle (node_modules/@walletconnect/keyvaluestorage/dist,
 * `idb-keyval`'s `createStore(dbName, storeName)` call): db name `WALLET_CONNECT_V2_INDEXED_DB`,
 * a single object store named `keyvaluestorage`. */
const WALLET_CONNECT_INDEXED_DB_NAME = 'WALLET_CONNECT_V2_INDEXED_DB';
const WALLET_CONNECT_STORE_NAME = 'keyvaluestorage';

/** Belt-and-suspenders bound on the open+clear below. Unlike `deleteDatabase()` (which needs
 * exclusive access and hangs on `onblocked` for as long as any other connection stays open — see
 * the doc comment on `clearWalletConnectIndexedDb`), a plain versioned-less `open()` plus a
 * `readwrite` transaction never requires exclusive access, so this should never actually fire.
 * It exists only against pathological environments; logout must never hang regardless. */
const INDEXED_DB_CLEAR_TIMEOUT_MS = 1_000;

function closeQuietly(db: IDBDatabase): void {
  try {
    db.close();
  } catch {
    // best-effort — the connection is being discarded either way
  }
}

/** Empties the WalletConnect IndexedDB object store so a stale session can never be restored
 * after logout — including in the *same tab* that just used WalletConnect.
 *
 * This clears the store's contents rather than deleting the database. `idb-keyval`'s
 * `createStore()` (what `@walletconnect/keyvaluestorage` is built on) opens the database once,
 * caches that connection for the lifetime of the page, and never calls `close()` or registers an
 * `onversionchange` handler — so `provider.disconnect()` does not release it. A same-tab
 * `deleteDatabase()` call after any WalletConnect use in that tab would therefore sit on
 * `onblocked` until our timeout gives up, *leaving the old session data intact* — not just slow,
 * actually ineffective. `IDBFactory.open()` at the database's current version (no version bump)
 * does not need exclusive access, so a `readwrite` transaction against it succeeds immediately
 * even while that other connection stays open, and genuinely empties the store.
 *
 * Resolves (never rejects) once the store is cleared, the database/store doesn't exist, an error
 * occurs, the timeout elapses, or `indexedDB` is unavailable (private/sandboxed contexts, jsdom)
 * — the caller's teardown must proceed either way. */
export async function clearWalletConnectIndexedDb(indexedDbFactory?: IDBFactory): Promise<void> {
  const idb = indexedDbFactory ?? (typeof indexedDB === 'undefined' ? undefined : indexedDB);
  if (!idb) return;

  // Skip entirely when the database doesn't exist yet, so a browser/user who never touched
  // WalletConnect never gets an empty WALLET_CONNECT_V2_INDEXED_DB created as a side effect of
  // opening it below. Supported in every evergreen browser this app already targets; where it
  // isn't (or the check itself fails), fall through to open+clear — see the `onupgradeneeded`
  // handler below for why that path is still safe even for a database that doesn't exist yet.
  if (typeof idb.databases === 'function') {
    try {
      const existing = await idb.databases();
      if (!existing.some((entry) => entry.name === WALLET_CONNECT_INDEXED_DB_NAME)) return;
    } catch {
      // Some browsers implement `databases()` inconsistently — don't let that stop the clear.
    }
  }

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, INDEXED_DB_CLEAR_TIMEOUT_MS);

    try {
      // No version argument: connects at whatever version already exists (no upgrade, so no
      // exclusive-access requirement, so no `onblocked`) — *except* when the database doesn't
      // exist yet (only reachable when `databases()` above was unavailable/threw), where a
      // versionless open still creates it at version 1 and fires onupgradeneeded once.
      const request = idb.open(WALLET_CONNECT_INDEXED_DB_NAME);
      request.onupgradeneeded = () => {
        // Must create the `keyvaluestorage` store here, matching idb-keyval's own
        // `createStore()` exactly (same name, no options — see the doc comment above): leaving
        // the database at version 1 *without* this store would be worse than doing nothing.
        // idb-keyval's `createStore()` also opens with no version argument, so once this
        // versionless open has claimed version 1, a database that version can never fire
        // onupgradeneeded again for anyone — the SDK would have no way left to create its own
        // store, and every future WalletConnect connect attempt in this browser profile would
        // throw NotFoundError trying to open a transaction against a store that was never made.
        request.result.createObjectStore(WALLET_CONNECT_STORE_NAME);
      };
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(WALLET_CONNECT_STORE_NAME)) {
          // Defensive only — unreachable in practice, since onupgradeneeded above always creates
          // the store for a new database, and databases() (when available) already skipped an
          // existing one that somehow lacks it.
          closeQuietly(db);
          finish();
          return;
        }
        try {
          const tx = db.transaction(WALLET_CONNECT_STORE_NAME, 'readwrite');
          tx.objectStore(WALLET_CONNECT_STORE_NAME).clear();
          tx.oncomplete = () => {
            closeQuietly(db);
            finish();
          };
          tx.onerror = () => {
            closeQuietly(db);
            finish();
          };
        } catch {
          closeQuietly(db);
          finish();
        }
      };
      request.onerror = () => finish();
      // Vanishingly rare (two tabs racing to create the database for the first time
      // simultaneously) — the timeout above is still what actually bounds this.
      request.onblocked = () => undefined;
    } catch {
      // Some environments (older Safari private mode) throw synchronously instead of erroring
      // via the request.
      finish();
    }
  });
}
