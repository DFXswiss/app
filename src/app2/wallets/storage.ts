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

/** Name of the IndexedDB database `@walletconnect/keyvaluestorage` (a transitive dependency of
 * `@walletconnect/core`, pinned at 1.1.1) migrates every `wc@`/`walletconnect`-prefixed
 * localStorage key into on first use — and removes the source keys from localStorage once the
 * migration completes. From that point on, `clearWalletConnectStorage` above sweeps nothing:
 * `EthereumProvider.init()` restores the persisted session straight from this database, with no
 * localStorage entry left to see. On a shared browser this means logout + reload does not stop
 * the next visitor's WalletConnect click from silently resuming the previous owner's session. */
const WALLET_CONNECT_INDEXED_DB_NAME = 'WALLET_CONNECT_V2_INDEXED_DB';

/** `indexedDB.deleteDatabase()` can sit on `onblocked` forever if some other connection/tab still
 * has the database open — logout must never hang on that, so the promise always settles within
 * this window regardless of what the request does afterwards. */
const INDEXED_DB_DELETE_TIMEOUT_MS = 1_500;

/** Deletes the WalletConnect IndexedDB database so a stale session can never be restored after
 * logout. Resolves (never rejects) once the delete completes, errors, times out, or `indexedDB`
 * is unavailable (private/sandboxed contexts, jsdom) — the caller's teardown must proceed either
 * way. Call this *after* any live provider has been disconnected: an open connection is exactly
 * what triggers `onblocked`. */
export function clearWalletConnectIndexedDb(indexedDbFactory?: IDBFactory): Promise<void> {
  const idb = indexedDbFactory ?? (typeof indexedDB === 'undefined' ? undefined : indexedDB);
  if (!idb) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    // The actual bound on how long this can take — onblocked (below) intentionally does not
    // resolve anything itself, so a blocked delete still can't hang logout past this timeout.
    const timer = setTimeout(finish, INDEXED_DB_DELETE_TIMEOUT_MS);

    try {
      const request = idb.deleteDatabase(WALLET_CONNECT_INDEXED_DB_NAME);
      request.onsuccess = () => {
        clearTimeout(timer);
        finish();
      };
      request.onerror = () => {
        clearTimeout(timer);
        finish();
      };
      request.onblocked = () => {
        // Another open connection is delaying the delete — let it keep trying in the background;
        // the timeout above still bounds how long the caller waits for this to settle.
      };
    } catch {
      // Some environments (older Safari private mode) throw synchronously instead of erroring
      // via the request.
      clearTimeout(timer);
      finish();
    }
  });
}
