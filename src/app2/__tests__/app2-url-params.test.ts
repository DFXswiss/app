import { appUrl, firstQueryParam, foldApp2PathIntoHash, isSafeAppUrl } from '../utils/url';

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

  it('rejects an unsafe origin', () => {
    process.env.REACT_APP_PUBLIC_URL = 'javascript:alert(1)';
    expect(appUrl('/account')).toBeUndefined();
  });
});
