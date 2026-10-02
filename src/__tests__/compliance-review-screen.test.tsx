jest.mock('@dfx.swiss/react', () => ({
  KycStatus: { CHECK: 'Check', COMPLETED: 'Completed' },
  CheckStatus: { PENDING: 'Pending' },
  AmlReason: { MANUAL_CHECK: 'ManualCheck', NA: 'Na' },
}));

import { AmlReason, CheckStatus, KycStatus } from '@dfx.swiss/react';
import { act, fireEvent, render, RenderResult, screen, waitFor } from '@testing-library/react';
import { ComplianceReviewFreigabeSaveParams } from 'src/components/compliance/freigabe-panel';
import { AmlCheckUpdate } from 'src/components/compliance/aml-check-panel';
import { reviewTabs } from 'src/components/compliance/compliance-review-configs';
import {
  BankDataInfo,
  ComplianceUserData,
  KycFile,
  KycStepInfo,
  TransactionInfo,
  UserDataDetail,
} from 'src/hooks/compliance.hook';
import { saveBufferedFile as mockSaveBufferedFile } from 'src/util/utils';

type SaveHandler = (
  stepId: number,
  status: string,
  clerk: string,
  description: string,
  comment?: string,
  result?: string,
) => Promise<void>;

interface HeaderProps {
  userData: UserDataDetail;
  onSetKycStatusCheck: () => Promise<void>;
}

interface ReviewProps {
  step?: KycStepInfo;
  files: KycFile[];
  onOpenFile: (file: KycFile) => Promise<void>;
  onSave: SaveHandler;
}

interface FreigabeProps {
  kycFiles: KycFile[];
  onOpenFile: (file: KycFile) => Promise<void>;
  onSave: (params: ComplianceReviewFreigabeSaveParams) => Promise<void>;
}

interface BankProps {
  onApprove: (bankDataId: number, clerk: string) => Promise<void>;
  onReject: (bankDataId: number, clerk: string) => Promise<void>;
}

interface AmlProps {
  onUpdate: (tx: TransactionInfo, update: AmlCheckUpdate, clerk: string) => Promise<void>;
  onReset: (tx: TransactionInfo, clerk: string) => Promise<void>;
  onReviewReset: (tx: TransactionInfo) => Promise<void>;
  onRefUserKycCleared?: () => Promise<void>;
  onScorechainCleared?: () => Promise<void>;
}

interface PreviewProps {
  preview?: { url: string; contentType: string; name: string; uid?: string };
  onClose: () => void;
  onDownload: () => Promise<void>;
}

interface LayoutOptions {
  onBack: () => void;
}

let mockRouteId: string | undefined = '42';
let mockTabParam: string | null = null;
let capturePanelCreate = false;

function mockRecording<P>(renderPanel: (props: P) => JSX.Element): (props: P) => JSX.Element {
  const panel = (props: P) => renderPanel(props);
  return Object.assign(panel, { recordProps: true as const });
}

function mockCallRecordingPanel(type: unknown, props: unknown): void {
  if (!capturePanelCreate || props == null || typeof type !== 'function') return;
  if (!(type as { recordProps?: boolean }).recordProps) return;
  (type as (nextProps: object) => unknown)(props as object);
}

interface JsxDevRuntime {
  jsxDEV: (
    type: unknown,
    props: unknown,
    key: unknown,
    isStaticChildren: boolean,
    source: unknown,
    self: unknown,
  ) => unknown;
}
let mockHeaderProps: HeaderProps | undefined;
let mockReviewProps: ReviewProps | undefined;
let mockStammdatenProps: ReviewProps | undefined;
let mockIdentProps: ReviewProps | undefined;
let mockFreigabeProps: FreigabeProps | undefined;
let mockBankProps: BankProps | undefined;
let mockAmlProps: AmlProps | undefined;
let mockPreviewProps: PreviewProps | undefined;
let mockLayoutOptions: LayoutOptions | undefined;
const mockHeaderHistory: HeaderProps[] = [];
const mockReviewHistory: ReviewProps[] = [];
const mockStammdatenHistory: ReviewProps[] = [];
const mockIdentHistory: ReviewProps[] = [];
const mockFreigabeHistory: FreigabeProps[] = [];
const mockBankHistory: BankProps[] = [];
const mockAmlHistory: AmlProps[] = [];

const mockNavigate = jest.fn();
const mockSplitDrag = jest.fn();
const mockGetUserData = jest.fn();
const mockSetKycStatusCheck = jest.fn();
const mockUpdateKycStep = jest.fn();
const mockUpdateUserData = jest.fn();
const mockUpdateBankData = jest.fn();
const mockUpdateBuyCrypto = jest.fn();
const mockUpdateBuyFiat = jest.fn();
const mockResetBuyCryptoReviewAml = jest.fn();
const mockResetBuyFiatAml = jest.fn();
const mockGenerateOnboardingPdf = jest.fn();
const mockCreateKycLog = jest.fn();
const mockGetKycFile = jest.fn();
const mockCreateObjectURL = jest.fn(() => 'blob:preview');
const mockRevokeObjectURL = jest.fn();

jest.mock('react/jsx-dev-runtime', () => {
  const actual = jest.requireActual('react/jsx-dev-runtime') as JsxDevRuntime;
  return {
    ...actual,
    jsxDEV: (
      type: unknown,
      props: unknown,
      key: unknown,
      isStaticChildren: boolean,
      source: unknown,
      self: unknown,
    ) => {
      mockCallRecordingPanel(type, props);
      return actual.jsxDEV(type, props, key, isStaticChildren, source, self);
    },
  };
});

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: mockRouteId }),
  useSearchParams: () => [new URLSearchParams(mockTabParam ? `tab=${mockTabParam}` : ''), jest.fn()],
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { LG: 'LG' },
  StyledLoadingSpinner: () => <div>loading</div>,
}));

jest.mock('src/hooks/guard.hook', () => ({ useComplianceGuard: jest.fn() }));
jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: (options: LayoutOptions) => {
    mockLayoutOptions = options;
  },
}));
jest.mock('src/hooks/split-pane.hook', () => ({
  useSplitPane: () => ({ containerRef: { current: null }, splitPercent: 60, handleSplitDrag: mockSplitDrag }),
}));
jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => ({
    getUserData: mockGetUserData,
    setKycStatusCheck: mockSetKycStatusCheck,
    updateKycStep: mockUpdateKycStep,
    updateUserData: mockUpdateUserData,
    updateBankData: mockUpdateBankData,
    updateBuyCrypto: mockUpdateBuyCrypto,
    updateBuyFiat: mockUpdateBuyFiat,
    resetBuyCryptoReviewAml: mockResetBuyCryptoReviewAml,
    resetBuyFiatAml: mockResetBuyFiatAml,
    generateOnboardingPdf: mockGenerateOnboardingPdf,
    createKycLog: mockCreateKycLog,
    getKycFile: mockGetKycFile,
  }),
}));

