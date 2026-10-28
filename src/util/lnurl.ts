import { bech32 } from 'bech32';
import { Buffer } from 'buffer';
import { blankedAddress, url } from './utils';

const lightningLocalPartPattern = /^[a-z0-9\-_.+]+$/;

function isLightningAddress(value: string): boolean {
  const separator = value.indexOf('@');
  if (separator < 1 || value.indexOf('@', separator + 1) !== -1) return false;

  const local = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  return lightningLocalPartPattern.test(local) && domain.includes('.') && !/\s/.test(domain);
}

export class Lnurl {
  static encode(string: string): string {
    const words = bech32.toWords(Buffer.from(string));
    return bech32.encode('LNURL', words, 1023).toUpperCase();
  }

  static decode(lnurl: string): string | undefined {
    try {
      const decoded = bech32.decode(lnurl, 1023);
      return Buffer.from(bech32.fromWords(decoded.words)).toString('utf8');
    } catch (e) {
      return undefined;
    }
  }

  static prependLnurl(lnurl: string): string {
    const params = new URLSearchParams({ lightning: lnurl });
    return url({ path: 'pl', params });
  }

  static addressToLnurl(address: string): string {
    const [user, domain] = address.split('@');
    const wellKnownUrl = `https://${domain}/.well-known/lnurlp/${user}`;

    return this.encode(wellKnownUrl);
  }

  static toLightningAddress(value: string): string | undefined {
    const trimmed = value.trim();
    if (isLightningAddress(trimmed)) return trimmed;

    const decoded = this.decode(trimmed);
    if (decoded === undefined) return undefined;

    let parsed: URL;
    try {
      parsed = new URL(decoded);
    } catch (e) {
      return undefined;
    }

    if (parsed.protocol !== 'https:') return undefined;
    if (parsed.username !== '') return undefined;
    if (parsed.password !== '') return undefined;
    if (parsed.port !== '') return undefined;
    if (parsed.search !== '') return undefined;
    if (parsed.hash !== '') return undefined;

    const segments = parsed.pathname.split('/');
    if (segments.length !== 4 || segments[0] !== '' || segments[1] !== '.well-known' || segments[2] !== 'lnurlp') {
      return undefined;
    }

    let local: string;
    try {
      local = decodeURIComponent(segments[3]);
    } catch (e) {
      return undefined;
    }
    if (!lightningLocalPartPattern.test(local)) return undefined;
    if (!parsed.hostname.includes('.')) return undefined;
    if (!decoded.startsWith('https://')) return undefined;

    const slash = decoded.indexOf('/', 'https://'.length);
    const authority = decoded.slice('https://'.length, slash);
    const path = decoded.slice(slash);
    if (authority.toLowerCase() !== parsed.hostname) return undefined;
    if (path !== `/.well-known/lnurlp/${local}`) return undefined;

    return `${local}@${parsed.hostname}`;
  }
}

export function displayWalletAddress(
  address: string,
  options?: { displayLength?: number; width?: number; scale?: number },
): string {
  const lightningAddress = Lnurl.toLightningAddress(address);
  if (lightningAddress !== undefined) return lightningAddress;
  return blankedAddress(address, options);
}
