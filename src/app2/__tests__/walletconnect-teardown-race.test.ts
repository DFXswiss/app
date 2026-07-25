// Round-5 finding: cancelConnectAttempt() (session.tsx) fires disconnectWalletConnect() without
// awaiting it. That call nulls the module's cached WalletConnect provider promise immediately,
// then keeps running — awaiting the *old* provider's own still-in-flight init() — while control
// returns to the caller. If the user starts a fresh connect attempt in that window, it sees no
// provider, proceeds normally, and establishes a brand-new session (writing fresh pairing data to
// the same IndexedDB store the old, abandoned call is about to clear). Once the old provider's
// init() finally settles, the stale call would otherwise reach its own final IndexedDB clear and
// wipe out exactly what the newer attempt just established. This reproduces that exact ordering.

// Avoids referencing the `jest.Mock` type directly — this project's tsconfig `typeRoots`
// override makes that namespace member unavailable in a standalone tsc check even though the
// real Jest/babel test run resolves it fine; a minimal structural type sidesteps the mismatch.
interface JestMockLike {
  mock: { calls: unknown[][] };
}

function makeDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeFakeWcProvider() {
  return {
    on: jest.fn(),
    removeListener: jest.fn(),
    disconnect: jest.fn().mockResolvedValue(undefined),
    enable: jest.fn(() => new Promise(() => undefined)), // never settles — this test never awaits that far
  };
}

// A macrotask boundary guarantees every pending microtask (including chained async/await hops
// through babel's transpiled output) has drained first — far more robust than guessing a fixed
// number of `Promise.resolve()` hops.
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('disconnectWalletConnect concurrency (teardown generation guard)', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('does not let a stale, abandoned teardown clear the IndexedDB session a newer connect attempt just established', async () => {
    jest.doMock('../wallets/storage', () => ({
      clearWalletConnectStorage: jest.fn(),
      clearWalletConnectIndexedDb: jest.fn().mockResolvedValue(undefined),
    }));

    const deferredA = makeDeferred<ReturnType<typeof makeFakeWcProvider>>();
    const deferredB = makeDeferred<ReturnType<typeof makeFakeWcProvider>>();
    const init = jest.fn().mockReturnValueOnce(deferredA.promise).mockReturnValueOnce(deferredB.promise);
    jest.doMock('@walletconnect/ethereum-provider', () => ({
      EthereumProvider: { init },
    }));

    const storage = await import('../wallets/storage');
    const { connectWalletConnect, disconnectWalletConnect, createCancelToken } = await import('../wallets/providers');
    const clearIndexedDb = storage.clearWalletConnectIndexedDb as unknown as JestMockLike;

    // Attempt A starts pairing; its EthereumProvider.init() call is still pending (deferredA).
    const tokenA = createCancelToken();
    const connectA = connectWalletConnect(() => undefined, tokenA).catch(() => undefined);
    await flushMicrotasks();
    expect(init).toHaveBeenCalledTimes(1); // the module's cached provider promise is now deferredA.promise

    // The user cancels: cancelConnectAttempt()'s `void disconnectWalletConnect()`. This nulls the
    // cached provider promise immediately, then awaits attempt A's still-pending init().
    tokenA.cancel(new Error('cancelled by user'));
    const staleTeardown = disconnectWalletConnect();
    await flushMicrotasks();

    // Before attempt A's init() resolves, the user clicks WalletConnect again. Its own
    // disconnectWalletConnect() (called internally at the top of connectWalletConnect) sees no
    // provider — attempt A already nulled it — completes immediately, and starts attempt B.
    const tokenB = createCancelToken();
    const connectB = connectWalletConnect(() => undefined, tokenB).catch(() => undefined);
    await flushMicrotasks();
    expect(init).toHaveBeenCalledTimes(2); // the cached provider promise is now deferredB.promise

    const idbClearsBeforeStaleResumes = clearIndexedDb.mock.calls.length;

    // Attempt A's original init() finally resolves — the stale, abandoned teardown resumes.
    deferredA.resolve(makeFakeWcProvider());
    await staleTeardown;

    // The stale teardown must not clear IndexedDB again after B has taken over — that clear would
    // wipe the session B is establishing. (Pinned at the call site: a refactor that drops the
    // generation/repopulation guard makes this fail, not just "the code looks right".)
    expect(clearIndexedDb.mock.calls.length).toBe(idbClearsBeforeStaleResumes);

    // cleanup — let B settle too so nothing dangles as an unhandled rejection after the test ends
    deferredB.resolve(makeFakeWcProvider());
    tokenB.cancel(new Error('test cleanup'));
    await Promise.allSettled([connectA, connectB]);
  });
});