jest.mock('src/util/utils', () => ({ saveBufferedFile: jest.fn() }));
jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div>error:{message}</div>,
}));
jest.mock('src/components/compliance/compliance-review-header', () => ({
  ComplianceReviewHeader: mockRecording((props: HeaderProps) => {
    mockHeaderProps = props;
    mockHeaderHistory.push(props);
    return (
      <div>
        <span>account-{props.userData.id}</span>
        <button type="button" onClick={() => void props.onSetKycStatusCheck()}>
          set-status
        </button>
      </div>
    );
  }),
}));
jest.mock('src/components/compliance/compliance-review-panel', () => ({
  ComplianceReviewPanel: mockRecording((props: ReviewProps) => {
    mockReviewProps = props;
    mockReviewHistory.push(props);
    return (
      <div>
        <button type="button" onClick={() => void props.onOpenFile(mockFile())}>
          review-open
        </button>
        <button type="button" onClick={() => void props.onSave(7, 'Completed', 'Clerk', 'Review')}>
          review-save
        </button>
      </div>
    );
  }),
}));
jest.mock('src/components/compliance/freigabe-panel', () => ({
  ComplianceReviewFreigabePanel: mockRecording((props: FreigabeProps) => {
    mockFreigabeProps = props;
    mockFreigabeHistory.push(props);
    return (
      <div>
        <button type="button" onClick={() => void props.onOpenFile(mockFile())}>
          freigabe-open
        </button>
        <button type="button" onClick={() => void props.onSave({ stepId: 8, status: 'Completed' })}>
          freigabe-save
        </button>
      </div>
    );
  }),
}));
jest.mock('src/components/compliance/stammdaten-panel', () => ({
  StammdatenPanel: mockRecording((props: ReviewProps) => {
    mockStammdatenProps = props;
    mockStammdatenHistory.push(props);
    return (
      <div>
        <button type="button" onClick={() => void props.onOpenFile(mockFile())}>
          stammdaten-open
        </button>
        <button type="button" onClick={() => void props.onSave(9, 'Completed', 'Clerk', 'Stammdaten')}>
          stammdaten-save
        </button>
      </div>
    );
  }),
}));
jest.mock('src/components/compliance/ident-panel', () => ({
  IdentPanel: mockRecording((props: ReviewProps) => {
    mockIdentProps = props;
    mockIdentHistory.push(props);
    return (
      <div>
        <button type="button" onClick={() => void props.onOpenFile(mockFile())}>
          ident-open
        </button>
        <button type="button" onClick={() => void props.onSave(10, 'Completed', 'Clerk', 'Ident')}>
          ident-save
        </button>
      </div>
    );
  }),
}));
jest.mock('src/components/compliance/bank-data-panel', () => ({
  BankDataReviewPanel: mockRecording((props: BankProps) => {
    mockBankProps = props;
    mockBankHistory.push(props);
    return (
      <div>
        <button type="button" onClick={() => void props.onApprove(11, 'Clerk')}>
          bank-approve
        </button>
        <button type="button" onClick={() => void props.onReject(11, 'Clerk')}>
          bank-reject
        </button>
      </div>
    );
  }),
}));
jest.mock('src/components/compliance/aml-check-panel', () => ({
  AmlCheckPendingPanel: mockRecording((props: AmlProps) => {
    mockAmlProps = props;
    mockAmlHistory.push(props);
    return (
      <div>
        <button type="button" onClick={() => void props.onUpdate(mockTransaction(), { amlCheck: 'Pass' }, 'Clerk')}>
          aml-update
        </button>
        <button type="button" onClick={() => void props.onReset(mockTransaction(), 'Clerk')}>
          aml-reset
        </button>
        <button type="button" onClick={() => void props.onReviewReset(mockTransaction())}>
          aml-review-reset
        </button>
        <button type="button" onClick={() => void props.onRefUserKycCleared?.()}>
          ref-reload
        </button>
        <button type="button" onClick={() => void props.onScorechainCleared?.()}>
          scorechain-reload
        </button>
      </div>
    );
  }),
}));
jest.mock('src/components/compliance/file-preview-panel', () => ({
  FilePreviewPanel: (props: PreviewProps) => {
    mockPreviewProps = props;
    return (
      <div>
        <span>{props.preview?.name ?? 'no-preview'}</span>
        <button type="button" onClick={props.onClose}>
          preview-close
        </button>
        <button type="button" onClick={() => void props.onDownload()}>
          preview-download
        </button>
      </div>
    );
  },
}));

import ComplianceReviewScreen from 'src/screens/compliance-review.screen';

function mockStep(name: string, status = 'Pending', sequenceNumber = 1, result?: string): KycStepInfo {
  return { id: sequenceNumber, name, status, sequenceNumber, result, created: '2026-01-01' };
}

function mockFile(overrides: Partial<KycFile> = {}): KycFile {
  return {
    id: 1,
    uid: 'file-1',
    name: 'document.pdf',
    type: 'ResidencePermit',
    protected: false,
    valid: true,
    ...overrides,
  };
}

function mockTransaction(overrides: Partial<TransactionInfo> = {}): TransactionInfo {
  return {
    id: 1,
    uid: 'tx-1',
    buyCryptoId: 12,
    type: 'Buy',
    sourceType: 'BuyCrypto',
    amlCheck: CheckStatus.PENDING,
    amlReason: AmlReason.MANUAL_CHECK,
    isCompleted: false,
    created: '2026-01-01',
    ...overrides,
  };
}

function mockBank(status?: string): BankDataInfo {
  return {
    id: 1,
    iban: 'CH9300762011623852957',
    name: 'Test',
    status,
    approved: false,
    active: true,
    created: '2026-01-01',
  };
}

function mockData(
  options: {
    accountType?: string;
    kycStatus?: string;
    kycSteps?: KycStepInfo[];
    kycFiles?: KycFile[];
    bankDatas?: BankDataInfo[];
    transactions?: TransactionInfo[];
  } = {},
): ComplianceUserData {
  const kycStatus = 'kycStatus' in options ? options.kycStatus : KycStatus.COMPLETED;
  const userData: UserDataDetail = { id: 42, kycStatus };
  if (!('accountType' in options)) userData.accountType = 'Personal';
  else if (options.accountType !== undefined) userData.accountType = options.accountType;

  const data: ComplianceUserData = {
    userData,
    kycSteps: options.kycSteps ?? [],
    bankDatas: options.bankDatas ?? [],
    transactions: options.transactions ?? [],
    bankTxs: [],
    cryptoInputs: [],
    users: [],
    buyRoutes: [],
    sellRoutes: [],
    swapRoutes: [],
    virtualIbans: [],
    refRewards: [],
    notifications: [],
    notes: [],
    permissions: {
      viewKycFiles: true,
      viewKycLogs: true,
      viewIpLogs: true,
      viewSupportIssues: true,
      canRequestLimit: true,
      canPerformTransactionActions: true,
      viewRecommendation: true,
    },
  };
  if (!('kycFiles' in options) || options.kycFiles !== undefined) data.kycFiles = options.kycFiles ?? [];
  return data;
}

