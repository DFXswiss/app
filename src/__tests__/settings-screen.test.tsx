import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { BankAccount, UserAddress } from '@dfx.swiss/react';
import type { ReactNode } from 'react';

type MockLanguage = { id: number; name: string; foreignName: string };
type MockCurrency = { id: number; name: string };
type MockAddress = {
  address: string;
  wallet: string;
  explorerUrl: string;
  label?: string;
  isCustody?: boolean;
};
type MockBankAccount = { id: number; iban: string; default: boolean; label?: string };
type MockUser = {
  kyc: {
    preferredPhoneTimes?: string[];
    phoneCallAccepted?: boolean | null;
    phoneCallStatus?: string;
  };
  disabledAddresses: MockAddress[];
  activeAddress?: MockAddress;
};
type MockWatchValues = {
  language?: MockLanguage;
  currency?: MockCurrency;
  preferredPhoneTimes?: string[];
  acceptCall?: boolean;
};
type LayoutOptions = { title: string; onBack?: () => void };
type MenuItem = { label: string; onClick: () => void; hidden?: boolean };
type ActionableItem = {
  key: string | number;
  label: string;
  subLabel: string;
  tag?: string;
  isDisabled?: boolean;
  menuItems?: MenuItem[];
};
type ActionableListProps = {
  label?: string;
  items?: ActionableItem[];
  addButtonOnClick?: () => void;
};

const mockSetValue = jest.fn();
const mockChangeLanguage = jest.fn();
const mockChangeCurrency = jest.fn();
const mockUpdateCallSettings = jest.fn();
const mockUpdateAccount = jest.fn();
const mockDeleteAddress = jest.fn();
const mockDeleteAccount = jest.fn();
const mockRenameAddress = jest.fn();
const mockSetWallet = jest.fn();
const mockNavigate = jest.fn();
const mockFormatIban = jest.fn((iban: string): string | undefined => iban);

let mockLanguage: MockLanguage | undefined;
let mockCurrency: MockCurrency | undefined;
let mockAvailableLanguages: MockLanguage[];
let mockCurrencies: MockCurrency[] | undefined;
let mockUser: MockUser | undefined;
let mockIsUserLoading: boolean;
let mockUserAddresses: MockAddress[];
let mockBankAccounts: MockBankAccount[] | undefined;
let mockIsLoadingBankAccounts: boolean;
let mockWatchedValues: MockWatchValues;
let mockLayoutOptions: LayoutOptions | undefined;

jest.mock('react-hook-form', () => ({
  useForm: () => ({ control: {}, setValue: mockSetValue, formState: { errors: {} } }),
  useWatch: ({ name }: { name: keyof MockWatchValues }) => mockWatchedValues[name],
}));

