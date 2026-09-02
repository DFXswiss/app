import { AbortError } from './abort-error';
import { TranslatedError } from './translated-error';

export interface WalletTxErrorResult {
  /** The user rejected the request in their wallet — stay on the form and show nothing. */
  cancelled: boolean;
  /**
   * A curated, translatable wallet-error key (thrown as a TranslatedError, e.g. a request that is
   * still pending in the wallet). Undefined for unknown errors, where the caller keeps its generic
   * "transaction failed" hint instead of surfacing a raw technical message.
   */
  messageKey?: string;
}

/**
 * Classifies an error thrown while sending a sell or swap transaction from the connected wallet, so
 * both screens react the same way: a user cancellation stays silent, a curated TranslatedError is
 * surfaced to the user (it already explains what to do), and anything else falls back to the generic
 * hint that points to the manual deposit address.
 */
export function resolveWalletTxError(error: unknown): WalletTxErrorResult {
  if ((error as { code?: number } | null)?.code === 4001 || error instanceof AbortError) {
    return { cancelled: true };
  }

  if (error instanceof TranslatedError && error.message) {
    return { cancelled: false, messageKey: error.message };
  }

  return { cancelled: false };
}
