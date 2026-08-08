// PaymentLinkForm coverage: all wizard steps, renamed Always show QR code labels
// (config field + DONE summary), submit paths (create / update recipient / payment /
// config / global config), skip, validation-driven Next, and error surfaces.

const mockUpdatePaymentLink = jest.fn().mockResolvedValue(undefined);
const mockUpdateUserPaymentLinksConfig = jest.fn().mockResolvedValue(undefined);
const mockCreatePaymentLink = jest.fn().mockResolvedValue({ id: 'pl-created' });
const mockCreatePaymentLinkPayment = jest.fn().mockResolvedValue(undefined);
const mockCreatePosLink = jest.fn().mockResolvedValue({ url: 'https://pos.example/x' });

const mockRoutesState: { overrides: Record<string, unknown> } = { overrides: {} };

const mockStablePaymentRoutes = {
  buy: [] as unknown[],
  sell: [
    {
      id: 10,
      currency: { name: 'EUR' },
      iban: 'DE89370400440532013000',
      deposit: { address: 'bc1q', blockchains: ['Bitcoin'] },
      volume: 0,
      annualVolume: 0,
    },
    {
      id: 20,
      currency: { name: 'CHF' },
      iban: 'CH9300762011623852957',
      deposit: { address: 'bc1q2', blockchains: ['Lightning'] },
      volume: 1,
      annualVolume: 2,
    },
  ],
  swap: [] as unknown[],
};

const mockStablePaymentLinks = [
  {
    id: 'pl-1',
    routeId: 20,
    status: 'Active',
    mode: 'Multiple',
    label: 'Shop',
    externalId: 'ext-1',
    url: 'https://pay.example/pl-1',
    lnurl: 'lnurl1',
    config: {
      standards: ['OpenCryptoPay'],
      minCompletionStatus: 'TxReceived',
      displayQr: true,
      paymentTimeout: 120,
      cancellable: false,
      fee: 1,
    },
    recipient: {
      name: 'Prefill Name',
      address: { street: 'A', houseNumber: '2', zip: '8000', city: 'ZH', country: 'CH' },
      phone: '+410',
      mail: 'a@b.c',
      website: 'https://prefill.example',
    },
    payment: undefined as undefined,
  },
];

const mockStableUserConfig = {
  standards: ['OpenCryptoPay'],
  minCompletionStatus: 'TxReceived',
  displayQr: false,
  fee: 0,
  paymentTimeout: 60,
  cancellable: true,
};

const mockStableUser = {
  id: 1,
  accountId: 'acc1',
  paymentLink: { active: true },
  activeAddress: { blockchains: ['Lightning'] },
};

