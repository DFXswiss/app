// DFX App 2.0 — buy/sell/swap quote hooks.
//
// Two endpoints per mode, and which one runs matters:
//  - `PUT {buy,sell,swap}/quote` is public (no token) and answers the *display* question —
//    rate, estimated amount, fee breakdown, min/max validity. It knows nothing about the
//    account, so it never fails on account state.
//  - `receiveFor(...)` (`PUT .../paymentInfos`, via useBuy/useSell/useSwap) is authenticated
//    and creates the real payment details (IBAN/remittanceInfo/paymentRequest for buy,
//    depositAddress for sell/swap). It legitimately rejects an account that isn't ready yet —
//    e.g. 400 `EmailRequired` for an account with no e-mail.
//
// So the panel quotes publicly and only asks for payment infos once the user actually moves
// to pay (`withPaymentInfo`). Driving the panel off paymentInfos meant every account gate hit
// the rate display instead of the payment sheet: a user without an e-mail on file saw
// "Kurs nicht verfügbar" and no calculation at all, with no way to learn why. The gate belongs
// in the payment sheet, which has UI for it (see errors.ts › mapThrownError kinds) — the same
// split the static preview used (its panel ran on the public `/buy/quote` too) and what
// home.tsx's `isAmountValidityError` comment already describes.
//
// Consequences of the split, deliberately accepted — the panel is a price *indication*, the
// sheet is the binding number:
//  - Account-state gates (KYC/limit/e-mail/recommendation/AML) are `user &&`-guarded server-side
//    (api › transaction-helper.getTxErrors), so the public quote never reports them and the
//    panel can look valid for an order the account cannot place yet. They surface — before any
//    payment detail is shown — in the sheet's gate UI.
//  - Fees are resolved per user server-side (api › transaction-helper: `user ? getUserFee :
//    getDefaultFee`), so the public quote prices against the PERSONAL default: no partner-wallet
//    fee, no individual fee agreement, no account-type tier, no vIBAN bank fee, no network start
//    fee. The public endpoints do take a `wallet` name, but the user API returns
//    `wallet.displayName ?? wallet.name` while the quote resolves by `wallet.name` only — passing
//    it through would silently price as default whenever a partner sets a display name, and could
//    match a *different* partner whose name equals that display name. Not worth an unverifiable
//    correction; the authenticated payment response the sheet renders stays the single source of
//    truth for what the user actually pays.
//  - `maxVolume` is the generic default limit rather than the account's remaining trading limit
//    (api › transaction-helper.getLimits: no user ⇒ `kycLimit = MAX_VALUE`).
//
// All three modes are split the same way, and the consequences above apply to all three. Sell
// expresses it through its payout IBAN rather than a `withPaymentInfo` flag: the display engine
// is called without an IBAN (public quote), the payment engine with one (paymentInfos, which
// carries the deposit address). That also stops sell from creating a route and a transaction
// request per debounced keystroke (api › sell.service.createSellPaymentInfo), which it did as
// soon as a default payout account existed.
//
// The `enabled` gates in home.tsx stay tied to a session even though the quote endpoints are
// public: logged-out home renders the landing hero, not the trade form, so a quote fetched
// there would have nothing to render into.

import { BuyUrl, FiatPaymentMethod, SellUrl, SwapUrl, useApi, useBuy, useSell, useSwap } from '@dfx.swiss/react';
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
  /** Fetch the real payment details (authenticated `PUT /buy/paymentInfos`) instead of the
   * public quote. Set only when the user moves to pay — see the file header. */
  withPaymentInfo?: boolean;
  /** See useQuoteEngine's `paused` — suspends the 30s auto-refresh (finding #2). */
  paused?: boolean;
}

