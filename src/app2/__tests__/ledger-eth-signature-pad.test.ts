// Ledger ETH signature packing must zero-pad `v` to two hex digits (consistent with
// a fixed-width recovery byte). Without padStart, v=0/1 yields a single hex char and an
// odd-length signature.
//
// hardware-providers only needs WalletConnectorError from providers.ts — mock that so the test
// never pulls WalletConnect/viem (which needs TextEncoder at module load in this Jest env).

jest.mock('../wallets/providers', () => ({
  WalletConnectorError: class WalletConnectorError extends Error {
    reason: string;
    constructor(message: string, reason: string) {
      super(message);
      this.reason = reason;
    }
  },
}));

import { formatLedgerEthSignature } from '../wallets/hardware-providers';

describe('formatLedgerEthSignature', () => {
  const r = '11'.repeat(32);
  const s = '22'.repeat(32);

  it('pads a single-digit v to two hex digits', () => {
    expect(formatLedgerEthSignature(r, s, 0)).toBe('0x' + r + s + '00');
    expect(formatLedgerEthSignature(r, s, 1)).toBe('0x' + r + s + '01');
  });

  it('keeps two-digit v values as two hex digits', () => {
    expect(formatLedgerEthSignature(r, s, 27)).toBe('0x' + r + s + '1b');
    expect(formatLedgerEthSignature(r, s, 28)).toBe('0x' + r + s + '1c');
  });

  it('always yields an even-length hex body (64+64+2 nibbles)', () => {
    for (const v of [0, 1, 15, 16, 27, 28]) {
      const sig = formatLedgerEthSignature(r, s, v);
      expect(sig.startsWith('0x')).toBe(true);
      expect((sig.length - 2) % 2).toBe(0);
      expect(sig.length - 2).toBe(130);
    }
  });
});
