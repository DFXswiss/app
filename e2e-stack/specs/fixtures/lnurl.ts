import { decode, encode, fromWords, toWords } from 'bech32';

const BECH32_LIMIT = 2_000;

/** Encode a service URL as the uppercase bech32 form accepted by the API's LightningHelper. */
export function encodeLnurl(url: string): string {
  return encode('lnurl', toWords(Buffer.from(url, 'utf8')), BECH32_LIMIT).toUpperCase();
}

/** Decode an LNURL back to its service URL; checksum and mixed-case validation come from bech32. */
export function decodeLnurl(lnurl: string): string {
  const decoded = decode(lnurl, BECH32_LIMIT);
  if (decoded.prefix !== 'lnurl') {
    throw new Error(`decodeLnurl: expected prefix "lnurl", got ${JSON.stringify(decoded.prefix)}`);
  }
  return Buffer.from(fromWords(decoded.words)).toString('utf8');
}

/** Parse enough of a BOLT-11 invoice to prove its mainnet prefix and bech32 checksum are valid. */
export function decodeBolt11Prefix(invoice: string): string {
  return decode(invoice, BECH32_LIMIT).prefix;
}
