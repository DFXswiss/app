let mockRole = 'Compliance';
let mockUserDataId: string | undefined = '12';
const mockGetUserData = jest.fn();
const mockGetKycFile = jest.fn();
const mockNavigate = jest.fn();
const mockSetSplitPercent = jest.fn();
const mockHandleSplitDrag = jest.fn();
const mockSaveBufferedFile = jest.fn();
const mockCreateObjectURL = jest.fn();
const mockRevokeObjectURL = jest.fn();
const mockUserDataPanelRender = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  UserRole: { USER: 'User', VIP: 'VIP', SUPPORT: 'Support', COMPLIANCE: 'Compliance', ADMIN: 'Admin' },
  useAuthContext: () => ({ session: { role: mockRole } }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { LG: 'lg' },
  StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: mockUserDataId }),
}));

jest.mock('src/components/compliance/detail-tabs', () => ({
  UsersTable: () => <div data-testid="users-table" />,
  KycStepsTable: () => <div data-testid="kyc-steps-table" />,
  KycLogsTable: () => <div data-testid="kyc-logs-table" />,
  BankDatasTable: () => <div data-testid="bank-datas-table" />,
  VirtualIbansTable: () => <div data-testid="virtual-ibans-table" />,
  BuyRoutesTable: () => <div data-testid="buy-routes-table" />,
  SellRoutesTable: () => <div data-testid="sell-routes-table" />,
  SwapRoutesTable: () => <div data-testid="swap-routes-table" />,
  RefRewardsTable: () => <div data-testid="ref-rewards-table" />,
  NotificationsTable: () => <div data-testid="notifications-table" />,
}));

jest.mock('src/components/compliance/transactions-tab', () => ({
  TransactionsTable: (props: any) => (
    <div data-testid="transactions-table">
      <span data-testid="expanded-values">
        {[
          props.expandedBankTxId,
          props.expandedCryptoInputId,
          props.expandedBankDataId,
          props.expandedFiatOutputId,
          props.expandedTxUid,
        ]
          .map((value) => value ?? '-')
          .join('|')}
      </span>
      <button type="button" onClick={() => props.onExpandBankTx(11)}>
        expand bank tx
      </button>
      <button type="button" onClick={() => props.onExpandCryptoInput(22)}>
        expand crypto input
      </button>
      <button type="button" onClick={() => props.onExpandBankData(33)}>
        expand bank data
      </button>
      <button type="button" onClick={() => props.onExpandFiatOutput(44)}>
        expand fiat output
      </button>
      <button type="button" onClick={() => props.onExpandTxUid('tx-55')}>
        expand transaction uid
      </button>
      <button type="button" onClick={props.onStatusChanged}>
        refresh transactions
      </button>
    </div>
  ),
}));

jest.mock('src/components/compliance/file-preview-panel', () => ({
  FilePreviewPanel: ({ preview, onClose, onDownload }: any) => (
    <div data-testid="file-preview-panel">
      <span>{preview?.name ?? 'no preview'}</span>
      <button type="button" onClick={onClose}>
        close preview
      </button>
      <button type="button" onClick={onDownload}>
        download preview
      </button>
    </div>
  ),
}));

jest.mock('src/components/compliance/ip-logs-panel', () => ({
  IpLogsPanel: () => <div data-testid="ip-logs-panel" />,
}));
jest.mock('src/components/compliance/kyc-files-panel', () => ({
  KycFilesPanel: ({ onOpenFile }: any) => (
    <div data-testid="kyc-files-panel">
      <button type="button" onClick={() => onOpenFile({ uid: 'file-1', name: 'selfie.jpg' })}>
        open file
      </button>
    </div>
  ),
}));
jest.mock('src/components/compliance/notes-tab', () => ({
  NotesTab: ({ onChange }: any) => (
    <div data-testid="notes-tab">
      <button type="button" onClick={onChange}>
        refresh notes
      </button>
    </div>
  ),
}));
jest.mock('src/components/compliance/recommendation-panel', () => ({
  RecommendationPanel: () => <div data-testid="recommendation-panel" />,
}));
jest.mock('src/components/compliance/support-issues-panel', () => ({
  SupportIssuesPanel: () => <div data-testid="support-issues-panel" />,
}));
jest.mock('src/components/compliance/support-user-overview-panel', () => ({
  SupportUserOverviewPanel: () => <div data-testid="support-overview-panel" />,
}));
jest.mock('src/components/compliance/user-data-panel', () => ({
  UserDataPanel: (props: any) => {
    mockUserDataPanelRender(props);
    return (
      <div data-testid="user-data-panel" data-wide={String(props.wide)} data-copy-kyc={String(props.canCopyKycLinks)}>
        <button type="button" onClick={props.onAccountAccessChanged}>
          refresh account access
        </button>
        <button type="button" onClick={props.onLimitRequestCreated}>
          refresh limit request
        </button>
        <button type="button" onClick={props.onCreateNote}>
          create note
        </button>
      </div>
    );
  },
}));
jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));
jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_namespace: string, key: string) => key }),
}));
jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => ({ getUserData: mockGetUserData, getKycFile: mockGetKycFile }),
}));
jest.mock('src/hooks/guard.hook', () => ({ useSupportDashboardGuard: () => undefined }));
jest.mock('src/hooks/layout-config.hook', () => ({ useLayoutOptions: () => undefined }));
jest.mock('src/hooks/split-pane.hook', () => ({
  useSplitPane: () => ({
    containerRef: { current: null },
    splitPercent: 40,
    setSplitPercent: mockSetSplitPercent,
    handleSplitDrag: mockHandleSplitDrag,
  }),
}));
jest.mock('src/util/utils', () => ({ saveBufferedFile: (...args: unknown[]) => mockSaveBufferedFile(...args) }));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComplianceUserData } from 'src/hooks/compliance.hook';
import ComplianceUserScreen from 'src/screens/compliance-user.screen';