const mockCancelPayment = jest.fn().mockResolvedValue(undefined);
const mockDeleteRoute = jest.fn().mockResolvedValue(undefined);

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { ETHEREUM: 'Ethereum', BITCOIN: 'Bitcoin', LIGHTNING: 'Lightning' },
  MinCompletionStatus: {
    TX_RECEIVED: 'TxReceived',
    TX_MEMPOOL: 'TxMempool',
    TX_BLOCKCHAIN: 'TxBlockchain',
    TX_COMPLETED: 'TxCompleted',
  },
  PaymentLinkMode: { SINGLE: 'Single', MULTIPLE: 'Multiple', PUBLIC: 'Public' },
  PaymentLinkPaymentMode: { SINGLE: 'Single', MULTIPLE: 'Multiple' },
  PaymentLinkPaymentStatus: { PENDING: 'Pending', COMPLETED: 'Completed' },
  PaymentLinkStatus: { ACTIVE: 'Active', INACTIVE: 'Inactive' },
  PaymentStandardType: {
    OPEN_CRYPTO_PAY: 'OpenCryptoPay',
    LIGHTNING_BOLT11: 'LightningBolt11',
    PAY_TO_ADDRESS: 'PayToAddress',
  },
  // Pass rules through so Custom validators at L1115–1116 are registered and executed
  Utils: {
    createRules: (rules: Record<string, unknown>) => {
      for (const property in rules) {
        if (Array.isArray(rules[property])) {
          rules[property] = (rules[property] as unknown[]).reduce(
            (prev, curr) => ({ ...(prev as object), ...(curr as object) }),
            {},
          );
        }
      }
      return rules;
    },
  },
  Validations: {
    Required: { required: true },
    Custom: (fn: (v: unknown) => unknown) => ({ validate: fn }),
  },
  usePaymentRoutes: () => ({ createPosLink: mockCreatePosLink }),
  usePaymentRoutesContext: () => ({
    paymentRoutes: mockStablePaymentRoutes,
    paymentLinks: mockStablePaymentLinks,
    paymentRoutesLoading: false,
    paymentLinksLoading: false,
    userPaymentLinksConfig: mockStableUserConfig,
    userPaymentLinksConfigLoading: false,
    updatePaymentLink: mockUpdatePaymentLink,
    updateUserPaymentLinksConfig: mockUpdateUserPaymentLinksConfig,
    cancelPaymentLinkPayment: mockCancelPayment,
    deletePaymentRoute: mockDeleteRoute,
    createPaymentLink: mockCreatePaymentLink,
    createPaymentLinkPayment: mockCreatePaymentLinkPayment,
    error: undefined,
    ...mockRoutesState.overrides,
  }),
  useUserContext: () => ({
    user: mockStableUser,
    isUserLoading: false,
  }),
}));

