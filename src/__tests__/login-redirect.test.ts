jest.mock('@dfx.swiss/react', () => ({}));

import { loginCallbackPath, loginRedirectParams, loginTarget } from '../util/login-redirect';

describe('loginRedirectParams', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('forwards only personal-iban from the page query when not a widget', () => {
    const params = loginRedirectParams({ isWidget: false }, '?user=a@example.com&personal-iban=frick&x=1');
    expect(params.get('personal-iban')).toBe('frick');
    expect([...params.keys()]).toEqual(['personal-iban']);
  });

  it('returns empty params when not a widget and personal-iban is absent', () => {
    const params = loginRedirectParams({ isWidget: false }, '?user=a@example.com&x=1');
    expect([...params.keys()]).toEqual([]);
  });

  it('ignores widgetPersonalIban when not a widget', () => {
    const params = loginRedirectParams({ isWidget: false, widgetPersonalIban: 'frick' }, '?user=a@example.com&x=1');
    expect([...params.keys()]).toEqual([]);
  });

  it('forwards the widget attribute and ignores the page query when embedded', () => {
    const params = loginRedirectParams(
      { isWidget: true, widgetPersonalIban: 'frick' },
      '?personal-iban=yapeal&foo=bar',
    );
    expect(params.get('personal-iban')).toBe('frick');
    expect([...params.keys()]).toEqual(['personal-iban']);
  });

  it('returns empty params when embedded without a widget attribute', () => {
    const params = loginRedirectParams({ isWidget: true }, '?personal-iban=yapeal');
    expect([...params.keys()]).toEqual([]);
  });

  it('forwards an empty-string widget attribute as personal-iban with an empty value', () => {
    const params = loginRedirectParams({ isWidget: true, widgetPersonalIban: '' }, '');
    expect(params.has('personal-iban')).toBe(true);
    expect(params.get('personal-iban')).toBe('');
    expect(params.toString()).toBe('personal-iban=');
  });

  it('forwards the stored partner redirect-uri when not a widget', () => {
    window.sessionStorage.setItem('dfx.srv.redirectUri', 'https://partner.example/return/');

    const params = loginRedirectParams({ isWidget: false }, '');

    expect(params.get('redirect-uri')).toBe('https://partner.example/return/');
    expect([...params.keys()]).toEqual(['redirect-uri']);
  });

  it('forwards personal-iban and the stored redirect-uri together when not a widget', () => {
    window.sessionStorage.setItem('dfx.srv.redirectUri', 'https://partner.example/return/');

    const params = loginRedirectParams({ isWidget: false }, '?personal-iban=frick');

    expect([...params.keys()]).toEqual(['personal-iban', 'redirect-uri']);
    expect(params.get('personal-iban')).toBe('frick');
    expect(params.get('redirect-uri')).toBe('https://partner.example/return/');
  });

  it('does not forward an unsafe stored redirect-uri when not a widget', () => {
    window.sessionStorage.setItem('dfx.srv.redirectUri', 'javascript:alert(1)');

    const params = loginRedirectParams({ isWidget: false }, '');

    expect([...params.keys()]).toEqual([]);
  });

  it('does not forward an empty stored redirect-uri when not a widget', () => {
    window.sessionStorage.setItem('dfx.srv.redirectUri', '');

    const params = loginRedirectParams({ isWidget: false }, '');

    expect([...params.keys()]).toEqual([]);
  });

  it('does not forward the stored redirect-uri when embedded', () => {
    window.sessionStorage.setItem('dfx.srv.redirectUri', 'https://partner.example/return/');

    const params = loginRedirectParams({ isWidget: true }, '');

    expect([...params.keys()]).toEqual([]);
  });

  it('does not throw or forward a redirect-uri when reading storage throws', () => {
    const getItemSpy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    try {
      const params = loginRedirectParams({ isWidget: false }, '');
      expect([...params.keys()]).toEqual([]);
    } finally {
      getItemSpy.mockRestore();
    }
  });

  it('does not forward a redirect-uri from the page query', () => {
    const params = loginRedirectParams({ isWidget: false }, '?redirect-uri=https://x.example');

    expect([...params.keys()]).toEqual([]);
  });
});

describe('loginTarget', () => {
  it.each(['/login', '/login/mail', '/login/wallet', '/LOGIN', '/login/', '/Login/Wallet/'])(
    'defaults %s to /buy',
    (pathname) => {
      expect(loginTarget(undefined, pathname)).toBe('/buy');
    },
  );

  it('has no default on / or /connect', () => {
    expect(loginTarget(undefined, '/')).toBeUndefined();
    expect(loginTarget(undefined, '/connect')).toBeUndefined();
    expect(loginTarget(undefined, '/login/other')).toBeUndefined();
  });

  it('prefers a set redirectPath on every one of those paths', () => {
    for (const pathname of ['/login', '/login/mail', '/login/wallet', '/', '/connect', '/LOGIN', '/Login/Wallet/']) {
      expect(loginTarget('/settings', pathname)).toBe('/settings');
    }
  });

  it('treats an empty redirectPath as unset', () => {
    expect(loginTarget('', '/login')).toBe('/buy');
    expect(loginTarget('', '/connect')).toBeUndefined();
  });
});

describe('loginCallbackPath', () => {
  const redirectParams = new URLSearchParams('redirect-uri=https%3A%2F%2Fpartner.example%2F');

  it('returns a set target unchanged without a redirect-uri', () => {
    expect(loginCallbackPath('/buy', new URLSearchParams())).toBe('/buy');
  });

  it('returns a set target unchanged with a redirect-uri', () => {
    expect(loginCallbackPath('/buy', redirectParams)).toBe('/buy');
  });

  it('returns /account without a target when the params carry a redirect-uri', () => {
    expect(loginCallbackPath(undefined, redirectParams)).toBe('/account');
  });

  it('returns undefined without a target and without a redirect-uri', () => {
    expect(loginCallbackPath(undefined, new URLSearchParams())).toBeUndefined();
    expect(loginCallbackPath(undefined, new URLSearchParams('personal-iban=frick'))).toBeUndefined();
  });

  it('treats an empty target as no target', () => {
    expect(loginCallbackPath('', redirectParams)).toBe('/account');
    expect(loginCallbackPath('', new URLSearchParams())).toBeUndefined();
  });
});
