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

/**
 * CIP-30 `getUsedAddresses` / `getChangeAddress` return hex of a CBOR-encoded byte string
 * (major type 2) wrapping the raw address bytes — not the raw bytes themselves. Unwrap that
 * header when present; if the input is already raw address bytes (no CBOR header), return it
 * unchanged so a non-wrapped wallet still works.
 *
 * Handles definite-length byte strings only (additional info 0–26). Indefinite-length and
 * multi-gig payloads fall through as raw — real CIP-30 addresses are tens of bytes.
 *
 * NOTE: not exercised against a live CIP-30 extension in this environment; kept as best-effort
 * pending a real-wallet pass (see file header).
 */
export function unwrapCip30AddressBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 0) return bytes;
  const b0 = bytes[0];
  const major = b0 >> 5;
  const additional = b0 & 0x1f;
  if (major !== 2) return bytes; // not a CBOR byte-string header
  let offset = 1;
  let len: number;
  if (additional < 24) {
    len = additional;
  } else if (additional === 24 && bytes.length >= 2) {
    len = bytes[1];
    offset = 2;
  } else if (additional === 25 && bytes.length >= 3) {
    len = (bytes[1] << 8) | bytes[2];
    offset = 3;
  } else if (additional === 26 && bytes.length >= 5) {
    len = ((bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4]) >>> 0;
    offset = 5;
  } else {
    return bytes;
  }
  // Only unwrap when the length field accounts for the entire remainder of the buffer.
  // A looser `<=` would treat a raw Shelley pointer address (header nibble 4/5 → major type 2)
  // as a CBOR byte-string and return a 1-byte slice that still bech32-encodes to a plausible
  // but wrong `addr1…` (F5).
  if (offset + len !== bytes.length) return bytes;
  return bytes.subarray(offset, offset + len);
}

/** Shelley-era header: `(address_type << 4) | network_id`. network_id 1 = mainnet (`addr`),
 * anything else (0 = testnet/preprod/preview) → `addr_test`. */
export function cardanoBech32Hrp(addressBytes: Uint8Array): 'addr' | 'addr_test' {
  if (addressBytes.length === 0) return 'addr';
  return (addressBytes[0] & 0x0f) === 1 ? 'addr' : 'addr_test';
}

/** Decode a CIP-30 address hex into the bech32 form the DFX API expects. Exported for unit tests
 * and so the CBOR unwrap + network-prefix choice stay in one place. */
export function cip30HexToBech32(hexAddr: string): string {
  const addressBytes = unwrapCip30AddressBytes(hexToBytes(hexAddr));
  return bech32Encode(cardanoBech32Hrp(addressBytes), addressBytes);
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

  // Display/API address: unwrap CBOR, pick network HRP, bech32-encode. Sign path keeps the raw
  // CIP-30 hex — `signData` expects the same encoding the wallet handed out, not bech32.
  const address = cip30HexToBech32(hexAddr);
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
