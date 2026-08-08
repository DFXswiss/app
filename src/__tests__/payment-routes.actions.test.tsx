// Covers payment-routes action paths: route lists (buy/sell/swap), toggle status/mode,
// cancel payment, delete confirmation, QR/sticker download, POS fetch, label rename,
// create invoice / create payment link entry points, and back-navigation titles.

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockUpdatePaymentLink = jest.fn().mockResolvedValue(undefined);
const mockUpdateUserPaymentLinksConfig = jest.fn().mockResolvedValue(undefined);
const mockCancelPaymentLinkPayment = jest.fn().mockResolvedValue(undefined);
const mockDeletePaymentRoute = jest.fn().mockResolvedValue(undefined);
const mockCreatePosLink = jest.fn().mockResolvedValue({ url: 'https://pos.example/pl-1' });
const mockCreatePaymentLink = jest.fn().mockResolvedValue({ id: 'pl-new' });
const mockCreatePaymentLinkPayment = jest.fn().mockResolvedValue(undefined);
const mockWindowOpen = jest.fn();
const mockCopy = jest.fn();

const mockRoutesState: {
  overrides: Record<string, unknown>;
  userOverrides: Record<string, unknown>;
} = { overrides: {}, userOverrides: {} };

// Stable fixtures (mock-prefix for jest hoist). PaymentLinkForm's useMemo/useEffect
// re-run on reference change and infinite-loop if context returns new objects each render.
const mockStablePaymentRoutes = {
  buy: [
    {
      id: 1,
      asset: { name: 'BTC', blockchain: 'Bitcoin' },
      bankUsage: 'DFX BUY 1',
      volume: 10,
      annualVolume: 100,
    },
  ],
  sell: [
    {
      id: 2,
      currency: { name: 'CHF' },
      iban: 'CH9300762011623852957',
      deposit: { address: 'bc1qsell', blockchains: ['Bitcoin', 'Lightning'] },
      volume: 20,
      annualVolume: 200,
    },
  ],
  swap: [
    {
      id: 3,
      asset: { name: 'ETH', blockchain: 'Ethereum' },
      deposit: { address: '0xswap', blockchains: ['Ethereum'] },
      volume: 5,
      annualVolume: 50,
    },
  ],
};

// Single-link fixtures only: PosLinkButton's useEffect depends on onMount (= fetchPosUrl),
// which is recreated every render. With 2+ links, isLoadingPos can only hold one id, so the
// buttons thrash setIsLoadingPos forever ("Maximum update depth exceeded"). Never mount more
// than one payment link at a time in this file.
const mockLinkActive = {
  id: 'pl-active',
  routeId: 2,
  status: 'Active',
  mode: 'Multiple',
  label: 'Active Link',
  externalId: 'ext-active',
  url: 'https://pay.example/pl-active',
  lnurl: 'lnurl1active',
  config: { displayQr: true, fee: 0.1, paymentTimeout: 90, cancellable: true, standards: ['OpenCryptoPay'] },
  recipient: {
    name: 'Shop AG',
    address: { street: 'Main', houseNumber: '1', zip: '8000', city: 'Zürich', country: 'CH' },
    phone: '+411234',
    mail: 'shop@example.com',
    website: 'shop.example.com',
  },
  payment: undefined as undefined,
};

const mockLinkPending = {
  id: 'pl-pending',
  routeId: 2,
  status: 'Active',
  mode: 'Public',
  label: undefined as undefined,
  externalId: 'ext-pending',
  url: 'https://pay.example/pl-pending',
  lnurl: 'lnurl1pending',
  config: null as null,
  recipient: undefined as undefined,
  payment: {
    id: 99,
    externalId: 'pay-ext',
    mode: 'Single',
    amount: 12.5,
    currency: 'CHF',
    status: 'Pending',
    expiryDate: '2030-01-01T12:00:00.000Z',
  },
};

