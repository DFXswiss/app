import type { Fiat } from '@dfx.swiss/react';

/** API flags describe DFX's side of the fiat leg: DFX sells fiat on a user buy and buys fiat
 * on a user sell. Keep this convention in one tested place instead of re-inverting it in UI. */
export function currenciesForBuy(currencies: readonly Fiat[] | undefined): Fiat[] {
  return currencies?.filter((currency) => currency.sellable) ?? [];
}

export function currenciesForSell(currencies: readonly Fiat[] | undefined): Fiat[] {
  return currencies?.filter((currency) => currency.buyable) ?? [];
}

export function hasSellQuoteInputs(
  assetId: number | undefined,
  currencyId: number | undefined,
  amount: number | null,
  iban: string | undefined,
): boolean {
  return Boolean(assetId && currencyId && amount && iban?.trim());
}
