// Component-level: the screens that switch the session to another address of the account
// (ConnectAddress and AccountScreen) run against the real UserContextProvider of the SDK; only the
// HTTP layer (useUser) and the session store (useApiSession / useAuthContext) are replaced. A
// rejected switch must not be sent again on its own, and a successful one must be sent exactly once.

import { createContext, ReactNode, useContext, useState } from 'react';

interface MockSession {
  address?: string;
}

interface MockSessionState {
  session: MockSession;
  setSession: (session: MockSession) => void;
}

interface MockUserContextModule {
  UserContextProvider: (props: { children: ReactNode }) => JSX.Element;
  useUserContext: () => unknown;
}

const mockSessionContext = createContext<MockSessionState>({ session: {}, setSession: () => undefined });
const mockFormContext = createContext<unknown>(undefined);

const mockGetUser = jest.fn();
const mockChangeUserAddress = jest.fn();
const mockCall = jest.fn();
const mockSetWallet = jest.fn();
const mockSetSession = jest.fn();
const mockReportClientError = jest.fn();
let mockAssetOut: string | undefined;

// stable like the real hook (memoized on the api caller)
const mockUserApi = { getUser: mockGetUser, changeUserAddress: mockChangeUserAddress };
const mockAppUserApi = { getRef: () => Promise.resolve(undefined), getProfile: () => Promise.resolve(undefined) };
const mockTransactionApi = {
  getDetailTransactions: () => Promise.resolve([]),
  getUnassignedTransactions: () => Promise.resolve([]),
};

function mockUseSession(): MockSessionState {
  return useContext(mockSessionContext);
}

function mockUseFormControl(): unknown {
  return useContext(mockFormContext);
}

// The SDK ships an ESM build that the jest setup of this repository does not transform, so its real
// user context is transpiled here and wired to the replaced HTTP and session hooks.
let mockUserContextModule: MockUserContextModule | undefined;

function mockLoadUserContext(): MockUserContextModule {
  if (!mockUserContextModule) {
    const fs = jest.requireActual('fs');
    const babel = jest.requireActual('@babel/core');
    const file = require.resolve('@dfx.swiss/react/dist/contexts/user.context.js');
    const { code } = babel.transformSync(fs.readFileSync(file, 'utf8'), {
      babelrc: false,
      configFile: false,
      plugins: ['@babel/plugin-transform-modules-commonjs'],
    });
    const hooks: Record<string, unknown> = {
      '../hooks/user.hook': { useUser: () => mockUserApi },
      '../hooks/api-session.hook': {
        useApiSession: () => {
          const { setSession } = mockUseSession();
          return {
            isLoggedIn: true,
            updateSession: (token: string) => setSession({ address: token }),
            deleteSession: () => setSession({}),
          };
        },
      },
    };
    const module = { exports: {} as MockUserContextModule };
    new Function('require', 'module', 'exports', code)(
      (id: string) => hooks[id] ?? jest.requireActual(id),
      module,
      module.exports,
    );
    mockUserContextModule = module.exports;
  }
  return mockUserContextModule;
}

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { ETHEREUM: 'Ethereum' },
  KycStepName: { PHONE_CHANGE: 'PhoneChange', ADDRESS_CHANGE: 'AddressChange', NAME_CHANGE: 'NameChange' },
  Utils: { formatAmount: (value?: number) => `${value ?? ''}` },
  useUserContext: () => mockLoadUserContext().useUserContext(),
  useAuthContext: () => ({ session: mockUseSession().session }),
  useSessionContext: () => ({ isLoggedIn: true }),
  useApi: () => ({ call: mockCall }),
  useUser: () => mockAppUserApi,
  useTransaction: () => mockTransactionApi,
}));

