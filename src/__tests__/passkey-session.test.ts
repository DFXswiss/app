import { installHandbookSessionHook, setOpenPasskey } from '../components/home/wallet/passkey-session';

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
});
