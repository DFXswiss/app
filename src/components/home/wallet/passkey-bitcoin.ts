import type { KeyRing } from '@dfx.swiss/wallet';
import BigNumber from 'bignumber.js';
import type { PasskeyTx } from './passkey-wallet-history';

// Display and request helpers for the passkey Bitcoin account. Balances, fees, input selection,
// destination checks and the unsigned payment come from wallet-api; nothing here computes them.

export type PasskeyBitcoinNetwork = 'mainnet' | 'testnet4' | 'regtest';
export type PasskeyBitcoinBlockchain = 'Bitcoin' | 'BitcoinTestnet4' | 'BitcoinRegtest';

const BLOCKCHAINS: Record<PasskeyBitcoinNetwork, PasskeyBitcoinBlockchain> = {
  mainnet: 'Bitcoin',
  testnet4: 'BitcoinTestnet4',
  regtest: 'BitcoinRegtest',
};

const LABELS: Record<PasskeyBitcoinNetwork, string> = {
  mainnet: 'Bitcoin',
  testnet4: 'Bitcoin Testnet4',
  regtest: 'Bitcoin Regtest',
};

// The `:blockchain` path segment of /v1/wallet/bitcoin/:blockchain for the ring's network.
export function bitcoinBlockchain(network: PasskeyBitcoinNetwork): PasskeyBitcoinBlockchain {
  return BLOCKCHAINS[network];
}

export function bitcoinLabel(network: PasskeyBitcoinNetwork): string {
  return LABELS[network];
}

// Gap limit for the device's own address discovery (BIP-44 style). wallet-api reports `used` per
// address; the device decides which addresses it asks about.
export const ADDRESS_GAP = 5;
// POST /account accepts at most 50 addresses.
export const MAX_ADDRESSES = 50;

// BIP-84 receive chain, account 0. The wallet package derives the address on the ring's network.
export function receiveAddress(keys: KeyRing, index: number): string {
  return keys.bitcoinAddress(0, index).address;
}

export function receiveAddresses(keys: KeyRing, count: number): string[] {
  const size = Math.min(Math.max(count, 1), MAX_ADDRESSES);
  return Array.from({ length: size }, (_, index) => receiveAddress(keys, index));
}

// First receive index after the highest used one. Addresses wallet-api did not return count as unused.
export function nextReceiveIndex(addresses: string[], rows: { address: string; used: boolean }[]): number {
  const used = new Set(rows.filter((row) => row.used).map((row) => row.address));
  let next = 0;
  addresses.forEach((address, index) => {
    if (used.has(address)) next = index + 1;
  });
  return next;
}

// True while the unused tail after the receive index is shorter than the gap and the request may grow.
export function needsMoreAddresses(count: number, receiveIndex: number): boolean {
  return receiveIndex + ADDRESS_GAP > count && count < MAX_ADDRESSES;
}

export function discoveryCount(receiveIndex: number): number {
  return Math.min(receiveIndex + ADDRESS_GAP, MAX_ADDRESSES);
}

// Asks wallet-api about the receive addresses until the unused tail reaches the gap limit (or the
// 50-address request limit). Returns the last account answer and the next unused receive index.
export async function discoverAccount<T extends { addresses: { address: string; used: boolean }[] }>(
  keys: KeyRing,
  startIndex: number,
  load: (addresses: string[]) => Promise<T>,
): Promise<{ account: T; addresses: string[]; receiveIndex: number }> {
  let count = discoveryCount(startIndex);
  for (;;) {
    const addresses = receiveAddresses(keys, count);
    const account = await load(addresses);
    const receiveIndex = Math.max(nextReceiveIndex(addresses, account.addresses), startIndex);
    if (!needsMoreAddresses(addresses.length, receiveIndex)) return { account, addresses, receiveIndex };
    count = discoveryCount(receiveIndex);
  }
}

// Own addresses offered to POST /prepare and the change address. The change goes to the unused
// receive address, which discovery then reports as used and moves past.
export function sendAddresses(keys: KeyRing, receiveIndex: number): { addresses: string[]; changeAddress: string } {
  return {
    addresses: receiveAddresses(keys, discoveryCount(receiveIndex)),
    changeAddress: receiveAddress(keys, Math.min(receiveIndex, MAX_ADDRESSES - 1)),
  };
}

// Whole sats as the decimal string wallet-api expects, or undefined for anything else.
export function parseSats(input: string): string | undefined {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = new BigNumber(trimmed);
  if (value.isZero()) return undefined;
  return value.toFixed(0);
}

// A sell or swap quote is in BTC with at most 8 decimals; wallet-api takes whole sats.
export function satsFromBtc(amount: number | string): string {
  return new BigNumber(amount).shiftedBy(8).integerValue(BigNumber.ROUND_DOWN).toFixed(0);
}

export function formatBtc(sats: number | string): string {
  return `${new BigNumber(sats).shiftedBy(-8).toFixed()} BTC`;
}

export function formatSignedBtc(sats: number): string {
  if (sats > 0) return `+${formatBtc(sats)}`;
  if (sats < 0) return `-${formatBtc(-sats)}`;
  return formatBtc(0);
}

export interface PasskeyBitcoinHistoryRow {
  txid: string;
  confirmed: boolean;
  time?: number | null;
  netAmount: number;
  direction: 'incoming' | 'outgoing' | 'self';
}

const HISTORY_TITLES: Record<PasskeyBitcoinHistoryRow['direction'], string> = {
  incoming: 'Received Bitcoin',
  outgoing: 'Sent Bitcoin',
  self: 'Sent to yourself',
};

// wallet-api returns the history already merged and capped; this only maps rows to the list layout.
export function historyItems(
  rows: PasskeyBitcoinHistoryRow[],
  translate: (key: string) => string,
  locale: string,
): PasskeyTx[] {
  return rows.map((row) => ({
    type: row.direction === 'incoming' ? 'receive' : 'send',
    title: translate(HISTORY_TITLES[row.direction]),
    date:
      typeof row.time === 'number'
        ? new Date(row.time * 1000).toLocaleDateString(locale)
        : translate('Unconfirmed'),
    amount: formatSignedBtc(row.netAmount),
    direction: row.direction === 'incoming' ? 'in' : 'out',
    fiatValue: '',
    pending: !row.confirmed,
    pendingLabel: 'Unconfirmed',
  }));
}
