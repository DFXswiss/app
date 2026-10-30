import { User, UserStatus } from '@dfx.swiss/react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DeletedAddressGate } from 'src/components/deleted-address-notice';
import { carriesLogin, isDeletedSessionAddress, shouldHoldForUser } from 'src/util/deleted-address';

const mockReactivateAddress = jest.fn();
const mockReloadUser = jest.fn();
let mockUser: User | undefined;
let mockLoading = false;
let mockLoggedIn = true;
let mockInitialized = true;
let mockRedirectPath: string | undefined;

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

jest.mock('src/contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({ redirectPath: mockRedirectPath }),
}));

function userWithActiveAddress(status: UserStatus): User {
  return { activeAddress: { status } } as User;
}

function renderGate(pathname: string, element: JSX.Element = <div>app</div>) {
  const router = createMemoryRouter([{ path: '*', element }], { initialEntries: [pathname] });
  const view = render(
    <DeletedAddressGate router={router}>
      <RouterProvider router={router} />
    </DeletedAddressGate>,
  );
  return { ...view, router };
}

describe('deleted session address', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = undefined;
    mockLoading = false;
    mockLoggedIn = true;
    mockInitialized = true;
    mockRedirectPath = undefined;
    mockReactivateAddress.mockResolvedValue(undefined);
    mockReloadUser.mockResolvedValue(undefined);
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
        carriesLogin: false,
      }),
    ).toBe(true);
    expect(
      shouldHoldForUser({
        isInitialized: true,
        isLoggedIn: false,
        hasUser: false,
        isUserLoading: false,
        sawLoad: false,
        carriesLogin: false,
      }),
    ).toBe(false);
    expect(
      shouldHoldForUser({
        isInitialized: true,
        isLoggedIn: true,
        hasUser: false,
        isUserLoading: false,
        sawLoad: false,
        carriesLogin: false,
      }),
    ).toBe(true);
    expect(
      shouldHoldForUser({
        isInitialized: true,
        isLoggedIn: true,
        hasUser: true,
        isUserLoading: false,
        sawLoad: true,
        carriesLogin: false,
      }),
    ).toBe(false);
    expect(
      shouldHoldForUser({
        isInitialized: true,
        isLoggedIn: true,
        hasUser: false,
        isUserLoading: false,
        sawLoad: true,
        carriesLogin: false,
      }),
    ).toBe(false);
    expect(
      shouldHoldForUser({
        isInitialized: true,
        isLoggedIn: true,
        hasUser: false,
        isUserLoading: true,
        sawLoad: false,
        carriesLogin: false,
      }),
    ).toBe(true);
  });

  it('skips only the user-record wait on a login route and recognises those routes exactly', () => {
    expect(carriesLogin('/')).toBe(true);
    expect(carriesLogin('/login')).toBe(true);
    expect(carriesLogin('/login/mail')).toBe(true);
    expect(carriesLogin('/login/wallet')).toBe(true);
    expect(carriesLogin('/connect')).toBe(true);
    expect(carriesLogin('/login/other')).toBe(false);
    expect(carriesLogin('/buy')).toBe(false);

    const waiting = {
      isInitialized: true,
      isLoggedIn: true,
      hasUser: false,
      isUserLoading: true,
      sawLoad: false,
    };
    expect(shouldHoldForUser({ ...waiting, carriesLogin: true })).toBe(false);
    expect(shouldHoldForUser({ ...waiting, isUserLoading: false, carriesLogin: true })).toBe(false);
    expect(
      shouldHoldForUser({
        isInitialized: false,
        isLoggedIn: true,
        hasUser: false,
        isUserLoading: false,
        sawLoad: false,
        carriesLogin: true,
      }),
    ).toBe(true);
    expect(
      shouldHoldForUser({
        isInitialized: true,
        isLoggedIn: false,
        hasUser: false,
        isUserLoading: false,
        sawLoad: false,
        carriesLogin: true,
      }),
    ).toBe(false);
    expect(
      shouldHoldForUser({
        isInitialized: true,
        isLoggedIn: true,
        hasUser: true,
        isUserLoading: false,
        sawLoad: true,
        carriesLogin: true,
      }),
    ).toBe(false);
  });

  it('shows the deleted-address notice and activates the address through the user context', async () => {
    mockUser = userWithActiveAddress(UserStatus.DELETED);

    renderGate('/buy');

    expect(screen.queryByText('app')).not.toBeInTheDocument();
    expect(screen.getByText('This address was deleted. You can activate it again.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Activate address' }));

    expect(mockReactivateAddress).toHaveBeenCalledTimes(1);
    expect(mockReloadUser).not.toHaveBeenCalled();
  });

  it('shows the error and loads the user again when the activation fails', async () => {
    mockUser = userWithActiveAddress(UserStatus.DELETED);
    mockReactivateAddress.mockRejectedValue({ statusCode: 400, message: 'Account is deactivated or blocked' });

    renderGate('/buy');

    await userEvent.click(screen.getByRole('button', { name: 'Activate address' }));

    await waitFor(() => expect(screen.getByText('Account is deactivated or blocked')).toBeInTheDocument());
    expect(mockReloadUser).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('app')).not.toBeInTheDocument();
  });

  it('shows a fallback error when the failed activation has no message', async () => {
    mockUser = userWithActiveAddress(UserStatus.DELETED);
    mockReactivateAddress.mockRejectedValue({ statusCode: 400 });

    renderGate('/buy');

    await userEvent.click(screen.getByRole('button', { name: 'Activate address' }));

    await waitFor(() => expect(screen.getByText('Unknown error')).toBeInTheDocument());
    expect(mockReloadUser).toHaveBeenCalledTimes(1);
  });

  it('continues an activation on /login to /buy when no screen asked to be returned to', async () => {
    mockUser = userWithActiveAddress(UserStatus.DELETED);

    const { router } = renderGate('/login');
    await userEvent.click(screen.getByRole('button', { name: 'Activate address' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/buy'));
    expect(mockReloadUser).not.toHaveBeenCalled();
  });

  it('returns an activation on /login to the path that sent the customer there', async () => {
    mockUser = userWithActiveAddress(UserStatus.DELETED);
    mockRedirectPath = '/settings';

    const { router } = renderGate('/login');
    await userEvent.click(screen.getByRole('button', { name: 'Activate address' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'));
  });

  it('stays on / after a successful activation when that route has no login target', async () => {
    mockUser = userWithActiveAddress(UserStatus.DELETED);
    let resolveActivation: () => void = () => undefined;
    mockReactivateAddress.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveActivation = resolve;
      }),
    );

    const { router } = renderGate('/');
    await userEvent.click(screen.getByRole('button', { name: 'Activate address' }));
    expect(mockReactivateAddress).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe('/');

    await act(async () => {
      resolveActivation();
      await Promise.resolve();
    });

    expect(router.state.location.pathname).toBe('/');
    expect(mockReloadUser).not.toHaveBeenCalled();
  });

  it('stays on /login when the activation fails', async () => {
    mockUser = userWithActiveAddress(UserStatus.DELETED);
    mockReactivateAddress.mockRejectedValue({ statusCode: 400, message: 'Account is deactivated or blocked' });

    const { router } = renderGate('/login');
    await userEvent.click(screen.getByRole('button', { name: 'Activate address' }));

    await waitFor(() => expect(screen.getByText('Account is deactivated or blocked')).toBeInTheDocument());
    expect(router.state.location.pathname).toBe('/login');
    expect(mockReloadUser).toHaveBeenCalledTimes(1);
  });

  it('holds the app with a spinner while the signed-in user is loading', () => {
    mockLoading = true;

    renderGate('/buy');

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByText('app')).not.toBeInTheDocument();
  });

  it('holds the app again after a logout until the next user has been loaded', () => {
    const router = createMemoryRouter([{ path: '*', element: <div>app</div> }], { initialEntries: ['/buy'] });
    const gate = (): JSX.Element => (
      <DeletedAddressGate router={router}>
        <RouterProvider router={router} />
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

    renderGate('/buy');

    expect(screen.getByText('app')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activate address' })).not.toBeInTheDocument();
  });

  it('renders the app when the signed-in address is active', () => {
    mockUser = userWithActiveAddress(UserStatus.ACTIVE);

    renderGate('/sell');

    expect(screen.getByText('app')).toBeInTheDocument();
  });

  it('keeps the same child mounted on /login and /connect while the user record is still loading', () => {
    let mounts = 0;

    function Probe(): JSX.Element {
      const id = useRef<number | null>(null);
      if (id.current == null) {
        mounts += 1;
        id.current = mounts;
      }
      return <div>app-{id.current}</div>;
    }

    for (const pathname of ['/login', '/connect']) {
      mounts = 0;
      mockInitialized = true;
      mockLoggedIn = false;
      mockUser = undefined;
      mockLoading = false;
      const { rerender, router } = renderGate(pathname, <Probe />);
      const first = screen.getByText('app-1');

      mockLoggedIn = true;
      mockLoading = true;
      rerender(
        <DeletedAddressGate router={router}>
          <RouterProvider router={router} />
        </DeletedAddressGate>,
      );

      expect(screen.getByText('app-1')).toBe(first);
      expect(mounts).toBe(1);
      expect(screen.queryByText('loading')).not.toBeInTheDocument();
      cleanup();
    }
  });

  it('replaces the children with the spinner on /buy and /sell while the user record is loading', () => {
    mockLoggedIn = true;
    mockUser = undefined;
    mockLoading = true;

    for (const pathname of ['/buy', '/sell']) {
      renderGate(pathname);
      expect(screen.getByText('loading')).toBeInTheDocument();
      expect(screen.queryByText('app')).not.toBeInTheDocument();
      cleanup();
    }
  });

  it('holds again in the same render when a login route navigates to /buy while the user is loading', async () => {
    mockLoggedIn = true;
    mockUser = undefined;
    mockLoading = true;

    const { router } = renderGate('/login');
    expect(screen.getByText('app')).toBeInTheDocument();

    await act(async () => {
      await router.navigate('/buy');
    });

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByText('app')).not.toBeInTheDocument();
  });

  it('shows the deleted-address notice on /login once that user has loaded', () => {
    mockUser = userWithActiveAddress(UserStatus.DELETED);
    mockLoading = false;

    renderGate('/login');

    expect(screen.getByText('This address was deleted. You can activate it again.')).toBeInTheDocument();
    expect(screen.queryByText('app')).not.toBeInTheDocument();
    expect(screen.queryByText('loading')).not.toBeInTheDocument();
  });

  it('holds on /login until the session is initialized', () => {
    mockInitialized = false;
    mockLoggedIn = true;
    mockLoading = true;

    renderGate('/login');

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByText('app')).not.toBeInTheDocument();
  });
});
