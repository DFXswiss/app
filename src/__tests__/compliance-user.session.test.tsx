let mockSessionInitialized = false;
let mockIsLoggedIn = false;
let mockAuthToken: string | undefined;
type TestSession = { account?: number; user?: number; address?: string; role?: string };
let mockSession: TestSession | undefined;
let mockRawTokenSession: TestSession | undefined;
let mockParams: { id?: string } = { id: '8' };
const mockGetUserData = jest.fn();
const mockGetKycFile = jest.fn();
const mockNavigate = jest.fn();
const mockSaveBufferedFile = jest.fn();
const mockSetSplitPercent = jest.fn();
const mockCreateObjectURL = jest.fn(() => 'blob:e2e-preview');
const mockRevokeObjectURL = jest.fn();

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type TestUserData = { marker: string };
type TestResponse = {
  userData: TestUserData;
  permissions: Record<string, boolean>;
  transactions?: unknown[];
  users?: unknown[];
  kycSteps?: unknown[];
  kycLogs?: unknown[];
  bankDatas?: unknown[];
  virtualIbans?: unknown[];
  buyRoutes?: unknown[];
  sellRoutes?: unknown[];
  swapRoutes?: unknown[];
  refRewards?: unknown[];
  notifications?: unknown[];
  notes?: unknown[];
  bankTxs?: unknown[];
  cryptoInputs?: unknown[];
  fiatOutputs?: unknown[];
  kycFiles?: unknown[];
  ipLogs?: unknown[];
  supportIssues?: unknown[];
};

let mockPendingRequests: Array<Deferred<TestResponse>> = [];

function response(marker: string, permissions: Record<string, boolean> = {}): TestResponse {
  return {
    userData: { marker },
    permissions: {
      viewKycFiles: false,
      viewRecommendation: false,
      viewKycLogs: false,
      viewIpLogs: false,
      viewSupportIssues: false,
      canRequestLimit: false,
      canPerformTransactionActions: false,
      ...permissions,
    },
  };
}

function populatedResponse(marker: string, permissions: Record<string, boolean> = {}): TestResponse {
  return {
    ...response(marker, permissions),
    transactions: [{}],
    users: [{}],
    kycSteps: [{}],
    kycLogs: [{}],
    bankDatas: [{}],
    virtualIbans: [{}],
    buyRoutes: [{}],
    sellRoutes: [{}],
    swapRoutes: [{}],
    refRewards: [{}],
    notifications: [{}],
    notes: [{}],
    bankTxs: [{}],
    cryptoInputs: [{}],
    fiatOutputs: [{}],
    kycFiles: [{}],
    ipLogs: [{}],
    supportIssues: [{}],
  };
}

function staffSession(role = 'Admin', overrides: Partial<TestSession> = {}): TestSession {
  return { account: 101, user: 201, address: '0xAbC', role, ...overrides };
}

