import type { BankTxSearchResult } from 'src/hooks/compliance.hook';

// Used to carry a bank-tx row from the compliance search list into the
// details screen. sessionStorage is needed because app-handling.context
// calls history.replaceState(undefined, ...) on mount, which wipes router
// state, and there is no backend endpoint to refetch a single bank-tx.
export const BANK_TX_CACHE_PREFIX = 'dfx.bankTx.';

export function cacheBankTx(bankTx: BankTxSearchResult): void {
  sessionStorage.setItem(`${BANK_TX_CACHE_PREFIX}${bankTx.id}`, JSON.stringify(bankTx));
}

export function readCachedBankTx(id: string): BankTxSearchResult | undefined {
  try {
    const cached = sessionStorage.getItem(`${BANK_TX_CACHE_PREFIX}${id}`);
    return cached ? (JSON.parse(cached) as BankTxSearchResult) : undefined;
  } catch {
    return undefined;
  }
}
