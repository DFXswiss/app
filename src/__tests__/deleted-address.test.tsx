import { User, UserStatus } from '@dfx.swiss/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeletedAddressGate } from 'src/components/deleted-address-notice';
import { setPasskeySigningIn } from 'src/components/home/wallet/passkey-session';
import { isDeletedSessionAddress, shouldHoldForUser } from 'src/util/deleted-address';

const mockReactivateAddress = jest.fn();
const mockReloadUser = jest.fn();
let mockUser: User | undefined;
let mockLoading = false;
let mockLoggedIn = true;
let mockInitialized = true;

jest.mock('@dfx.swiss/react', () => ({
  UserStatus: { NA: 'NA', ACTIVE: 'Active', BLOCKED: 'Blocked', DELETED: 'Deleted' },
  useUserContext: () => ({
    user: mockUser,
    isUserLoading: mockLoading,
    reactivateAddress: mockReactivateAddress,
    reloadUser: mockReloadUser,
  }),
  useApiSession: () => ({ isInitialized: mockInitialized, isLoggedIn: mockLoggedIn }),
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

function userWithActiveAddress(status: UserStatus): User {
  return { activeAddress: { status } } as User;
}

describe('deleted session address', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = undefined;
    mockLoading = false;
    mockLoggedIn = true;
    mockInitialized = true;
    mockReactivateAddress.mockResolvedValue(undefined);
    mockReloadUser.mockResolvedValue(undefined);
  });

  afterEach(() => {
    setPasskeySigningIn(false);
  });

  it('recognises only the signed-in address when its status is Deleted', () => {
    expect(isDeletedSessionAddress(undefined)).toBe(false);
    expect(isDeletedSessionAddress({} as User)).toBe(false);
    expect(isDeletedSessionAddress(userWithActiveAddress(UserStatus.ACTIVE))).toBe(false);
    expect(isDeletedSessionAddress(userWithActiveAddress(UserStatus.BLOCKED))).toBe(false);
    expect(isDeletedSessionAddress(userWithActiveAddress(UserStatus.DELETED))).toBe(true);
  });

  it('holds the app until a signed-in user record has been loaded', () => {
    expect(
      shouldHoldForUser({
        isInitialized: false,
        isLoggedIn: false,
        hasUser: false,
        isUserLoading: false,
        sawLoad: false,
        passkeySigningIn: false,
      }),
    ).toBe(true);
    expect(
      shouldHoldForUser({
        isInitialized: true,
        isLoggedIn: false,
        hasUser: false,
        isUserLoading: false,
        sawLoad: false,
        passkeySigningIn: false,
      }),
    ).toBe(false);
    expect(
      shouldHoldForUser({
        isInitialized: true,
        isLoggedIn: true,
        hasUser: false,
        isUserLoading: false,
        sawLoad: false,
        passkeySigningIn: false,
      }),
    ).toBe(true);
    expect(
      shouldHoldForUser({
        isInitialized: true,
        isLoggedIn: true,
        hasUser: true,
        isUserLoading: false,
        sawLoad: true,
        passkeySigningIn: false,
      }),
    ).toBe(false);
    expect(
      shouldHoldForUser({
        isInitialized: true,
        isLoggedIn: true,
        hasUser: false,
        isUserLoading: false,
        sawLoad: true,
        passkeySigningIn: false,
      }),
    ).toBe(false);
  });

  it('does not hold a signed-in user while the passkey opt-in is signing in', () => {
    expect(
      shouldHoldForUser({
        isInitialized: true,
        isLoggedIn: true,
        hasUser: false,
        isUserLoading: true,
        sawLoad: false,
        passkeySigningIn: true,
      }),
    ).toBe(false);
    expect(
      shouldHoldForUser({
        isInitialized: true,
        isLoggedIn: true,
        hasUser: false,
        isUserLoading: true,
        sawLoad: true,
        passkeySigningIn: true,
      }),
    ).toBe(false);
    expect(
      shouldHoldForUser({
        isInitialized: true,
        isLoggedIn: true,
        hasUser: false,
        isUserLoading: false,
        sawLoad: false,
        passkeySigningIn: true,
      }),
    ).toBe(false);
    expect(
      shouldHoldForUser({
        isInitialized: false,
        isLoggedIn: true,
        hasUser: false,
        isUserLoading: true,
        sawLoad: false,
        passkeySigningIn: true,
      }),
    ).toBe(true);
  });

  it('shows the deleted-address notice and activates the address through the user context', async () => {
    mockUser = userWithActiveAddress(UserStatus.DELETED);

    render(
      <DeletedAddressGate>
        <div>app</div>
      </DeletedAddressGate>,
    );

    expect(screen.queryByText('app')).not.toBeInTheDocument();
    expect(screen.getByText('This address was deleted. You can activate it again.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Activate address' }));

    expect(mockReactivateAddress).toHaveBeenCalledTimes(1);
    expect(mockReloadUser).not.toHaveBeenCalled();
  });

  it('shows the error and loads the user again when the activation fails', async () => {
    mockUser = userWithActiveAddress(UserStatus.DELETED);
    mockReactivateAddress.mockRejectedValue({ statusCode: 400, message: 'Account is deactivated or blocked' });

    render(
      <DeletedAddressGate>
        <div>app</div>
      </DeletedAddressGate>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Activate address' }));

    await waitFor(() => expect(screen.getByText('Account is deactivated or blocked')).toBeInTheDocument());
    expect(mockReloadUser).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('app')).not.toBeInTheDocument();
  });

  it('shows a fallback error when the failed activation has no message', async () => {
    mockUser = userWithActiveAddress(UserStatus.DELETED);
    mockReactivateAddress.mockRejectedValue({ statusCode: 400 });

    render(
      <DeletedAddressGate>
        <div>app</div>
      </DeletedAddressGate>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Activate address' }));

    await waitFor(() => expect(screen.getByText('Unknown error')).toBeInTheDocument());
    expect(mockReloadUser).toHaveBeenCalledTimes(1);
  });

  it('renders the app instead of the notice while the passkey opt-in is signing in on a deleted address', () => {
    mockLoggedIn = true;
    mockUser = userWithActiveAddress(UserStatus.DELETED);
    setPasskeySigningIn(true);

    render(
      <DeletedAddressGate>
        <div>app</div>
      </DeletedAddressGate>,
    );

    expect(screen.getByText('app')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activate address' })).not.toBeInTheDocument();

    act(() => setPasskeySigningIn(false));

    expect(screen.getByRole('button', { name: 'Activate address' })).toBeInTheDocument();
    expect(screen.queryByText('app')).not.toBeInTheDocument();
  });

  it('renders the app while the passkey opt-in is signing in and holds again when the flag clears', () => {
    mockLoading = true;
    setPasskeySigningIn(true);

    render(
      <DeletedAddressGate>
        <div>app</div>
      </DeletedAddressGate>,
    );

    expect(screen.getByText('app')).toBeInTheDocument();
    expect(screen.queryByText('loading')).not.toBeInTheDocument();

    act(() => setPasskeySigningIn(false));

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByText('app')).not.toBeInTheDocument();
  });

  it('holds the app with a spinner while the signed-in user is loading', () => {
    mockLoading = true;

    render(
      <DeletedAddressGate>
        <div>app</div>
      </DeletedAddressGate>,
    );

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByText('app')).not.toBeInTheDocument();
  });

  it('holds the app again after a logout until the next user has been loaded', () => {
    const gate = (): JSX.Element => (
      <DeletedAddressGate>
        <div>app</div>
      </DeletedAddressGate>
    );
    const { rerender } = render(gate());

    mockLoading = true;
    rerender(gate());
    mockLoading = false;
    mockUser = userWithActiveAddress(UserStatus.ACTIVE);
    rerender(gate());
    expect(screen.getByText('app')).toBeInTheDocument();

    mockLoggedIn = false;
    mockUser = undefined;
    rerender(gate());
    mockLoggedIn = true;
    rerender(gate());

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByText('app')).not.toBeInTheDocument();
  });

  it('renders the app instead of the notice when a deleted user remains after a logout', () => {
    mockLoggedIn = false;
    mockUser = userWithActiveAddress(UserStatus.DELETED);

    render(
      <DeletedAddressGate>
        <div>app</div>
      </DeletedAddressGate>,
    );

    expect(screen.getByText('app')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activate address' })).not.toBeInTheDocument();
  });

  it('renders the app when the signed-in address is active', () => {
    mockUser = userWithActiveAddress(UserStatus.ACTIVE);

    render(
      <DeletedAddressGate>
        <div>app</div>
      </DeletedAddressGate>,
    );

    expect(screen.getByText('app')).toBeInTheDocument();
  });
});