jest.mock('@dfx.swiss/react', () => ({
  UserRole: {
    ADMIN: 'Admin',
    COMPLIANCE: 'Compliance',
    SUPPORT: 'Support',
    MARKETING: 'Marketing',
  },
  useAuthContext: () => ({
    session: mockSession,
    getAuthToken: () => mockAuthToken,
    getAuthTokenSession: () => mockRawTokenSession,
  }),
  useSessionContext: () => ({ isInitialized: mockSessionInitialized, isLoggedIn: mockIsLoggedIn }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { LG: 'lg' },
  StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
}));

jest.mock('src/components/compliance/detail-tabs', () =>
  Object.fromEntries(
    [
      'BankDatasTable',
      'BuyRoutesTable',
      'KycLogsTable',
      'KycStepsTable',
      'NotificationsTable',
      'RefRewardsTable',
      'SellRoutesTable',
      'SwapRoutesTable',
      'UsersTable',
      'VirtualIbansTable',
    ].map((name) => [name, (props: Record<string, unknown>) => (
      <div data-testid={name} data-list-length={Array.isArray(props.kycLogs) ? props.kycLogs.length : undefined}>{name}</div>
    )] as const),
  ),
);

jest.mock('src/components/compliance/file-preview-panel', () => ({
  FilePreviewPanel: ({ preview, onClose, onDownload }: {
    preview?: { url: string; contentType: string; name: string };
    onClose: () => void;
    onDownload: () => void;
  }) => (
    <div data-testid="file-preview-panel">
      <span data-testid="preview-url">{preview?.url ?? ''}</span>
      <span data-testid="preview-name">{preview?.name ?? ''}</span>
      <button type="button" data-testid="close-preview" onClick={onClose}>Close preview</button>
      <button type="button" data-testid="download-preview" onClick={onDownload}>Download preview</button>
    </div>
  ),
}));
jest.mock('src/components/compliance/ip-logs-panel', () => ({
  IpLogsPanel: ({ ipLogs }: { ipLogs: unknown[] }) => <div data-testid="ip-logs-panel" data-list-length={ipLogs.length} />,
}));
jest.mock('src/components/compliance/kyc-files-panel', () => ({
  KycFilesPanel: ({ onOpenFile }: { onOpenFile: (file: { uid?: string; name: string }) => void }) => (
    <div data-testid="kyc-files-panel">
      <button type="button" data-testid="open-valid-file" onClick={() => onOpenFile({ uid: 'file-1', name: 'report.pdf' })}>
        Open file
      </button>
    </div>
  ),
}));
jest.mock('src/components/compliance/notes-tab', () => ({
  NotesTab: ({ onChange, notes }: { onChange: () => void; notes: unknown[] }) => (
    <div data-testid="NotesTab" data-list-length={notes.length}><button type="button" data-testid="notes-changed" onClick={onChange}>Refresh notes</button></div>
  ),
}));
jest.mock('src/components/compliance/recommendation-panel', () => ({ RecommendationPanel: () => <div data-testid="recommendation-panel" /> }));
jest.mock('src/components/compliance/support-issues-panel', () => ({
  SupportIssuesPanel: ({ supportIssues }: { supportIssues: unknown[] }) => (
    <div data-testid="support-issues-panel" data-list-length={supportIssues.length} />
  ),
}));
jest.mock('src/components/compliance/support-user-overview-panel', () => ({ SupportUserOverviewPanel: () => <div data-testid="support-user-overview" /> }));
jest.mock('src/components/compliance/transactions-tab', () => ({
  TransactionsTable: (props: {
    expandedBankTxId?: number;
    expandedCryptoInputId?: number;
    expandedBankDataId?: number;
    expandedFiatOutputId?: number;
    expandedTxUid?: string;
    onExpandBankTx: (id?: number) => void;
    onExpandCryptoInput: (id?: number) => void;
    onExpandBankData: (id?: number) => void;
    onExpandFiatOutput: (id?: number) => void;
    onExpandTxUid: (uid?: string) => void;
    onStatusChanged: () => void;
  }) => (
    <div data-testid="TransactionsTable">
      <output data-testid="expanded-bank-tx">{props.expandedBankTxId ?? ''}</output>
      <output data-testid="expanded-crypto-input">{props.expandedCryptoInputId ?? ''}</output>
      <output data-testid="expanded-bank-data">{props.expandedBankDataId ?? ''}</output>
      <output data-testid="expanded-fiat-output">{props.expandedFiatOutputId ?? ''}</output>
      <output data-testid="expanded-tx-uid">{props.expandedTxUid ?? ''}</output>
      <button type="button" data-testid="expand-bank-tx" onClick={() => props.onExpandBankTx(11)} />
      <button type="button" data-testid="expand-crypto-input" onClick={() => props.onExpandCryptoInput(12)} />
      <button type="button" data-testid="expand-bank-data" onClick={() => props.onExpandBankData(13)} />
      <button type="button" data-testid="expand-fiat-output" onClick={() => props.onExpandFiatOutput(14)} />
      <button type="button" data-testid="expand-tx-uid" onClick={() => props.onExpandTxUid('tx-15')} />
      <button type="button" data-testid="transaction-status-changed" onClick={props.onStatusChanged}>Refresh</button>
    </div>
  ),
}));
jest.mock('src/components/compliance/user-data-panel', () => ({
  UserDataPanel: ({
    userData,
    canCopyKycLinks,
    wide,
    onLimitRequestCreated,
    onCreateNote,
  }: {
    userData: TestUserData;
    canCopyKycLinks: boolean;
    wide: boolean;
    onLimitRequestCreated: () => void;
    onCreateNote: () => void;
  }) => (
    <>
      <div data-testid="loaded-marker">{userData.marker}</div>
      <div data-testid="user-data-flags">{`${canCopyKycLinks}:${wide}`}</div>
      <button type="button" data-testid="manual-refresh" onClick={onLimitRequestCreated}>
        Refresh
      </button>
      <button type="button" data-testid="create-note" onClick={onCreateNote}>Create note</button>
    </>
  ),
}));
jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_namespace: string, key: string) => key }),
}));

jest.mock('src/hooks/compliance.hook', () => ({ useCompliance: () => ({ getUserData: mockGetUserData, getKycFile: mockGetKycFile }) }));

jest.mock('src/hooks/guard.hook', () => ({
  SUPPORT_DASHBOARD_ROLES: ['Admin', 'Compliance', 'Support', 'Marketing'],
  useSupportDashboardGuard: jest.fn(),
}));

jest.mock('src/hooks/layout-config.hook', () => ({ useLayoutOptions: jest.fn() }));
jest.mock('src/hooks/split-pane.hook', () => ({
  useSplitPane: () => ({
    containerRef: { current: null },
    splitPercent: 50,
    setSplitPercent: mockSetSplitPercent,
    handleSplitDrag: jest.fn(),
  }),
}));

jest.mock('src/util/utils', () => ({ saveBufferedFile: (...args: unknown[]) => mockSaveBufferedFile(...args) }));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ComplianceUserScreen from 'src/screens/compliance-user.screen';

