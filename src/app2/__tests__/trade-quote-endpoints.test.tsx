// Which endpoint a trade quote hits is a money-path decision, so it is pinned here rather than
// left to reading: the panel must quote publicly (no token, no payment request created), and
// only a `withPaymentInfo` call may create real payment details — with the transaction id that
// identifies a payment never leaking onto the public call.

const mockReceiveForBuy = jest.fn();
const mockReceiveForSwap = jest.fn();
const mockReceiveForSell = jest.fn();
const mockCall = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  ApiException: class ApiException extends Error {
    statusCode: number;
    constructor(httpStatus: number, errorMessage: string) {
      super(errorMessage);
      this.statusCode = httpStatus;
    }
  },
  BuyUrl: { quote: 'buy/quote', receive: 'buy/paymentInfos' },
  SellUrl: { quote: 'sell/quote', receive: 'sell/paymentInfos' },
  SwapUrl: { quote: 'swap/quote', receive: 'swap/paymentInfos' },
  FiatPaymentMethod: { BANK: 'Bank', INSTANT: 'Instant', CARD: 'Card' },
  useApi: () => ({ call: mockCall }),
  useBuy: () => ({ receiveFor: mockReceiveForBuy }),
  useSell: () => ({ receiveFor: mockReceiveForSell }),
  useSwap: () => ({ receiveFor: mockReceiveForSwap }),
}));

import { act, render, waitFor } from '@testing-library/react';
import { ApiException, FiatPaymentMethod, type Asset, type Fiat } from '@dfx.swiss/react';
import { isTransientQuoteError, useBuyQuote, useSellQuote, useSwapQuote } from '../screens/trade/useTradeQuote';

const currency = { id: 2, name: 'EUR' } as Fiat;
const asset = { id: 123, name: 'USDT' } as Asset;
const otherAsset = { id: 113, name: 'USDC' } as Asset;

function BuyHarness({ withPaymentInfo }: { withPaymentInfo?: boolean }) {
  useBuyQuote({
    enabled: true,
    asset,
    currency,
    amount: 100,
    paymentMethod: FiatPaymentMethod.BANK,
    externalTransactionId: 'tx-42',
    withPaymentInfo,
  });
  return null;
}

function SwapHarness({ withPaymentInfo }: { withPaymentInfo?: boolean }) {
  useSwapQuote({
    enabled: true,
    sourceAsset: asset,
    targetAsset: otherAsset,
    amount: 100,
    externalTransactionId: 'tx-42',
    withPaymentInfo,
  });
  return null;
}

function SellHarness({ iban }: { iban?: string }) {
  useSellQuote({
    enabled: true,
    asset,
    currency,
    amount: 100,
    externalTransactionId: 'tx-42',
    iban,
  });
  return null;
}

describe('isTransientQuoteError', () => {
  it('treats persistent 4xx as non-retryable except 429', () => {
    expect(isTransientQuoteError(new Error('network'))).toBe(true);
    expect(isTransientQuoteError(new ApiException(400, 'EmailRequired'))).toBe(false);
    expect(isTransientQuoteError(new ApiException(429, 'slow'))).toBe(true);
    expect(isTransientQuoteError(new ApiException(500, 'down'))).toBe(true);
    expect(isTransientQuoteError(new ApiException(399, 'odd'))).toBe(true);
  });
});

describe('App2 trade quote endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCall.mockResolvedValue({ estimatedAmount: 111 });
    mockReceiveForBuy.mockResolvedValue({ estimatedAmount: 111 });
    mockReceiveForSwap.mockResolvedValue({ estimatedAmount: 99 });
    mockReceiveForSell.mockResolvedValue({ estimatedAmount: 86 });
  });

  it('quotes buy publicly — no token, no payment request created, no transaction id', async () => {
    render(<BuyHarness />);

    await waitFor(() => expect(mockCall).toHaveBeenCalledTimes(1));
    expect(mockCall).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'buy/quote',
        method: 'PUT',
        token: false,
        data: { currency, asset, amount: 100, paymentMethod: 'Bank' },
      }),
    );
    expect(mockCall.mock.calls[0][0].data).not.toHaveProperty('externalTransactionId');
    expect(mockReceiveForBuy).not.toHaveBeenCalled();
  });

  it('asks for buy payment details only with withPaymentInfo', async () => {
    render(<BuyHarness withPaymentInfo />);

    await waitFor(() => expect(mockReceiveForBuy).toHaveBeenCalledTimes(1));
    expect(mockReceiveForBuy).toHaveBeenCalledWith({
      currency,
      asset,
      amount: 100,
      paymentMethod: 'Bank',
      externalTransactionId: 'tx-42',
    });
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('applies the same split to swap', async () => {
    const { unmount } = render(<SwapHarness />);
    await waitFor(() => expect(mockCall).toHaveBeenCalledTimes(1));
    expect(mockCall).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'swap/quote',
        token: false,
        data: { sourceAsset: asset, targetAsset: otherAsset, amount: 100 },
      }),
    );
    expect(mockReceiveForSwap).not.toHaveBeenCalled();
    unmount();

    render(<SwapHarness withPaymentInfo />);
    await waitFor(() => expect(mockReceiveForSwap).toHaveBeenCalledTimes(1));
    expect(mockReceiveForSwap).toHaveBeenCalledWith({
      sourceAsset: asset,
      targetAsset: otherAsset,
      amount: 100,
      externalTransactionId: 'tx-42',
    });
  });

  it('quotes sell publicly while no payout account is bound to the request', async () => {
    render(<SellHarness />);

    await waitFor(() => expect(mockCall).toHaveBeenCalledTimes(1));
    expect(mockCall).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'sell/quote',
        token: false,
        data: { asset, currency, amount: 100 },
      }),
    );
    expect(mockReceiveForSell).not.toHaveBeenCalled();
  });

  it('asks for sell payment details only once a payout IBAN is bound', async () => {
    render(<SellHarness iban="CH93 0076 2011 6238 5295 7" />);

    await waitFor(() => expect(mockReceiveForSell).toHaveBeenCalledTimes(1));
    expect(mockReceiveForSell).toHaveBeenCalledWith({
      asset,
      currency,
      amount: 100,
      iban: 'CH93 0076 2011 6238 5295 7',
      externalTransactionId: 'tx-42',
    });
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('does not retry a lost paymentInfos response', async () => {
    jest.useFakeTimers();
    mockReceiveForBuy.mockRejectedValue(new Error('network'));
    render(<BuyHarness withPaymentInfo />);

    await act(async () => {
      jest.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(mockReceiveForBuy).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(5_000 + 15_000 + 30_000);
      await Promise.resolve();
    });
    expect(mockReceiveForBuy).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('switches endpoints when the caller moves to pay, without losing the input identity', async () => {
    const { rerender } = render(<BuyHarness />);
    await waitFor(() => expect(mockCall).toHaveBeenCalledTimes(1));

    rerender(<BuyHarness withPaymentInfo />);
    await waitFor(() => expect(mockReceiveForBuy).toHaveBeenCalledTimes(1));
    expect(mockCall).toHaveBeenCalledTimes(1);
  });
});
