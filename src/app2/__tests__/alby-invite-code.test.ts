// Round-2 review finding: session.tsx forwarded the raw, unclassified invite code to Alby's
// hosted-account OAuth redirect (GET /auth/alby?usedRef=...) unconditionally as `usedRef`. The
// endpoint validates the same two mutually-exclusive, differently-shaped fields as every other
// login path (AlbySignupDto extends OptionalSignUpDto, api › user/dto/alby.dto.ts) — a full
// recommendation code sent as `usedRef` 400s server-side, and because this is a full-page
// redirect (not a fetch call() can catch), the user lands on a raw API error page instead of a
// translated toast. This pins alby.ts's half of the fix: whichever field the caller classifies
// the code into is the only one that ends up in the redirect URL.

jest.mock('../wallets/providers', () => ({
  WalletConnectorError: class WalletConnectorError extends Error {
    reason: string;
    constructor(message: string, reason: string) {
      super(message);
      this.reason = reason;
    }
  },
}));

jest.mock('@dfx.swiss/react', () => ({
  AuthWalletType: { ALBY: 'Alby' },
}));

import { connectAlby } from '../wallets/alby';

function mockHostedAlbyWebln() {
  (window as unknown as { webln: unknown }).webln = {
    enable: jest.fn().mockResolvedValue(undefined),
    getInfo: jest.fn().mockResolvedValue({ node: { alias: 'getalby.com' } }),
  };
}

describe('connectAlby invite-code forwarding', () => {
  let hrefWritten: string | undefined;

  beforeEach(() => {
    hrefWritten = undefined;
    mockHostedAlbyWebln();
    // jsdom doesn't implement real navigation — replacing `window.location` with a plain object
    // lets `href` be both read (to build returnUrl) and captured on write, without jsdom's
    // "Not implemented: navigation" error.
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: { href: string } }).location = {
      get href() {
        return 'https://app.dfx.swiss/?existing=1';
      },
      set href(value: string) {
        hrefWritten = value;
      },
    } as unknown as { href: string };
  });

  afterEach(() => {
    delete (window as unknown as { webln?: unknown }).webln;
  });

  function writtenRedirectUrl(): URL {
    expect(hrefWritten).toBeDefined();
    return new URL(hrefWritten as string);
  }

  it('forwards a classified usedRef and never sends recommendationCode alongside it', async () => {
    const result = await connectAlby({ apiBaseUrl: 'https://api.dfx.swiss/v1', usedRef: 'AB-C12' });

    expect(result.kind).toBe('redirected');
    const url = writtenRedirectUrl();
    expect(url.searchParams.get('usedRef')).toBe('AB-C12');
    expect(url.searchParams.has('recommendationCode')).toBe(false);
  });

  it('forwards a classified recommendationCode and never sends usedRef alongside it', async () => {
    // This exact shape is what the old unconditional `usedRef: activeInviteRef.current` would
    // have 400'd on — formats.ref (`\w{1,3}-\w{1,3}`) rejects anything this long.
    const result = await connectAlby({ apiBaseUrl: 'https://api.dfx.swiss/v1', recommendationCode: 'AB-CD12-EF34-GH' });

    expect(result.kind).toBe('redirected');
    const url = writtenRedirectUrl();
    expect(url.searchParams.get('recommendationCode')).toBe('AB-CD12-EF34-GH');
    expect(url.searchParams.has('usedRef')).toBe(false);
  });

  it('sends neither field when the caller classified nothing (no invite code, or an unrecognized one)', async () => {
    const result = await connectAlby({ apiBaseUrl: 'https://api.dfx.swiss/v1' });

    expect(result.kind).toBe('redirected');
    const url = writtenRedirectUrl();
    expect(url.searchParams.has('usedRef')).toBe(false);
    expect(url.searchParams.has('recommendationCode')).toBe(false);
  });
});