describe('ComplianceUserScreen session scoped loading', () => {
  beforeEach(() => {
    mockSessionInitialized = false;
    mockIsLoggedIn = false;
    mockAuthToken = 'token-101-201';
    mockSession = undefined;
    mockRawTokenSession = undefined;
    mockParams = { id: '8' };
    mockPendingRequests = [];
    mockGetUserData.mockReset().mockImplementation(() =>
      mockPendingRequests.shift()?.promise ?? Promise.resolve(response('unexpected')),
    );
    mockGetKycFile.mockReset().mockResolvedValue({
      content: { type: 'Buffer', data: [37, 80, 68, 70] },
      contentType: 'application/pdf',
    });
    mockNavigate.mockReset();
    mockSaveBufferedFile.mockReset();
    mockSetSplitPercent.mockReset();
    mockCreateObjectURL.mockReset().mockReturnValue('blob:e2e-preview');
    mockRevokeObjectURL.mockReset();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: mockCreateObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: mockRevokeObjectURL });
  });

  async function renderLoadedScreen(role = 'Admin', result = response('loaded')) {
    mockSessionInitialized = true;
    mockIsLoggedIn = true;
    mockAuthToken = 'token-101-201';
    mockSession = staffSession(role);
    mockRawTokenSession = { ...mockSession };
    mockGetUserData.mockReset().mockResolvedValue(result);
    const view = render(<ComplianceUserScreen />);
    await screen.findByTestId('loaded-marker');
    return view;
  }

  it('waits for a matching initialized session and ignores stale scoped refreshes', async () => {
    const { rerender } = render(<ComplianceUserScreen />);
    expect(mockGetUserData).not.toHaveBeenCalled();

    await act(async () => {
      mockSessionInitialized = true;
      mockIsLoggedIn = true;
      mockSession = { account: 101, user: 201, address: '0xaaa', role: 'User' };
      mockRawTokenSession = mockSession;
      rerender(<ComplianceUserScreen />);
    });
    expect(mockGetUserData).not.toHaveBeenCalled();

    const firstRequest = deferred<TestResponse>();
    mockPendingRequests.push(firstRequest);
    await act(async () => {
      mockSession = { account: 101, user: 201, address: '0xaaa', role: 'Support' };
      mockRawTokenSession = { ...mockSession };
      rerender(<ComplianceUserScreen />);
    });
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledTimes(1));
    expect(mockGetUserData).toHaveBeenLastCalledWith(8);

    await act(async () => {
      firstRequest.resolve(response('account-101'));
      await firstRequest.promise;
    });
    expect(await screen.findByTestId('loaded-marker')).toHaveTextContent('account-101');
    expect(screen.getByTestId('user-data-flags')).toHaveTextContent('false:true');
    expect(screen.getByTestId('support-user-overview')).toBeInTheDocument();
    expect(mockSetSplitPercent).toHaveBeenCalledWith(50);

    // A token can change before React renders its new session. A manual refresh must recheck
    // the current token scope and must not send the old callback's path under the new token.
    mockRawTokenSession = { account: 102, user: 202, address: '0xbbb', role: 'Support' };
    fireEvent.click(screen.getByTestId('manual-refresh'));
    expect(mockGetUserData).toHaveBeenCalledTimes(1);

    const secondRequest = deferred<TestResponse>();
    mockPendingRequests.push(secondRequest);
    await act(async () => {
      mockSession = { account: 102, user: 202, address: '0xbbb', role: 'Support' };
      mockRawTokenSession = { ...mockSession };
      rerender(<ComplianceUserScreen />);
    });
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledTimes(2));

    // The token can change before the provider renders its decoded session. The old request
    // must not commit data during that window either.
    mockRawTokenSession = { account: 102, user: 202, address: '0xbbb', role: 'Admin' };
    await act(async () => {
      secondRequest.resolve(response('stale-token-scope'));
      await secondRequest.promise;
    });
    expect(screen.queryByText('stale-token-scope')).not.toBeInTheDocument();

    const thirdRequest = deferred<TestResponse>();
    mockPendingRequests.push(thirdRequest);
    await act(async () => {
      mockSession = { account: 102, user: 202, address: '0xbbb', role: 'Admin' };
      rerender(<ComplianceUserScreen />);
    });
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledTimes(3));

    const fourthRequest = deferred<TestResponse>();
    mockPendingRequests.push(fourthRequest);
    await act(async () => {
      mockSession = { account: 103, user: 203, address: '0xccc', role: 'Support' };
      mockRawTokenSession = { ...mockSession };
      rerender(<ComplianceUserScreen />);
    });
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledTimes(4));

    await act(async () => {
      thirdRequest.reject(new Error('stale account error'));
      await thirdRequest.promise.catch(() => undefined);
    });
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();

    await act(async () => {
      fourthRequest.resolve(response('account-103'));
      await fourthRequest.promise;
    });
    expect(await screen.findByTestId('loaded-marker')).toHaveTextContent('account-103');
  });

  it('requires initialization, login, safe account and user claims, and an allowed role', async () => {
    const { rerender } = render(<ComplianceUserScreen />);
    const rejectedSessions: Array<{ initialized: boolean; loggedIn: boolean; session?: TestSession }> = [
      { initialized: false, loggedIn: true, session: staffSession() },
      { initialized: true, loggedIn: false, session: staffSession() },
      { initialized: true, loggedIn: true, session: staffSession('Support', { account: Number.NaN }) },
      { initialized: true, loggedIn: true, session: staffSession('Support', { account: 0 }) },
      { initialized: true, loggedIn: true, session: staffSession('Support', { user: Number.NaN }) },
      { initialized: true, loggedIn: true, session: staffSession('Support', { user: 0 }) },
      { initialized: true, loggedIn: true, session: { account: 101, user: 201, address: '0xAbC' } },
      { initialized: true, loggedIn: true, session: staffSession('User') },
    ];

    for (const state of rejectedSessions) {
      mockSessionInitialized = state.initialized;
      mockIsLoggedIn = state.loggedIn;
      mockSession = state.session;
      mockRawTokenSession = state.session ? { ...state.session } : undefined;
      rerender(<ComplianceUserScreen />);
      expect(mockGetUserData).not.toHaveBeenCalled();
    }

    mockSessionInitialized = true;
    mockIsLoggedIn = true;
    mockSession = staffSession('Support');
    mockRawTokenSession = { ...mockSession };
    rerender(<ComplianceUserScreen />);
    expect(await screen.findByTestId('loaded-marker')).toHaveTextContent('unexpected');
    expect(mockGetUserData).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed or different raw-token claims, but accepts case-folded EVM addresses', async () => {
    await renderLoadedScreen('Admin');
    const rendered = staffSession('Admin');
    const mismatches: Array<TestSession | undefined> = [
      undefined,
      { ...rendered, account: Number.NaN },
      { ...rendered, account: 0 },
      { ...rendered, user: Number.NaN },
      { ...rendered, user: 0 },
      { ...rendered, role: '' },
      { ...rendered, address: '' },
      { ...rendered, address: 17 as unknown as string },
      { ...rendered, account: 102 },
      { ...rendered, user: 202 },
      { ...rendered, role: 'Support' },
      { ...rendered, address: undefined },
      { ...rendered, address: '0xdef' },
      { ...rendered, address: 'cosmos1other' },
    ];

    for (const tokenSession of mismatches) {
      mockRawTokenSession = tokenSession;
      fireEvent.click(screen.getByTestId('manual-refresh'));
    }
    expect(mockGetUserData).toHaveBeenCalledTimes(1);

    mockRawTokenSession = { ...rendered, address: '0xabc' };
    mockGetUserData.mockResolvedValueOnce(response('fresh-evm'));
    fireEvent.click(screen.getByTestId('manual-refresh'));
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('loaded-marker')).toHaveTextContent('fresh-evm'));
  });

  it('reports a missing user ID without calling the API', async () => {
    mockSessionInitialized = true;
    mockIsLoggedIn = true;
    mockSession = staffSession('Admin');
    mockRawTokenSession = { ...mockSession };
    mockParams = {};

    render(<ComplianceUserScreen />);

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('No ID provided');
    expect(mockGetUserData).not.toHaveBeenCalled();
  });

  it('renders permission panels, all data tabs, refresh actions, and clears expanded transaction details', async () => {
    await renderLoadedScreen(
      'Admin',
      populatedResponse('permissions', {
        viewRecommendation: true,
        viewKycFiles: true,
        viewIpLogs: true,
        viewSupportIssues: true,
        viewKycLogs: true,
        canRequestLimit: true,
        canPerformTransactionActions: true,
      }),
    );

    expect(screen.getByTestId('user-data-flags')).toHaveTextContent('true:false');
    expect(screen.getByTestId('recommendation-panel')).toBeInTheDocument();
    expect(screen.getByTestId('kyc-files-panel')).toBeInTheDocument();
    expect(screen.getByTestId('ip-logs-panel')).toBeInTheDocument();
    expect(screen.getByTestId('support-issues-panel')).toBeInTheDocument();
    expect(screen.getByTestId('file-preview-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('support-user-overview')).not.toBeInTheDocument();

    const tabs = [
      ['Transactions (1)', 'TransactionsTable'],
      ['Users (1)', 'UsersTable'],
      ['KYC Steps (1)', 'KycStepsTable'],
      ['KYC Log (1)', 'KycLogsTable'],
      ['Bank Data (1)', 'BankDatasTable'],
      ['Virtual IBANs (1)', 'VirtualIbansTable'],
      ['Buy Routes (1)', 'BuyRoutesTable'],
      ['Sell Routes (1)', 'SellRoutesTable'],
      ['Swap Routes (1)', 'SwapRoutesTable'],
      ['Ref Rewards (1)', 'RefRewardsTable'],
      ['Notifications (1)', 'NotificationsTable'],
      ['Notes (1)', 'NotesTab'],
    ];
    for (const [label, testId] of tabs) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    }

    await act(async () => {
      fireEvent.click(screen.getByTestId('notes-changed'));
      await Promise.resolve();
    });
    expect(mockGetUserData).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTestId('create-note'));
    expect(mockNavigate).toHaveBeenCalledWith('/notes?userDataId=8&compose=1');

    fireEvent.click(screen.getByRole('button', { name: 'Transactions (1)' }));
    fireEvent.click(screen.getByTestId('expand-bank-tx'));
    expect(screen.getByTestId('expanded-bank-tx')).toHaveTextContent('11');
    fireEvent.click(screen.getByTestId('expand-crypto-input'));
    expect(screen.getByTestId('expanded-bank-tx')).toBeEmptyDOMElement();
    expect(screen.getByTestId('expanded-crypto-input')).toHaveTextContent('12');
    fireEvent.click(screen.getByTestId('expand-fiat-output'));
    expect(screen.getByTestId('expanded-crypto-input')).toBeEmptyDOMElement();
    expect(screen.getByTestId('expanded-fiat-output')).toHaveTextContent('14');
    fireEvent.click(screen.getByTestId('expand-bank-data'));
    expect(screen.getByTestId('expanded-fiat-output')).toBeEmptyDOMElement();
    expect(screen.getByTestId('expanded-bank-data')).toHaveTextContent('13');
    fireEvent.click(screen.getByTestId('expand-tx-uid'));
    expect(screen.getByTestId('expanded-bank-data')).toBeEmptyDOMElement();
    expect(screen.getByTestId('expanded-tx-uid')).toHaveTextContent('tx-15');
    await act(async () => {
      fireEvent.click(screen.getByTestId('transaction-status-changed'));
      await Promise.resolve();
    });
    expect(mockGetUserData).toHaveBeenCalledTimes(3);
  });

  it('covers preview open, validation, download, error, close, and object URL cleanup', async () => {
    await renderLoadedScreen(
      'Admin',
      response('files', { viewKycFiles: true }),
    );

    fireEvent.click(screen.getByTestId('download-preview'));
    expect(mockGetKycFile).not.toHaveBeenCalled();

    mockGetKycFile.mockResolvedValueOnce({ content: undefined, contentType: 'application/pdf' });
    fireEvent.click(screen.getByTestId('open-valid-file'));
    await waitFor(() => expect(mockGetKycFile).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('preview-url')).toBeEmptyDOMElement();
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Invalid file type');

    mockGetKycFile.mockResolvedValueOnce({ content: { type: 'Blob', data: [] }, contentType: 'application/pdf' });
    fireEvent.click(screen.getByTestId('open-valid-file'));
    await waitFor(() => expect(mockGetKycFile).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('preview-url')).toBeEmptyDOMElement();

    mockGetKycFile.mockResolvedValueOnce({ content: { type: 'Buffer', data: 'not an array' }, contentType: 'application/pdf' });
    fireEvent.click(screen.getByTestId('open-valid-file'));
    await waitFor(() => expect(mockGetKycFile).toHaveBeenCalledTimes(3));
    expect(screen.getByTestId('preview-url')).toBeEmptyDOMElement();

    mockGetKycFile.mockRejectedValueOnce(new Error('KYC file request failed'));
    fireEvent.click(screen.getByTestId('open-valid-file'));
    await waitFor(() => expect(mockGetKycFile).toHaveBeenCalledTimes(4));
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('KYC file request failed');

    mockGetKycFile.mockRejectedValueOnce('non-Error rejection');
    fireEvent.click(screen.getByTestId('open-valid-file'));
    await waitFor(() => expect(mockGetKycFile).toHaveBeenCalledTimes(5));
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Error loading file');

    mockGetKycFile.mockResolvedValueOnce({ content: { type: 'Buffer', data: [37, 80, 68, 70] }, contentType: 'application/pdf' });
    fireEvent.click(screen.getByTestId('open-valid-file'));
    await waitFor(() => expect(screen.getByTestId('preview-url')).toHaveTextContent('blob:e2e-preview'));
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.getByTestId('preview-name')).toHaveTextContent('report.pdf');
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('download-preview'));
    await waitFor(() => expect(mockGetKycFile).toHaveBeenCalledTimes(7));
    expect(mockGetKycFile).toHaveBeenLastCalledWith('file-1', 'Download');
    await waitFor(() =>
      expect(mockSaveBufferedFile).toHaveBeenCalledWith(
        { type: 'Buffer', data: [37, 80, 68, 70] },
        'application/pdf',
        'report.pdf',
      ),
    );
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();

    mockGetKycFile.mockResolvedValueOnce({ content: undefined, contentType: 'application/pdf' });
    fireEvent.click(screen.getByTestId('download-preview'));
    await waitFor(() => expect(mockGetKycFile).toHaveBeenCalledTimes(8));
    expect(mockSaveBufferedFile).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Invalid file type');

    mockGetKycFile.mockResolvedValueOnce({ content: { type: 'Blob', data: [] }, contentType: 'application/pdf' });
    fireEvent.click(screen.getByTestId('download-preview'));
    await waitFor(() => expect(mockGetKycFile).toHaveBeenCalledTimes(9));
    expect(mockSaveBufferedFile).toHaveBeenCalledTimes(1);

    mockGetKycFile.mockResolvedValueOnce({ content: { type: 'Buffer', data: 'not an array' }, contentType: 'application/pdf' });
    fireEvent.click(screen.getByTestId('download-preview'));
    await waitFor(() => expect(mockGetKycFile).toHaveBeenCalledTimes(10));
    expect(mockSaveBufferedFile).toHaveBeenCalledTimes(1);

    mockGetKycFile.mockRejectedValueOnce(new Error('download failed'));
    fireEvent.click(screen.getByTestId('download-preview'));
    await waitFor(() => expect(mockGetKycFile).toHaveBeenCalledTimes(11));
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('download failed');

    mockGetKycFile.mockRejectedValueOnce('non-Error download rejection');
    fireEvent.click(screen.getByTestId('download-preview'));
    await waitFor(() => expect(mockGetKycFile).toHaveBeenCalledTimes(12));
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Error downloading file');

    fireEvent.click(screen.getByTestId('close-preview'));
    await waitFor(() => expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:e2e-preview'));
    expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('does not request a KYC preview after the bearer token clears before the session rerenders', async () => {
    await renderLoadedScreen('Admin', response('authenticated dossier', { viewKycFiles: true }));

    // useApi can clear its token synchronously while the context still exposes the previous render.
    mockAuthToken = undefined;
    fireEvent.click(screen.getByTestId('open-valid-file'));

    expect(mockGetKycFile).not.toHaveBeenCalled();
    expect(mockCreateObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('does not start a preview download after the bearer token changes before the session rerenders', async () => {
    await renderLoadedScreen('Admin', response('authenticated dossier', { viewKycFiles: true }));
    fireEvent.click(screen.getByTestId('open-valid-file'));
    await waitFor(() => expect(screen.getByTestId('preview-url')).toHaveTextContent('blob:e2e-preview'));

    mockAuthToken = 'rotated-token-with-same-claims';
    fireEvent.click(screen.getByTestId('download-preview'));

    expect(mockGetKycFile).toHaveBeenCalledTimes(1);
    expect(mockSaveBufferedFile).not.toHaveBeenCalled();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('hides the file preview without file permission and exposes compliance copy links', async () => {
    await renderLoadedScreen('Compliance', response('compliance'));
    expect(screen.getByTestId('user-data-flags')).toHaveTextContent('true:false');
    expect(screen.queryByTestId('file-preview-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('support-user-overview')).not.toBeInTheDocument();
    expect(mockSetSplitPercent).not.toHaveBeenCalled();
  });

  it('reports current API failures and distinguishes Error from unknown rejections', async () => {
    mockSessionInitialized = true;
    mockIsLoggedIn = true;
    mockSession = staffSession('Admin');
    mockRawTokenSession = { ...mockSession };
    mockGetUserData
      .mockRejectedValueOnce(new Error('current API failure'))
      .mockRejectedValueOnce('untyped API rejection');
    const { rerender } = render(<ComplianceUserScreen />);

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('current API failure');

    mockParams = { id: '9' };
    rerender(<ComplianceUserScreen />);
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('keeps same-scope details visible while refreshing and replaces them on success', async () => {
    await renderLoadedScreen('Admin');
    const refresh = deferred<TestResponse>();
    mockGetUserData.mockReturnValueOnce(refresh.promise);

    fireEvent.click(screen.getByTestId('manual-refresh'));
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('loaded-marker')).toHaveTextContent('loaded');
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();

    await act(async () => {
      refresh.resolve(response('refreshed details'));
      await refresh.promise;
    });
    expect(screen.getByTestId('loaded-marker')).toHaveTextContent('refreshed details');
  });

  it.each(['Unauthorized', 'Not Found'])('removes previously loaded customer details after a same-scope %s response', async (message) => {
    await renderLoadedScreen('Admin');
    expect(screen.getByTestId('loaded-marker')).toHaveTextContent('loaded');

    mockGetUserData.mockRejectedValueOnce(new Error(message));
    fireEvent.click(screen.getByTestId('manual-refresh'));

    expect(await screen.findByTestId('error-hint')).toHaveTextContent(message);
    expect(screen.queryByTestId('loaded-marker')).not.toBeInTheDocument();
  });

  it('hides the dossier and preview when the current 401 clears the bearer token before rejecting', async () => {
    await renderLoadedScreen('Admin', response('authenticated dossier', { viewKycFiles: true }));
    mockGetKycFile.mockResolvedValueOnce({
      content: { type: 'Buffer', data: [37, 80, 68, 70] },
      contentType: 'application/pdf',
    });
    fireEvent.click(screen.getByTestId('open-valid-file'));
    await waitFor(() => expect(screen.getByTestId('preview-url')).toHaveTextContent('blob:e2e-preview'));

    const refresh = deferred<TestResponse>();
    mockGetUserData.mockReturnValueOnce(refresh.promise);
    fireEvent.click(screen.getByTestId('manual-refresh'));
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledTimes(2));

    const unauthorized = Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    await act(async () => {
      // Mirrors useApi: setAuthToken(undefined) updates the token ref synchronously before rejection.
      mockAuthToken = undefined;
      mockSession = undefined;
      mockRawTokenSession = undefined;
      mockIsLoggedIn = false;
      refresh.reject(unauthorized);
      await refresh.promise.catch(() => undefined);
    });

    expect(screen.queryByTestId('loaded-marker')).not.toBeInTheDocument();
    expect(screen.queryByTestId('file-preview-panel')).not.toBeInTheDocument();
    // This component test mocks the route guard, so its protected screen remains in a loading state;
    // the real useSupportDashboardGuard navigates away when isLoggedIn becomes false.
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    await waitFor(() => expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:e2e-preview'));
    expect(mockGetUserData).toHaveBeenCalledTimes(2);
  });

  it('passes empty lists when optional KYC log, IP log, support issue, and note lists are absent', async () => {
    await renderLoadedScreen(
      'Admin',
      response('empty optional lists', {
        viewKycLogs: true,
        viewIpLogs: true,
        viewSupportIssues: true,
      }),
    );

    expect(screen.getByTestId('ip-logs-panel')).toHaveAttribute('data-list-length', '0');
    expect(screen.getByTestId('support-issues-panel')).toHaveAttribute('data-list-length', '0');
    fireEvent.click(screen.getByRole('button', { name: 'KYC Log (0)' }));
    expect(screen.getByTestId('KycLogsTable')).toHaveAttribute('data-list-length', '0');
    fireEvent.click(screen.getByRole('button', { name: 'Notes (0)' }));
    expect(screen.getByTestId('NotesTab')).toHaveAttribute('data-list-length', '0');
  });

  it('hides and revokes a preview when the route and staff account change', async () => {
    const { rerender } = await renderLoadedScreen('Admin', response('first account', { viewKycFiles: true }));
    mockCreateObjectURL.mockReturnValueOnce('blob:first-account');
    mockGetKycFile.mockResolvedValueOnce({
      content: { type: 'Buffer', data: [37, 80, 68, 70] },
      contentType: 'application/pdf',
    });

    fireEvent.click(screen.getByTestId('open-valid-file'));
    await waitFor(() => expect(screen.getByTestId('preview-url')).toHaveTextContent('blob:first-account'));

    mockGetUserData.mockResolvedValueOnce(response('second account', { viewKycFiles: true }));
    mockParams = { id: '9' };
    mockSession = staffSession('Admin', { account: 102, user: 202, address: '0xDef' });
    mockRawTokenSession = { ...mockSession };
    mockAuthToken = 'token-102-202';
    rerender(<ComplianceUserScreen />);

    expect(await screen.findByTestId('loaded-marker')).toHaveTextContent('second account');
    await waitFor(() => expect(screen.getByTestId('preview-url')).toBeEmptyDOMElement());
    await waitFor(() => expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:first-account'));

    fireEvent.click(screen.getByTestId('download-preview'));
    expect(mockGetKycFile).toHaveBeenCalledTimes(1);
    expect(mockSaveBufferedFile).not.toHaveBeenCalled();
  });

  it('ignores late preview success and failure after scope change, then revokes the new preview', async () => {
    const { rerender } = await renderLoadedScreen('Admin', response('old account', { viewKycFiles: true }));
    const staleSuccess = deferred<{ content: { type: string; data: number[] }; contentType: string }>();
    const staleFailure = deferred<{ content: { type: string; data: number[] }; contentType: string }>();
    mockGetKycFile.mockReturnValueOnce(staleSuccess.promise).mockReturnValueOnce(staleFailure.promise);
    fireEvent.click(screen.getByTestId('open-valid-file'));
    fireEvent.click(screen.getByTestId('open-valid-file'));
    await waitFor(() => expect(mockGetKycFile).toHaveBeenCalledTimes(2));

    const pendingNewUser = deferred<TestResponse>();
    mockGetUserData.mockReturnValueOnce(pendingNewUser.promise);
    mockParams = { id: '10' };
    mockSession = staffSession('Admin', { account: 103, user: 203, address: '0xEee' });
    mockRawTokenSession = { ...mockSession };
    mockAuthToken = 'token-103-203';
    rerender(<ComplianceUserScreen />);
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

    await act(async () => {
      staleSuccess.resolve({ content: { type: 'Buffer', data: [37, 80, 68, 70] }, contentType: 'application/pdf' });
      staleFailure.reject(new Error('old file request failed'));
      await Promise.all([staleSuccess.promise, staleFailure.promise.catch(() => undefined)]);
    });
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(mockCreateObjectURL).not.toHaveBeenCalled();

    await act(async () => {
      pendingNewUser.resolve(response('new account', { viewKycFiles: true }));
      await pendingNewUser.promise;
    });
    expect(await screen.findByTestId('loaded-marker')).toHaveTextContent('new account');

    mockCreateObjectURL.mockReturnValueOnce('blob:new-account');
    fireEvent.click(screen.getByTestId('open-valid-file'));
    await waitFor(() => expect(screen.getByTestId('preview-url')).toHaveTextContent('blob:new-account'));
    fireEvent.click(screen.getByTestId('close-preview'));
    await waitFor(() => expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:new-account'));
  });

  it('does not save a download that finishes after the route and staff account change', async () => {
    const { rerender } = await renderLoadedScreen('Admin', response('download source', { viewKycFiles: true }));
    mockGetKycFile.mockResolvedValueOnce({
      content: { type: 'Buffer', data: [37, 80, 68, 70] },
      contentType: 'application/pdf',
    });
    fireEvent.click(screen.getByTestId('open-valid-file'));
    await waitFor(() => expect(screen.getByTestId('preview-url')).toHaveTextContent('blob:e2e-preview'));

    const pendingDownload = deferred<{ content: { type: string; data: number[] }; contentType: string }>();
    mockGetKycFile.mockReturnValueOnce(pendingDownload.promise);
    fireEvent.click(screen.getByTestId('download-preview'));
    await waitFor(() => expect(mockGetKycFile).toHaveBeenCalledTimes(2));

    mockGetUserData.mockResolvedValueOnce(response('new download scope', { viewKycFiles: true }));
    mockParams = { id: '11' };
    mockSession = staffSession('Admin', { account: 104, user: 204, address: '0xFff' });
    mockRawTokenSession = { ...mockSession };
    mockAuthToken = 'token-104-204';
    rerender(<ComplianceUserScreen />);
    expect(await screen.findByTestId('loaded-marker')).toHaveTextContent('new download scope');
    await waitFor(() => expect(screen.getByTestId('preview-url')).toBeEmptyDOMElement());

    await act(async () => {
      pendingDownload.resolve({
        content: { type: 'Buffer', data: [37, 80, 68, 70] },
        contentType: 'application/pdf',
      });
      await pendingDownload.promise;
    });
    expect(mockSaveBufferedFile).not.toHaveBeenCalled();
  });

  it('does not show a stale download error after the route and staff account change', async () => {
    const { rerender } = await renderLoadedScreen('Admin', response('download source', { viewKycFiles: true }));
    mockGetKycFile.mockResolvedValueOnce({
      content: { type: 'Buffer', data: [37, 80, 68, 70] },
      contentType: 'application/pdf',
    });
    fireEvent.click(screen.getByTestId('open-valid-file'));
    await waitFor(() => expect(screen.getByTestId('preview-url')).toHaveTextContent('blob:e2e-preview'));

    const pendingDownload = deferred<{ content: { type: string; data: number[] }; contentType: string }>();
    mockGetKycFile.mockReturnValueOnce(pendingDownload.promise);
    fireEvent.click(screen.getByTestId('download-preview'));
    await waitFor(() => expect(mockGetKycFile).toHaveBeenCalledTimes(2));

    mockGetUserData.mockResolvedValueOnce(response('new download scope', { viewKycFiles: true }));
    mockParams = { id: '12' };
    mockSession = staffSession('Admin', { account: 105, user: 205, address: '0xAaa' });
    mockRawTokenSession = { ...mockSession };
    mockAuthToken = 'token-105-205';
    rerender(<ComplianceUserScreen />);
    expect(await screen.findByTestId('loaded-marker')).toHaveTextContent('new download scope');
    await waitFor(() => expect(screen.getByTestId('preview-url')).toBeEmptyDOMElement());

    await act(async () => {
      pendingDownload.reject(new Error('stale download failure'));
      await pendingDownload.promise.catch(() => undefined);
    });

    expect(screen.getByTestId('loaded-marker')).toHaveTextContent('new download scope');
    expect(screen.queryByText('stale download failure')).not.toBeInTheDocument();
    expect(mockSaveBufferedFile).not.toHaveBeenCalled();
  });

  it('does not create or save KYC files when open and download requests finish after unmount', async () => {
    const { unmount } = await renderLoadedScreen('Admin', response('unmount source', { viewKycFiles: true }));
    mockCreateObjectURL.mockReturnValueOnce('blob:before-unmount');
    mockGetKycFile.mockResolvedValueOnce({
      content: { type: 'Buffer', data: [37, 80, 68, 70] },
      contentType: 'image/png',
    });
    fireEvent.click(screen.getByTestId('open-valid-file'));
    await waitFor(() => expect(screen.getByTestId('preview-url')).toHaveTextContent('blob:before-unmount'));

    const pendingOpen = deferred<{ content: { type: string; data: number[] }; contentType: string }>();
    const pendingDownload = deferred<{ content: { type: string; data: number[] }; contentType: string }>();
    mockGetKycFile.mockReturnValueOnce(pendingDownload.promise).mockReturnValueOnce(pendingOpen.promise);
    fireEvent.click(screen.getByTestId('download-preview'));
    fireEvent.click(screen.getByTestId('open-valid-file'));
    await waitFor(() => expect(mockGetKycFile).toHaveBeenCalledTimes(3));

    unmount();
    await waitFor(() => expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:before-unmount'));
    await act(async () => {
      pendingOpen.resolve({ content: { type: 'Buffer', data: [1] }, contentType: 'image/png' });
      pendingDownload.resolve({ content: { type: 'Buffer', data: [2] }, contentType: 'image/png' });
      await Promise.all([pendingOpen.promise, pendingDownload.promise]);
    });

    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    expect(mockSaveBufferedFile).not.toHaveBeenCalled();
  });

  it('rejects data, preview, and download work when the bearer token changes with identical claims', async () => {
    await renderLoadedScreen('Admin', response('current bearer', { viewKycFiles: true }));
    mockGetKycFile.mockResolvedValueOnce({
      content: { type: 'Buffer', data: [37, 80, 68, 70] },
      contentType: 'application/pdf',
    });
    fireEvent.click(screen.getByTestId('open-valid-file'));
    await waitFor(() => expect(screen.getByTestId('preview-url')).toHaveTextContent('blob:e2e-preview'));

    const staleData = deferred<TestResponse>();
    const stalePreview = deferred<{ content: { type: string; data: number[] }; contentType: string }>();
    const staleDownload = deferred<{ content: { type: string; data: number[] }; contentType: string }>();
    mockPendingRequests.push(staleData);
    mockGetKycFile.mockReturnValueOnce(staleDownload.promise).mockReturnValueOnce(stalePreview.promise);
    fireEvent.click(screen.getByTestId('download-preview'));
    fireEvent.click(screen.getByTestId('open-valid-file'));
    fireEvent.click(screen.getByTestId('manual-refresh'));
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockGetKycFile).toHaveBeenCalledTimes(3));

    mockAuthToken = 'rotated-token-with-same-claims';
    await act(async () => {
      staleData.resolve(response('stale bearer data'));
      stalePreview.resolve({ content: { type: 'Buffer', data: [1] }, contentType: 'application/pdf' });
      staleDownload.resolve({ content: { type: 'Buffer', data: [2] }, contentType: 'application/pdf' });
      await Promise.all([staleData.promise, stalePreview.promise, staleDownload.promise]);
    });
    expect(screen.queryByText('stale bearer data')).not.toBeInTheDocument();
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    expect(mockSaveBufferedFile).not.toHaveBeenCalled();
  });
});
