// Partner widget-param parsers. Each function is the App 2.0 counterpart of a
// main-app query reader (app-handling.context / buy.screen / sell.screen).
// Unknown values fail closed to "not set" so callers keep their existing default.

import { isSafeRedirectUri } from '../../utils/url';

/** Currencies Bank Frick personal IBANs are issued for — same keys as
 * `FRICK_COLLECTION_IBANS` in src/util/personal-iban.ts. */
export const PERSONAL_IBAN_CURRENCIES: readonly string[] = ['EUR', 'CHF'];

/** Strict: only the lowercase string `true` is on. Main-app `headless` / `auto-start`. */
export function isTrueFlag(value: string | undefined): boolean {
  return value === 'true';
}

/** Present: any non-empty value is on. Main-app `borderless` / `hide-target-selection`. */
export function isPresentFlag(value: string | undefined): boolean {
  return Boolean(value);
}

export function parseEnumValue<T extends string>(
  value: string | undefined,
  members: Record<string, T>,
): T | undefined {
  if (!value) return undefined;
  const wanted = value.toLowerCase();
  return Object.values(members).find((member) => member.toLowerCase() === wanted);
}

export function restrictBlockchains(
  sessionBlockchains: readonly string[] | undefined,
  wanted: string | undefined,
): readonly string[] | undefined {
  if (!wanted) return sessionBlockchains;
  if (!sessionBlockchains?.length) return [wanted];
  const hit = sessionBlockchains.filter((chain) => chain === wanted);
  return hit.length ? hit : sessionBlockchains;
}

/** Comma-split like the main app (`filter.split(',')`). Absent or empty → no filter. No trim. */
export function splitCsvParam(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value.split(',');
}

/**
 * Main-app `isSameAsset` (`@dfx.swiss/react` asset.hook): id, uniqueName, name, chainId.
 * Name/uniqueName/chainId compare case-insensitively; id is `asset.id === +identifier`.
 */
export function assetMatchesFilterToken(
  asset: { id?: number; name: string; uniqueName?: string; chainId?: string | null },
  token: string,
): boolean {
  return (
    asset.id === +token ||
    asset.name.toLowerCase() === token.toLowerCase() ||
    asset.uniqueName?.toLowerCase() === token.toLowerCase() ||
    asset.chainId?.toLowerCase() === token.toLowerCase()
  );
}

/** Main-app `filterAssets` (buy.screen.tsx:942). Unknown tokens drop out; an all-unknown filter is empty. */
export function filterAssetsByParam<T extends { id?: number; name: string; uniqueName?: string; chainId?: string | null }>(
  assets: T[],
  filter: string | undefined,
): T[] {
  const tokens = splitCsvParam(filter);
  if (!tokens) return assets;
  return assets.filter((asset) => tokens.some((token) => assetMatchesFilterToken(asset, token)));
}

/** Main-app `params.blockchains` (`app-handling.context.tsx:512`). Case-insensitive; unknown names drop. */
export function chainAllowedByParam(blockchain: string, filter: string | undefined): boolean {
  const tokens = splitCsvParam(filter);
  if (!tokens) return true;
  const allowed = tokens.map((token) => token.toLowerCase());
  return allowed.includes(blockchain.toLowerCase());
}

/**
 * Main-app `WalletType` strings (`wallet.context.tsx:12-43`) whose catalog `id` differs from
 * the token. Identity tokens (MetaMask, Alby, WalletConnect) hit `id` / `walletType` directly.
 * DfxTaro, Cake, Monero, Mail, Address have no App 2.0 row and are omitted — a filter of only
 * those stays empty rather than showing every wallet.
 *
 * CliAda → Cardano (`catalog.ts` Cardano row is the CLI_ADA / CIP-30 path, `cardano.ts:9`).
 * Other `Cli*` → CLI (`WalletTypeMap` maps them to `AuthWalletType.CLI`; the CLI row is
 * `connector: 'cli'`). CliIcp is CLI, not the coming-soon Internet Computer row (no walletType).
 */
