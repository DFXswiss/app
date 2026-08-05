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

  function enrich(elements: unknown, control: unknown): unknown {
    if (!elements) return elements;
    return React.Children.map(elements, (element: unknown) => {
      if (!React.isValidElement(element)) return element;
      const props: { name?: string; children?: unknown } = element.props as {
        name?: string;
        children?: unknown;
      };
      const newChildren = enrich(props.children, control);
      if (props.name) {
        return React.cloneElement(element, { control, children: newChildren });
      }
      return React.cloneElement(element, { children: newChildren });
    });
  }

  return {
    DfxIcon: () => null,
    Form: ({ children, control }: { children: React.ReactNode; control: unknown }) => (
      <div>{enrich(children, control)}</div>
    ),
    IconColor: { BLUE: 'blue' },
    IconSize: { MD: 'md' },
    IconVariant: { CHECK: 'check' },
    StyledButton: ({ label, onClick }: { label: string; onClick?: () => void }) => (
      <button type="button" onClick={onClick}>
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
      }: {
        control?: unknown;
        name: string;
        label?: string;
        placeholder?: string;
      },
      ref: React.Ref<HTMLInputElement>,
    ) {
      return (
        <Controller
          control={control}
          name={name}
          render={({ field }: { field: { value?: string; onChange: (v: string) => void; onBlur: () => void } }) => (
            <div>
              {label ? <label>{label}</label> : null}
              <input
                ref={ref}
                name={name}
                placeholder={placeholder}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value)}
                onBlur={field.onBlur}
              />
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
  Trans: ({ defaults }: { defaults?: string }) => <span>{defaults}</span>,
}));

// Module-level baseUrl in invoice.screen calls url() with Api.url at import time.
// Runtime url({ path: callback }) also needs REACT_APP_PUBLIC_URL as base.
jest.mock('../config/api', () => ({
  Api: { url: 'https://api.example.com', version: 'v1' },
}));

process.env.REACT_APP_PUBLIC_URL = 'https://app.example.com';

import { act, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import InvoiceScreen from '../screens/invoice.screen';

const PAYER_HINT =
  'Enter the invoice number and invoice amount exactly as printed on your invoice.';

function renderAt(path: string) {
  const router = createMemoryRouter([{ path: '/invoice', element: <InvoiceScreen /> }], {
    initialEntries: [path],
  });
  return render(<RouterProvider router={router} />);
}

function lastLayoutTitle(): string | undefined {
  const calls = mockUseLayoutOptions.mock.calls;
  if (!calls.length) return undefined;
  return (calls[calls.length - 1][0] as { title?: string } | undefined)?.title;
}

describe('InvoiceScreen payer wording (?pay)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetPaymentRecipient.mockResolvedValue({ currency: { name: 'CHF' } });
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
});
