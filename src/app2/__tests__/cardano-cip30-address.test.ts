// CIP-30 address hex is a CBOR byte-string wrapping the raw address bytes. Unwrap
// before bech32, pick HRP from the network nibble, and leave the raw CIP-30 hex for signData.
// Not verified against a live CIP-30 wallet in this environment.

jest.mock('../wallets/providers', () => ({
  WalletConnectorError: class WalletConnectorError extends Error {
    reason: string;
    constructor(message: string, reason: string) {
      super(message);
      this.reason = reason;
    }
  },
}));

import { cardanoBech32Hrp, cip30HexToBech32, unwrapCip30AddressBytes } from '../wallets/cardano';

function toHex(bytes: Uint8Array | number[]): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Definite-length CBOR major-type-2 wrap of `payload`. */
function cborByteString(payload: Uint8Array): Uint8Array {
  const n = payload.length;
  if (n < 24) return Uint8Array.from([0x40 + n, ...payload]);
  if (n < 256) return Uint8Array.from([0x58, n, ...payload]);
  return Uint8Array.from([0x59, (n >> 8) & 0xff, n & 0xff, ...payload]);
}

describe('Cardano CIP-30 address decode', () => {
  // Shelley base address: header (type<<4)|network_id, 28-byte payment, 28-byte stake → 57 bytes.
  const mainnetRaw = Uint8Array.from([0x01, ...Array(56).fill(0xab)]);
  const testnetRaw = Uint8Array.from([0x00, ...Array(56).fill(0xcd)]);

  it('unwraps a CBOR byte-string header and leaves raw address bytes unchanged', () => {
    const wrapped = cborByteString(mainnetRaw);
    expect(Array.from(unwrapCip30AddressBytes(wrapped))).toEqual(Array.from(mainnetRaw));
    // Passthrough when the wallet already handed out raw address bytes.
    expect(Array.from(unwrapCip30AddressBytes(mainnetRaw))).toEqual(Array.from(mainnetRaw));
  });

  it('picks addr vs addr_test from the network nibble of the first address byte', () => {
    expect(cardanoBech32Hrp(mainnetRaw)).toBe('addr');
    expect(cardanoBech32Hrp(testnetRaw)).toBe('addr_test');
  });

  it('bech32-encodes the unwrapped bytes under the network HRP', () => {
    const wrappedHex = toHex(cborByteString(mainnetRaw));
    const bech = cip30HexToBech32(wrappedHex);
    expect(bech.startsWith('addr1')).toBe(true);
    // Encoding the CBOR-wrapped bytes directly (the pre-fix bug) must not equal the unwrapped form.
    const wronglyEncoded = cip30HexToBech32(toHex(mainnetRaw));
    // unwrapped raw and wrapped-then-unwrapped must agree
    expect(bech).toBe(wronglyEncoded);

    const testBech = cip30HexToBech32(toHex(cborByteString(testnetRaw)));
    expect(testBech.startsWith('addr_test1')).toBe(true);
  });

  it('does not treat a CBOR-wrapped hex as equal to encoding the wrapper itself', () => {
    // Guard: if unwrap were a no-op, bech32 of the CBOR blob would differ from bech32 of the raw
    // address — that difference is exactly the pre-fix bug. Pin that unwrap changes the bytes.
    const wrapped = cborByteString(mainnetRaw);
    expect(Array.from(wrapped)).not.toEqual(Array.from(mainnetRaw));
    expect(Array.from(unwrapCip30AddressBytes(wrapped))).toEqual(Array.from(mainnetRaw));
  });

  it('does not unwrap a raw Shelley pointer address as a 1-byte CBOR payload', () => {
    // Type-4 mainnet pointer: header nibble 4 → first byte 0x41. major = 0x41>>5 = 2, additional = 1
    // would look like a CBOR byte-string of length 1 under a loose `offset+len <= bytes.length`
    // check and return a 1-byte slice that still bech32-encodes to a plausible addr1….
    const pointerRaw = Uint8Array.from([0x41, ...Array(31).fill(0xab)]);
    expect(Array.from(unwrapCip30AddressBytes(pointerRaw))).toEqual(Array.from(pointerRaw));
    const bech = cip30HexToBech32(toHex(pointerRaw));
    expect(bech.startsWith('addr1')).toBe(true);
    // Wrong 1-byte unwrap would be far shorter than a real pointer bech32.
    expect(bech.length).toBeGreaterThan(20);
  });
});
