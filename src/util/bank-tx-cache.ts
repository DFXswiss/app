import type { BankTxSearchResult } from 'src/hooks/compliance.hook';
import * as safeStorage from './safe-storage';

// Used to carry a bank-tx row from the compliance search list into the
// details screen. sessionStorage is needed because app-handling.context
// calls history.replaceState(undefined, ...) on mount, which wipes router
// state, and there is no backend endpoint to refetch a single bank-tx.
export const BANK_TX_CACHE_PREFIX = 'dfx.bankTx.';

export function cacheBankTx(bankTx: BankTxSearchResult): void {
  try {
    safeStorage.storageSetJson('sessionStorage', `${BANK_TX_CACHE_PREFIX}${bankTx.id}`, bankTx);
  } catch {
    // no-op
  }
}

export function readCachedBankTx(id: string): BankTxSearchResult | undefined {
  try {
    return safeStorage.storageGetJson<BankTxSearchResult>('sessionStorage', `${BANK_TX_CACHE_PREFIX}${id}`);
  } catch {
    return undefined;
  }
}
