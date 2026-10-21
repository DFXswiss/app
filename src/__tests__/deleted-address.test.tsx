import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeletedAddressGate } from 'src/components/deleted-address-notice';
import { isDeletedSessionAddress, shouldHoldForUser } from 'src/util/deleted-address';

const mockCall = jest.fn();
const mockUpdateSession = jest.fn();
const mockReloadUser = jest.fn();
let mockUser: { activeAddress?: { status?: string } } | undefined;
let mockLoading = false;
let mockLoggedIn = true;
let mockInitialized = true;

jest.mock('@dfx.swiss/react', () => ({
  useUserContext: () => ({ user: mockUser, isUserLoading: mockLoading, reloadUser: mockReloadUser }),
  useApiSession: () => ({ isInitialized: mockInitialized, isLoggedIn: mockLoggedIn, updateSession: mockUpdateSession }),
  useApi: () => ({ call: mockCall }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { LG: 'lg' },
  StyledLoadingSpinner: () => <div>loading</div>,
  StyledButtonWidth: { MIN: 'min' },
  StyledVerticalStack: ({ children }: { children?: unknown }) => <div>{children as JSX.Element}</div>,
  StyledButton: ({ label, onClick }: { label: string; onClick?: () => void }) => (
    <button onClick={onClick}>{label}</button>
  ),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_key: string, value: string) => value }),
}));

describe('deleted session address', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = undefined;
    mockLoading = false;
    mockLoggedIn = true;
    mockInitialized = true;
    mockReloadUser.mockResolvedValue(undefined);
  });

  it('recognises only the signed-in address when its status is Deleted', () => {
    expect(isDeletedSessionAddress(undefined)).toBe(false);
    expect(isDeletedSessionAddress({ activeAddress: { status: 'Active' } })).toBe(false);
    expect(isDeletedSessionAddress({ activeAddress: { status: 'Blocked' } })).toBe(false);
    expect(isDeletedSessionAddress({ activeAddress: { status: 'Deleted' } })).toBe(true);
  });

  it('holds the app until a signed-in user record has been loaded', () => {
    expect(
      shouldHoldForUser({
        isInitialized: false,
        isLoggedIn: false,
        hasUser: false,
        isUserLoading: false,
        sawLoad: false,
      }),
    ).toBe(true);
    expect(
      shouldHoldForUser({
        isInitialized: true,
        isLoggedIn: false,
        hasUser: false,
        isUserLoading: false,
        sawLoad: false,
      }),
    ).toBe(false);
    expect(
      shouldHoldForUser({
        isInitialized: true,
        isLoggedIn: true,
        hasUser: false,
        isUserLoading: false,
        sawLoad: false,
      }),
    ).toBe(true);
    expect(
      shouldHoldForUser({ isInitialized: true, isLoggedIn: true, hasUser: true, isUserLoading: false, sawLoad: true }),
    ).toBe(false);
  });

  it('shows the deleted-address notice and activates the address', async () => {
    mockUser = { activeAddress: { status: 'Deleted' } };
    mockCall.mockResolvedValue({ accessToken: 'next-token' });

    render(
      <DeletedAddressGate>
        <div>app</div>
      </DeletedAddressGate>,
    );

    expect(screen.queryByText('app')).not.toBeInTheDocument();
    expect(screen.getByText('This address was deleted. You can activate it again.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Activate address' }));

    await waitFor(() => {
      expect(mockUpdateSession).toHaveBeenCalledWith('next-token');
    });
    expect(mockCall).toHaveBeenCalledWith({ url: 'user/reactivate', version: 'v2', method: 'PUT' });
    expect(mockReloadUser).toHaveBeenCalled();
  });

  it('renders the app when the signed-in address is active', () => {
    mockUser = { activeAddress: { status: 'Active' } };

    render(
      <DeletedAddressGate>
        <div>app</div>
      </DeletedAddressGate>,
    );

    expect(screen.getByText('app')).toBeInTheDocument();
  });
});