function dossier(overrides: Record<string, unknown> = {}): ComplianceUserData {
  return {
    userData: { id: 12, firstname: 'Ada', surname: 'Example' },
    permissions: {
      canRequestLimit: true,
      canPerformTransactionActions: true,
      viewRecommendation: true,
      viewKycFiles: true,
      viewKycLogs: true,
      viewIpLogs: true,
      viewSupportIssues: true,
    },
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
    kycFiles: [{}],
    ipLogs: [{}],
    supportIssues: [{}],
    ...overrides,
  } as unknown as ComplianceUserData;
}

async function renderDossier(data: ComplianceUserData = dossier()) {
  mockGetUserData.mockResolvedValue(data);
  const result = render(<ComplianceUserScreen />);
  await waitFor(() => expect(screen.getByTestId('user-data-panel')).toBeInTheDocument());
  return result;
}

describe('ComplianceUserScreen', () => {
  beforeAll(() => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: mockCreateObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: mockRevokeObjectURL });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateObjectURL.mockImplementation(() => 'blob:preview');
    mockRole = 'Compliance';
    mockUserDataId = '12';
  });

  it('shows the loading spinner while the dossier is pending', () => {
    mockGetUserData.mockReturnValue(new Promise(() => undefined));

    render(<ComplianceUserScreen />);

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('shows an error when the route has no customer id', async () => {
    mockUserDataId = undefined;

    render(<ComplianceUserScreen />);

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('No ID provided'));
    expect(mockGetUserData).not.toHaveBeenCalled();
  });

  it.each([
    { failure: new Error('Dossier failed'), expectedMessage: 'Dossier failed' },
    { failure: 'failure', expectedMessage: 'Unknown error' },
  ])('shows a load failure without data', async ({ failure, expectedMessage }) => {
    mockGetUserData.mockRejectedValue(failure);

    render(<ComplianceUserScreen />);

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent(expectedMessage));
  });

  it('keeps the later dossier when account-access reloads resolve in reverse order', async () => {
    let resolveOlder!: (value: ComplianceUserData) => void;
    const olderRequest = new Promise<ComplianceUserData>((resolve) => {
      resolveOlder = resolve;
    });
    mockGetUserData
      .mockResolvedValueOnce(dossier())
      .mockReturnValueOnce(olderRequest)
      .mockResolvedValueOnce(dossier({ users: [{}, {}] }));

    render(<ComplianceUserScreen />);
    await waitFor(() => expect(screen.getByTestId('user-data-panel')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'refresh account access' }));
    fireEvent.click(screen.getByRole('button', { name: 'refresh account access' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Users (2)' })).toBeInTheDocument());

    await act(async () => {
      resolveOlder(dossier({ users: [{}, {}, {}] }));
    });

    expect(screen.getByRole('button', { name: 'Users (2)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Users (3)' })).not.toBeInTheDocument();
  });

  it('ignores an older account-access reload rejection after a newer success', async () => {
    let rejectOlder!: (reason?: unknown) => void;
    const olderRequest = new Promise<ComplianceUserData>((_resolve, reject) => {
      rejectOlder = reject;
    });
    mockGetUserData
      .mockResolvedValueOnce(dossier())
      .mockReturnValueOnce(olderRequest)
      .mockResolvedValueOnce(dossier({ users: [{}, {}] }));

    render(<ComplianceUserScreen />);
    await waitFor(() => expect(screen.getByTestId('user-data-panel')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'refresh account access' }));
    fireEvent.click(screen.getByRole('button', { name: 'refresh account access' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Users (2)' })).toBeInTheDocument());
    const rendersBeforeRejection = mockUserDataPanelRender.mock.calls.length;

    await act(async () => {
      rejectOlder(new Error('Older request failed'));
    });

    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(mockUserDataPanelRender).toHaveBeenCalledTimes(rendersBeforeRejection);
  });

  it('shows the missing-id error if the route id disappears after data loaded', async () => {
    const { rerender } = await renderDossier();

    mockUserDataId = undefined;
    rerender(<ComplianceUserScreen />);

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('No ID provided'));
    expect(screen.queryByTestId('user-data-panel')).not.toBeInTheDocument();
  });

  it('drops the previous dossier while loading a new route id', async () => {
    const { rerender } = await renderDossier();
    mockGetUserData.mockReturnValue(new Promise(() => undefined));

    mockUserDataId = '13';
    rerender(<ComplianceUserScreen />);

    await waitFor(() => expect(screen.getByTestId('loading-spinner')).toBeInTheDocument());
    expect(screen.queryByTestId('user-data-panel')).not.toBeInTheDocument();
    expect(mockGetUserData).toHaveBeenLastCalledWith(13);
  });

  it('shows a new route id load failure instead of the previous dossier', async () => {
    const { rerender } = await renderDossier();
    mockGetUserData.mockRejectedValue(new Error('Dossier 13 failed'));

    mockUserDataId = '13';
    rerender(<ComplianceUserScreen />);

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Dossier 13 failed'));
    expect(screen.queryByTestId('user-data-panel')).not.toBeInTheDocument();
  });

  it('does not show the previous route id load failure while a new route id loads', async () => {
    mockGetUserData.mockRejectedValue(new Error('Dossier 12 failed'));
    const { rerender } = render(<ComplianceUserScreen />);
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Dossier 12 failed'));
    mockGetUserData.mockReturnValue(new Promise(() => undefined));

    mockUserDataId = '13';
    rerender(<ComplianceUserScreen />);

    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(mockGetUserData).toHaveBeenLastCalledWith(13);
  });

  it('keeps the dossier visible while reloading the same route id', async () => {
    await renderDossier();
    mockGetUserData.mockReturnValue(new Promise(() => undefined));

    fireEvent.click(screen.getByRole('button', { name: 'refresh account access' }));

    expect(screen.getByTestId('user-data-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    expect(mockGetUserData).toHaveBeenLastCalledWith(12);
  });

  it('renders the Support layout and reload callbacks without middle panels', async () => {
    mockRole = 'Support';
    const data = dossier({
      permissions: {
        canRequestLimit: false,
        canPerformTransactionActions: false,
        viewRecommendation: false,
        viewKycFiles: false,
        viewKycLogs: false,
        viewIpLogs: false,
        viewSupportIssues: false,
      },
      transactions: undefined,
      users: undefined,
      kycSteps: undefined,
      bankDatas: undefined,
      virtualIbans: undefined,
      buyRoutes: undefined,
      sellRoutes: undefined,
      swapRoutes: undefined,
      refRewards: undefined,
      notifications: undefined,
      notes: undefined,
    });

    await renderDossier(data);

    expect(screen.getByTestId('user-data-panel')).toHaveAttribute('data-wide', 'true');
    expect(screen.getByTestId('user-data-panel')).toHaveAttribute('data-copy-kyc', 'false');
    expect(screen.getByTestId('support-overview-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('recommendation-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('kyc-files-panel')).not.toBeInTheDocument();
    expect(mockSetSplitPercent).toHaveBeenCalledWith(50);

    fireEvent.click(screen.getByRole('button', { name: 'refresh account access' }));
    fireEvent.click(screen.getByRole('button', { name: 'refresh limit request' }));
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledTimes(3));

    fireEvent.click(screen.getByRole('button', { name: 'create note' }));
    expect(mockNavigate).toHaveBeenCalledWith('/notes?userDataId=12&compose=1');
  });

  it('renders every permitted panel, tab, expansion handler and the splitter for Compliance', async () => {
    await renderDossier();

    expect(screen.getByTestId('user-data-panel')).toHaveAttribute('data-wide', 'false');
    expect(screen.getByTestId('user-data-panel')).toHaveAttribute('data-copy-kyc', 'true');
    expect(screen.getByTestId('recommendation-panel')).toBeInTheDocument();
    expect(screen.getByTestId('kyc-files-panel')).toBeInTheDocument();
    expect(screen.getByTestId('ip-logs-panel')).toBeInTheDocument();
    expect(screen.getByTestId('support-issues-panel')).toBeInTheDocument();
    expect(screen.getByTestId('file-preview-panel')).toBeInTheDocument();

    const splitter = document.querySelector('.cursor-col-resize') as HTMLElement;
    fireEvent.mouseDown(splitter);
    expect(mockHandleSplitDrag).toHaveBeenCalledTimes(1);

    expect(screen.getByTestId('expanded-values')).toHaveTextContent('-|-|-|-|-');
    fireEvent.click(screen.getByRole('button', { name: 'expand bank tx' }));
    expect(screen.getByTestId('expanded-values')).toHaveTextContent('11|-|-|-|-');
    fireEvent.click(screen.getByRole('button', { name: 'expand crypto input' }));
    expect(screen.getByTestId('expanded-values')).toHaveTextContent('-|22|-|-|-');
    fireEvent.click(screen.getByRole('button', { name: 'expand bank data' }));
    expect(screen.getByTestId('expanded-values')).toHaveTextContent('-|-|33|-|-');
    fireEvent.click(screen.getByRole('button', { name: 'expand fiat output' }));
    expect(screen.getByTestId('expanded-values')).toHaveTextContent('-|-|-|44|-');
    fireEvent.click(screen.getByRole('button', { name: 'expand transaction uid' }));
    expect(screen.getByTestId('expanded-values')).toHaveTextContent('-|-|-|-|tx-55');

    const tabs = [
      ['Users', 'users-table'],
      ['KYC Steps', 'kyc-steps-table'],
      ['KYC Log', 'kyc-logs-table'],
      ['Bank Data', 'bank-datas-table'],
      ['Virtual IBANs', 'virtual-ibans-table'],
      ['Buy Routes', 'buy-routes-table'],
      ['Sell Routes', 'sell-routes-table'],
      ['Swap Routes', 'swap-routes-table'],
      ['Ref Rewards', 'ref-rewards-table'],
      ['Notifications', 'notifications-table'],
      ['Notes', 'notes-tab'],
    ];
    for (const [label, testId] of tabs) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label} \\(`) }));
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('button', { name: 'refresh notes' }));
    fireEvent.click(screen.getByRole('button', { name: /^Transactions \(/ }));
    fireEvent.click(screen.getByRole('button', { name: 'refresh transactions' }));
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledTimes(3));
  });

  it('allows Admin to copy KYC links through the first role branch', async () => {
    mockRole = 'Admin';

    await renderDossier(
      dossier({
        kycLogs: undefined,
        kycFiles: undefined,
        ipLogs: undefined,
        supportIssues: undefined,
        notes: undefined,
      }),
    );

    expect(screen.getByTestId('user-data-panel')).toHaveAttribute('data-copy-kyc', 'true');
    expect(screen.getByTestId('recommendation-panel')).toBeInTheDocument();
    expect(screen.getByTestId('file-preview-panel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'KYC Log (0)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'KYC Log (0)' }));
    expect(screen.getByTestId('kyc-logs-table')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Notes (0)' }));
    expect(screen.getByTestId('notes-tab')).toBeInTheDocument();
  });

  it('hides the right side when Compliance has no KYC-file permission', async () => {
    const data = dossier({
      permissions: {
        canRequestLimit: false,
        canPerformTransactionActions: false,
        viewRecommendation: false,
        viewKycFiles: false,
        viewKycLogs: false,
        viewIpLogs: false,
        viewSupportIssues: false,
      },
    });

    const { container } = await renderDossier(data);

    expect(container.querySelector('.cursor-col-resize')).not.toBeInTheDocument();
    expect(screen.queryByTestId('file-preview-panel')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^KYC Log \(/ })).not.toBeInTheDocument();
  });

  it('opens, downloads, closes and revokes a valid file preview', async () => {
    const viewContent = { type: 'Buffer', data: [1, 2, 3] };
    const downloadContent = { type: 'Buffer', data: [4, 5, 6] };
    mockGetKycFile
      .mockResolvedValueOnce({ content: viewContent, contentType: 'image/jpeg' })
      .mockResolvedValueOnce({ content: downloadContent, contentType: 'image/jpeg' });
    const { unmount } = await renderDossier();

    fireEvent.click(screen.getByRole('button', { name: 'open file' }));
    await waitFor(() => expect(screen.getByText('selfie.jpg')).toBeInTheDocument());
    expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));

    fireEvent.click(screen.getByRole('button', { name: 'download preview' }));
    await waitFor(() => expect(mockSaveBufferedFile).toHaveBeenCalledWith(downloadContent, 'image/jpeg', 'selfie.jpg'));

    unmount();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('closes a displayed file preview', async () => {
    mockGetKycFile.mockResolvedValue({
      content: { type: 'Buffer', data: [1] },
      contentType: 'image/jpeg',
    });
    await renderDossier();

    fireEvent.click(screen.getByRole('button', { name: 'open file' }));
    await waitFor(() => expect(screen.getByText('selfie.jpg')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'close preview' }));

    await waitFor(() => expect(screen.getByText('no preview')).toBeInTheDocument());
    expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it.each([
    [undefined, 'missing content'],
    [{ type: 'Text', data: [1] }, 'wrong content type'],
    [{ type: 'Buffer', data: 'not-an-array' }, 'wrong data shape'],
  ])('rejects an invalid file preview: %s', async (content) => {
    mockGetKycFile.mockResolvedValue({ content, contentType: 'image/jpeg' });
    await renderDossier();
    const rendersBeforeOpen = mockUserDataPanelRender.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'open file' }));

    await waitFor(() => expect(mockUserDataPanelRender.mock.calls.length).toBeGreaterThan(rendersBeforeOpen));
    expect(mockGetKycFile).toHaveBeenCalledWith('file-1', 'View');
    expect(mockCreateObjectURL).not.toHaveBeenCalled();
    expect(screen.getByText('no preview')).toBeInTheDocument();
  });

  it.each([[new Error('Preview failed')], ['failure']])('handles a thrown file-preview error', async (failure) => {
    mockGetKycFile.mockRejectedValue(failure);
    await renderDossier();
    const rendersBeforeOpen = mockUserDataPanelRender.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'open file' }));

    await waitFor(() => expect(mockUserDataPanelRender.mock.calls.length).toBeGreaterThan(rendersBeforeOpen));
    expect(mockGetKycFile).toHaveBeenCalledWith('file-1', 'View');
    expect(screen.getByText('no preview')).toBeInTheDocument();
  });

  it('does not download when no preview uid exists', async () => {
    await renderDossier();

    fireEvent.click(screen.getByRole('button', { name: 'download preview' }));

    expect(mockGetKycFile).not.toHaveBeenCalled();
    expect(mockSaveBufferedFile).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, 'missing content'],
    [{ type: 'Text', data: [1] }, 'wrong content type'],
    [{ type: 'Buffer', data: 'not-an-array' }, 'wrong data shape'],
  ])('rejects an invalid download: %s', async (downloadContent) => {
    mockGetKycFile
      .mockResolvedValueOnce({ content: { type: 'Buffer', data: [1] }, contentType: 'image/jpeg' })
      .mockResolvedValueOnce({ content: downloadContent, contentType: 'image/jpeg' });
    await renderDossier();

    fireEvent.click(screen.getByRole('button', { name: 'open file' }));
    await waitFor(() => expect(screen.getByText('selfie.jpg')).toBeInTheDocument());
    const rendersBeforeDownload = mockUserDataPanelRender.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'download preview' }));

    await waitFor(() => expect(mockUserDataPanelRender.mock.calls.length).toBeGreaterThan(rendersBeforeDownload));
    expect(mockGetKycFile).toHaveBeenCalledWith('file-1', 'Download');
    expect(mockSaveBufferedFile).not.toHaveBeenCalled();
  });

  it.each([[new Error('Download failed')], ['failure']])('handles a thrown download error', async (failure) => {
    mockGetKycFile
      .mockResolvedValueOnce({ content: { type: 'Buffer', data: [1] }, contentType: 'image/jpeg' })
      .mockRejectedValueOnce(failure);
    await renderDossier();

    fireEvent.click(screen.getByRole('button', { name: 'open file' }));
    await waitFor(() => expect(screen.getByText('selfie.jpg')).toBeInTheDocument());
    const rendersBeforeDownload = mockUserDataPanelRender.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'download preview' }));

    await waitFor(() => expect(mockUserDataPanelRender.mock.calls.length).toBeGreaterThan(rendersBeforeDownload));
    expect(mockGetKycFile).toHaveBeenCalledWith('file-1', 'Download');
    expect(mockSaveBufferedFile).not.toHaveBeenCalled();
  });
});
