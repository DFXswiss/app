import { TransactionError } from '@dfx.swiss/react';
import type { Fiat } from '@dfx.swiss/react';

/** API flags describe DFX's side of the fiat leg: DFX sells fiat on a user buy and buys fiat
 * on a user sell. Keep this convention in one tested place instead of re-inverting it in UI. */
export function currenciesForBuy(currencies: readonly Fiat[] | undefined): Fiat[] {
  return currencies?.filter((currency) => currency.sellable) ?? [];
}

export function currenciesForSell(currencies: readonly Fiat[] | undefined): Fiat[] {
  return currencies?.filter((currency) => currency.buyable) ?? [];
}

/** A fresh 200 quote whose `isValid:false` is specifically a min/max-volume rejection — the only
 * validity case the static app surfaces inline in the "You receive" meta line (its `!ok &&
 * q.minVolume` branch). Account-state validity errors (KYC/email/limit/…) are left to the payment
 * sheet's gate UI, exactly as in the static app's `startQuoteCountdown()` fall-through. */
export function isAmountValidityError(error: TransactionError | undefined): boolean {
  return error === TransactionError.AMOUNT_TOO_LOW || error === TransactionError.AMOUNT_TOO_HIGH;
}

/** Whether the receive panel must refuse to print a number. Besides the amount errors above,
 * this catches an invalid quote that carries no estimate at all: the API answers a rejected
 * asset/currency/payment-method combination with a 200 whose fields are all zero
 * (api › QuoteErrorUtil.createErrorQuote), and rendering that as "0.00000000 BTC" with a live
 * refresh countdown would read as a real rate for an order that cannot be placed. An invalid
 * quote that *does* carry an estimate (e.g. sell over the account's limit) keeps showing that
 * number — it is a real conversion — but with the reason in the meta line instead of a
 * refresh countdown (see the receive panel in home.tsx). */
export function hasNoDisplayableEstimate(quote: {
  isValid?: boolean;
  error?: TransactionError;
  estimatedAmount?: number;
}): boolean {
  if (quote.isValid !== false) return false;
  return isAmountValidityError(quote.error) || !quote.estimatedAmount;
}
