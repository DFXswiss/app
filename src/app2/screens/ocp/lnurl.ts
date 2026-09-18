// DFX App 2.0 — LNURL (bech32) encoding for OpenCryptoPay.
//
// Ported verbatim from the static preview's bech32 helpers
// (public/app2/index.html, ~lines 2140-2150) so invoice / payment-link QR codes
// carry a real, scannable LNURL. Pure functions, no DOM, no deps — unit-testable
// and CSP-safe (the QR itself is rendered by react-qr-code in the sub-views).

const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

/** bech32 polymod checksum step (BIP-173). */
export function b32Polymod(values: number[]): number {
  let chk = 1;
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  for (const x of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ x;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= G[i];
  }
  return chk;
}

/** Expand the human-readable prefix into the polymod input. */
export function b32Hrp(hrp: string): number[] {
  const r: number[] = [];
  for (let i = 0; i < hrp.length; i++) r.push(hrp.charCodeAt(i) >>> 5);
  r.push(0);
  for (let i = 0; i < hrp.length; i++) r.push(hrp.charCodeAt(i) & 31);
  return r;
}

/** Six-symbol bech32 checksum for `hrp` over 5-bit `data`. */
export function b32Sum(hrp: string, data: number[]): number[] {
  const values = b32Hrp(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
  const mod = b32Polymod(values) ^ 1;
  const r: number[] = [];
  for (let i = 0; i < 6; i++) r.push((mod >>> (5 * (5 - i))) & 31);
  return r;
}

/** Encode 5-bit `data` under `hrp` into a bech32 string (`hrp1…`). */
export function b32Enc(hrp: string, data: number[]): string {
  const combined = data.concat(b32Sum(hrp, data));
  let out = `${hrp}1`;
  for (const x of combined) out += B32.charAt(x);
  return out;
}

/** General base conversion (e.g. 8-bit bytes → 5-bit groups) with optional padding. */
export function convBits(data: number[], from: number, to: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const max = (1 << to) - 1;
  for (const val of data) {
    acc = (acc << from) | val;
    bits += from;
    while (bits >= to) {
      bits -= to;
      ret.push((acc >>> bits) & max);
    }
  }
  if (pad && bits > 0) ret.push((acc << (to - bits)) & max);
  return ret;
}

/** Encode a URL as an uppercase LNURL (bech32, `lnurl` prefix). */
export function lnurlEncode(url: string): string {
  const bytes = Array.from(new TextEncoder().encode(url));
  return b32Enc('lnurl', convBits(bytes, 8, 5, true)).toUpperCase();
}

// A web link a phone camera can open (→ the payer page). Mirrors the static
// app's OCP_PL / qrData(), which matches Lnurl.prependLnurl(link.lnurl).
export const OCP_PL = 'https://app.dfx.swiss/pl?lightning=';

/** Build the scannable QR payload string from a payment link's LNURL. */
export function qrData(lnurl: string): string {
  return OCP_PL + lnurl;
}
