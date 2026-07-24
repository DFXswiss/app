// DFX App 2.0 — Cardano (CIP-30) wallet adapter.
//
// Ports the static preview's connectCardano() (public/app2/index.html, ~line
// 3194) onto app2's connect -> address / sign contract. A CIP-30 browser wallet
// (Nami, Eternl, Lace, …) is enabled via `window.cardano.<key>.enable()`; its
// used/change address arrives as CBOR hex and is re-encoded to the bech32
// `addr1…` the DFX API expects, and `signData` returns a COSE_Sign1 signature
// PLUS a COSE key — the API needs both (the key rides in the auth body, exactly
// like the production CLI_ADA contract, hence walletType `CLI`).
//
// NOTE: this could not be exercised end-to-end locally (no CIP-30 extension in
// the test browser). The logic mirrors the shipped static preview 1:1; a
// real-wallet pass is required before it is considered verified.

import { WalletConnectorError } from './providers';

/** A connected Cardano wallet: the bech32 address plus a signer that returns
 * both the COSE_Sign1 signature and the COSE key (CIP-30 `signData`). */
export interface CardanoWalletSession {
  address: string;
  sign: (message: string) => Promise<{ signature: string; key: string }>;
}

// Minimal structural CIP-30 surface — just the calls connect/sign need.
interface Cip30Api {
  getUsedAddresses: () => Promise<string[]>;
  getChangeAddress?: () => Promise<string>;
  signData: (address: string, payloadHex: string) => Promise<{ signature: string; key: string }>;
}
interface Cip30Wallet {
  enable: () => Promise<Cip30Api>;
}
type Cip30Root = Record<string, Cip30Wallet | undefined>;

// bech32 (BIP-173): CIP-30 wallets hand out addresses as CBOR hex; the DFX API
// wants bech32 (addr1…). Ported verbatim from the static preview.
const B32A = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const B32_GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function b32polymod(values: number[]): number {
  let chk = 1;
  for (const x of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ x;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= B32_GEN[i];
  }
  return chk;
}

function b32hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (const c of hrp) out.push(c.charCodeAt(0) >> 5);
  out.push(0);
  for (const c of hrp) out.push(c.charCodeAt(0) & 31);
  return out;
}

function b32words(bytes: Uint8Array): number[] {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out.push((acc >> bits) & 31);
    }
  }
  if (bits) out.push((acc << (5 - bits)) & 31);
  return out;
}

function bech32Encode(hrp: string, bytes: Uint8Array): string {
  const words = b32words(bytes);
  const chk = b32polymod([...b32hrpExpand(hrp), ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) checksum.push((chk >> (5 * (5 - i))) & 31);
  return hrp + '1' + [...words, ...checksum].map((i) => B32A[i]).join('');
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from((String(hex).match(/../g) ?? []).map((x) => parseInt(x, 16)));
}

function utf8ToHex(text: string): string {
  return Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Connects a CIP-30 Cardano wallet and returns its bech32 address plus a signer
 * bound to the same enabled API. Throws WalletConnectorError on failure. */
export async function connectCardano(): Promise<CardanoWalletSession> {
  const root = (typeof window !== 'undefined' ? (window as { cardano?: Cip30Root }).cardano : undefined) ?? undefined;
  const key = root && (root.nami ? 'nami' : root.eternl ? 'eternl' : root.lace ? 'lace' : Object.keys(root)[0]);
  const wallet = key ? root?.[key] : undefined;
  if (!wallet) throw new WalletConnectorError('Cardano wallet not detected', 'not-installed');

  let api: Cip30Api;
  try {
    api = await wallet.enable();
  } catch (error) {
    throw toConnectorError(error);
  }

  let hexAddr = (await api.getUsedAddresses())[0];
  if (!hexAddr && api.getChangeAddress) hexAddr = await api.getChangeAddress(); // fresh wallets have no used addresses yet
  if (!hexAddr) throw new WalletConnectorError('No account returned', 'no-account');

  const address = bech32Encode('addr', hexToBytes(hexAddr));
  const signingHexAddr = hexAddr;

  return {
    address,
    sign: async (message: string) => {
      try {
        const result = await api.signData(signingHexAddr, utf8ToHex(message));
        return { signature: result.signature, key: result.key };
      } catch (error) {
        throw toConnectorError(error);
      }
    },
  };
}

function toConnectorError(error: unknown): WalletConnectorError {
  if (error instanceof WalletConnectorError) return error;
  const code = (error as { code?: number } | undefined)?.code;
  const message = String((error as { message?: unknown } | undefined)?.message ?? error ?? '');
  if (code === 2 || code === 3 || /reject|cancel|denied|abort/i.test(message)) {
    return new WalletConnectorError('Connection cancelled', 'rejected');
  }
  return new WalletConnectorError('Cardano wallet failed', 'failed');
}
