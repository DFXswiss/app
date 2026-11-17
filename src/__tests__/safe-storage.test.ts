const mockReportClientError = jest.fn();

jest.mock('../util/client-error', () => ({
  reportClientError: (...args: unknown[]) => mockReportClientError(...args),
}));

type SafeStorageModule = typeof import('../util/safe-storage');

function createMemoryLikeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      const value = map.get(key);
      return value === undefined ? null : value;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    key(index: number) {
      if (index < 0 || index >= map.size) return null;
      return Array.from(map.keys())[index] ?? null;
    },
  };
}

function installWorkingStorage(): { local: Storage; session: Storage } {
  const local = createMemoryLikeStorage();
  const session = createMemoryLikeStorage();
  Object.defineProperty(window, 'localStorage', { value: local, configurable: true });
  Object.defineProperty(window, 'sessionStorage', { value: session, configurable: true });
  return { local, session };
}

function installThrowingStorage(): void {
  Object.defineProperty(window, 'localStorage', {
    get() {
      throw new DOMException('Denied', 'SecurityError');
    },
    configurable: true,
  });
  Object.defineProperty(window, 'sessionStorage', {
    get() {
      throw new DOMException('Denied', 'SecurityError');
    },
    configurable: true,
  });
}

function loadSafeStorage(): SafeStorageModule & { getStorageBlockedFlag: () => boolean } {
  let mod: (SafeStorageModule & { getStorageBlockedFlag: () => boolean }) | undefined;
  jest.isolateModules(() => {
    /* isolateModules needs require so each case gets a fresh installAttempted */
    /* eslint-disable @typescript-eslint/no-var-requires */
    mod = Object.assign(require('../util/safe-storage'), {
      getStorageBlockedFlag: require('../util/storage-block-flag').getStorageBlockedFlag,
    });
    /* eslint-enable @typescript-eslint/no-var-requires */
  });
  if (!mod) throw new Error('failed to load safe-storage');
  return mod;
}