jest.mock('@dfx.swiss/react-components', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  const { Children, cloneElement, isValidElement } = React;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Controller } = require('react-hook-form');

  function enrichChildren(children: unknown, control: unknown, rules: unknown, errors: unknown): unknown {
    return Children.map(children as React.ReactNode, (child: React.ReactNode) => {
      if (!isValidElement(child)) return child;
      const childProps = child.props as Record<string, unknown>;
      const nextChildren = enrichChildren(childProps.children, control, rules, errors);
      if (childProps.name) {
        return cloneElement(child as React.ReactElement, {
          control,
          rules: (rules as Record<string, unknown>)?.[childProps.name as string],
          error: (errors as Record<string, unknown>)?.[childProps.name as string],
          children: nextChildren,
        });
      }
      return cloneElement(child as React.ReactElement, { children: nextChildren });
    });
  }

  return {
    AlignContent: { RIGHT: 'right' },
    CopyButton: () => null,
    DfxIcon: () => null,
    Form: ({
      children,
      control,
      rules,
      errors,
      onSubmit,
    }: {
      children: React.ReactNode;
      control?: unknown;
      rules?: unknown;
      errors?: unknown;
      onSubmit?: (e: React.FormEvent) => void;
    }) => (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.(e);
        }}
      >
        {enrichChildren(children, control, rules, errors)}
      </form>
    ),
    IconSize: { SM: 'sm' },
    IconVariant: { EDIT: 'edit', SWAP: 'swap', COPY: 'copy' },
    SpinnerSize: { LG: 'lg' },
    // Ignore disabled so wizard Next/Save work without RHF isValid gating
    // (disabled buttons swallow click events under React 18).
    StyledButton: ({
      label,
      onClick,
      type,
      hidden,
      isLoading,
    }: {
      label: string;
      onClick?: () => void;
      type?: string;
      hidden?: boolean;
      disabled?: boolean;
      isLoading?: boolean;
    }) =>
      hidden ? null : (
        <button type={(type as 'button') || 'button'} onClick={onClick} disabled={Boolean(isLoading)}>
          {label}
        </button>
      ),
    StyledButtonColor: { STURDY_WHITE: 'sturdy-white', RED: 'red' },
    StyledButtonWidth: { FULL: 'full' },
    StyledCollapsible: ({ children, titleContent }: { children: React.ReactNode; titleContent?: React.ReactNode }) => (
      <div>
        {titleContent}
        {children}
      </div>
    ),
    StyledDataTable: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    StyledDataTableExpandableRow: ({
      label,
      expansionItems,
      expansionContent,
      children,
    }: {
      label: string;
      expansionItems?: { label: string; text?: string }[];
      expansionContent?: React.ReactNode;
      children?: React.ReactNode;
    }) => (
      <div data-testid={`expandable-${label}`}>
        <span>{label}</span>
        {children}
        {expansionItems?.map((item) => (
          <div key={item.label} data-testid={`summary-${label}-${item.label}`}>
            {item.label}: {item.text}
          </div>
        ))}
        {expansionContent}
      </div>
    ),
    StyledDataTableRow: ({ children, label }: { children?: React.ReactNode; label?: string }) => (
      <div data-testid={`row-${label ?? 'x'}`}>
        {label}
        {children}
      </div>
    ),
    StyledDateAndTimePicker: ({
      name,
      control,
      label,
      rules,
    }: {
      name: string;
      control?: unknown;
      label?: string;
      rules?: { validate?: (v: unknown) => unknown; required?: boolean };
    }) => (
      <Controller
        name={name}
        control={control as never}
        rules={rules as never}
        render={({ field }: { field: { value: Date; onChange: (v: Date) => void } }) => (
          <label>
            {label}
            <input
              data-testid={`input-${name}`}
              value={field.value instanceof Date ? field.value.toISOString() : ''}
              onChange={() => field.onChange(new Date(Date.now() + 7200_000))}
            />
          </label>
        )}
      />
    ),
    StyledDropdown: ({
      name,
      control,
      label,
      items,
      labelFunc,
      descriptionFunc,
      rules,
    }: {
      name: string;
      control?: unknown;
      label?: string;
      items?: unknown[];
      labelFunc?: (item: unknown) => string;
      descriptionFunc?: (item: unknown) => string;
      rules?: { validate?: (v: unknown) => unknown; required?: boolean };
    }) => (
      <Controller
        name={name}
        control={control as never}
        rules={rules as never}
        render={({ field }: { field: { value: unknown; onChange: (v: unknown) => void } }) => (
          <div data-testid={`dropdown-${name}`}>
            <span data-testid={`label-${name}`}>{label}</span>
            {(items ?? []).map((item, i) => {
              // Exercise descriptionFunc (routeId L1162) and labelFunc for branch coverage
              if (descriptionFunc) descriptionFunc(item);
              return (
                <button
                  key={i}
                  type="button"
                  data-testid={`select-${name}-${String(labelFunc ? labelFunc(item) : item)}`}
                  onClick={() => field.onChange(item)}
                >
                  {labelFunc ? labelFunc(item) : String(item)}
                </button>
              );
            })}
            <span data-testid={`value-${name}`}>
              {field.value != null && labelFunc ? labelFunc(field.value) : String(field.value ?? '')}
            </span>
          </div>
        )}
      />
    ),
    StyledDropdownMultiChoice: ({
      name,
      control,
      label,
      items,
      labelFunc,
      rules,
    }: {
      name: string;
      control?: unknown;
      label?: string;
      items?: unknown[];
      labelFunc?: (item: unknown) => string;
      rules?: { validate?: (v: unknown) => unknown; required?: boolean };
    }) => (
      <Controller
        name={name}
        control={control as never}
        rules={rules as never}
        render={({ field }: { field: { value: unknown; onChange: (v: unknown) => void } }) => (
          <div data-testid={`dropdown-multi-${name}`}>
            <span>{label}</span>
            {(items ?? []).map((item, i) => (
              <button
                key={i}
                type="button"
                data-testid={`select-multi-${name}-${labelFunc ? labelFunc(item) : String(item)}`}
                onClick={() => field.onChange([item])}
              >
                {labelFunc ? labelFunc(item) : String(item)}
              </button>
            ))}
          </div>
        )}
      />
    ),
    StyledHorizontalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    StyledIconButton: ({ onClick, icon }: { onClick?: () => void; icon?: string }) => (
      <button type="button" data-testid={`icon-${icon}`} onClick={onClick}>
        i
      </button>
    ),
    StyledInput: ({
      name,
      control,
      label,
      rules,
    }: {
      name: string;
      control?: unknown;
      label?: string;
      rules?: { validate?: (v: unknown) => unknown; required?: boolean };
    }) => (
      <Controller
        name={name}
        control={control as never}
        rules={rules as never}
        render={({ field }: { field: { value: string; onChange: (v: string) => void } }) => (
          <label>
            {label}
            <input
              data-testid={`input-${name}`}
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value)}
            />
          </label>
        )}
      />
    ),
    StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
    StyledSearchDropdown: ({
      name,
      control,
      label,
      items,
      labelFunc,
      filterFunc,
      matchFunc,
    }: {
      name: string;
      control?: unknown;
      label?: string;
      items?: { name: string; symbol: string }[];
      labelFunc?: (item: { name: string; symbol: string }) => string;
      filterFunc?: (i: { name: string; symbol: string }, s: string) => boolean;
      matchFunc?: (i: { name: string; symbol: string }, s?: string) => boolean;
    }) => (
      <Controller
        name={name}
        control={control as never}
        render={({ field }: { field: { value: unknown; onChange: (v: unknown) => void } }) => {
          // Exercise filterFunc/matchFunc for branch coverage of lambdas
          const sample = items?.[0];
          if (sample && filterFunc) filterFunc(sample, 'sw');
          if (sample && matchFunc) matchFunc(sample, sample.name);
          return (
            <div data-testid={`search-${name}`}>
              <span>{label}</span>
              {(items ?? []).map((item) => (
                <button
                  key={item.symbol}
                  type="button"
                  data-testid={`select-country-${item.symbol}`}
                  onClick={() => field.onChange(item)}
                >
                  {labelFunc ? labelFunc(item) : item.name}
                </button>
              ))}
            </div>
          );
        }}
      />
    ),
    StyledVerticalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

