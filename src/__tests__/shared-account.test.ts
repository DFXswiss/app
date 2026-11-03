import { assertSharedAccount, isSharedApi, normalizeIban } from 'src/util/shared-account';

describe('shared account guard', () => {
  const ownIban = 'DE89370400440532013000';
  const ownMail = 'joshua.krueger+e2e@dfx.swiss';

  it('normalizes spaces out of an IBAN', () => {
    expect(normalizeIban('ch93 0076 2011 6238 5295 7')).toBe('CH9300762011623852957');
  });

  it('treats loopback, the compose api host and the e2e domain as local', () => {
    expect(isSharedApi('http://localhost:3000/v1')).toBe(false);
    expect(isSharedApi('http://127.0.0.1:3000/v1')).toBe(false);
    expect(isSharedApi('http://[::1]:3000/v1')).toBe(false);
    expect(isSharedApi('http://api:3000/v1')).toBe(false);
    expect(isSharedApi('http://frontend.e2e.test')).toBe(false);
  });

  it('treats the shared DFX APIs as shared', () => {
    expect(isSharedApi('https://dev.api.dfx.swiss/v1')).toBe(true);
    expect(isSharedApi('https://api.dfx.swiss/v1')).toBe(true);
  });

  it('rejects an unparseable URL', () => {
    expect(() => isSharedApi('not a url')).toThrow('API URL is not valid');
  });

  it('allows the example IBAN against a local API', () => {
    expect(() => assertSharedAccount('http://localhost:3000/v1', 'CH9300762011623852957')).not.toThrow();
  });

  it('refuses the example IBAN, an empty IBAN and a foreign mail against a shared API', () => {
    expect(() => assertSharedAccount('https://dev.api.dfx.swiss/v1', 'CH93 0076 2011 6238 5295 7', ownMail)).toThrow(
      'example IBAN',
    );
    expect(() => assertSharedAccount('https://api.dfx.swiss/v1', '   ', ownMail)).toThrow('example IBAN');
    expect(() => assertSharedAccount('https://dev.api.dfx.swiss/v1', ownIban)).toThrow("Another person's mailbox");
    expect(() => assertSharedAccount('https://dev.api.dfx.swiss/v1', ownIban, 'person@example.com')).toThrow(
      "Another person's mailbox",
    );
    expect(() => assertSharedAccount('https://dev.api.dfx.swiss/v1', ownIban, 'other@dfx.swiss')).toThrow(
      "Another person's mailbox",
    );
  });

  it('accepts an own IBAN with an own dfx.swiss mail', () => {
    expect(() => assertSharedAccount('https://dev.api.dfx.swiss/v1', ownIban, 'joshua@dfx.swiss')).not.toThrow();
    expect(() => assertSharedAccount('https://api.dfx.swiss/v1', ownIban, ownMail)).not.toThrow();
  });
});