describe('safe-storage', () => {
  const originalLocalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
  const originalSessionDescriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
  const reloadMock = jest.fn();

  beforeEach(() => {
    mockReportClientError.mockClear();
    reloadMock.mockClear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/boot', reload: reloadMock, search: '' },
    });
    installWorkingStorage();
  });

  afterEach(() => {
    if (originalLocalDescriptor) {
      Object.defineProperty(window, 'localStorage', originalLocalDescriptor);
    }
    if (originalSessionDescriptor) {
      Object.defineProperty(window, 'sessionStorage', originalSessionDescriptor);
    }
    jest.restoreAllMocks();
  });

  it('roundtrips get/set/remove on localStorage and sessionStorage', () => {
    const { storageGet, storageSet, storageRemove } = loadSafeStorage();

    storageSet('localStorage', 'a', '1');
    expect(storageGet('localStorage', 'a')).toBe('1');
    storageRemove('localStorage', 'a');
    expect(storageGet('localStorage', 'a')).toBeUndefined();

    storageSet('sessionStorage', 'b', '2');
    expect(storageGet('sessionStorage', 'b')).toBe('2');
    storageRemove('sessionStorage', 'b');
    expect(storageGet('sessionStorage', 'b')).toBeUndefined();
  });

  it('storageGet returns undefined for a missing key', () => {
    const { storageGet } = loadSafeStorage();
    expect(storageGet('localStorage', 'missing')).toBeUndefined();
  });

  it('does not throw when window.localStorage getter throws SecurityError', () => {
    installThrowingStorage();
    const { storageGet, storageSet, storageRemove, storageClear } = loadSafeStorage();

    expect(storageGet('localStorage', 'k')).toBeUndefined();
    expect(() => storageSet('localStorage', 'k', 'v')).not.toThrow();
    expect(() => storageRemove('localStorage', 'k')).not.toThrow();
    expect(() => storageClear('sessionStorage')).not.toThrow();
  });

  it('storageGet/remove/clear do not throw when Storage methods throw', () => {
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('get failed');
        },
        setItem: () => undefined,
        removeItem: () => {
          throw new Error('remove failed');
        },
        clear: () => undefined,
        key: () => null,
        length: 0,
      },
      configurable: true,
    });
    Object.defineProperty(window, 'sessionStorage', {
      value: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
        clear: () => {
          throw new Error('clear failed');
        },
        key: () => null,
        length: 0,
      },
      configurable: true,
    });

    const { storageGet, storageRemove, storageClear } = loadSafeStorage();
    expect(storageGet('localStorage', 'k')).toBeUndefined();
    expect(() => storageRemove('localStorage', 'k')).not.toThrow();
    expect(() => storageClear('sessionStorage')).not.toThrow();
  });

  it('storageGetJson returns undefined for a missing key', () => {
    const { storageGetJson } = loadSafeStorage();
    expect(storageGetJson('localStorage', 'missing')).toBeUndefined();
  });

  it('storageGetJson returns a parsed value for valid JSON', () => {
    const { storageGetJson, storageSet } = loadSafeStorage();
    storageSet('localStorage', 'obj', JSON.stringify({ ok: true }));
    expect(storageGetJson<{ ok: boolean }>('localStorage', 'obj')).toEqual({ ok: true });
  });

  it.each(['undefined', '<!doctype html>', '{kaputt'])(
    'storageGetJson of %j returns undefined and removes the key',
    (raw) => {
      const { local } = installWorkingStorage();
      local.setItem('bad', raw);
      const { storageGetJson } = loadSafeStorage();

      expect(storageGetJson('localStorage', 'bad')).toBeUndefined();
      expect(local.getItem('bad')).toBeNull();
    },
  );

  it('storageSetJson roundtrips', () => {
    const { storageSetJson, storageGetJson } = loadSafeStorage();
    storageSetJson('sessionStorage', 'params', { mode: 'buy' });
    expect(storageGetJson('sessionStorage', 'params')).toEqual({ mode: 'buy' });
  });

  it('storageSetJson(undefined) does not write the string "undefined"', () => {
    const { local } = installWorkingStorage();
    const { storageSetJson } = loadSafeStorage();
    storageSetJson('localStorage', 'u', undefined as unknown as string);
    expect(local.getItem('u')).toBeNull();
  });

  it('storageSet and storageSetJson swallow QuotaExceededError by name', () => {
    const quota = new Error('quota');
    quota.name = 'QuotaExceededError';
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: () => null,
        setItem: () => {
          throw quota;
        },
        removeItem: () => undefined,
        clear: () => undefined,
        key: () => null,
        length: 0,
      },
      configurable: true,
    });
    const { storageSet, storageSetJson } = loadSafeStorage();
    expect(() => storageSet('localStorage', 'k', 'v')).not.toThrow();
    expect(() => storageSetJson('localStorage', 'k', { a: 1 })).not.toThrow();
  });

  it('storageSet swallows QuotaExceededError as DOMException and SecurityError', () => {
    const quota = new DOMException('Quota exceeded', 'QuotaExceededError');
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: () => null,
        setItem: () => {
          throw quota;
        },
        removeItem: () => undefined,
        clear: () => undefined,
        key: () => null,
        length: 0,
      },
      configurable: true,
    });
    const { storageSet } = loadSafeStorage();
    expect(() => storageSet('localStorage', 'k', 'v')).not.toThrow();

    const security = new DOMException('Denied', 'SecurityError');
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: () => null,
        setItem: () => {
          throw security;
        },
        removeItem: () => undefined,
        clear: () => undefined,
        key: () => null,
        length: 0,
      },
      configurable: true,
    });
    expect(() => storageSet('localStorage', 'k', 'v')).not.toThrow();
  });

  it('storageClear clears sessionStorage keys and does not throw when blocked', () => {
    const { session } = installWorkingStorage();
    session.setItem('a', '1');
    const { storageClear } = loadSafeStorage();
    storageClear('sessionStorage');
    expect(session.getItem('a')).toBeNull();

    installThrowingStorage();
    expect(() => storageClear('sessionStorage')).not.toThrow();
  });

  it('installStorageFallback leaves flags false when native storage works and is idempotent', () => {
    const { local, session } = installWorkingStorage();
    const mod = loadSafeStorage();

    mod.installStorageFallback();
    expect(mod.isStorageBlocked()).toBe(false);
    expect(mod.isStorageHardBlocked()).toBe(false);
    expect(mod.getStorageBlockedFlag()).toBe(false);
    expect(local.getItem('__dfx.probe')).toBeNull();
    expect(session.getItem('__dfx.probe')).toBeNull();

    const setItemSpy = jest.spyOn(local, 'setItem');
    mod.installStorageFallback();
    expect(setItemSpy).not.toHaveBeenCalledWith('__dfx.probe', expect.anything());
  });

  it('shims only sessionStorage when localStorage still works', () => {
    const { local } = installWorkingStorage();
    local.setItem('dfx.srv.language', 'de');
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new DOMException('Denied', 'SecurityError');
      },
      configurable: true,
    });
    const mod = loadSafeStorage();
    mod.installStorageFallback();
    expect(mod.isStorageBlocked()).toBe(true);
    expect(mod.isStorageHardBlocked()).toBe(false);
    expect(mod.getStorageBlockedFlag()).toBe(true);
    expect(local.getItem('dfx.srv.language')).toBe('de');
  });

  it('shims only localStorage when sessionStorage still works', () => {
    const { session } = installWorkingStorage();
    session.setItem('keep', '1');
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Denied', 'SecurityError');
      },
      configurable: true,
    });
    const mod = loadSafeStorage();
    mod.installStorageFallback();
    expect(mod.isStorageBlocked()).toBe(true);
    expect(mod.isStorageHardBlocked()).toBe(false);
    expect(mod.getStorageBlockedFlag()).toBe(true);
    expect(session.getItem('keep')).toBe('1');
  });

  it('blocked storage with successful shim uses memory storage', () => {
    installThrowingStorage();
    const mod = loadSafeStorage();

    mod.installStorageFallback();
    expect(mod.isStorageBlocked()).toBe(true);
    expect(mod.isStorageHardBlocked()).toBe(false);
    expect(mod.getStorageBlockedFlag()).toBe(true);

    mod.storageSet('localStorage', 'k', 'v');
    expect(mod.storageGet('localStorage', 'k')).toBe('v');

    const memory = window.localStorage;
    memory.setItem('x', '1');
    expect(memory.getItem('x')).toBe('1');
    expect(memory.key(0)).not.toBeNull();
    expect(memory.length).toBeGreaterThan(0);
    memory.removeItem('x');
    expect(memory.getItem('x')).toBeNull();
    memory.setItem('y', '2');
    memory.clear();
    expect(memory.length).toBe(0);
    expect(memory.key(0)).toBeNull();
    expect(memory.key(-1)).toBeNull();
  });

  it('hard-blocked when probe fails and defineProperty throws', () => {
    installThrowingStorage();
    const defineSpy = jest.spyOn(Object, 'defineProperty').mockImplementation((target, prop, descriptor) => {
      if (prop === 'localStorage' || prop === 'sessionStorage') {
        throw new TypeError('Cannot redefine property');
      }
      return Reflect.defineProperty(target as object, prop as PropertyKey, descriptor as PropertyDescriptor);
    });

    const mod = loadSafeStorage();
    mod.installStorageFallback();
    expect(mod.isStorageBlocked()).toBe(true);
    expect(mod.isStorageHardBlocked()).toBe(true);
    expect(mod.getStorageBlockedFlag()).toBe(true);
    expect(() => mod.storageGet('localStorage', 'k')).not.toThrow();
    expect(() => mod.storageSet('localStorage', 'k', 'v')).not.toThrow();
    expect(() => mod.storageRemove('localStorage', 'k')).not.toThrow();
    expect(() => mod.storageClear('sessionStorage')).not.toThrow();
    defineSpy.mockRestore();
  });

  it('clearLoginSessionStorage removes login keys and clears sessionStorage', () => {
    const { local, session } = installWorkingStorage();
    local.setItem('dfx.authenticationToken', 'tok');
    local.setItem('dfx.srv.activeWallet', 'MetaMask');
    local.setItem('dfx.srv.queryParams', '{}');
    local.setItem('dfx.srv.redirectUri', 'https://old.example.com');
    local.setItem('dfx.srv.language', 'de');
    session.setItem('other', '1');

    const { clearLoginSessionStorage } = loadSafeStorage();
    clearLoginSessionStorage();

    expect(local.getItem('dfx.authenticationToken')).toBeNull();
    expect(local.getItem('dfx.srv.activeWallet')).toBeNull();
    expect(local.getItem('dfx.srv.queryParams')).toBeNull();
    expect(local.getItem('dfx.srv.redirectUri')).toBeNull();
    expect(local.getItem('dfx.srv.language')).toBe('de');
    expect(session.getItem('other')).toBeNull();

    installThrowingStorage();
    expect(() => clearLoginSessionStorage()).not.toThrow();
  });

  it('resetDfxStorageAndReload removes dfx. keys, leaves others, and reloads', () => {
    const { local, session } = installWorkingStorage();
    local.setItem('dfx.srv.language', 'de');
    local.setItem('keep.local', '1');
    session.setItem('dfx.bankTx.1', '{}');
    session.setItem('keep.session', '2');

    const { resetDfxStorageAndReload } = loadSafeStorage();
    resetDfxStorageAndReload();

    expect(local.getItem('dfx.srv.language')).toBeNull();
    expect(local.getItem('keep.local')).toBe('1');
    expect(session.getItem('dfx.bankTx.1')).toBeNull();
    expect(session.getItem('keep.session')).toBe('2');
    expect(reloadMock).toHaveBeenCalled();

    installThrowingStorage();
    expect(() => resetDfxStorageAndReload()).not.toThrow();
    expect(reloadMock).toHaveBeenCalled();
  });

  it('resetDfxStorageAndReload skips null keys while listing', () => {
    Object.defineProperty(window, 'localStorage', {
      value: {
        length: 1,
        key: () => null,
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
        clear: () => undefined,
      },
      configurable: true,
    });
    Object.defineProperty(window, 'sessionStorage', {
      value: createMemoryLikeStorage(),
      configurable: true,
    });

    const { resetDfxStorageAndReload } = loadSafeStorage();
    expect(() => resetDfxStorageAndReload()).not.toThrow();
    expect(reloadMock).toHaveBeenCalled();
  });

  it('reportClientError is called at most once for multiple failures', () => {
    installThrowingStorage();
    const { storageGet, storageGetJson, storageSet } = loadSafeStorage();

    storageGet('localStorage', 'a');
    storageGet('sessionStorage', 'b');
    storageSet('localStorage', 'c', 'x');
    installWorkingStorage();
    window.localStorage.setItem('bad', '{kaputt');
    storageGetJson('localStorage', 'bad');

    expect(mockReportClientError).toHaveBeenCalledTimes(1);
    expect(mockReportClientError.mock.calls[0][0]).toEqual(expect.any(Error));
    expect(mockReportClientError.mock.calls[0][1]).toBe('/boot');
  });

  it('reports once when install detects blocked storage', () => {
    installThrowingStorage();
    const mod = loadSafeStorage();
    mod.installStorageFallback();
    mod.storageGet('localStorage', 'a');
    expect(mockReportClientError).toHaveBeenCalledTimes(1);
    expect((mockReportClientError.mock.calls[0][0] as Error).message).toBe('Storage blocked');
  });

  it('reports Invalid JSON in storage on parse failure', () => {
    installWorkingStorage();
    window.localStorage.setItem('bad', '{kaputt');
    const { storageGetJson } = loadSafeStorage();
    storageGetJson('localStorage', 'bad');
    expect(mockReportClientError).toHaveBeenCalledTimes(1);
    expect((mockReportClientError.mock.calls[0][0] as Error).message).toBe('Invalid JSON in storage');
  });
});