async function renderLoaded(data: ComplianceUserData = mockData()): Promise<RenderResult> {
  mockGetUserData.mockResolvedValue(data);
  const result = render(<ComplianceReviewScreen />);
  await screen.findByText('account-42');
  return result;
}

async function invoke(operation: () => Promise<void>): Promise<void> {
  await act(async () => {
    await operation();
  });
}

function tab(label: string): HTMLButtonElement {
  return screen.getByRole('button', { name: new RegExp(`^${label}`) }) as HTMLButtonElement;
}

function expectError(message: string): void {
  expect(screen.getByText(`error:${message}`)).toBeInTheDocument();
}

beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: mockCreateObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: mockRevokeObjectURL });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateObjectURL.mockImplementation(() => 'blob:preview');
  mockRouteId = '42';
  mockTabParam = null;
  capturePanelCreate = false;
  mockHeaderProps = undefined;
  mockReviewProps = undefined;
  mockStammdatenProps = undefined;
  mockIdentProps = undefined;
  mockFreigabeProps = undefined;
  mockBankProps = undefined;
  mockAmlProps = undefined;
  mockPreviewProps = undefined;
  mockLayoutOptions = undefined;
  mockHeaderHistory.length = 0;
  mockReviewHistory.length = 0;
  mockStammdatenHistory.length = 0;
  mockIdentHistory.length = 0;
  mockFreigabeHistory.length = 0;
  mockBankHistory.length = 0;
  mockAmlHistory.length = 0;
  mockSetKycStatusCheck.mockResolvedValue(undefined);
  mockUpdateKycStep.mockResolvedValue(undefined);
  mockUpdateUserData.mockResolvedValue(undefined);
  mockUpdateBankData.mockResolvedValue(undefined);
  mockUpdateBuyCrypto.mockResolvedValue(undefined);
  mockUpdateBuyFiat.mockResolvedValue(undefined);
  mockResetBuyCryptoReviewAml.mockResolvedValue(undefined);
  mockResetBuyFiatAml.mockResolvedValue(undefined);
  mockGenerateOnboardingPdf.mockResolvedValue({ pdfData: 'AQI=', fileName: 'onboarding.pdf' });
  mockCreateKycLog.mockResolvedValue(undefined);
  mockGetKycFile.mockResolvedValue({ content: { type: 'Buffer', data: [1, 2] }, contentType: 'application/pdf' });
});

describe('loading and routing', () => {
  it('handles a missing id, load failures, empty data, navigation and split dragging', async () => {
    mockRouteId = undefined;
    render(<ComplianceReviewScreen />);
    expect(await screen.findByText('error:No ID provided')).toBeInTheDocument();

    mockRouteId = '42';
    mockGetUserData.mockRejectedValueOnce(new Error('load failed'));
    const failed = render(<ComplianceReviewScreen />);
    expect(await screen.findByText('error:load failed')).toBeInTheDocument();
    failed.unmount();

    mockGetUserData.mockRejectedValueOnce('load failed');
    const unknown = render(<ComplianceReviewScreen />);
    expect(await screen.findByText('error:Unknown error')).toBeInTheDocument();
    unknown.unmount();

    mockGetUserData.mockResolvedValueOnce(undefined);
    const empty = render(<ComplianceReviewScreen />);
    expect(await screen.findByText('error:No data')).toBeInTheDocument();
    empty.unmount();

    await renderLoaded();
    act(() => mockLayoutOptions?.onBack());
    expect(mockNavigate).toHaveBeenCalledWith('/compliance');
    const splitter = document.querySelector('.cursor-col-resize');
    expect(splitter).not.toBeNull();
    fireEvent.mouseDown(splitter as Element);
    expect(mockSplitDrag).toHaveBeenCalled();
  });

  it('ignores a stale success and keeps loading until the current route resolves', async () => {
    let resolveOld: ((data: ComplianceUserData) => void) | undefined;
    let resolveNew: ((data: ComplianceUserData) => void) | undefined;
    mockGetUserData
      .mockImplementationOnce(() => new Promise<ComplianceUserData>((resolve) => (resolveOld = resolve)))
      .mockImplementationOnce(() => new Promise<ComplianceUserData>((resolve) => (resolveNew = resolve)));
    const view = render(<ComplianceReviewScreen />);
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledWith(42));

    mockRouteId = '43';
    view.rerender(<ComplianceReviewScreen />);
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledWith(43));
    await act(async () => resolveOld?.(mockData()));
    expect(screen.getByText('loading')).toBeInTheDocument();

    await act(async () => resolveNew?.({ ...mockData(), userData: { ...mockData().userData, id: 43 } }));
    expect(await screen.findByText('account-43')).toBeInTheDocument();
  });

  it('ignores a stale rejection without clearing the current loading state', async () => {
    let rejectOld: ((reason: unknown) => void) | undefined;
    let resolveNew: ((data: ComplianceUserData) => void) | undefined;
    mockGetUserData
      .mockImplementationOnce(() => new Promise<ComplianceUserData>((_, reject) => (rejectOld = reject)))
      .mockImplementationOnce(() => new Promise<ComplianceUserData>((resolve) => (resolveNew = resolve)));
    const view = render(<ComplianceReviewScreen />);
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledWith(42));

    mockRouteId = '43';
    view.rerender(<ComplianceReviewScreen />);
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledWith(43));
    await act(async () => rejectOld?.(new Error('stale')));
    expect(screen.getByText('loading')).toBeInTheDocument();

    await act(async () => resolveNew?.({ ...mockData(), userData: { ...mockData().userData, id: 43 } }));
    expect(await screen.findByText('account-43')).toBeInTheDocument();
  });
});

