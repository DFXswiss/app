// Saved-flash on Settings language/currency: a real change (id !== current) must show the
// Cointracking-style Saved! overlay for 2s. Initial setValue copies context values and must not flash.

const mockChangeLanguage = jest.fn();
const mockChangeCurrency = jest.fn();
const mockUpdateCallSettings = jest.fn();
const mockUpdateAccount = jest.fn();
const mockDeleteAddress = jest.fn();
const mockDeleteAccount = jest.fn();
const mockRenameAddress = jest.fn();
const mockSetWallet = jest.fn();
const mockNavigate = jest.fn();
const mockUseLayoutOptions = jest.fn();
const mockFormatIban = jest.fn((iban: string) => iban);
const mockCopy = jest.fn();
const mockTranslate = (_ns: string, key: string) => key;
const mockGerman = { id: 1, name: 'German', foreignName: 'Deutsch', symbol: 'DE' };
const mockEnglish = { id: 2, name: 'English', foreignName: 'English', symbol: 'EN' };
const mockFrench = { id: 3, name: 'French', foreignName: 'Français', symbol: 'FR' };
const mockEur = { id: 1, name: 'EUR' };
const mockChf = { id: 2, name: 'CHF' };
let mockLanguage: any = mockGerman;
let mockCurrency: any = mockEur;
let mockAvailableLanguages: any[] = [mockGerman, mockEnglish, mockFrench];
let mockCurrencies: any[] | undefined = [mockEur, mockChf];
let mockIsUserLoading = true;
let mockUser: any = undefined;
let mockUserAddresses: any[] = [];
let mockBankAccounts: any[] | undefined = [];
let mockIsLoadingBankAccounts = true;

jest.mock('@dfx.swiss/react', () => ({
  PhoneCallStatus: { COMPLETED: 'Completed', FAILED: 'Failed', PENDING: 'Pending' },
  PhoneCallTime: { H_9_TO_10: 'H9To10', H_10_TO_11: 'H10To11' },
  Utils: { formatIban: (iban: string) => mockFormatIban(iban) },
  useFiatContext: () => ({ currencies: mockCurrencies }),
  useUserContext: () => ({
    user: mockUser,
    isUserLoading: mockIsUserLoading,
    userAddresses: [...mockUserAddresses],
    updateCallSettings: mockUpdateCallSettings,
    deleteAddress: mockDeleteAddress,
    deleteAccount: mockDeleteAccount,
    renameAddress: mockRenameAddress,
  }),
  useBankAccountContext: () => ({
    bankAccounts: mockBankAccounts,
    updateAccount: mockUpdateAccount,
    isLoading: mockIsLoadingBankAccounts,
  }),
}));

