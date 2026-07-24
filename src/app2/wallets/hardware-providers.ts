// DFX App 2.0 — BitBox & Ledger hardware-wallet adapters (Bitcoin + EVM).
//
// Ports the connect + address-derivation + sign-message logic of the main app's
// hardware hooks (src/hooks/wallets/bitbox.hook.ts, ledger.hook.ts) onto app2's
// `connect() -> address` / `sign(message) -> signature` session contract. Only
// the single default account/address (account 0, address 0) is derived — auth
// needs exactly one address; the hooks' multi-address discovery + tx paths are
// out of scope here.
//
// BitBox & Ledger talk to the device over WebHID (BitBox additionally loads a
// WASM core), so no external origin is contacted and the strict app2 CSP
// (`script-src 'self' 'wasm-unsafe-eval'`, `default-src 'self'`) is unchanged.
// The heavy device SDKs load via dynamic import() → their own webpack chunks,
// so a visitor who never taps a hardware wallet never downloads them.
//
// Trezor is different: @trezor/connect-web drives the device through Trezor's
// officially-hosted popup/iframe at connect.trezor.io (over WebUSB, which the
// popup owns — so it works on browsers without WebHID too). That requires the
// additive, scoped CSP entries in scripts/postprocess-app2.js
// (connect.trezor.io in script-src / frame-src / connect-src) — a shared
// security-surface change, documented there.
//
// NOTE: this could not be exercised end-to-end locally (no BitBox/Ledger/Trezor
// device on the test machine). The logic mirrors the shipped main-app hooks; a
// real-device pass is required before it is considered verified.

import { Buffer } from 'buffer';
import KeyPath, { BitcoinAddressType } from '../../config/key-path';
import { WalletConnectorError } from './providers';

/** Which hardware wallet a catalog entry drives. */
export type HardwareId = 'bitbox' | 'ledger' | 'trezor';

/** Which chain's key path / address to couple. */
export type HardwareChain = 'btc' | 'eth';

/** Status/pairing callbacks so the connect sheet can show the right phase
 * (unlock → pairing code → deriving → sign) while the device is worked. */
export interface HardwareCallbacks {
  /** BitBox only: the pairing code to display for on-device comparison. */
  onPairingCode?: (code: string) => void;
  onStatus?: (status: 'unlock' | 'pair' | 'derive') => void;
}

export interface HardwareSession {
  address: string;
  sign: (message: string) => Promise<string>;
}

const ETH_CHAIN_ID = 1n; // Ethereum mainnet — personal-message signing recovers to the address regardless.
const BTC_ADDRESS_TYPE = BitcoinAddressType.NATIVE_SEGWIT;
const BTC_COIN = 'btc';

/** WebHID is required for both devices; absent on Firefox/Safari. */
export function isWebHidAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'hid' in navigator;
}

function isUserAbort(error: unknown): boolean {
  const err = error as { code?: string; message?: string; name?: string } | undefined;
  const text = `${err?.code ?? ''} ${err?.message ?? ''} ${err?.name ?? ''}`.toLowerCase();
  return /user.?abort|user.?cancel|cancelled|canceled|rejected|denied|conditions_of_use_not_satisfied/.test(text);
}

function toConnectorError(error: unknown): WalletConnectorError {
  if (error instanceof WalletConnectorError) return error;
  if (isUserAbort(error)) return new WalletConnectorError('Cancelled on device', 'rejected');
  return new WalletConnectorError('Hardware wallet connection failed', 'failed');
}

// ---------------------------------------------------------------------------
// BitBox — bitbox-api (WebHID + WASM). Pairing: unlockAndPair() surfaces a code
// the user compares on the device, then waitConfirm() resolves once accepted.
// ---------------------------------------------------------------------------

interface BitBoxPaired {
  btcAddress: (
    coin: string,
    keypath: string,
    scriptConfig: { simpleType: string },
    display: boolean,
  ) => Promise<string>;
  ethAddress: (chainId: bigint, keypath: string, display: boolean) => Promise<string>;
  btcSignMessage: (
    coin: string,
    opts: { keypath: string; scriptConfig: { simpleType: string } },
    message: Uint8Array,
  ) => Promise<{ electrumSig65: Uint8Array }>;
  ethSignMessage: (
    chainId: bigint,
    keypath: string,
    message: Uint8Array,
  ) => Promise<{ r: Uint8Array; s: Uint8Array; v: Uint8Array }>;
}

interface BitBoxPairing {
  getPairingCode: () => string | undefined;
  waitConfirm: () => Promise<BitBoxPaired>;
}

