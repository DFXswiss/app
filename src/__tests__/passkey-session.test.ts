import {
  getOpenPasskey,
  installHandbookSessionHook,
  sameSession,
  setOpenPasskey,
  subscribeOpenPasskey,
  updateOpenPasskey,
  type OpenPasskey,
} from '../components/home/wallet/passkey-session';

const session: OpenPasskey = { token: 'token', credentialId: 'credential', bitcoinNetwork: 'regtest' };

it('compares sessions by wallet token and credential', () => {
  expect(sameSession({ ...session }, session)).toBe(true);
  expect(sameSession({ ...session, receiveIndex: 4 }, session)).toBe(true);
  expect(sameSession(undefined, session)).toBe(false);
  expect(sameSession({ ...session, token: 'other' }, session)).toBe(false);
  expect(sameSession({ ...session, credentialId: 'other' }, session)).toBe(false);
});

it('compares sessions without a credential id by wallet token alone', () => {
  const withoutId: OpenPasskey = { token: 'token', bitcoinNetwork: 'regtest' };
  expect(sameSession({ ...withoutId }, withoutId)).toBe(true);
  expect(sameSession({ ...withoutId, token: 'other' }, withoutId)).toBe(false);
  expect(sameSession(session, withoutId)).toBe(false);
});

describe('installHandbookSessionHook', () => {
  it('skips production and a missing window', () => {
    const target = {} as Window;
    installHandbookSessionHook(target, 'production');
    expect('__dfxSetOpenPasskey' in target).toBe(false);
    expect(() => installHandbookSessionHook(undefined, 'test')).not.toThrow();
  });

  it('installs setOpenPasskey when env is test', () => {
    const target = {} as Window;
    installHandbookSessionHook(target, 'test');
    expect(target.__dfxSetOpenPasskey).toBe(setOpenPasskey);
  });

  it('skips the hook when the bundle is a production build', () => {
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
});

describe('open passkey store', () => {
  afterEach(() => setOpenPasskey(undefined));

  it('notifies subscribers until they unsubscribe', () => {
    const seen: Array<OpenPasskey | undefined> = [];
    const unsubscribe = subscribeOpenPasskey(() => seen.push(getOpenPasskey()));
    setOpenPasskey(session);
    expect(getOpenPasskey()).toBe(session);
    unsubscribe();
    setOpenPasskey(undefined);
    expect(seen).toEqual([session]);
    expect(getOpenPasskey()).toBeUndefined();
  });

  it('updates the receive index only on the same open session', () => {
    updateOpenPasskey(session, { receiveIndex: 1 });
    expect(getOpenPasskey()).toBeUndefined();

    setOpenPasskey({ ...session, token: 'newer' });
    updateOpenPasskey(session, { receiveIndex: 2 });
    expect(getOpenPasskey()?.receiveIndex).toBeUndefined();

    setOpenPasskey(session);
    updateOpenPasskey(session, { receiveIndex: 3 });
    expect(getOpenPasskey()).toEqual({ ...session, receiveIndex: 3 });
  });
});
