// Proves that useNavigation's object-form navigate with clearParams actually
// produces a target URL without the stripped query keys — not merely that a
// mock was called with clearParams in its options.

// navigation.hook imports relativeUrl from utils, which imports @dfx.swiss/react.
jest.mock('@dfx.swiss/react', () => ({}));
jest.mock('src/dto/safe.dto', () => ({}));

jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({
    redirectPath: undefined,
    setRedirectPath: jest.fn(),
  }),
}));

import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { useNavigation } from '../hooks/navigation.hook';

const EXPIRY = '2027-08-07T00:00:00.000Z';
const PAYMENT_SEARCH = `routeId=42&amount=10&message=INV-1&expiryDate=${EXPIRY}`;

function ContinueToPaymentProbe() {
  const { navigate } = useNavigation();
  return (
    <button
      type="button"
      onClick={() =>
        navigate(
          { pathname: '/pl', search: PAYMENT_SEARCH },
          { clearParams: ['recipient', 'pay'] },
        )
      }
    >
      Continue to payment
    </button>
  );
}

function PaymentLocation() {
  const { pathname, search } = useLocation();
  return (
    <div data-testid="payment-location">
      {pathname}
      {search}
    </div>
  );
}

describe('useNavigation clearParams (invoice payer continue)', () => {
  it('lands on /pl with only the payment query — no recipient, no pay', async () => {
    const router = createMemoryRouter(
      [
        { path: '/invoice', element: <ContinueToPaymentProbe /> },
        { path: '/pl', element: <PaymentLocation /> },
      ],
      { initialEntries: ['/invoice?recipient=Foo&pay=1'] },
    );

    render(<RouterProvider router={router} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    });

    const locationEl = await screen.findByTestId('payment-location');
    const text = locationEl.textContent ?? '';
    expect(text.startsWith('/pl')).toBe(true);

    const search = text.slice('/pl'.length);
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

    expect(params.get('routeId')).toBe('42');
    expect(params.get('amount')).toBe('10');
    expect(params.get('message')).toBe('INV-1');
    expect(params.get('expiryDate')).toBe(EXPIRY);
    expect(params.get('recipient')).toBeNull();
    expect(params.get('pay')).toBeNull();
    expect([...params.keys()].sort()).toEqual(['amount', 'expiryDate', 'message', 'routeId']);

    // Router state agrees with what the destination route renders.
    expect(router.state.location.pathname).toBe('/pl');
    const routerParams = new URLSearchParams(router.state.location.search);
    expect(routerParams.get('recipient')).toBeNull();
    expect(routerParams.get('pay')).toBeNull();
    expect([...routerParams.keys()].sort()).toEqual(['amount', 'expiryDate', 'message', 'routeId']);
  });
});
