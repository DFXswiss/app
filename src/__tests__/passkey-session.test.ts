import {
  getOpenPasskey,
  installHandbookSessionHook,
  setOpenPasskey,
  subscribeOpenPasskey,
  type OpenPasskey,
} from '../components/home/wallet/passkey-session';

describe('installHandbookSessionHook', () => {
  it('does not install the hook on a production target', () => {
    // The module-load call already installs the hook on the test window because NODE_ENV is `test`.
    const target = {} as Window;
    installHandbookSessionHook(target, 'production');
    expect('__dfxSetOpenPasskey' in target).toBe(false);
  });

  it('installs setOpenPasskey when env is test', () => {
    const target = {} as Window;
    installHandbookSessionHook(target, 'test');
    expect(target.__dfxSetOpenPasskey).toBe(setOpenPasskey);
  });

  it('returns without throwing when the target is missing', () => {
    const other = {} as Window;
    expect(() => installHandbookSessionHook(undefined, 'test')).not.toThrow();
    expect('__dfxSetOpenPasskey' in other).toBe(false);
  });

  it('skips the assignment when the build target is production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const target = {} as Window;
      installHandbookSessionHook(target, 'test');
      expect('__dfxSetOpenPasskey' in target).toBe(false);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('stores the tab session and stops notifying after unsubscribe', () => {
    setOpenPasskey(undefined);
    expect(getOpenPasskey()).toBeUndefined();
    const seen: Array<OpenPasskey | undefined> = [];
    const unsubscribe = subscribeOpenPasskey(() => {
      seen.push(getOpenPasskey());
    });
    const next = { state: 'compromised' } as OpenPasskey;
    setOpenPasskey(next);
    expect(getOpenPasskey()).toBe(next);
    expect(seen).toEqual([next]);
    unsubscribe();
    setOpenPasskey(undefined);
    expect(getOpenPasskey()).toBeUndefined();
    expect(seen).toEqual([next]);
  });
});
