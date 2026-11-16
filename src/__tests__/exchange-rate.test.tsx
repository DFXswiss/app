import { render, screen } from '@testing-library/react';
import { ExchangeRate } from '../components/exchange-rate';

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { BITCOIN: 'Bitcoin', ETHEREUM: 'Ethereum' },
  TransactionType: { BUY: 'Buy', SELL: 'Sell', SWAP: 'Swap' },
  Utils: { formatAmount: String, formatAmountCrypto: (value: number) => String(Number(value.toPrecision(5))) },
  useFiat: () => ({ toSymbol: () => ' EUR' }),
}));
jest.mock('@dfx.swiss/react-components', () => ({
  IconColor: { GRAY: 'gray' },
  StyledCollapsible: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <div>{title}</div>
      {children}
    </div>
  ),
  StyledInfoText: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  StyledVerticalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_namespace: string, key: string, values?: Record<string, unknown>) =>
      key.replace(/{{(\w+)}}/g, (_match: string, name: string) => String(values?.[name])),
  }),
}));

describe('ExchangeRate price steps', () => {
  it.each([
    ['Sell', 0.017966, 'DSC to USD at 55.661 USD/DSC on Denario'],
    ['Buy', 0.017966, 'DSC to USD at 0.017966 DSC/USD on Denario'],
    ['Swap', 0.017966, 'DSC to USD at 0.017966 DSC/USD on Denario'],
    ['Sell', 0, 'DSC to USD at 0 DSC/USD on Denario'],
    ['Sell', Infinity, 'DSC to USD at Infinity DSC/USD on Denario'],
    ['Sell', Number.MIN_VALUE, `DSC to USD at ${Number.MIN_VALUE} DSC/USD on Denario`],
  ])('renders %s step %s', (type, price, expected) => {
    render(
      <ExchangeRate
        type={type as never}
        exchangeRate={50}
        rate={48}
        amountIn={1}
        amountOut={48}
        from={{ name: 'EUR' } as never}
        to={{ name: 'DSC', blockchain: 'Ethereum' } as never}
        feeCurrency={{ name: 'EUR' } as never}
        fees={{ rate: 0, total: 0, dfx: 0, network: 0 } as never}
        steps={[{ source: 'Denario', from: 'DSC', to: 'USD', price, timestamp: new Date() }]}
      />,
    );
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});

describe('ExchangeRate fees and explanations', () => {
  const defaults = {
    type: 'Buy' as never,
    exchangeRate: 1.234567,
    rate: 2.345678,
    amountIn: 10,
    amountOut: 8,
    from: { name: 'EUR' } as never,
    to: { name: 'USD' } as never,
    feeCurrency: { name: 'EUR' } as never,
    fees: { rate: 0.02, total: 5, dfx: 2, network: 1, bank: 3 } as never,
    steps: [],
  };

  it('displays fiat formatting, minimum, optional fees and the substituted buy explanation', () => {
    render(
      <ExchangeRate
        {...defaults}
        fees={
          {
            rate: 0.02,
            total: 5,
            dfx: 2,
            network: 1,
            bank: 3,
            min: 0.5,
            bankFixed: 4,
            bankVariable: 6,
            networkStart: 7,
            platform: 8,
          } as never
        }
      />,
    );
    expect(screen.getByText('2.345678 EUR/USD')).toBeInTheDocument();
    expect(screen.getByText('1.234567 EUR/USD')).toBeInTheDocument();
    expect(screen.getByText('2 EUR (2.00%, min. 0.5 EUR)')).toBeInTheDocument();
    expect(screen.getByText('4 EUR')).toBeInTheDocument();
    expect(screen.getByText('6 EUR')).toBeInTheDocument();
    expect(screen.getByText('7 EUR')).toBeInTheDocument();
    expect(screen.getByText('8 EUR')).toBeInTheDocument();
    expect(screen.queryByText('Bank fee', { exact: true })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'The output amount is computed as the input amount minus the DFX fee, bank fee and the network fee over the base rate. That is, 8 USD = (10 EUR - 2 EUR - 3 EUR - 1 EUR) ÷ 1.234567 EUR/USD.',
      ),
    ).toBeInTheDocument();
  });

  it('displays fiat fees and the substituted sell explanation', () => {
    render(<ExchangeRate {...defaults} type={'Sell' as never} to={{ name: 'BTC', blockchain: 'Bitcoin' } as never} />);
    expect(screen.getByText('2.345678 EUR/BTC')).toBeInTheDocument();
    expect(screen.getByText('1.234567 EUR/BTC')).toBeInTheDocument();
    expect(screen.getByText('2 EUR (2.00%)')).toBeInTheDocument();
    expect(screen.getByText('Bank fee', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('3 EUR')).toBeInTheDocument();
    expect(screen.queryByText('Network start fee')).not.toBeInTheDocument();
    expect(screen.queryByText('Platform fee')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'The output amount is computed as the input amount times the base rate minus the DFX fee, bank fee and the network fee. That is, 8 EUR = 10 BTC × 1.234567 EUR/BTC - 2 EUR - 3 EUR - 1 EUR.',
      ),
    ).toBeInTheDocument();
  });

  it('displays asset formatting and asset fees without a bank fee for a swap', () => {
    render(
      <ExchangeRate
        {...defaults}
        type={'Swap' as never}
        from={{ name: 'BTC', blockchain: 'Bitcoin' } as never}
        to={{ name: 'ETH', blockchain: 'Ethereum' } as never}
        feeCurrency={{ name: 'BTC', blockchain: 'Bitcoin' } as never}
      />,
    );
    expect(screen.getByText('2.3457 BTC/ETH')).toBeInTheDocument();
    expect(screen.getByText('1.2346 BTC/ETH')).toBeInTheDocument();
    expect(screen.getByText('2 BTC (2.00%)')).toBeInTheDocument();
    expect(screen.queryByText('Bank fee', { exact: true })).not.toBeInTheDocument();
  });

  it.each(['Buy', 'Sell', 'Swap'])('handles bank fee combinations for %s', (type) => {
    const { rerender } = render(
      <ExchangeRate
        {...defaults}
        type={type as never}
        fees={{ rate: 0, total: 0, dfx: 0, network: 0, bankFixed: 4, bankVariable: 6, bank: 3 } as never}
      />,
    );
    for (const label of ['Bank fee (fixed)', 'Bank fee (percent)']) {
      if (type === 'Swap') expect(screen.queryByText(label)).not.toBeInTheDocument();
      else expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText('Bank fee', { exact: true })).not.toBeInTheDocument();
    rerender(<ExchangeRate {...defaults} type={type as never} />);
    if (type === 'Swap') expect(screen.queryByText('Bank fee', { exact: true })).not.toBeInTheDocument();
    else expect(screen.getByText('Bank fee', { exact: true })).toBeInTheDocument();
    rerender(
      <ExchangeRate {...defaults} type={type as never} fees={{ rate: 0, total: 0, dfx: 0, network: 0 } as never} />,
    );
    expect(screen.queryByText('Bank fee', { exact: true })).not.toBeInTheDocument();
    if (type === 'Swap') {
      expect(
        screen.getByText(
          'The output amount is computed as the input amount minus the DFX fee and the network fee over the base rate. That is, 8 USD = (10 EUR - 0 EUR - 0 EUR) ÷ 1.234567 EUR/USD.',
        ),
      ).toBeInTheDocument();
    }
  });

  it.each([
    ['Bitcoin', 'Lightning'],
    ['Ethereum', 'Arbitrum / Optimism'],
    ['Other', null],
    [null, null],
  ])('shows the layer 2 hint for %s', (blockchain, hint) => {
    const to = blockchain ? { name: 'USD', blockchain } : { name: 'USD' };
    render(<ExchangeRate {...defaults} to={to as never} rate={Number.MAX_VALUE} />);
    expect(screen.getByText('∞ EUR/USD')).toBeInTheDocument();
    if (hint)
      expect(
        screen.getByText(`Use ${hint} as a Layer 2 solution to benefit from lower transaction fees`),
      ).toBeInTheDocument();
    else expect(screen.queryByText(/as a Layer 2 solution/)).not.toBeInTheDocument();
  });
});
