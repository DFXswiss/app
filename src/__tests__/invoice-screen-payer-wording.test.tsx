// Maps the invoice screen URL query `pay` to merchant vs payer wording.
// translate returns the key, so assertions use the English source strings.

const mockUseLayoutOptions = jest.fn();
const mockGetPaymentRecipient = jest.fn();
const mockNavigate = jest.fn();

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

  function enrich(
    elements: unknown,
    control: unknown,
    rules?: Record<string, unknown>,
  ): unknown {
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
    }: {
      label: string;
      onClick?: () => void;
      disabled?: boolean;
    }) => (
      <button type="button" onClick={onClick} disabled={disabled}>
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
              {fieldState.error?.message ? (
                <span role="alert">{fieldState.error.message}</span>
              ) : null}
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
  useLayoutOptions: (options: unknown) => mockUseLayoutOptions(options),
}));

jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

// Immediate debounce so recipient validation does not leave a 500ms timer open.
jest.mock('../hooks/debounce.hook', () => ({
  __esModule: true,
  default: (value: unknown) => value,
}));

jest.mock('copy-to-clipboard', () => jest.fn());

jest.mock('react-i18next', () => ({
  Trans: ({ defaults }: { defaults?: string }) => <span data-testid="recipient-error">{defaults}</span>,
}));

// Module-level baseUrl in invoice.screen calls url() with Api.url at import time.
// Runtime url({ path: callback }) also needs REACT_APP_PUBLIC_URL as base.
jest.mock('../config/api', () => ({
  Api: { url: 'https://api.example.com', version: 'v1' },
}));

process.env.REACT_APP_PUBLIC_URL = 'https://app.example.com';

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import copy from 'copy-to-clipboard';
import { addYears } from 'date-fns';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import InvoiceScreen from '../screens/invoice.screen';

const mockCopy = copy as jest.MockedFunction<typeof copy>;

const PAYER_HINT =
  'Enter the invoice number and invoice amount exactly as printed on your invoice.';

const INVOICE_ERROR_DEFAULT =
  'DFX does not recognize a recipient with the name <strong>{{recipient}}</strong>. This service can only be used for recipients who have an active account with DFX and are activated for the invoicing service. If you wish to register as a recipient with DFX, please contact support at <link>{{supportLink}}</link>.';

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/invoice', element: <InvoiceScreen /> },
      { path: '/other', element: <div>other</div> },
    ],
    { initialEntries: [path] },
  );
  const view = render(<RouterProvider router={router} />);
  return { router, ...view };
}