describe('file preview', () => {
  it('opens, downloads, closes and revokes a valid file preview', async () => {
    const view = await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Nationalität' }));
    await invoke(() => mockReviewProps?.onOpenFile(mockFile()) ?? Promise.resolve());
    expect(mockGetKycFile).toHaveBeenCalledWith('file-1', 'View');
    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(screen.getByText('document.pdf')).toBeInTheDocument();

    await invoke(() => mockPreviewProps?.onDownload() ?? Promise.resolve());
    expect(mockGetKycFile).toHaveBeenLastCalledWith('file-1', 'Download');
    expect(mockSaveBufferedFile).toHaveBeenCalledWith(
      { type: 'Buffer', data: [1, 2] },
      'application/pdf',
      'document.pdf',
    );
    view.unmount();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it.each([
    ['missing content', { content: undefined, contentType: 'application/pdf' }],
    ['wrong content type', { content: { type: 'String', data: [1] }, contentType: 'application/pdf' }],
    ['non-array data', { content: { type: 'Buffer', data: 'bad' }, contentType: 'application/pdf' }],
  ])('rejects %s while opening', async (_name, response) => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Nationalität' }));
    mockGetKycFile.mockResolvedValueOnce(response);
    await invoke(() => mockReviewProps?.onOpenFile(mockFile()) ?? Promise.resolve());
    expectError('Invalid file type');
  });

  it.each([
    ['an Error', new Error('open failed'), 'open failed'],
    ['a non-Error', 'open failed', 'Error loading file'],
  ])('handles %s while opening', async (_name, reason, message) => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Nationalität' }));
    mockGetKycFile.mockRejectedValueOnce(reason);
    await invoke(() => mockReviewProps?.onOpenFile(mockFile()) ?? Promise.resolve());
    expectError(message);
  });

  it.each([
    ['missing content', { content: undefined, contentType: 'application/pdf' }],
    ['wrong content type', { content: { type: 'String', data: [1] }, contentType: 'application/pdf' }],
    ['non-array data', { content: { type: 'Buffer', data: 'bad' }, contentType: 'application/pdf' }],
  ])('rejects %s while downloading', async (_name, response) => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Nationalität' }));
    await invoke(() => mockReviewProps?.onOpenFile(mockFile()) ?? Promise.resolve());
    mockGetKycFile.mockResolvedValueOnce(response);
    await invoke(() => mockPreviewProps?.onDownload() ?? Promise.resolve());
    expectError('Invalid file type');
  });

  it.each([
    ['an Error', new Error('download failed'), 'download failed'],
    ['a non-Error', 'download failed', 'Error downloading file'],
  ])('handles %s while downloading', async (_name, reason, message) => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Nationalität' }));
    await invoke(() => mockReviewProps?.onOpenFile(mockFile()) ?? Promise.resolve());
    mockGetKycFile.mockRejectedValueOnce(reason);
    await invoke(() => mockPreviewProps?.onDownload() ?? Promise.resolve());
    expectError(message);
  });
});

describe('save handlers', () => {
  it('saves a basic Freigabe step', async () => {
    mockTabParam = 'freigabe';
    await renderLoaded();
    await invoke(() => mockFreigabeProps?.onSave({ stepId: 8, status: 'Completed' }) ?? Promise.resolve());
    expect(mockUpdateKycStep).toHaveBeenCalledWith(8, {
      status: 'Completed',
      result: undefined,
      comment: undefined,
    });
    expect(mockUpdateUserData).not.toHaveBeenCalled();
    expect(mockCreateKycLog).not.toHaveBeenCalled();
  });

  it('updates non-null user data, logs the clerk and creates a PDF preview without a downloadable uid', async () => {
    mockTabParam = 'freigabe';
    await renderLoaded();
    const params: ComplianceReviewFreigabeSaveParams = {
      stepId: 8,
      status: 'Completed',
      userDataUpdate: { depositLimit: null, highRisk: false, moderator: 'Clerk' },
      pdfData: { finalDecision: 'Pass', processedBy: 'Clerk' },
    };
    await invoke(() => mockFreigabeProps?.onSave(params) ?? Promise.resolve());
    expect(mockUpdateUserData).toHaveBeenCalledWith(42, params.userDataUpdate);
    expect(mockCreateKycLog).toHaveBeenCalledWith(42, expect.not.stringContaining('depositLimit'));
    expect(mockCreateKycLog).toHaveBeenCalledWith(42, expect.stringContaining('DfxApproval'));
    expect(mockGenerateOnboardingPdf).toHaveBeenCalledWith(42, params.pdfData);
    expect(screen.getByText('onboarding.pdf')).toBeInTheDocument();

    mockGetKycFile.mockClear();
    await invoke(() => mockPreviewProps?.onDownload() ?? Promise.resolve());
    expect(mockGetKycFile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'preview-close' }));
    expect(screen.getByText('no-preview')).toBeInTheDocument();
  });

  it('continues reloading when PDF generation fails', async () => {
    mockTabParam = 'freigabe';
    await renderLoaded();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGenerateOnboardingPdf.mockRejectedValueOnce(new Error('pdf failed'));
    await invoke(
      () =>
        mockFreigabeProps?.onSave({
          stepId: 8,
          status: 'Completed',
          pdfData: { finalDecision: 'Pass', processedBy: 'Clerk' },
        }) ?? Promise.resolve(),
    );
    expect(errorSpy).toHaveBeenCalledWith('Failed to generate PDF:', expect.any(Error));
    expect(mockGetUserData).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  it.each([
    ['an Error', new Error('save failed'), 'save failed'],
    ['a non-Error', 'save failed', 'Error saving'],
  ])('handles %s from the outer Freigabe save', async (_name, reason, message) => {
    mockTabParam = 'freigabe';
    await renderLoaded();
    mockUpdateKycStep.mockRejectedValueOnce(reason);
    await invoke(() => mockFreigabeProps?.onSave({ stepId: 8, status: 'Failed' }) ?? Promise.resolve());
    expectError(message);
  });

  it('saves a default review tab and filters its files', async () => {
    mockTabParam = 'residencePermit';
    await renderLoaded(mockData({ kycFiles: [mockFile(), mockFile({ id: 2, uid: 'other', type: 'Identification' })] }));
    expect(mockReviewProps?.files).toEqual([expect.objectContaining({ uid: 'file-1' })]);
    await invoke(() => mockReviewProps?.onSave(7, 'Completed', 'Clerk', 'Residence', 'ok', '{}') ?? Promise.resolve());
    expect(mockUpdateKycStep).toHaveBeenCalledWith(7, { status: 'Completed', comment: 'ok', result: '{}' });
    expect(mockCreateKycLog).toHaveBeenCalled();
  });

  it.each([
    ['without a step', []],
    ['without a result', [mockStep('OperationalActivity')]],
    ['with a non-operational result', [mockStep('OperationalActivity', 'Pending', 1, '{"isOperational":false}')]],
    ['with invalid JSON', [mockStep('OperationalActivity', 'Pending', 1, '{')]],
  ])('saves operational activity %s without writing the AML account type', async (_name, kycSteps) => {
    mockTabParam = 'operationalActivity';
    await renderLoaded(mockData({ accountType: 'Organization', kycSteps }));
    await invoke(() => mockReviewProps?.onSave(7, 'Completed', 'Clerk', 'Operational') ?? Promise.resolve());
    expect(mockUpdateUserData).not.toHaveBeenCalled();
  });

  it('writes the derived AML account type from the latest operational step', async () => {
    mockTabParam = 'operationalActivity';
    await renderLoaded(
      mockData({
        accountType: 'Organization',
        kycSteps: [
          mockStep('OperationalActivity', 'Pending', 1, '{"isOperational":false}'),
          mockStep('OperationalActivity', 'Pending', 2, '{"isOperational":true}'),
        ],
      }),
    );
    await invoke(() => mockReviewProps?.onSave(7, 'Completed', 'Clerk', 'Operational') ?? Promise.resolve());
    expect(mockUpdateUserData).toHaveBeenCalledWith(42, { amlAccountType: 'operativ tätige Gesellschaft' });
    expect(mockCreateKycLog).toHaveBeenCalledWith(42, expect.stringContaining('amlAccountType'));
  });

  it.each([
    ['an Error', new Error('review failed'), 'review failed'],
    ['a non-Error', 'review failed', 'Error saving'],
  ])('handles %s from a review save', async (_name, reason, message) => {
    mockTabParam = 'nationalityData';
    await renderLoaded();
    mockUpdateKycStep.mockRejectedValueOnce(reason);
    await invoke(() => mockReviewProps?.onSave(7, 'Failed', 'Clerk', 'Review') ?? Promise.resolve());
    expectError(message);
  });
});