export function useBuyQuote(params: BuyQuoteParams): QuoteEngineState<Buy> {
  const { receiveFor } = useBuy();
  const { call } = useApi();
  const { asset, currency, amount, paymentMethod, externalTransactionId, withPaymentInfo } = params;
  const ready = !!asset && !!currency && !!amount;
  const key =
    asset && currency && amount
      ? `${asset.id}:${currency.id}:${amount}:${paymentMethod}:${withPaymentInfo ? 'info' : 'quote'}`
      : '';

  const fetcher = useCallback((): Promise<Buy> => {
    if (!asset || !currency || !amount) return Promise.reject(new Error('buy quote: missing input'));
    const info: BuyPaymentInfo = { currency, asset, amount, paymentMethod };
    if (withPaymentInfo) {
      // The external transaction id identifies the payment being created — it belongs to the
      // paymentInfos call only, not to a display quote.
      if (externalTransactionId) info.externalTransactionId = externalTransactionId;
      return receiveFor(info);
    }
    // Public quote: same `Buy` shape (rate/estimatedAmount/fees/feesTarget/priceSteps/isValid)
    // minus the payment details, and independent of the account's own state.
    return call<Buy>({ url: BuyUrl.quote, method: 'PUT', data: info, token: false });
  }, [receiveFor, call, asset, currency, amount, paymentMethod, externalTransactionId, withPaymentInfo]);

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
  const { call } = useApi();
  const { asset, currency, amount, iban, externalTransactionId } = params;
  // Match the static app (`updateQuote()` → token-less `PUT /sell/quote {asset,currency,amount}`):
  // the sell rate + full fee breakdown are shown as soon as asset+currency+amount are set, with
  // NO payout IBAN. The IBAN is what selects the endpoint — the caller passes it only on the
  // payment engine (home.tsx › sellPayment), so it also belongs in the `key`: the display and
  // payment requests must never share cache state.
  const ready = !!asset && !!currency && !!amount;
  const key = ready && asset && currency && amount ? `${asset.id}:${currency.id}:${amount}:${iban ?? 'quote'}` : '';

  const fetcher = useCallback((): Promise<Sell> => {
    if (!asset || !currency || !amount) return Promise.reject(new Error('sell quote: missing input'));
    if (iban) {
      // With a payout IBAN, fetch the full payment info (carries the deposit address the payment
      // sheet needs) via the authenticated `PUT /sell/paymentInfos`.
      const info: SellPaymentInfo = { asset, currency, amount, iban };
      if (externalTransactionId) info.externalTransactionId = externalTransactionId;
      return receiveFor(info);
    }
    // No payout account yet: the public quote endpoint returns the same `Sell` shape
    // (estimatedAmount/fees/feesTarget/isValid/minVolume) minus the deposit details.
    const info: SellPaymentInfo = { asset, currency, amount };
    return call<Sell>({ url: SellUrl.quote, method: 'PUT', data: info, token: false });
  }, [receiveFor, call, asset, currency, amount, iban, externalTransactionId]);

  return useQuoteEngine(params.enabled && ready, key, fetcher, params.paused);
}

export interface SwapQuoteParams {
  enabled: boolean;
  sourceAsset?: Asset;
  targetAsset?: Asset;
  amount: number | null;
  externalTransactionId?: string;
  /** See BuyQuoteParams.withPaymentInfo — authenticated `PUT /swap/paymentInfos` (carries the
   * deposit address) instead of the public quote. */
  withPaymentInfo?: boolean;
  /** See useQuoteEngine's `paused` — suspends the 30s auto-refresh (finding #2). */
  paused?: boolean;
}

export function useSwapQuote(params: SwapQuoteParams): QuoteEngineState<Swap> {
  const { receiveFor } = useSwap();
  const { call } = useApi();
  const { sourceAsset, targetAsset, amount, externalTransactionId, withPaymentInfo } = params;
  const ready = !!sourceAsset && !!targetAsset && !!amount && sourceAsset.id !== targetAsset.id;
  const key =
    sourceAsset && targetAsset && amount && ready
      ? `${sourceAsset.id}:${targetAsset.id}:${amount}:${withPaymentInfo ? 'info' : 'quote'}`
      : '';

  const fetcher = useCallback((): Promise<Swap> => {
    if (!sourceAsset || !targetAsset || !amount) return Promise.reject(new Error('swap quote: missing input'));
    const info: SwapPaymentInfo = { sourceAsset, targetAsset, amount };
    if (withPaymentInfo) {
      if (externalTransactionId) info.externalTransactionId = externalTransactionId;
      return receiveFor(info);
    }
    return call<Swap>({ url: SwapUrl.quote, method: 'PUT', data: info, token: false });
  }, [receiveFor, call, sourceAsset, targetAsset, amount, externalTransactionId, withPaymentInfo]);

  return useQuoteEngine(params.enabled && ready, key, fetcher, params.paused);
}
