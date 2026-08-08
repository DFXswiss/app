// Real useNavigation tests: replaceParams (allowlist) and clearParams (blocklist).

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

function StringNavigateProbe({ replaceParams }: { replaceParams?: boolean }) {
  const { navigate } = useNavigation();
  return (
    <button
      type="button"
      onClick={() =>
        navigate(`/pl?${PAYMENT_SEARCH}`, replaceParams ? { replaceParams: true } : undefined)
      }
    >
      String navigate
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

function assertPaymentKeysOnly(router: ReturnType<typeof createMemoryRouter>) {
  const locationEl = screen.getByTestId('payment-location');
  const text = locationEl.textContent ?? '';
  expect(text.startsWith('/pl')).toBe(true);

  const search = text.slice('/pl'.length);
  expect(search.startsWith('?')).toBe(true);
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
}

describe('useNavigation object-form replaceParams / clearParams', () => {
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
    assertPaymentKeysOnly(router);
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
    assertPaymentKeysOnly(router);
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
    assertPaymentKeysOnly(router);
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get('routeId')).toBe('42');
    expect(params.get('lightning')).toBeNull();
    expect(params.get('merchant')).toBeNull();
  });

  it('clearParams (without replaceParams) drops recipient and pay but keeps other location keys', async () => {
    // Exercises the else-branch of ContinueToPaymentProbe — the only real clearParams coverage.
    const router = createMemoryRouter(
      [
        { path: '/invoice', element: <ContinueToPaymentProbe /> },
        { path: '/pl', element: <PaymentLocation /> },
      ],
      { initialEntries: ['/invoice?recipient=Foo&pay=1&lightning=keepme'] },
    );

    render(<RouterProvider router={router} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    });

    await screen.findByTestId('payment-location');
    expect(router.state.location.pathname).toBe('/pl');
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get('recipient')).toBeNull();
    expect(params.get('pay')).toBeNull();
    // Payment params from the navigate call are present.
    expect(params.get('routeId')).toBe('42');
    expect(params.get('amount')).toBe('10');
    expect(params.get('message')).toBe('INV-1');
    expect(params.get('expiryDate')).toBe(EXPIRY);
    // clearParams is a blocklist: unrelated keys from the location survive.
    expect(params.get('lightning')).toBe('keepme');
    expect([...params.keys()].sort()).toEqual([
      'amount',
      'expiryDate',
      'lightning',
      'message',
      'routeId',
    ]);
  });
});

describe('useNavigation string-form replaceParams', () => {
  it('string navigate with replaceParams does not inherit location search', async () => {
    const router = createMemoryRouter(
      [
        { path: '/invoice', element: <StringNavigateProbe replaceParams /> },
        { path: '/pl', element: <PaymentLocation /> },
      ],
      { initialEntries: ['/invoice?lightning=lnurl1attacker&key=secret'] },
    );

    render(<RouterProvider router={router} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'String navigate' }));
    });

    await screen.findByTestId('payment-location');
    assertPaymentKeysOnly(router);
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get('lightning')).toBeNull();
    expect(params.get('key')).toBeNull();
  });
});