interface BitBoxUnpaired {
  unlockAndPair: () => Promise<BitBoxPairing>;
}

async function connectBitBox(chain: HardwareChain, cb: HardwareCallbacks): Promise<HardwareSession> {
  const mod = (await import('bitbox-api')) as unknown as {
    bitbox02ConnectWebHID: (onClose?: () => void) => Promise<BitBoxUnpaired>;
  };

  cb.onStatus?.('unlock');
  const unpaired = await mod.bitbox02ConnectWebHID(undefined);
  const pairing = await unpaired.unlockAndPair();

  const code = pairing.getPairingCode();
  if (code) cb.onPairingCode?.(code);
  cb.onStatus?.('pair');

  const device = await pairing.waitConfirm();
  cb.onStatus?.('derive');

  if (chain === 'btc') {
    const path = KeyPath.BTC(0, BTC_ADDRESS_TYPE);
    const address = await device.btcAddress(BTC_COIN, path.address(0), { simpleType: path.simpleType }, false);
    return {
      address,
      sign: async (message: string) => {
        const { electrumSig65 } = await device.btcSignMessage(
          BTC_COIN,
          { keypath: path.address(0), scriptConfig: { simpleType: path.simpleType } },
          Buffer.from(message),
        );
        return Buffer.from(electrumSig65).toString('base64');
      },
    };
  }

  const ethPath = KeyPath.ETH(0).address(0);
  const address = await device.ethAddress(ETH_CHAIN_ID, ethPath, false);
  return {
    address,
    sign: async (message: string) => {
      const { r, s, v } = await device.ethSignMessage(ETH_CHAIN_ID, ethPath, Buffer.from(message));
      return '0x' + Buffer.from([...Array.from(r), ...Array.from(s), ...Array.from(v)]).toString('hex');
    },
  };
}

// ---------------------------------------------------------------------------
// Ledger — @ledgerhq WebHID transport + hw-app-eth / ledger-bitcoin. The device
// must have the matching app (Bitcoin or Ethereum) open; errors surface as a
// generic "connection failed" the sheet already handles.
// ---------------------------------------------------------------------------

interface LedgerTransport {
  close: () => Promise<void>;
}

interface LedgerEthClient {
  getAddress: (path: string, display: boolean, chainCode: boolean) => Promise<{ address: string }>;
  signPersonalMessage: (path: string, messageHex: string) => Promise<{ r: string; s: string; v: number }>;
}

interface LedgerBtcClient {
  getMasterFingerprint: () => Promise<string>;
  getExtendedPubkey: (path: string) => Promise<string>;
  getWalletAddress: (policy: unknown, hmac: null, change: number, index: number, display: boolean) => Promise<string>;
  signMessage: (message: Uint8Array, path: string) => Promise<string>;
}

