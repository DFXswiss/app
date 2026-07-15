interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

const WALLET_CONNECT_STORAGE_PREFIXES = ['wc@2:', '@walletconnect'] as const;

/**
 * WalletConnect restores sessions from localStorage before a provider instance exists. Clearing
 * only an in-memory provider therefore cannot sign a shared browser out after a reload.
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
