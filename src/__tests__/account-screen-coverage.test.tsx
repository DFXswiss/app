import { ReactNode } from 'react';

const mockGetRef = jest.fn();
const mockGetProfile = jest.fn();
const mockGetDetailTransactions = jest.fn();
const mockGetUnassignedTransactions = jest.fn();
const mockCall = jest.fn();
const mockNavigate = jest.fn();
const mockCopy = jest.fn();
const mockStartStep = jest.fn();
const mockSetWallet = jest.fn();
const mockChangeAddress = jest.fn();
const mockDownloadPdfFromString = jest.fn();

let mockSettings = {
  translate: (_namespace: string, key: string) => key,
  language: undefined as { symbol: string } | undefined,
};
let mockWindow = { width: 400 };
let mockAppHandling = { canClose: false, isEmbedded: false };
let mockWallet = { isInitialized: true };
let mockSession = { isLoggedIn: true };
let mockUserState: { user?: any; isUserLoading: boolean; userAddresses: any[] } = {
  user: undefined,
  isUserLoading: false,
  userAddresses: [],
};
let mockLastLayoutOptions: { title: string; backButton: boolean; onBack?: () => void } | undefined;
const mockRootRef = { current: null };

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { ETHEREUM: 'Ethereum', BITCOIN: 'Bitcoin' },
  KycStepName: { PHONE_CHANGE: 'PhoneChange', ADDRESS_CHANGE: 'AddressChange', NAME_CHANGE: 'NameChange' },
  Utils: { formatAmount: (value?: number) => `${value ?? ''}` },
  useUserContext: () => ({ ...mockUserState, changeAddress: mockChangeAddress }),
  useAuthContext: () => ({}),
  useSessionContext: () => mockSession,
  useApi: () => ({ call: mockCall }),
  useUser: () => ({ getRef: mockGetRef, getProfile: mockGetProfile }),
  useTransaction: () => ({
    getDetailTransactions: mockGetDetailTransactions,
    getUnassignedTransactions: mockGetUnassignedTransactions,
  }),
}));

jest.mock('@dfx.swiss/react-components', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const components = {
    __esModule: true,
    AlignContent: { RIGHT: 'right' },
    IconVariant: { EDIT: 'edit', ARROW_RIGHT: 'arrow-right' },
    SpinnerSize: { LG: 'large' },
    StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
    StyledButtonWidth: { FULL: 'full' },
    Form: ({ children, onSubmit }: { children?: ReactNode; onSubmit?: () => void }) => (
      <form data-testid={onSubmit ? 'pdf-form' : 'address-form'} onSubmit={onSubmit}>
        {children}
      </form>
    ),
    StyledVerticalStack: Passthrough,
    StyledDataTable: ({ label, children }: { label?: string; children?: ReactNode }) => (
      <section>
        {label && <h2>{label}</h2>}
        {children}
      </section>
    ),
    StyledDataTableRow: ({ label, children }: { label: string; children?: ReactNode }) => (
      <section data-testid="data-row">
        <span>{label}</span>
        {children}
      </section>
    ),
    StyledDataTableExpandableRow: ({
      label,
      children,
      expansionItems = [],
    }: {
      label: string;
      children?: ReactNode;
      expansionItems?: { label: string; text?: string; onClick?: () => void }[];
    }) => (
      <section>
        <span>{label}</span>
        {children}
        {expansionItems.map((item, index) => (
          <button key={`${item.label}-${index}`} type="button" onClick={item.onClick}>
            {item.label} {item.text}
          </button>
        ))}
      </section>
    ),
    StyledDropdown: ({
      name,
      items,
      labelFunc,
      descriptionFunc,
    }: {
      name: string;
      items: any[];
      labelFunc: (item: any) => ReactNode;
      descriptionFunc?: (item: any) => ReactNode;
    }) => (
      <div data-testid={`dropdown-${name}`}>
        {items.map((item, index) => (
          <span key={`${name}-${index}`}>
            {labelFunc(item)} {descriptionFunc?.(item)}
          </span>
        ))}
      </div>
    ),
    StyledInput: ({ name, type }: { name: string; type: string }) => <input name={name} type={type} />,
    StyledButton: ({
      label,
      onClick,
      disabled,
    }: {
      label: string;
      onClick: () => void;
      disabled?: boolean;
    }) => (
      <button type="button" onClick={onClick} disabled={disabled}>
        {label}
      </button>
    ),
    StyledIconButton: ({ onClick }: { onClick: () => void }) => (
      <button type="button" aria-label="edit" onClick={onClick}>
        edit
      </button>
    ),
    CopyButton: ({ onCopy }: { onCopy: () => void }) => (
      <button type="button" onClick={onCopy}>
        Copy
      </button>
    ),
    StyledLoadingSpinner: () => <div data-testid="spinner" />,
  };
  return components;
});

