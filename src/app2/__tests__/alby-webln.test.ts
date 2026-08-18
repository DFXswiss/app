// Self-custodial WebLN path, enable/sign failures, and hosted-alias suffix / no-method.

jest.mock('../wallets/providers', () => ({
  WalletConnectorError: class WalletConnectorError extends Error {
    reason: string;
    constructor(message: string, reason: string) {
      super(message);
      this.name = 'WalletConnectorError';
      this.reason = reason;
    }
  },
}));

jest.mock('@dfx.swiss/react', () => ({
  AuthWalletType: { ALBY: 'Alby' },
}));

import { connectAlby } from '../wallets/alby';

function setWebln(webln: unknown) {
  (window as unknown as { webln?: unknown }).webln = webln;
}

describe('connectAlby WebLN', () => {
  afterEach(() => {
    delete (window as unknown as { webln?: unknown }).webln;
  });

  it('throws not-installed when WebLN is absent', async () => {
    delete (window as unknown as { webln?: unknown }).webln;
    await expect(connectAlby({ apiBaseUrl: 'https://api.dfx.swiss/v1' })).rejects.toMatchObject({
      reason: 'not-installed',
    });
  });

  it('maps enable rejection vs generic enable failure', async () => {
    setWebln({
      enable: jest.fn().mockRejectedValue(new Error('user denied')),
      getInfo: jest.fn(),
    });
    await expect(connectAlby({ apiBaseUrl: 'https://api.dfx.swiss/v1' })).rejects.toMatchObject({
      reason: 'rejected',
    });

    setWebln({
      enable: jest.fn().mockRejectedValue(new Error('bridge down')),
      getInfo: jest.fn(),
    });
    await expect(connectAlby({ apiBaseUrl: 'https://api.dfx.swiss/v1' })).rejects.toMatchObject({
      reason: 'failed',
    });
  });

  it('returns an LNNID session for a self-custodial node and maps sign errors', async () => {
    const signMessage = jest.fn().mockResolvedValue({ signature: 'ln-sig' });
    setWebln({
      enable: jest.fn().mockResolvedValue(undefined),
      getInfo: jest.fn().mockResolvedValue({ node: { pubkey: 'abCDef' } }),
      signMessage,
    });

    const result = await connectAlby({ apiBaseUrl: 'https://api.dfx.swiss/v1' });
    expect(result).toEqual({
      kind: 'session',
      session: { address: 'LNNIDABCDEF', sign: expect.any(Function) },
    });
    if (result.kind !== 'session') throw new Error('expected session');
    await expect(result.session.sign('challenge')).resolves.toBe('ln-sig');

    signMessage.mockRejectedValueOnce(new Error('permission denied'));
    await expect(result.session.sign('challenge')).rejects.toMatchObject({ reason: 'rejected' });

    signMessage.mockRejectedValueOnce(new Error('node offline'));
    await expect(result.session.sign('challenge')).rejects.toMatchObject({ reason: 'failed' });
  });

  it('treats a *.getalby.com alias as hosted and forwards wallet + invite fields', async () => {
    let hrefWritten: string | undefined;
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: { href: string } }).location = {
      get href() {
        return 'https://app.dfx.swiss/app2/';
      },
      set href(value: string) {
        hrefWritten = value;
      },
    } as unknown as { href: string };

    setWebln({
      enable: jest.fn().mockResolvedValue(undefined),
      getInfo: jest.fn().mockResolvedValue({ node: { alias: 'wallet.getalby.com' } }),
    });

    const result = await connectAlby({
      apiBaseUrl: 'https://api.dfx.swiss/v1/',
      wallet: 'partner',
      recommendationCode: 'AB-CD12-EF34-GH',
    });
    expect(result.kind).toBe('redirected');
    const url = new URL(hrefWritten as string);
    expect(url.pathname).toBe('/v1/auth/alby');
    expect(url.searchParams.get('wallet')).toBe('partner');
    expect(url.searchParams.get('recommendationCode')).toBe('AB-CD12-EF34-GH');
    expect(url.searchParams.has('usedRef')).toBe(false);
  });

  it('throws when neither a pubkey nor a hosted alias is present', async () => {
    setWebln({
      enable: jest.fn().mockResolvedValue(undefined),
      getInfo: jest.fn().mockResolvedValue({ node: { alias: 'my-node' } }),
    });
    await expect(connectAlby({ apiBaseUrl: 'https://api.dfx.swiss/v1' })).rejects.toMatchObject({
      reason: 'failed',
      message: 'No Alby login method found',
    });

    setWebln({
      enable: jest.fn().mockResolvedValue(undefined),
      getInfo: jest.fn().mockResolvedValue({}),
    });
    await expect(connectAlby({ apiBaseUrl: 'https://api.dfx.swiss/v1' })).rejects.toMatchObject({
      reason: 'failed',
    });
  });

  it('maps a rejection that is not an Error instance', async () => {
    setWebln({
      enable: jest.fn().mockRejectedValue('denied'),
      getInfo: jest.fn(),
    });
    await expect(connectAlby({ apiBaseUrl: 'https://api.dfx.swiss/v1' })).rejects.toMatchObject({
      reason: 'rejected',
    });

    setWebln({
      enable: jest.fn().mockRejectedValue({}),
      getInfo: jest.fn(),
    });
    await expect(connectAlby({ apiBaseUrl: 'https://api.dfx.swiss/v1' })).rejects.toMatchObject({
      reason: 'failed',
    });

    setWebln({
      enable: jest.fn().mockRejectedValue(undefined),
      getInfo: jest.fn(),
    });
    await expect(connectAlby({ apiBaseUrl: 'https://api.dfx.swiss/v1' })).rejects.toMatchObject({
      reason: 'failed',
    });
  });
});