function lastLayoutTitle(): string | undefined {
  const calls = mockUseLayoutOptions.mock.calls;
  if (!calls.length) return undefined;
  return (calls[calls.length - 1][0] as { title?: string } | undefined)?.title;
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

describe('InvoiceScreen payer wording (?pay)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetPaymentRecipient.mockResolvedValue({ currency: { name: 'CHF' } });
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({}),
    }) as jest.Mock;
  });

  afterEach(async () => {
    // Flush the screen's focus setTimeout and any pending getPaymentRecipient resolutions.
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('payer mode (?pay=1): title, field labels, button and hint use payer copy', async () => {
    renderAt('/invoice?recipient=Foo&pay=1');

    await waitFor(() => {
      expect(lastLayoutTitle()).toBe('Pay invoice');
    });

    expect(screen.getAllByText('Invoice number').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Invoice amount').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Continue to payment' })).toBeInTheDocument();
    expect(screen.getByText(PAYER_HINT)).toBeInTheDocument();
    expect(screen.getByText('Payee')).toBeInTheDocument();
    expect(screen.queryByText('Recipient')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('John Doe')).not.toBeInTheDocument();
    expect(screen.queryByTestId('qr-basic')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy Link' })).not.toBeInTheDocument();

    expect(screen.queryByText('Create Invoice')).not.toBeInTheDocument();
    expect(screen.queryByText('Invoice ID')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open invoice' })).not.toBeInTheDocument();
  });

  it('merchant mode (no pay): title, field labels and button keep merchant copy; no hint', async () => {
    renderAt('/invoice?recipient=Foo');

    await waitFor(() => {
      expect(lastLayoutTitle()).toBe('Create Invoice');
    });

    expect(screen.getAllByText('Invoice ID').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Amount').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Open invoice' })).toBeInTheDocument();
    expect(screen.queryByText(PAYER_HINT)).not.toBeInTheDocument();
    expect(screen.getByText('Recipient')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('John Doe')).toBeInTheDocument();
    expect(screen.getByTestId('qr-basic')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Link' })).toBeInTheDocument();

    expect(screen.queryByText('Pay invoice')).not.toBeInTheDocument();
    expect(screen.queryByText('Invoice number')).not.toBeInTheDocument();
    expect(screen.queryByText('Invoice amount')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue to payment' })).not.toBeInTheDocument();
  });

  it('pay=0 is treated as off: merchant copy, no hint', async () => {
    renderAt('/invoice?recipient=Foo&pay=0');

    await waitFor(() => {
      expect(lastLayoutTitle()).toBe('Create Invoice');
    });

    expect(screen.getByRole('button', { name: 'Open invoice' })).toBeInTheDocument();
    expect(screen.queryByText(PAYER_HINT)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue to payment' })).not.toBeInTheDocument();
  });

  it('pay=false is treated as off: merchant copy, no hint', async () => {
    renderAt('/invoice?recipient=Foo&pay=false');

    await waitFor(() => {
      expect(lastLayoutTitle()).toBe('Create Invoice');
    });

    expect(screen.getByRole('button', { name: 'Open invoice' })).toBeInTheDocument();
    expect(screen.queryByText(PAYER_HINT)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue to payment' })).not.toBeInTheDocument();
  });

  it('pay allowlist: only 1/true/yes (case-insensitive, trimmed) enable payer mode', async () => {
    for (const pay of ['1', 'true', 'TRUE', ' yes ', 'Yes']) {
      mockUseLayoutOptions.mockClear();
      const { unmount } = renderAt(`/invoice?recipient=Foo&pay=${encodeURIComponent(pay)}`);
      await waitFor(() => {
        expect(lastLayoutTitle()).toBe('Pay invoice');
      });
      unmount();
    }

    for (const pay of ['no', 'False', 'off', '', '2']) {
      mockUseLayoutOptions.mockClear();
      const path = pay === '' ? '/invoice?recipient=Foo&pay=' : `/invoice?recipient=Foo&pay=${pay}`;
      const { unmount } = renderAt(path);
      await waitFor(() => {
        expect(lastLayoutTitle()).toBe('Create Invoice');
      });
      unmount();
    }
  });

  it('payer mode keeps recipient and pay across remount with the same URL (reload)', async () => {
    const path = '/invoice?recipient=Foo&pay=1';
    const { router, unmount } = renderAt(path);

    await waitFor(() => {
      expect(lastLayoutTitle()).toBe('Pay invoice');
    });

    const searchAfterFirst = router.state.location.search;
    expect(new URLSearchParams(searchAfterFirst).get('pay')).toBe('1');
    expect(new URLSearchParams(searchAfterFirst).get('recipient')).toBe('Foo');

    unmount();
    mockUseLayoutOptions.mockClear();

    // Reload: remount with the URL the router still holds after the first run.
    const reloadPath = `/invoice${searchAfterFirst}`;
    renderAt(reloadPath);

    await waitFor(() => {
      expect(lastLayoutTitle()).toBe('Pay invoice');
    });
    expect(screen.getByText(PAYER_HINT)).toBeInTheDocument();
    expect(screen.getByText('Payee')).toBeInTheDocument();
  });

  it('payer mode restores payer wording after navigate away and router.navigate(-1) (back)', async () => {
    const { router } = renderAt('/invoice?recipient=Foo&pay=1');

    await waitFor(() => {
      expect(lastLayoutTitle()).toBe('Pay invoice');
    });

    await act(async () => {
      router.navigate('/other');
    });
    await waitFor(() => {
      expect(screen.getByText('other')).toBeInTheDocument();
    });

    mockUseLayoutOptions.mockClear();
    await act(async () => {
      router.navigate(-1);
    });

    await waitFor(() => {
      expect(lastLayoutTitle()).toBe('Pay invoice');
    });
    expect(screen.getByText(PAYER_HINT)).toBeInTheDocument();
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get('pay')).toBe('1');
    expect(params.get('recipient')).toBe('Foo');
  });

  it('merchant mode still clears the query string', async () => {
    const { router } = renderAt('/invoice?recipient=Foo');

    await waitFor(() => {
      expect(router.state.location.search).toBe('');
    });

    expect(lastLayoutTitle()).toBe('Create Invoice');
  });

  it('payer mode with recipient from URL shows payee as text (not an input) and still enables the button', async () => {
    renderAt('/invoice?recipient=Foo&pay=1');

    await waitFor(() => {
      expect(mockGetPaymentRecipient).toHaveBeenCalledWith('Foo');
    });

    // No editable/disabled payee input — value is plain text linked to the Payee label.
    expect(screen.queryByRole('textbox', { name: 'Payee' })).not.toBeInTheDocument();
    const payeeGroup = screen.getByRole('group', { name: 'Payee' });
    expect(payeeGroup).toHaveTextContent('Foo');

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Invoice number' })).not.toBeDisabled();
    });

    await fillInvoiceFields();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continue to payment' })).not.toBeDisabled();
    });
  });

  it('payer mode with known recipient from URL shows verification next to the payee value', async () => {
    renderAt('/invoice?recipient=Foo&pay=1');

    await waitFor(() => {
      expect(mockGetPaymentRecipient).toHaveBeenCalledWith('Foo');
    });

    const payeeGroup = screen.getByRole('group', { name: 'Payee' });
    expect(payeeGroup).toHaveTextContent('Foo');
    await waitFor(() => {
      expect(
        within(payeeGroup).getByRole('img', { name: 'Recipient verified' }),
      ).toBeInTheDocument();
    });
  });

  it('payer mode with unknown recipient from URL does not show verification', async () => {
    mockGetPaymentRecipient.mockRejectedValue(new Error('not found'));
    renderAt('/invoice?recipient=Unknown&pay=1');

    await waitFor(() => {
      expect(screen.getByTestId('recipient-error')).toBeInTheDocument();
    });

    const payeeGroup = screen.getByRole('group', { name: 'Payee' });
    expect(payeeGroup).toHaveTextContent('Unknown');
    expect(within(payeeGroup).queryByRole('img', { name: 'Recipient verified' })).not.toBeInTheDocument();
  });

  it('payer mode without recipient leaves the field editable (no empty locked field)', async () => {
    renderAt('/invoice?pay=1');

    await waitFor(() => {
      expect(lastLayoutTitle()).toBe('Pay invoice');
    });

    const recipientInput = screen.getByRole('textbox', { name: 'Payee' });
    expect(recipientInput).not.toBeDisabled();
    expect(recipientInput).toHaveValue('');
  });

  it('validatePayment success sets callback and enables the button; navigate uses payment params only', async () => {
    renderAt('/invoice?recipient=42&pay=1');

    await waitFor(() => {
      expect(mockGetPaymentRecipient).toHaveBeenCalledWith('42');
    });
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Invoice number' })).not.toBeDisabled();
    });

    await fillInvoiceFields('INV-1', '10');

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const button = await screen.findByRole('button', { name: 'Continue to payment' });
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(button);
    });

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    const [to, options] = mockNavigate.mock.calls[0];
    expect(to).toEqual(
      expect.objectContaining({
        pathname: '/pl',
      }),
    );
    const search = new URLSearchParams(to.search);
    expect(search.get('routeId')).toBe('42');
    expect(search.get('amount')).toBe('10');
    expect(search.get('message')).toBe('INV-1');
    const expiryDate = search.get('expiryDate');
    expect(expiryDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(expiryDate).not.toMatch(/\?/);
    // Screen uses addYears(new Date(), 1) — pin ~1 year ahead, not mere presence.
    expect(Math.abs(Date.parse(expiryDate as string) - addYears(new Date(), 1).getTime())).toBeLessThan(
      60_000,
    );
    expect(search.get('recipient')).toBeNull();
    expect(search.get('pay')).toBeNull();
    // Exactly the payment param set — no payer query leftovers in search string.
    expect([...search.keys()].sort()).toEqual(['amount', 'expiryDate', 'message', 'routeId']);
    expect(options).toEqual({ replaceParams: true });
  });

  it('payer mode without recipient: empty payee input is required', async () => {
    // isPayeeFromUrl is false here (no recipient in URL) — the Required rule is exercised on the
    // input branch. The display branch always has a non-empty value by construction, so
    // "Required while rendered as text" is not a producible empty-field case.
    renderAt('/invoice?pay=1');
    const payeeInput = await screen.findByRole('textbox', { name: 'Payee' });
    await act(async () => {
      fireEvent.change(payeeInput, { target: { value: '' } });
      fireEvent.blur(payeeInput);
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('required');
    });
  });

  it('disables the button when amount is cleared after payment validation (isValid)', async () => {
    renderAt('/invoice?recipient=42&pay=1');

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

    const amountInput = document.getElementById('amount') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(amountInput, { target: { value: '' } });
      fireEvent.blur(amountInput);
    });

    await waitFor(() => {
      expect(button).toBeDisabled();
    });
  });

  it('merchant mode Open invoice navigates with the same payment param set (object form)', async () => {
    renderAt('/invoice?recipient=42');

    await waitFor(() => {
      expect(lastLayoutTitle()).toBe('Create Invoice');
    });

    // Mount effect pre-fills then clears the query; recipient must still validate.
    await waitFor(() => {
      expect(mockGetPaymentRecipient).toHaveBeenCalledWith('42');
    });
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Invoice ID' })).not.toBeDisabled();
    });

    await fillInvoiceFields('INV-1', '10');

    const button = await screen.findByRole('button', { name: 'Open invoice' });
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(button);
    });

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    const [to, options] = mockNavigate.mock.calls[0];
    expect(to).toEqual(expect.objectContaining({ pathname: '/pl' }));
    const search = new URLSearchParams(to.search);
    expect(search.get('routeId')).toBe('42');
    expect(search.get('amount')).toBe('10');
    expect(search.get('message')).toBe('INV-1');
    const expiryDate = search.get('expiryDate');
    expect(expiryDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Math.abs(Date.parse(expiryDate as string) - addYears(new Date(), 1).getTime())).toBeLessThan(
      60_000,
    );
    expect(search.get('recipient')).toBeNull();
    expect(search.get('pay')).toBeNull();
    expect([...search.keys()].sort()).toEqual(['amount', 'expiryDate', 'message', 'routeId']);
    expect(options).toEqual({ replaceParams: true });
  });

  it('validatePayment response with error shows errorPayment message', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ({ error: true, message: 'Payment failed' }),
    });

    renderAt('/invoice?recipient=Foo&pay=1');
    await waitFor(() => expect(mockGetPaymentRecipient).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Invoice number' })).not.toBeDisabled();
    });
    await fillInvoiceFields();

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Payment failed');
    });
  });

  it('validatePayment response with error and no message shows Unknown Error', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ({ error: true }),
    });

    renderAt('/invoice?recipient=Foo&pay=1');
    await waitFor(() => expect(mockGetPaymentRecipient).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Invoice number' })).not.toBeDisabled();
    });
    await fillInvoiceFields();

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown Error');
    });
  });

  it('validatePayment rejected promise shows error.message', async () => {
    (global.fetch as jest.Mock).mockRejectedValue({ message: 'Network down' });

    renderAt('/invoice?recipient=Foo&pay=1');
    await waitFor(() => expect(mockGetPaymentRecipient).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Invoice number' })).not.toBeDisabled();
    });
    await fillInvoiceFields();

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Network down');
    });
  });

  it('validatePayment rejected promise without message shows Unknown Error', async () => {
    (global.fetch as jest.Mock).mockRejectedValue({});

    renderAt('/invoice?recipient=Foo&pay=1');
    await waitFor(() => expect(mockGetPaymentRecipient).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Invoice number' })).not.toBeDisabled();
    });
    await fillInvoiceFields();

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown Error');
    });
  });

  it('failed recipient validation shows the invoice error hint', async () => {
    mockGetPaymentRecipient.mockRejectedValue(new Error('not found'));

    renderAt('/invoice?recipient=Unknown&pay=1');

    await waitFor(() => {
      expect(screen.getByTestId('recipient-error')).toHaveTextContent(INVOICE_ERROR_DEFAULT);
    });
  });

  it('merchant mode Copy Link copies the full payment URL when callback is set', async () => {
    renderAt('/invoice?recipient=42');

    // Merchant effect clears query; set recipient manually.
    await waitFor(() => {
      expect(lastLayoutTitle()).toBe('Create Invoice');
    });

    const recipientInput = screen.getByRole('textbox', { name: 'Recipient' });
    await act(async () => {
      fireEvent.change(recipientInput, { target: { value: '42' } });
      fireEvent.blur(recipientInput);
    });

    await waitFor(() => {
      expect(mockGetPaymentRecipient).toHaveBeenCalledWith('42');
    });
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Invoice ID' })).not.toBeDisabled();
    });

    await fillInvoiceFields('INV-9', '25');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copy Link' })).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy Link' }));
    });

    expect(mockCopy).toHaveBeenCalledTimes(1);
    const copied = mockCopy.mock.calls[0][0] as string;
    expect(copied).toContain('https://app.example.com/pl?');
    expect(copied).toContain('routeId=42');
    expect(copied).toContain('amount=25');
    expect(copied).toContain('message=INV-9');
    expect(copied).toContain('expiryDate=');
  });

  it('uses route (not routeId) when recipient is non-numeric', async () => {
    renderAt('/invoice?recipient=AcmeCorp&pay=1');

    await waitFor(() => expect(mockGetPaymentRecipient).toHaveBeenCalledWith('AcmeCorp'));
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Invoice number' })).not.toBeDisabled();
    });
    await fillInvoiceFields();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continue to payment' })).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    });

    const [to] = mockNavigate.mock.calls[0];
    const search = new URLSearchParams(to.search);
    expect(search.get('route')).toBe('AcmeCorp');
    expect(search.get('routeId')).toBeNull();
  });
});
