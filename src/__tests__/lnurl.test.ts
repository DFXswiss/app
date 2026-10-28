// Mock dependencies before importing
jest.mock('@dfx.swiss/react', () => ({}));
jest.mock('src/dto/safe.dto', () => ({}));

// Mock process.env
const originalEnv = process.env;
beforeAll(() => {
  process.env = {
    ...originalEnv,
    REACT_APP_PUBLIC_URL: 'http://localhost:3001',
  };
});
afterAll(() => {
  process.env = originalEnv;
});

import { displayWalletAddress, Lnurl } from '../util/lnurl';

describe('Lnurl', () => {
  describe('encode', () => {
    it('should encode string to LNURL format', () => {
      const input = 'https://example.com/lnurl';
      const result = Lnurl.encode(input);

      expect(result).toMatch(/^LNURL/);
      expect(result).toBe(result.toUpperCase());
    });

    it('should create valid bech32 encoded string', () => {
      const input = 'https://test.com';
      const encoded = Lnurl.encode(input);
      const decoded = Lnurl.decode(encoded);

      expect(decoded).toBe(input);
    });
  });

  describe('decode', () => {
    it('should decode valid LNURL', () => {
      const original = 'https://example.com/api';
      const encoded = Lnurl.encode(original);
      const decoded = Lnurl.decode(encoded);

      expect(decoded).toBe(original);
    });

    it('should return undefined for invalid LNURL', () => {
      expect(Lnurl.decode('invalid')).toBeUndefined();
      expect(Lnurl.decode('')).toBeUndefined();
    });

    it('should handle lowercase input', () => {
      const original = 'https://test.com';
      const encoded = Lnurl.encode(original).toLowerCase();
      const decoded = Lnurl.decode(encoded);

      expect(decoded).toBe(original);
    });
  });

  describe('addressToLnurl', () => {
    it('should convert lightning address to LNURL', () => {
      const address = 'user@domain.com';
      const result = Lnurl.addressToLnurl(address);

      expect(result).toMatch(/^LNURL/);

      const decoded = Lnurl.decode(result);
      expect(decoded).toBe('https://domain.com/.well-known/lnurlp/user');
    });
  });

  describe('toLightningAddress', () => {
    it('round-trips a lightning address through addressToLnurl', () => {
      const address = '2233jjjferf@lightning.space';

      expect(Lnurl.toLightningAddress(Lnurl.addressToLnurl(address))).toBe(address);
    });

    it('returns an already-email value unchanged', () => {
      expect(Lnurl.toLightningAddress('user@domain.com')).toBe('user@domain.com');
    });

    it('returns undefined for a DFX lnurlp endpoint', () => {
      const encoded = Lnurl.encode('https://api.dfx.swiss/v0.1/lnurlp/ABC123');

      expect(Lnurl.toLightningAddress(encoded)).toBeUndefined();
    });

    it('returns undefined for an http well-known lnurlp URL', () => {
      const encoded = Lnurl.encode('http://lightning.space/.well-known/lnurlp/abc');

      expect(Lnurl.toLightningAddress(encoded)).toBeUndefined();
    });

    it('returns undefined for a query or an extra path segment', () => {
      const withQuery = Lnurl.encode('https://lightning.space/.well-known/lnurlp/abc?amount=1');
      const withExtraSegment = Lnurl.encode('https://lightning.space/.well-known/lnurlp/abc/extra');

      expect(Lnurl.toLightningAddress(withQuery)).toBeUndefined();
      expect(Lnurl.toLightningAddress(withExtraSegment)).toBeUndefined();
    });

    it('trims an already-email value', () => {
      expect(Lnurl.toLightningAddress('  user@domain.com  ')).toBe('user@domain.com');
    });

    it('returns undefined for a value that is not a lightning address', () => {
      expect(Lnurl.toLightningAddress('a@b@c.com')).toBeUndefined();
      expect(Lnurl.toLightningAddress('ABC@lightning.space')).toBeUndefined();
      expect(Lnurl.toLightningAddress('user@localhost')).toBeUndefined();
      expect(Lnurl.toLightningAddress('user@light ning.space')).toBeUndefined();
      expect(Lnurl.toLightningAddress('not an address')).toBeUndefined();
    });

    it('returns undefined when the decoded payload is not a URL', () => {
      expect(Lnurl.toLightningAddress(Lnurl.encode('not a url'))).toBeUndefined();
    });

    it('returns undefined for userinfo, a port, or a hash', () => {
      const withUser = Lnurl.encode('https://user@lightning.space/.well-known/lnurlp/abc');
      const withPassword = Lnurl.encode('https://:secret@lightning.space/.well-known/lnurlp/abc');
      const withPort = Lnurl.encode('https://lightning.space:8443/.well-known/lnurlp/abc');
      const withHash = Lnurl.encode('https://lightning.space/.well-known/lnurlp/abc#frag');

      expect(Lnurl.toLightningAddress(withUser)).toBeUndefined();
      expect(Lnurl.toLightningAddress(withPassword)).toBeUndefined();
      expect(Lnurl.toLightningAddress(withPort)).toBeUndefined();
      expect(Lnurl.toLightningAddress(withHash)).toBeUndefined();
    });

    it('returns undefined for a path that is not well-known lnurlp', () => {
      const otherRoot = Lnurl.encode('https://lightning.space/other/lnurlp/abc');
      const otherSuffix = Lnurl.encode('https://lightning.space/.well-known/other/abc');

      expect(Lnurl.toLightningAddress(otherRoot)).toBeUndefined();
      expect(Lnurl.toLightningAddress(otherSuffix)).toBeUndefined();
    });

    it('returns undefined when the raw URL is not the canonical well-known path', () => {
      const defaultPort = Lnurl.encode('https://lightning.space:443/.well-known/lnurlp/abc');
      const dotSegment = Lnurl.encode('https://lightning.space/foo/../.well-known/lnurlp/abc');
      const backslash = Lnurl.encode('https://lightning.space/\\.well-known/lnurlp/abc');
      const upperScheme = Lnurl.encode('HTTPS://lightning.space/.well-known/lnurlp/abc');
      const encodedLocal = Lnurl.encode('https://lightning.space/.well-known/lnurlp/%61bc');

      expect(Lnurl.toLightningAddress(defaultPort)).toBeUndefined();
      expect(Lnurl.toLightningAddress(dotSegment)).toBeUndefined();
      expect(Lnurl.toLightningAddress(backslash)).toBeUndefined();
      expect(Lnurl.toLightningAddress(upperScheme)).toBeUndefined();
      expect(Lnurl.toLightningAddress(encodedLocal)).toBeUndefined();
    });

    it('lowercases a mixed-case host', () => {
      const mixedHost = Lnurl.encode('https://Lightning.Space/.well-known/lnurlp/abc');

      expect(Lnurl.toLightningAddress(mixedHost)).toBe('abc@lightning.space');
    });

    it('returns undefined for a bad local part, a host without a dot, or a broken escape', () => {
      const uppercaseLocal = Lnurl.encode('https://lightning.space/.well-known/lnurlp/ABC');
      const bareHost = Lnurl.encode('https://localhost/.well-known/lnurlp/abc');
      const brokenEscape = Lnurl.encode('https://lightning.space/.well-known/lnurlp/%ZZ');

      expect(Lnurl.toLightningAddress(uppercaseLocal)).toBeUndefined();
      expect(Lnurl.toLightningAddress(bareHost)).toBeUndefined();
      expect(Lnurl.toLightningAddress(brokenEscape)).toBeUndefined();
    });
  });

  describe('prependLnurl', () => {
    it('should create URL with lightning param', () => {
      const lnurl = 'LNURL1234';
      const result = Lnurl.prependLnurl(lnurl);

      expect(result).toContain('lightning=LNURL1234');
      expect(result).toContain('pl');
    });
  });
});

describe('displayWalletAddress', () => {
  it('shows a lightning.space LNURL in full even when displayLength is short', () => {
    const lnurl = Lnurl.addressToLnurl('2233jjjferf@lightning.space');

    expect(displayWalletAddress(lnurl, { displayLength: 8 })).toBe('2233jjjferf@lightning.space');
  });

  it('blanks a long 0x address', () => {
    const address = `0x${'a'.repeat(40)}`;

    expect(displayWalletAddress(address, { displayLength: 16 })).toContain('...');
  });
});
