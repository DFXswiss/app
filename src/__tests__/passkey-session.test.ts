import {
  getOpenPasskey,
  installHandbookSessionHook,
  sameSession,
  setOpenPasskey,
  subscribeOpenPasskey,
  type OpenPasskey,
} from '../components/home/wallet/passkey-session';

it('compares wallet, credential and token when identifying a session', () => {
  const session = { accessToken: 'token', wallet: { id: 7, credentialId: 'credential' } } as unknown as OpenPasskey;
  const equal = { accessToken: 'token', wallet: { id: 7, credentialId: 'credential' } } as unknown as OpenPasskey;
  expect(sameSession(equal, session)).toBe(true);
  expect(sameSession(undefined, session)).toBe(false);
  expect(sameSession({ ...session, wallet: undefined } as unknown as OpenPasskey, session)).toBe(false);
  expect(sameSession({ ...session, wallet: { ...session.wallet, id: 8 } }, session)).toBe(false);
  expect(sameSession({ ...session, wallet: { ...session.wallet, credentialId: 'other' } }, session)).toBe(false);
  expect(sameSession({ ...session, accessToken: 'other' }, session)).toBe(false);
});

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
    const target = {} as Window;
    installHandbookSessionHook(target, 'test');
    expect(target.__dfxSetOpenPasskey).toBe(setOpenPasskey);
    expect(() => installHandbookSessionHook(undefined, 'test')).not.toThrow();
    expect(target.__dfxSetOpenPasskey).toBe(setOpenPasskey);
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
