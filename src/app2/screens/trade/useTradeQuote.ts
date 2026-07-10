// DFX App 2.0 — buy/sell/swap quote hooks.
//
// The SDK unifies "get a quote" and "get payment details" into one authenticated call —
// `useBuy()/useSell()/useSwap().receiveFor(...)` (PUT .../paymentInfos under the hood; see
// node_modules/@dfx.swiss/react/dist/hooks/{buy,sell,swap}.hook.js). There is no separate
// unauthenticated quote endpoint exposed here, unlike the static app's public `/buy/quote`.
// That's a real behaviour change from the static reference, not an oversight: without a
// session, we simply don't fetch — the screen shows a "connect to see the live rate" state
// and the CTA opens the connect sheet instead. Once logged in, the single `receiveFor`
// response already carries both the quote (estimatedAmount/fees/rate) *and* the payment
// details (IBAN/remittanceInfo/paymentRequest for buy, depositAddress for sell/swap) — so the
// payment sheet never needs a second fetch, it just reads the held quote object.

import { FiatPaymentMethod, useBuy, useSell, useSwap } from '@dfx.swiss/react';
import type { Asset, Buy, BuyPaymentInfo, Fiat, Sell, SellPaymentInfo, Swap, SwapPaymentInfo } from '@dfx.swiss/react';
import { useCallback } from 'react';
import { QuoteEngineState, useQuoteEngine } from './useQuoteEngine';

export interface BuyQuoteParams {
  enabled: boolean;
  asset?: Asset;
  currency?: Fiat;
  amount: number | null;
  paymentMethod: FiatPaymentMethod;
  externalTransactionId?: string;
  /** See useQuoteEngine's `paused` — suspends the 30s auto-refresh (finding #2). */
  paused?: boolean;
}

export function useBuyQuote(params: BuyQuoteParams): QuoteEngineState<Buy> {
  const { receiveFor } = useBuy();
  const { asset, currency, amount, paymentMethod, externalTransactionId } = params;
  const ready = !!asset && !!currency && !!amount;
  const key = asset && currency && amount ? `${asset.id}:${currency.id}:${amount}:${paymentMethod}` : '';

  const fetcher = useCallback((): Promise<Buy> => {
    if (!asset || !currency || !amount) return Promise.reject(new Error('buy quote: missing input'));
    const info: BuyPaymentInfo = { currency, asset, amount, paymentMethod };
    if (externalTransactionId) info.externalTransactionId = externalTransactionId;
    return receiveFor(info);
  }, [receiveFor, asset, currency, amount, paymentMethod, externalTransactionId]);

  return useQuoteEngine(params.enabled && ready, key, fetcher, params.paused);
}

export interface SellQuoteParams {
  enabled: boolean;
  asset?: Asset;
  currency?: Fiat;
  amount: number | null;
  iban?: string;
  externalTransactionId?: string;
  /** See useQuoteEngine's `paused` — suspends the 30s auto-refresh (finding #2). */
  paused?: boolean;
}

export function useSellQuote(params: SellQuoteParams): QuoteEngineState<Sell> {
  const { receiveFor } = useSell();
  const { asset, currency, amount, iban, externalTransactionId } = params;
  const ready = !!asset && !!currency && !!amount;
  const key = asset && currency && amount ? `${asset.id}:${currency.id}:${amount}:${iban ?? ''}` : '';

  const fetcher = useCallback((): Promise<Sell> => {
    if (!asset || !currency || !amount) return Promise.reject(new Error('sell quote: missing input'));
    const info: SellPaymentInfo = { asset, currency, amount };
    if (iban) info.iban = iban;
    if (externalTransactionId) info.externalTransactionId = externalTransactionId;
    return receiveFor(info);
  }, [receiveFor, asset, currency, amount, iban, externalTransactionId]);

  return useQuoteEngine(params.enabled && ready, key, fetcher, params.paused);
}

export interface SwapQuoteParams {
  enabled: boolean;
  sourceAsset?: Asset;
  targetAsset?: Asset;
  amount: number | null;
  externalTransactionId?: string;
  /** See useQuoteEngine's `paused` — suspends the 30s auto-refresh (finding #2). */
  paused?: boolean;
}

export function useSwapQuote(params: SwapQuoteParams): QuoteEngineState<Swap> {
  const { receiveFor } = useSwap();
  const { sourceAsset, targetAsset, amount, externalTransactionId } = params;
  const ready = !!sourceAsset && !!targetAsset && !!amount && sourceAsset.id !== targetAsset.id;
  const key = sourceAsset && targetAsset && amount && ready ? `${sourceAsset.id}:${targetAsset.id}:${amount}` : '';

  const fetcher = useCallback((): Promise<Swap> => {
    if (!sourceAsset || !targetAsset || !amount) return Promise.reject(new Error('swap quote: missing input'));
    const info: SwapPaymentInfo = { sourceAsset, targetAsset, amount };
    if (externalTransactionId) info.externalTransactionId = externalTransactionId;
    return receiveFor(info);
  }, [receiveFor, sourceAsset, targetAsset, amount, externalTransactionId]);

  return useQuoteEngine(params.enabled && ready, key, fetcher, params.paused);
}