describe('bank data actions', () => {
  beforeEach(() => {
    mockTabParam = 'bankDataReview';
  });

  it('approves and rejects with audit logs', async () => {
    await renderLoaded();
    await invoke(() => mockBankProps?.onApprove(11, 'Clerk') ?? Promise.resolve());
    expect(mockUpdateBankData).toHaveBeenCalledWith(11, {
      manualApproved: true,
      approved: true,
      status: 'Completed',
    });
    expect(mockCreateKycLog).toHaveBeenCalledWith(42, expect.stringContaining('BankData'));

    await invoke(() => mockBankProps?.onReject(11, 'Clerk') ?? Promise.resolve());
    expect(mockUpdateBankData).toHaveBeenLastCalledWith(11, {
      manualApproved: false,
      approved: false,
      status: 'Failed',
    });
  });

  it.each([
    ['approve', new Error('approve failed'), 'approve failed'],
    ['approve', 'approve failed', 'Error approving'],
    ['reject', new Error('reject failed'), 'reject failed'],
    ['reject', 'reject failed', 'Error rejecting'],
  ])('handles %s failure', async (action, reason, message) => {
    await renderLoaded();
    mockUpdateBankData.mockRejectedValueOnce(reason);
    if (action === 'approve') await invoke(() => mockBankProps?.onApprove(11, 'Clerk') ?? Promise.resolve());
    else await invoke(() => mockBankProps?.onReject(11, 'Clerk') ?? Promise.resolve());
    expectError(message);
  });
});

describe('KYC status action', () => {
  it('returns for a missing status and for Check', async () => {
    await renderLoaded(mockData({ kycStatus: undefined }));
    await invoke(() => mockHeaderProps?.onSetKycStatusCheck() ?? Promise.resolve());
    expect(mockSetKycStatusCheck).not.toHaveBeenCalled();

    const checked = mockData({ kycStatus: KycStatus.CHECK });
    mockGetUserData.mockResolvedValueOnce(checked);
    const view = render(<ComplianceReviewScreen />);
    await screen.findByText('account-42');
    await invoke(() => mockHeaderProps?.onSetKycStatusCheck() ?? Promise.resolve());
    expect(mockSetKycStatusCheck).not.toHaveBeenCalled();
    view.unmount();
  });

  it('sets Check and reloads successfully', async () => {
    await renderLoaded();
    await invoke(() => mockHeaderProps?.onSetKycStatusCheck() ?? Promise.resolve());
    expect(mockSetKycStatusCheck).toHaveBeenCalledWith(42, KycStatus.COMPLETED);
    expect(mockGetUserData).toHaveBeenCalledTimes(2);
  });

  it('reports an Error from the update after a successful direct reload', async () => {
    await renderLoaded();
    mockSetKycStatusCheck.mockRejectedValueOnce(new Error('conflict'));
    await invoke(() => mockHeaderProps?.onSetKycStatusCheck() ?? Promise.resolve());
    expectError('KYC status could not be changed to Check: conflict');
  });

  it.each([
    ['a string update error and Error reload', 'conflict', new Error('reload failed'), 'conflict', 'reload failed'],
    [
      'an unknown update error and unknown reload',
      { conflict: true },
      'reload failed',
      'Unknown error',
      'Unknown error',
    ],
  ])('reports %s', async (_name, updateReason, reloadReason, updateMessage, reloadMessage) => {
    await renderLoaded();
    mockSetKycStatusCheck.mockRejectedValueOnce(updateReason);
    mockGetUserData.mockRejectedValueOnce(reloadReason);
    await invoke(() => mockHeaderProps?.onSetKycStatusCheck() ?? Promise.resolve());
    expectError(`KYC status could not be changed to Check: ${updateMessage}. Reload failed: ${reloadMessage}`);
  });

  it.each([
    ['an Error', new Error('refresh failed'), 'refresh failed'],
    ['a non-Error', 'refresh failed', 'Unknown error'],
  ])('reports %s when the update succeeds but reload fails', async (_name, reason, message) => {
    await renderLoaded();
    mockGetUserData.mockRejectedValueOnce(reason);
    await invoke(() => mockHeaderProps?.onSetKycStatusCheck() ?? Promise.resolve());
    expectError(`KYC status was changed to Check, but the data refresh failed: ${message}`);
  });
});

describe('AML update', () => {
  beforeEach(() => {
    mockTabParam = 'amlPending';
  });

  it('updates BuyCrypto and logs all supplied fields', async () => {
    await renderLoaded();
    const update = { amlCheck: 'Pass', amlReason: 'NA', priceDefinitionAllowedDate: '2026-02-01' };
    await invoke(() => mockAmlProps?.onUpdate(mockTransaction(), update, 'Clerk') ?? Promise.resolve());
    expect(mockUpdateBuyCrypto).toHaveBeenCalledWith(12, update);
    expect(mockCreateKycLog).toHaveBeenCalledWith(42, expect.stringContaining('priceDefinitionAllowedDate'));
  });

  it('updates BuyFiat with only selected fields', async () => {
    await renderLoaded();
    const tx = mockTransaction({ buyCryptoId: undefined, buyFiatId: 13, sourceType: 'BuyFiat' });
    await invoke(() => mockAmlProps?.onUpdate(tx, { amlReason: 'NA' }, 'Clerk') ?? Promise.resolve());
    expect(mockUpdateBuyFiat).toHaveBeenCalledWith(13, { amlReason: 'NA' });
    expect(mockUpdateBuyCrypto).not.toHaveBeenCalled();
  });

  it('logs an update with neither transaction id nor AML fields', async () => {
    await renderLoaded();
    await invoke(
      () =>
        mockAmlProps?.onUpdate(
          mockTransaction({ buyCryptoId: undefined, buyFiatId: undefined }),
          { comment: 'note' },
          'Clerk',
        ) ?? Promise.resolve(),
    );
    expect(mockUpdateBuyCrypto).not.toHaveBeenCalled();
    expect(mockUpdateBuyFiat).not.toHaveBeenCalled();
    expect(mockCreateKycLog).toHaveBeenCalled();
  });

  it.each([
    ['an Error', new Error('update failed'), 'update failed'],
    ['a non-Error', 'update failed', 'Error saving'],
  ])('handles %s', async (_name, reason, message) => {
    await renderLoaded();
    mockUpdateBuyCrypto.mockRejectedValueOnce(reason);
    await invoke(() => mockAmlProps?.onUpdate(mockTransaction(), { amlCheck: 'Fail' }, 'Clerk') ?? Promise.resolve());
    expectError(message);
  });
});

