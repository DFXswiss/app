import { app2PathForRedirectParam, appUrl, firstQueryParam, foldApp2PathIntoHash, isSafeAppUrl, isSafeHttpsUrl, isSafeRedirectUri, mailRedirectUri, routeOrQueryParam } from '../utils/url';

describe('foldApp2PathIntoHash', () => {
  it('folds real-path Checkout/email returns into hash routes and keeps the query', () => {
    // Edge should 302 to the same shape; this is the client-side belt when a host serves
    // the nested path without a redirect (relative assets would still break without absolute base).
    expect(
      foldApp2PathIntoHash({
        pathname: '/app2/buy/success',
        search: '?cko-payment-id=abc',
        hash: '',
      }),
    ).toBe('/app2/#/buy/success?cko-payment-id=abc');

    expect(
      foldApp2PathIntoHash({
        pathname: '/app2/buy/failure',
        search: '',
        hash: '',
      }),
    ).toBe('/app2/#/buy/failure');

    expect(
      foldApp2PathIntoHash({
        pathname: '/app2/account-merge',
        search: '?otp=xyz',
        hash: '',
      }),
    ).toBe('/app2/#/account-merge?otp=xyz');

    expect(
      foldApp2PathIntoHash({
        pathname: '/app2/buy/success/',
        search: '?cko-payment-id=abc',
        hash: '',
      }),
    ).toBe('/app2/#/buy/success?cko-payment-id=abc');

    expect(
      foldApp2PathIntoHash({
        pathname: '/app2/buy/failure/',
        search: '',
        hash: '',
      }),
    ).toBe('/app2/#/buy/failure');

    expect(
      foldApp2PathIntoHash({
        pathname: '/app2/account-merge/',
        search: '?otp=xyz',
        hash: '',
      }),
    ).toBe('/app2/#/account-merge?otp=xyz');
  });

  it('reads window.location when called without an argument', () => {
    expect(foldApp2PathIntoHash()).toBeNull();
  });

  it('is a no-op when already on the matching hash route or an unrelated path', () => {
    expect(
      foldApp2PathIntoHash({
        pathname: '/app2/buy/success',
        search: '?cko-payment-id=abc',
        hash: '#/buy/success?cko-payment-id=abc',
      }),
    ).toBeNull();

    expect(
      foldApp2PathIntoHash({
        pathname: '/app2/',
        search: '',
        hash: '',
      }),
    ).toBeNull();
  });
});

describe('firstQueryParam', () => {
  const original = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });

  function mockLocation(search: string, hash: string) {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, search, hash },
    });
  }

  it('reads recommendation-code and external-transaction-id from the real query', () => {
    mockLocation('?recommendation-code=AB-CDEF-GHIJ-KL&external-transaction-id=tx-1', '');
    expect(firstQueryParam('recommendation-code')).toBe('AB-CDEF-GHIJ-KL');
    expect(firstQueryParam('external-transaction-id')).toBe('tx-1');
  });

  it('reads from the hash query when the real search is empty', () => {
    mockLocation('', '#/?refcode=stb-tax&wallet=MetaMask');
    expect(firstQueryParam('refcode', 'recommendation-code', 'code')).toBe('stb-tax');
    expect(firstQueryParam('wallet')).toBe('MetaMask');
  });

  it('prefers earlier keys in the key list', () => {
    mockLocation('?code=FALLBACK&recommendation-code=AB-CDEF-GHIJ-KL', '');
    expect(firstQueryParam('refcode', 'recommendation-code', 'code')).toBe('AB-CDEF-GHIJ-KL');
  });

  it('returns an empty string when the key is present but empty, and does not skip to later keys', () => {
    mockLocation(
      '?headless=&borderless=&hide-target-selection=&flags=&service=&wallets=&auto-start=&blockchain=&blockchains=&balances=&amount-in=&amount-out=&assets=&asset-in=&asset-out=&payment-method=&bank-account=&personal-iban=&redirect-uri=&external-transaction-id=&wallet=&special-code=&refcode=&recommendation-code=KEEP',
      '',
    );
    expect(firstQueryParam('headless')).toBe('');
    expect(firstQueryParam('borderless')).toBe('');
    expect(firstQueryParam('hide-target-selection')).toBe('');
    expect(firstQueryParam('flags')).toBe('');
    expect(firstQueryParam('service')).toBe('');
    expect(firstQueryParam('wallets')).toBe('');
    expect(firstQueryParam('auto-start')).toBe('');
    expect(firstQueryParam('blockchain')).toBe('');
    expect(firstQueryParam('blockchains')).toBe('');
    expect(firstQueryParam('balances')).toBe('');
    expect(firstQueryParam('amount-in')).toBe('');
    expect(firstQueryParam('amount-out')).toBe('');
    expect(firstQueryParam('assets')).toBe('');
    expect(firstQueryParam('asset-in')).toBe('');
    expect(firstQueryParam('asset-out')).toBe('');
    expect(firstQueryParam('payment-method')).toBe('');
    expect(firstQueryParam('bank-account')).toBe('');
    expect(firstQueryParam('personal-iban')).toBe('');
    expect(firstQueryParam('redirect-uri')).toBe('');
    expect(firstQueryParam('external-transaction-id')).toBe('');
    expect(firstQueryParam('wallet')).toBe('');
    expect(firstQueryParam('special-code')).toBe('');
    expect(firstQueryParam('refcode', 'recommendation-code')).toBe('');
  });

  it('returns undefined when no matching key is present', () => {
    mockLocation('', '#/account');
    expect(firstQueryParam('missing')).toBeUndefined();
    expect(isSafeHttpsUrl(undefined)).toBe(false);
    expect(isSafeHttpsUrl('https://app.dfx.swiss')).toBe(true);
    expect(isSafeHttpsUrl('http://app.dfx.swiss')).toBe(false);
    expect(isSafeHttpsUrl(':::')).toBe(false);
  });
});

