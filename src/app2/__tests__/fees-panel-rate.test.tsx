// The swap exchange-rate line in the fee breakdown showed the reciprocal of the correct rate:
// `exchangeRate` is source-per-target (payAsset per 1 receiveAsset — see FeesPanel.tsx's doc
// comment on rateStr), but the row rendered it directly under a "{receiveAsset} / {payAsset}"
// label, which needs the *inverted* value to read correctly — exactly the rate the collapsed
// summary line two rows above already computes independently from the quote amounts. Buy and
// sell were already correct; this only pins swap and confirms buy/sell didn't regress.

import { render } from '@testing-library/react';
import type { Buy, Sell, Swap } from '@dfx.swiss/react';
import { FeesPanel } from '../screens/trade/FeesPanel';
import { LanguageProvider } from '../i18n';
import { formatAmount, formatFiat } from '../screens/trade/amount';

const zeroFees = { rate: 0, dfx: 0, bank: 0, network: 0, total: 0 };

function renderPanel(mode: 'buy' | 'sell' | 'swap', quote: Buy | Sell | Swap) {
  return render(
    <LanguageProvider>
      <FeesPanel
        mode={mode}
        quote={quote}
        isFresh
        payAssetCode={mode === 'buy' ? '' : 'ETH'}
        receiveAssetCode={mode === 'sell' ? '' : mode === 'buy' ? 'BTC' : 'BTC'}
        currencyCode="EUR"
        language="en"
      />
    </LanguageProvider>,
  );
}

describe('FeesPanel exchange-rate row', () => {
  it('shows the swap rate as receive-per-pay, inverted from the source-per-target exchangeRate', () => {
    // exchangeRate = source(ETH)/target(BTC) = 2/0.1 = 20 (this many ETH per 1 BTC). The rate row
    // labels "BTC / ETH" (receive/pay), so it must print 1/20 = 0.05, not 20.
    const swap = {
      amount: 2,
      estimatedAmount: 0.1,
      exchangeRate: 20,
      isValid: true,
      fees: zeroFees,
    } as unknown as Swap;

    const { getByText, queryByText } = renderPanel('swap', swap);

    const expectedRate = `${formatAmount(1 / 20, 6, 'en')} BTC / ETH`;
    const buggyRate = `${formatAmount(20, 6, 'en')} BTC / ETH`;

    expect(getByText(expectedRate)).toBeInTheDocument();
    expect(queryByText(buggyRate)).not.toBeInTheDocument();
  });

  it('keeps the buy rate as fiat-per-receive-asset (unaffected by the swap fix)', () => {
    const buy = {
      amount: 200,
      estimatedAmount: 100,
      exchangeRate: 2,
      isValid: true,
      fees: zeroFees,
    } as unknown as Buy;

    const { getByText } = renderPanel('buy', buy);

    expect(getByText(`${formatFiat(2, 'EUR', 'en')} / BTC`)).toBeInTheDocument();
  });

  it('keeps the sell rate as fiat-per-pay-asset (unaffected by the swap fix)', () => {
    const sell = {
      amount: 1,
      estimatedAmount: 4,
      exchangeRate: 0.25,
      isValid: true,
      fees: zeroFees,
      feesTarget: zeroFees,
    } as unknown as Sell;

    const { getByText } = renderPanel('sell', sell);

    // Sell already inverts (1 / exchangeRate) before this change — 1 / 0.25 = 4.
    expect(getByText(`${formatFiat(4, 'EUR', 'en')} / ETH`)).toBeInTheDocument();
  });
});

// Round-5 finding (Danswar's "one breach of the zero-client-money-math claim"): the collapsed
// summary line and the expanded detail row showed two *different* numbers for the same pair —
// the summary hand-divided estimatedAmount/amount (fee-inclusive) while the detail row showed the
// fee-exclusive exchangeRate — with neither line saying so. Fixtures below give `rate` (the
// fee-inclusive field the fix now uses) a value distinct from `exchangeRate`, so a regression
// back to reusing one field for both — or dropping the "incl./excl. fees" labels — fails loudly.
describe('FeesPanel summary vs. detail rate — fee-inclusive vs. market rate', () => {
  it('buy: summary shows the fee-inclusive rate, detail shows the market rate, both labeled', () => {
    const buy = {
      amount: 200,
      estimatedAmount: 100,
      exchangeRate: 2, // pre-fee market price: €2.00 / BTC
      rate: 2.1, // post-fee "final rate": €2.10 / BTC — genuinely different from exchangeRate
      isValid: true,
      fees: zeroFees,
    } as unknown as Buy;

    const { getByText } = renderPanel('buy', buy);

    expect(getByText(`1 BTC ≈ ${formatFiat(2.1, 'EUR', 'en')} (incl. fees)`)).toBeInTheDocument();
    expect(getByText('Market rate (excl. fees)')).toBeInTheDocument();
    expect(getByText(`${formatFiat(2, 'EUR', 'en')} / BTC`)).toBeInTheDocument();
  });

  it('sell: summary shows the fee-inclusive rate, detail shows the market rate, both labeled', () => {
    const sell = {
      amount: 1,
      estimatedAmount: 4,
      exchangeRate: 0.25, // pre-fee: 1/0.25 = €4.00 / ETH
      rate: 0.2, // post-fee "final rate": 1/0.2 = €5.00 / ETH — genuinely different
      isValid: true,
      fees: zeroFees,
      feesTarget: zeroFees,
    } as unknown as Sell;

    const { getByText } = renderPanel('sell', sell);

    expect(getByText(`1 ETH ≈ ${formatFiat(5, 'EUR', 'en')} (incl. fees)`)).toBeInTheDocument();
    expect(getByText('Market rate (excl. fees)')).toBeInTheDocument();
    expect(getByText(`${formatFiat(4, 'EUR', 'en')} / ETH`)).toBeInTheDocument();
  });

  it('swap: summary shows the fee-inclusive rate, detail shows the market rate, both labeled', () => {
    const swap = {
      amount: 2,
      estimatedAmount: 0.1,
      exchangeRate: 20, // pre-fee: 1/20 = 0.05 BTC / ETH
      rate: 22, // post-fee "final rate": 1/22 ≈ 0.045455 BTC / ETH — genuinely different
      isValid: true,
      fees: zeroFees,
    } as unknown as Swap;

    const { getByText } = renderPanel('swap', swap);

    expect(getByText(`1 ETH ≈ ${formatAmount(1 / 22, 6, 'en')} BTC (incl. fees)`)).toBeInTheDocument();
    expect(getByText('Market rate (excl. fees)')).toBeInTheDocument();
    expect(getByText(`${formatAmount(1 / 20, 6, 'en')} BTC / ETH`)).toBeInTheDocument();
  });
});