jest.mock('@dfx.swiss/react-components', () => {
  // babel-plugin-jest-hoist moves this factory above the module's imports, so React and
  // react-hook-form are not yet in scope here and must be required directly instead.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Controller } = require('react-hook-form');

  // Mirror the real Form: inject `control` into descendants that declare `name`.
  function enrich(elements: any, control: any): any {
    if (!elements) return elements;
    return React.Children.map(elements, (element: any) => {
      if (!React.isValidElement(element)) return element;
      const props: any = element.props;
      const newChildren = enrich(props.children, control);
      if (props.name) {
        return React.cloneElement(element, { control, children: newChildren });
      }
      return React.cloneElement(element, { children: newChildren });
    });
  }

  return {
    Form: ({ children, control }: any) => <div>{enrich(children, control)}</div>,
    DfxIcon: ({ icon }: { icon: string }) => <span data-testid="danger-zone-chevron" data-icon={icon} />,
    IconSize: { SM: 'sm', LG: 'lg' },
    IconVariant: { EXPAND_MORE: 'expand_more', EXPAND_LESS: 'expand_less' },
    SpinnerSize: { SM: 'sm', LG: 'lg' },
    StyledButton: ({ label, onClick }: any) => (
      <button type="button" onClick={onClick}>
        {label}
      </button>
    ),
    StyledButtonWidth: { MIN: 'min', FULL: 'full' },
    StyledDropdown: ({ name, items, labelFunc, descriptionFunc, control }: any) => (
      <Controller
        name={name}
        control={control}
        render={({ field }: any) => (
          <div data-testid={`dropdown-${name}`}>
            {(items ?? []).map((item: any, index: number) => (
              <button
                key={`${labelFunc(item)}-${index}`}
                type="button"
                data-testid={`select-${name}-${labelFunc(item)}`}
                onClick={() => field.onChange(item)}
              >
                {labelFunc(item)}
                {descriptionFunc?.(item)}
              </button>
            ))}
          </div>
        )}
      />
    ),
    StyledDropdownMultiChoice: ({ name, items, labelFunc, control }: any) => (
      <Controller
        name={name}
        control={control}
        render={({ field }: any) => (
          <div data-testid={`dropdown-${name}`}>
            {(items ?? []).map((item: any, index: number) => (
              <button
                key={`${labelFunc(item)}-${index}`}
                type="button"
                data-testid={`select-${name}-${labelFunc(item)}`}
                onClick={() => field.onChange([item])}
              >
                {labelFunc(item)}
              </button>
            ))}
          </div>
        )}
      />
    ),
    StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
    StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
  };
});

