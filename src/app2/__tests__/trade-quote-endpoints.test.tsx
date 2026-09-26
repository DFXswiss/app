// The SDK endpoint tests pin the public quote URLs and token behavior. These App 2 tests pin the
// boundary: display quotes pass only quote fields to the SDK, while payment-info requests carry
// the transaction id and remain separate from display refreshes.

const mockReceiveForBuy = jest.fn();
const mockReceiveForSwap = jest.fn();
const mockReceiveForSell = jest.fn();
const mockQuoteBuy = jest.fn();
const mockQuoteSwap = jest.fn();
const mockQuoteSell = jest.fn();
const mockQuoteSession = { address: undefined as string | undefined };

jest.mock('../wallets/session', () => ({
  useWalletSession: () => mockQuoteSession,
}));

jest.mock('@dfx.swiss/react', () => ({
  ApiException: class ApiException extends Error {
    statusCode: number;
    constructor(httpStatus: number, errorMessage: string) {
      super(errorMessage);
      this.statusCode = httpStatus;
    }
  },
  FiatPaymentMethod: { BANK: 'Bank', INSTANT: 'Instant', CARD: 'Card' },
  PersonalIbanProvider: { FRICK: 'Frick', YAPEAL: 'Yapeal' },
  useBuy: () => ({ receiveFor: mockReceiveForBuy, quote: mockQuoteBuy }),
  useSell: () => ({ receiveFor: mockReceiveForSell, quote: mockQuoteSell }),
  useSwap: () => ({ receiveFor: mockReceiveForSwap, quote: mockQuoteSwap }),
}));

import { act, render, waitFor } from '@testing-library/react';
import { ApiException, FiatPaymentMethod, PersonalIbanProvider, type Asset, type Fiat } from '@dfx.swiss/react';
import { isTransientQuoteError, useBuyQuote, useSellQuote, useSwapQuote } from '../screens/trade/useTradeQuote';

const currency = { id: 2, name: 'EUR' } as Fiat;
const asset = { id: 123, name: 'USDT' } as Asset;
const otherAsset = { id: 113, name: 'USDC' } as Asset;

function BuyHarness({
  withPaymentInfo,
  amount = 100,
  targetAmount,
  personalIbanProvider,
}: {
  withPaymentInfo?: boolean;
  amount?: number | null;
  targetAmount?: number | null;
  personalIbanProvider?: PersonalIbanProvider;
}) {
  useBuyQuote({
    enabled: true,
    asset,
    currency,
    amount,
    targetAmount,
    paymentMethod: FiatPaymentMethod.BANK,
    externalTransactionId: 'tx-42',
    withPaymentInfo,
    personalIbanProvider,
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
    mockQuoteBuy.mockResolvedValue({ estimatedAmount: 111 });
    mockQuoteSwap.mockResolvedValue({ estimatedAmount: 99 });
    mockQuoteSell.mockResolvedValue({ estimatedAmount: 86 });
    mockReceiveForBuy.mockResolvedValue({ estimatedAmount: 111 });
    mockReceiveForSwap.mockResolvedValue({ estimatedAmount: 99 });
    mockReceiveForSell.mockResolvedValue({ estimatedAmount: 86 });
  });

  it('passes display-only buy fields to the SDK without a transaction id', async () => {
    render(<BuyHarness />);

    await waitFor(() => expect(mockQuoteBuy).toHaveBeenCalledTimes(1));
    expect(mockQuoteBuy).toHaveBeenCalledWith({ currency, asset, amount: 100, paymentMethod: 'Bank' });
    expect(mockQuoteBuy.mock.calls[0][0]).not.toHaveProperty('externalTransactionId');
    expect(mockReceiveForBuy).not.toHaveBeenCalled();
  });

  it('passes a buy target amount without a source amount', async () => {
    render(<BuyHarness amount={null} targetAmount={0.01} />);

    await waitFor(() => expect(mockQuoteBuy).toHaveBeenCalledTimes(1));
    expect(mockQuoteBuy).toHaveBeenCalledWith({ currency, asset, targetAmount: 0.01, paymentMethod: 'Bank' });
    expect(mockQuoteBuy.mock.calls[0][0]).not.toHaveProperty('amount');
  });

  it('sends targetAmount on buy paymentInfos when quoting the destination', async () => {
    render(<BuyHarness amount={null} targetAmount={0.01} withPaymentInfo />);

    await waitFor(() => expect(mockReceiveForBuy).toHaveBeenCalledTimes(1));
    expect(mockReceiveForBuy).toHaveBeenCalledWith(
      expect.objectContaining({ targetAmount: 0.01, externalTransactionId: 'tx-42' }),
    );
    expect(mockReceiveForBuy.mock.calls[0][0]).not.toHaveProperty('amount');
  });

  it('sends personalIbanProvider only on paymentInfos, never on the public quote', async () => {
    const { unmount } = render(<BuyHarness personalIbanProvider={PersonalIbanProvider.FRICK} />);
    await waitFor(() => expect(mockQuoteBuy).toHaveBeenCalledTimes(1));
    expect(mockQuoteBuy.mock.calls[0][0]).not.toHaveProperty('personalIbanProvider');
    unmount();

    render(<BuyHarness withPaymentInfo personalIbanProvider={PersonalIbanProvider.FRICK} />);
    await waitFor(() => expect(mockReceiveForBuy).toHaveBeenCalledTimes(1));
    expect(mockReceiveForBuy).toHaveBeenCalledWith(expect.objectContaining({ personalIbanProvider: 'Frick' }));
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
    expect(mockQuoteBuy).not.toHaveBeenCalled();
  });

  it('applies the same split to swap', async () => {
    const { unmount } = render(<SwapHarness />);
    await waitFor(() => expect(mockQuoteSwap).toHaveBeenCalledTimes(1));
    expect(mockQuoteSwap).toHaveBeenCalledWith({ sourceAsset: asset, targetAsset: otherAsset, amount: 100 });
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

    await waitFor(() => expect(mockQuoteSell).toHaveBeenCalledTimes(1));
    expect(mockQuoteSell).toHaveBeenCalledWith({ asset, currency, amount: 100 });
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
    expect(mockQuoteSell).not.toHaveBeenCalled();
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

  it('retries a lost public quote', async () => {
    jest.useFakeTimers();
    mockQuoteBuy.mockRejectedValue(new Error('network'));
    render(<BuyHarness />);

    await act(async () => {
      jest.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(mockQuoteBuy).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    expect(mockQuoteBuy).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('switches endpoints when the caller moves to pay, without losing the input identity', async () => {
    const { rerender } = render(<BuyHarness />);
    await waitFor(() => expect(mockQuoteBuy).toHaveBeenCalledTimes(1));

    rerender(<BuyHarness withPaymentInfo />);
    await waitFor(() => expect(mockReceiveForBuy).toHaveBeenCalledTimes(1));
    expect(mockQuoteBuy).toHaveBeenCalledTimes(1);
  });
});