describe('AML reset', () => {
  beforeEach(() => {
    mockTabParam = 'amlPending';
  });

  it('rejects BuyCrypto without a current AML status before calling the API', async () => {
    await renderLoaded();
    await invoke(() => mockAmlProps?.onReset(mockTransaction({ amlCheck: undefined }), 'Clerk') ?? Promise.resolve());
    expect(mockResetBuyCryptoReviewAml).not.toHaveBeenCalled();
    expectError('Current BuyCrypto AML status is missing; reload the transaction');
  });

  it('resets BuyCrypto with and without an AML reason', async () => {
    await renderLoaded();
    await invoke(() => mockAmlProps?.onReset(mockTransaction({ amlReason: undefined }), 'Clerk') ?? Promise.resolve());
    expect(mockResetBuyCryptoReviewAml).toHaveBeenCalledWith(12, {
      expectedAmlCheck: CheckStatus.PENDING,
      expectedAmlReason: null,
    });

    await invoke(
      () => mockAmlProps?.onReset(mockTransaction({ amlReason: AmlReason.NA }), 'Clerk') ?? Promise.resolve(),
    );
    expect(mockResetBuyCryptoReviewAml).toHaveBeenLastCalledWith(12, {
      expectedAmlCheck: CheckStatus.PENDING,
      expectedAmlReason: AmlReason.NA,
    });
  });

  it('resets BuyFiat and tolerates a transaction without either id', async () => {
    await renderLoaded();
    await invoke(
      () =>
        mockAmlProps?.onReset(
          mockTransaction({ buyCryptoId: undefined, buyFiatId: 13, sourceType: 'BuyFiat' }),
          'Clerk',
        ) ?? Promise.resolve(),
    );
    expect(mockResetBuyFiatAml).toHaveBeenCalledWith(13);

    await invoke(
      () =>
        mockAmlProps?.onReset(mockTransaction({ buyCryptoId: undefined, buyFiatId: undefined }), 'Clerk') ??
        Promise.resolve(),
    );
    expect(mockCreateKycLog).toHaveBeenCalled();
  });

  it('reports an API Error after a successful reload', async () => {
    await renderLoaded();
    mockResetBuyCryptoReviewAml.mockRejectedValueOnce(new Error('reset failed'));
    await invoke(() => mockAmlProps?.onReset(mockTransaction(), 'Clerk') ?? Promise.resolve());
    expectError('reset failed');
  });

  it.each([
    ['Error reload', 'reset failed', new Error('reload failed'), 'Error resetting', 'reload failed'],
    ['unknown reload', new Error('reset failed'), 'reload failed', 'reset failed', 'Unknown error'],
  ])('reports an API failure with %s', async (_name, resetReason, reloadReason, resetMessage, reloadMessage) => {
    await renderLoaded();
    mockResetBuyCryptoReviewAml.mockRejectedValueOnce(resetReason);
    mockGetUserData.mockRejectedValueOnce(reloadReason);
    await invoke(() => mockAmlProps?.onReset(mockTransaction(), 'Clerk') ?? Promise.resolve());
    expectError(`${resetMessage}. Reload failed: ${reloadMessage}`);
  });

  it('keeps an Error log warning after a successful reload', async () => {
    await renderLoaded();
    mockCreateKycLog.mockRejectedValueOnce(new Error('log failed'));
    await invoke(() => mockAmlProps?.onReset(mockTransaction(), 'Clerk') ?? Promise.resolve());
    expectError('AML check was reset, but the additional KYC log failed: log failed');
  });

  it('combines an unknown log warning with a failed reload', async () => {
    await renderLoaded();
    mockCreateKycLog.mockRejectedValueOnce('log failed');
    mockGetUserData.mockRejectedValueOnce(new Error('refresh failed'));
    await invoke(() => mockAmlProps?.onReset(mockTransaction(), 'Clerk') ?? Promise.resolve());
    expectError(
      'AML check was reset, but the additional KYC log failed: Unknown error. Data refresh failed: refresh failed',
    );
  });

  it.each([
    ['an Error', new Error('refresh failed'), 'refresh failed'],
    ['a non-Error', 'refresh failed', 'Unknown error'],
  ])('reports %s when reload fails after a logged reset', async (_name, reason, message) => {
    await renderLoaded();
    mockGetUserData.mockRejectedValueOnce(reason);
    await invoke(() => mockAmlProps?.onReset(mockTransaction(), 'Clerk') ?? Promise.resolve());
    expectError(`AML check was reset, but Data refresh failed: ${message}`);
  });
});

describe('AML review reset', () => {
  beforeEach(() => {
    mockTabParam = 'amlPending';
  });

  it('returns without a BuyCrypto id or AML status', async () => {
    await renderLoaded();
    await invoke(() => mockAmlProps?.onReviewReset(mockTransaction({ buyCryptoId: undefined })) ?? Promise.resolve());
    await invoke(() => mockAmlProps?.onReviewReset(mockTransaction({ amlCheck: undefined })) ?? Promise.resolve());
    expect(mockResetBuyCryptoReviewAml).not.toHaveBeenCalled();
  });

  it('resets successfully with present and missing AML reasons', async () => {
    await renderLoaded();
    await invoke(() => mockAmlProps?.onReviewReset(mockTransaction({ amlReason: AmlReason.NA })) ?? Promise.resolve());
    expect(mockResetBuyCryptoReviewAml).toHaveBeenCalledWith(12, {
      expectedAmlCheck: CheckStatus.PENDING,
      expectedAmlReason: AmlReason.NA,
    });
    await invoke(() => mockAmlProps?.onReviewReset(mockTransaction({ amlReason: undefined })) ?? Promise.resolve());
    expect(mockResetBuyCryptoReviewAml).toHaveBeenLastCalledWith(12, {
      expectedAmlCheck: CheckStatus.PENDING,
      expectedAmlReason: null,
    });
  });

  it('reports an API Error after a successful reload', async () => {
    await renderLoaded();
    mockResetBuyCryptoReviewAml.mockRejectedValueOnce(new Error('reset failed'));
    await invoke(() => mockAmlProps?.onReviewReset(mockTransaction()) ?? Promise.resolve());
    expectError('reset failed');
  });

  it.each([
    ['Error reload', 'reset failed', new Error('reload failed'), 'Error resetting', 'reload failed'],
    ['unknown reload', new Error('reset failed'), 'reload failed', 'reset failed', 'Unknown error'],
  ])('reports an API failure with %s', async (_name, resetReason, reloadReason, resetMessage, reloadMessage) => {
    await renderLoaded();
    mockResetBuyCryptoReviewAml.mockRejectedValueOnce(resetReason);
    mockGetUserData.mockRejectedValueOnce(reloadReason);
    await invoke(() => mockAmlProps?.onReviewReset(mockTransaction()) ?? Promise.resolve());
    expectError(`${resetMessage}. Reload failed: ${reloadMessage}`);
  });

  it.each([
    ['an Error', new Error('refresh failed'), 'refresh failed'],
    ['a non-Error', 'refresh failed', 'Unknown error'],
  ])('reports %s when reload fails after success', async (_name, reason, message) => {
    await renderLoaded();
    mockGetUserData.mockRejectedValueOnce(reason);
    await invoke(() => mockAmlProps?.onReviewReset(mockTransaction()) ?? Promise.resolve());
    expectError(`AML check was reset, but the data refresh failed: ${message}`);
  });
});

