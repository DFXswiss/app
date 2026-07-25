// A shared-browser regression: WalletConnect's keyvaluestorage migrates its session out of
// localStorage into IndexedDB (`WALLET_CONNECT_V2_INDEXED_DB`, see storage.ts's doc comment) and
// EthereumProvider.init()/enable() restore straight from there. Logout that only clears
// localStorage therefore leaves the next visitor's WalletConnect click able to silently resume
// the previous owner's session. These tests pin the fix at two levels: the deleteDatabase() call
// itself (storage.ts, real timer/blocked-delete behaviour) and the call site that must never stop
// invoking it (providers.ts's disconnectWalletConnect(), mocking storage.ts so a refactor that
// drops the call turns this red without needing a real IndexedDB).

// jsdom's test environment does not expose TextEncoder/TextDecoder globally, but
// @walletconnect/ethereum-provider's dependency chain (viem) needs them at import time — this
// only matters for the call-site test below, which is the first place in the app2 test suite to
// import wallets/providers.ts (a pre-existing gap, not something this change introduces).
import { TextDecoder, TextEncoder } from 'util';
if (typeof (global as { TextEncoder?: unknown }).TextEncoder === 'undefined') {
  (global as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;
}
if (typeof (global as { TextDecoder?: unknown }).TextDecoder === 'undefined') {
  (global as unknown as { TextDecoder: typeof TextDecoder }).TextDecoder = TextDecoder;
}

import { clearWalletConnectIndexedDb } from '../wallets/storage';

describe('clearWalletConnectIndexedDb', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('deletes the WalletConnect IndexedDB database by its known name', async () => {
    const deleteDatabase = jest.fn((_name: string) => {
      const request: { onsuccess?: () => void; onerror?: () => void; onblocked?: () => void } = {};
      queueMicrotask(() => request.onsuccess?.());
      return request as unknown as IDBOpenDBRequest;
    });
    const fakeIdb = { deleteDatabase } as unknown as IDBFactory;

    await clearWalletConnectIndexedDb(fakeIdb);

    expect(deleteDatabase).toHaveBeenCalledWith('WALLET_CONNECT_V2_INDEXED_DB');
  });

  it('resolves once the delete succeeds, without waiting for the timeout', async () => {
    jest.useFakeTimers();
    const request: { onsuccess?: () => void; onerror?: () => void; onblocked?: () => void } = {};
    const fakeIdb = { deleteDatabase: () => request } as unknown as IDBFactory;

    let resolved = false;
    const promise = clearWalletConnectIndexedDb(fakeIdb).then(() => {
      resolved = true;
    });

    request.onsuccess?.();
    await promise;

    expect(resolved).toBe(true);
    // A pending timer would keep the delete "in flight" long after the real work finished —
    // resolving on success must have cancelled it rather than leaving it to fire later.
    expect(jest.getTimerCount()).toBe(0);
  });

  it('still resolves after the timeout when the delete stays blocked (never fires onsuccess/onerror)', async () => {
    jest.useFakeTimers();
    const request: { onsuccess?: () => void; onerror?: () => void; onblocked?: () => void } = {};
    const fakeIdb = { deleteDatabase: () => request } as unknown as IDBFactory;

    let resolved = false;
    const promise = clearWalletConnectIndexedDb(fakeIdb).then(() => {
      resolved = true;
    });

    // Another open connection (a stale tab) blocks the delete — the real SDK never calls
    // onsuccess/onerror in this case, only onblocked, which must not resolve anything itself.
    request.onblocked?.();
    expect(resolved).toBe(false);

    jest.advanceTimersByTime(1_499);
    await Promise.resolve();
    expect(resolved).toBe(false);

    jest.advanceTimersByTime(1);
    await promise;
    expect(resolved).toBe(true);
  });

  it('resolves without touching indexedDB when it is unavailable (jsdom, private mode)', async () => {
    await expect(clearWalletConnectIndexedDb(undefined)).resolves.toBeUndefined();
  });
});

describe('disconnectWalletConnect call site', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('deletes the WalletConnect IndexedDB database on every disconnect, not just localStorage — a refactor that drops this call must fail here', async () => {
    jest.doMock('../wallets/storage', () => ({
      clearWalletConnectStorage: jest.fn(),
      clearWalletConnectIndexedDb: jest.fn().mockResolvedValue(undefined),
    }));

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