jest.mock('src/components/overlay/confirmation-overlay', () => ({
  ConfirmationOverlay: ({
    message,
    cancelLabel,
    confirmLabel,
    onCancel,
    onConfirm,
  }: {
    message: string;
    cancelLabel: string;
    confirmLabel: string;
    onCancel: () => void;
    onConfirm: () => Promise<void>;
  }) => (
    <div>
      <p>{message}</p>
      <button type="button" onClick={onCancel}>
        {cancelLabel}
      </button>
      <button type="button" onClick={() => void onConfirm()}>
        {confirmLabel}
      </button>
    </div>
  ),
}));

jest.mock('src/components/account/recommendations-section', () => ({
  RecommendationsSection: ({
    setShowRecommendationModal,
  }: {
    setShowRecommendationModal: (show: boolean) => void;
  }) => (
    <button type="button" onClick={() => setShowRecommendationModal(true)}>
      Open invitation
    </button>
  ),
}));

jest.mock('src/components/kyc-status', () => ({ KycStatus: () => null }));

jest.mock('src/components/modal', () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children?: ReactNode }) => (
    <div data-testid="modal" data-open={String(isOpen)}>
      {children}
    </div>
  ),
}));

jest.mock('copy-to-clipboard', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockCopy(...args),
}));

jest.mock('src/config/labels', () => ({
  addressLabel: (item: { address?: string }) => item.address ?? '',
}));

jest.mock('src/config/urls', () => ({ Urls: { referral: 'https://example.test/referral' } }));

jest.mock('src/util/utils', () => ({
  blankedAddress: (address: string) => address,
  downloadPdfFromString: (...args: unknown[]) => mockDownloadPdfFromString(...args),
  formatSwissDateTimeWithSeconds: (value: unknown) => String(value),
  sortAddressesByBlockchain: () => 0,
  url: ({ base, params }: { base: string; params: URLSearchParams }) => `${base}?${params.toString()}`,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => mockSettings,
}));

jest.mock('src/contexts/window.context', () => ({
  useWindowContext: () => mockWindow,
}));

jest.mock('src/contexts/app-handling.context', () => ({
  useAppHandlingContext: () => mockAppHandling,
}));

jest.mock('src/contexts/wallet.context', () => ({
  useWalletContext: () => ({ ...mockWallet, setWallet: mockSetWallet }),
}));

jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: mockRootRef }),
}));

