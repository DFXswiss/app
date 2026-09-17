const LEGAL_NOTICE =
  'Deleting your account ends our business relationship. Under Swiss law we are required to retain all data for 10 years and then permanently delete it.';

jest.mock('@dfx.swiss/react', () => ({
  useBankAccountContext: () => ({
    bankAccounts: undefined,
    updateAccount: jest.fn(),
    isLoading: false,
  }),
  useFiatContext: () => ({
    currencies: [],
  }),
  useUserContext: () => ({
    user: undefined,
    isUserLoading: true,
    userAddresses: [],
    updateCallSettings: jest.fn(),
    deleteAddress: jest.fn(),
    deleteAccount: jest.fn(),
    renameAddress: jest.fn(),
  }),
  Utils: { formatIban: (iban: string) => iban },
  PhoneCallStatus: { COMPLETED: 'Completed', FAILED: 'Failed' },
  PhoneCallTime: {},
}));

jest.mock('@dfx.swiss/react-components', () => ({
  DfxIcon: ({ icon }: any) => <span data-testid="danger-zone-chevron" data-icon={icon} />,
  Form: ({ children }: any) => children,
  IconSize: { LG: 'lg' },
  IconVariant: { EXPAND_MORE: 'expand_more', EXPAND_LESS: 'expand_less' },
  SpinnerSize: { LG: 'lg' },
  StyledButton: ({ label, onClick }: any) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  StyledButtonWidth: { FULL: 'full' },
  StyledDropdown: () => null,
  StyledDropdownMultiChoice: () => null,
  StyledLoadingSpinner: () => null,
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('copy-to-clipboard', () => jest.fn());

jest.mock('react-hook-form', () => ({
  useForm: () => ({
    control: {},
    setValue: jest.fn(),
    formState: { errors: {} },
  }),
  useWatch: () => undefined,
}));

jest.mock('react-i18next', () => ({
  Trans: ({ children }: any) => children,
}));

jest.mock('src/components/actionable-list', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('src/components/overlay/confirmation-overlay', () => ({
  ConfirmationOverlay: ({ message, cancelLabel, confirmLabel, onCancel, onConfirm }: any) => (
    <div>
      <p>{message}</p>
      <button type="button" onClick={onCancel}>
        {cancelLabel}
      </button>
      <button type="button" onClick={onConfirm}>
        {confirmLabel}
      </button>
    </div>
  ),
}));

jest.mock('src/components/overlay/edit-bank-overlay', () => ({
  EditBankAccount: () => null,
}));

jest.mock('src/components/overlay/edit-overlay', () => ({
  EditOverlay: () => null,
}));

jest.mock('src/components/payment/add-bank-account', () => ({
  AddBankAccount: () => null,
}));

jest.mock('src/config/labels', () => ({
  addressLabel: (address: { address: string }) => address.address,
  PhoneCallTimeLabels: {},
}));

jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_namespace: string, text: string) => text,
    language: undefined,
    currency: undefined,
    availableLanguages: [],
    changeLanguage: jest.fn(),
    changeCurrency: jest.fn(),
  }),
}));

jest.mock('src/contexts/wallet.context', () => ({
  useWalletContext: () => ({ setWallet: jest.fn() }),
}));

jest.mock('src/contexts/window.context', () => ({
  useWindowContext: () => ({ width: 1024 }),
}));

jest.mock('src/hooks/anchor.hook', () => ({
  useAnchor: () => undefined,
}));

jest.mock('src/hooks/guard.hook', () => ({
  useUserGuard: () => undefined,
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('src/util/utils', () => ({
  blankedAddress: (value: string) => value,
  sortAddressesByBlockchain: () => 0,
}));

import { fireEvent, render, screen } from '@testing-library/react';
import SettingsScreen from 'src/screens/settings.screen';

describe('Settings Danger Zone', () => {
  it('renders the Danger Zone control and hides delete copy while collapsed', () => {
    render(<SettingsScreen />);

    expect(screen.getByRole('button', { name: 'Danger Zone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Danger Zone' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument();
    expect(screen.queryByText(LEGAL_NOTICE)).not.toBeInTheDocument();
  });

  it('toggles the legal notice and Delete account when Danger Zone is clicked', () => {
    render(<SettingsScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Danger Zone' }));

    expect(screen.getByRole('button', { name: 'Danger Zone' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(LEGAL_NOTICE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Danger Zone' }));

    expect(screen.getByRole('button', { name: 'Danger Zone' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(LEGAL_NOTICE)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument();
  });

  it('opens the delete-account overlay with the same legal notice', () => {
    render(<SettingsScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Danger Zone' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));

    expect(screen.getByText(LEGAL_NOTICE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });
});
