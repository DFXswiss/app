const mockCall = jest.fn();
const mockFetchJson = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  useApi: () => ({ call: mockCall }),
  PaymentLinkPaymentStatus: {
    PENDING: 'Pending',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    EXPIRED: 'Expired',
  },
}));

jest.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams({ lightning: 'LNURL1TEST', key: 'test-key' })],
}));

jest.mock('src/util/lnurl', () => ({
  Lnurl: { decode: () => 'https://api.example.com/v1/paymentLink/payment?route=test' },
}));

jest.mock('src/util/utils', () => ({
  fetchJson: (...args: any[]) => mockFetchJson(...args),
  url: () => 'https://app.example.com/pl/pos',
}));

import { act, render, waitFor } from '@testing-library/react';
import PaymentLinkPosContext from '../contexts/payment-link-pos.context';

const waitCalls = () => mockCall.mock.calls.filter(([request]) => request.url.startsWith('paymentLink/payment/wait'));

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    // let the retry chain (checkIsPendingPayment, then the wait call) settle
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

function respondToWaitWith(error: { statusCode: number }) {
  mockCall.mockImplementation(async ({ url }: { url: string }) => {
    if (url.startsWith('paymentLink/payment/wait')) throw error;

    // history, used both for authentication and for the pending-payment check
    return [{ payments: [{ status: 'Pending' }] }];
  });
}

describe('PaymentLinkPosContext wait retry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockCall.mockReset();
    mockFetchJson.mockReset();
    mockFetchJson.mockResolvedValue({ externalId: 'ext-1' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should ask again after a timeout', async () => {
    respondToWaitWith({ statusCode: 408 });

    render(<PaymentLinkPosContext>{null}</PaymentLinkPosContext>);
    await waitFor(() => expect(waitCalls()).toHaveLength(1));

    await advance(2 * 1000);

    expect(waitCalls().length).toBeGreaterThan(1);
  });

  it('should stop asking once the session is gone', async () => {
    respondToWaitWith({ statusCode: 401 });

    render(<PaymentLinkPosContext>{null}</PaymentLinkPosContext>);
    await waitFor(() => expect(waitCalls()).toHaveLength(1));

    await advance(30 * 1000);

    expect(waitCalls()).toHaveLength(1);
  });
});