jest.mock('src/hooks/anchor.hook', () => ({ useAnchor: () => undefined }));
jest.mock('src/hooks/guard.hook', () => ({ useUserGuard: () => undefined }));
jest.mock('src/hooks/kyc-helper.hook', () => ({ useKycHelper: () => ({ startStep: mockStartStep }) }));
jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: (options: { title: string; backButton: boolean; onBack?: () => void }) => {
    mockLastLayoutOptions = options;
  },
}));
jest.mock('src/hooks/navigation.hook', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

import { KycStepName } from '@dfx.swiss/react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AccountScreen from '../screens/account.screen';

const VOLUMES = {
  buy: { total: 1, annual: 2 },
  sell: { total: 3, annual: 4 },
  swap: { total: 5, annual: 6 },
};

const ADDRESS_A = {
  address: '0xAA',
  blockchains: ['Ethereum', 'Bitcoin'],
  label: 'Primary',
  wallet: 'Wallet A',
};

const ADDRESS_B = {
  address: '0xBB',
  blockchains: ['Ethereum'],
  wallet: 'Wallet B',
};

function makeUser(overrides: Record<string, unknown> = {}): any {
  return {
    activeAddress: ADDRESS_A,
    kyc: { level: 49 },
    volumes: VOLUMES,
    ...overrides,
  };
}

function dataRow(label: string): HTMLElement {
  const row = screen.getByText(label).closest('[data-testid="data-row"]');
  if (!row) throw new Error(`Missing row: ${label}`);
  return row as HTMLElement;
}

function balanceCalls(): unknown[][] {
  return mockCall.mock.calls.filter(([request]) => String(request.url).startsWith('balance/pdf?'));
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderLoaded(): Promise<ReturnType<typeof render>> {
  const view = render(<AccountScreen />);
  await waitFor(() => expect(screen.queryByTestId('spinner')).toBeNull());
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings = { translate: (_namespace: string, key: string) => key, language: undefined };
  mockWindow = { width: 400 };
  mockAppHandling = { canClose: false, isEmbedded: false };
  mockWallet = { isInitialized: true };
  mockSession = { isLoggedIn: true };
  mockUserState = { user: makeUser(), isUserLoading: false, userAddresses: [] };
  mockLastLayoutOptions = undefined;
  mockGetRef.mockResolvedValue(undefined);
  mockGetProfile.mockResolvedValue(undefined);
  mockGetDetailTransactions.mockResolvedValue([]);
  mockGetUnassignedTransactions.mockResolvedValue([]);
  mockChangeAddress.mockResolvedValue(undefined);
  mockCall.mockImplementation(({ url }: { url: string }) =>
    url === 'balance/pdf/blockchains' ? Promise.resolve([]) : Promise.resolve({ pdfData: 'JVBE' }),
  );
});

describe('loading and image', () => {
  it.each([
    ['the user is loading', true, true, true],
    ['the session is logged out', false, false, true],
  ])('keeps the spinner when %s', async (_name, isUserLoading, isLoggedIn, isInitialized) => {
    mockUserState = { user: makeUser(), isUserLoading, userAddresses: [] };
    mockSession = { isLoggedIn };
    mockWallet = { isInitialized };

    const { container } = render(<AccountScreen />);
    await settle();

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(mockGetRef).not.toHaveBeenCalled();
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://dfx.swiss/images/app/berge.jpg');
  });

  it('keeps the spinner while the wallet is uninitialized after data settles', async () => {
    mockWallet = { isInitialized: false };

    render(<AccountScreen />);
    await waitFor(() => expect(mockGetProfile).toHaveBeenCalledTimes(1));
    await settle();

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('shows pending loading and removes it after both profile promises resolve', async () => {
    let resolveRef: (value: undefined) => void = () => undefined;
    let resolveProfile: (value: undefined) => void = () => undefined;
    mockGetRef.mockReturnValue(
      new Promise((resolve) => {
        resolveRef = resolve;
      }),
    );
    mockGetProfile.mockReturnValue(
      new Promise((resolve) => {
        resolveProfile = resolve;
      }),
    );

    render(<AccountScreen />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();

    await act(async () => {
      resolveRef(undefined);
      resolveProfile(undefined);
    });

    await waitFor(() => expect(screen.queryByTestId('spinner')).toBeNull());
  });

  it('clears loading when referral and profile requests reject', async () => {
    mockGetRef.mockRejectedValue(new Error('referral'));
    mockGetProfile.mockRejectedValue(new Error('profile'));

    await renderLoaded();

    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.queryByText('Profile')).toBeNull();
    expect(screen.queryByText('Referral')).toBeNull();
  });
});

describe('profile data and editing', () => {
  it('formats the complete profile and runs all edit outcomes', async () => {
    mockGetProfile.mockResolvedValue({
      mail: 'person@example.test',
      phone: '+41000000000',
      firstName: 'Ada',
      lastName: 'Lovelace',
      organizationName: 'Example Org',
      address: {
        street: 'Main Street',
        houseNumber: '7',
        zip: '8000',
        city: 'Zurich',
        country: { name: 'Switzerland' },
      },
    });

    await renderLoaded();

    expect(screen.getByText('Main Street 7, 8000 Zurich, Switzerland')).toBeInTheDocument();
    fireEvent.click(within(dataRow('Email')).getByRole('button', { name: 'edit' }));
    expect(mockNavigate).toHaveBeenCalledWith('/account/mail', { setRedirect: true });

    fireEvent.click(within(dataRow('Phone number')).getByRole('button', { name: 'edit' }));
    expect(mockLastLayoutOptions?.title).toBe('Change phone number');
    expect(screen.getByText('Do you really want to change your phone number?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(mockStartStep).toHaveBeenCalledWith(KycStepName.PHONE_CHANGE));

    fireEvent.click(within(dataRow('Name')).getByRole('button', { name: 'edit' }));
    expect(mockLastLayoutOptions?.title).toBe('Change name');
    const namePrompt = screen.getByText('Do you really want to change your name?');
    const nameDialog = namePrompt.parentElement;
    if (!nameDialog) throw new Error('missing name dialog');
    fireEvent.click(within(nameDialog).getByRole('button', { name: 'Cancel' }));

    fireEvent.click(within(dataRow('Address')).getByRole('button', { name: 'edit' }));
    expect(mockLastLayoutOptions?.title).toBe('Change address');
    expect(screen.getByText('Do you really want to change your address?')).toBeInTheDocument();
    act(() => mockLastLayoutOptions?.onBack?.());
    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.getByText('Example Org')).toBeInTheDocument();
  });

  it.each([
    [
      'omits empty address parts',
      { address: { street: 'Side Road', city: 'Bern' } },
      'Side Road, Bern',
    ],
    ['renders a last-name-only profile', { lastName: 'Single' }, 'Single'],
    ['renders an address-only profile', { address: { street: 'River Road', city: 'Basel' } }, 'River Road, Basel'],
  ])('%s', async (_name, profile, expected) => {
    mockGetProfile.mockResolvedValue(profile);

    await renderLoaded();

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('renders only the mail row for a mail-only profile', async () => {
    mockGetProfile.mockResolvedValue({ mail: 'only@example.test' });

    await renderLoaded();

    expect(screen.getByText('only@example.test')).toBeInTheDocument();
    expect(screen.queryByText('Phone number')).toBeNull();
    expect(screen.queryByText('Name')).toBeNull();
    expect(screen.queryByText('Address')).toBeNull();
    expect(screen.queryByText('Organization')).toBeNull();
  });

  it('skips a truthy profile without display fields', async () => {
    mockGetProfile.mockResolvedValue({});

    await renderLoaded();

    expect(screen.queryByText('Profile')).toBeNull();
  });

  it('skips an undefined profile', async () => {
    mockGetProfile.mockResolvedValue(undefined);

    await renderLoaded();

    expect(screen.queryByText('Profile')).toBeNull();
  });
});

describe('layout states', () => {
  it('covers standalone and embedded base layout options', async () => {
    mockAppHandling = { canClose: true, isEmbedded: false };
    const view = await renderLoaded();

    expect(mockLastLayoutOptions).toEqual({ title: 'Account', backButton: true, onBack: undefined });

    mockAppHandling = { canClose: true, isEmbedded: true };
    view.rerender(<AccountScreen />);
    expect(mockLastLayoutOptions).toEqual({ title: 'DFX services', backButton: false, onBack: undefined });

    mockAppHandling = { canClose: false, isEmbedded: true };
    view.rerender(<AccountScreen />);
    expect(mockLastLayoutOptions).toEqual({ title: 'DFX services', backButton: false, onBack: undefined });
  });

  it('opens and closes the recommendation layout state', async () => {
    mockUserState = { user: makeUser({ kyc: { level: 50 } }), isUserLoading: false, userAddresses: [] };
    await renderLoaded();

    expect(screen.getByText('Recommendations')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open invitation' }));
    expect(mockLastLayoutOptions).toEqual(
      expect.objectContaining({ title: 'Create Invitation', backButton: true }),
    );

    act(() => mockLastLayoutOptions?.onBack?.());
    expect(mockLastLayoutOptions).toEqual(expect.objectContaining({ title: 'Account', backButton: false }));
  });

  it('does not render recommendations below the required level', async () => {
    await renderLoaded();

    expect(screen.queryByText('Recommendations')).toBeNull();
  });
});

describe('transactions', () => {
  it('sorts ascending input and maps every transaction text shape in the first five', async () => {
    mockGetDetailTransactions.mockResolvedValue([
      { id: 'id-input', date: '2020-01-01', inputAsset: 'IN', inputAmount: 1 },
      { uid: 'uid-output', date: '2021-01-01', outputAsset: 'OUT', outputAmount: 2 },
      {
        id: 'id-both',
        date: '2022-01-01',
        inputAsset: 'LEFT',
        inputAmount: 3,
        outputAsset: 'RIGHT',
        outputAmount: 4,
      },
    ]);
    mockGetUnassignedTransactions.mockResolvedValue([
      { id: 'id-empty', date: '2023-01-01' },
      { id: 'id-null-input', date: '2024-01-01', inputAsset: 'NULLIN', inputAmount: null },
      { id: 'id-sliced', date: '2019-01-01', outputAsset: 'SLICED', outputAmount: 9 },
    ]);

    await renderLoaded();
    await waitFor(() => expect(screen.getByText('Latest transactions')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: /3 LEFT.*→.*4 RIGHT/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /NULLIN/ })).toBeInTheDocument();
    expect(screen.queryByText(/SLICED/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /1 IN/ }));
    fireEvent.click(screen.getByRole('button', { name: /2 OUT/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/tx/id-input');
    expect(mockNavigate).toHaveBeenCalledWith('/tx/uid-output');
  });

  it('sorts descending input and formats a null output amount', async () => {
    mockGetDetailTransactions.mockResolvedValue([
      { id: 'newer', date: '2022-01-01', outputAsset: 'NULLOUT', outputAmount: null },
      { id: 'older', date: '2020-01-01', inputAsset: 'OLD', inputAmount: 1 },
    ]);

    await renderLoaded();
    await waitFor(() => expect(screen.getByRole('button', { name: /NULLOUT/ })).toBeInTheDocument());
  });

  it('omits latest transactions for an empty result', async () => {
    await renderLoaded();
    await settle();

    expect(screen.queryByText('Latest transactions')).toBeNull();
  });

  it('keeps transactions undefined when both requests reject', async () => {
    mockGetDetailTransactions.mockRejectedValue(new Error('detail'));
    mockGetUnassignedTransactions.mockRejectedValue(new Error('unassigned'));

    await renderLoaded();
    await settle();

    expect(screen.queryByText('Latest transactions')).toBeNull();
  });
});

describe('address effects', () => {
  it('retains the selected form address across loading and a missing active address', async () => {
    mockUserState = {
      user: makeUser(),
      isUserLoading: false,
      userAddresses: [ADDRESS_A, ADDRESS_B],
    };
    const view = await renderLoaded();
    await waitFor(() => expect(screen.getByTestId('dropdown-address')).toBeInTheDocument());
    mockChangeAddress.mockClear();

    mockUserState = {
      user: makeUser({ activeAddress: { ...ADDRESS_B, address: '0xCC' } }),
      isUserLoading: true,
      userAddresses: [ADDRESS_A, ADDRESS_B],
    };
    view.rerender(<AccountScreen />);
    await settle();
    expect(mockChangeAddress).not.toHaveBeenCalled();

    mockUserState = {
      user: makeUser({ activeAddress: undefined }),
      isUserLoading: false,
      userAddresses: [ADDRESS_A, ADDRESS_B],
    };
    view.rerender(<AccountScreen />);

    await waitFor(() => expect(mockChangeAddress).toHaveBeenCalledWith(ADDRESS_A.address));
  });

  it('changes the stored address when the user disappears after a selection', async () => {
    mockUserState = {
      user: makeUser(),
      isUserLoading: false,
      userAddresses: [ADDRESS_A, ADDRESS_B],
    };
    const view = await renderLoaded();
    await waitFor(() => expect(screen.getByTestId('dropdown-address')).toBeInTheDocument());
    mockChangeAddress.mockClear();

    mockUserState = { user: undefined, isUserLoading: false, userAddresses: [ADDRESS_A, ADDRESS_B] };
    view.rerender(<AccountScreen />);

    await waitFor(() => expect(mockChangeAddress).toHaveBeenCalledWith(ADDRESS_A.address));
    await waitFor(() => expect(screen.queryByTestId('spinner')).toBeNull());
    expect(screen.getByTestId('dropdown-address')).toBeInTheDocument();
  });
});

describe('referral and account data', () => {
  it('renders referral details and copies the referral URL', async () => {
    mockUserState = {
      user: makeUser(),
      isUserLoading: false,
      userAddresses: [ADDRESS_A],
    };
    mockGetRef.mockResolvedValue({
      code: 'REF',
      commission: 0.25,
      volume: 12,
      credit: 1,
      paidCredit: 2,
      userCount: 3,
      activeUserCount: 4,
    });

    await renderLoaded();

    expect(screen.getByText('25.00%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /User count 3/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Active user count 4/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(mockCopy).toHaveBeenCalledWith('https://example.test/referral?code=REF');
  });

  it('renders account totals safely without a user', async () => {
    mockUserState = { user: undefined, isUserLoading: false, userAddresses: [] };

    await renderLoaded();

    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.queryByText('Referral')).toBeNull();
    expect(screen.queryByText('Recommendations')).toBeNull();
  });
});

describe('PDF report', () => {
  function useAddressesAndChains(
    chains: string[],
    activeAddress: typeof ADDRESS_A | typeof ADDRESS_B = ADDRESS_A,
  ): void {
    mockUserState = {
      user: makeUser({ activeAddress }),
      isUserLoading: false,
      userAddresses: [ADDRESS_A, ADDRESS_B],
    };
    mockCall.mockImplementation(({ url }: { url: string }) =>
      url === 'balance/pdf/blockchains' ? Promise.resolve(chains) : Promise.resolve({ pdfData: 'JVBE' }),
    );
  }

  it('renders both address descriptions and returns when a multi-chain form has no blockchain', async () => {
    useAddressesAndChains(['Ethereum', 'Bitcoin']);
    await renderLoaded();

    await waitFor(() => expect(screen.getByTestId('dropdown-blockchain')).toBeInTheDocument());
    expect(screen.getByTestId('dropdown-address')).toHaveTextContent('Primary');
    expect(screen.getByTestId('dropdown-address')).toHaveTextContent('Wallet B');
    expect(screen.getByTestId('dropdown-blockchain')).toHaveTextContent('Ethereum');
    expect(screen.getByTestId('dropdown-blockchain')).toHaveTextContent('Bitcoin');
    expect(screen.getByTestId('dropdown-currency')).toHaveTextContent('CHF');
    expect(screen.getByTestId('dropdown-currency')).toHaveTextContent('EUR');
    expect(screen.getByTestId('dropdown-currency')).toHaveTextContent('USD');

    fireEvent.submit(screen.getByTestId('pdf-form'));
    await settle();
    expect(balanceCalls()).toHaveLength(0);
  });

  it('uses one supported chain when the form blockchain is empty', async () => {
    useAddressesAndChains(['Ethereum'], ADDRESS_B);
    await renderLoaded();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'PDF Download Address Report' })).toBeInTheDocument(),
    );

    fireEvent.submit(screen.getByTestId('pdf-form'));

    await waitFor(() => expect(balanceCalls()).toHaveLength(1));
    await waitFor(() => expect(mockDownloadPdfFromString).toHaveBeenCalled());
    expect(String((balanceCalls()[0][0] as { url: string }).url)).toContain('blockchain=Ethereum');
  });

  it('uses the only supported chain, defaults language, downloads, and closes', async () => {
    useAddressesAndChains(['Ethereum'], ADDRESS_B);
    await renderLoaded();

    const openButton = await screen.findByRole('button', { name: 'PDF Download Address Report' });
    fireEvent.click(openButton);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => expect(mockDownloadPdfFromString).toHaveBeenCalled());
    expect(mockDownloadPdfFromString).toHaveBeenCalledWith(
      'JVBE',
      expect.stringMatching(/_DFX_Balance_Report_Ethereum\.pdf$/),
    );
    expect(String((balanceCalls()[0][0] as { url: string }).url)).toContain('blockchain=Ethereum');
    expect(String((balanceCalls()[0][0] as { url: string }).url)).toContain('language=EN');
    expect(screen.getByTestId('modal')).toHaveAttribute('data-open', 'false');
  });

  it.each([
    [{ message: 'nope' }, 'nope'],
    [{}, 'Unknown error'],
  ])('shows a report error %#', async (error, expected) => {
    useAddressesAndChains(['Ethereum'], ADDRESS_B);
    mockSettings = { translate: (_namespace: string, key: string) => key, language: { symbol: 'DE' } };
    mockCall.mockImplementation(({ url }: { url: string }) =>
      url === 'balance/pdf/blockchains' ? Promise.resolve(['Ethereum']) : Promise.reject(error),
    );
    await renderLoaded();

    fireEvent.click(await screen.findByRole('button', { name: 'PDF Download Address Report' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(String((balanceCalls()[0][0] as { url: string }).url)).toContain('language=DE');
  });

  it('returns before a report request when no address is selected', async () => {
    mockUserState = {
      user: makeUser({ activeAddress: undefined }),
      isUserLoading: false,
      userAddresses: [],
    };
    mockCall.mockImplementation(({ url }: { url: string }) =>
      url === 'balance/pdf/blockchains' ? Promise.resolve(['Ethereum']) : Promise.resolve({ pdfData: 'JVBE' }),
    );
    await renderLoaded();

    fireEvent.submit(screen.getByTestId('pdf-form'));
    await settle();

    expect(balanceCalls()).toHaveLength(0);
  });

  it('handles failure to load supported chains', async () => {
    mockCall.mockRejectedValue(new Error('chains'));

    await renderLoaded();
    await settle();

    expect(screen.queryByRole('button', { name: 'PDF Download Address Report' })).toBeNull();
  });

  it('uses PDF back and cancel handlers while the standalone back arm is false', async () => {
    useAddressesAndChains(['Ethereum', 'Bitcoin']);
    mockAppHandling = { canClose: false, isEmbedded: false };
    await renderLoaded();

    fireEvent.click(await screen.findByRole('button', { name: 'PDF Download Address Report' }));
    expect(mockLastLayoutOptions).toEqual(
      expect.objectContaining({ title: 'PDF Download Address Report', backButton: true }),
    );
    act(() => mockLastLayoutOptions?.onBack?.());
    expect(screen.getByTestId('modal')).toHaveAttribute('data-open', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'PDF Download Address Report' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByTestId('modal')).toHaveAttribute('data-open', 'false');
  });
});