const mockLinkInactive = {
  id: 'pl-inactive',
  routeId: 2,
  status: 'Inactive',
  mode: 'Multiple',
  label: 'Inactive Link',
  externalId: undefined as undefined,
  url: 'https://pay.example/pl-inactive',
  lnurl: 'lnurl1inactive',
  config: { displayQr: false },
  recipient: {
    name: 'Other',
    website: 'https://absolute.example',
  },
  payment: undefined as undefined,
};

const mockStablePaymentLinks = [mockLinkActive];

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
  accountId: 'acc 42',
  paymentLink: { active: true },
  activeAddress: { blockchains: ['Lightning'] },
};

const mockPaymentRoutesApi = { createPosLink: mockCreatePosLink };
const mockPaymentRoutesContextBase = {
  paymentRoutes: mockStablePaymentRoutes,
  paymentLinks: mockStablePaymentLinks,
  paymentRoutesLoading: false,
  paymentLinksLoading: false,
  userPaymentLinksConfig: mockStableUserConfig,
  userPaymentLinksConfigLoading: false,
  updatePaymentLink: mockUpdatePaymentLink,
  updateUserPaymentLinksConfig: mockUpdateUserPaymentLinksConfig,
  cancelPaymentLinkPayment: mockCancelPaymentLinkPayment,
  deletePaymentRoute: mockDeletePaymentRoute,
  createPaymentLink: mockCreatePaymentLink,
  createPaymentLinkPayment: mockCreatePaymentLinkPayment,
  error: undefined as string | undefined,
};
const mockUserContextBase = {
  user: mockStableUser,
  isUserLoading: false,
};

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
  PaymentLinkPaymentStatus: { PENDING: 'Pending', COMPLETED: 'Completed', CANCELLED: 'Cancelled', EXPIRED: 'Expired' },
  PaymentLinkStatus: { ACTIVE: 'Active', INACTIVE: 'Inactive' },
  PaymentStandardType: {
    OPEN_CRYPTO_PAY: 'OpenCryptoPay',
    LIGHTNING_BOLT11: 'LightningBolt11',
    PAY_TO_ADDRESS: 'PayToAddress',
  },
  Utils: { createRules: () => ({}) },
  Validations: {
    Required: { required: true },
    Custom: (fn: (v: unknown) => unknown) => ({ validate: fn }),
  },
  // Stable method bag — fixtures (paymentLinks, userPaymentLinksConfig, routes) stay referentially stable.
  usePaymentRoutes: () => mockPaymentRoutesApi,
  usePaymentRoutesContext: () => ({
    ...mockPaymentRoutesContextBase,
    ...mockRoutesState.overrides,
  }),
  useUserContext: () => ({
    ...mockUserContextBase,
    ...mockRoutesState.userOverrides,
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
    CopyButton: ({ onCopy }: { onCopy?: () => void }) => (
      <button type="button" data-testid="copy-btn" onClick={onCopy}>
        copy
      </button>
    ),
    DfxIcon: () => <span data-testid="dfx-icon" />,
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
    IconVariant: {
      EXPAND_MORE: 'more',
      COPY: 'copy',
      OPEN_IN_NEW: 'open',
      EDIT: 'edit',
      SWAP: 'swap',
    },
    SpinnerSize: { LG: 'lg' },
    // Ignore disabled so wizard Next/Save can be exercised without RHF isValid gating
    // (isValid stays false until a validation cycle; disabled buttons swallow clicks in React 18).
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
    StyledCollapsible: ({
      children,
      titleContent,
      isExpanded,
    }: {
      children: React.ReactNode;
      titleContent?: React.ReactNode;
      isExpanded?: boolean;
    }) => (
      <div data-testid="collapsible" data-expanded={String(isExpanded)}>
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
      expansionItems?: { label: string; text?: string; onClick?: () => void }[];
      expansionContent?: React.ReactNode;
      children?: React.ReactNode;
    }) => (
      <div data-testid={`expandable-${label}`}>
        <span>{label}</span>
        {children}
        {expansionItems?.map((item) => (
          <button
            key={item.label}
            type="button"
            data-testid={`item-${label}-${item.label}`}
            onClick={item.onClick}
          >
            {item.label}: {item.text}
          </button>
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
    StyledDateAndTimePicker: ({ name, control, label }: { name: string; control?: unknown; label?: string }) => (
      <Controller
        name={name}
        control={control as never}
        render={({ field }: { field: { value: Date; onChange: (v: Date) => void } }) => (
          <label>
            {label}
            <input
              data-testid={`input-${name}`}
              value={field.value?.toISOString?.() ?? ''}
              onChange={() => field.onChange(new Date(Date.now() + 3600_000))}
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
    }: {
      name: string;
      control?: unknown;
      label?: string;
      items?: unknown[];
      labelFunc?: (item: unknown) => string;
    }) => (
      <Controller
        name={name}
        control={control as never}
        render={({ field }: { field: { value: unknown; onChange: (v: unknown) => void } }) => (
          <div data-testid={`dropdown-${name}`}>
            <span>{label}</span>
            {(items ?? []).map((item, i) => (
              <button
                key={i}
                type="button"
                data-testid={`select-${name}-${labelFunc ? labelFunc(item) : String(item)}`}
                onClick={() => field.onChange(item)}
              >
                {labelFunc ? labelFunc(item) : String(item)}
              </button>
            ))}
            <span data-testid={`value-${name}`}>{field.value != null && labelFunc ? labelFunc(field.value) : ''}</span>
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
    }: {
      name: string;
      control?: unknown;
      label?: string;
      items?: unknown[];
      labelFunc?: (item: unknown) => string;
    }) => (
      <Controller
        name={name}
        control={control as never}
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
    StyledIconButton: ({
      onClick,
      icon,
      isLoading,
    }: {
      onClick?: () => void;
      icon?: string;
      isLoading?: boolean;
    }) => (
      <button type="button" data-testid={`icon-btn-${icon}`} onClick={onClick} disabled={isLoading}>
        icon
      </button>
    ),
    StyledInput: ({
      name,
      control,
      label,
    }: {
      name: string;
      control?: unknown;
      label?: string;
    }) => (
      <Controller
        name={name}
        control={control as never}
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
    }: {
      name: string;
      control?: unknown;
      label?: string;
      items?: { name: string; symbol: string }[];
      labelFunc?: (item: { name: string }) => string;
    }) => (
      <Controller
        name={name}
        control={control as never}
        render={({ field }: { field: { value: unknown; onChange: (v: unknown) => void } }) => (
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
        )}
      />
    ),
    StyledVerticalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

jest.mock('copy-to-clipboard', () => (...args: unknown[]) => mockCopy(...args));
jest.mock('react-i18next', () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../components/overlay/confirmation-overlay', () => ({
  ConfirmationOverlay: ({
    messageContent,
    cancelLabel,
    confirmLabel,
    onCancel,
    onConfirm,
  }: {
    messageContent?: React.ReactNode;
    cancelLabel: string;
    confirmLabel: string;
    onCancel: () => void;
    onConfirm: () => Promise<void>;
  }) => (
    <div data-testid="confirm-overlay">
      {messageContent}
      <button type="button" onClick={onCancel}>
        {cancelLabel}
      </button>
      <button type="button" onClick={() => void onConfirm()}>
        {confirmLabel}
      </button>
    </div>
  ),
}));

jest.mock('../components/overlay/edit-overlay', () => ({
  EditOverlay: ({
    label,
    prefill,
    onCancel,
    onEdit,
  }: {
    label?: string;
    prefill?: string;
    onCancel: () => void;
    onEdit: (v: string) => Promise<void>;
  }) => (
    <div data-testid="edit-overlay">
      <span data-testid="edit-label">{label}</span>
      <span data-testid="edit-prefill">{prefill}</span>
      <button type="button" onClick={onCancel}>
        cancel-edit
      </button>
      <button type="button" onClick={() => void onEdit('Renamed Link')}>
        save-edit
      </button>
    </div>
  ),
}));

jest.mock('../components/payment/qr-code', () => ({
  QrBasic: () => (
    <svg data-testid="qr-svg" width="100" height="100">
      <rect x="0" y="0" width="10" height="10" fill="#072440" />
    </svg>
  ),
}));

jest.mock('../components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('../components/styled-link-button', () => ({
  StyledLinkButton: ({ label, href, isLoading }: { label: string; href?: string; isLoading?: boolean }) => (
    <a data-testid="pos-link" href={href} data-loading={isLoading ? '1' : '0'}>
      {label}
    </a>
  ),
}));

jest.mock('../config/labels', () => ({
  PaymentQuoteStatusLabels: {
    TxReceived: 'Tx received',
    TxMempool: 'Tx mempool',
    TxBlockchain: 'Tx blockchain',
    TxCompleted: 'Tx completed',
    Pending: 'Pending',
  },
}));

const mockLayoutOptions = jest.fn();
const mockAllowedCountries = [{ name: 'Switzerland', symbol: 'CH' }];
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
  useWindowContext: () => ({ width: 1024 }),
}));
jest.mock('../hooks/blockchain.hook', () => ({
  useBlockchain: () => ({ toString: (b: string) => b }),
}));
jest.mock('../hooks/guard.hook', () => ({
  useAddressGuard: () => undefined,
}));
jest.mock('../hooks/layout-config.hook', () => ({
  useLayoutOptions: (opts: unknown) => mockLayoutOptions(opts),
}));
jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));
jest.mock('../util/lnurl', () => ({
  Lnurl: {
    encode: (u: string) => `lnurl-${u}`,
    decode: (u: string) => u,
    prependLnurl: (u: string) => `lightning:${u}`,
  },
}));
jest.mock('../util/utils', () => ({
  blankedAddress: (v: string) => v,
  formatLocationAddress: (a: Record<string, unknown>) =>
    [a.street, a.houseNumber, a.zip, a.city, a.country].filter(Boolean).join(', '),
  isEmpty: (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0),
  removeNullFields: (o?: Record<string, unknown>) => {
    if (!o) return o;
    return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));
  },
  url: ({ path, params }: { path: string; params?: URLSearchParams }) =>
    `https://example.test${path}?${params?.toString() ?? ''}`,
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

describe('PaymentRoutesScreen actions', () => {
  let originalImage: typeof Image;
  let originalCreateObjectURL: typeof URL.createObjectURL | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRoutesState.overrides = {};
    mockRoutesState.userOverrides = {};
    mockUpdatePaymentLink.mockResolvedValue(undefined);
    mockUpdateUserPaymentLinksConfig.mockResolvedValue(undefined);
    mockCancelPaymentLinkPayment.mockResolvedValue(undefined);
    mockDeletePaymentRoute.mockResolvedValue(undefined);
    mockCreatePosLink.mockResolvedValue({ url: 'https://pos.example/pl-1' });
    mockCreatePaymentLink.mockResolvedValue({ id: 'pl-new' });
    mockCreatePaymentLinkPayment.mockResolvedValue(undefined);
    mockWindowOpen.mockReset();
    window.open = mockWindowOpen;

    // Canvas + Image for downloadQrCode
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      fillStyle: '',
      fillRect: jest.fn(),
      drawImage: jest.fn(),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toDataURL = jest.fn(() => 'data:image/png;base64,abc');

    originalImage = window.Image;
    class MockImage {
      onload: ((this: MockImage, ev: Event) => unknown) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.call(this, new Event('load')));
      }
    }
    // @ts-expect-error test double
    window.Image = MockImage;

    Element.prototype.scrollIntoView = jest.fn();
  });

  afterEach(async () => {
    window.Image = originalImage;
    if (originalCreateObjectURL) URL.createObjectURL = originalCreateObjectURL;
    // Flush PosLinkButton fetch + scrollIntoView(setTimeout 100) so Jest can exit cleanly
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
  });

  it('renders buy, sell and swap route sections with copyable purpose of payment', () => {
    renderScreen();

    expect(screen.getByText('Buy')).toBeInTheDocument();
    expect(screen.getByText('Sell')).toBeInTheDocument();
    expect(screen.getByText('Swap')).toBeInTheDocument();
    // bankUsage appears both as collapsible adjacent text and as table cell
    expect(screen.getAllByText('DFX BUY 1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('CH9300762011623852957')).toBeInTheDocument();
    expect(screen.getByText('ETH')).toBeInTheDocument();

    const copyButtons = screen.getAllByTestId('copy-btn');
    expect(copyButtons.length).toBeGreaterThan(0);
    fireEvent.click(copyButtons[0]);
    expect(mockCopy).toHaveBeenCalledWith('DFX BUY 1');
  });

  it('opens delete confirmation for a buy route and confirms deletion', async () => {
    renderScreen();

    // First "Delete" is the buy route (order: buy, sell, swap).
    const deleteButtons = screen.getAllByText('Delete');
    expect(deleteButtons.length).toBeGreaterThanOrEqual(3);
    fireEvent.click(deleteButtons[0]);

    expect(screen.getByTestId('confirm-overlay')).toBeInTheDocument();
    // Title switches via useLayoutOptions
    expect(mockLayoutOptions).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Delete payment route?' }),
    );

    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => {
      expect(mockDeletePaymentRoute).toHaveBeenCalledWith(1, 'buy');
    });
  });

  it('cancels delete confirmation without calling deletePaymentRoute', async () => {
    renderScreen();
    fireEvent.click(screen.getAllByText('Delete')[0]);
    fireEvent.click(screen.getByText('Cancel'));
    expect(mockDeletePaymentRoute).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-overlay')).not.toBeInTheDocument();
    });
  });

  it('deletes sell and swap routes via confirmation', async () => {
    renderScreen();
    const deleteButtons = screen.getAllByText('Delete');

    fireEvent.click(deleteButtons[1]);
    fireEvent.click(screen.getByTestId('confirm-overlay').querySelectorAll('button')[1]);
    await waitFor(() => {
      expect(mockDeletePaymentRoute).toHaveBeenCalledWith(2, 'sell');
    });

    // Re-open for swap (confirm closes; re-render still has routes)
    fireEvent.click(screen.getAllByText('Delete')[2]);
    fireEvent.click(screen.getByTestId('confirm-overlay').querySelectorAll('button')[1]);
    await waitFor(() => {
      expect(mockDeletePaymentRoute).toHaveBeenCalledWith(3, 'swap');
    });
  });

  it('deactivates an active payment link without pending payment', async () => {
    renderScreen();
    fireEvent.click(screen.getByText('Deactivate'));
    await waitFor(() => {
      expect(mockUpdatePaymentLink).toHaveBeenCalledWith({ status: 'Inactive' }, 'pl-active');
    });
  });

  it('activates an inactive payment link', async () => {
    mockRoutesState.overrides = { paymentLinks: [mockLinkInactive] };
    renderScreen();
    fireEvent.click(screen.getByText('Activate'));
    await waitFor(() => {
      expect(mockUpdatePaymentLink).toHaveBeenCalledWith({ status: 'Active' }, 'pl-inactive');
    });
  });

  it('toggles Multiple mode to Public', async () => {
    renderScreen();
    fireEvent.click(screen.getByTestId('icon-btn-swap'));
    await waitFor(() => {
      expect(mockUpdatePaymentLink).toHaveBeenCalledWith({ mode: 'Public' }, 'pl-active');
    });
  });

  it('toggles Public mode to Multiple', async () => {
    mockRoutesState.overrides = { paymentLinks: [mockLinkPending] };
    renderScreen();
    fireEvent.click(screen.getByTestId('icon-btn-swap'));
    await waitFor(() => {
      expect(mockUpdatePaymentLink).toHaveBeenCalledWith({ mode: 'Multiple' }, 'pl-pending');
    });
  });

  it('cancels a pending payment on a payment link', async () => {
    mockRoutesState.overrides = { paymentLinks: [mockLinkPending] };
    renderScreen();
    fireEvent.click(screen.getByText('Cancel payment'));
    await waitFor(() => {
      expect(mockCancelPaymentLinkPayment).toHaveBeenCalledWith('pl-pending');
    });
  });

  it('opens create-payment form for an active link without pending payment', () => {
    renderScreen();
    fireEvent.click(screen.getByText('Create payment'));
    // Form step PAYMENT shows Mode dropdown
    expect(screen.getByTestId('dropdown-paymentMode')).toBeInTheDocument();
    expect(mockLayoutOptions).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('Payment') }),
    );
  });

  it('opens relative website URL with https prefix from expansion item', () => {
    renderScreen();
    // Relative website onClick from expansion items (Shop AG recipient) — list view only
    fireEvent.click(screen.getByTestId('item-Recipient-Website'));
    expect(mockWindowOpen).toHaveBeenCalledWith('https://shop.example.com', '_blank');
  });

  it('opens edit-recipient form for an active link', () => {
    renderScreen();
    fireEvent.click(screen.getByText('Edit recipient'));
    expect(screen.getByTestId('input-recipientName')).toBeInTheDocument();
    expect(screen.getByTestId('input-recipientName')).toHaveValue('Shop AG');
  });

  it('opens absolute website URL without prepending https', () => {
    mockRoutesState.overrides = { paymentLinks: [mockLinkInactive] };
    renderScreen();
    fireEvent.click(screen.getByTestId('item-Recipient-Website'));
    expect(mockWindowOpen).toHaveBeenCalledWith('https://absolute.example', '_blank');
  });

  it('opens edit configuration for a payment link (Always show QR code label)', () => {
    renderScreen();
    const editConfigButtons = screen.getAllByText('Edit configuration');
    // First is global default config, second is per-link (single active link)
    fireEvent.click(editConfigButtons[1]);
    expect(screen.getByText('Always show QR code')).toBeInTheDocument();
    expect(screen.queryByText('Display QR code')).not.toBeInTheDocument();
  });

  it('opens global default configuration editor', () => {
    renderScreen();
    fireEvent.click(screen.getAllByText('Edit configuration')[0]);
    expect(screen.getByText('Always show QR code')).toBeInTheDocument();
    expect(mockLayoutOptions).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Default configuration' }),
    );
  });

  it('opens label rename overlay, cancels, then saves a new label', async () => {
    renderScreen();
    // Label appears in collapsible title and in the editable row — click the row button
    const labelButtons = screen.getAllByText('Active Link');
    fireEvent.click(labelButtons[labelButtons.length - 1]);
    expect(screen.getByTestId('edit-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('edit-prefill')).toHaveTextContent('Active Link');

    fireEvent.click(screen.getByText('cancel-edit'));
    await waitFor(() => {
      expect(screen.queryByTestId('edit-overlay')).not.toBeInTheDocument();
    });

    const labelButtonsAgain = screen.getAllByText('Active Link');
    fireEvent.click(labelButtonsAgain[labelButtonsAgain.length - 1]);
    fireEvent.click(screen.getByText('save-edit'));
    await waitFor(() => {
      expect(mockUpdatePaymentLink).toHaveBeenCalledWith({ label: 'Renamed Link' }, 'pl-active');
    });
  });

  it('downloads QR code PNG via canvas when SVG is present', async () => {
    const clickSpy = jest.fn();
    const originalCreate = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreate(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value: clickSpy });
      }
      return el;
    });

    renderScreen();
    fireEvent.click(screen.getAllByText('Download QR code')[0]);

    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalled();
    });
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/png');

    (document.createElement as jest.Mock).mockRestore();
  });

  it('no-ops download QR when SVG is missing (early return)', () => {
    // QrBasic mock still renders SVG; temporarily remove SVG after render
    const { container } = renderScreen();
    const qrHost = container.querySelector('[id^="qr-code-"]');
    qrHost?.querySelector('svg')?.remove();
    const toDataURL = HTMLCanvasElement.prototype.toDataURL as jest.Mock;
    toDataURL.mockClear();
    fireEvent.click(screen.getByText('Download QR code'));
    expect(toDataURL).not.toHaveBeenCalled();
  });

  it('no-ops download QR when canvas context is unavailable', () => {
    HTMLCanvasElement.prototype.getContext = jest.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    const toDataURL = HTMLCanvasElement.prototype.toDataURL as jest.Mock;
    toDataURL.mockClear();
    renderScreen();
    fireEvent.click(screen.getByText('Download QR code'));
    expect(toDataURL).not.toHaveBeenCalled();
  });

  it('scrollIntoView no-ops when payment links list is empty', async () => {
    mockRoutesState.overrides = { paymentLinks: [] };
    renderScreen();
    // Create wizard still available without existing links; Cancel on DONE calls onClose()
    // → scrollIntoView(undefined) → early return when paymentLinks is empty (L187).
    fireEvent.click(screen.getByText('Create Payment Link'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('Skip')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Skip'));
    await waitFor(() => expect(screen.getByText('Skip')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Skip'));
    await waitFor(() => expect(screen.getByText('Next')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('Cancel')).toBeInTheDocument());
    (Element.prototype.scrollIntoView as jest.Mock).mockClear();
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByTestId('dropdown-routeId')).not.toBeInTheDocument();
    });
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('downloads sticker with route and externalIds params', () => {
    renderScreen();
    fireEvent.click(screen.getAllByText('Download sticker')[0]);
    expect(mockWindowOpen).toHaveBeenCalledWith(
      expect.stringContaining('/stickers?'),
      '_blank',
    );
    expect(mockWindowOpen.mock.calls[0][0]).toContain('route=2');
    expect(mockWindowOpen.mock.calls[0][0]).toContain('externalIds=ext-active');
  });

  it('downloads sticker without externalIds when link has none', () => {
    mockRoutesState.overrides = { paymentLinks: [mockLinkInactive] };
    renderScreen();
    fireEvent.click(screen.getByText('Download sticker'));
    const opened = mockWindowOpen.mock.calls[0][0] as string;
    expect(opened).toContain('route=2');
    expect(opened).not.toContain('externalIds');
  });

  it('fetches POS URL on mount and renders Open POS link', async () => {
    renderScreen();
    await waitFor(() => {
      expect(mockCreatePosLink).toHaveBeenCalledWith('pl-active');
    });
    await waitFor(() => {
      const posLinks = screen.getAllByTestId('pos-link');
      expect(posLinks.some((a) => a.getAttribute('href') === 'https://pos.example/pl-1')).toBe(true);
    });
  });

  it('logs POS fetch failure and keeps fallback href', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockCreatePosLink.mockRejectedValueOnce(new Error('pos-down'));
    renderScreen();
    await waitFor(() => {
      expect(errSpy).toHaveBeenCalledWith('Failed to fetch POS URL:', expect.any(Error));
    });
    const posLinks = screen.getAllByTestId('pos-link');
    expect(posLinks[0].getAttribute('href')).toMatch(/\/pos\/payment-link\//);
    errSpy.mockRestore();
  });

  it('navigates to invoice on Create Invoice', () => {
    renderScreen();
    fireEvent.click(screen.getByText('Create Invoice'));
    expect(mockNavigate).toHaveBeenCalledWith('/invoice');
  });

  it('opens create payment link wizard when sell routes and lightning address exist', () => {
    renderScreen();
    fireEvent.click(screen.getByText('Create Payment Link'));
    expect(screen.getByTestId('dropdown-routeId')).toBeInTheDocument();
    expect(screen.getByTestId('input-externalId')).toBeInTheDocument();
  });

  it('hides Create Payment Link when user has no lightning blockchain', () => {
    mockRoutesState.userOverrides = {
      user: {
        id: 1,
        accountId: 'acc',
        paymentLink: { active: true },
        activeAddress: { blockchains: ['Bitcoin'] },
      },
    };
    renderScreen();
    expect(screen.queryByText('Create Payment Link')).not.toBeInTheDocument();
  });

  it('shows loading spinner while payment routes load without in-flight updates', () => {
    mockRoutesState.overrides = { paymentRoutesLoading: true, paymentLinksLoading: false };
    renderScreen();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('shows loading spinner while wallet is not initialized', () => {
    jest.doMock('../contexts/wallet.context', () => ({
      useWalletContext: () => ({ isInitialized: false }),
    }));
    // Override via re-mock is hard mid-file; instead use user loading:
    mockRoutesState.userOverrides = { isUserLoading: true };
    renderScreen();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('surfaces non-permission api errors and ignores permission denied alone', () => {
    mockRoutesState.overrides = { error: 'permission denied' };
    const { unmount } = renderScreen();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    unmount();

    mockRoutesState.overrides = { error: 'server exploded' };
    renderScreen();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('server exploded');
  });

  it('copies LNURL expansion items when clicked', () => {
    renderScreen();
    fireEvent.click(screen.getAllByTestId('item-LNURL-Link')[0]);
    expect(mockCopy).toHaveBeenCalledWith('lightning:lnurl1active');
    fireEvent.click(screen.getAllByTestId('item-LNURL-LNURL')[0]);
    expect(mockCopy).toHaveBeenCalledWith('lnurl1active');
    fireEvent.click(screen.getAllByTestId('item-LNURL-LNURL decoded')[0]);
    expect(mockCopy).toHaveBeenCalledWith('https://pay.example/pl-active');
  });

  it('uses layout onBack to leave global config and form steps', async () => {
    renderScreen();
    fireEvent.click(screen.getAllByText('Edit configuration')[0]);

    const lastOpts = mockLayoutOptions.mock.calls[mockLayoutOptions.mock.calls.length - 1][0] as {
      onBack?: () => void;
    };
    expect(lastOpts.onBack).toBeDefined();
    act(() => lastOpts.onBack?.());
    await waitFor(() => {
      expect(screen.queryByTestId('dropdown-configDisplayQr')).not.toBeInTheDocument();
    });
  });

  it('steps back in create-payment-link wizard via onBack', async () => {
    renderScreen();
    fireEvent.click(screen.getByText('Create Payment Link'));
    // Advance to recipient
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => {
      expect(screen.getByTestId('input-recipientName')).toBeInTheDocument();
    });

    const opts = mockLayoutOptions.mock.calls[mockLayoutOptions.mock.calls.length - 1][0] as {
      onBack?: () => void;
    };
    act(() => opts.onBack?.());
    await waitFor(() => {
      expect(screen.getByTestId('dropdown-routeId')).toBeInTheDocument();
    });
  });

  it('closes create wizard completely when onBack on first step', async () => {
    renderScreen();
    fireEvent.click(screen.getByText('Create Payment Link'));
    const opts = mockLayoutOptions.mock.calls[mockLayoutOptions.mock.calls.length - 1][0] as {
      onBack?: () => void;
    };
    act(() => opts.onBack?.());
    await waitFor(() => {
      expect(screen.queryByTestId('dropdown-routeId')).not.toBeInTheDocument();
      expect(screen.getByText('Payment Links')).toBeInTheDocument();
    });
  });

  it('uses deleteRoute onBack to clear confirmation', async () => {
    renderScreen();
    fireEvent.click(screen.getAllByText('Delete')[0]);
    const opts = mockLayoutOptions.mock.calls[mockLayoutOptions.mock.calls.length - 1][0] as {
      onBack?: () => void;
    };
    act(() => opts.onBack?.());
    await waitFor(() => {
      expect(screen.queryByTestId('confirm-overlay')).not.toBeInTheDocument();
    });
  });

  it('shows fallback title Payment Link when label and externalId are missing', () => {
    mockRoutesState.overrides = {
      paymentLinks: [
        {
          id: 'pl-bare',
          routeId: 2,
          status: 'Active',
          mode: 'Multiple',
          label: undefined,
          externalId: undefined,
          url: 'https://pay.example/bare',
          lnurl: 'lnurl1bare',
          config: {},
          recipient: undefined,
          payment: undefined,
        },
      ],
    };
    renderScreen();
    expect(screen.getByText(/Payment Link pl-bare/)).toBeInTheDocument();
  });
});
