import { TextEncoder } from 'util';
import { b32Enc, b32Hrp, b32Polymod, b32Sum, convBits, isValidLnurl, lnurlEncode, qrData } from '../screens/ocp/lnurl';

(global as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;

describe('LNURL bech32 helpers', () => {
  const originalPublicUrl = process.env.REACT_APP_PUBLIC_URL;
  const originalLocation = window.location;

  afterEach(() => {
    if (originalPublicUrl === undefined) delete process.env.REACT_APP_PUBLIC_URL;
    else process.env.REACT_APP_PUBLIC_URL = originalPublicUrl;
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('encodes a payment-link URL as an uppercase LNURL and builds the QR payload', () => {
    process.env.REACT_APP_PUBLIC_URL = 'https://app.dev.dfx.swiss/app2/';
    const url = 'https://api.dev.dfx.swiss/v1/lnurlp/abc';
    const encoded = lnurlEncode(url);
    expect(encoded.startsWith('LNURL')).toBe(true);
    expect(encoded).toMatch(/^[A-Z0-9]+$/);
    expect(qrData(encoded)).toBe(`https://app.dev.dfx.swiss/pl?lightning=${encoded}`);
  });

  it('uses the runtime origin when no public app URL is configured', () => {
    delete process.env.REACT_APP_PUBLIC_URL;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, origin: 'https://runtime.example' },
    });
    const encoded = lnurlEncode('https://api.dev.dfx.swiss/v1/lnurlp/abc');
    expect(qrData(encoded)).toBe(`https://runtime.example/pl?lightning=${encoded}`);
  });

  it.each(['', 'not-an-origin', 'http://app.dfx.swiss', 'javascript:alert(1)'])(
    'keeps the bare LNURL when the configured origin %j is unsafe',
    (origin) => {
      process.env.REACT_APP_PUBLIC_URL = origin;
      const encoded = lnurlEncode('https://api.dev.dfx.swiss/v1/lnurlp/abc');
      expect(qrData(encoded)).toBe(encoded);
    },
  );

  it('keeps the bare LNURL when neither a configured nor a safe runtime origin is available', () => {
    delete process.env.REACT_APP_PUBLIC_URL;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, origin: 'null' },
    });
    const encoded = lnurlEncode('https://api.dev.dfx.swiss/v1/lnurlp/abc');
    expect(qrData(encoded)).toBe(encoded);
  });

  it('builds a local payer link for a configured local development origin', () => {
    process.env.REACT_APP_PUBLIC_URL = 'http://localhost:3001';
    const encoded = lnurlEncode('http://localhost:3000/v1/lnurlp/abc');
    expect(qrData(encoded)).toBe(`http://localhost:3001/pl?lightning=${encoded}`);
  });

  it('checks the LNURL bech32 checksum before a recovered QR is trusted', () => {
    const encoded = lnurlEncode('https://api.dfx.swiss/v1/lnurlp/abc');
    const badChecksum = `${encoded.slice(0, -1)}${encoded.endsWith('Q') ? 'P' : 'Q'}`;

    expect(isValidLnurl(encoded)).toBe(true);
    expect(isValidLnurl(encoded.toLowerCase())).toBe(true);
    expect(isValidLnurl(badChecksum)).toBe(false);
    expect(isValidLnurl(`X${encoded.slice(1)}`)).toBe(false);
    expect(isValidLnurl(`${encoded.slice(0, 2)}${encoded.slice(2).toLowerCase()}`)).toBe(false);
  });

  it('rejects an empty payload, a short checksum envelope and characters outside bech32', () => {
    expect(isValidLnurl('')).toBe(false);
    expect(isValidLnurl('LNURL1QPZRYX')).toBe(false);
    expect(isValidLnurl('LNURL1AAAAAAA')).toBe(false);
    expect(isValidLnurl('LNURL1@@@@@@@')).toBe(false);
  });

  it('expands the HRP, checksums 5-bit data and converts 8-bit bytes with padding', () => {
    expect(b32Hrp('lnurl')).toEqual([3, 3, 3, 3, 3, 0, 12, 14, 21, 18, 12]);
    expect(b32Polymod([0])).toBeGreaterThan(0);
    expect(b32Sum('lnurl', [1, 2, 3])).toHaveLength(6);
    expect(b32Enc('lnurl', [1, 2, 3])).toMatch(/^lnurl1/);
    expect(convBits([0xff], 8, 5, true)).toEqual([31, 28]);
    expect(convBits([0xff], 8, 5, false)).toEqual([31]);
    expect(convBits([], 8, 5, true)).toEqual([]);
  });
});
