import { appUrl, firstQueryParam, foldApp2PathIntoHash, isSafeAppUrl, isSafeHttpsUrl } from '../utils/url';

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

  it('returns undefined when no matching key is present', () => {
    mockLocation('', '#/account');
    expect(firstQueryParam('missing')).toBeUndefined();
    expect(isSafeHttpsUrl(undefined)).toBe(false);
    expect(isSafeHttpsUrl('https://app.dfx.swiss')).toBe(true);
    expect(isSafeHttpsUrl('http://app.dfx.swiss')).toBe(false);
    expect(isSafeHttpsUrl(':::')).toBe(false);
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
