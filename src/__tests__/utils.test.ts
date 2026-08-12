// Mock @dfx.swiss/react to avoid ES module issues.
// Plain functions (not jest.fn) so implementations cannot be wiped by mockReset elsewhere.
jest.mock('@dfx.swiss/react', () => ({
  Asset: {},
  Fiat: {},
  KycFile: {},
  UserAddress: {},
  Utils: {
    formatAmount: (amount: number) => Number(amount).toFixed(2),
    formatAmountCrypto: (amount: number) => String(amount),
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
  timeout,
  url,
  isAbsoluteUrl,
  isSafeRedirectUri,
  isNode,
  blankedAddress,
  toBase64,
  readFileAsText,
  openPdfFromString,
  downloadPdfFromString,
  openImageFromString,
  handleOpenFile,
  sortAddressesByBlockchain,
  formatBytes,
  fetchJson,
  formatUnits,
  filenameDateFormat,
  extractFilename,
  downloadFile,
  formatChf,
  formatChfOrDash,
  formatCurrency,
  formatAmountForDisplay,
  formatSwissDate,
  formatSwissDateTime,
  formatSwissDateTimeWithSeconds,
  formatSwissTime,
  FormatType,
  deepEqual,
  isAsset,
  equalsIgnoreCase,
  findCustodyBalanceString,
  formatLocationAddress,
  apiUrl,
  relativeUrl,
  redirectAllowedParams,
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

  describe('timeout', () => {
    it('resolves when the promise wins the race', async () => {
      await expect(timeout(Promise.resolve('ok'), 500)).resolves.toBe('ok');
    });

    it('rejects with Error("Timeout") when the timer wins', async () => {
      jest.useFakeTimers();
      try {
        const never = new Promise<string>(() => undefined);
        const resultPromise = timeout(never, 50);
        const expectation = expect(resultPromise).rejects.toThrow('Timeout');
        jest.advanceTimersByTime(50);
        await expectation;
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('url', () => {
    const originalPublicUrl = process.env.REACT_APP_PUBLIC_URL;

    afterEach(() => {
      process.env.REACT_APP_PUBLIC_URL = originalPublicUrl;
    });

    it('builds from REACT_APP_PUBLIC_URL when base is omitted', () => {
      process.env.REACT_APP_PUBLIC_URL = 'https://app.example.com/';
      expect(url({ path: 'settings' })).toBe('https://app.example.com/settings');
    });

    it('uses an explicit base and appends params', () => {
      const result = url({
        base: 'https://app.example.com',
        path: 'login',
        params: new URLSearchParams({ a: 'call' }),
      });
      expect(result).toBe('https://app.example.com/login?a=call');
    });

    it('treats an absolute path as the base', () => {
      // url() normalizes base with a trailing slash before applying params
      expect(url({ path: 'https://other.example.com/x', params: new URLSearchParams({ q: '1' }) })).toBe(
        'https://other.example.com/x/?q=1',
      );
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

  describe('isNode', () => {
    it('returns true for a DOM Node', () => {
      expect(isNode(document.createElement('div'))).toBe(true);
      expect(isNode(document.createTextNode('x'))).toBe(true);
    });

    it('returns false for null and non-nodes', () => {
      expect(isNode(null)).toBe(false);
      expect(isNode({} as EventTarget)).toBe(false);
    });
  });

  describe('blankedAddress', () => {
    it('should truncate long addresses', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      const result = blankedAddress(address, { displayLength: 16 });
      // displayLength 16 minus 0x offset 2 → 14 visible chars split half/half around '...'
      expect(result).toBe('0x1234567...2345678');
    });

    it('should not truncate short addresses', () => {
      const address = '0x1234';
      const result = blankedAddress(address, { displayLength: 20 });
      expect(result).toBe(address);
    });

    it('uses default options when called with only the address', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      const result = blankedAddress(address);
      expect(result).toContain('...');
      expect(result.startsWith('0x')).toBe(true);
    });

    it('derives displayLength from width and accounts for 0x prefix', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      const result = blankedAddress(address, { width: 200, scale: 1 });
      expect(result).toContain('...');
      expect(result.startsWith('0x')).toBe(true);
    });

    it('truncates non-0x addresses without the prefix offset', () => {
      const address = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
      const result = blankedAddress(address, { displayLength: 12 });
      expect(result).toBe('bc1qxy...hx0wlh');
    });
  });

  describe('toBase64 and readFileAsText', () => {
    it('toBase64 resolves a data URL for a file', async () => {
      const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
      const result = await toBase64(file);
      expect(result).toMatch(/^data:text\/plain;base64,/);
    });

    it('toBase64 rejects when FileReader errors', async () => {
      const OriginalFileReader = global.FileReader;
      const readerError = new ProgressEvent('error') as ProgressEvent<FileReader>;
      class FailingReader {
        result: string | null = null;
        onload: ((ev: ProgressEvent<FileReader>) => void) | null = null;
        onerror: ((ev: ProgressEvent<FileReader>) => void) | null = null;
        readAsDataURL() {
          queueMicrotask(() => {
            this.onerror?.(readerError);
          });
        }
      }
      // @ts-expect-error partial FileReader mock
      global.FileReader = FailingReader;
      try {
        await expect(toBase64(new File(['x'], 'x.txt'))).rejects.toBe(readerError);
      } finally {
        global.FileReader = OriginalFileReader;
      }
    });

    it('toBase64 resolves undefined when result is empty', async () => {
      const OriginalFileReader = global.FileReader;
      class EmptyResultReader {
        result: string | null = null;
        onload: ((ev: ProgressEvent<FileReader>) => void) | null = null;
        onerror: ((ev: ProgressEvent<FileReader>) => void) | null = null;
        readAsDataURL() {
          queueMicrotask(() => {
            this.result = null;
            this.onload?.(new ProgressEvent('load') as ProgressEvent<FileReader>);
          });
        }
      }
      // @ts-expect-error partial FileReader mock
      global.FileReader = EmptyResultReader;
      try {
        await expect(toBase64(new File(['x'], 'x.txt'))).resolves.toBeUndefined();
      } finally {
        global.FileReader = OriginalFileReader;
      }
    });

    it('readFileAsText resolves file content', async () => {
      const file = new File(['plain text'], 'note.txt', { type: 'text/plain' });
      await expect(readFileAsText(file)).resolves.toBe('plain text');
    });

    it('readFileAsText rejects when FileReader errors', async () => {
      const OriginalFileReader = global.FileReader;
      const readerError = new ProgressEvent('error') as ProgressEvent<FileReader>;
      class FailingReader {
        result: string | null = null;
        onload: ((ev: ProgressEvent<FileReader>) => void) | null = null;
        onerror: ((ev: ProgressEvent<FileReader>) => void) | null = null;
        readAsText() {
          queueMicrotask(() => {
            this.onerror?.(readerError);
          });
        }
      }
      // @ts-expect-error partial FileReader mock
      global.FileReader = FailingReader;
      try {
        await expect(readFileAsText(new File(['x'], 'x.txt'))).rejects.toBe(readerError);
      } finally {
        global.FileReader = OriginalFileReader;
      }
    });
  });

  describe('PDF / image open helpers and handleOpenFile', () => {
    const sampleBase64 = Buffer.from('%PDF-1.4 sample').toString('base64');
    const imageBase64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');
    // jsdom does not implement these; assign mocks (spyOn requires an existing function).
    let createObjectURL: jest.Mock;
    let revokeObjectURL: jest.Mock;
    let openSpy: jest.SpyInstance;
    let clickSpy: jest.SpyInstance;

    beforeEach(() => {
      createObjectURL = jest.fn(() => 'blob:mock-url');
      revokeObjectURL = jest.fn();
      (URL as any).createObjectURL = createObjectURL;
      (URL as any).revokeObjectURL = revokeObjectURL;
      openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
      clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    });

    afterEach(() => {
      delete (URL as any).createObjectURL;
      delete (URL as any).revokeObjectURL;
      openSpy.mockRestore();
      clickSpy.mockRestore();
      document.body.innerHTML = '';
    });

    it('openPdfFromString opens a new tab by default', () => {
      openPdfFromString(sampleBase64);
      expect(createObjectURL).toHaveBeenCalled();
      expect(openSpy).toHaveBeenCalledWith('blob:mock-url');
    });

    it('openPdfFromString embeds inline when newTab is false', () => {
      openPdfFromString(sampleBase64, false);
      expect(openSpy).not.toHaveBeenCalled();
      const embed = document.body.querySelector('embed');
      expect(embed).not.toBeNull();
      expect(embed?.type).toBe('application/pdf');
      expect(embed?.src).toContain('blob:mock-url');
    });

    it('downloadPdfFromString downloads via downloadFile', () => {
      downloadPdfFromString(sampleBase64, 'doc.pdf');
      expect(createObjectURL).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
      expect(document.body.querySelector('a')).toBeNull();
    });

    it('openImageFromString opens a new tab by default', () => {
      openImageFromString(imageBase64, 'image/png');
      expect(openSpy).toHaveBeenCalledWith('blob:mock-url');
    });

    it('openImageFromString embeds inline when newTab is false', () => {
      openImageFromString(imageBase64, 'image/png', false);
      expect(openSpy).not.toHaveBeenCalled();
      const img = document.body.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.src).toContain('blob:mock-url');
    });

    it('handleOpenFile sets an error for invalid content', () => {
      const setError = jest.fn();
      handleOpenFile({ content: null, contentType: 'application/pdf' } as any, setError);
      expect(setError).toHaveBeenCalledWith('Invalid file type');
      expect(openSpy).not.toHaveBeenCalled();
    });

    it('handleOpenFile opens a PDF for application/* content', () => {
      const setError = jest.fn();
      handleOpenFile(
        {
          content: { type: 'Buffer', data: [1, 2, 3] },
          contentType: 'application/pdf',
        } as any,
        setError,
        true,
      );
      expect(setError).not.toHaveBeenCalled();
      expect(openSpy).toHaveBeenCalledWith('blob:mock-url');
    });

    it('handleOpenFile opens an image for image/* content', () => {
      const setError = jest.fn();
      handleOpenFile(
        {
          content: { type: 'Buffer', data: [9, 8, 7] },
          contentType: 'image/png',
        } as any,
        setError,
        false,
      );
      expect(setError).not.toHaveBeenCalled();
      expect(document.body.querySelector('img')).not.toBeNull();
    });

    it('handleOpenFile does nothing for unsupported file types', () => {
      const setError = jest.fn();
      handleOpenFile(
        {
          content: { type: 'Buffer', data: [1] },
          contentType: 'text/plain',
        } as any,
        setError,
      );
      expect(setError).not.toHaveBeenCalled();
      expect(openSpy).not.toHaveBeenCalled();
      expect(document.body.querySelector('embed')).toBeNull();
      expect(document.body.querySelector('img')).toBeNull();
    });
  });

  describe('sortAddressesByBlockchain', () => {
    it('sorts by the first blockchain name', () => {
      const a = { blockchains: ['Ethereum'] } as any;
      const b = { blockchains: ['Bitcoin'] } as any;
      expect(sortAddressesByBlockchain(a, b)).toBeGreaterThan(0);
      expect(sortAddressesByBlockchain(b, a)).toBeLessThan(0);
      expect(sortAddressesByBlockchain(a, a)).toBe(0);
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
    });

    it('clamps negative decimals to zero', () => {
      expect(formatBytes(2048, -1)).toBe('2 KB');
    });
  });

  describe('fetchJson', () => {
    it('fetches and parses JSON', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({ ok: true }),
      });
      const originalFetch = global.fetch;
      global.fetch = fetchMock as any;
      try {
        await expect(fetchJson('https://example.com/data')).resolves.toEqual({ ok: true });
        expect(fetchMock).toHaveBeenCalledWith('https://example.com/data');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('formatUnits', () => {
    it('should format units with decimals', () => {
      expect(formatUnits('1000000000000000000', 18)).toBe('1');
      expect(formatUnits('1500000000000000000', 18)).toBe('1.5');
    });

    it('defaults decimals to 18 when omitted', () => {
      expect(formatUnits('1000000000000000000')).toBe('1');
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

    it('should return undefined when the header has no filename match', () => {
      expect(extractFilename('inline')).toBeUndefined();
      expect(extractFilename('attachment; size=12')).toBeUndefined();
    });
  });

  describe('downloadFile', () => {
    let createObjectURL: jest.Mock;
    let revokeObjectURL: jest.Mock;
    let clickSpy: jest.SpyInstance;
    let clickedDownload: string | undefined;

    beforeEach(() => {
      createObjectURL = jest.fn(() => 'blob:download');
      revokeObjectURL = jest.fn();
      (URL as any).createObjectURL = createObjectURL;
      (URL as any).revokeObjectURL = revokeObjectURL;
      clickedDownload = undefined;
      // Capture download on the anchor while click runs — the element is removed right after.
      clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        clickedDownload = this.download;
      });
    });

    afterEach(() => {
      delete (URL as any).createObjectURL;
      delete (URL as any).revokeObjectURL;
      clickSpy.mockRestore();
      document.body.innerHTML = '';
    });

    it('uses content-disposition filename when present', () => {
      downloadFile(new Blob(['x']), { 'content-disposition': 'attachment; filename="report.pdf"' }, 'fallback.bin');
      expect(clickSpy).toHaveBeenCalled();
      expect(clickedDownload).toBe('report.pdf');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:download');
      expect(document.body.querySelector('a')).toBeNull();
    });

    it('falls back to the provided filename without content-disposition', () => {
      downloadFile(new Blob(['x']), {}, 'fallback.bin');
      expect(createObjectURL).toHaveBeenCalled();
      expect(clickedDownload).toBe('fallback.bin');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:download');
      expect(document.body.querySelector('a')).toBeNull();
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

    it('parses string amounts and defaults to Swiss format', () => {
      const result = formatCurrency('12.5', 2, 2);
      expect(result).toContain('12');
    });

    it('should return null for invalid values', () => {
      expect(formatCurrency(NaN)).toBeNull();
      expect(formatCurrency(null as unknown as number)).toBeNull();
    });

    it('returns "< 0.01" for tiny positive amounts when fraction digits are allowed', () => {
      expect(formatCurrency(0.005, 0, 2)).toBe('< 0.01');
    });

    it('formats tiny positives normally when maximumFractionDigits is 0', () => {
      // maximumFractionDigits falsy → skip the "< 0.01" shortcut
      const result = formatCurrency(0.005, 0, 0, FormatType.US);
      expect(result).not.toBe('< 0.01');
    });

    it('formats TINY amounts under 1000 with two decimals and thin-space thousands separator above', () => {
      const under = formatCurrency(12.5, 0, 2, FormatType.TINY);
      expect(under).toBe('12.50');
      // en-US groups thousands with ",", then TINY replaces "," with thin space
      const over = formatCurrency(1500, 0, 2, FormatType.TINY);
      expect(over).toBe('1 500');
      const negativeOver = formatCurrency(-1500, 0, 2, FormatType.TINY);
      expect(negativeOver).toBe('-1 500');
      const withSep = formatCurrency(12345, 0, 2, FormatType.TINY);
      expect(withSep).toContain(' ');
      expect(withSep?.replace(/\u2009/g, '')).toBe('12345');
    });

    it('returns undefined for an unknown format enum value', () => {
      // Covers the false branch of the final format === TINY check (fall-through).
      expect(formatCurrency(1, 0, 2, 99 as FormatType)).toBeUndefined();
    });
  });

  describe('formatAmountForDisplay', () => {
    it('returns empty string without a value', () => {
      expect(formatAmountForDisplay(undefined)).toBe('');
    });

    it('formats via Utils.formatAmount and rewrites trailing .00', () => {
      expect(formatAmountForDisplay(12)).toBe('12.-');
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
      expect(deepEqual(undefined, undefined)).toBe(true);
      expect(deepEqual({ a: 1 }, null)).toBe(false);
    });

    it('returns false for differing types, key sets, or missing keys', () => {
      expect(deepEqual(1, '1')).toBe(false);
      expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
      expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
      expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
    });
  });

  describe('isAsset', () => {
    it('detects assets by chainId', () => {
      expect(isAsset({ chainId: 1 } as any)).toBe(true);
      expect(isAsset({ name: 'EUR' } as any)).toBe(false);
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

    it('handles undefined sides', () => {
      expect(equalsIgnoreCase(undefined, undefined)).toBe(true);
      expect(equalsIgnoreCase('a', undefined)).toBe(false);
      expect(equalsIgnoreCase(undefined, 'a')).toBe(false);
    });
  });

  describe('findCustodyBalanceString', () => {
    it('returns the formatted balance when the asset is found', () => {
      const asset = { name: 'BTC' } as any;
      const balances = [{ asset: { name: 'BTC' }, balance: 1.5 }] as any;
      expect(findCustodyBalanceString(asset, balances)).toBe('1.5');
    });

    it('returns empty string when the asset is missing', () => {
      const asset = { name: 'ETH' } as any;
      const balances = [{ asset: { name: 'BTC' }, balance: 1 }] as any;
      expect(findCustodyBalanceString(asset, balances)).toBe('');
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

    it('delegates absolute paths to url()', () => {
      const result = relativeUrl({
        path: 'https://example.com/callback',
        params: new URLSearchParams({ a: '1' }),
      });
      // url() normalizes base with a trailing slash
      expect(result).toBe('https://example.com/callback/?a=1');
    });
  });

  describe('redirectAllowedParams', () => {
    it('copies only a when present', () => {
      const params = redirectAllowedParams('?a=call&code=secret&user=alice@example.com');
      expect(params.get('a')).toBe('call');
      expect(params.get('code')).toBeNull();
      expect(params.get('user')).toBeNull();
      expect([...params.keys()]).toEqual(['a']);
    });

    it('returns an empty set when a is absent', () => {
      const params = redirectAllowedParams('?code=secret&user=alice@example.com');
      expect([...params.keys()]).toEqual([]);
    });
  });
});