describe('routeOrQueryParam', () => {
  const original = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });

  it('lets the outer query win over the hash-router search, including an empty value', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, search: '?asset-out=BTC', hash: '' },
    });
    expect(routeOrQueryParam('?asset-out=USDT', 'asset-out')).toBe('BTC');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, search: '?asset-out=', hash: '' },
    });
    expect(routeOrQueryParam('?asset-out=USDT', 'asset-out')).toBe('');
  });

  it('falls back to the hash-router search, then the hash query', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, search: '', hash: '#/?asset-out=ETH' },
    });
    expect(routeOrQueryParam('', 'asset-out')).toBe('ETH');
    expect(routeOrQueryParam('?asset-out=USDT', 'asset-out')).toBe('USDT');
    expect(routeOrQueryParam('?asset-out=', 'asset-out')).toBe('');
    expect(routeOrQueryParam('?asset-out=%20', 'missing')).toBeUndefined();
  });
});

describe('appUrl', () => {
  const originalEnv = process.env.REACT_APP_PUBLIC_URL;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.REACT_APP_PUBLIC_URL;
    else process.env.REACT_APP_PUBLIC_URL = originalEnv;
  });

  it('builds a same-origin path on a trusted public URL', () => {
    process.env.REACT_APP_PUBLIC_URL = 'https://app.dfx.swiss';
    expect(appUrl('/account')).toBe('https://app.dfx.swiss/account');
    expect(isSafeAppUrl('https://app.dfx.swiss')).toBe(true);
  });

  it('falls back to window.location.origin when no public URL is configured', () => {
    delete process.env.REACT_APP_PUBLIC_URL;
    const href = appUrl('/account');
    expect(href).toBe(`${window.location.origin}/account`);
  });

  it('rejects an unsafe origin', () => {
    process.env.REACT_APP_PUBLIC_URL = 'javascript:alert(1)';
    expect(appUrl('/account')).toBeUndefined();
  });

  it('accepts a local http origin and rejects empty or malformed values', () => {
    expect(isSafeAppUrl(undefined)).toBe(false);
    expect(isSafeAppUrl('')).toBe(false);
    expect(isSafeAppUrl('http://127.0.0.1:3001/')).toBe(true);
    expect(isSafeAppUrl('http://[::1]/')).toBe(true);
    expect(isSafeAppUrl('not a url')).toBe(false);
    process.env.REACT_APP_PUBLIC_URL = 'https://app.dfx.swiss';
    expect(appUrl('https://evil.example/steal')).toBeUndefined();
    process.env.REACT_APP_PUBLIC_URL = 'https://[';
    expect(appUrl('/account')).toBeUndefined();
    process.env.REACT_APP_PUBLIC_URL = 'https://app.dfx.swiss';
    expect(appUrl()).toBe('https://app.dfx.swiss/');
    expect(appUrl('http://[')).toBeUndefined();
  });
});

describe('app2PathForRedirectParam', () => {
  it('maps main-app in-app paths onto App 2.0 hash routes and drops the rest', () => {
    expect(app2PathForRedirectParam('/account')).toBe('/account');
    expect(app2PathForRedirectParam('/buy')).toBe('/');
    expect(app2PathForRedirectParam('/sell')).toBe('/');
    expect(app2PathForRedirectParam('/kyc?x=1')).toBe('/kyc');
    expect(app2PathForRedirectParam('https://evil.example')).toBeUndefined();
    expect(app2PathForRedirectParam('/unknown')).toBeUndefined();
    expect(app2PathForRedirectParam(undefined)).toBeUndefined();
    expect(app2PathForRedirectParam('')).toBeUndefined();
  });
});

describe('isSafeRedirectUri', () => {
  it('allows https, local http and custom wallet schemes', () => {
    expect(isSafeRedirectUri('https://example.com/path?x=1')).toBe(true);
    expect(isSafeRedirectUri('http://localhost:3001/x')).toBe(true);
    expect(isSafeRedirectUri('http://127.0.0.1:3001/x')).toBe(true);
    expect(isSafeRedirectUri('mywallet://callback')).toBe(true);
  });

  it('rejects remote http, executable schemes and unparsable values', () => {
    expect(isSafeRedirectUri('http://evil.com')).toBe(false);
    expect(isSafeRedirectUri('javascript:alert(1)')).toBe(false);
    expect(isSafeRedirectUri('')).toBe(false);
    expect(isSafeRedirectUri('not a uri')).toBe(false);
    expect(isSafeRedirectUri('http://localhost@evil.com')).toBe(false);
  });
});

describe('mailRedirectUri', () => {
  it('passes through an https production origin so the magic link can return to /app2/', () => {
    expect(mailRedirectUri('https://app.dfx.swiss', '/app2/')).toBe('https://app.dfx.swiss/app2/');
  });

  it('omits http origins that fail the auth API @IsUrl() check', () => {
    expect(mailRedirectUri('http://localhost:3011', '/app2/')).toBeUndefined();
    expect(mailRedirectUri('http://127.0.0.1:3011', '/app2/')).toBeUndefined();
  });

  it('returns undefined for a malformed origin', () => {
    expect(mailRedirectUri('not a url', '/app2/')).toBeUndefined();
  });

  it('defaults to window.location', () => {
    expect(mailRedirectUri()).toBe(mailRedirectUri(window.location.origin, window.location.pathname));
  });
});
