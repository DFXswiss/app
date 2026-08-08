// Proves that useNavigation's object-form navigate with replaceParams builds a target
// URL only from the provided search — never by merging the current location query.

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

function ContinueToPaymentProbe({ replaceParams }: { replaceParams?: boolean }) {
  const { navigate } = useNavigation();
  return (
    <button
      type="button"
      onClick={() =>
        navigate(
          { pathname: '/pl', search: PAYMENT_SEARCH },
          replaceParams ? { replaceParams: true } : { clearParams: ['recipient', 'pay'] },
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

function assertPaymentLocation(router: ReturnType<typeof createMemoryRouter>) {
  const locationEl = screen.getByTestId('payment-location');
  const text = locationEl.textContent ?? '';
  expect(text.startsWith('/pl')).toBe(true);

  const search = text.slice('/pl'.length);
  expect(search.startsWith('?')).toBe(true);
  expect(search.indexOf('?')).toBe(0);
  expect(search.slice(1).includes('?')).toBe(false);

  const params = new URLSearchParams(search.slice(1));
  expect(params.get('routeId')).toBe('42');
  expect(params.get('amount')).toBe('10');
  expect(params.get('message')).toBe('INV-1');
  expect(params.get('expiryDate')).toBe(EXPIRY);
  expect(params.get('recipient')).toBeNull();
  expect(params.get('pay')).toBeNull();
  expect(params.get('lightning')).toBeNull();
  expect(params.get('merchant')).toBeNull();
  expect([...params.keys()].sort()).toEqual(['amount', 'expiryDate', 'message', 'routeId']);

  expect(router.state.location.pathname).toBe('/pl');
  const routerParams = new URLSearchParams(router.state.location.search);
  expect([...routerParams.keys()].sort()).toEqual(['amount', 'expiryDate', 'message', 'routeId']);
  expect(router.state.location.search).toMatch(/^\?/);
  expect(router.state.location.search.slice(1).includes('?')).toBe(false);
}

describe('useNavigation replaceParams (invoice continue)', () => {
  it('from payer query with replaceParams: only payment params', async () => {
    const router = createMemoryRouter(
      [
        { path: '/invoice', element: <ContinueToPaymentProbe replaceParams /> },
        { path: '/pl', element: <PaymentLocation /> },
      ],
      { initialEntries: ['/invoice?recipient=Foo&pay=1'] },
    );

    render(<RouterProvider router={router} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    });

    await screen.findByTestId('payment-location');
    assertPaymentLocation(router);
  });

  it('from empty query with replaceParams: same four payment params, single ?', async () => {
    const router = createMemoryRouter(
      [
        { path: '/invoice', element: <ContinueToPaymentProbe replaceParams /> },
        { path: '/pl', element: <PaymentLocation /> },
      ],
      { initialEntries: ['/invoice'] },
    );

    render(<RouterProvider router={router} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    });

    await screen.findByTestId('payment-location');
    assertPaymentLocation(router);
  });

  it('strips hijack query (lightning, merchant, forged routeId) when replaceParams is set', async () => {
    const router = createMemoryRouter(
      [
        { path: '/invoice', element: <ContinueToPaymentProbe replaceParams /> },
        { path: '/pl', element: <PaymentLocation /> },
      ],
      {
        initialEntries: [
          '/invoice?recipient=Foo&pay=1&lightning=lnurl1attacker&merchant=evil&routeId=999',
        ],
      },
    );

    render(<RouterProvider router={router} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    });

    await screen.findByTestId('payment-location');
    assertPaymentLocation(router);
    // Explicit: attacker values must not survive even as overwritten keys from location.
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get('routeId')).toBe('42');
    expect(params.get('lightning')).toBeNull();
    expect(params.get('merchant')).toBeNull();
  });
});