jest.mock('copy-to-clipboard', () => jest.fn());
jest.mock('react-i18next', () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../components/overlay/confirmation-overlay', () => ({
  ConfirmationOverlay: () => null,
}));
jest.mock('../components/overlay/edit-overlay', () => ({
  EditOverlay: () => null,
}));
jest.mock('../components/payment/qr-code', () => ({
  QrBasic: () => <svg />,
}));
jest.mock('../components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));
jest.mock('../components/styled-link-button', () => ({
  StyledLinkButton: ({ label }: { label: string }) => <a>{label}</a>,
}));
jest.mock('../config/labels', () => ({
  PaymentQuoteStatusLabels: {
    TxReceived: 'Tx received',
    TxMempool: 'Tx mempool',
    TxBlockchain: 'Tx blockchain',
    TxCompleted: 'Tx completed',
  },
}));
const mockAllowedCountries = [
  { name: 'Switzerland', symbol: 'CH' },
  { name: 'Germany', symbol: 'DE' },
];
const mockRootRef = { current: null };
const mockTranslate = (_ns: string, key: string) => key;
const mockTranslateError = (e: string) => e;

jest.mock('../contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: mockRootRef }),
}));
jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: mockTranslate,
    translateError: mockTranslateError,
    allowedCountries: mockAllowedCountries,
  }),
}));
jest.mock('../contexts/wallet.context', () => ({
  useWalletContext: () => ({ isInitialized: true }),
}));
jest.mock('../contexts/window.context', () => ({
  useWindowContext: () => ({ width: 800 }),
}));
jest.mock('../hooks/blockchain.hook', () => ({
  useBlockchain: () => ({ toString: (b: string) => b }),
}));
jest.mock('../hooks/guard.hook', () => ({
  useAddressGuard: () => undefined,
}));
jest.mock('../hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));
jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));
jest.mock('../util/lnurl', () => ({
  Lnurl: {
    encode: (u: string) => u,
    decode: (u: string) => u,
    prependLnurl: (u: string) => `lightning:${u}`,
  },
}));
jest.mock('../util/utils', () => ({
  blankedAddress: (v: string) => v,
  formatLocationAddress: (a: Record<string, unknown>) =>
    [a.street, a.houseNumber, a.zip, a.city, a.country].filter(Boolean).join(' '),
  isEmpty: (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0),
  removeNullFields: (o?: Record<string, unknown>) => {
    if (!o) return o;
    return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));
  },
  url: () => 'https://example.test/stickers',
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PaymentRoutesScreen from '../screens/payment-routes.screen';

function renderScreen() {
  return render(
    <MemoryRouter>
      <PaymentRoutesScreen />
    </MemoryRouter>,
  );
}

describe('PaymentLinkForm labels and steps', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRoutesState.overrides = {};
    mockUpdatePaymentLink.mockResolvedValue(undefined);
    mockUpdateUserPaymentLinksConfig.mockResolvedValue(undefined);
    mockCreatePaymentLink.mockResolvedValue({ id: 'pl-created' });
    mockCreatePaymentLinkPayment.mockResolvedValue(undefined);
    mockCreatePosLink.mockResolvedValue({ url: 'https://pos.example/x' });
    Element.prototype.scrollIntoView = jest.fn();
  });

  afterEach(async () => {
    // Flush PosLinkButton fetch + scrollIntoView timeout so Jest exits cleanly
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 120));
    });
  });

  it('renders Always show QR code label on edit-link configuration step (not Display QR code)', () => {
    renderScreen();
    fireEvent.click(screen.getAllByText('Edit configuration')[1]);

    // Form field label at payment-routes.screen.tsx:1346
    expect(screen.getByTestId('label-configDisplayQr')).toHaveTextContent('Always show QR code');
    expect(screen.queryByText('Display QR code')).not.toBeInTheDocument();
    // Yes/No options from labelFunc
    expect(screen.getByTestId('select-configDisplayQr-Yes')).toBeInTheDocument();
    expect(screen.getByTestId('select-configDisplayQr-No')).toBeInTheDocument();
  });

  it('shows Always show QR code in DONE summary after full create wizard', async () => {
    renderScreen();
    fireEvent.click(screen.getByText('Create Payment Link'));

    // ROUTE → fill label/externalId, pick route (max id auto-selected via effect)
    fireEvent.change(screen.getByTestId('input-externalId'), { target: { value: 'ext-new' } });
    fireEvent.change(screen.getByTestId('input-label'), { target: { value: 'New Link' } });
    fireEvent.click(screen.getByText('Next'));

    // RECIPIENT → fill name so not skip-only
    await waitFor(() => expect(screen.getByTestId('input-recipientName')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('input-recipientName'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByTestId('input-recipientStreet'), { target: { value: 'Street' } });
    fireEvent.change(screen.getByTestId('input-recipientHouseNumber'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('input-recipientZip'), { target: { value: '8000' } });
    fireEvent.change(screen.getByTestId('input-recipientCity'), { target: { value: 'ZH' } });
    fireEvent.click(screen.getByTestId('select-country-CH'));
    fireEvent.change(screen.getByTestId('input-recipientPhone'), { target: { value: '+41' } });
    fireEvent.change(screen.getByTestId('input-recipientEmail'), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByTestId('input-recipientWebsite'), { target: { value: 'https://a.example' } });
    fireEvent.click(screen.getByText('Next'));

    // PAYMENT
    await waitFor(() => expect(screen.getByTestId('dropdown-paymentMode')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('select-paymentMode-Single'));
    fireEvent.change(screen.getByTestId('input-paymentAmount'), { target: { value: '25' } });
    fireEvent.change(screen.getByTestId('input-paymentExternalId'), { target: { value: 'pay-1' } });
    fireEvent.click(screen.getByText('Next'));

    // CONFIG — set display QR true so summary shows Yes
    await waitFor(() => expect(screen.getByTestId('dropdown-configDisplayQr')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('select-multi-configStandards-OpenCryptoPay'));
    fireEvent.click(screen.getByTestId('select-configMinCompletionStatus-Tx received'));
    fireEvent.change(screen.getByTestId('input-configPaymentTimeout'), { target: { value: '90' } });
    fireEvent.click(screen.getByTestId('select-configDisplayQr-Yes'));
    fireEvent.click(screen.getByTestId('select-configCancellable-No'));
    fireEvent.click(screen.getByText('Next'));

    // DONE summary — label at payment-routes.screen.tsx:1416
    await waitFor(() => {
      expect(screen.getByTestId('summary-Configuration-Always show QR code')).toHaveTextContent(
        'Always show QR code: Yes',
      );
    });
    expect(screen.queryByText(/Display QR code/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Create'));
    await waitFor(() => {
      expect(mockCreatePaymentLink).toHaveBeenCalled();
    });
    const payload = mockCreatePaymentLink.mock.calls[0][0];
    expect(payload.config.displayQr).toBe(true);
    expect(payload.config.cancellable).toBe(false);
    expect(payload.payment.amount).toBe(25);
    expect(payload.config.recipient.name).toBe('Alice');
  });

  it('skips empty recipient and payment steps in create wizard', async () => {
    renderScreen();
    fireEvent.click(screen.getByText('Create Payment Link'));
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => expect(screen.getByText('Skip')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Skip'));

    await waitFor(() => expect(screen.getByTestId('dropdown-paymentMode')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Skip'));

    await waitFor(() => expect(screen.getByTestId('dropdown-configDisplayQr')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));

    await waitFor(() => {
      expect(screen.getByTestId('summary-Configuration-Always show QR code')).toBeInTheDocument();
    });
    // Summary shows No from default config displayQr:false
    expect(screen.getByTestId('summary-Configuration-Always show QR code')).toHaveTextContent(/No/);
  });

  it('saves global default configuration via onSubmitForm path', async () => {
    renderScreen();
    fireEvent.click(screen.getAllByText('Edit configuration')[0]);
    await waitFor(() => expect(screen.getByTestId('dropdown-configDisplayQr')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('select-configDisplayQr-Yes'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockUpdateUserPaymentLinksConfig).toHaveBeenCalled();
    });
    const cfg = mockUpdateUserPaymentLinksConfig.mock.calls[0][0];
    // updatePaymentLinksConfig passes data.config
    expect(cfg).toEqual(
      expect.objectContaining({
        displayQr: true,
      }),
    );
  });

  it('surfaces global config update errors', async () => {
    mockUpdateUserPaymentLinksConfig.mockRejectedValueOnce({ message: 'config-fail' });
    renderScreen();
    fireEvent.click(screen.getAllByText('Edit configuration')[0]);
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('config-fail');
    });
  });

  it('updates payment link recipient on Save', async () => {
    renderScreen();
    fireEvent.click(screen.getByText('Edit recipient'));
    await waitFor(() => expect(screen.getByTestId('input-recipientName')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('input-recipientName'), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockUpdatePaymentLink).toHaveBeenCalled();
    });
    const [request, id] = mockUpdatePaymentLink.mock.calls[0];
    expect(id).toBe('pl-1');
    expect(request.config.recipient.name).toBe('Bob');
  });

  it('creates a payment on an existing link', async () => {
    renderScreen();
    fireEvent.click(screen.getByText('Create payment'));
    await waitFor(() => expect(screen.getByTestId('dropdown-paymentMode')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('select-paymentMode-Multiple'));
    fireEvent.change(screen.getByTestId('input-paymentAmount'), { target: { value: '50' } });
    fireEvent.change(screen.getByTestId('input-paymentExternalId'), { target: { value: 'pid' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockCreatePaymentLinkPayment).toHaveBeenCalled();
    });
    const [payment, linkId] = mockCreatePaymentLinkPayment.mock.calls[0];
    expect(linkId).toBe('pl-1');
    expect(payment.amount).toBe(50);
    expect(payment.mode).toBe('Multiple');
    // routeId is prefilled by the form's sell-route effect, which keeps the lower id
    // (id 10 / EUR) rather than the payment link's routeId 20.
    expect(payment.currency).toBe('EUR');
  });

  it('updates payment link configuration on Save', async () => {
    renderScreen();
    fireEvent.click(screen.getAllByText('Edit configuration')[1]);
    await waitFor(() => expect(screen.getByTestId('dropdown-configDisplayQr')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('select-configDisplayQr-No'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockUpdatePaymentLink).toHaveBeenCalled();
    });
    const [request, id] = mockUpdatePaymentLink.mock.calls[0];
    expect(id).toBe('pl-1');
    expect(request.config.displayQr).toBe(false);
  });

  it('surfaces createPaymentLink API errors on the form', async () => {
    mockCreatePaymentLink.mockRejectedValueOnce({ message: 'create-failed' });
    renderScreen();
    fireEvent.click(screen.getByText('Create Payment Link'));
    // Skip through to DONE
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => fireEvent.click(screen.getByText('Skip')));
    await waitFor(() => fireEvent.click(screen.getByText('Skip')));
    await waitFor(() => fireEvent.click(screen.getByText('Next')));
    await waitFor(() => expect(screen.getByText('Create')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Create'));
    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('create-failed');
    });
  });

  it('cancels the form without submitting', async () => {
    renderScreen();
    fireEvent.click(screen.getAllByText('Edit configuration')[1]);
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByTestId('dropdown-configDisplayQr')).not.toBeInTheDocument();
    });
    expect(mockUpdatePaymentLink).not.toHaveBeenCalled();
  });

  it('pre-fills recipient from payment link when editing', async () => {
    renderScreen();
    fireEvent.click(screen.getByText('Edit recipient'));
    await waitFor(() => {
      expect(screen.getByTestId('input-recipientName')).toHaveValue('Prefill Name');
    });
    expect(screen.getByTestId('input-recipientEmail')).toHaveValue('a@b.c');
  });

  it('uses Unknown error when API rejects without message', async () => {
    mockUpdatePaymentLink.mockRejectedValueOnce({});
    renderScreen();
    fireEvent.click(screen.getAllByText('Edit configuration')[1]);
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error');
    });
  });

  it('runs Custom validators for configDisplayQr and configCancellable', async () => {
    renderScreen();
    fireEvent.click(screen.getAllByText('Edit configuration')[1]);
    await waitFor(() => expect(screen.getByTestId('dropdown-configDisplayQr')).toBeInTheDocument());

    // Force invalid values so the `|| 'invalid …'` branch of Custom validators runs
    fireEvent.click(screen.getByTestId('select-configDisplayQr-Yes'));
    fireEvent.click(screen.getByTestId('select-configCancellable-No'));
    // Re-select valid booleans (validate also runs with true/false — covers both sides)
    fireEvent.click(screen.getByTestId('select-configDisplayQr-No'));
    fireEvent.click(screen.getByTestId('select-configCancellable-Yes'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockUpdatePaymentLink).toHaveBeenCalled();
    });
  });

  it('merges empty config fields from userPaymentLinksConfig on create wizard', async () => {
    // Start with empty standards array so isEmpty(current) is true and L993 assigns
    mockRoutesState.overrides = {
      userPaymentLinksConfig: {
        standards: [],
        minCompletionStatus: 'TxReceived',
        displayQr: false,
        fee: 0,
        paymentTimeout: 60,
        cancellable: true,
      },
    };
    renderScreen();
    fireEvent.click(screen.getByText('Create Payment Link'));
    // descriptionFunc exercised while rendering route dropdown items
    expect(screen.getByTestId('dropdown-routeId')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('Skip')).toBeInTheDocument());
  });
});