jest.mock('@dfx.swiss/react-components', () => {
  const { useController } = jest.requireActual('react-hook-form');
  const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const components: Record<string, unknown> = {
    __esModule: true,
    Form: ({ control, children }: { control: unknown; children: ReactNode }) => (
      <mockFormContext.Provider value={control}>{children}</mockFormContext.Provider>
    ),
    StyledDropdown: ({
      name,
      items,
      labelFunc,
      descriptionFunc,
      forceEnable,
    }: {
      name: string;
      items: { address: string; label?: string; wallet?: string }[];
      labelFunc: (item: { address: string; label?: string; wallet?: string }) => string;
      descriptionFunc?: (item: { address: string; label?: string; wallet?: string }) => string;
      forceEnable?: boolean;
    }) => {
      const { field } = useController({ control: mockUseFormControl(), name });
      return name !== 'address' ? null : (
        <select
          data-testid="address-select"
          data-force-enable={String(forceEnable)}
          value={field.value?.address ?? ''}
          onChange={(e) => field.onChange(items.find((i) => i.address === e.target.value))}
        >
          <option value="">-</option>
          {items.map((i) => (
            <option key={i.address} value={i.address}>
              {labelFunc(i)} {descriptionFunc?.(i)}
            </option>
          ))}
        </select>
      );
    },
    StyledButton: ({ label, onClick }: { label: string; onClick: () => void }) => (
      <button type="button" onClick={onClick}>
        {label}
      </button>
    ),
    StyledLoadingSpinner: () => <div data-testid="spinner" />,
  };
  // everything else (layout components and enums) is irrelevant here
  return new Proxy(components, { get: (target, key: string) => (key in target ? target[key] : Passthrough) });
});

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <p data-testid="error-hint">{message}</p>,
}));

jest.mock('src/components/overlay/confirmation-overlay', () => ({ ConfirmationOverlay: () => null }));
jest.mock('src/components/account/recommendations-section', () => ({ RecommendationsSection: () => null }));
jest.mock('src/components/kyc-status', () => ({ KycStatus: () => null }));
jest.mock('src/components/modal', () => ({ Modal: () => null }));

jest.mock('src/config/labels', () => ({
  addressLabel: (item: { address: string }) => item.address,
}));

jest.mock('src/config/urls', () => ({ Urls: {} }));

jest.mock('src/util/utils', () => ({
  blankedAddress: (address: string) => address,
  sortAddressesByBlockchain: () => 0,
  downloadPdfFromString: jest.fn(),
  formatSwissDateTimeWithSeconds: () => '',
  url: () => '',
}));

jest.mock('src/util/client-error', () => ({
  reportClientError: (...args: unknown[]) => mockReportClientError(...args),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: () => ({ pathname: '/connect' }),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('src/contexts/wallet.context', () => ({
  useWalletContext: () => ({ isInitialized: true, setWallet: mockSetWallet, setSession: mockSetSession }),
}));

jest.mock('src/contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({ canClose: false, isEmbedded: false }),
}));

jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));

jest.mock('src/contexts/window.context', () => ({
  useWindowContext: () => ({ width: 1000 }),
}));

jest.mock('src/hooks/app-params.hook', () => ({
  useAppParams: () => ({ assetOut: mockAssetOut }),
}));

jest.mock('src/hooks/anchor.hook', () => ({ useAnchor: () => undefined }));
jest.mock('src/hooks/guard.hook', () => ({ useUserGuard: () => undefined }));
jest.mock('src/hooks/kyc-helper.hook', () => ({ useKycHelper: () => ({ startStep: jest.fn() }) }));
jest.mock('src/hooks/layout-config.hook', () => ({ useLayoutOptions: () => undefined }));
jest.mock('src/hooks/navigation.hook', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));

import { act, fireEvent, render, RenderResult, screen, waitFor } from '@testing-library/react';
import ConnectAddress from '../components/home/wallet/connect-address';
import AccountScreen from '../screens/account.screen';

const ADDRESS_A = { address: '0xA', blockchains: ['Ethereum'], wallet: 'MetaMask', isCustody: false };
const ADDRESS_B = { address: '0xB', blockchains: ['Ethereum'], wallet: 'MetaMask', isCustody: false };

const VOLUMES = { buy: { total: 0, annual: 0 }, sell: { total: 0, annual: 0 }, swap: { total: 0, annual: 0 } };

const REJECTION_TEXT = 'This address could not be selected. Please use another address or contact our support.';

// A looping screen would starve the test; after this many calls the switch never settles.
const CALL_CAP = 100;

function TestSession({ children, initial }: { children: ReactNode; initial: MockSession }): JSX.Element {
  const [session, setSession] = useState<MockSession>(initial);
  return <mockSessionContext.Provider value={{ session, setSession }}>{children}</mockSessionContext.Provider>;
}

function LoadedUser({ children }: { children: ReactNode }): JSX.Element | null {
  const { user, isUserLoading } = mockLoadUserContext().useUserContext() as {
    user?: unknown;
    isUserLoading: boolean;
  };
  if (!user || isUserLoading) return null;
  return <>{children}</>;
}

let mockReload: () => Promise<void> = () => Promise.resolve();

function ReloadProbe(): null {
  const { reloadUser } = mockLoadUserContext().useUserContext() as { reloadUser: () => Promise<void> };
  mockReload = reloadUser;
  return null;
}

