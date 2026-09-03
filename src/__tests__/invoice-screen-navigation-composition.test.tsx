// Composition: real InvoiceScreen + real useNavigation (not mocked).
// A printed invoice URL with lightning/merchant must not carry those keys onto /pl.

const mockGetPaymentRecipient = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  Utils: {
    createRules: (rules: Record<string, unknown>) => rules,
  },
  Validations: {
    get Required() {
      return { required: { value: true, message: 'required' } };
    },
  },
  usePaymentRoutes: () => ({ getPaymentRecipient: mockGetPaymentRecipient }),
}));

jest.mock('@dfx.swiss/react-components', () => {
  // babel-plugin-jest-hoist moves this factory above imports; require React/hook-form here.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Controller } = require('react-hook-form');

  function enrich(elements: unknown, control: unknown, rules?: Record<string, unknown>): unknown {
    if (!elements) return elements;
    return React.Children.map(elements, (element: unknown) => {
      if (!React.isValidElement(element)) return element;
      const props: { name?: string; children?: unknown } = element.props as {
        name?: string;
        children?: unknown;
      };
      const newChildren = enrich(props.children, control, rules);
      if (props.name) {
        return React.cloneElement(element, {
          control,
          rules: rules ? rules[props.name] : undefined,
          children: newChildren,
        });
      }
      return React.cloneElement(element, { children: newChildren });
    });
  }

  return {
    DfxIcon: () => null,
    Form: ({
      children,
      control,
      rules,
    }: {
      children: React.ReactNode;
      control: unknown;
      rules?: Record<string, unknown>;
    }) => <div>{enrich(children, control, rules)}</div>,
    IconColor: { BLUE: 'blue' },
    IconSize: { MD: 'md' },
    IconVariant: { CHECK: 'check' },
    SpinnerSize: { SM: 'sm' },
    StyledLoadingSpinner: () => <span role="status">loading</span>,
    StyledButton: ({
      label,
      onClick,
      disabled,
      isLoading,
    }: {
      label: string;
      onClick?: () => void;
      disabled?: boolean;
      isLoading?: boolean;
    }) => (
      <button type="button" onClick={onClick} disabled={disabled} data-is-loading={isLoading ? 'true' : 'false'}>
        {label}
      </button>
    ),
    StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
    StyledButtonWidth: { FULL: 'full' },
    StyledInput: React.forwardRef(function StyledInput(
      {
        control,
        name,
        label,
        placeholder,
        disabled,
        type,
        rules,
        autocomplete,
      }: {
        control?: unknown;
        name: string;
        label?: string;
        placeholder?: string;
        disabled?: boolean;
        type?: string;
        rules?: unknown;
        autocomplete?: string;
      },
      ref: React.Ref<HTMLInputElement>,
    ) {
      return (
        <Controller
          control={control}
          name={name}
          rules={rules}
          render={({
            field,
            fieldState,
          }: {
            field: { value?: string; onChange: (v: string) => void; onBlur: () => void };
            fieldState: { error?: { message?: string } };
          }) => (
            <div>
              {label ? <label htmlFor={name}>{label}</label> : null}
              <input
                id={name}
                ref={ref}
                name={name}
                type={type}
                autoComplete={autocomplete}
                placeholder={placeholder}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value)}
                onBlur={field.onBlur}
                disabled={disabled}
              />
              {fieldState.error?.message ? <span role="alert">{fieldState.error.message}</span> : null}
            </div>
          )}
        />
      );
    }),
    StyledLink: ({ label }: { label: string }) => <span>{label}</span>,
    StyledVerticalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

jest.mock('../components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('../components/payment/qr-code', () => ({
  QrBasic: () => <div data-testid="qr-basic" />,
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, key: string) => key,
    translateError: (key: string) => key,
  }),
}));

jest.mock('../hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

// Immediate debounce so recipient/payment validation does not leave a 500ms timer open.
jest.mock('../hooks/debounce.hook', () => ({
  __esModule: true,
  default: (value: unknown) => value,
}));

jest.mock('copy-to-clipboard', () => jest.fn());

jest.mock('react-i18next', () => ({
  Trans: ({ defaults }: { defaults?: string }) => <span data-testid="recipient-error">{defaults}</span>,
}));

jest.mock('../config/api', () => ({
  Api: { url: 'https://api.example.com', version: 'v1' },
}));

// Real useNavigation reads this context; do not mock the hook itself.
jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({
    redirectPath: undefined,
    setRedirectPath: jest.fn(),
  }),
}));

process.env.REACT_APP_PUBLIC_URL = 'https://app.example.com';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { addYears } from 'date-fns';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import InvoiceScreen from '../screens/invoice.screen';

const HIJACK_PATH = '/invoice?recipient=42&pay=1&lightning=lnurl1attacker&merchant=evil';
const PAYMENT_KEYS = ['amount', 'expiryDate', 'message', 'routeId'];

function PaymentLocation() {
  const { pathname, search } = useLocation();
  return (
    <div data-testid="payment-location">
      {pathname}
      {search}
    </div>
  );
}

function renderInvoice(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/invoice', element: <InvoiceScreen /> },
      { path: '/pl', element: <PaymentLocation /> },
    ],
    { initialEntries: [path] },
  );
  const view = render(<RouterProvider router={router} />);
  return { router, ...view };
}

async function fillInvoiceFields(invoiceId = 'INV-1', amount = '10') {
  const invoiceInput = document.getElementById('invoiceId') as HTMLInputElement;
  const amountInput = document.getElementById('amount') as HTMLInputElement;
  await act(async () => {
    fireEvent.change(invoiceInput, { target: { value: invoiceId } });
    fireEvent.blur(invoiceInput);
    fireEvent.change(amountInput, { target: { value: amount } });
    fireEvent.blur(amountInput);
  });
}

describe('InvoiceScreen + useNavigation composition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetPaymentRecipient.mockResolvedValue({ currency: { name: 'CHF' } });
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({}),
    }) as jest.Mock;
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('Continue to payment from a hijack query reaches /pl with only the payment keys', async () => {
    const { router } = renderInvoice(HIJACK_PATH);

    await waitFor(() => {
      expect(mockGetPaymentRecipient).toHaveBeenCalledWith('42');
    });
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Invoice number' })).not.toBeDisabled();
    });

    await fillInvoiceFields('INV-1', '10');

    const button = await screen.findByRole('button', { name: 'Continue to payment' });
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });

    const before = new URLSearchParams(router.state.location.search);
    expect(before.get('lightning')).toBe('lnurl1attacker');
    expect(before.get('merchant')).toBe('evil');
    expect(router.state.location.pathname).toBe('/invoice');

    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.getByTestId('payment-location')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/pl');
    const search = router.state.location.search;
    expect(search.startsWith('?')).toBe(true);
    expect(search.slice(1).includes('?')).toBe(false);

    const params = new URLSearchParams(search);
    expect(params.get('routeId')).toBe('42');
    expect(params.get('amount')).toBe('10');
    expect(params.get('message')).toBe('INV-1');
    const expiryDate = params.get('expiryDate');
    expect(expiryDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Math.abs(Date.parse(expiryDate as string) - addYears(new Date(), 1).getTime())).toBeLessThan(60_000);
    expect([...params.keys()].sort()).toEqual(PAYMENT_KEYS);

    const locationText = screen.getByTestId('payment-location').textContent ?? '';
    expect(locationText.startsWith('/pl')).toBe(true);
    const rendered = new URLSearchParams(locationText.slice('/pl'.length));
    expect([...rendered.keys()].sort()).toEqual(PAYMENT_KEYS);
  });
});
