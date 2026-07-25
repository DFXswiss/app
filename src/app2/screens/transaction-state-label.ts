// Translates a `TransactionState` enum value (@dfx.swiss/core definitions/transaction.d.ts) into
// a readable label — kyc.tsx's `statusLabel()` already guards its own enum the same way,
// transactions.tsx used to render this one verbatim (`tx.state` straight into the DOM, identical
// in all four languages: "LiquidityPending", "PayoutInProgress", "FeeTooHigh", ...).
//
// Kept in its own module (no @dfx.swiss/react/wallet dependency) so it stays trivially testable
// independent of transactions.tsx's much heavier import graph.

import type { TranslationKey } from '../i18n';

/** Falls back to the raw state string for a value the dictionary doesn't have a `txst_*` key for
 * yet, rather than a translation-key-shaped string. */
export function stateLabel(t: (key: TranslationKey) => string, state: string | undefined): string {
  if (!state) return '';
  const key = `txst_${state}` as TranslationKey;
  const label = t(key);
  return label === key ? state : label;
}