function renderWithUser(children: ReactNode, session: MockSession = {}): RenderResult {
  const { UserContextProvider } = mockLoadUserContext();
  return render(
    <TestSession initial={session}>
      <UserContextProvider>{children}</UserContextProvider>
    </TestSession>,
  );
}

function rejectSwitch(error: unknown): void {
  mockChangeUserAddress.mockImplementation(() =>
    mockChangeUserAddress.mock.calls.length > CALL_CAP ? new Promise(() => undefined) : Promise.reject(error),
  );
}

async function settle(rounds = 50): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReportClientError.mockReset();
  mockAssetOut = undefined;
  mockCall.mockResolvedValue([]);
});

describe('ConnectAddress automatic address switch', () => {
  it('sends a rejected switch only once', async () => {
    mockGetUser.mockResolvedValue({ addresses: [ADDRESS_A], activeAddress: undefined });
    rejectSwitch({ statusCode: 403, message: 'Forbidden' });

    renderWithUser(<ConnectAddress onLogin={jest.fn()} onCancel={jest.fn()} />);
    await settle();

    expect(mockChangeUserAddress).toHaveBeenCalledTimes(1);
    expect(mockChangeUserAddress).toHaveBeenCalledWith('0xA');
  });

  it('sends a successful switch exactly once', async () => {
    mockGetUser.mockResolvedValue({ addresses: [ADDRESS_A], activeAddress: undefined });
    mockChangeUserAddress.mockResolvedValue({ accessToken: '0xA' });
    const onLogin = jest.fn();

    renderWithUser(<ConnectAddress onLogin={onLogin} onCancel={jest.fn()} />);
    await settle();

    expect(mockChangeUserAddress).toHaveBeenCalledTimes(1);
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(mockSetWallet).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 403, 404])(
    'shows the translated rejection sentence for status %s without the API text',
    async (statusCode) => {
      mockGetUser.mockResolvedValue({ addresses: [ADDRESS_A], activeAddress: undefined });
      rejectSwitch({ statusCode, message: 'Forbidden resource' });

      renderWithUser(<ConnectAddress onLogin={jest.fn()} onCancel={jest.fn()} />);
      await settle();

      expect(mockChangeUserAddress).toHaveBeenCalledTimes(1);
      expect(screen.getByText(REJECTION_TEXT)).toBeInTheDocument();
      expect(screen.queryByText('Forbidden resource')).toBeNull();
      expect(screen.queryByTestId('error-hint')).toBeNull();
      await waitFor(() => expect(mockReportClientError).toHaveBeenCalledTimes(1));
      expect(mockReportClientError.mock.calls[0][0]).toEqual(
        expect.objectContaining({ message: 'Forbidden resource', name: 'KnownRejection' }),
      );
    },
  );

  it.each([
    [{ statusCode: 500, message: 'Server down' }, 'Server down'],
    [{ statusCode: 0, message: 'Network error' }, 'Network error'],
    [{}, 'Unknown error'],
  ])('shows ErrorHint for a non-rejection failure %#', async (error, expectedMessage) => {
    mockGetUser.mockResolvedValue({ addresses: [ADDRESS_A], activeAddress: undefined });
    rejectSwitch(error);

    renderWithUser(<ConnectAddress onLogin={jest.fn()} onCancel={jest.fn()} />);
    await settle();

    expect(screen.getByTestId('error-hint')).toHaveTextContent(expectedMessage);
    expect(screen.queryByText(REJECTION_TEXT)).toBeNull();
    expect(mockReportClientError).not.toHaveBeenCalled();
  });

  it('shows the translated rejection and retries only after the user selects again', async () => {
    mockGetUser.mockResolvedValue({ addresses: [ADDRESS_A], activeAddress: undefined });
    rejectSwitch({ statusCode: 403, message: 'Forbidden resource' });

    renderWithUser(<ConnectAddress onLogin={jest.fn()} onCancel={jest.fn()} />);
    await settle();

    expect(mockChangeUserAddress).toHaveBeenCalledTimes(1);
    expect(screen.getByText(REJECTION_TEXT)).toBeInTheDocument();
    expect(screen.queryByTestId('spinner')).toBeNull();
    expect(screen.getByTestId('address-select')).toHaveValue('');
    await waitFor(() => expect(mockReportClientError).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId('address-select'), { target: { value: '0xA' } });
    await settle();

    expect(mockChangeUserAddress).toHaveBeenCalledTimes(2);
    await settle();
    expect(mockChangeUserAddress).toHaveBeenCalledTimes(2);
    expect(screen.getByText(REJECTION_TEXT)).toBeInTheDocument();
    await waitFor(() => expect(mockReportClientError).toHaveBeenCalledTimes(2));
  });

  it('reports Unknown error when a rejection has no message', async () => {
    mockGetUser.mockResolvedValue({ addresses: [ADDRESS_A], activeAddress: undefined });
    rejectSwitch({ statusCode: 403 });

    renderWithUser(<ConnectAddress onLogin={jest.fn()} onCancel={jest.fn()} />);
    await settle();

    expect(screen.getByText(REJECTION_TEXT)).toBeInTheDocument();
    expect(screen.queryByTestId('error-hint')).toBeNull();
    await waitFor(() => expect(mockReportClientError).toHaveBeenCalledTimes(1));
    expect(mockReportClientError.mock.calls[0][0]).toEqual(
      expect.objectContaining({ message: 'Unknown error', name: 'KnownRejection' }),
    );
  });

  it('lets the user pick another address after a rejection and succeeds', async () => {
    mockGetUser.mockResolvedValue({ addresses: [ADDRESS_A, ADDRESS_B], activeAddress: undefined });
    mockChangeUserAddress
      .mockRejectedValueOnce({ statusCode: 403, message: 'Forbidden' })
      .mockResolvedValueOnce({ accessToken: '0xB' });
    const onLogin = jest.fn();

    renderWithUser(<ConnectAddress onLogin={onLogin} onCancel={jest.fn()} />);
    await settle();

    expect(mockChangeUserAddress).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('address-select'), { target: { value: '0xA' } });
    await settle();

    expect(mockChangeUserAddress).toHaveBeenCalledTimes(1);
    expect(mockChangeUserAddress).toHaveBeenCalledWith('0xA');
    expect(screen.getByText(REJECTION_TEXT)).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('address-select'), { target: { value: '0xB' } });
    await settle();

    expect(mockChangeUserAddress).toHaveBeenCalledTimes(2);
    expect(mockChangeUserAddress).toHaveBeenCalledWith('0xB');
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(mockSetWallet).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(REJECTION_TEXT)).toBeNull();
    expect(screen.queryByTestId('error-hint')).toBeNull();
  });

  it('does not switch when the session already has the active address', async () => {
    mockGetUser.mockResolvedValue({ addresses: [ADDRESS_A], activeAddress: ADDRESS_A });

    renderWithUser(<ConnectAddress onLogin={jest.fn()} onCancel={jest.fn()} />, { address: '0xA' });
    await settle();

    expect(screen.getByTestId('address-select')).toHaveValue('0xA');
    expect(mockChangeUserAddress).not.toHaveBeenCalled();
    expect(screen.getByTestId('address-select')).toHaveAttribute('data-force-enable', 'false');
  });

  it('waits for the user to finish loading before switching', async () => {
    let resolveUser: (value: unknown) => void = () => undefined;
    mockGetUser.mockReturnValue(
      new Promise((resolve) => {
        resolveUser = resolve;
      }),
    );
    mockChangeUserAddress.mockResolvedValue({ accessToken: '0xA' });

    renderWithUser(<ConnectAddress onLogin={jest.fn()} onCancel={jest.fn()} />);
    await settle();

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(mockChangeUserAddress).not.toHaveBeenCalled();

    await act(async () => {
      resolveUser({ addresses: [ADDRESS_A], activeAddress: undefined });
    });
    await settle();

    expect(mockChangeUserAddress).toHaveBeenCalledTimes(1);
  });

  it('does not send the switch again when the user reloads while it is in flight', async () => {
    mockGetUser.mockResolvedValue({ addresses: [ADDRESS_A], activeAddress: undefined });
    let rejectPending: (reason: unknown) => void = () => undefined;
    mockChangeUserAddress.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectPending = reject;
        }),
    );

    renderWithUser(
      <>
        <ReloadProbe />
        <ConnectAddress onLogin={jest.fn()} onCancel={jest.fn()} />
      </>,
    );
    await settle();
    expect(mockChangeUserAddress).toHaveBeenCalledTimes(1);

    let resolveReload: (u: unknown) => void = () => undefined;
    mockGetUser.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReload = resolve;
        }),
    );

    act(() => {
      void mockReload();
    });
    await settle();
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(mockChangeUserAddress).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveReload({ addresses: [ADDRESS_A], activeAddress: undefined });
    });
    await settle();
    expect(mockChangeUserAddress).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectPending({ statusCode: 403, message: 'Forbidden' });
    });
    await settle();
    expect(mockChangeUserAddress).toHaveBeenCalledTimes(1);
    expect(screen.getByText(REJECTION_TEXT)).toBeInTheDocument();
  });

  it('does not render 0 when the account has no addresses', async () => {
    mockGetUser.mockResolvedValue({ addresses: [], activeAddress: undefined });
    const onCancel = jest.fn();

    const { container } = renderWithUser(<ConnectAddress onLogin={jest.fn()} onCancel={onCancel} />);
    await settle();

    expect(screen.queryByTestId('address-select')).toBeNull();
    expect(container).not.toHaveTextContent(/^0/);
    fireEvent.click(screen.getByRole('button', { name: 'Add new address' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('handles custody sign-up success', async () => {
    mockAssetOut = 'ZCHF';
    mockGetUser.mockResolvedValue({ addresses: [], activeAddress: undefined });
    mockCall.mockResolvedValue({ accessToken: 'tok' });
    const onLogin = jest.fn();

    renderWithUser(
      <LoadedUser>
        <ConnectAddress onLogin={onLogin} onCancel={jest.fn()} />
      </LoadedUser>,
    );
    await settle();

    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall).toHaveBeenCalledWith(expect.objectContaining({ url: 'custody', method: 'POST' }));
    expect(mockSetSession).toHaveBeenCalledWith('tok');
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it('handles custody sign-up failure with message', async () => {
    mockAssetOut = 'ZCHF';
    mockGetUser.mockResolvedValue({ addresses: [], activeAddress: undefined });
    mockCall.mockRejectedValue({ message: 'Custody denied' });

    renderWithUser(
      <LoadedUser>
        <ConnectAddress onLogin={jest.fn()} onCancel={jest.fn()} />
      </LoadedUser>,
    );
    await settle();

    expect(screen.getByTestId('error-hint')).toHaveTextContent('Custody denied');
  });

  it('handles custody sign-up failure without message', async () => {
    mockAssetOut = 'ZCHF';
    mockGetUser.mockResolvedValue({ addresses: [], activeAddress: undefined });
    mockCall.mockRejectedValue({});

    renderWithUser(
      <LoadedUser>
        <ConnectAddress onLogin={jest.fn()} onCancel={jest.fn()} />
      </LoadedUser>,
    );
    await settle();

    expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('uses label when present and wallet otherwise in descriptionFunc', async () => {
    const labeledB = { ...ADDRESS_B, label: 'Main' };
    mockGetUser.mockResolvedValue({ addresses: [ADDRESS_A, labeledB], activeAddress: undefined });
    rejectSwitch({ statusCode: 403, message: 'Forbidden' });

    renderWithUser(<ConnectAddress onLogin={jest.fn()} onCancel={jest.fn()} />);
    await settle();

    expect(screen.getByRole('option', { name: /0xA MetaMask/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /0xB Main/ })).toBeInTheDocument();
  });
});

describe('AccountScreen address switch', () => {
  const user = { addresses: [ADDRESS_A, ADDRESS_B], activeAddress: ADDRESS_A, kyc: { level: 0 }, volumes: VOLUMES };

  it('does not switch on its own', async () => {
    mockGetUser.mockResolvedValue(user);

    renderWithUser(<AccountScreen />, { address: '0xA' });
    await settle();

    expect(screen.getByTestId('address-select')).toHaveValue('0xA');
    expect(mockChangeUserAddress).not.toHaveBeenCalled();
  });

  it('sends a rejected switch only once', async () => {
    mockGetUser.mockResolvedValue(user);
    rejectSwitch({ statusCode: 403, message: 'Forbidden' });

    renderWithUser(<AccountScreen />, { address: '0xA' });
    await settle();
    fireEvent.change(screen.getByTestId('address-select'), { target: { value: '0xB' } });
    await settle();

    expect(mockChangeUserAddress).toHaveBeenCalledTimes(1);
    expect(mockChangeUserAddress).toHaveBeenCalledWith('0xB');
  });

  it('sends a successful switch exactly once', async () => {
    mockGetUser.mockResolvedValue(user);
    mockChangeUserAddress.mockResolvedValue({ accessToken: '0xB' });

    renderWithUser(<AccountScreen />, { address: '0xA' });
    await settle();
    fireEvent.change(screen.getByTestId('address-select'), { target: { value: '0xB' } });
    await settle();

    expect(mockChangeUserAddress).toHaveBeenCalledTimes(1);
    expect(mockSetWallet).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('address-select')).toHaveValue('0xB');
  });
});