const WALLET_PARAM_CATALOG_ID: { readonly [token: string]: string } = {
  LedgerBtc: 'Ledger',
  LedgerEth: 'Ledger',
  BitBoxBtc: 'BitBox',
  BitBoxEth: 'BitBox',
  TrezorBtc: 'Trezor',
  TrezorEth: 'Trezor',
  PhantomSol: 'Phantom',
  TrustSol: 'Trust Wallet',
  TrustTrx: 'Trust Wallet',
  TronLinkTrx: 'TronLink',
  CliBtc: 'CLI',
  CliSpark: 'CLI',
  CliArk: 'CLI',
  CliFiro: 'CLI',
  CliXmr: 'CLI',
  CliZano: 'CLI',
  CliIcp: 'CLI',
  CliEth: 'CLI',
  CliAda: 'Cardano',
  CliAr: 'CLI',
  CliLn: 'CLI',
  CliSol: 'CLI',
  CliTrx: 'CLI',
};

/**
 * Main-app `wallets` (`home.screen.tsx:246`): case-sensitive `split(',').includes(type)`.
 * Also accepts catalog `id` / `walletType` so `wallets=Ledger` still matches.
 */
export function walletAllowedByParam(
  entry: { id: string; walletType?: string },
  filter: string | undefined,
): boolean {
  const tokens = splitCsvParam(filter);
  if (!tokens) return true;
  return tokens.some((token) => {
    if (token === entry.walletType || token === entry.id) return true;
    const catalogId = WALLET_PARAM_CATALOG_ID[token];
    return Boolean(catalogId) && catalogId === entry.id;
  });
}

export function matchBankAccount<T extends { id: number; iban: string; label?: string }>(
  accounts: T[],
  identifier: string,
): T | undefined {
  const byId = accounts.find((account) => account.id === +identifier);
  if (byId) return byId;
  const needle = identifier.toLowerCase();
  const byIban = accounts.find((account) => account.iban.toLowerCase() === needle);
  if (byIban) return byIban;
  return accounts.find((account) => account.label?.toLowerCase() === needle);
}

export function isPersonalIbanApplicable(currencyName: string | undefined, paymentMethod: string, bank: string): boolean {
  return Boolean(currencyName && PERSONAL_IBAN_CURRENCIES.includes(currencyName) && paymentMethod === bank);
}

export type PersonalIbanParamState<T extends string = string> =
  | { kind: 'absent' }
  | { kind: 'unrecognized' }
  | { kind: 'inapplicable'; reason: 'method' | 'currency' }
  | { kind: 'ready'; provider: T };

export function personalIbanParamState<T extends string>(
  value: string | undefined,
  providers: Record<string, T>,
  currencyName: string | undefined,
  paymentMethod: string,
  bank: string,
): PersonalIbanParamState<T> {
  if (!value) return { kind: 'absent' };
  const provider = parseEnumValue(value, providers);
  if (!provider) return { kind: 'unrecognized' };
  if (paymentMethod !== bank) return { kind: 'inapplicable', reason: 'method' };
  if (!currencyName || !PERSONAL_IBAN_CURRENCIES.includes(currencyName)) {
    return { kind: 'inapplicable', reason: 'currency' };
  }
  return { kind: 'ready', provider };
}

function adaptPath(path: string, segment: string): string {
  return path + (path.endsWith('/') ? segment : `/${segment}`);
}

/** Appends the main-app close suffix (`/buy`, `/sell`, `/swap`) and optional query. */
export function appendCompletionPath(
  parsed: URL,
  kind: 'buy' | 'sell' | 'swap',
  extra?: Record<string, string>,
): URL {
  if (extra) {
    Object.entries(extra).forEach(([key, val]) => parsed.searchParams.set(key, val));
  }
  if (parsed.origin === 'null') {
    const pathname = parsed.pathname ? parsed.pathname : '//';
    const next = new URL(adaptPath(`${parsed.protocol}${pathname}`, kind));
    parsed.searchParams.forEach((val, key) => next.searchParams.set(key, val));
    return next;
  }
  parsed.pathname = adaptPath(parsed.pathname, kind);
  return parsed;
}

/** Partner `redirect-uri` after a completed buy/sell/swap, or undefined when unsafe/absent. */
export function completionRedirectUrl(
  baseUri: string | undefined,
  kind: 'buy' | 'sell' | 'swap',
  extra?: Record<string, string>,
): string | undefined {
  if (!baseUri || !isSafeRedirectUri(baseUri)) return undefined;
  return appendCompletionPath(new URL(baseUri), kind, extra).toString();
}
