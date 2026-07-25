// DFX App 2.0 — the collapsible `.fees`/`.fbody` rate + fee breakdown on the home screen.
//
// Ported from the static app's `applyQuote()` fee rows (public/app2/index.html) — DFX fee
// (rate %), bank fee (or "Free" for a sell payout), network fee (or "Included"), total, the
// exchange rate line, and the final "you receive" row. Reads straight off the held quote's
// `fees`/`feesTarget` (buy: source-fiat fees; sell: `feesTarget`, fiat-denominated; swap:
// source-asset-denominated fees) — never re-derives/re-sums a total client-side.

import type { Buy, Fees, Sell, Swap } from '@dfx.swiss/react';
import { formatAmount, formatFiat } from './amount';
import type { Mode } from './types';
import { useT, type Language } from '../../i18n';

const SHIELD_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M12 2 4 5v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V5l-8-3Z" stroke="currentColor" strokeWidth={1.6} />
    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CHEVRON = (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
    <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface FeesPanelProps {
  mode: Mode;
  quote: Buy | Sell | Swap | null;
  isFresh: boolean;
  payAssetCode: string;
  receiveAssetCode: string;
  currencyCode: string;
  language: Language;
}

export function FeesPanel({
  mode,
  quote,
  isFresh,
  payAssetCode,
  receiveAssetCode,
  currencyCode,
  language,
}: FeesPanelProps) {
  const { t } = useT();

  if (!quote || !isFresh || quote.isValid === false) {
    return (
      <details className="fees">
        <summary>
          <span className="l">
            {SHIELD_ICON}
            <span>—</span>
          </span>
          <span className="r">
            <span className="chip-good">—</span>
            <span className="chev">{CHEVRON}</span>
          </span>
        </summary>
        <div className="fbody" />
      </details>
    );
  }

  const isSell = mode === 'sell';
  const isSwap = mode === 'swap';
  // all three response shapes carry both `fees` (source-unit) and `feesTarget` (target-unit) —
  // a sell payout is fiat, so it uses `feesTarget`; buy/swap fees stay in their source unit
  const fees: Fees = isSell ? quote.feesTarget : quote.fees;
  const fv = (n: number) =>
    isSwap ? `${formatAmount(n, 6, language)} ${payAssetCode}` : formatFiat(n, currencyCode, language);

  const payStr =
    isSell || isSwap
      ? `${formatAmount(quote.amount, 8, language)} ${payAssetCode}`
      : formatFiat(quote.amount, currencyCode, language);
  const recvPrecision = isSell ? 2 : isSwap ? 6 : 8;
  const recvCode = mode === 'sell' ? currencyCode : receiveAssetCode;
  const recvStr = isSell
    ? formatFiat(quote.estimatedAmount, currencyCode, language)
    : `${formatAmount(quote.estimatedAmount, recvPrecision, language)} ${recvCode}`;

  // `Fees.bank` is non-optional on the SDK type (definitions/fees.d.ts) — the API always sends
  // it, so a `bankFixed + bankVariable` fallback for a missing value can never run.
  const bank = fees.bank;

  // collapsed summary rate — "1 {code} ≈ {value} (incl. fees)" (orig 3728-3730 for the base
  // format). Round-5 finding: this used to hand-divide estimatedAmount/amount for sell/swap
  // (fee-inclusive, since both are actual settled amounts) while buy used `exchangeRate` directly
  // (fee-*exclusive* market price) — two different bases for the same kind of line, and neither
  // labeled as such. `quote.rate` (api transaction-helper.ts getTargetEstimation:
  // sourceAmount/targetAmount post-fees, DTO-documented as "Final rate (incl. fees)") is the same
  // source/target convention as `exchangeRate` below, just fee-inclusive — using it uniformly
  // here, with the "incl. fees" qualifier spelled out, is what makes this line and the detail row
  // beneath it two clearly-different, individually-correct numbers instead of an unlabeled
  // mismatch. Direction per mode mirrors rateStr's `exchangeRate` handling below (same
  // source/target math, see that comment): buy needs no inversion, sell/swap do.
  const summaryRate = isSwap
    ? `1 ${payAssetCode} ≈ ${formatAmount(quote.rate ? 1 / quote.rate : 0, 6, language)} ${receiveAssetCode} (${t('rateInclFees')})`
    : mode === 'buy'
      ? `1 ${receiveAssetCode} ≈ ${formatFiat(quote.rate, currencyCode, language)} (${t('rateInclFees')})`
      : `1 ${payAssetCode} ≈ ${formatFiat(quote.rate ? 1 / quote.rate : 0, currencyCode, language)} (${t('rateInclFees')})`;

  // expanded breakdown rate row — "{value} / {code}" (orig 3740). `exchangeRate` is source-per-
  // target (api/.../transaction-helper.ts getTargetEstimation: exchangeRate = price.price, and
  // price.convert(x) = x/price divides a *source* amount by it to get the *target* amount — so
  // for a swap, source = payAsset, target = receiveAsset, and exchangeRate is "payAsset per 1
  // receiveAsset"). Inverting it here — matching the summaryRate line above, which is always
  // receive-per-pay — is what makes "{value} {receiveAssetCode} / {payAssetCode}" read correctly
  // as "this many receiveAsset per 1 payAsset"; rendering `exchangeRate` directly under that same
  // label showed the reciprocal rate. This is the pre-fee market price (see fRateL's "excl. fees"
  // label) — deliberately different from summaryRate above, which is fee-inclusive.
  const rateStr = isSwap
    ? `${formatAmount(quote.exchangeRate ? 1 / quote.exchangeRate : 0, 6, language)} ${receiveAssetCode} / ${payAssetCode}`
    : mode === 'buy'
      ? `${formatFiat(quote.exchangeRate, currencyCode, language)} / ${receiveAssetCode}`
      : `${formatFiat(quote.exchangeRate ? 1 / quote.exchangeRate : 0, currencyCode, language)} / ${payAssetCode}`;

  return (
    <details className="fees">
      <summary>
        <span className="l">
          {SHIELD_ICON}
          <span>{summaryRate}</span>
        </span>
        <span className="r">
          <span className="chip-good">{fv(fees.total ?? 0)}</span>
          <span className="chev">{CHEVRON}</span>
        </span>
      </summary>
      <div className="fbody">
        <FeeRow label={t('fPay')} value={payStr} />
        <FeeRow
          label={`${t('fDfx')}${fees.rate ? ` · ${(fees.rate * 100).toFixed(2)}%` : ''}`}
          value={`−${fv(fees.dfx ?? 0)}`}
        />
        {!isSwap &&
          (bank > 0 ? (
            <FeeRow label={t('bankFee')} value={`−${fv(bank)}`} />
          ) : (
            isSell && <FeeRow label={t('bankFee')} value={t('free')} cls="pos" />
          ))}
        {fees.network > 0 ? (
          <FeeRow label={t('fNet')} value={`−${fv(fees.network)}`} />
        ) : (
          <FeeRow label={t('fNet')} value={t('included')} cls="pos" />
        )}
        <FeeRow label={t('totalFee')} value={`−${fv(fees.total ?? 0)}`} cls="sub" />
        <FeeRow label={t('fRateL')} value={rateStr} />
        <FeeRow label={t('fRecv')} value={recvStr} cls="total" />
      </div>
    </details>
  );
}

function FeeRow({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className={`li${cls ? ` ${cls}` : ''}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