describe('tab badges, colors and panels', () => {
  beforeEach(() => {
    mockTabParam = 'nationalityData';
  });

  it.each([
    ['empty', [], 'bg-dfxGray-300', null],
    ['failed', [mockBank('Failed')], 'bg-dfxRed-100/20', null],
    ['completed', [mockBank('Completed')], 'bg-dfxGreen-100/20', null],
    ['manual review', [mockBank('ManualReview')], 'bg-dfxGray-300', '1'],
  ])('renders the bank tab for %s rows', async (_name, bankDatas, color, badge) => {
    await renderLoaded(mockData({ bankDatas }));
    const button = tab('BankData Review');
    expect(button).toHaveClass(color);
    if (badge) expect(button).toHaveTextContent(badge);
    else expect(button.querySelector('span')).toBeNull();
  });

  it.each([
    ['no manual checks', [], 'bg-dfxGray-300', null],
    ['a failed manual check', [mockTransaction({ amlCheck: 'Fail' })], 'bg-dfxRed-100/20', null],
    ['a pending manual check', [mockTransaction()], 'bg-dfxGray-300', '1'],
    ['only completed manual checks', [mockTransaction({ amlCheck: 'Pass' })], 'bg-dfxGreen-100/20', null],
    ['a transaction without type', [mockTransaction({ type: undefined })], 'bg-dfxGray-300', null],
    [
      'a pending buy that is not a manual check',
      [mockTransaction({ type: 'Buy', amlReason: AmlReason.NA })],
      'bg-dfxGray-300',
      null,
    ],
  ])('renders the AML tab for %s', async (_name, transactions, color, badge) => {
    await renderLoaded(mockData({ transactions }));
    const button = tab('AML Pending');
    expect(button).toHaveClass(color);
    if (badge) expect(button).toHaveTextContent(badge);
    else expect(button.querySelector('span')).toBeNull();
  });

  it.each([
    ['no changes', [], 'bg-dfxGray-300', false],
    ['a failed change', [mockStep('NameChange', 'Failed')], 'bg-dfxRed-100/20', false],
    [
      'only completed changes',
      [mockStep('NameChange', 'Completed'), mockStep('AddressChange', 'Completed')],
      'bg-dfxGreen-100/20',
      false,
    ],
    ['an open change', [mockStep('AddressChange', 'Pending')], 'bg-dfxGray-300', true],
  ])('renders Stammdaten for %s', async (_name, kycSteps, color, hasBadge) => {
    await renderLoaded(mockData({ kycSteps }));
    const button = tab('Stammdaten');
    expect(button).toHaveClass(color);
    expect(button.querySelector('span') != null).toBe(hasBadge);
  });

  it.each([
    ['without a step', [], 'bg-dfxGray-300', null],
    ['completed', [mockStep('Recommendation', 'Completed')], 'bg-dfxGreen-100/20', 'bg-dfxGreen-100'],
    ['failed', [mockStep('Recommendation', 'Failed')], 'bg-dfxRed-100/20', 'bg-dfxRed-100'],
    ['pending', [mockStep('Recommendation', 'Pending')], 'bg-dfxGray-300', 'bg-dfxYellow-500'],
  ])('renders a KYC step tab %s', async (_name, kycSteps, color, badgeColor) => {
    await renderLoaded(mockData({ kycSteps }));
    const button = tab('Recommendation');
    expect(button).toHaveClass(color);
    const badge = button.querySelector('span');
    if (badgeColor) expect(badge).toHaveClass(badgeColor);
    else expect(badge).toBeNull();
  });

  it('uses the higher sequence number for a duplicated step name', async () => {
    await renderLoaded(
      mockData({
        kycSteps: [mockStep('Recommendation', 'Failed', 1), mockStep('Recommendation', 'Completed', 2)],
      }),
    );
    expect(tab('Recommendation')).toHaveClass('bg-dfxGreen-100/20');
    expect(tab('Recommendation').querySelector('span')).toHaveClass('bg-dfxGreen-100');
  });

  it('hides organization tabs for Personal and shows them with the group separator for Organization', async () => {
    const personal = await renderLoaded();
    expect(screen.queryByRole('button', { name: 'Operational Activity' })).not.toBeInTheDocument();
    personal.unmount();

    mockGetUserData.mockResolvedValue(mockData({ accountType: 'Organization' }));
    const organization = render(<ComplianceReviewScreen />);
    expect(await screen.findByRole('button', { name: 'Operational Activity' })).toBeInTheDocument();
    expect(organization.container.querySelector('[class*="w-0.5"]')).not.toBeNull();
  });

  it('falls back from an invisible requested tab and changes the active style when clicked', async () => {
    mockTabParam = 'operationalActivity';
    await renderLoaded();
    expect(tab('AML Pending')).toHaveClass('bg-white', 'border-dfxBlue-800');
    fireEvent.click(tab('BankData Review'));
    expect(tab('BankData Review')).toHaveClass('bg-white', 'border-dfxBlue-800');
    expect(tab('AML Pending')).not.toHaveClass('bg-white');
  });

  it('renders omitted files as empty lists and hides organization tabs without an account type', async () => {
    const omittedFiles = await renderLoaded(mockData({ kycFiles: undefined }));
    fireEvent.click(tab('Freigabe'));
    expect(mockFreigabeProps?.kycFiles).toEqual([]);
    fireEvent.click(tab('Nationalität'));
    expect(mockReviewProps?.files).toEqual([]);
    omittedFiles.unmount();

    await renderLoaded(mockData({ accountType: undefined }));
    expect(screen.queryByRole('button', { name: 'Operational Activity' })).not.toBeInTheDocument();
  });

  it('renders every custom panel branch', async () => {
    await renderLoaded();
    fireEvent.click(tab('Stammdaten'));
    expect(mockStammdatenHistory[mockStammdatenHistory.length - 1]).toBe(mockStammdatenProps);
    expect(mockStammdatenProps?.onSave).toBeDefined();
    expect(screen.getByRole('button', { name: 'stammdaten-save' })).toBeInTheDocument();
    fireEvent.click(tab('Ident'));
    expect(mockIdentHistory[mockIdentHistory.length - 1]).toBe(mockIdentProps);
    expect(mockIdentProps?.onOpenFile).toBeDefined();
    expect(screen.getByRole('button', { name: 'ident-save' })).toBeInTheDocument();
    fireEvent.click(tab('BankData Review'));
    expect(screen.getByRole('button', { name: 'bank-approve' })).toBeInTheDocument();
    fireEvent.click(tab('AML Pending'));
    expect(screen.getByRole('button', { name: 'aml-update' })).toBeInTheDocument();
    fireEvent.click(tab('Freigabe'));
    expect(screen.getByRole('button', { name: 'freigabe-save' })).toBeInTheDocument();
    fireEvent.click(tab('Nationalität'));
    expect(screen.getByRole('button', { name: 'review-save' })).toBeInTheDocument();
  });

  it('renders no badge when a tab has an empty step name', async () => {
    const freigabe = reviewTabs.find((entry) => entry.key === 'freigabe');
    if (!freigabe) throw new Error('missing freigabe tab');
    reviewTabs.push({ ...freigabe, stepName: '', label: 'Fallback' });
    try {
      await renderLoaded();
      expect(tab('Fallback').querySelector('span')).toBeNull();
    } finally {
      reviewTabs.pop();
    }
  });
});

