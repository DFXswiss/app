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
import { SimulatePayment, SimulatePayout, simulationKey } from '../components/payment/test-simulation';

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

  it('keeps one idempotency key per buy route', () => {
    expect(simulationKey(5)).toBe(simulationKey(5));
    expect(simulationKey(5)).not.toBe(simulationKey(6));
    expect(simulationKey(5)).toMatch(/^simulate-buy-5-/);
  });

  it('simulates the bank payment for the buy route with the same key on every click', async () => {
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
    expect(first[1]).toEqual({ amount: 100, currency: 'CHF', idempotencyKey: simulationKey(77) });
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