jest.mock('src/components/actionable-list', () => ({
  __esModule: true,
  default: ({ label, addButtonOnClick, items }: any) => (
    <div>
      <div>{label}</div>
      <button type="button" data-testid={`list-add-${label}`} onClick={addButtonOnClick}>
        Add
      </button>
      {(items ?? []).map((item: any) => (
        <div key={item.key}>
          <span>{item.label}</span>
          <span>{item.subLabel}</span>
          <span>{item.tag}</span>
          {(item.menuItems ?? []).map((menu: any) => (
            <button
              key={`${item.key}-${menu.label}`}
              type="button"
              data-testid={`menu-${item.key}-${menu.label}`}
              onClick={menu.onClick}
            >
              {menu.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  ),
}));
jest.mock('src/components/overlay/confirmation-overlay', () => ({
  ConfirmationOverlay: ({ message, messageContent, onConfirm, onCancel }: any) => (
    <div data-testid="confirmation-overlay">
      {message}
      {messageContent}
      <button type="button" data-testid="overlay-confirm" onClick={() => onConfirm()}>
        Confirm
      </button>
      <button type="button" data-testid="overlay-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  ),
}));
jest.mock('src/components/overlay/edit-bank-overlay', () => ({
  EditBankAccount: ({ onClose }: any) => (
    <div data-testid="edit-bank">
      <button type="button" data-testid="edit-bank-close" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));
jest.mock('src/components/overlay/edit-overlay', () => ({
  EditOverlay: ({ prefill, onEdit, onCancel }: any) => (
    <div>
      <div data-testid="edit-prefill">{prefill}</div>
      <button type="button" data-testid="edit-confirm" onClick={() => onEdit('New name')}>
        Confirm
      </button>
      <button type="button" data-testid="edit-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  ),
}));
jest.mock('src/components/payment/add-bank-account', () => ({
  AddBankAccount: ({ onSubmit }: any) => (
    <div data-testid="add-bank">
      <button type="button" data-testid="add-bank-submit" onClick={() => onSubmit({})}>
        Submit
      </button>
    </div>
  ),
}));
jest.mock('copy-to-clipboard', () => (...args: unknown[]) => mockCopy(...args));
jest.mock('react-i18next', () => ({
  Trans: ({ children }: any) => children,
}));
jest.mock('src/config/labels', () => ({
  addressLabel: (wallet: any) => wallet?.address ?? '',
  PhoneCallTimeLabels: { H9To10: '09:00 - 10:00', H10To11: '10:00 - 11:00' },
}));
jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));
jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: mockTranslate,
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
  useWindowContext: () => ({ width: 800 }),
}));
jest.mock('src/hooks/anchor.hook', () => ({
  useAnchor: () => undefined,
}));
jest.mock('src/hooks/guard.hook', () => ({
  useUserGuard: () => undefined,
}));
jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: (options: any) => mockUseLayoutOptions(options),
}));
jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('src/util/utils', () => ({
  blankedAddress: (address: string) => address,
  sortAddressesByBlockchain: (_a: unknown, _b: unknown) => 0,
}));

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import SettingsScreen, { OverlayType, SettingsOverlay } from 'src/screens/settings.screen';

describe('SettingsScreen language and currency saved flash', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockAvailableLanguages = [mockGerman, mockEnglish, mockFrench];
    mockCurrencies = [mockEur, mockChf];
    mockLanguage = mockGerman;
    mockCurrency = mockEur;
    mockIsUserLoading = true;
    mockUser = undefined;
    mockUserAddresses = [];
    mockBankAccounts = [];
    mockIsLoadingBankAccounts = true;
    mockFormatIban.mockImplementation((iban: string) => iban);
    mockUpdateCallSettings.mockResolvedValue(undefined);
    mockUpdateAccount.mockResolvedValue(undefined);
    mockDeleteAddress.mockResolvedValue(undefined);
    mockDeleteAccount.mockResolvedValue(undefined);
    mockRenameAddress.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('keeps both saved overlays hidden on initial render without calling change handlers', () => {
    render(<SettingsScreen />);

    expect(screen.getByTestId('settings-saved-language')).toHaveClass('opacity-0');
    expect(screen.getByTestId('settings-saved-currency')).toHaveClass('opacity-0');
    expect(screen.getByTestId('settings-saved-language')).toHaveTextContent('Saved!');
    expect(screen.getByTestId('settings-saved-currency')).toHaveTextContent('Saved!');
    expect(mockChangeLanguage).not.toHaveBeenCalled();
    expect(mockChangeCurrency).not.toHaveBeenCalled();
  });

  it('flashes only the language overlay after selecting a different language', () => {
    render(<SettingsScreen />);

    act(() => {
      fireEvent.click(screen.getByTestId('select-language-English'));
    });

    expect(mockChangeLanguage).toHaveBeenCalledTimes(1);
    expect(mockChangeLanguage).toHaveBeenCalledWith(mockEnglish);
    expect(screen.getByTestId('settings-saved-language')).toHaveClass('opacity-100');
    expect(screen.getByTestId('settings-saved-currency')).toHaveClass('opacity-0');
  });

  it('hides the language overlay after 2000ms', () => {
    render(<SettingsScreen />);

    act(() => {
      fireEvent.click(screen.getByTestId('select-language-English'));
    });
    expect(screen.getByTestId('settings-saved-language')).toHaveClass('opacity-100');

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.getByTestId('settings-saved-language')).toHaveClass('opacity-0');
  });

  it('flashes the currency overlay after selecting a different currency', () => {
    render(<SettingsScreen />);

    act(() => {
      fireEvent.click(screen.getByTestId('select-currency-CHF'));
    });

    expect(mockChangeCurrency).toHaveBeenCalledTimes(1);
    expect(mockChangeCurrency).toHaveBeenCalledWith(mockChf);
    expect(screen.getByTestId('settings-saved-currency')).toHaveClass('opacity-100');
  });

  it('does not flash or call changeLanguage when the already selected language is clicked', () => {
    render(<SettingsScreen />);

    act(() => {
      fireEvent.click(screen.getByTestId('select-language-German'));
    });

    expect(mockChangeLanguage).not.toHaveBeenCalled();
    expect(screen.getByTestId('settings-saved-language')).toHaveClass('opacity-0');
    expect(screen.getByTestId('settings-saved-language')).not.toHaveClass('opacity-100');
  });

  it('does not throw when unmounted while the language overlay timer is pending', () => {
    const { unmount } = render(<SettingsScreen />);

    act(() => {
      fireEvent.click(screen.getByTestId('select-language-English'));
    });
    expect(screen.getByTestId('settings-saved-language')).toHaveClass('opacity-100');

    unmount();

    expect(() => {
      act(() => {
        jest.advanceTimersByTime(2000);
      });
    }).not.toThrow();
  });
});

describe('Settings screen remaining coverage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockAvailableLanguages = [mockGerman, mockEnglish, mockFrench];
    mockCurrencies = [mockEur, mockChf];
    mockLanguage = mockGerman;
    mockCurrency = mockEur;
    mockIsUserLoading = true;
    mockUser = undefined;
    mockUserAddresses = [];
    mockBankAccounts = [];
    mockIsLoadingBankAccounts = true;
    mockFormatIban.mockImplementation((iban: string) => iban);
    mockUpdateCallSettings.mockResolvedValue(undefined);
    mockUpdateAccount.mockResolvedValue(undefined);
    mockDeleteAddress.mockResolvedValue(undefined);
    mockDeleteAccount.mockResolvedValue(undefined);
    mockRenameAddress.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function loadUser(overrides: any = {}) {
    mockIsUserLoading = false;
    mockUser = {
      kyc: {
        phoneCallAccepted: null,
        preferredPhoneTimes: [],
        phoneCallStatus: undefined,
        ...overrides.kyc,
      },
      activeAddress: overrides.activeAddress,
      disabledAddresses: overrides.disabledAddresses ?? [],
      ...overrides.user,
    };
  }

  it('re-flashes when English and then French are selected before two seconds', () => {
    jest.useFakeTimers();
    render(<SettingsScreen />);

    fireEvent.click(screen.getByTestId('select-language-English'));
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    fireEvent.click(screen.getByTestId('select-language-French'));

    expect(mockChangeLanguage).toHaveBeenNthCalledWith(1, mockEnglish);
    expect(mockChangeLanguage).toHaveBeenNthCalledWith(2, mockFrench);
    expect(screen.getByTestId('settings-saved-language')).toHaveClass('opacity-100');

    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('hydrates preferred phone times without updating equal call settings', () => {
    loadUser({
      kyc: {
        phoneCallAccepted: true,
        preferredPhoneTimes: ['H9To10'],
        phoneCallStatus: undefined,
      },
    });

    render(<SettingsScreen />);

    expect(screen.getByText('Verification Call')).toBeInTheDocument();
    expect(screen.getByTestId('select-preferredPhoneTimes-09:00 - 10:00')).toBeInTheDocument();
    expect(mockUpdateCallSettings).not.toHaveBeenCalled();
  });

  it('hydrates accept call from the user when the watched value is null', () => {
    loadUser({
      kyc: {
        phoneCallAccepted: true,
        preferredPhoneTimes: [],
        phoneCallStatus: 'Pending',
      },
    });

    render(<SettingsScreen />);

    expect(screen.getByText('Verification Call')).toBeInTheDocument();
    expect(screen.getByTestId('select-preferredPhoneTimes-09:00 - 10:00')).toBeInTheDocument();
    expect(mockUpdateCallSettings).not.toHaveBeenCalled();
  });

  it('updates call settings when preferred phone times change', () => {
    loadUser({
      kyc: {
        phoneCallAccepted: true,
        preferredPhoneTimes: ['H10To11'],
        phoneCallStatus: 'Pending',
      },
    });
    render(<SettingsScreen />);

    fireEvent.click(screen.getByTestId('select-preferredPhoneTimes-09:00 - 10:00'));

    expect(mockUpdateCallSettings).toHaveBeenCalledWith(['H9To10']);
  });

  it('updates call settings when accept call changes', () => {
    loadUser({
      kyc: {
        phoneCallAccepted: false,
        preferredPhoneTimes: [],
        phoneCallStatus: 'Pending',
      },
    });
    render(<SettingsScreen />);

    fireEvent.click(screen.getByTestId('select-acceptCall-Yes, call me'));

    expect(mockUpdateCallSettings).toHaveBeenCalledWith(undefined, true);
  });

  it('shows the bank-account loading spinner', () => {
    render(<SettingsScreen />);

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('does not offer adding a bank account when loaded bank accounts are absent', () => {
    mockIsLoadingBankAccounts = false;
    mockBankAccounts = undefined as any;
    const undefinedAccounts = render(<SettingsScreen />);

    expect(screen.queryByTestId('list-add-Your Bank Accounts')).not.toBeInTheDocument();

    undefinedAccounts.unmount();
    mockBankAccounts = null as any;
    render(<SettingsScreen />);

    expect(screen.queryByTestId('list-add-Your Bank Accounts')).not.toBeInTheDocument();
  });

  it('supports bank account default, copy, edit, delete, and add actions', async () => {
    const mainIban = 'DE111111111';
    const secondaryIban = 'CH9300762011623852957';
    mockIsLoadingBankAccounts = false;
    mockBankAccounts = [
      { id: 1, label: 'Main', iban: mainIban, default: true },
      { id: 2, iban: secondaryIban, default: false },
    ];
    mockFormatIban.mockReturnValue(undefined);
    render(<SettingsScreen />);

    expect(screen.getByText('DEFAULT')).toBeInTheDocument();
    expect(screen.queryByTestId('menu-1-Set default')).not.toBeInTheDocument();
    expect(screen.getByTestId('menu-2-Set default')).toBeInTheDocument();
    expect(document.body).toHaveTextContent(secondaryIban.slice(0, 8));
    expect(document.body).toHaveTextContent(secondaryIban);

    fireEvent.click(screen.getByTestId('menu-2-Set default'));
    expect(mockUpdateAccount).toHaveBeenCalledWith(2, { default: true });

    fireEvent.click(screen.getByTestId('menu-1-Copy'));
    expect(mockCopy).toHaveBeenCalledWith(mainIban);

    fireEvent.click(screen.getByTestId('menu-1-Edit'));
    expect(screen.getByTestId('edit-bank')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('edit-bank-close'));
    expect(screen.queryByTestId('edit-bank')).not.toBeInTheDocument();
    expect(mockUseLayoutOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Settings', onBack: undefined }),
    );

    fireEvent.click(screen.getByTestId('menu-2-Delete'));
    expect(screen.getByTestId('confirmation-overlay')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId('overlay-confirm'));
    });
    expect(mockUpdateAccount).toHaveBeenCalledWith(2, { active: false });

    fireEvent.click(screen.getByTestId('list-add-Your Bank Accounts'));
    expect(screen.getByTestId('add-bank')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('add-bank-submit'));
    expect(screen.queryByTestId('add-bank')).not.toBeInTheDocument();
  });

  it('renders active, wallet fallback, and non-custody disabled addresses', () => {
    loadUser({
      activeAddress: { address: '0xactive', wallet: 'MetaMask', label: 'Primary', isCustody: false },
      disabledAddresses: [
        { address: '0xdead', wallet: 'Old', isCustody: false },
        { address: '0xcust', wallet: 'Cust', isCustody: true },
      ],
    });
    mockUserAddresses = [
      { address: '0xactive', wallet: 'MetaMask', label: 'Primary', isCustody: false },
      { address: '0xsecond', wallet: 'Ledger', isCustody: false },
    ];
    render(<SettingsScreen />);

    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('Ledger')).toBeInTheDocument();
    expect(screen.getByText('Old')).toBeInTheDocument();
    expect(screen.queryByText('Cust')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('0xcust');
  });

  it('copies an address', () => {
    loadUser();
    mockUserAddresses = [{ address: '0xcopy', wallet: 'MetaMask', label: 'Copy me', isCustody: false }];
    render(<SettingsScreen />);

    fireEvent.click(screen.getByTestId('menu-0xcopy-Copy'));

    expect(mockCopy).toHaveBeenCalledWith('0xcopy');
  });

  it('opens an address in the explorer', () => {
    const explorerUrl = 'https://explorer.example/address/0xexplore';
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    loadUser();
    mockUserAddresses = [
      { address: '0xexplore', wallet: 'MetaMask', label: 'Explore', explorerUrl, isCustody: false },
    ];
    render(<SettingsScreen />);

    fireEvent.click(screen.getByTestId('menu-0xexplore-Open Explorer'));

    expect(openSpy).toHaveBeenCalledWith(explorerUrl, '_blank');
    openSpy.mockRestore();
  });

  it('renames an enabled address', async () => {
    loadUser();
    mockUserAddresses = [{ address: '0xrename', wallet: 'MetaMask', label: 'Current name', isCustody: false }];
    render(<SettingsScreen />);

    fireEvent.click(screen.getByTestId('menu-0xrename-Rename'));
    expect(screen.getByTestId('edit-prefill')).toHaveTextContent('Current name');
    await act(async () => {
      fireEvent.click(screen.getByTestId('edit-confirm'));
    });

    expect(mockRenameAddress).toHaveBeenCalledWith('0xrename', 'New name');
  });

  it('deletes an enabled non-active address without clearing the wallet', async () => {
    loadUser({ activeAddress: { address: '0xactive', wallet: 'MetaMask', isCustody: false } });
    mockUserAddresses = [{ address: '0xother', wallet: 'Ledger', label: 'Other', isCustody: false }];
    render(<SettingsScreen />);

    fireEvent.click(screen.getByTestId('menu-0xother-Delete'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('overlay-confirm'));
    });

    expect(mockDeleteAddress).toHaveBeenCalledWith('0xother');
    expect(mockSetWallet).not.toHaveBeenCalled();
  });

  it('deletes the active address and clears the wallet', async () => {
    loadUser({ activeAddress: { address: '0xactive', wallet: 'MetaMask', label: 'Active', isCustody: false } });
    mockUserAddresses = [
      { address: '0xactive', wallet: 'MetaMask', label: 'Active', isCustody: false },
    ];
    render(<SettingsScreen />);

    fireEvent.click(screen.getByTestId('menu-0xactive-Delete'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('overlay-confirm'));
    });

    expect(mockDeleteAddress).toHaveBeenCalledWith('0xactive');
    expect(mockSetWallet).toHaveBeenCalledWith();
  });

  it('navigates to connect when adding an address', () => {
    loadUser();
    mockUserAddresses = [];
    render(<SettingsScreen />);

    fireEvent.click(screen.getByTestId('list-add-Your Addresses'));

    expect(mockNavigate).toHaveBeenCalledWith('/connect');
  });

  it('shows verification call settings for undefined and pending status', () => {
    loadUser({ kyc: { phoneCallAccepted: false, preferredPhoneTimes: [], phoneCallStatus: undefined } });
    const undefinedStatus = render(<SettingsScreen />);
    expect(screen.getByText('Verification Call')).toBeInTheDocument();

    undefinedStatus.unmount();
    loadUser({ kyc: { phoneCallAccepted: false, preferredPhoneTimes: [], phoneCallStatus: 'Pending' } });
    render(<SettingsScreen />);
    expect(screen.getByText('Verification Call')).toBeInTheDocument();
  });

  it('hides verification call settings for completed and failed status', () => {
    loadUser({ kyc: { phoneCallAccepted: false, preferredPhoneTimes: [], phoneCallStatus: 'Completed' } });
    const completed = render(<SettingsScreen />);
    expect(screen.queryByText('Verification Call')).not.toBeInTheDocument();

    completed.unmount();
    loadUser({ kyc: { phoneCallAccepted: false, preferredPhoneTimes: [], phoneCallStatus: 'Failed' } });
    render(<SettingsScreen />);
    expect(screen.queryByText('Verification Call')).not.toBeInTheDocument();
  });

  it('shows preferred times only when accept call is true', () => {
    loadUser({ kyc: { phoneCallAccepted: true, preferredPhoneTimes: [], phoneCallStatus: 'Pending' } });
    const accepted = render(<SettingsScreen />);
    expect(screen.getByTestId('select-preferredPhoneTimes-09:00 - 10:00')).toBeInTheDocument();

    accepted.unmount();
    loadUser({ kyc: { phoneCallAccepted: false, preferredPhoneTimes: [], phoneCallStatus: 'Pending' } });
    render(<SettingsScreen />);
    expect(screen.queryByTestId('select-preferredPhoneTimes-09:00 - 10:00')).not.toBeInTheDocument();
  });

  it('keeps delete account collapsed until danger zone is opened', () => {
    render(<SettingsScreen />);

    expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Danger Zone' }));
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeInTheDocument();
  });

  it('deletes the account and clears the wallet', async () => {
    loadUser();
    render(<SettingsScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Danger Zone' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(screen.getByTestId('confirmation-overlay')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId('overlay-confirm'));
    });

    expect(mockDeleteAccount).toHaveBeenCalledWith();
    expect(mockSetWallet).toHaveBeenCalledWith();
  });

  it('sets and restores layout options around the delete-account overlay', () => {
    loadUser();
    render(<SettingsScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Danger Zone' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(mockUseLayoutOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Delete account?', onBack: expect.any(Function) }),
    );

    const onBack = mockUseLayoutOptions.mock.calls.at(-1)[0].onBack as () => void;
    act(() => {
      onBack();
    });
    expect(mockUseLayoutOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Settings', onBack: undefined }),
    );
  });

  it('closes a delete-address overlay with no address data', async () => {
    const onClose = jest.fn();
    render(<SettingsOverlay type={OverlayType.DELETE_ADDRESS} data={undefined} onClose={onClose} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('overlay-confirm'));
    });

    expect(mockDeleteAddress).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith();
  });

  it('uses the wallet fallback when renaming and safely handles missing rename data', async () => {
    const onClose = jest.fn();
    const withWallet = render(
      <SettingsOverlay
        type={OverlayType.RENAME_ADDRESS}
        data={{ address: '0xabc', wallet: 'MetaMask' }}
        onClose={onClose}
      />,
    );
    expect(screen.getByTestId('edit-prefill')).toHaveTextContent('MetaMask');
    withWallet.unmount();

    render(<SettingsOverlay type={OverlayType.RENAME_ADDRESS} data={undefined} onClose={onClose} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('edit-confirm'));
    });

    expect(mockRenameAddress).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith();
  });

  it('renders no overlay for the none type', () => {
    render(<SettingsOverlay type={OverlayType.NONE} onClose={jest.fn()} />);

    expect(screen.queryByTestId('confirmation-overlay')).not.toBeInTheDocument();
    expect(screen.queryByTestId('edit-bank')).not.toBeInTheDocument();
    expect(screen.queryByTestId('add-bank')).not.toBeInTheDocument();
  });

  it('renders settings when currencies are unavailable', () => {
    mockCurrencies = undefined as any;

    render(<SettingsScreen />);

    expect(screen.queryByTestId('select-currency-CHF')).not.toBeInTheDocument();
  });

  it('skips language and currency hydration when context values are missing', () => {
    mockLanguage = undefined;
    mockCurrency = undefined;
    render(<SettingsScreen />);

    expect(mockChangeLanguage).not.toHaveBeenCalled();
    expect(mockChangeCurrency).not.toHaveBeenCalled();
    expect(screen.getByTestId('settings-saved-language')).toHaveClass('opacity-0');
    expect(screen.getByTestId('settings-saved-currency')).toHaveClass('opacity-0');
  });

  it('treats addresses as enabled when the user is missing', () => {
    mockIsUserLoading = false;
    mockUser = undefined;
    mockUserAddresses = [{ address: '0xorphan', wallet: 'Wallet', explorerUrl: 'https://ex', label: 'Orphan' }];
    render(<SettingsScreen />);

    expect(screen.getByText('Orphan')).toBeInTheDocument();
  });
});
