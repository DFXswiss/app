import { fireEvent, render, screen } from '@testing-library/react';

const mockNavigate = jest.fn();
const mockUpdateCallSettings = jest.fn();

let mockUser: { kyc: Record<string, unknown>; disabledAddresses: unknown[] } | undefined;
let mockIsUserLoading = false;

jest.mock('@dfx.swiss/react', () => ({
  PhoneCallStatus: {
    COMPLETED: 'Completed',
    FAILED: 'Failed',
    REPEAT: 'Repeat',
    USER_REJECTED: 'UserRejected',
    UNAVAILABLE: 'Unavailable',
    SUSPICIOUS: 'Suspicious',
  },
  PhoneCallTime: {
    H_9_TO_10: 'H9To10',
  },
  Utils: {
    formatIban: (iban: string) => iban,
  },
  useUserContext: () => ({
    user: mockUser,
    isUserLoading: mockIsUserLoading,
    userAddresses: [],
    updateCallSettings: mockUpdateCallSettings,
  }),
  useFiatContext: () => ({ currencies: [] }),
  useBankAccountContext: () => ({ bankAccounts: undefined, updateAccount: jest.fn(), isLoading: false }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  Form: ({ children }: any) => <div>{children}</div>,
  SpinnerSize: { LG: 'lg' },
  StyledButton: ({ label, onClick }: { label: string; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  StyledButtonWidth: { FULL: 'full' },
  StyledDropdown: ({ label, name }: { label: string; name: string }) => (
    <div data-testid={`dropdown-${name}`}>{label}</div>
  ),
  StyledDropdownMultiChoice: ({ label, name }: { label: string; name: string }) => (
    <div data-testid={`dropdown-${name}`}>{label}</div>
  ),
  StyledLoadingSpinner: () => <div role="progressbar" />,
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('copy-to-clipboard', () => jest.fn());

jest.mock('react-i18next', () => ({
  Trans: ({ children }: any) => children,
}));

jest.mock('src/components/actionable-list', () => ({
  __esModule: true,
  default: () => <div data-testid="actionable-list" />,
}));

jest.mock('src/components/overlay/confirmation-overlay', () => ({
  ConfirmationOverlay: () => null,
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
  addressLabel: (wallet: { address?: string }) => wallet.address ?? '',
  PhoneCallTimeLabels: { H9To10: '09:00 - 10:00' },
}));

jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_key: string, text: string) => text,
    language: { id: 1, name: 'English', foreignName: 'EN' },
    currency: { id: 1, name: 'EUR' },
    availableLanguages: [{ id: 1, name: 'English', foreignName: 'EN' }],
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
  useAnchor: jest.fn(),
}));

jest.mock('src/hooks/guard.hook', () => ({
  useUserGuard: jest.fn(),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: jest.fn(),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

import SettingsScreen from '../screens/settings.screen';

const COMPLETED_TEXT = 'Your verification call has already been completed. There is nothing left to do.';
const FAILED_TEXT = 'We were unable to reach you by phone. You can request a new call here.';
const REQUEST_LABEL = 'Request a new call';
const EXPLANATION = 'Verification may require a phone call. Should we call you?';
const REPEAT_CALL_PATH = '/support/issue?issue-type=VerificationCall&reason=RepeatCall';

function renderSettings(kyc: Record<string, unknown> = {}) {
  mockUser = { kyc, disabledAddresses: [] };
  return render(<SettingsScreen />);
}

describe('Verification Call section', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsUserLoading = false;
    mockUser = undefined;
  });

  it('shows the completed notice and no call form when the call is completed', () => {
    renderSettings({ phoneCallStatus: 'Completed' });

    expect(screen.getByRole('heading', { name: 'Verification Call' })).toBeInTheDocument();
    expect(screen.getByText(COMPLETED_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(FAILED_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText(EXPLANATION)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: REQUEST_LABEL })).not.toBeInTheDocument();
    expect(screen.queryByTestId('dropdown-acceptCall')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dropdown-preferredPhoneTimes')).not.toBeInTheDocument();
  });

  it('shows the failed notice and navigates to a new call request', () => {
    renderSettings({ phoneCallStatus: 'Failed' });

    expect(screen.getByRole('heading', { name: 'Verification Call' })).toBeInTheDocument();
    expect(screen.getByText(FAILED_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(COMPLETED_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText(EXPLANATION)).not.toBeInTheDocument();
    expect(screen.queryByTestId('dropdown-acceptCall')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dropdown-preferredPhoneTimes')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: REQUEST_LABEL }));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(REPEAT_CALL_PATH);
  });

  it('shows the consent form when no call status is set', () => {
    renderSettings({});

    expect(screen.getByRole('heading', { name: 'Verification Call' })).toBeInTheDocument();
    expect(screen.getByText(EXPLANATION)).toBeInTheDocument();
    expect(screen.getByTestId('dropdown-acceptCall')).toBeInTheDocument();
    expect(screen.queryByTestId('dropdown-preferredPhoneTimes')).not.toBeInTheDocument();
    expect(screen.queryByText(COMPLETED_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText(FAILED_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: REQUEST_LABEL })).not.toBeInTheDocument();
  });

  it('shows the consent form and preferred times after a Repeat status with consent', async () => {
    renderSettings({ phoneCallStatus: 'Repeat', phoneCallAccepted: true });

    expect(screen.getByRole('heading', { name: 'Verification Call' })).toBeInTheDocument();
    expect(screen.getByText(EXPLANATION)).toBeInTheDocument();
    expect(screen.getByTestId('dropdown-acceptCall')).toBeInTheDocument();
    expect(await screen.findByTestId('dropdown-preferredPhoneTimes')).toBeInTheDocument();
    expect(screen.queryByText(COMPLETED_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText(FAILED_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: REQUEST_LABEL })).not.toBeInTheDocument();
  });
});