async function connectLedger(chain: HardwareChain, cb: HardwareCallbacks): Promise<HardwareSession> {
  const transportMod = (await import('@ledgerhq/hw-transport-webhid')) as unknown as {
    default: { create: () => Promise<LedgerTransport> };
  };

  cb.onStatus?.('unlock');
  const transport = await transportMod.default.create();

  try {
    cb.onStatus?.('derive');
    if (chain === 'eth') {
      const EthClient = (await import('@ledgerhq/hw-app-eth')).default as unknown as new (
        t: LedgerTransport,
      ) => LedgerEthClient;
      const client = new EthClient(transport);
      const path = KeyPath.ETH(0).address(0);
      const { address } = await client.getAddress(path, false, false);
      return {
        address,
        sign: async (message: string) => {
          const sig = await client.signPersonalMessage(path, Buffer.from(message).toString('hex'));
          return '0x' + sig.r + sig.s + sig.v.toString(16);
        },
      };
    }

    const btcMod = (await import('ledger-bitcoin')) as unknown as {
      default: new (t: LedgerTransport) => LedgerBtcClient;
      DefaultWalletPolicy: new (template: string, keyInfo: string) => unknown;
    };
    const client = new btcMod.default(transport);
    const path = KeyPath.BTC(0, BTC_ADDRESS_TYPE);
    const fpr = await client.getMasterFingerprint();
    const pubKey = await client.getExtendedPubkey(path.xPub);
    const policy = new btcMod.DefaultWalletPolicy(path.addressStandard, `[${fpr}/${path.root}]${pubKey}`);
    const address = await client.getWalletAddress(policy, null, 0, 0, false);
    return {
      address,
      sign: (message: string) => client.signMessage(Buffer.from(message), path.address(0)),
    };
  } catch (error) {
    // A failed derive leaves the transport open; the next attempt would hit
    // "device already open". Close it before surfacing the error.
    await transport.close().catch(() => undefined);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Trezor — @trezor/connect-web. Unlike BitBox/Ledger this does NOT use WebHID:
// TrezorConnect opens Trezor's officially-hosted popup/iframe (connect.trezor.io)
// which drives the device over WebUSB and collects on-device consent, so it also
// works on browsers without `navigator.hid`. init() is memoised — TrezorConnect
// is a singleton and re-init() is an error. Mirrors src/hooks/wallets/trezor.hook.ts.
// ---------------------------------------------------------------------------

interface TrezorResult<T> {
  success: boolean;
  payload: T & { error?: string; code?: string };
}
interface TrezorConnectApi {
  init: (opts: {
    popup: boolean;
    debug: boolean;
    lazyLoad: boolean;
    manifest: { appName?: string; email: string; appUrl: string };
    transports: string[];
  }) => Promise<unknown>;
  getAddress: (opts: { path: string; showOnTrezor: boolean }) => Promise<TrezorResult<{ address: string }>>;
  ethereumGetAddress: (opts: { path: string; showOnTrezor: boolean }) => Promise<TrezorResult<{ address: string }>>;
  signMessage: (opts: { path: string; message: string; coin: string }) => Promise<TrezorResult<{ signature: string }>>;
  ethereumSignMessage: (opts: { path: string; message: string }) => Promise<TrezorResult<{ signature: string }>>;
}

let trezorInit: Promise<TrezorConnectApi> | undefined;

function loadTrezor(): Promise<TrezorConnectApi> {
  trezorInit ??= import('@trezor/connect-web')
    .then(async (mod) => {
      const tc = (mod.default ?? mod) as unknown as TrezorConnectApi;
      await tc.init({
        popup: true,
        debug: false,
        lazyLoad: false,
        manifest: { appName: 'DFX', email: 'support@dfx.swiss', appUrl: window.location.origin },
        transports: ['WebUsbTransport'],
      });
      return tc;
    })
    .catch((error: unknown) => {
      trezorInit = undefined; // let a later attempt retry a failed init
      throw error;
    });
  return trezorInit;
}

function unwrapTrezor<T>(result: TrezorResult<T>): T {
  if (result.success) return result.payload;
  const error = result.payload?.error ?? 'Trezor error';
  if (/cancel|denied|permission|not granted/i.test(error)) throw new WalletConnectorError(error, 'rejected');
  throw new WalletConnectorError(error, 'failed');
}

async function connectTrezor(chain: HardwareChain, cb: HardwareCallbacks): Promise<HardwareSession> {
  // No 'unlock' phase: Trezor's hosted popup collects unlock/consent itself (and the
  // 'unlock' status maps to BitBox-specific copy). The initial "Connecting…" label
  // holds until the popup returns an address under 'derive'.
  const tc = await loadTrezor();
  cb.onStatus?.('derive');

  if (chain === 'btc') {
    const path = KeyPath.BTC(0, BTC_ADDRESS_TYPE);
    const addr = unwrapTrezor(await tc.getAddress({ path: path.address(0), showOnTrezor: false }));
    return {
      address: addr.address,
      sign: async (message: string) => {
        const sig = unwrapTrezor(await tc.signMessage({ path: path.address(0), message, coin: BTC_COIN }));
        return sig.signature; // BTC message signatures are base64, as the API expects
      },
    };
  }

  const ethPath = KeyPath.ETH(0).address(0);
  const addr = unwrapTrezor(await tc.ethereumGetAddress({ path: ethPath, showOnTrezor: false }));
  return {
    address: addr.address,
    sign: async (message: string) => {
      const sig = unwrapTrezor(await tc.ethereumSignMessage({ path: ethPath, message }));
      const signature = sig.signature;
      return signature.startsWith('0x') ? signature : '0x' + signature;
    },
  };
}

/** Connects a hardware wallet on the chosen chain, returning its address and a
 * signer bound to the same device session. Throws WalletConnectorError. */
export async function connectHardware(
  id: HardwareId,
  chain: HardwareChain,
  cb: HardwareCallbacks = {},
): Promise<HardwareSession> {
  // BitBox/Ledger require WebHID; Trezor drives its own WebUSB popup and does not.
  if (id !== 'trezor' && !isWebHidAvailable()) throw new WalletConnectorError('WebHID unavailable', 'not-installed');
  try {
    if (id === 'bitbox') return await connectBitBox(chain, cb);
    if (id === 'ledger') return await connectLedger(chain, cb);
    return await connectTrezor(chain, cb);
  } catch (error) {
    throw toConnectorError(error);
  }
}