describe('empty route callbacks', () => {
  async function changeToEmptyRoute(view: RenderResult): Promise<void> {
    mockRouteId = undefined;
    capturePanelCreate = true;
    try {
      act(() => view.rerender(<ComplianceReviewScreen />));
    } finally {
      capturePanelCreate = false;
    }
    await screen.findByText('error:No ID provided');
  }

  it('skips Freigabe user updates, logging and PDF generation', async () => {
    mockTabParam = 'freigabe';
    const view = await renderLoaded();
    const historyIndex = mockFreigabeHistory.length;
    await changeToEmptyRoute(view);
    const props = mockFreigabeHistory[historyIndex];
    expect(props).toBeDefined();
    await invoke(() =>
      props.onSave({
        stepId: 8,
        status: 'Completed',
        userDataUpdate: { highRisk: true },
        pdfData: { finalDecision: 'Pass', processedBy: 'Clerk' },
      }),
    );
    expect(mockUpdateUserData).not.toHaveBeenCalled();
    expect(mockCreateKycLog).not.toHaveBeenCalled();
    expect(mockGenerateOnboardingPdf).not.toHaveBeenCalled();
  });

  it('skips review and bank logs', async () => {
    mockTabParam = 'bankDataReview';
    const bankView = await renderLoaded();
    const bankIndex = mockBankHistory.length;
    await changeToEmptyRoute(bankView);
    const bankProps = mockBankHistory[bankIndex];
    expect(bankProps).toBeDefined();
    await invoke(() => bankProps.onApprove(11, 'Clerk'));
    await invoke(() => bankProps.onReject(11, 'Clerk'));
    expect(mockCreateKycLog).not.toHaveBeenCalled();
    bankView.unmount();

    mockRouteId = '42';
    mockTabParam = 'nationalityData';
    mockGetUserData.mockResolvedValue(mockData());
    const reviewView = render(<ComplianceReviewScreen />);
    await screen.findByText('account-42');
    const reviewIndex = mockReviewHistory.length;
    await changeToEmptyRoute(reviewView);
    const reviewProps = mockReviewHistory[reviewIndex];
    expect(reviewProps).toBeDefined();
    await invoke(() => reviewProps.onSave(7, 'Completed', 'Clerk', 'Review'));
    expect(mockCreateKycLog).not.toHaveBeenCalled();
  });

  it('returns from KYC status and skips AML logs', async () => {
    mockTabParam = 'amlPending';
    const view = await renderLoaded();
    const headerIndex = mockHeaderHistory.length;
    const amlIndex = mockAmlHistory.length;
    await changeToEmptyRoute(view);
    const headerProps = mockHeaderHistory[headerIndex];
    const amlProps = mockAmlHistory[amlIndex];
    expect(headerProps).toBeDefined();
    expect(amlProps).toBeDefined();

    await invoke(() => headerProps.onSetKycStatusCheck());
    await invoke(() => amlProps.onUpdate(mockTransaction(), { amlCheck: 'Pass' }, 'Clerk'));
    await invoke(() => amlProps.onReset(mockTransaction(), 'Clerk'));
    expect(mockSetKycStatusCheck).not.toHaveBeenCalled();
    expect(mockCreateKycLog).not.toHaveBeenCalled();

    const callsBeforeReset = mockGetUserData.mock.calls.length;
    mockResetBuyCryptoReviewAml.mockRejectedValueOnce(new Error('reset failed'));
    await invoke(() => amlProps.onReset(mockTransaction(), 'Clerk'));
    expectError('reset failed');
    expect(screen.queryByText(/Reload failed/)).not.toBeInTheDocument();
    expect(mockGetUserData).toHaveBeenCalledTimes(callsBeforeReset);

    mockResetBuyCryptoReviewAml.mockRejectedValueOnce(new Error('review reset failed'));
    await invoke(() => amlProps.onReviewReset(mockTransaction()));
    expectError('review reset failed');
    expect(screen.queryByText(/Reload failed/)).not.toBeInTheDocument();
    expect(mockGetUserData).toHaveBeenCalledTimes(callsBeforeReset);
  });

  it('skips operational activity updates when the route id is empty', async () => {
    mockTabParam = 'operationalActivity';
    const view = await renderLoaded(
      mockData({
        accountType: 'Organization',
        kycSteps: [mockStep('OperationalActivity', 'Pending', 2, '{"isOperational":true}')],
      }),
    );
    const reviewIndex = mockReviewHistory.length;
    await changeToEmptyRoute(view);
    const reviewProps = mockReviewHistory[reviewIndex];
    expect(reviewProps).toBeDefined();
    await invoke(() => reviewProps.onSave(7, 'Completed', 'Clerk', 'Operational'));
    expect(mockUpdateKycStep).toHaveBeenCalled();
    expect(mockUpdateUserData).not.toHaveBeenCalled();
    expect(mockCreateKycLog).not.toHaveBeenCalled();
  });
});
