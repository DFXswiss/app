const mockCall = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  useApi: () => ({ call: mockCall }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  StyledButton: ({ label, onClick, isLoading }: { label: string; onClick: () => void; isLoading?: boolean }) => (
    // The real button ignores clicks while it loads; this one does not, so the component's own guard is tested.
    <button type="button" onClick={onClick} data-loading={isLoading ? 'true' : undefined}>
      {label}
    </button>
  ),
  StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
  StyledButtonWidth: { FULL: 'full' },
}));

// Keys `namespace:text` that a test translates; every other text passes through.
const mockTranslations: Record<string, string> = {};

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (namespace: string, text: string, params?: Record<string, unknown>) =>
      Object.entries(params ?? {}).reduce(
        (out, [key, value]) => out.replace(`{{${key}}}`, String(value)),
        mockTranslations[`${namespace}:${text}`] ?? text,
      ),
  }),
}));

import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { SimulatePayment } from '../components/payment/simulate-payment';
import { canSimulatePayment, useSimulatePayment } from '../hooks/simulate-payment.hook';

function buy(overrides: Record<string, unknown> = {}): any {
  return { id: 31, routeId: 17, amount: 100, currency: { name: 'CHF' }, ...overrides };
}

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void } {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('canSimulatePayment', () => {
  it('accepts a CHF or EUR buy with a route and an amount up to the API maximum', () => {
    expect(canSimulatePayment(buy())).toBe(true);
    expect(canSimulatePayment(buy({ currency: { name: 'EUR' } }))).toBe(true);
    expect(canSimulatePayment(buy({ amount: 100000 }))).toBe(true);
  });

  it.each([
    ['a currency the API cannot simulate', { currency: { name: 'USD' } }],
    ['a missing route', { routeId: 0 }],
    ['a zero amount', { amount: 0 }],
    ['an amount above the API maximum of 100000', { amount: 100000.01 }],
  ])('rejects %s', (_case, overrides) => {
    expect(canSimulatePayment(buy(overrides))).toBe(false);
  });
});

describe('useSimulatePayment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('books the order amount on the buy route with the request as idempotency key', async () => {
    mockCall.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSimulatePayment());

    await result.current.simulatePayment(buy({ currency: { name: 'EUR' }, amount: 250.5 }));

    expect(mockCall).toHaveBeenCalledWith({
      url: 'buy/17/simulatePayment',
      method: 'PUT',
      data: { amount: 250.5, currency: 'EUR', idempotencyKey: 'request-31' },
    });
  });
});

describe('SimulatePayment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders nothing for a buy the API cannot simulate', () => {
    const { container } = render(<SimulatePayment buy={buy({ currency: { name: 'USD' } })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('labels the tool as a test and confirms the booked transfer', async () => {
    const call = deferred();
    mockCall.mockReturnValue(call.promise);
    render(<SimulatePayment buy={buy()} />);

    expect(screen.getByText('Test environment: no real money is moved.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Simulate payment' }));
    expect(screen.getByRole('button', { name: 'Simulate payment' })).toHaveAttribute('data-loading', 'true');

    // A second click while the first request runs sends nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Simulate payment' }));
    expect(mockCall).toHaveBeenCalledTimes(1);

    await act(async () => call.resolve());

    expect(screen.getByText('Payment simulated. The test transfer of 100 CHF is booked.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Simulate payment' })).not.toBeInTheDocument();
  });

  it('shows the API message and lets the user try again', async () => {
    mockCall.mockRejectedValueOnce({ message: 'Payment simulation is only available on DEV, LOC and STG' });
    render(<SimulatePayment buy={buy()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Simulate payment' }));
    });

    expect(screen.getByText('Payment simulation is only available on DEV, LOC and STG')).toBeInTheDocument();

    mockCall.mockResolvedValueOnce(undefined);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Simulate payment' }));
    });

    expect(mockCall).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Payment simulation is only available on DEV, LOC and STG')).not.toBeInTheDocument();
    expect(screen.getByText('Payment simulated. The test transfer of 100 CHF is booked.')).toBeInTheDocument();
  });

  it('shows the validation messages of a rejected body as the SDK error carries them', async () => {
    // ApiException extends Error, so the API's message list arrives as one comma-separated string.
    const validation = [
      'amount must not be greater than 100000',
      'currency must be one of the following values: CHF, EUR',
    ];
    mockCall.mockRejectedValueOnce(new Error(String(validation)));
    render(<SimulatePayment buy={buy()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Simulate payment' }));
    });

    expect(
      screen.getByText('amount must not be greater than 100000,currency must be one of the following values: CHF, EUR'),
    ).toBeInTheDocument();
  });

  it.each([
    ['without a message', {}],
    ['with an empty message', new Error('')],
    ['with a blank message', new Error('  ')],
    ['that is not an object', undefined],
  ])('falls back to the translated generic error for a rejection %s', async (_case, rejection) => {
    mockTranslations['screens/buy:Unknown error'] = 'Unbekannter Fehler';
    mockCall.mockRejectedValueOnce(rejection);
    render(<SimulatePayment buy={buy()} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Simulate payment' }));
    });

    expect(screen.getByText('Unbekannter Fehler')).toBeInTheDocument();
    delete mockTranslations['screens/buy:Unknown error'];
  });
});
