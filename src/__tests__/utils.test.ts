// Mock @dfx.swiss/react to avoid ES module issues
jest.mock('@dfx.swiss/react', () => ({
  Asset: {},
  Fiat: {},
  KycFile: {},
  UserAddress: {},
  Utils: {
    formatAmount: jest.fn((amount: number) => amount.toFixed(2)),
    formatAmountCrypto: jest.fn((amount: number) => amount.toString()),
  },
}));

// Mock src/dto/safe.dto
jest.mock('src/dto/safe.dto', () => ({
  CustodyAsset: {},
  CustodyAssetBalance: {},
}));

import {
  isDefined,
  partition,
  isEmpty,
  removeNullFields,
  delay,
  isAbsoluteUrl,
  isSafeRedirectUri,
  blankedAddress,
  formatBytes,
  formatUnits,
  filenameDateFormat,
  extractFilename,
  formatChf,
  formatChfOrDash,
  formatCurrency,
  formatSwissDate,
  formatSwissDateTime,
  formatSwissDateTimeWithSeconds,
  formatSwissTime,
  FormatType,
  deepEqual,
  equalsIgnoreCase,
  formatLocationAddress,
  apiUrl,
  relativeUrl,
  url,
} from '../util/utils';

describe('utils', () => {
  describe('isDefined', () => {
    it('should return true for defined values', () => {
      expect(isDefined(0)).toBe(true);
      expect(isDefined('')).toBe(true);
      expect(isDefined(false)).toBe(true);
      expect(isDefined([])).toBe(true);
      expect(isDefined({})).toBe(true);
    });

    it('should return false for undefined and null', () => {
      expect(isDefined(undefined)).toBe(false);
      expect(isDefined(null)).toBe(false);
    });
  });

  describe('partition', () => {
    it('should partition array based on predicate', () => {
      const [even, odd] = partition([1, 2, 3, 4, 5], (n) => n % 2 === 0);
      expect(even).toEqual([2, 4]);
      expect(odd).toEqual([1, 3, 5]);
    });

    it('should handle empty array', () => {
      const [truthy, falsy] = partition([], () => true);
      expect(truthy).toEqual([]);
      expect(falsy).toEqual([]);
    });

    it('should handle undefined array', () => {
      const [truthy, falsy] = partition(undefined, () => true);
      expect(truthy).toEqual([]);
      expect(falsy).toEqual([]);
    });
  });

  describe('isEmpty', () => {
    it('should return true for empty values', () => {
      expect(isEmpty(undefined)).toBe(true);
      expect(isEmpty(null)).toBe(true);
      expect(isEmpty('')).toBe(true);
      expect(isEmpty([])).toBe(true);
    });

    it('should return false for non-empty values', () => {
      expect(isEmpty(0)).toBe(false);
      expect(isEmpty('text')).toBe(false);
      expect(isEmpty([1])).toBe(false);
      expect(isEmpty(false)).toBe(false);
    });
  });

  describe('removeNullFields', () => {
    it('should remove null and undefined fields', () => {
      const obj = { a: 1, b: null, c: undefined, d: 'test' };
      const result = removeNullFields(obj);
      expect(result).toEqual({ a: 1, d: 'test' });
    });

    it('should return undefined for undefined input', () => {
      expect(removeNullFields(undefined)).toBeUndefined();
    });

    it('should keep falsy but defined values', () => {
      const obj = { a: 0, b: '', c: false, d: null };
      const result = removeNullFields(obj);
      expect(result).toEqual({ a: 0, b: '', c: false });
    });
  });

  describe('delay', () => {
    it('should delay execution', async () => {
      const start = Date.now();
      await delay(0.1);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90);
    });
  });

  describe('isAbsoluteUrl', () => {
    it('should return true for absolute URLs', () => {
      expect(isAbsoluteUrl('http://example.com')).toBe(true);
      expect(isAbsoluteUrl('https://example.com')).toBe(true);
      expect(isAbsoluteUrl('//example.com')).toBe(true);
    });

    it('should return false for relative URLs', () => {
      expect(isAbsoluteUrl('/path/to/page')).toBe(false);
      expect(isAbsoluteUrl('path/to/page')).toBe(false);
    });
  });

  describe('url', () => {
    it('should keep the base without a trailing slash when there is no path (referral link)', () => {
      expect(url({ base: 'https://dfx.swiss/app/services', params: new URLSearchParams({ code: '185-151' }) })).toBe(
        'https://dfx.swiss/app/services?code=185-151',
      );
    });

    it('should keep a trailing slash that is part of the base when there is no path', () => {
      expect(url({ base: 'https://dfx.swiss/app/services/' })).toBe('https://dfx.swiss/app/services/');
    });

    it('should join base and path with a single slash', () => {
      expect(url({ base: 'https://dfx.swiss/app', path: 'services' })).toBe('https://dfx.swiss/app/services');
      expect(url({ base: 'https://dfx.swiss/app/', path: '/services' })).toBe('https://dfx.swiss/app/services');
    });

    it('should use an absolute path as base', () => {
      expect(url({ base: 'https://dfx.swiss', path: 'https://app.dfx.swiss' })).toBe('https://app.dfx.swiss/');
    });
  });

  describe('isSafeRedirectUri', () => {
    it('should allow HTTPS URIs', () => {
      expect(isSafeRedirectUri('https://example.com')).toBe(true);
      expect(isSafeRedirectUri('https://example.com/path?param=value')).toBe(true);
    });

    it('should allow custom deep link schemes', () => {
      expect(isSafeRedirectUri('myapp://x')).toBe(true);
      expect(isSafeRedirectUri('mywallet://callback?status=done')).toBe(true);
      expect(isSafeRedirectUri('bitcoin:bc1q0000000000000000000000000000000000000000')).toBe(true);
    });

    it('should allow HTTP only for localhost', () => {
      expect(isSafeRedirectUri('http://localhost:3001/x')).toBe(true);
      expect(isSafeRedirectUri('http://127.0.0.1:3001/x')).toBe(true);
      expect(isSafeRedirectUri('http://evil.com')).toBe(false);
    });

    it('should block browser-executable schemes', () => {
      expect(isSafeRedirectUri('javascript:alert(1)')).toBe(false);
      expect(isSafeRedirectUri('JaVaScRiPt:alert(1)')).toBe(false);
      expect(isSafeRedirectUri('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(isSafeRedirectUri('blob:https://example.com/uuid')).toBe(false);
      expect(isSafeRedirectUri('file:///etc/passwd')).toBe(false);
      expect(isSafeRedirectUri('vbscript:msgbox(1)')).toBe(false);
      expect(isSafeRedirectUri('about:blank')).toBe(false);
    });

    it('should block resource-exposing and external-handler schemes', () => {
      expect(isSafeRedirectUri('view-source:https://evil.com')).toBe(false);
      expect(isSafeRedirectUri('intent://x#Intent;scheme=javascript;end')).toBe(false);
      expect(isSafeRedirectUri('ws://evil.com')).toBe(false);
      expect(isSafeRedirectUri('wss://evil.com')).toBe(false);
      expect(isSafeRedirectUri('ftp://evil.com')).toBe(false);
      expect(isSafeRedirectUri('tel:+1234')).toBe(false);
      expect(isSafeRedirectUri('sms:+1234')).toBe(false);
      expect(isSafeRedirectUri('mailto:a@evil.com?body=phish')).toBe(false);
      expect(isSafeRedirectUri('filesystem:https://evil.com/x')).toBe(false);
      expect(isSafeRedirectUri('chrome://settings')).toBe(false);
    });

    it('should block userinfo and subdomain localhost bypasses', () => {
      expect(isSafeRedirectUri('http://localhost@evil.com')).toBe(false);
      expect(isSafeRedirectUri('http://127.0.0.1.evil.com')).toBe(false);
      expect(isSafeRedirectUri('http://localhost.evil.com')).toBe(false);
    });

    it('should block control-character and whitespace scheme tricks', () => {
      expect(isSafeRedirectUri('java\tscript:alert(1)')).toBe(false);
      expect(isSafeRedirectUri('java\nscript:alert(1)')).toBe(false);
      expect(isSafeRedirectUri('  javascript:alert(1)')).toBe(false);
    });

    it('should block non-parsable URIs', () => {
      expect(isSafeRedirectUri('')).toBe(false);
      expect(isSafeRedirectUri('not a uri')).toBe(false);
      expect(isSafeRedirectUri('example.com/path')).toBe(false);
    });
  });

  describe('blankedAddress', () => {
    it('should truncate long addresses', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      const result = blankedAddress(address, { displayLength: 16 });
      expect(result).toContain('...');
      expect(result.length).toBeLessThan(address.length);
    });

    it('should not truncate short addresses', () => {
      const address = '0x1234';
      const result = blankedAddress(address, { displayLength: 20 });
      expect(result).toBe(address);
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
    });
  });

  describe('formatUnits', () => {
    it('should format units with decimals', () => {
      expect(formatUnits('1000000000000000000', 18)).toBe('1');
      expect(formatUnits('1500000000000000000', 18)).toBe('1.5');
    });

    it('should handle zero', () => {
      expect(formatUnits('0', 18)).toBe('0');
    });
  });

  describe('filenameDateFormat', () => {
    it('should return formatted date string', () => {
      const result = filenameDateFormat();
      expect(result).toMatch(/^\d{8}_\d{6}$/);
    });
  });

  describe('extractFilename', () => {
    it('should extract filename from content-disposition', () => {
      expect(extractFilename('attachment; filename="test.pdf"')).toBe('test.pdf');
    });

    it('should return undefined for missing header', () => {
      expect(extractFilename(undefined)).toBeUndefined();
    });
  });

  describe('formatCurrency', () => {
    it('should format currency in Swiss format', () => {
      const result = formatCurrency(1234.56, 2, 2, FormatType.SWISS);
      expect(result).toContain('1');
      expect(result).toContain('234');
      expect(result).toContain('56');
    });

    it('should format currency in US format', () => {
      expect(formatCurrency(1234.56, 2, 2, FormatType.US)).toBe('1,234.56');
    });

    it('should return null for invalid values', () => {
      expect(formatCurrency(NaN)).toBeNull();
    });
  });

  describe('formatChf', () => {
    it('should format integer values with Swiss thousands separator', () => {
      const result = formatChf(48515);
      expect(result).toContain('48');
      expect(result).toContain('515');
    });

    it('should round to zero decimals', () => {
      const result = formatChf(1234.78);
      expect(result).not.toContain(',');
      expect(result).not.toContain('.');
    });
  });

  describe('formatChfOrDash', () => {
    it('should return dash for undefined', () => {
      expect(formatChfOrDash(undefined)).toBe('-');
    });

    it('should format zero as "0 CHF"', () => {
      expect(formatChfOrDash(0)).toBe('0 CHF');
    });

    it('should append CHF suffix to formatted value', () => {
      const result = formatChfOrDash(48515);
      expect(result.endsWith(' CHF')).toBe(true);
      expect(result).toContain('48');
    });
  });

  // Built from local components so the expectations hold in any timezone the suite runs in.
  const swissSample = new Date(2026, 5, 12, 14, 30, 45);

  describe('formatSwissDate', () => {
    it('should render Swiss notation with a four-digit year', () => {
      expect(formatSwissDate(swissSample)).toBe('12.06.2026');
    });

    it('should zero-pad day and month', () => {
      expect(formatSwissDate(new Date(2026, 0, 5))).toBe('05.01.2026');
    });
  });

  describe('formatSwissTime', () => {
    it('should render 24-hour time', () => {
      expect(formatSwissTime(swissSample)).toBe('14:30');
    });

    // hour12: false selects h24 on some locales and renders midnight as 24:xx
    it('should render midnight as 00:xx', () => {
      expect(formatSwissTime(new Date(2026, 5, 12, 0, 30))).toBe('00:30');
    });

    // The assertions above only diverge from the browser default on some locales, so pin the
    // locale itself: that is the property this helper exists to guarantee.
    it('should pin the locale instead of following the browser', () => {
      const spy = jest.spyOn(Date.prototype, 'toLocaleTimeString');
      try {
        formatSwissTime(swissSample);
        expect(spy).toHaveBeenCalledWith('de-CH', expect.anything());
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('formatSwissDateTime', () => {
    it('should append 24-hour time without seconds', () => {
      expect(formatSwissDateTime(swissSample)).toBe('12.06.2026, 14:30');
    });
  });

  describe('formatSwissDateTimeWithSeconds', () => {
    it('should keep the seconds a bare toLocaleString() used to emit', () => {
      expect(formatSwissDateTimeWithSeconds(swissSample)).toBe('12.06.2026, 14:30:45');
    });
  });

  describe('deepEqual', () => {
    it('should return true for identical primitives', () => {
      expect(deepEqual(1, 1)).toBe(true);
      expect(deepEqual('a', 'a')).toBe(true);
    });

    it('should compare objects deeply', () => {
      expect(deepEqual({ a: 1 }, { a: 1 })).toBe(true);
      expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('should handle null and undefined', () => {
      expect(deepEqual(null, null)).toBe(true);
      expect(deepEqual(null, undefined)).toBe(false);
    });
  });

  describe('equalsIgnoreCase', () => {
    it('should compare strings case-insensitively', () => {
      expect(equalsIgnoreCase('ABC', 'abc')).toBe(true);
      expect(equalsIgnoreCase('test', 'TEST')).toBe(true);
    });

    it('should return false for different strings', () => {
      expect(equalsIgnoreCase('abc', 'def')).toBe(false);
    });
  });

  describe('formatLocationAddress', () => {
    it('should format full address', () => {
      const result = formatLocationAddress({
        street: 'Main St',
        houseNumber: '123',
        zip: '12345',
        city: 'City',
        country: 'Country',
      });
      expect(result).toBe('Main St 123, 12345 City, Country');
    });

    it('should return undefined for empty address', () => {
      expect(formatLocationAddress({})).toBeUndefined();
    });
  });

  describe('apiUrl', () => {
    it('should never produce a leading slash (SDK joins baseUrl + "/" + url)', () => {
      expect(apiUrl({ path: 'realunit/holders' })).toBe('realunit/holders');
      expect(apiUrl({ path: '/realunit/holders' })).toBe('realunit/holders');
      expect(apiUrl({ path: '///realunit/holders' })).toBe('realunit/holders');
    });

    it('should append params only when they have entries', () => {
      expect(apiUrl({ path: 'realunit/holders', params: new URLSearchParams() })).toBe('realunit/holders');
      expect(apiUrl({ path: 'realunit/holders', params: new URLSearchParams({ after: 'x' }) })).toBe(
        'realunit/holders?after=x',
      );
    });
  });

  describe('relativeUrl', () => {
    it('should keep a single leading slash for router navigation', () => {
      expect(relativeUrl({ path: 'settings' })).toBe('/settings');
      expect(relativeUrl({ path: '/settings' })).toBe('/settings');
    });

    it('should differ from apiUrl only by the leading slash', () => {
      const path = 'realunit/admin/quotes';
      const params = new URLSearchParams({ limit: '50' });
      expect(relativeUrl({ path, params })).toBe('/realunit/admin/quotes?limit=50');
      expect(apiUrl({ path, params })).toBe('realunit/admin/quotes?limit=50');
    });

    it('merges an existing query on path with incoming params into a single ?', () => {
      const result = relativeUrl({
        path: '/support/issue?issue-type=TransactionIssue',
        params: new URLSearchParams({ foo: 'bar' }),
      });
      expect(result.startsWith('/support/issue?')).toBe(true);
      expect(result.indexOf('?')).toBe(result.lastIndexOf('?'));
      const query = new URLSearchParams(result.slice(result.indexOf('?') + 1));
      expect(query.get('issue-type')).toBe('TransactionIssue');
      expect(query.get('foo')).toBe('bar');
    });

    it('lets incoming params override keys that already exist on path', () => {
      const result = relativeUrl({
        path: '/support/issue?issue-type=TransactionIssue',
        params: new URLSearchParams({ 'issue-type': 'LimitRequest' }),
      });
      const query = new URLSearchParams(result.slice(result.indexOf('?') + 1));
      expect(query.get('issue-type')).toBe('LimitRequest');
    });
  });
});
