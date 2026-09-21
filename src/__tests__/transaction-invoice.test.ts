jest.mock('@dfx.swiss/react', () => ({
  TransactionState: {
    CREATED: 'Created',
    PROCESSING: 'Processing',
    LIQUIDITY_PENDING: 'LiquidityPending',
    CHECK_PENDING: 'CheckPending',
    KYC_REQUIRED: 'KycRequired',
    LIMIT_EXCEEDED: 'LimitExceeded',
    FEE_TOO_HIGH: 'FeeTooHigh',
    PRICE_UNDETERMINABLE: 'PriceUndeterminable',
    PAYOUT_IN_PROGRESS: 'PayoutInProgress',
    COMPLETED: 'Completed',
    FAILED: 'Failed',
    RETURN_PENDING: 'ReturnPending',
    RETURNED: 'Returned',
    UNASSIGNED: 'Unassigned',
    WAITING_FOR_PAYMENT: 'WaitingForPayment',
    STOPPED: 'Stopped',
  },
  TransactionType: {
    BUY: 'Buy',
    SELL: 'Sell',
  },
}));

jest.mock('../util/utils', () => ({
  openPdfFromString: jest.fn(),
}));

import { TransactionState, TransactionType } from '@dfx.swiss/react';
import { canOpenInvoice, revealInvoicePdf } from '../util/transaction-invoice';
import { openPdfFromString } from '../util/utils';

const mockOpenPdfFromString = openPdfFromString as jest.Mock;

describe('canOpenInvoice', () => {
  it('returns true for Completed Buy CHF', () => {
    expect(
      canOpenInvoice({
        type: TransactionType.BUY,
        state: TransactionState.COMPLETED,
        inputAsset: 'CHF',
      }),
    ).toBe(true);
  });

  it('returns true for Completed Buy EUR', () => {
    expect(
      canOpenInvoice({
        type: TransactionType.BUY,
        state: TransactionState.COMPLETED,
        inputAsset: 'EUR',
      }),
    ).toBe(true);
  });

  it('returns false for Sell', () => {
    expect(
      canOpenInvoice({
        type: TransactionType.SELL,
        state: TransactionState.COMPLETED,
        inputAsset: 'EUR',
      }),
    ).toBe(false);
  });

  it('returns false for non-completed Buy', () => {
    expect(
      canOpenInvoice({
        type: TransactionType.BUY,
        state: TransactionState.FAILED,
        inputAsset: 'EUR',
      }),
    ).toBe(false);
  });

  it('returns true for WaitingForPayment Buy CHF', () => {
    expect(
      canOpenInvoice({
        type: TransactionType.BUY,
        state: TransactionState.WAITING_FOR_PAYMENT,
        inputAsset: 'CHF',
      }),
    ).toBe(true);
  });

  it('returns true for WaitingForPayment Buy EUR', () => {
    expect(
      canOpenInvoice({
        type: TransactionType.BUY,
        state: TransactionState.WAITING_FOR_PAYMENT,
        inputAsset: 'EUR',
      }),
    ).toBe(true);
  });

  it('returns false for WaitingForPayment Buy BTC', () => {
    expect(
      canOpenInvoice({
        type: TransactionType.BUY,
        state: TransactionState.WAITING_FOR_PAYMENT,
        inputAsset: 'BTC',
      }),
    ).toBe(false);
  });

  it('returns false for WaitingForPayment Sell EUR', () => {
    expect(
      canOpenInvoice({
        type: TransactionType.SELL,
        state: TransactionState.WAITING_FOR_PAYMENT,
        inputAsset: 'EUR',
      }),
    ).toBe(false);
  });

  it('returns false for Created, KycRequired, LimitExceeded and CheckPending Buy CHF', () => {
    for (const state of [
      TransactionState.CREATED,
      TransactionState.KYC_REQUIRED,
      TransactionState.LIMIT_EXCEEDED,
      TransactionState.CHECK_PENDING,
    ]) {
      expect(
        canOpenInvoice({
          type: TransactionType.BUY,
          state,
          inputAsset: 'CHF',
        }),
      ).toBe(false);
    }
  });

  it('returns false when inputAsset is missing', () => {
    expect(
      canOpenInvoice({
        type: TransactionType.BUY,
        state: TransactionState.COMPLETED,
        inputAsset: undefined as unknown as string,
      }),
    ).toBe(false);
  });

  it('returns false for other inputAsset values', () => {
    expect(
      canOpenInvoice({
        type: TransactionType.BUY,
        state: TransactionState.COMPLETED,
        inputAsset: 'BTC',
      }),
    ).toBe(false);
    expect(
      canOpenInvoice({
        type: TransactionType.BUY,
        state: TransactionState.COMPLETED,
        inputAsset: 'dCHF',
      }),
    ).toBe(false);
    expect(
      canOpenInvoice({
        type: TransactionType.BUY,
        state: TransactionState.COMPLETED,
        inputAsset: 'eur',
      }),
    ).toBe(false);
  });
});

describe('revealInvoicePdf', () => {
  const pdf = btoa('pdf');
  const originalCreateObjectURL = (global.URL as any).createObjectURL;

  beforeEach(() => {
    mockOpenPdfFromString.mockClear();
    (global.URL as any).createObjectURL = jest.fn(() => 'blob:invoice');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalCreateObjectURL) {
      (global.URL as any).createObjectURL = originalCreateObjectURL;
    } else {
      delete (global.URL as any).createObjectURL;
    }
  });

  it('sets location.href to a blob URL for a live preview window and does not call openPdfFromString', () => {
    const preview = {
      closed: false,
      close: jest.fn(),
      location: { href: '' },
    };

    revealInvoicePdf(pdf, preview as unknown as Window);

    expect(preview.location.href).toBe('blob:invoice');
    expect((global.URL as any).createObjectURL).toHaveBeenCalled();
    expect(mockOpenPdfFromString).not.toHaveBeenCalled();
  });

  it('calls openPdfFromString(pdf, false) when preview is null', () => {
    revealInvoicePdf(pdf, null);

    expect(mockOpenPdfFromString).toHaveBeenCalledWith(pdf, false);
  });

  it('calls openPdfFromString(pdf, false) when preview is already closed', () => {
    const preview = {
      closed: true,
      close: jest.fn(),
      location: { href: '' },
    };

    revealInvoicePdf(pdf, preview as unknown as Window);

    expect(mockOpenPdfFromString).toHaveBeenCalledWith(pdf, false);
    expect(preview.location.href).toBe('');
  });
});
