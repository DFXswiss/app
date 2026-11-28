const mockSimulatePayment = jest.fn();
const mockSimulatePayout = jest.fn();
let mockTestNetwork = true;

jest.mock('@dfx.swiss/react', () => ({
  useBuy: () => ({ simulatePaymentFor: mockSimulatePayment }),
  useSell: () => ({ simulatePayoutFor: mockSimulatePayout }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  StyledButton: ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {label}
    </button>
  ),
  StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
  StyledButtonWidth: { FULL: 'full' },
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_namespace: string, text: string) => text }),
}));

jest.mock('../util/test-network', () => ({ isTestNetwork: () => mockTestNetwork }));

import { act, fireEvent, render, screen } from '@testing-library/react';
import { SimulatePayment, SimulatePayout, simulationKey, simulationNonce } from '../components/payment/test-simulation';

const buy = { id: 1, routeId: 77, amount: 100, currency: { name: 'CHF' } } as never;
const sell = { id: 2, routeId: 88 } as never;

describe('STG/DEV simulations', () => {
  beforeEach(() => {
    mockSimulatePayment.mockReset();
    mockSimulatePayout.mockReset();
    mockTestNetwork = true;
  });

  it('renders nothing outside DEV/STG', () => {
    mockTestNetwork = false;
    const { container } = render(
      <>
        <SimulatePayment buy={buy} />
        <SimulatePayout sell={sell} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('keys each payment intent by transaction request, amount and completion nonce', () => {
    const nonce = simulationNonce();
    expect(simulationNonce()).not.toBe(nonce);
    expect(simulationKey({ id: 5, amount: 100 }, nonce)).toBe(`simulate-buy-5-100-${nonce}`);
    expect(simulationKey({ id: 5, amount: 100 }, nonce)).toBe(simulationKey({ id: 5, amount: 100 }, nonce));
    expect(simulationKey({ id: 6, amount: 100 }, nonce)).not.toBe(simulationKey({ id: 5, amount: 100 }, nonce));
    expect(simulationKey({ id: 5, amount: 200 }, nonce)).not.toBe(simulationKey({ id: 5, amount: 100 }, nonce));
  });

  it('books a second buy on the same route in the same tab under a new key', async () => {
    mockSimulatePayment.mockResolvedValue({});
    const first = render(<SimulatePayment buy={buy} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Simulate payment' }));
    });
    first.unmount();

    const again = { id: 3, routeId: 77, amount: 100, currency: { name: 'CHF' } } as never;
    render(<SimulatePayment buy={again} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Simulate payment' }));
    });

    const [one, two] = mockSimulatePayment.mock.calls;
    expect(one[0]).toBe(77);
    expect(two[0]).toBe(77);
    expect(one[1].idempotencyKey).toMatch(/^simulate-buy-1-100-/);
    expect(two[1].idempotencyKey).toMatch(/^simulate-buy-3-100-/);
  });

  it('gives a new completion of the same buy a new nonce', async () => {
    mockSimulatePayment.mockResolvedValue({});
    const first = render(<SimulatePayment buy={buy} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Simulate payment' }));
    });
    first.unmount();
    render(<SimulatePayment buy={buy} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Simulate payment' }));
    });
    const [one, two] = mockSimulatePayment.mock.calls;
    expect(two[1].idempotencyKey).not.toBe(one[1].idempotencyKey);
  });

  it('simulates the bank payment for the buy route with the same key on every retry', async () => {
    mockSimulatePayment.mockRejectedValueOnce(new Error('Route is not pending')).mockResolvedValueOnce({});
    render(<SimulatePayment buy={buy} />);
    expect(screen.getByText('Test environment only')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Simulate payment' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Route is not pending');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Simulate payment' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Payment simulated. The purchase is now processed like a real bank transfer.',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    const [first, second] = mockSimulatePayment.mock.calls;
    expect(first[0]).toBe(77);
    expect(first[1]).toEqual({
      amount: 100,
      currency: 'CHF',
      idempotencyKey: expect.stringMatching(/^simulate-buy-1-100-/),
    });
    expect(second[1].idempotencyKey).toBe(first[1].idempotencyKey);
  });

  it('disables the button while the simulation runs', async () => {
    let release: () => void = () => undefined;
    mockSimulatePayout.mockReturnValue(new Promise<void>((resolve) => (release = resolve)));
    render(<SimulatePayout sell={sell} />);

    fireEvent.click(screen.getByRole('button', { name: 'Simulate payout' }));
    expect(screen.getByRole('button', { name: 'Simulate payout' })).toBeDisabled();
    expect(mockSimulatePayout).toHaveBeenCalledWith(88);

    await act(async () => release());
    expect(screen.getByRole('status')).toHaveTextContent('Payout simulated.');
  });

  it('shows the generic failure when the error has no message', async () => {
    mockSimulatePayout.mockRejectedValue('offline');
    render(<SimulatePayout sell={sell} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Simulate payout' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('The simulation failed. Please try again.');
  });
});
