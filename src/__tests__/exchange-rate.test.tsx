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
  StyledCollapsible: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