jest.mock('@dfx.swiss/react', () => ({
  PhoneCallStatus: {
    COMPLETED: 'Completed',
    FAILED: 'Failed',
  },
  PhoneCallTime: {
    H_9_TO_10: 'H9To10',
    H_10_TO_11: 'H10To11',
  },
  Utils: {
    formatIban: (iban: string) => mockFormatIban(iban),
  },
  useUserContext: () => ({
    user: mockUser,
    isUserLoading: mockIsUserLoading,
    userAddresses: mockUserAddresses,
    updateCallSettings: mockUpdateCallSettings,
    deleteAddress: mockDeleteAddress,
    deleteAccount: mockDeleteAccount,
    renameAddress: mockRenameAddress,
  }),
  useFiatContext: () => ({ currencies: mockCurrencies }),
  useBankAccountContext: () => ({
    bankAccounts: mockBankAccounts,
    updateAccount: mockUpdateAccount,
    isLoading: mockIsLoadingBankAccounts,
  }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  Form: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SpinnerSize: { LG: 'lg' },
  StyledButton: ({ label, onClick }: { label: string; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  StyledButtonWidth: { FULL: 'full' },
  StyledDropdown: ({
    label,
    name,
    items,
    labelFunc,
    descriptionFunc,
  }: {
    label: string;
    name: string;
    items: unknown[];
    labelFunc: (item: unknown) => ReactNode;
    descriptionFunc?: (item: unknown) => ReactNode;
  }) => (
    <div data-testid={`dropdown-${name}`}>
      <span>{label}</span>
      {items.map((item, index) => (
        <span key={index}>
          {labelFunc(item)}
          {descriptionFunc?.(item)}
        </span>
      ))}
    </div>
  ),
  StyledDropdownMultiChoice: ({
    label,
    name,
    items,
    labelFunc,
  }: {
    label: string;
    name: string;
    items: unknown[];
    labelFunc: (item: unknown) => ReactNode;
  }) => (
    <div data-testid={`dropdown-${name}`}>
      <span>{label}</span>
      {items.map((item, index) => (
        <span key={index}>{labelFunc(item)}</span>
      ))}
    </div>
  ),
  StyledLoadingSpinner: () => <div role="progressbar" />,
  StyledVerticalStack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

jest.mock('copy-to-clipboard', () => jest.fn());

jest.mock('react-i18next', () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('src/components/actionable-list', () => ({
  __esModule: true,
  default: ({ label = '', items = [], addButtonOnClick }: ActionableListProps) => (
    <section data-testid={`actionable-list-${label}`}>
      <h2>{label}</h2>
      {addButtonOnClick && (
        <button type="button" data-testid={`add-${label}`} onClick={addButtonOnClick}>
          Add
        </button>
      )}
      {items.map((item) => (
        <div key={item.key} data-testid={`item-${label}-${item.key}`}>
          <span>{item.label}</span>
          <span>{item.subLabel}</span>
          <span>{item.tag}</span>
          {item.menuItems?.map((menuItem) => (
            <button
              type="button"
              key={menuItem.label}
              data-testid={`menu-${label}-${item.key}-${menuItem.label}`}
              hidden={menuItem.hidden}
              onClick={menuItem.onClick}
            >
              {menuItem.label}
            </button>
          ))}
        </div>
      ))}
    </section>
  ),
}));

jest.mock('src/components/overlay/confirmation-overlay', () => ({
  ConfirmationOverlay: ({
    message,
    messageContent,
    onCancel,
    onConfirm,
  }: {
    message?: string;
    messageContent?: ReactNode;
    onCancel: () => void;
    onConfirm: () => void;
  }) => (
    <div data-testid="confirmation-overlay">
      {message}
      {messageContent}
      <button type="button" onClick={onCancel}>
        Cancel overlay
      </button>
      <button type="button" onClick={onConfirm}>
        Confirm overlay
      </button>
    </div>
  ),
}));

jest.mock('src/components/overlay/edit-bank-overlay', () => ({
  EditBankAccount: ({ onClose }: { onClose: () => void }) => (
    <button type="button" onClick={onClose}>
      Close bank editor
    </button>
  ),
}));

jest.mock('src/components/overlay/edit-overlay', () => ({
  EditOverlay: ({
    prefill,
    onCancel,
    onEdit,
  }: {
    prefill?: string;
    onCancel: () => void;
    onEdit: (value: string) => void;
  }) => (
    <div>
      <span data-testid="edit-prefill">{prefill}</span>
      <button type="button" onClick={onCancel}>
        Cancel edit
      </button>
      <button type="button" onClick={() => onEdit('Renamed')}>
        Save edit
      </button>
    </div>
  ),
}));

jest.mock('src/components/payment/add-bank-account', () => ({
  AddBankAccount: ({ onSubmit }: { onSubmit: (value: unknown) => void }) => (
    <button type="button" onClick={() => onSubmit({})}>
      Submit bank account
    </button>
  ),
}));

jest.mock('src/config/labels', () => ({
  addressLabel: (address: MockAddress) => address.address,
  PhoneCallTimeLabels: {
    H9To10: '09:00 - 10:00',
    H10To11: '10:00 - 11:00',
  },
}));

jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_key: string, text: string) => text,
    language: mockLanguage,
    currency: mockCurrency,
    availableLanguages: mockAvailableLanguages,
    changeLanguage: mockChangeLanguage,
    changeCurrency: mockChangeCurrency,
  }),
}));

jest.mock('src/contexts/wallet.context', () => ({
  useWalletContext: () => ({ setWallet: mockSetWallet }),
}));

jest.mock('src/contexts/window.context', () => ({
  useWindowContext: () => ({ width: 1024 }),
}));

jest.mock('src/hooks/anchor.hook', () => ({
  useAnchor: jest.fn(),
}));

jest.mock('src/hooks/guard.hook', () => ({
  useUserGuard: jest.fn(),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: (options: LayoutOptions) => {
    mockLayoutOptions = options;
  },
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('src/util/utils', () => ({
  blankedAddress: (value: string) => value,
  sortAddressesByBlockchain: () => 0,
}));

import copy from 'copy-to-clipboard';
import SettingsScreen, { OverlayType, SettingsOverlay } from '../screens/settings.screen';

const BANK_LIST = 'Your Bank Accounts';
const ADDRESS_LIST = 'Your Addresses';
const ENGLISH = { id: 1, name: 'English', foreignName: 'English' };
const GERMAN = { id: 2, name: 'German', foreignName: 'Deutsch' };
const EUR = { id: 1, name: 'Euro' };
const CHF = { id: 2, name: 'Swiss Franc' };

function makeAddress(overrides: Partial<MockAddress> = {}): MockAddress {
  return {
    address: 'address-1',
    wallet: 'Wallet 1',
    explorerUrl: 'https://explorer.example/address-1',
    ...overrides,
  };
}

function makeUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    kyc: {},
    disabledAddresses: [],
    ...overrides,
  };
}

function getMenuButton(list: string, key: string | number, label: string): HTMLElement {
  return screen.getByTestId(`menu-${list}-${key}-${label}`);
}

function closeThroughLayout(): void {
  const onBack = mockLayoutOptions?.onBack;
  expect(onBack).toBeDefined();
  act(() => onBack?.());
}

const mockWindowOpen = jest.spyOn(window, 'open').mockImplementation(() => null);

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLanguage = ENGLISH;
    mockCurrency = EUR;
    mockAvailableLanguages = [ENGLISH, GERMAN];
    mockCurrencies = [EUR, CHF];
    mockUser = undefined;
    mockIsUserLoading = false;
    mockUserAddresses = [];
    mockBankAccounts = undefined;
    mockIsLoadingBankAccounts = false;
    mockWatchedValues = {};
    mockLayoutOptions = undefined;
    mockFormatIban.mockImplementation((iban: string) => iban);
  });

  it('initializes all form values from settings and KYC data', () => {
    mockUser = makeUser({
      kyc: { preferredPhoneTimes: ['H9To10'], phoneCallAccepted: false },
    });

    render(<SettingsScreen />);

    expect(mockSetValue).toHaveBeenCalledWith('language', ENGLISH);
    expect(mockSetValue).toHaveBeenCalledWith('currency', EUR);
    expect(mockSetValue).toHaveBeenCalledWith('preferredPhoneTimes', ['H9To10']);
    expect(mockSetValue).toHaveBeenCalledWith('acceptCall', false);
  });

  it('propagates changed form values', () => {
    mockUser = makeUser({
      kyc: { preferredPhoneTimes: ['H9To10'], phoneCallAccepted: false },
    });
    mockWatchedValues = {
      language: GERMAN,
      currency: CHF,
      preferredPhoneTimes: ['H10To11'],
      acceptCall: true,
    };

    render(<SettingsScreen />);

    expect(mockSetValue).not.toHaveBeenCalled();
    expect(mockChangeLanguage).toHaveBeenCalledWith(GERMAN);
    expect(mockChangeCurrency).toHaveBeenCalledWith(CHF);
    expect(mockUpdateCallSettings).toHaveBeenCalledWith(['H10To11']);
    expect(mockUpdateCallSettings).toHaveBeenCalledWith(undefined, true);
    expect(screen.getByTestId('dropdown-preferredPhoneTimes')).toBeInTheDocument();
  });

  it('does not propagate unchanged form values', () => {
    mockUser = makeUser({
      kyc: { preferredPhoneTimes: ['H9To10'], phoneCallAccepted: true },
    });
    mockWatchedValues = {
      language: ENGLISH,
      currency: EUR,
      preferredPhoneTimes: ['H9To10'],
      acceptCall: true,
    };

    render(<SettingsScreen />);

    expect(mockSetValue).not.toHaveBeenCalled();
    expect(mockChangeLanguage).not.toHaveBeenCalled();
    expect(mockChangeCurrency).not.toHaveBeenCalled();
    expect(mockUpdateCallSettings).not.toHaveBeenCalled();
  });

  it('propagates form values changed after the initial render', () => {
    mockUser = makeUser({
      kyc: { preferredPhoneTimes: ['H9To10'], phoneCallAccepted: true },
    });
    mockWatchedValues = {
      language: ENGLISH,
      currency: EUR,
      preferredPhoneTimes: ['H9To10'],
      acceptCall: true,
    };

    const { rerender } = render(<SettingsScreen />);

    expect(mockChangeLanguage).not.toHaveBeenCalled();
    expect(mockChangeCurrency).not.toHaveBeenCalled();
    expect(mockUpdateCallSettings).not.toHaveBeenCalled();

    mockWatchedValues = {
      language: GERMAN,
      currency: CHF,
      preferredPhoneTimes: ['H10To11'],
      acceptCall: false,
    };
    rerender(<SettingsScreen />);

    expect(mockChangeLanguage).toHaveBeenCalledTimes(1);
    expect(mockChangeLanguage).toHaveBeenCalledWith(GERMAN);
    expect(mockChangeCurrency).toHaveBeenCalledTimes(1);
    expect(mockChangeCurrency).toHaveBeenCalledWith(CHF);
    expect(mockUpdateCallSettings).toHaveBeenCalledTimes(2);
    expect(mockUpdateCallSettings).toHaveBeenNthCalledWith(1, ['H10To11']);
    expect(mockUpdateCallSettings).toHaveBeenNthCalledWith(2, undefined, false);

    mockSetValue.mockClear();
    mockWatchedValues = { ...mockWatchedValues, acceptCall: undefined };
    mockUser = makeUser({
      kyc: { preferredPhoneTimes: ['H9To10'], phoneCallAccepted: false },
    });
    rerender(<SettingsScreen />);

    expect(mockSetValue).toHaveBeenCalledTimes(1);
    expect(mockSetValue).toHaveBeenCalledWith('acceptCall', false);
  });

  it('shows the completed verification-call notice', () => {
    mockUser = makeUser({ kyc: { phoneCallStatus: 'Completed' } });

    render(<SettingsScreen />);

    expect(
      screen.getByText('Your verification call has already been completed. There is nothing left to do.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('dropdown-acceptCall')).not.toBeInTheDocument();
  });

  it('requests another verification call after a failed call', () => {
    mockUser = makeUser({ kyc: { phoneCallStatus: 'Failed' } });

    render(<SettingsScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Request a new call' }));

    expect(mockNavigate).toHaveBeenCalledWith('/support/issue?issue-type=VerificationCall&reason=RepeatCall');
  });

  it('handles absent settings, preferred times, and a null call preference', () => {
    mockLanguage = undefined;
    mockCurrency = undefined;
    mockCurrencies = undefined;
    mockUser = makeUser({ kyc: { phoneCallAccepted: null } });

    render(<SettingsScreen />);

    expect(mockSetValue).not.toHaveBeenCalled();
    expect(screen.getByTestId('dropdown-currency')).toBeInTheDocument();
  });

  it('shows the bank-account spinner and hides address-dependent sections while the user loads', () => {
    mockIsLoadingBankAccounts = true;
    mockIsUserLoading = true;

    render(<SettingsScreen />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByTestId(`actionable-list-${BANK_LIST}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`actionable-list-${ADDRESS_LIST}`)).not.toBeInTheDocument();
    expect(mockLayoutOptions).toEqual({ title: 'Settings', onBack: undefined });
  });

  it('uses empty disabled addresses when there is no user', () => {
    const address = makeAddress({ address: 'orphan-address', label: undefined, wallet: 'Orphan wallet' });
    mockUserAddresses = [address];

    render(<SettingsScreen />);

    expect(screen.queryByTestId(`actionable-list-${BANK_LIST}`)).not.toBeInTheDocument();
    const item = screen.getByTestId(`item-${ADDRESS_LIST}-${address.address}`);
    expect(within(item).getByText('Orphan wallet')).toBeInTheDocument();
  });

  it('runs every bank-account and address action and closes overlays through the layout', () => {
    const activeAddress = makeAddress({
      address: 'active-address',
      wallet: 'Browser wallet',
      label: 'Primary',
      explorerUrl: 'https://explorer.example/active',
    });
    const disabledAddress = makeAddress({
      address: 'disabled-address',
      wallet: 'Ledger',
      label: undefined,
      explorerUrl: 'https://explorer.example/disabled',
      isCustody: false,
    });
    const custodyAddress = makeAddress({
      address: 'custody-address',
      wallet: 'Custody',
      isCustody: true,
    });
    const defaultAccount = { id: 1, iban: 'CH000000000000001111', default: true, label: 'Salary' };
    const secondaryAccount = { id: 2, iban: 'CH000000000000002222', default: false };

    mockUser = makeUser({
      kyc: { phoneCallAccepted: false },
      activeAddress,
      disabledAddresses: [custodyAddress, disabledAddress],
    });
    mockUserAddresses = [activeAddress];
    mockBankAccounts = [defaultAccount, secondaryAccount];
    mockWatchedValues = { language: ENGLISH, currency: EUR, acceptCall: false };
    mockFormatIban.mockImplementation((iban: string) =>
      iban === secondaryAccount.iban ? undefined : `formatted-${iban}`,
    );

    render(<SettingsScreen />);

    expect(mockLayoutOptions).toEqual({ title: 'Settings', onBack: undefined });
    expect(within(screen.getByTestId(`item-${BANK_LIST}-1`)).getByText('Salary')).toBeInTheDocument();
    expect(within(screen.getByTestId(`item-${BANK_LIST}-1`)).getByText('DEFAULT')).toBeInTheDocument();
    expect(within(screen.getByTestId(`item-${BANK_LIST}-2`)).getByText('CH 2222')).toBeInTheDocument();
    expect(screen.queryByTestId(`item-${ADDRESS_LIST}-${custodyAddress.address}`)).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId(`item-${ADDRESS_LIST}-${activeAddress.address}`)).getByText('ACTIVE'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId(`item-${ADDRESS_LIST}-${disabledAddress.address}`)).getByText('Ledger'),
    ).toBeInTheDocument();

    fireEvent.click(getMenuButton(BANK_LIST, defaultAccount.id, 'Copy'));
    expect(copy).toHaveBeenCalledWith(defaultAccount.iban);

    fireEvent.click(getMenuButton(BANK_LIST, secondaryAccount.id, 'Set default'));
    expect(mockUpdateAccount).toHaveBeenCalledWith(secondaryAccount.id, { default: true });

    fireEvent.click(getMenuButton(BANK_LIST, defaultAccount.id, 'Edit'));
    expect(mockLayoutOptions?.title).toBe('Edit bank account?');
    closeThroughLayout();
    expect(mockLayoutOptions).toEqual({ title: 'Settings', onBack: undefined });

    fireEvent.click(getMenuButton(BANK_LIST, secondaryAccount.id, 'Delete'));
    expect(mockLayoutOptions?.title).toBe('Delete bank account?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel overlay' }));

    fireEvent.click(screen.getByTestId(`add-${BANK_LIST}`));
    expect(mockLayoutOptions?.title).toBe('Add bank account?');
    fireEvent.click(screen.getByRole('button', { name: 'Submit bank account' }));

    fireEvent.click(getMenuButton(ADDRESS_LIST, activeAddress.address, 'Copy'));
    expect(copy).toHaveBeenCalledWith(activeAddress.address);

    fireEvent.click(getMenuButton(ADDRESS_LIST, activeAddress.address, 'Open Explorer'));
    expect(mockWindowOpen).toHaveBeenCalledWith(activeAddress.explorerUrl, '_blank');

    fireEvent.click(getMenuButton(ADDRESS_LIST, activeAddress.address, 'Rename'));
    expect(mockLayoutOptions?.title).toBe('Rename address?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel edit' }));

    fireEvent.click(getMenuButton(ADDRESS_LIST, activeAddress.address, 'Delete'));
    expect(mockLayoutOptions?.title).toBe('Delete address?');
    closeThroughLayout();

    fireEvent.click(screen.getByTestId(`add-${ADDRESS_LIST}`));
    expect(mockNavigate).toHaveBeenCalledWith('/connect');

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(mockLayoutOptions?.title).toBe('Delete account?');
    closeThroughLayout();
    expect(mockLayoutOptions).toEqual({ title: 'Settings', onBack: undefined });
  });
});

describe('SettingsOverlay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = makeUser();
    mockBankAccounts = [];
    mockFormatIban.mockImplementation((iban: string) => iban);
  });

  it('deletes the active address, resets the wallet, and supports cancellation', async () => {
    const address = makeAddress({ address: 'active-address' });
    const onClose = jest.fn();
    mockUser = makeUser({ activeAddress: address });

    render(
      <SettingsOverlay type={OverlayType.DELETE_ADDRESS} data={address as UserAddress} onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel overlay' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm overlay' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
    expect(mockDeleteAddress).toHaveBeenCalledWith(address.address);
    expect(mockSetWallet).toHaveBeenCalledTimes(1);
  });

  it('deletes a non-active address without resetting the wallet', async () => {
    const address = makeAddress({ address: 'other-address' });
    const onClose = jest.fn();
    mockUser = makeUser({ activeAddress: makeAddress({ address: 'active-address' }) });

    render(
      <SettingsOverlay type={OverlayType.DELETE_ADDRESS} data={address as UserAddress} onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm overlay' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockSetWallet).not.toHaveBeenCalled();
  });

  it('closes address deletion when no address data is supplied', async () => {
    const onClose = jest.fn();

    render(<SettingsOverlay type={OverlayType.DELETE_ADDRESS} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm overlay' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockDeleteAddress).not.toHaveBeenCalled();
  });

  it('deletes the account, resets the wallet, closes, and supports cancellation', async () => {
    const onClose = jest.fn();

    render(<SettingsOverlay type={OverlayType.DELETE_ACCOUNT} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel overlay' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm overlay' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(mockSetWallet).toHaveBeenCalledTimes(1);
  });

  it('renames an address with its label as prefill and supports cancellation', async () => {
    const address = makeAddress({ label: 'Old label', wallet: 'Wallet fallback' });
    const onClose = jest.fn();

    render(
      <SettingsOverlay type={OverlayType.RENAME_ADDRESS} data={address as UserAddress} onClose={onClose} />,
    );

    expect(screen.getByTestId('edit-prefill')).toHaveTextContent('Old label');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save edit' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
    expect(mockRenameAddress).toHaveBeenCalledWith(address.address, 'Renamed');
  });

  it('uses the wallet as rename prefill when the label is absent', () => {
    const address = makeAddress({ label: undefined, wallet: 'Wallet fallback' });

    render(
      <SettingsOverlay type={OverlayType.RENAME_ADDRESS} data={address as UserAddress} onClose={jest.fn()} />,
    );

    expect(screen.getByTestId('edit-prefill')).toHaveTextContent('Wallet fallback');
  });

  it('closes rename without calling the API when address data is absent', async () => {
    const onClose = jest.fn();

    render(<SettingsOverlay type={OverlayType.RENAME_ADDRESS} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save edit' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockRenameAddress).not.toHaveBeenCalled();
  });

  it('renders the bank editor and closes it', () => {
    const account = { id: 1, iban: 'CH0001', default: true };
    const onClose = jest.fn();

    render(
      <SettingsOverlay type={OverlayType.EDIT_BANK_ACCOUNT} data={account as BankAccount} onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close bank editor' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the add-bank-account form and closes after submit', () => {
    const onClose = jest.fn();

    render(<SettingsOverlay type={OverlayType.ADD_BANK_ACCOUNT} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Submit bank account' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('deletes a bank account using a formatted IBAN and supports cancellation', async () => {
    const account = { id: 7, iban: 'CH0007', default: false };
    const onClose = jest.fn();
    mockFormatIban.mockReturnValue('formatted-iban');

    render(
      <SettingsOverlay type={OverlayType.DELETE_BANK_ACCOUNT} data={account as BankAccount} onClose={onClose} />,
    );

    expect(screen.getByText(/formatted-iban/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel overlay' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm overlay' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
    expect(mockUpdateAccount).toHaveBeenCalledWith(account.id, { active: false });
  });

  it('falls back to the raw IBAN when formatting returns undefined', () => {
    const account = { id: 8, iban: 'CH0008', default: false };
    mockFormatIban.mockReturnValue(undefined);

    render(
      <SettingsOverlay type={OverlayType.DELETE_BANK_ACCOUNT} data={account as BankAccount} onClose={jest.fn()} />,
    );

    expect(screen.getByText(/CH0008/)).toBeInTheDocument();
  });

  it('renders nothing for NONE', () => {
    const { container } = render(<SettingsOverlay type={OverlayType.NONE} onClose={jest.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});
