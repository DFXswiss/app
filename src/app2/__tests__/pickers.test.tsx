jest.mock('@dfx.swiss/react', () => ({
  FiatPaymentMethod: { BANK: 'Bank', INSTANT: 'Instant', CARD: 'Card' },
  Blockchain: {
    BITCOIN: 'Bitcoin',
    LIGHTNING: 'Lightning',
    SPARK: 'Spark',
    ARKADE: 'Arkade',
    FIRO: 'Firo',
    MONERO: 'Monero',
    ZANO: 'Zano',
    INTERNET_COMPUTER: 'InternetComputer',
    ETHEREUM: 'Ethereum',
    SEPOLIA: 'Sepolia',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
    OPTIMISM: 'Optimism',
    ARBITRUM: 'Arbitrum',
    POLYGON: 'Polygon',
    BASE: 'Base',
    GNOSIS: 'Gnosis',
    HAQQ: 'Haqq',
    LIQUID: 'Liquid',
    ARWEAVE: 'Arweave',
    CARDANO: 'Cardano',
    RAILGUN: 'Railgun',
    SOLANA: 'Solana',
    TRON: 'Tron',
    CITREA: 'Citrea',
    CITREA_TESTNET: 'CitreaTestnet',
    DEFICHAIN: 'DeFiChain',
  },
}));

import { fireEvent, render, screen } from '@testing-library/react';
import { FiatPaymentMethod, type Fiat } from '@dfx.swiss/react';
import { FiatPicker } from '../components/pickers/FiatPicker';
import { PaymentMethodPicker, paymentMethodsFor } from '../components/pickers/PaymentMethodPicker';
import { LanguageProvider } from '../i18n';

const eur = { id: 1, name: 'EUR', sellable: true, buyable: true } as Fiat;
const chf = { id: 2, name: 'CHF', sellable: true, buyable: true } as Fiat;

describe('FiatPicker and PaymentMethodPicker', () => {
  it('selects a currency on click and via the keyboard activator', () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    render(
      <LanguageProvider>
        <FiatPicker
          open
          onClose={onClose}
          titleId="cur-title"
          currencies={[eur, chf]}
          value={eur}
          onSelect={onSelect}
        />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'CHF' }));
    expect(onSelect).toHaveBeenCalledWith(chf);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole('button', { name: 'EUR' }), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(eur);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('shows currency loading, retryable failure, and an empty API result', () => {
    const onRetry = jest.fn();
    const renderPicker = (props: Partial<React.ComponentProps<typeof FiatPicker>>) =>
      render(
        <LanguageProvider>
          <FiatPicker
            open
            onClose={jest.fn()}
            titleId="cur-title"
            currencies={[]}
            onSelect={jest.fn()}
            {...props}
          />
        </LanguageProvider>,
      );

    const loading = renderPicker({ loading: true });
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    loading.unmount();

    const failed = renderPicker({ loadError: true, onRetry });
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load — check your connection.");
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    failed.unmount();

    renderPicker({ currencies: [], emptyMessage: 'No currencies are available right now.' });
    expect(screen.getByRole('status')).toHaveTextContent('No currencies are available right now.');
  });

  it('does not render a retry control when a load error has no retry callback', () => {
    render(
      <LanguageProvider>
        <FiatPicker
          open
          onClose={jest.fn()}
          titleId="cur-title"
          currencies={[]}
          onSelect={jest.fn()}
          loadError
        />
      </LanguageProvider>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load — check your connection.");
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('keeps default empty trade pickers visually empty without a currency-specific message', () => {
    render(
      <LanguageProvider>
        <FiatPicker
          open
          onClose={jest.fn()}
          titleId="cur-title"
          currencies={[]}
          onSelect={jest.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps buy payment bank-only pending product approval', () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const options = paymentMethodsFor(
      { ...eur, instantSellable: true } as Fiat,
      { instantBuyable: true } as never,
    );
    render(
      <LanguageProvider>
        <PaymentMethodPicker
          open
          onClose={onClose}
          titleId="pay-title"
          options={options}
          value={FiatPaymentMethod.BANK}
          onSelect={onSelect}
        />
      </LanguageProvider>,
    );

    expect(screen.queryByText(/instant|sofort|istantaneo|instantané/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /bank|überweisung|bonifico|virement/i }));
    expect(onSelect).toHaveBeenCalledWith(FiatPaymentMethod.BANK);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole('button', { name: /bank|überweisung|bonifico|virement/i }), { key: ' ' });
    expect(onSelect).toHaveBeenCalledWith(FiatPaymentMethod.BANK);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
