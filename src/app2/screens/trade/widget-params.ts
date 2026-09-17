// Partner widget-param parsers. Each function is the App 2.0 counterpart of a
// main-app query reader (app-handling.context / buy.screen / sell.screen).
// Unknown values fail closed to "not set" so callers keep their existing default.

import { isSafeRedirectUri } from '../../utils/url';

/** Currencies Bank Frick personal IBANs are issued for — same keys as
 * `FRICK_COLLECTION_IBANS` in src/util/personal-iban.ts. */
export const PERSONAL_IBAN_CURRENCIES: readonly string[] = ['EUR', 'CHF'];

export function isTrueFlag(value: string | undefined): boolean {
  return value === 'true';
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

export type PersonalIbanParamState =
  | { kind: 'absent' }
  | { kind: 'unrecognized' }
  | { kind: 'inapplicable'; reason: 'method' | 'currency' }
  | { kind: 'ready'; provider: string };

export function personalIbanParamState(
  value: string | undefined,
  providers: Record<string, string>,
  currencyName: string | undefined,
  paymentMethod: string,
  bank: string,
): PersonalIbanParamState {
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
