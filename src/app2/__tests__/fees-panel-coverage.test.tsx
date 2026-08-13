import { render, screen } from '@testing-library/react';
import type { Buy, Sell, Swap } from '@dfx.swiss/react';
import { FeesPanel } from '../screens/trade/FeesPanel';
import { LanguageProvider } from '../i18n';
import { formatAmount, formatFiat } from '../screens/trade/amount';

function renderPanel(mode: 'buy' | 'sell' | 'swap', quote: Buy | Sell | Swap | null, isFresh = true) {
  return render(
    <LanguageProvider>
      <FeesPanel
        mode={mode}
        quote={quote}
        isFresh={isFresh}
        payAssetCode={mode === 'buy' ? '' : 'ETH'}
        receiveAssetCode={mode === 'sell' ? '' : 'BTC'}
        currencyCode="EUR"
        language="en"
      />
    </LanguageProvider>,
  );
}

describe('FeesPanel empty and breakdown branches', () => {
  it('shows dashes when the quote is missing, stale or invalid', () => {
    const { rerender } = renderPanel('buy', null);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);

    rerender(
      <LanguageProvider>
        <FeesPanel
          mode="buy"
          quote={{ isValid: true, amount: 1, estimatedAmount: 1, fees: { total: 0 } } as unknown as Buy}
          isFresh={false}
          payAssetCode=""
          receiveAssetCode="BTC"
          currencyCode="EUR"
          language="en"
        />
      </LanguageProvider>,
    );
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);

    rerender(
      <LanguageProvider>
        <FeesPanel
          mode="buy"
          quote={{ isValid: false, amount: 1, estimatedAmount: 1, fees: { total: 0 } } as unknown as Buy}
          isFresh
          payAssetCode=""
          receiveAssetCode="BTC"
          currencyCode="EUR"
          language="en"
        />
      </LanguageProvider>,
    );
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('prints the DFX rate percent, a bank fee and a network fee on buy', () => {
    const buy = {
      amount: 100,
      estimatedAmount: 0.002,
      exchangeRate: 50000,
      rate: 51000,
      isValid: true,
      fees: { rate: 0.0199, dfx: 1.5, bank: 0.4, network: 0.2, total: 2.1 },
    } as unknown as Buy;

    renderPanel('buy', buy);
    expect(screen.getByText(/DFX fee · 1\.99%/i)).toBeInTheDocument();
    expect(screen.getByText(`−${formatFiat(0.4, 'EUR', 'en')}`)).toBeInTheDocument();
    expect(screen.getByText(`−${formatFiat(0.2, 'EUR', 'en')}`)).toBeInTheDocument();
  });

  it('omits the bank row on buy when the bank fee is zero and marks network as included', () => {
    const buy = {
      amount: 100,
      estimatedAmount: 0.002,
      exchangeRate: 50000,
      rate: 51000,
      isValid: true,
      fees: { rate: 0, dfx: 0, bank: 0, network: 0, total: 0 },
    } as unknown as Buy;

    renderPanel('buy', buy);
    expect(screen.queryByText(/bank fee/i)).not.toBeInTheDocument();
    expect(screen.getByText(/included/i)).toBeInTheDocument();
    expect(screen.queryByText(/DFX fee ·/i)).not.toBeInTheDocument();
  });

  it('shows a free bank fee on sell when bank is zero', () => {
    const sell = {
      amount: 1,
      estimatedAmount: 4,
      exchangeRate: 0.25,
      rate: 0.2,
      isValid: true,
      fees: { rate: 0, dfx: 0, bank: 0, network: 0, total: 0 },
      feesTarget: { rate: 0, dfx: 0.1, bank: 0, network: 0, total: 0.1 },
    } as unknown as Sell;

    renderPanel('sell', sell);
    expect(screen.getByText(/^free$/i)).toBeInTheDocument();
  });

  it('falls back to a zero rate when sell/swap rate fields are missing', () => {
    const swap = {
      amount: 2,
      estimatedAmount: 0.1,
      exchangeRate: 0,
      rate: 0,
      isValid: true,
      fees: { rate: 0, dfx: 0, bank: 1, network: 0.01, total: 0.02 },
    } as unknown as Swap;

    const { getByText } = renderPanel('swap', swap);
    expect(getByText(`1 ETH ≈ ${formatAmount(0, 6, 'en')} BTC (incl. fees)`)).toBeInTheDocument();
    expect(getByText(`${formatAmount(0, 6, 'en')} BTC / ETH`)).toBeInTheDocument();
    expect(getByText(`−${formatAmount(0.01, 6, 'en')} ETH`)).toBeInTheDocument();
  });
});
