// B5 — externalTransactionId must participate in the quote-engine cache key so a new payment
// attempt (same asset/amount, new id) cannot reuse a stale cached paymentInfos response.

const mockReceiveForBuy = jest.fn();
const mockReceiveForSwap = jest.fn();
const mockReceiveForSell = jest.fn();
const mockCall = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  BuyUrl: { quote: 'buy/quote', receive: 'buy/paymentInfos' },
  SellUrl: { quote: 'sell/quote', receive: 'sell/paymentInfos' },
  SwapUrl: { quote: 'swap/quote', receive: 'swap/paymentInfos' },
  FiatPaymentMethod: { BANK: 'Bank', INSTANT: 'Instant', CARD: 'Card' },
  useApi: () => ({ call: mockCall }),
  useBuy: () => ({ receiveFor: mockReceiveForBuy }),
  useSell: () => ({ receiveFor: mockReceiveForSell }),
  useSwap: () => ({ receiveFor: mockReceiveForSwap }),
}));

import { render, waitFor } from '@testing-library/react';
import { FiatPaymentMethod, type Asset, type Fiat } from '@dfx.swiss/react';
import { useBuyQuote, useSellQuote, useSwapQuote } from '../screens/trade/useTradeQuote';

const currency = { id: 2, name: 'EUR' } as Fiat;
const asset = { id: 123, name: 'USDT' } as Asset;
const otherAsset = { id: 113, name: 'USDC' } as Asset;

function BuyHarness({ extId, withPaymentInfo }: { extId?: string; withPaymentInfo?: boolean }) {
  useBuyQuote({
    enabled: true,
    asset,
    currency,
    amount: 100,
    paymentMethod: FiatPaymentMethod.BANK,
    externalTransactionId: extId,
    withPaymentInfo,
  });
  return null;
}

function SellHarness({ extId, iban }: { extId?: string; iban?: string }) {
  useSellQuote({
    enabled: true,
    asset,
    currency,
    amount: 100,
    iban,
    externalTransactionId: extId,
  });
  return null;
}

function SwapHarness({ extId, withPaymentInfo }: { extId?: string; withPaymentInfo?: boolean }) {
  useSwapQuote({
    enabled: true,
    sourceAsset: asset,
    targetAsset: otherAsset,
    amount: 100,
    externalTransactionId: extId,
    withPaymentInfo,
  });
  return null;
}

describe('App2 B5 externalTransactionId cache key', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCall.mockResolvedValue({ estimatedAmount: 111 });
    mockReceiveForBuy.mockResolvedValue({ estimatedAmount: 111 });
    mockReceiveForSwap.mockResolvedValue({ estimatedAmount: 99 });
    mockReceiveForSell.mockResolvedValue({ estimatedAmount: 86 });
  });

  it('refetches buy paymentInfos when externalTransactionId changes', async () => {
    const { rerender } = render(<BuyHarness withPaymentInfo extId="tx-1" />);
    await waitFor(() => expect(mockReceiveForBuy).toHaveBeenCalledTimes(1));

    rerender(<BuyHarness withPaymentInfo extId="tx-2" />);
    await waitFor(() => expect(mockReceiveForBuy).toHaveBeenCalledTimes(2));
    expect(mockReceiveForBuy).toHaveBeenLastCalledWith(expect.objectContaining({ externalTransactionId: 'tx-2' }));
  });

  it('refetches sell paymentInfos when externalTransactionId changes', async () => {
    const iban = 'CH93 0076 2011 6238 5295 7';
    const { rerender } = render(<SellHarness iban={iban} extId="tx-1" />);
    await waitFor(() => expect(mockReceiveForSell).toHaveBeenCalledTimes(1));

    rerender(<SellHarness iban={iban} extId="tx-2" />);
    await waitFor(() => expect(mockReceiveForSell).toHaveBeenCalledTimes(2));
  });

  it('refetches swap paymentInfos when externalTransactionId changes', async () => {
    const { rerender } = render(<SwapHarness withPaymentInfo extId="tx-1" />);
    await waitFor(() => expect(mockReceiveForSwap).toHaveBeenCalledTimes(1));

    rerender(<SwapHarness withPaymentInfo extId="tx-2" />);
    await waitFor(() => expect(mockReceiveForSwap).toHaveBeenCalledTimes(2));
  });

  it('keeps the same public-quote key when externalTransactionId is undefined (no extra fetch on remount-equivalent rerender)', async () => {
    const { rerender } = render(<BuyHarness />);
    await waitFor(() => expect(mockCall).toHaveBeenCalledTimes(1));

    // Same inputs, still undefined — must not invalidate.
    rerender(<BuyHarness />);
    // Allow a debounce window; a second call would mean the key flipped spuriously.
    await new Promise((r) => setTimeout(r, 500));
    expect(mockCall).toHaveBeenCalledTimes(1);
  });
});
