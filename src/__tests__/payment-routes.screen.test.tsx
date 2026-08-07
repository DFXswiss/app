// Label rename: "Always show QR code" on payment routes (global config + per-link).

const mockRoutesState: { overrides: Record<string, unknown> } = { overrides: {} };

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { ETHEREUM: 'Ethereum', BITCOIN: 'Bitcoin' },
  MinCompletionStatus: { PENDING: 'Pending' },
  PaymentLinkMode: { SINGLE: 'Single', MULTIPLE: 'Multiple', PUBLIC: 'Public' },
  PaymentLinkPaymentMode: { SINGLE: 'Single' },
  PaymentLinkPaymentStatus: { PENDING: 'Pending' },
  PaymentLinkStatus: { ACTIVE: 'Active', INACTIVE: 'Inactive' },
  PaymentStandardType: { OPEN_CRYPTO_PAY: 'OpenCryptoPay' },
  Utils: {},
  Validations: {},
  usePaymentRoutes: () => ({
    createPosLink: jest.fn().mockResolvedValue({ url: 'https://pos.example/pl' }),
  }),
  usePaymentRoutesContext: () => ({
    paymentRoutes: {
      buy: [
        {
          id: 1,
          asset: { name: 'BTC', blockchain: 'Bitcoin' },
          bankUsage: 'DFX BUY 1',
          volume: 0,
          annualVolume: 0,
        },
      ],
      sell: [],
      swap: [],
    },
    paymentLinks: [
      {
        id: 'pl-1',
        routeId: 1,
        status: 'Active',
        label: 'Shop Link',
        externalId: 'ext-1',
        url: 'https://pay.example/pl',
        lnurl: 'lnurl1handbook',
        config: { displayQr: true },
        recipient: undefined,
        payment: undefined,
      },
    ],
    paymentRoutesLoading: false,
    paymentLinksLoading: false,
    userPaymentLinksConfig: {
      standards: ['OpenCryptoPay'],
      minCompletionStatus: 'Pending',
      displayQr: false,
      fee: 0,
      paymentTimeout: 60,
      cancellable: true,
    },
    userPaymentLinksConfigLoading: false,
    updatePaymentLink: jest.fn().mockResolvedValue(undefined),
    updateUserPaymentLinksConfig: jest.fn().mockResolvedValue(undefined),
    cancelPaymentLinkPayment: jest.fn().mockResolvedValue(undefined),
    deletePaymentRoute: jest.fn().mockResolvedValue(undefined),
    error: undefined,
    ...mockRoutesState.overrides,
  }),
  useUserContext: () => ({ user: { id: 1 }, isUserLoading: false }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  AlignContent: { RIGHT: 'right' },
  CopyButton: () => null,
  DfxIcon: () => null,
  Form: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  IconSize: { SM: 'sm' },
  IconVariant: { EXPAND_MORE: 'more', COPY: 'copy', OPEN_IN_NEW: 'open' },
  SpinnerSize: { LG: 'lg' },
  StyledButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
  StyledButtonColor: { STURDY_WHITE: 'sturdy-white', RED: 'red' },
  StyledButtonWidth: { FULL: 'full' },
  StyledCollapsible: ({ children, titleContent }: { children: React.ReactNode; titleContent?: React.ReactNode }) => (
    <div data-testid="collapsible">
      {titleContent}
      {children}
    </div>
  ),
  StyledDataTable: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  StyledDataTableExpandableRow: ({
    label,
    expansionItems,
    expansionContent,
  }: {
    label: string;
    expansionItems?: { label: string; text?: string }[];
    expansionContent?: React.ReactNode;
  }) => (
    <div data-testid={`expandable-${label}`}>
      <span>{label}</span>
      {expansionItems?.map((item) => (
        <div key={item.label} data-testid={`item-${item.label}`}>
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
  StyledDateAndTimePicker: () => null,
  StyledDropdown: ({ label }: { label?: string }) => <div data-testid={`dropdown-${label}`}>{label}</div>,
  StyledDropdownMultiChoice: () => null,
  StyledHorizontalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  StyledIconButton: () => null,
  StyledInput: () => null,
  StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
  StyledSearchDropdown: () => null,
  StyledVerticalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

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
  QrBasic: () => null,
}));
jest.mock('../components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));
jest.mock('../components/styled-link-button', () => ({
  StyledLinkButton: () => null,
}));

jest.mock('../config/labels', () => ({
  PaymentQuoteStatusLabels: { Pending: 'Pending' },
}));

jest.mock('../contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));
jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, key: string) => key,
    translateError: (e: string) => e,
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
  useLayoutOptions: () => undefined,
}));
jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
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
  formatLocationAddress: () => '',
  isEmpty: (v: unknown) => v == null || v === '',
  removeNullFields: (o: Record<string, unknown>) => o,
  url: () => 'https://example.test',
}));

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PaymentRoutesScreen from '../screens/payment-routes.screen';

function renderScreen() {
  return render(
    <MemoryRouter>
      <PaymentRoutesScreen />
    </MemoryRouter>,
  );
}

describe('PaymentRoutesScreen Always show QR code label', () => {
  beforeEach(() => {
    mockRoutesState.overrides = {};
  });

  it('renders the renamed QR label in global config and per-link config (not Display QR code)', () => {
    renderScreen();

    // Both always-rendered config summaries use the new label (global + per-link merge).
    // Exact count: a partial rename that leaves only one site updated fails.
    expect(screen.getAllByText(/Always show QR code/)).toHaveLength(2);
    expect(screen.queryByText(/Display QR code/)).not.toBeInTheDocument();
  });

  it('shows loading spinner while user payment link config loads', () => {
    mockRoutesState.overrides = { userPaymentLinksConfigLoading: true };
    renderScreen();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('shows empty-state when there are no routes', () => {
    mockRoutesState.overrides = {
      paymentRoutes: { buy: [], sell: [], swap: [] },
      paymentLinks: [],
    };
    renderScreen();
    expect(screen.getByText('You have no payment routes yet')).toBeInTheDocument();
  });

  it('surfaces API errors', () => {
    mockRoutesState.overrides = { error: 'routes-failed' };
    renderScreen();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('routes-failed');
  });
});
