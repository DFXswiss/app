import { TextEncoder } from 'util';
import { b32Enc, b32Hrp, b32Polymod, b32Sum, convBits, isValidLnurl, lnurlEncode, qrData, OCP_PL } from '../screens/ocp/lnurl';

(global as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;

describe('LNURL bech32 helpers', () => {
  it('encodes a payment-link URL as an uppercase LNURL and builds the QR payload', () => {
    const url = 'https://api.dfx.swiss/v1/lnurlp/abc';
    const encoded = lnurlEncode(url);
    expect(encoded.startsWith('LNURL')).toBe(true);
    expect(encoded).toMatch(/^[A-Z0-9]+$/);
    expect(qrData(encoded)).toBe(`${OCP_PL}${encoded}`);
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
