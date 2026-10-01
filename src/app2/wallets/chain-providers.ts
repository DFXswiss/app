// DFX App 2.0 — Solana & Tron wallet adapters.
//
// Ports the connect + sign-message halves of the main app's non-EVM wallet
// hooks (src/hooks/wallets/phantom.hook.ts, trust-sol.hook.ts,
// tronlink-trx.hook.ts, trust-trx.hook.ts) onto app2's `connect() -> address`
// / `sign(message) -> signature` session contract. Only auth is needed here —
// the hooks' createTransaction paths (which pull in the wagmi-independent but
// heavy Solana/Tron web3 clients via useSolana()/useTron()) are intentionally
// left out.
//
// The adapter packages (@solana/wallet-adapter-*, @tronweb3/tronwallet-adapter-*)
// are loaded with dynamic import() so their web3 client bundles become their own
// webpack chunks — a visitor who never taps a Solana/Tron wallet never downloads
// them, keeping the app2 initial payload lean.
//
// NOTE: unlike the EVM injected + WalletConnect paths, these adapters could not
// be exercised end-to-end locally (no Phantom/Trust/TronLink extension in the
// test browser). The connect/sign logic mirrors the shipped main-app hooks 1:1,
// but a real-wallet pass is still required before this is considered verified.

import { encodeBase58 } from 'ethers';
import type { WalletCatalogEntry } from './catalog';
import { WalletConnectorError } from './providers';

/** Which chain family a catalog entry connects through. */
export type ChainConnector = 'solana' | 'tron';

/** Adapter identity for a Solana/Tron catalog entry (selects the concrete
 * wallet-adapter class to lazy-load). */
export type ChainAdapterId = 'phantom' | 'trust-sol' | 'tronlink' | 'trust-trx';

/** A connected non-EVM wallet: the derived address plus a bound signer that
 * reuses the very same adapter instance the address came from. */
export interface ChainWalletSession {
  address: string;
  sign: (message: string) => Promise<string>;
}

// Minimal structural types for the two adapter shapes we use — the packages
// ship their own richer types, but pinning to just what connect/sign need keeps
// this module from depending on their type surface (and lets the imports stay
// dynamic).
interface SolanaAdapter {
  connect: () => Promise<void>;
  publicKey: { toBase58: () => string } | null;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}

interface TronAdapter {
  connect: () => Promise<void>;
  address: string | null;
  signMessage: (message: string) => Promise<string>;
}

function isUserRejection(error: unknown): boolean {
  const code = (error as { code?: number } | undefined)?.code;
  const message = String((error as { message?: unknown } | undefined)?.message ?? error ?? '');
  return code === 4001 || /reject|cancel|denied|abort/i.test(message);
}

function toConnectorError(error: unknown, phase: 'connect' | 'sign'): WalletConnectorError {
  if (error instanceof WalletConnectorError) return error;
  if (isUserRejection(error)) return new WalletConnectorError('Connection cancelled', 'rejected');
  return new WalletConnectorError(`Wallet ${phase} failed`, 'failed');
}

async function createSolanaAdapter(id: ChainAdapterId): Promise<SolanaAdapter> {
  if (id === 'phantom') {
    const { PhantomWalletAdapter } = await import('@solana/wallet-adapter-phantom');
    return new PhantomWalletAdapter() as unknown as SolanaAdapter;
  }
  const { TrustWalletAdapter } = await import('@solana/wallet-adapter-trust');
  return new TrustWalletAdapter() as unknown as SolanaAdapter;
}

async function createTronAdapter(id: ChainAdapterId): Promise<TronAdapter> {
  if (id === 'tronlink') {
    const { TronLinkAdapter } = await import('@tronweb3/tronwallet-adapter-tronlink');
    return new TronLinkAdapter() as unknown as TronAdapter;
  }
  const { TrustAdapter } = await import('@tronweb3/tronwallet-adapter-trust');
  return new TrustAdapter() as unknown as TronAdapter;
}

async function connectSolana(id: ChainAdapterId): Promise<ChainWalletSession> {
  const adapter = await createSolanaAdapter(id);
  try {
    await adapter.connect();
  } catch (error) {
    throw toConnectorError(error, 'connect');
  }
  const address = adapter.publicKey?.toBase58();
  if (!address) throw new WalletConnectorError('No account returned', 'no-account');
  return {
    address,
    // Solana: sign the UTF-8 bytes of the challenge, return the signature
    // base58-encoded — the exact wire format phantom.hook.ts / trust-sol.hook.ts use.
    sign: async (message: string) => {
      try {
        const signature = await adapter.signMessage(new TextEncoder().encode(message));
        return encodeBase58(signature);
      } catch (error) {
        throw toConnectorError(error, 'sign');
      }
    },
  };
}

async function connectTron(id: ChainAdapterId): Promise<ChainWalletSession> {
  const adapter = await createTronAdapter(id);
  try {
    await adapter.connect();
  } catch (error) {
    throw toConnectorError(error, 'connect');
  }
  const address = adapter.address ?? undefined;
  if (!address) throw new WalletConnectorError('No account returned', 'no-account');
  return {
    address,
    // Tron: the adapter takes and returns the message/signature as strings
    // directly (tronlink-trx.hook.ts / trust-trx.hook.ts).
    sign: async (message: string) => {
      try {
        return await adapter.signMessage(message);
      } catch (error) {
        throw toConnectorError(error, 'sign');
      }
    },
  };
}

/** Connects a Solana or Tron catalog entry, returning its address and a signer
 * bound to the same adapter instance. Throws WalletConnectorError on failure. */
export async function connectChainWallet(entry: WalletCatalogEntry): Promise<ChainWalletSession> {
  if (!entry.adapterId) throw new WalletConnectorError('Wallet not configured', 'failed');
  return entry.connector === 'solana' ? connectSolana(entry.adapterId) : connectTron(entry.adapterId);
}
