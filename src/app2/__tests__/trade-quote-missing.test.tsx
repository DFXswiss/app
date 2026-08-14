const mockReceiveForBuy = jest.fn();
const mockReceiveForSwap = jest.fn();
const mockReceiveForSell = jest.fn();
const mockCall = jest.fn();
const mockEngine = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  BuyUrl: { quote: 'buy/quote', receive: 'buy/paymentInfos' },
  SellUrl: { quote: 'sell/quote', receive: 'sell/paymentInfos' },
  SwapUrl: { quote: 'swap/quote', receive: 'swap/paymentInfos' },
  FiatPaymentMethod: { BANK: 'Bank' },
  useApi: () => ({ call: mockCall }),
  useBuy: () => ({ receiveFor: mockReceiveForBuy }),
  useSell: () => ({ receiveFor: mockReceiveForSell }),
  useSwap: () => ({ receiveFor: mockReceiveForSwap }),
}));

jest.mock('../screens/trade/useQuoteEngine', () => ({
  useQuoteEngine: (...args: unknown[]) => mockEngine(...args),
}));

import { render } from '@testing-library/react';
import { FiatPaymentMethod, type Asset, type Fiat } from '@dfx.swiss/react';
import { useBuyQuote, useSellQuote, useSwapQuote } from '../screens/trade/useTradeQuote';

const currency = { id: 2, name: 'EUR' } as Fiat;
const asset = { id: 123, name: 'USDT' } as Asset;
const other = { id: 113, name: 'USDC' } as Asset;

function captureFetcher() {
  return mockEngine.mock.calls[mockEngine.mock.calls.length - 1][2] as () => Promise<unknown>;
}

describe('trade quote fail-closed fetchers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEngine.mockReturnValue({ data: null });
    mockReceiveForBuy.mockResolvedValue({});
    mockReceiveForSell.mockResolvedValue({});
    mockReceiveForSwap.mockResolvedValue({});
    mockCall.mockResolvedValue({});
  });

  it('rejects a buy quote that lost its inputs and omits an empty external id on payment info', async () => {
    function Missing() {
      useBuyQuote({ enabled: true, amount: null, paymentMethod: FiatPaymentMethod.BANK });
      return null;
    }
    render(<Missing />);
    await expect(captureFetcher()).rejects.toThrow('buy quote: missing input');

    function Info() {
      useBuyQuote({
        enabled: true,
        asset,
        currency,
        amount: 10,
        paymentMethod: FiatPaymentMethod.BANK,
        withPaymentInfo: true,
      });
      return null;
    }
    render(<Info />);
    await captureFetcher()();
    expect(mockReceiveForBuy).toHaveBeenCalled();
    expect(mockReceiveForBuy.mock.calls[0][0]).not.toHaveProperty('externalTransactionId');
  });

  it('rejects a sell quote that lost its inputs and a swap quote that lost its inputs', async () => {
    function MissingSell() {
      useSellQuote({ enabled: true, amount: null });
      return null;
    }
    render(<MissingSell />);
    await expect(captureFetcher()).rejects.toThrow('sell quote: missing input');

    function MissingSwap() {
      useSwapQuote({ enabled: true, amount: null });
      return null;
    }
    render(<MissingSwap />);
    await expect(captureFetcher()).rejects.toThrow('swap quote: missing input');
  });

  it('omits an empty external id on swap payment info', async () => {
    function Info() {
      useSwapQuote({
        enabled: true,
        sourceAsset: asset,
        targetAsset: other,
        amount: 10,
        withPaymentInfo: true,
      });
      return null;
    }
    render(<Info />);
    await captureFetcher()();
    expect(mockReceiveForSwap).toHaveBeenCalled();
    expect(mockReceiveForSwap.mock.calls[0][0]).not.toHaveProperty('externalTransactionId');
  });
});
