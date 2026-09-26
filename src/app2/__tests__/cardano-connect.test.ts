import { TextEncoder } from 'util';

(global as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;

jest.mock('../wallets/providers', () => ({
  WalletConnectorError: class WalletConnectorError extends Error {
    reason: string;
    constructor(message: string, reason: string) {
      super(message);
      this.reason = reason;
    }
  },
}));

import { WalletConnectorError } from '../wallets/providers';
import { cip30HexToBech32, connectCardano, unwrapCip30AddressBytes } from '../wallets/cardano';

const mainnetRaw = Uint8Array.from([0x01, ...Array(56).fill(0xab)]);
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

describe('connectCardano', () => {
  afterEach(() => {
    delete (window as { cardano?: unknown }).cardano;
  });

  it('throws when no CIP-30 wallet is present', async () => {
    await expect(connectCardano()).rejects.toMatchObject({ reason: 'not-installed' });
  });

  it('connects nami, signs, and falls back to the change address', async () => {
    const signData = jest.fn().mockResolvedValue({ signature: 'sig', key: 'key' });
    (window as { cardano: unknown }).cardano = {
      nami: {
        enable: jest.fn().mockResolvedValue({
          getUsedAddresses: jest.fn().mockResolvedValue([toHex(mainnetRaw)]),
          signData,
        }),
      },
    };
    const session = await connectCardano();
    expect(session.address.startsWith('addr1')).toBe(true);
    await expect(session.sign('hello')).resolves.toEqual({ signature: 'sig', key: 'key' });

    signData.mockRejectedValueOnce(new Error('user denied'));
    await expect(session.sign('hello')).rejects.toMatchObject({ reason: 'rejected' });
    signData.mockRejectedValueOnce(new Error('node down'));
    await expect(session.sign('hello')).rejects.toMatchObject({ reason: 'failed' });
  });

  it('uses eternl/lace/first key, change-address fallback, and maps enable errors', async () => {
    (window as { cardano: unknown }).cardano = {
      eternl: {
        enable: jest.fn().mockResolvedValue({
          getUsedAddresses: jest.fn().mockResolvedValue([]),
          getChangeAddress: jest.fn().mockResolvedValue(toHex(mainnetRaw)),
          signData: jest.fn(),
        }),
      },
    };
    await expect(connectCardano()).resolves.toMatchObject({ address: expect.stringMatching(/^addr1/) });

    (window as { cardano: unknown }).cardano = {
      lace: {
        enable: jest.fn().mockRejectedValue({ code: 2 }),
      },
    };
    await expect(connectCardano()).rejects.toMatchObject({ reason: 'rejected' });

    (window as { cardano: unknown }).cardano = {
      lace: {
        enable: jest.fn().mockRejectedValue({ code: 3 }),
      },
    };
    await expect(connectCardano()).rejects.toMatchObject({ reason: 'rejected' });

    (window as { cardano: unknown }).cardano = {
      other: {
        enable: jest.fn().mockResolvedValue({
          getUsedAddresses: jest.fn().mockResolvedValue([]),
          signData: jest.fn(),
        }),
      },
    };
    await expect(connectCardano()).rejects.toMatchObject({ reason: 'no-account' });
  });

  it('unwraps a 4-byte CBOR length and leaves empty bytes alone', () => {
    expect(Array.from(unwrapCip30AddressBytes(new Uint8Array()))).toEqual([]);
    const payload = Uint8Array.from([1, 2, 3]);
    const wrapped = Uint8Array.from([0x5a, 0, 0, 0, 3, 1, 2, 3]);
    expect(Array.from(unwrapCip30AddressBytes(wrapped))).toEqual(Array.from(payload));
    expect(Array.from(unwrapCip30AddressBytes(Uint8Array.from([0x5b, 1])))).toEqual([0x5b, 1]);
    const twoByte = Uint8Array.from([0x59, 0, 3, 1, 2, 3]);
    expect(Array.from(unwrapCip30AddressBytes(twoByte))).toEqual([1, 2, 3]);
  });

  it('re-throws an existing connector error and encodes an empty address as addr', async () => {
    (window as { cardano: unknown }).cardano = {
      nami: {
        enable: jest.fn().mockRejectedValue(new WalletConnectorError('already', 'rejected')),
      },
    };
    await expect(connectCardano()).rejects.toMatchObject({ reason: 'rejected' });
    expect(cip30HexToBech32('')).toMatch(/^addr1/);

    (window as { cardano: unknown }).cardano = {
      nami: {
        enable: jest.fn().mockRejectedValue(undefined),
      },
    };
    await expect(connectCardano()).rejects.toMatchObject({ reason: 'failed' });
  });
});
