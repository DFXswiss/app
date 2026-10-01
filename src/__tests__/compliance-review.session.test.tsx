import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ComplianceReviewScreen from 'src/screens/compliance-review.screen';

let mockParams = { id: '8' };
let mockSession: { account: number; user: number; address: string; role: string } | undefined;
let mockRawTokenSession: typeof mockSession;
let mockToken: string | undefined;
let mockLoggedIn = false;
let mockSearchTab: string | null = 'freigabe';
let mockLastAsyncAction: Promise<void> | undefined;
let mockReviewCallbacks: Record<string, () => Promise<void>>;
const mockGetUserData = jest.fn();
const mockGetKycFile = jest.fn();
const mockUpdateKycStep = jest.fn();
const mockUpdateUserData = jest.fn();
const mockSetKycStatusCheck = jest.fn();
const mockUpdateBankData = jest.fn();
const mockUpdateBuyCrypto = jest.fn();
const mockUpdateBuyFiat = jest.fn();
const mockResetBuyCryptoReviewAml = jest.fn();
const mockResetBuyFiatAml = jest.fn();
const mockCreateKycLog = jest.fn();
const mockGenerateOnboardingPdf = jest.fn();
let mockFreigabeParams: Record<string, unknown>;
const mockSaveBufferedFile = jest.fn();
const mockCreateObjectURL = jest.fn(() => 'blob:review-preview');
const mockRevokeObjectURL = jest.fn();
const mockNavigate = jest.fn();
const mockHandleSplitDrag = jest.fn();
let mockOnBack: (() => void) | undefined;

interface ReviewResponse {
  userData: { marker: string; accountType?: string; kycStatus: string };
  kycSteps: Array<{ id: number; name: string; status: string; sequenceNumber: number }>;
  kycFiles: Array<{ id: number; uid: string; name: string; type: string }>;
  bankDatas: Array<{ status: string }>;
  transactions: Array<{ type: string; amlCheck: string; amlReason: string }>;
}

type ReviewStepSave = (
  stepId: number,
  status: string,
  clerk: string,
  description: string,
  comment?: string,
  result?: string,
) => Promise<void>;

function response(marker: string): ReviewResponse {
  return {
    userData: { marker, accountType: 'Personal', kycStatus: 'Completed' },
    kycSteps: [],
    kycFiles: [{ id: 1, uid: 'file-1', name: 'review-document.pdf', type: 'ResidencePermit' }],
    bankDatas: [],
    transactions: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function clickAndWaitFor(testId: string, assertion: () => void): Promise<void> {
  mockLastAsyncAction = undefined;
  fireEvent.click(screen.getByTestId(testId));
  expect(mockLastAsyncAction).toBeDefined();
  await act(async () => mockLastAsyncAction);
  assertion();
}

jest.mock('@dfx.swiss/react', () => ({
  AmlReason: {},
  CheckStatus: {},
  KycStatus: { CHECK: 'Check' },
  UserRole: { ADMIN: 'Admin', COMPLIANCE: 'Compliance' },
  useAuthContext: () => ({
    session: mockSession,
    getAuthToken: () => mockToken,
    getAuthTokenSession: () => mockRawTokenSession,
  }),
  useSessionContext: () => ({ isInitialized: true, isLoggedIn: mockLoggedIn }),
}));
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
  useSearchParams: () => [new URLSearchParams(mockSearchTab ? `tab=${mockSearchTab}` : '')],
}));
jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { LG: 'lg' },
  StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
}));
jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => ({
    getUserData: mockGetUserData,
    getKycFile: mockGetKycFile,
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
  }),
}));
jest.mock('src/hooks/guard.hook', () => ({ useComplianceGuard: jest.fn() }));
jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: (options: { onBack?: () => void }) => {
    mockOnBack = options.onBack;
  },
}));
jest.mock('src/hooks/split-pane.hook', () => ({
  useSplitPane: () => ({ containerRef: { current: null }, splitPercent: 50, handleSplitDrag: mockHandleSplitDrag }),
}));
jest.mock('src/util/utils', () => ({ saveBufferedFile: (...args: unknown[]) => mockSaveBufferedFile(...args) }));
jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div>{message}</div>,
}));
jest.mock('src/components/compliance/compliance-review-configs', () => ({
  reviewTabs: [
    { key: 'amlPending', label: 'AML Pending', group: 'review', stepName: '', fileTypes: [], checkItems: [], decisionLabel: '', rejectionReasons: [], isCustomPanel: true },
    { key: 'bankDataReview', label: 'BankData Review', group: 'review', stepName: '', fileTypes: [], checkItems: [], decisionLabel: '', rejectionReasons: [], isCustomPanel: true },
    { key: 'stammdaten', label: 'Stammdaten', group: 'review', stepName: '', fileTypes: [], checkItems: [], decisionLabel: '', rejectionReasons: [], isCustomPanel: true },
    { key: 'freigabe', label: 'Freigabe', group: 'kyc', stepName: 'DfxApproval', fileTypes: [], checkItems: [], decisionLabel: 'Decision', rejectionReasons: [] },
    { key: 'operationalActivity', label: 'Operational Activity', group: 'kyc', stepName: 'OperationalActivity', fileTypes: [], checkItems: [], decisionLabel: 'Decision', rejectionReasons: [] },
    { key: 'legalEntity', label: 'Legal Entity', group: 'kyc', stepName: 'LegalEntity', fileTypes: ['CommercialRegister'], checkItems: [], decisionLabel: 'Decision', rejectionReasons: [], accountTypes: ['Organization'] },
    { key: 'ident', label: 'Ident', group: 'kyc', stepName: 'Ident', fileTypes: ['Identification'], checkItems: [], decisionLabel: '', rejectionReasons: [], isCustomPanel: true },
    { key: 'recommendation', label: 'Recommendation', group: 'kyc', stepName: '', fileTypes: [], checkItems: [], decisionLabel: '', rejectionReasons: [] },
  ],
}));
jest.mock('src/components/compliance/compliance-review-header', () => ({
  ComplianceReviewHeader: ({ userData, onSetKycStatusCheck, isSaving }: {
    userData: ReviewResponse['userData'];
    onSetKycStatusCheck: () => Promise<void>;
    isSaving: boolean;
  }) => {
    mockReviewCallbacks.kycCheck = onSetKycStatusCheck;
    return (
      <>
      <div data-testid="review-customer">{userData.marker}</div>
      <output data-testid="review-saving">{String(isSaving)}</output>
      <button type="button" data-testid="set-kyc-check" onClick={() => {
        mockLastAsyncAction = onSetKycStatusCheck();
      }}>Set KYC Check</button>
      </>
    );
  },
}));
jest.mock('src/components/compliance/freigabe-panel', () => ({
  ComplianceReviewFreigabePanel: ({ step, onOpenFile, onSave }: {
    step?: { status: string };
    onOpenFile: (file: ReviewResponse['kycFiles'][number]) => void;
    onSave: (params: Record<string, unknown>) => Promise<void>;
  }) => {
    mockReviewCallbacks.freigabeSave = () => onSave(mockFreigabeParams as never);
    mockReviewCallbacks.openFreigabeFile = () => onOpenFile({ id: 1, uid: 'review-file-1', name: 'review-document.pdf', type: 'ResidencePermit' });
    return (
      <>
      <output data-testid="freigabe-step-status">{step?.status ?? ''}</output>
      <button type="button" data-testid="open-review-file" onClick={() => onOpenFile({
        id: 1,
        uid: 'review-file-1',
        name: 'review-document.pdf',
        type: 'ResidencePermit',
      })}>
        Open review file
      </button>
      <button type="button" data-testid="save-review" onClick={() => {
        mockLastAsyncAction = onSave(mockFreigabeParams);
      }}>
        Save review
      </button>
      </>
    );
  },
}));
jest.mock('src/components/compliance/compliance-review-panel', () => ({
  ComplianceReviewPanel: ({ onSave, onOpenFile, files, allFiles }: {
    onSave: ReviewStepSave;
    onOpenFile: (file: ReviewResponse['kycFiles'][number]) => Promise<void>;
    files: ReviewResponse['kycFiles'];
    allFiles: ReviewResponse['kycFiles'];
  }) => {
    mockReviewCallbacks.stepSave = () => onSave(11, 'Completed', 'reviewer', 'StepSave');
    mockReviewCallbacks.openStepFile = () => onOpenFile({ id: 2, uid: 'step-file', name: 'step.pdf', type: 'Identification' });
    return (
      <>
      <button type="button" data-testid="save-step" onClick={() => {
        mockLastAsyncAction = onSave(11, 'Completed', 'reviewer', 'StepSave', undefined, '{"isOperational":true}');
      }}>Save step</button>
      <button type="button" data-testid="save-step-error" onClick={() => {
        mockLastAsyncAction = onSave(11, 'Failed', 'reviewer', 'StepSave');
      }}>Save failed step</button>
      <button type="button" data-testid="open-step-file" onClick={() => onOpenFile({ id: 2, uid: 'step-file', name: 'step.pdf', type: 'Identification' })}>Open step file</button>
      <output data-testid="review-file-count">{files.length}:{allFiles.length}</output>
      </>
    );
  },
}));
jest.mock('src/components/compliance/stammdaten-panel', () => ({
  StammdatenPanel: ({ onSave }: { onSave: ReviewStepSave }) => {
    mockReviewCallbacks.stammdatenSave = () => onSave(12, 'Completed', 'reviewer', 'Stammdaten');
    return <button type="button" data-testid="save-stammdaten" onClick={() => onSave(12, 'Completed', 'reviewer', 'Stammdaten')}>Save Stammdaten</button>;
  },
}));
jest.mock('src/components/compliance/bank-data-panel', () => ({
  BankDataReviewPanel: ({ onApprove, onReject }: {
    onApprove: (id: number, clerk: string) => Promise<void>;
    onReject: (id: number, clerk: string) => Promise<void>;
  }) => {
    mockReviewCallbacks.bankApprove = () => onApprove(44, 'reviewer');
    mockReviewCallbacks.bankReject = () => onReject(44, 'reviewer');
    return (
      <>
      <button type="button" data-testid="approve-bank" onClick={() => { mockLastAsyncAction = onApprove(44, 'reviewer'); }}>Approve bank</button>
      <button type="button" data-testid="reject-bank" onClick={() => { mockLastAsyncAction = onReject(44, 'reviewer'); }}>Reject bank</button>
      </>
    );
  },
}));
jest.mock('src/components/compliance/aml-check-panel', () => ({
  AmlCheckPendingPanel: ({ onUpdate, onReset, onReviewReset }: {
    onUpdate: (tx: never, update: never, clerk: string) => Promise<void>;
    onReset: (tx: never, clerk: string) => Promise<void>;
    onReviewReset: (tx: never) => Promise<void>;
  }) => {
    mockReviewCallbacks.amlUpdate = () => onUpdate({ buyCryptoId: 31, buyFiatId: 32 } as never, { amlCheck: 'Fail', amlReason: 'ManualCheck' } as never, 'reviewer');
    mockReviewCallbacks.amlReset = () => onReset({ buyCryptoId: 31, amlCheck: 'Fail', amlReason: 'ManualCheck' } as never, 'reviewer');
    mockReviewCallbacks.amlReviewReset = () => onReviewReset({ buyCryptoId: 31, amlCheck: 'Fail', amlReason: 'ManualCheck' } as never);
    return (
      <>
      <button type="button" data-testid="update-crypto-aml" onClick={() => { mockLastAsyncAction = onUpdate({ buyCryptoId: 31, buyFiatId: 32 } as never, { amlCheck: 'Fail', amlReason: 'ManualCheck', priceDefinitionAllowedDate: '2026-01-01' } as never, 'reviewer'); }}>Update crypto AML</button>
      <button type="button" data-testid="update-fiat-aml" onClick={() => { mockLastAsyncAction = onUpdate({ buyFiatId: 32 } as never, { amlCheck: 'Pass' } as never, 'reviewer'); }}>Update fiat AML</button>
      <button type="button" data-testid="reset-crypto-aml" onClick={() => { mockLastAsyncAction = onReset({ buyCryptoId: 31, amlCheck: 'Fail', amlReason: 'ManualCheck' } as never, 'reviewer'); }}>Reset crypto AML</button>
      <button type="button" data-testid="reset-crypto-no-reason" onClick={() => { mockLastAsyncAction = onReset({ buyCryptoId: 33, amlCheck: 'Fail' } as never, 'reviewer'); }}>Reset crypto without reason</button>
      <button type="button" data-testid="reset-missing-aml" onClick={() => { mockLastAsyncAction = onReset({ buyCryptoId: 31 } as never, 'reviewer'); }}>Reset missing AML</button>
      <button type="button" data-testid="reset-fiat-aml" onClick={() => { mockLastAsyncAction = onReset({ buyFiatId: 32 } as never, 'reviewer'); }}>Reset fiat AML</button>
      <button type="button" data-testid="review-reset-aml" onClick={() => { mockLastAsyncAction = onReviewReset({ buyCryptoId: 31, amlCheck: 'Fail', amlReason: 'ManualCheck' } as never); }}>Review reset AML</button>
      <button type="button" data-testid="review-reset-no-reason-aml" onClick={() => { mockLastAsyncAction = onReviewReset({ buyCryptoId: 33, amlCheck: 'Fail' } as never); }}>Review reset without reason</button>
      <button type="button" data-testid="review-reset-missing-aml" onClick={() => { mockLastAsyncAction = onReviewReset({ buyCryptoId: 31 } as never); }}>Review reset missing AML</button>
      </>
    );
  },
}));
jest.mock('src/components/compliance/ident-panel', () => ({ IdentPanel: () => <div data-testid="ident-panel" /> }));
jest.mock('src/components/compliance/file-preview-panel', () => ({
  FilePreviewPanel: ({ preview, onClose, onDownload }: {
    preview?: { url: string; name: string };
    onClose: () => void;
    onDownload: () => void;
  }) => {
    mockReviewCallbacks.download = async () => onDownload();
    return (
      <div data-testid="review-preview-panel">
      <span data-testid="review-preview-url">{preview?.url ?? ''}</span>
      <span data-testid="review-preview-name">{preview?.name ?? ''}</span>
      <button type="button" data-testid="review-close" onClick={onClose}>Close preview</button>
      <button type="button" data-testid="review-download" onClick={onDownload}>Download</button>
      </div>
    );
  },
}));

describe('ComplianceReviewScreen scoped requests', () => {
  beforeEach(() => {
    mockReviewCallbacks = {};
    mockParams = { id: '8' };
    mockSession = { account: 101, user: 201, address: '0xAbC', role: 'Compliance' };
    mockRawTokenSession = { ...mockSession };
    mockToken = 'token-101-201';
    mockLoggedIn = true;
    mockSearchTab = 'freigabe';
    mockGetUserData.mockReset().mockResolvedValue(response('default'));
    mockGetKycFile.mockReset().mockResolvedValue({
      content: { type: 'Buffer', data: [37, 80, 68, 70] },
      contentType: 'application/pdf',
    });
    mockUpdateKycStep.mockReset().mockResolvedValue(undefined);
    mockUpdateUserData.mockReset().mockResolvedValue(undefined);
    mockSetKycStatusCheck.mockReset().mockResolvedValue(undefined);
    mockUpdateBankData.mockReset().mockResolvedValue(undefined);
    mockUpdateBuyCrypto.mockReset().mockResolvedValue(undefined);
    mockUpdateBuyFiat.mockReset().mockResolvedValue(undefined);
    mockResetBuyCryptoReviewAml.mockReset().mockResolvedValue(undefined);
    mockResetBuyFiatAml.mockReset().mockResolvedValue(undefined);
    mockCreateKycLog.mockReset().mockResolvedValue(undefined);
    mockGenerateOnboardingPdf.mockReset().mockResolvedValue({ pdfData: 'QQ==', fileName: 'onboarding.pdf' });
    mockFreigabeParams = {
      stepId: 10,
      status: 'Completed',
      result: '{"isOperational":true}',
      comment: 'approved',
      userDataUpdate: { amlAccountType: 'updated', ignored: null },
      pdfData: { finalDecision: 'Approved', processedBy: 'reviewer' },
    };
    mockSaveBufferedFile.mockReset();
    mockCreateObjectURL.mockReset().mockReturnValue('blob:review-preview');
    mockRevokeObjectURL.mockReset();
    mockNavigate.mockReset();
    mockHandleSplitDrag.mockReset();
    mockOnBack = undefined;
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: mockCreateObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: mockRevokeObjectURL });
  });

  // These mocked hook responses test frontend ordering and UI isolation, not server-side audit persistence.
  describe.each([
    {
      name: 'Freigabe',
      tab: 'freigabe',
      action: 'save-review',
      write: mockUpdateKycStep,
      id: 10,
      log: 'Services - DfxApproval',
    },
    {
      name: 'KYC step',
      tab: 'operationalActivity',
      action: 'save-step',
      write: mockUpdateKycStep,
      id: 11,
      log: 'Services - StepSave',
    },
    {
      name: 'bank approval',
      tab: 'bankDataReview',
      action: 'approve-bank',
      write: mockUpdateBankData,
      id: 44,
      log: 'bankData-approved-true',
    },
    {
      name: 'bank rejection',
      tab: 'bankDataReview',
      action: 'reject-bank',
      write: mockUpdateBankData,
      id: 44,
      log: 'bankData-approved-false',
    },
    {
      name: 'BuyCrypto AML update',
      tab: 'amlPending',
      action: 'update-crypto-aml',
      write: mockUpdateBuyCrypto,
      id: 31,
      log: 'buyCrypto-amlCheck-Fail',
    },
    {
      name: 'BuyFiat AML update',
      tab: 'amlPending',
      action: 'update-fiat-aml',
      write: mockUpdateBuyFiat,
      id: 32,
      log: 'buyFiat-amlCheck-Pass',
    },
    {
      name: 'BuyCrypto AML reset',
      tab: 'amlPending',
      action: 'reset-crypto-aml',
      write: mockResetBuyCryptoReviewAml,
      id: 31,
      log: 'buyCrypto-amlCheck-Reset',
    },
    {
      name: 'BuyFiat AML reset',
      tab: 'amlPending',
      action: 'reset-fiat-aml',
      write: mockResetBuyFiatAml,
      id: 32,
      log: 'buyFiat-amlCheck-Reset',
    },
  ])('$name write chain', ({ tab, action, write, id, log }) => {
    beforeEach(() => {
      mockSearchTab = tab;
      mockGetUserData.mockResolvedValueOnce({
        ...response('customer A'),
        kycSteps: [
          {
            id: 11,
            name: 'OperationalActivity',
            status: 'Pending',
            sequenceNumber: 1,
            result: '{"isOperational":true}',
          },
        ],
      });
    });

    it('finishes writes and the audit log for A after switching to B without refreshing B', async () => {
      const firstWrite = deferred<void>();
      write.mockReturnValueOnce(firstWrite.promise);
      const view = render(<ComplianceReviewScreen />);
      expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer A');
      fireEvent.click(screen.getByTestId(action));
      const operation = mockLastAsyncAction;
      expect(write).toHaveBeenCalledTimes(1);
      expect(write.mock.calls[0][0]).toBe(id);
      expect(screen.getByTestId('review-saving')).toHaveTextContent('true');
      expect(mockCreateKycLog).not.toHaveBeenCalled();

      mockParams = { id: '9' };
      mockGetUserData.mockResolvedValueOnce(response('customer B'));
      await act(async () => view.rerender(<ComplianceReviewScreen />));
      expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer B');
      expect(screen.getByTestId('review-saving')).toHaveTextContent('false');
      await act(async () => {
        firstWrite.resolve();
        await operation;
      });

      expect(mockCreateKycLog).toHaveBeenCalledTimes(1);
      expect(mockCreateKycLog).toHaveBeenCalledWith(8, expect.stringContaining(log));
      if (tab === 'freigabe') {
        expect(mockUpdateUserData).toHaveBeenCalledWith(8, mockFreigabeParams.userDataUpdate);
        expect(mockGenerateOnboardingPdf).toHaveBeenCalledWith(8, mockFreigabeParams.pdfData);
        expect(mockCreateObjectURL).not.toHaveBeenCalled();
      } else if (tab === 'operationalActivity') {
        expect(mockUpdateUserData).toHaveBeenCalledWith(8, { amlAccountType: 'operativ tätige Gesellschaft' });
        expect(mockCreateKycLog).toHaveBeenCalledWith(8, expect.stringContaining('userData-amlAccountType-operativ'));
      }
      expect(mockGetUserData.mock.calls).toEqual([[8], [9]]);
      expect(screen.getByTestId('review-customer')).toHaveTextContent('customer B');
      expect(screen.getByTestId('review-saving')).toHaveTextContent('false');
    });

    it.each(['replacement token', 'removed token', 'different session'])(
      'stops follow-up writes after a route change and a %s without waiting for an auth rerender',
      async (change) => {
        const firstWrite = deferred<void>();
        write.mockReturnValueOnce(firstWrite.promise);
        const view = render(<ComplianceReviewScreen />);
        expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer A');
        fireEvent.click(screen.getByTestId(action));
        const operation = mockLastAsyncAction;
        expect(write).toHaveBeenCalledTimes(1);

        mockParams = { id: '9' };
        mockGetUserData.mockResolvedValueOnce(response('customer B'));
        await act(async () => view.rerender(<ComplianceReviewScreen />));
        expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer B');
        if (change === 'replacement token') mockToken = 'replacement-token';
        else if (change === 'removed token') mockToken = undefined;
        else mockRawTokenSession = { account: 102, user: 202, address: '0xDef', role: 'Compliance' };

        await act(async () => {
          firstWrite.resolve();
          await operation;
        });
        expect(mockUpdateUserData).not.toHaveBeenCalled();
        expect(mockCreateKycLog).not.toHaveBeenCalled();
        expect(mockGenerateOnboardingPdf).not.toHaveBeenCalled();
        expect(mockGetUserData.mock.calls).toEqual([[8], [9]]);
      },
    );

    it('reports a failed audit log for A while displaying B without refreshing B', async () => {
      const pendingLog = deferred<void>();
      mockCreateKycLog.mockReturnValueOnce(pendingLog.promise);
      const view = render(<ComplianceReviewScreen />);
      expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer A');
      fireEvent.click(screen.getByTestId(action));
      const operation = mockLastAsyncAction;
      await waitFor(() => expect(mockCreateKycLog).toHaveBeenCalledWith(8, expect.stringContaining(log)));
      expect(write).toHaveBeenCalledTimes(1);

      mockParams = { id: '9' };
      mockGetUserData.mockResolvedValueOnce(response('customer B'));
      await act(async () => view.rerender(<ComplianceReviewScreen />));
      expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer B');
      await act(async () => {
        pendingLog.reject(new Error('audit unavailable'));
        await operation;
      });
      expect(screen.getByText(/^Customer 8: .*audit unavailable$/)).toBeInTheDocument();
      expect(screen.getByTestId('review-customer')).toHaveTextContent('customer B');
      expect(screen.getByTestId('review-saving')).toHaveTextContent('false');
      expect(mockGetUserData.mock.calls).toEqual([[8], [9]]);
      expect(mockGenerateOnboardingPdf).not.toHaveBeenCalled();
    });

    it('does not expose a failed audit log from A to another authenticated session', async () => {
      const pendingLog = deferred<void>();
      mockCreateKycLog.mockReturnValueOnce(pendingLog.promise);
      const view = render(<ComplianceReviewScreen />);
      expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer A');
      fireEvent.click(screen.getByTestId(action));
      const operation = mockLastAsyncAction;
      await waitFor(() => expect(mockCreateKycLog).toHaveBeenCalledTimes(1));

      mockToken = 'replacement-token';
      mockGetUserData.mockResolvedValueOnce(response('new session'));
      await act(async () => view.rerender(<ComplianceReviewScreen />));
      expect(await screen.findByTestId('review-customer')).toHaveTextContent('new session');
      await act(async () => {
        pendingLog.reject(new Error('old session audit failed'));
        await operation;
      });
      expect(screen.queryByText(/old session audit failed/)).not.toBeInTheDocument();
      expect(mockGetUserData).toHaveBeenCalledTimes(2);
      expect(mockGenerateOnboardingPdf).not.toHaveBeenCalled();
    });
  });

  it.each(['freigabe', 'operationalActivity'])(
    'keeps %s user-data follow-ups scoped to A and stops them if authentication then changes',
    async (tab) => {
      mockSearchTab = tab;
      mockGetUserData.mockResolvedValueOnce({
        ...response('customer A'),
        kycSteps: [
          {
            id: 11,
            name: 'OperationalActivity',
            status: 'Pending',
            sequenceNumber: 1,
            result: '{"isOperational":true}',
          },
        ],
      });
      const pendingUserData = deferred<void>();
      mockUpdateUserData.mockReturnValueOnce(pendingUserData.promise);
      const view = render(<ComplianceReviewScreen />);
      expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer A');
      fireEvent.click(screen.getByTestId(tab === 'freigabe' ? 'save-review' : 'save-step'));
      const operation = mockLastAsyncAction;
      await waitFor(() => expect(mockUpdateUserData).toHaveBeenCalledWith(8, expect.any(Object)));

      mockParams = { id: '9' };
      mockGetUserData.mockResolvedValueOnce(response('customer B'));
      await act(async () => view.rerender(<ComplianceReviewScreen />));
      expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer B');
      mockRawTokenSession = { account: 102, user: 202, address: '0xDef', role: 'Compliance' };
      await act(async () => {
        pendingUserData.resolve();
        await operation;
      });
      expect(mockCreateKycLog).not.toHaveBeenCalled();
      expect(mockGenerateOnboardingPdf).not.toHaveBeenCalled();
      expect(mockGetUserData.mock.calls).toEqual([[8], [9]]);
    },
  );

  it('does not generate a Freigabe PDF when authentication changes during audit logging', async () => {
    const pendingLog = deferred<void>();
    mockCreateKycLog.mockReturnValueOnce(pendingLog.promise);
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('default');
    fireEvent.click(screen.getByTestId('save-review'));
    const operation = mockLastAsyncAction;
    await waitFor(() => expect(mockCreateKycLog).toHaveBeenCalledWith(8, expect.any(String)));
    mockToken = undefined;
    await act(async () => {
      pendingLog.resolve();
      await operation;
    });
    expect(mockGenerateOnboardingPdf).not.toHaveBeenCalled();
    expect(mockGetUserData).toHaveBeenCalledTimes(1);
  });

  it('finishes A without clearing the saving state of an in-flight save for B', async () => {
    const saveA = deferred<void>();
    const saveB = deferred<void>();
    mockUpdateKycStep.mockReturnValueOnce(saveA.promise).mockReturnValueOnce(saveB.promise);
    const view = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('default');
    fireEvent.click(screen.getByTestId('save-review'));
    const operationA = mockLastAsyncAction;

    mockParams = { id: '9' };
    mockGetUserData.mockResolvedValue(response('customer B'));
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer B');
    expect(screen.getByTestId('review-saving')).toHaveTextContent('false');
    fireEvent.click(screen.getByTestId('save-review'));
    const operationB = mockLastAsyncAction;
    expect(screen.getByTestId('review-saving')).toHaveTextContent('true');
    await act(async () => {
      saveA.resolve();
      await operationA;
    });
    expect(mockCreateKycLog).toHaveBeenCalledWith(8, expect.any(String));
    expect(mockGetUserData.mock.calls).toEqual([[8], [9]]);
    expect(screen.getByTestId('review-saving')).toHaveTextContent('true');
    expect(screen.getByTestId('review-preview-url')).toBeEmptyDOMElement();

    await act(async () => {
      saveB.resolve();
      await operationB;
    });
    expect(mockCreateKycLog).toHaveBeenLastCalledWith(9, expect.any(String));
    expect(mockGetUserData.mock.calls).toEqual([[8], [9], [9]]);
    expect(screen.getByTestId('review-saving')).toHaveTextContent('false');
  });

  it.each([
    { failure: new Error('PDF unavailable'), message: 'PDF unavailable' },
    { failure: 'raw PDF rejection', message: 'Error generating PDF' },
  ])('reports a late PDF failure for A while displaying B: $message', async ({ failure, message }) => {
    const pendingPdf = deferred<{ pdfData: string; fileName: string }>();
    mockGenerateOnboardingPdf.mockReturnValueOnce(pendingPdf.promise);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const view = render(<ComplianceReviewScreen />);
      expect(await screen.findByTestId('review-customer')).toHaveTextContent('default');
      fireEvent.click(screen.getByTestId('save-review'));
      const operation = mockLastAsyncAction;
      await waitFor(() => expect(mockGenerateOnboardingPdf).toHaveBeenCalledWith(8, mockFreigabeParams.pdfData));

      mockParams = { id: '9' };
      mockGetUserData.mockResolvedValueOnce(response('customer B'));
      await act(async () => view.rerender(<ComplianceReviewScreen />));
      expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer B');
      await act(async () => {
        pendingPdf.reject(failure);
        await operation;
      });
      expect(screen.getByText(`Customer 8: ${message}`)).toBeInTheDocument();
      expect(screen.getByTestId('review-customer')).toHaveTextContent('customer B');
      expect(mockCreateObjectURL).not.toHaveBeenCalled();
      expect(mockGetUserData.mock.calls).toEqual([[8], [9]]);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('keeps an AML audit failure visible for A when the customer changes during the recovery refresh', async () => {
    mockSearchTab = 'amlPending';
    const pendingRefresh = deferred<ReviewResponse>();
    mockCreateKycLog.mockRejectedValueOnce(new Error('audit unavailable'));
    mockGetUserData
      .mockResolvedValueOnce(response('customer A'))
      .mockReturnValueOnce(pendingRefresh.promise)
      .mockResolvedValueOnce(response('customer B'));
    const view = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer A');
    fireEvent.click(screen.getByTestId('reset-crypto-aml'));
    const operation = mockLastAsyncAction;
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledTimes(2));
    expect(mockCreateKycLog).toHaveBeenCalledWith(8, expect.stringContaining('buyCrypto-amlCheck-Reset'));

    mockParams = { id: '9' };
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer B');
    await act(async () => {
      pendingRefresh.resolve(response('old A refresh'));
      await operation;
    });
    expect(
      screen.getByText('Customer 8: AML check was reset, but the additional KYC log failed: audit unavailable'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('review-customer')).toHaveTextContent('customer B');
    expect(mockGetUserData.mock.calls).toEqual([[8], [8], [9]]);
  });

  it('keeps the new customer after an older route request resolves late', async () => {
    const oldRequest = deferred<ReviewResponse>();
    mockGetUserData.mockReturnValueOnce(oldRequest.promise).mockResolvedValueOnce(response('new customer'));
    const { rerender } = render(<ComplianceReviewScreen />);
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledTimes(1));

    mockParams = { id: '9' };
    mockSession = { account: 102, user: 202, address: '0xDef', role: 'Compliance' };
    mockRawTokenSession = { ...mockSession };
    mockToken = 'token-102-202';
    await act(async () => rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('new customer');

    await act(async () => {
      oldRequest.resolve(response('old customer'));
      await oldRequest.promise;
    });
    expect(screen.getByTestId('review-customer')).toHaveTextContent('new customer');
  });

  it('keeps newer route data when an older customer request fails late', async () => {
    const oldRequest = deferred<ReviewResponse>();
    mockGetUserData.mockReturnValueOnce(oldRequest.promise).mockResolvedValueOnce(response('new customer'));
    const { rerender } = render(<ComplianceReviewScreen />);
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledTimes(1));

    mockParams = { id: '9' };
    await act(async () => rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('new customer');

    await act(async () => {
      oldRequest.reject(new Error('old customer request failed'));
      await oldRequest.promise.catch(() => undefined);
    });
    expect(screen.getByTestId('review-customer')).toHaveTextContent('new customer');
    expect(screen.queryByText('old customer request failed')).not.toBeInTheDocument();
  });

  it('does not refresh a new customer after bank approve or reject logs finish late', async () => {
    const approveLog = deferred<void>();
    const rejectLog = deferred<void>();
    mockGetUserData
      .mockResolvedValueOnce(response('customer 8'))
      .mockResolvedValueOnce(response('customer 9'))
      .mockResolvedValueOnce(response('customer 10'));
    mockCreateKycLog.mockReturnValueOnce(approveLog.promise).mockReturnValueOnce(rejectLog.promise);
    const view = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer 8');
    fireEvent.click(screen.getByRole('button', { name: /BankData Review/ }));

    fireEvent.click(screen.getByTestId('approve-bank'));
    await waitFor(() => expect(mockCreateKycLog).toHaveBeenCalledTimes(1));
    const approveAction = mockLastAsyncAction;
    if (!approveAction) throw new Error('Bank approval did not start');
    mockParams = { id: '9' };
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer 9');
    await act(async () => {
      approveLog.resolve();
      await approveAction;
    });
    expect(mockGetUserData).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByTestId('reject-bank'));
    await waitFor(() => expect(mockCreateKycLog).toHaveBeenCalledTimes(2));
    const rejectAction = mockLastAsyncAction;
    if (!rejectAction) throw new Error('Bank rejection did not start');
    mockParams = { id: '10' };
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer 10');
    await act(async () => {
      rejectLog.resolve();
      await rejectAction;
    });
    expect(mockGetUserData).toHaveBeenCalledTimes(3);
  });

  it('stops AML follow-up refreshes when KYC logs finish after a route change', async () => {
    const updateLog = deferred<void>();
    const resetLog = deferred<void>();
    mockGetUserData
      .mockResolvedValueOnce(response('customer 8'))
      .mockResolvedValueOnce(response('customer 9'))
      .mockResolvedValueOnce(response('customer 10'));
    mockCreateKycLog.mockReturnValueOnce(updateLog.promise).mockReturnValueOnce(resetLog.promise);
    const view = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer 8');
    fireEvent.click(screen.getByRole('button', { name: /AML Pending/ }));

    fireEvent.click(screen.getByTestId('update-crypto-aml'));
    await waitFor(() => expect(mockCreateKycLog).toHaveBeenCalledTimes(1));
    const updateAction = mockLastAsyncAction;
    if (!updateAction) throw new Error('AML update did not start');
    mockParams = { id: '9' };
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer 9');
    await act(async () => {
      updateLog.resolve();
      await updateAction;
    });
    expect(mockGetUserData).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByTestId('reset-crypto-aml'));
    await waitFor(() => expect(mockCreateKycLog).toHaveBeenCalledTimes(2));
    const resetAction = mockLastAsyncAction;
    if (!resetAction) throw new Error('AML reset did not start');
    mockParams = { id: '10' };
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer 10');
    await act(async () => {
      resetLog.resolve();
      await resetAction;
    });
    expect(mockGetUserData).toHaveBeenCalledTimes(3);
  });

  it('ignores KYC status writes that finish after the reviewed customer changes', async () => {
    const staleFailure = deferred<void>();
    const staleSuccess = deferred<void>();
    mockSetKycStatusCheck.mockReturnValueOnce(staleFailure.promise).mockReturnValueOnce(staleSuccess.promise);
    mockGetUserData
      .mockResolvedValueOnce(response('default'))
      .mockResolvedValueOnce(response('customer 9'))
      .mockResolvedValueOnce(response('customer 10'));
    const view = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('default');

    fireEvent.click(screen.getByTestId('set-kyc-check'));
    const failureAction = mockLastAsyncAction;
    if (!failureAction) throw new Error('KYC status write did not start');
    mockParams = { id: '9' };
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer 9');
    await act(async () => {
      staleFailure.reject(new Error('stale KYC write failed'));
      await failureAction;
    });
    expect(screen.queryByText('stale KYC write failed')).not.toBeInTheDocument();
    expect(mockGetUserData).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByTestId('set-kyc-check'));
    const successAction = mockLastAsyncAction;
    if (!successAction) throw new Error('Second KYC status write did not start');
    mockParams = { id: '10' };
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer 10');
    await act(async () => {
      staleSuccess.resolve();
      await successAction;
    });
    expect(mockGetUserData).toHaveBeenCalledTimes(3);
    expect(screen.queryByText(/KYC status could not be changed/)).not.toBeInTheDocument();
  });

  it('ignores callbacks retained by each review panel after the customer route changes', async () => {
    mockGetUserData.mockResolvedValue(response('old customer'));
    const view = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('old customer');
    fireEvent.click(screen.getByTestId('open-review-file'));
    await waitFor(() => expect(screen.getByTestId('review-preview-url')).toHaveTextContent('blob:review-preview'));
    const oldCallbacks: Record<string, () => Promise<void>> = { ...mockReviewCallbacks };

    for (const [label, callbackNames] of [
      [/Stammdaten/, ['stammdatenSave']],
      [/BankData Review/, ['bankApprove', 'bankReject']],
      [/AML Pending/, ['amlUpdate', 'amlReset', 'amlReviewReset']],
      [/Operational Activity/, ['stepSave', 'openStepFile']],
    ] as Array<[RegExp, string[]]>) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      for (const name of callbackNames) oldCallbacks[name] = mockReviewCallbacks[name];
    }

    mockParams = { id: '9' };
    mockGetUserData.mockResolvedValue(response('new customer'));
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('new customer');
    await waitFor(() => expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:review-preview'));
    const fileRequestsBeforeStaleCallbacks = mockGetKycFile.mock.calls.length;

    await act(async () => {
      await Promise.all(Object.values(oldCallbacks).map((callback) => callback()));
    });
    expect(mockUpdateKycStep).not.toHaveBeenCalled();
    expect(mockUpdateUserData).not.toHaveBeenCalled();
    expect(mockUpdateBankData).not.toHaveBeenCalled();
    expect(mockUpdateBuyCrypto).not.toHaveBeenCalled();
    expect(mockUpdateBuyFiat).not.toHaveBeenCalled();
    expect(mockResetBuyCryptoReviewAml).not.toHaveBeenCalled();
    expect(mockResetBuyFiatAml).not.toHaveBeenCalled();
    expect(mockSetKycStatusCheck).not.toHaveBeenCalled();
    expect(mockGetKycFile).toHaveBeenCalledTimes(fileRequestsBeforeStaleCallbacks);
  });

  it('identifies the customer for late write-chain failures and suppresses unrelated single-write errors', async () => {
    mockGetUserData.mockResolvedValue(response('customer 8'));
    const view = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer 8');
    let customerId = 8;

    async function switchCustomer(): Promise<void> {
      customerId += 1;
      mockParams = { id: String(customerId) };
      mockGetUserData.mockResolvedValue(response(`customer ${customerId}`));
      await act(async () => view.rerender(<ComplianceReviewScreen />));
      expect(await screen.findByTestId('review-customer')).toHaveTextContent(`customer ${customerId}`);
    }

    async function rejectAfterSwitch(
      callback: () => Promise<void>,
      startExpectation: () => Promise<void>,
      pending: ReturnType<typeof deferred<void>>,
      reportsCustomer = true,
    ): Promise<void> {
      let operation!: Promise<void>;
      act(() => { operation = callback(); });
      await startExpectation();
      await switchCustomer();
      await act(async () => {
        pending.reject(new Error('late request failed'));
        await operation;
      });
      if (reportsCustomer) {
        expect(screen.getByText(`Customer ${customerId - 1}: late request failed`)).toBeInTheDocument();
      } else {
        expect(screen.queryByText(/late request failed/)).not.toBeInTheDocument();
      }
    }

    let pending = deferred<void>();
    mockUpdateKycStep.mockReturnValueOnce(pending.promise);
    await rejectAfterSwitch(
      mockReviewCallbacks.freigabeSave,
      async () => waitFor(() => expect(mockUpdateKycStep).toHaveBeenCalledTimes(1)),
      pending,
    );

    fireEvent.click(screen.getByRole('button', { name: /Stammdaten/ }));
    pending = deferred<void>();
    mockUpdateKycStep.mockReturnValueOnce(pending.promise);
    await rejectAfterSwitch(
      mockReviewCallbacks.stammdatenSave,
      async () => waitFor(() => expect(mockUpdateKycStep).toHaveBeenCalledTimes(2)),
      pending,
    );

    fireEvent.click(screen.getByRole('button', { name: /BankData Review/ }));
    pending = deferred<void>();
    mockUpdateBankData.mockReturnValueOnce(pending.promise);
    await rejectAfterSwitch(
      mockReviewCallbacks.bankApprove,
      async () => waitFor(() => expect(mockUpdateBankData).toHaveBeenCalledTimes(1)),
      pending,
    );

    fireEvent.click(screen.getByRole('button', { name: /BankData Review/ }));
    pending = deferred<void>();
    mockUpdateBankData.mockReturnValueOnce(pending.promise);
    await rejectAfterSwitch(
      mockReviewCallbacks.bankReject,
      async () => waitFor(() => expect(mockUpdateBankData).toHaveBeenCalledTimes(2)),
      pending,
    );

    fireEvent.click(screen.getByRole('button', { name: /AML Pending/ }));
    pending = deferred<void>();
    mockUpdateBuyCrypto.mockReturnValueOnce(pending.promise);
    await rejectAfterSwitch(
      mockReviewCallbacks.amlUpdate,
      async () => waitFor(() => expect(mockUpdateBuyCrypto).toHaveBeenCalledTimes(1)),
      pending,
    );

    fireEvent.click(screen.getByRole('button', { name: /AML Pending/ }));
    pending = deferred<void>();
    mockResetBuyCryptoReviewAml.mockReturnValueOnce(pending.promise);
    await rejectAfterSwitch(
      mockReviewCallbacks.amlReset,
      async () => waitFor(() => expect(mockResetBuyCryptoReviewAml).toHaveBeenCalledTimes(1)),
      pending,
      false,
    );

    pending = deferred<void>();
    mockResetBuyCryptoReviewAml.mockReturnValueOnce(pending.promise);
    await rejectAfterSwitch(
      mockReviewCallbacks.amlReviewReset,
      async () => waitFor(() => expect(mockResetBuyCryptoReviewAml).toHaveBeenCalledTimes(2)),
      pending,
      false,
    );

    pending = deferred<void>();
    mockSetKycStatusCheck.mockReturnValueOnce(pending.promise);
    await rejectAfterSwitch(
      mockReviewCallbacks.kycCheck,
      async () => waitFor(() => expect(mockSetKycStatusCheck).toHaveBeenCalledTimes(1)),
      pending,
      false,
    );
  });

  it('does not apply AML reset recovery results after the customer changes', async () => {
    mockGetUserData.mockResolvedValueOnce(response('customer 8'));
    const view = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer 8');
    fireEvent.click(screen.getByRole('button', { name: /AML Pending/ }));

    const resetRecovery = deferred<ReviewResponse>();
    mockResetBuyCryptoReviewAml.mockRejectedValueOnce(new Error('stale reset failed'));
    mockGetUserData.mockReturnValueOnce(resetRecovery.promise);
    fireEvent.click(screen.getByTestId('reset-crypto-aml'));
    const resetAction = mockLastAsyncAction;
    if (!resetAction) throw new Error('AML reset did not start');
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledTimes(2));

    mockParams = { id: '9' };
    mockGetUserData.mockResolvedValueOnce(response('customer 9'));
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer 9');
    await act(async () => {
      resetRecovery.resolve(response('stale recovery result'));
      await resetAction;
    });
    expect(screen.getByTestId('review-customer')).toHaveTextContent('customer 9');
    expect(screen.queryByText('stale reset failed')).not.toBeInTheDocument();

    const reviewResetRecovery = deferred<ReviewResponse>();
    mockResetBuyCryptoReviewAml.mockRejectedValueOnce(new Error('stale review reset failed'));
    mockGetUserData.mockReturnValueOnce(reviewResetRecovery.promise);
    fireEvent.click(screen.getByTestId('review-reset-aml'));
    const reviewResetAction = mockLastAsyncAction;
    if (!reviewResetAction) throw new Error('AML review reset did not start');
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledTimes(4));

    mockParams = { id: '10' };
    mockGetUserData.mockResolvedValueOnce(response('customer 10'));
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer 10');
    await act(async () => {
      reviewResetRecovery.resolve(response('stale review recovery result'));
      await reviewResetAction;
    });
    expect(screen.getByTestId('review-customer')).toHaveTextContent('customer 10');
    expect(screen.queryByText('stale review reset failed')).not.toBeInTheDocument();
  });

  it('reports a late AML audit-log rejection with the original customer without refreshing the new customer', async () => {
    mockGetUserData.mockResolvedValueOnce(response('customer 8'));
    const view = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer 8');
    fireEvent.click(screen.getByRole('button', { name: /AML Pending/ }));

    const pendingLog = deferred<void>();
    mockCreateKycLog.mockReturnValueOnce(pendingLog.promise);
    fireEvent.click(screen.getByTestId('reset-crypto-aml'));
    const resetAction = mockLastAsyncAction;
    if (!resetAction) throw new Error('AML reset did not start');
    await waitFor(() => expect(mockCreateKycLog).toHaveBeenCalledTimes(1));

    mockParams = { id: '9' };
    mockGetUserData.mockResolvedValueOnce(response('customer 9'));
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer 9');
    const readsBeforeOldLog = mockGetUserData.mock.calls.length;

    await act(async () => {
      pendingLog.reject(new Error('old audit log failed'));
      await resetAction;
    });
    expect(mockGetUserData).toHaveBeenCalledTimes(readsBeforeOldLog);
    expect(screen.getByTestId('review-customer')).toHaveTextContent('customer 9');
    expect(
      screen.getByText('Customer 8: AML check was reset, but the additional KYC log failed: old audit log failed'),
    ).toBeInTheDocument();
  });

  it('completes review write chains for their original customer without refreshing the new customer', async () => {
    mockGetUserData.mockResolvedValue(response('customer 8'));
    const view = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer 8');
    let customerId = 8;

    async function switchCustomer(): Promise<void> {
      customerId += 1;
      mockParams = { id: String(customerId) };
      mockGetUserData.mockResolvedValue(response(`customer ${customerId}`));
      await act(async () => view.rerender(<ComplianceReviewScreen />));
      expect(await screen.findByTestId('review-customer')).toHaveTextContent(`customer ${customerId}`);
    }

    async function resolveAfterSwitch(
      callback: () => Promise<void>,
      startExpectation: () => Promise<void>,
      pending: ReturnType<typeof deferred<void>>,
    ): Promise<void> {
      let operation!: Promise<void>;
      act(() => { operation = callback(); });
      await startExpectation();
      await switchCustomer();
      await act(async () => {
        pending.resolve();
        await operation;
      });
    }

    let pending = deferred<void>();
    mockUpdateKycStep.mockReturnValueOnce(pending.promise);
    await resolveAfterSwitch(
      mockReviewCallbacks.freigabeSave,
      async () => waitFor(() => expect(mockUpdateKycStep).toHaveBeenCalledTimes(1)),
      pending,
    );
    expect(mockUpdateUserData).toHaveBeenCalledWith(8, mockFreigabeParams.userDataUpdate);
    expect(mockCreateKycLog).toHaveBeenLastCalledWith(8, expect.stringContaining('DfxApproval'));

    fireEvent.click(screen.getByRole('button', { name: /Operational Activity/ }));
    pending = deferred<void>();
    mockUpdateKycStep.mockReturnValueOnce(pending.promise);
    await resolveAfterSwitch(
      mockReviewCallbacks.stepSave,
      async () => waitFor(() => expect(mockUpdateKycStep).toHaveBeenCalledTimes(2)),
      pending,
    );
    expect(mockCreateKycLog).toHaveBeenLastCalledWith(9, expect.stringContaining('StepSave'));

    fireEvent.click(screen.getByRole('button', { name: /BankData Review/ }));
    pending = deferred<void>();
    mockUpdateBankData.mockReturnValueOnce(pending.promise);
    await resolveAfterSwitch(
      mockReviewCallbacks.bankApprove,
      async () => waitFor(() => expect(mockUpdateBankData).toHaveBeenCalledTimes(1)),
      pending,
    );
    expect(mockCreateKycLog).toHaveBeenLastCalledWith(10, expect.stringContaining('bankData-approved-true'));

    fireEvent.click(screen.getByRole('button', { name: /BankData Review/ }));
    pending = deferred<void>();
    mockUpdateBankData.mockReturnValueOnce(pending.promise);
    await resolveAfterSwitch(
      mockReviewCallbacks.bankReject,
      async () => waitFor(() => expect(mockUpdateBankData).toHaveBeenCalledTimes(2)),
      pending,
    );
    expect(mockCreateKycLog).toHaveBeenLastCalledWith(11, expect.stringContaining('bankData-approved-false'));

    fireEvent.click(screen.getByRole('button', { name: /AML Pending/ }));
    pending = deferred<void>();
    mockUpdateBuyCrypto.mockReturnValueOnce(pending.promise);
    await resolveAfterSwitch(
      mockReviewCallbacks.amlUpdate,
      async () => waitFor(() => expect(mockUpdateBuyCrypto).toHaveBeenCalledTimes(1)),
      pending,
    );
    expect(mockCreateKycLog).toHaveBeenLastCalledWith(12, expect.stringContaining('buyCrypto-amlCheck-Fail'));

    fireEvent.click(screen.getByRole('button', { name: /AML Pending/ }));
    pending = deferred<void>();
    mockResetBuyCryptoReviewAml.mockReturnValueOnce(pending.promise);
    await resolveAfterSwitch(
      mockReviewCallbacks.amlReset,
      async () => waitFor(() => expect(mockResetBuyCryptoReviewAml).toHaveBeenCalledTimes(1)),
      pending,
    );
    expect(mockCreateKycLog).toHaveBeenLastCalledWith(13, expect.stringContaining('buyCrypto-amlCheck-Reset'));

    pending = deferred<void>();
    mockResetBuyCryptoReviewAml.mockReturnValueOnce(pending.promise);
    await resolveAfterSwitch(
      mockReviewCallbacks.amlReviewReset,
      async () => waitFor(() => expect(mockResetBuyCryptoReviewAml).toHaveBeenCalledTimes(2)),
      pending,
    );
    expect(mockGetUserData).toHaveBeenCalledTimes(8);

    pending = deferred<void>();
    mockSetKycStatusCheck.mockReturnValueOnce(pending.promise);
    await resolveAfterSwitch(
      mockReviewCallbacks.kycCheck,
      async () => waitFor(() => expect(mockSetKycStatusCheck).toHaveBeenCalledTimes(1)),
      pending,
    );
    expect(mockGetUserData).toHaveBeenCalledTimes(9);
  });

  it('generates the original customer PDF after a late audit log without installing its preview or refreshing', async () => {
    mockGetUserData.mockResolvedValue(response('customer 8'));
    const view = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer 8');
    let customerId = 8;

    async function switchCustomer(): Promise<void> {
      customerId += 1;
      mockParams = { id: String(customerId) };
      mockGetUserData.mockResolvedValue(response(`customer ${customerId}`));
      await act(async () => view.rerender(<ComplianceReviewScreen />));
      expect(await screen.findByTestId('review-customer')).toHaveTextContent(`customer ${customerId}`);
    }

    async function completeLateLog(callback: () => Promise<void>, expectedLogCalls: number): Promise<void> {
      const pendingLog = deferred<void>();
      mockCreateKycLog.mockReturnValueOnce(pendingLog.promise);
      let operation!: Promise<void>;
      act(() => { operation = callback(); });
      await waitFor(() => expect(mockCreateKycLog).toHaveBeenCalledTimes(expectedLogCalls));
      await switchCustomer();
      const readsBeforeLateLog = mockGetUserData.mock.calls.length;
      await act(async () => {
        pendingLog.resolve();
        await operation;
      });
      expect(mockGetUserData).toHaveBeenCalledTimes(readsBeforeLateLog);
    }

    await completeLateLog(mockReviewCallbacks.freigabeSave, 1);
    expect(mockGenerateOnboardingPdf).toHaveBeenCalledWith(8, mockFreigabeParams.pdfData);
    expect(mockCreateObjectURL).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Operational Activity/ }));
    await completeLateLog(mockReviewCallbacks.stepSave, 2);
  });

  it('does not install a generated PDF preview after the customer route changes', async () => {
    mockGetUserData.mockResolvedValue(response('old customer'));
    const view = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('old customer');
    const latePdf = deferred<{ pdfData: string; fileName: string }>();
    mockGenerateOnboardingPdf.mockReturnValueOnce(latePdf.promise);

    let save!: Promise<void>;
    act(() => { save = mockReviewCallbacks.freigabeSave(); });
    await waitFor(() => expect(mockGenerateOnboardingPdf).toHaveBeenCalledWith(8, mockFreigabeParams.pdfData));

    mockParams = { id: '9' };
    mockGetUserData.mockResolvedValue(response('new customer'));
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('new customer');

    await act(async () => {
      latePdf.resolve({ pdfData: 'QQ==', fileName: 'old-customer.pdf' });
      await save;
    });
    expect(screen.getByTestId('review-preview-url')).toBeEmptyDOMElement();
    expect(mockCreateObjectURL).not.toHaveBeenCalled();
  });

  it('does not continue a review write chain after the first write resolves in a new staff scope', async () => {
    const firstWrite = deferred<void>();
    mockUpdateKycStep.mockReturnValueOnce(firstWrite.promise);
    const { rerender } = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('default');

    fireEvent.click(screen.getByTestId('save-review'));
    await waitFor(() => expect(mockUpdateKycStep).toHaveBeenCalledTimes(1));

    mockParams = { id: '9' };
    mockSession = { account: 102, user: 202, address: '0xDef', role: 'Compliance' };
    mockRawTokenSession = { ...mockSession };
    mockToken = 'token-102-202';
    mockGetUserData.mockResolvedValueOnce(response('new customer'));
    await act(async () => rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('new customer');

    await act(async () => {
      firstWrite.resolve();
      await firstWrite.promise;
    });
    expect(mockUpdateUserData).not.toHaveBeenCalled();
    expect(mockCreateKycLog).not.toHaveBeenCalled();
    expect(mockGenerateOnboardingPdf).not.toHaveBeenCalled();
  });

  it('does not start later review writes when the staff scope changes during a user-data write', async () => {
    const userDataWrite = deferred<void>();
    mockUpdateUserData.mockReturnValueOnce(userDataWrite.promise);
    const { rerender } = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('default');

    fireEvent.click(screen.getByTestId('save-review'));
    await waitFor(() => expect(mockUpdateKycStep).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockUpdateUserData).toHaveBeenCalledTimes(1));

    mockParams = { id: '9' };
    mockSession = { account: 102, user: 202, address: '0xDef', role: 'Compliance' };
    mockRawTokenSession = { ...mockSession };
    mockToken = 'token-102-202';
    mockGetUserData.mockResolvedValueOnce(response('new customer'));
    await act(async () => rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('new customer');

    await act(async () => {
      userDataWrite.resolve();
      await userDataWrite.promise;
    });
    expect(mockCreateKycLog).not.toHaveBeenCalled();
    expect(mockGenerateOnboardingPdf).not.toHaveBeenCalled();
  });

  it('does not commit an open response or save a download after the customer scope changes', async () => {
    mockGetUserData.mockResolvedValue(response('old customer'));
    const { rerender } = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('old customer');
    fireEvent.click(screen.getByTestId('open-review-file'));
    await waitFor(() => expect(screen.getByTestId('review-preview-url')).toHaveTextContent('blob:review-preview'));

    const staleDownload = deferred<{ content: { type: string; data: number[] }; contentType: string }>();
    const stalePreview = deferred<{ content: { type: string; data: number[] }; contentType: string }>();
    mockGetKycFile.mockReturnValueOnce(staleDownload.promise).mockReturnValueOnce(stalePreview.promise);
    fireEvent.click(screen.getByTestId('review-download'));
    fireEvent.click(screen.getByTestId('open-review-file'));

    mockParams = { id: '9' };
    mockSession = { account: 102, user: 202, address: '0xDef', role: 'Compliance' };
    mockRawTokenSession = { ...mockSession };
    mockToken = 'token-102-202';
    mockGetUserData.mockResolvedValueOnce(response('new customer'));
    await act(async () => rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('new customer');
    await waitFor(() => expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:review-preview'));

    await act(async () => {
      staleDownload.resolve({ content: { type: 'Buffer', data: [1] }, contentType: 'image/png' });
      stalePreview.resolve({ content: { type: 'Buffer', data: [2] }, contentType: 'image/png' });
      await Promise.all([staleDownload.promise, stalePreview.promise]);
    });
    expect(mockSaveBufferedFile).not.toHaveBeenCalled();
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('review-preview-url')).toBeEmptyDOMElement();
  });

  it('does not surface preview or download errors that arrive after the customer changes', async () => {
    mockGetUserData.mockResolvedValue(response('old customer'));
    const view = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('old customer');
    fireEvent.click(screen.getByTestId('open-review-file'));
    await waitFor(() => expect(screen.getByTestId('review-preview-url')).toHaveTextContent('blob:review-preview'));

    const lateDownload = deferred<{ content: { type: string; data: number[] }; contentType: string }>();
    const latePreview = deferred<{ content: { type: string; data: number[] }; contentType: string }>();
    mockGetKycFile.mockReturnValueOnce(lateDownload.promise).mockReturnValueOnce(latePreview.promise);
    let downloadRequest!: Promise<void>;
    let previewRequest!: Promise<void>;
    act(() => {
      downloadRequest = mockReviewCallbacks.download();
      previewRequest = mockReviewCallbacks.openFreigabeFile();
    });

    mockParams = { id: '9' };
    mockGetUserData.mockResolvedValue(response('new customer'));
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('new customer');

    await act(async () => {
      lateDownload.reject(new Error('old download failed'));
      latePreview.reject(new Error('old preview failed'));
      await Promise.allSettled([downloadRequest, previewRequest]);
    });
    expect(screen.queryByText('old download failed')).not.toBeInTheDocument();
    expect(screen.queryByText('old preview failed')).not.toBeInTheDocument();
    expect(screen.queryByText('Error downloading file')).not.toBeInTheDocument();
    expect(screen.queryByText('Error loading file')).not.toBeInTheDocument();
    expect(screen.getByTestId('review-preview-url')).toBeEmptyDOMElement();
  });

  it('ignores a pending preview and download that finish after unmount', async () => {
    mockGetUserData.mockResolvedValue(response('customer'));
    const { unmount } = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer');
    fireEvent.click(screen.getByTestId('open-review-file'));
    await waitFor(() => expect(screen.getByTestId('review-preview-url')).toHaveTextContent('blob:review-preview'));

    const latePreview = deferred<{ content: { type: string; data: number[] }; contentType: string }>();
    const lateDownload = deferred<{ content: { type: string; data: number[] }; contentType: string }>();
    mockGetKycFile.mockReturnValueOnce(lateDownload.promise).mockReturnValueOnce(latePreview.promise);
    fireEvent.click(screen.getByTestId('review-download'));
    fireEvent.click(screen.getByTestId('open-review-file'));
    unmount();
    await waitFor(() => expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:review-preview'));

    await act(async () => {
      latePreview.resolve({ content: { type: 'Buffer', data: [1] }, contentType: 'image/png' });
      lateDownload.resolve({ content: { type: 'Buffer', data: [2] }, contentType: 'image/png' });
      await Promise.all([latePreview.promise, lateDownload.promise]);
    });
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    expect(mockSaveBufferedFile).not.toHaveBeenCalled();
  });

  it('renders configured review tabs and dispatches bank and AML actions with the selected customer', async () => {
    const data = {
      ...response('organization'),
      userData: { ...response('organization').userData, accountType: 'Organization' },
      kycSteps: [
        { id: 1, name: 'DfxApproval', status: 'Completed', sequenceNumber: 1, result: '{}' },
        { id: 6, name: 'DfxApproval', status: 'Failed', sequenceNumber: 3, result: '{}' },
        { id: 2, name: 'OperationalActivity', status: 'Failed', sequenceNumber: 1, result: '{"isOperational":true}' },
        { id: 3, name: 'LegalEntity', status: 'InProgress', sequenceNumber: 1 },
        { id: 4, name: 'Ident', status: 'Failed', sequenceNumber: 1 },
        { id: 5, name: 'NameChange', status: 'Failed', sequenceNumber: 1 },
      ],
      bankDatas: [{ status: 'Failed' }, { status: 'ManualReview' }],
      transactions: [
        { type: 'BuyCrypto', amlCheck: 'Pending', amlReason: 'ManualCheck' },
        { type: null, amlCheck: 'Pass', amlReason: 'ManualCheck' },
      ],
    } as ReviewResponse;
    mockGetUserData.mockResolvedValue(data);
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('organization');
    expect(screen.getByTestId('freigabe-step-status')).toHaveTextContent('Failed');

    expect(screen.getByRole('button', { name: /AML Pending/ })).toHaveTextContent('AML Pending');
    expect(screen.getByRole('button', { name: /BankData Review/ })).toHaveTextContent('BankData Review');
    expect(screen.getByRole('button', { name: /Stammdaten/ })).toHaveClass('bg-dfxRed-100/20');
    expect(screen.getByRole('button', { name: /Legal Entity/ })).toHaveClass('bg-dfxGray-300');
    expect(screen.getByRole('button', { name: /Operational Activity/ })).toHaveClass('bg-dfxRed-100/20');

    fireEvent.click(screen.getByRole('button', { name: /BankData Review/ }));
    fireEvent.click(screen.getByTestId('approve-bank'));
    await waitFor(() => expect(mockUpdateBankData).toHaveBeenCalledWith(44, {
      manualApproved: true, approved: true, status: 'Completed',
    }));
    await waitFor(() => expect(mockCreateKycLog).toHaveBeenCalledWith(8, expect.stringContaining('Services - BankData')));
    expect(mockGetUserData).toHaveBeenCalledTimes(2);

    mockCreateKycLog.mockClear();
    fireEvent.click(screen.getByTestId('reject-bank'));
    await waitFor(() => expect(mockUpdateBankData).toHaveBeenLastCalledWith(44, {
      manualApproved: false, approved: false, status: 'Failed',
    }));
    await waitFor(() => expect(mockCreateKycLog).toHaveBeenCalledWith(8, expect.stringContaining('Services - BankData')));

    fireEvent.click(screen.getByRole('button', { name: /AML Pending/ }));
    fireEvent.click(screen.getByTestId('update-crypto-aml'));
    await waitFor(() => expect(mockUpdateBuyCrypto).toHaveBeenCalledWith(31, {
      amlCheck: 'Fail', amlReason: 'ManualCheck', priceDefinitionAllowedDate: '2026-01-01',
    }));
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledTimes(4));

    fireEvent.click(screen.getByTestId('update-fiat-aml'));
    await waitFor(() => expect(mockUpdateBuyFiat).toHaveBeenCalledWith(32, { amlCheck: 'Pass' }));
    await waitFor(() => expect(mockCreateKycLog).toHaveBeenCalledTimes(3));

    await clickAndWaitFor('reset-crypto-aml', () => expect(mockResetBuyCryptoReviewAml).toHaveBeenCalledWith(31, {
      expectedAmlCheck: 'Fail', expectedAmlReason: 'ManualCheck',
    }));
    await clickAndWaitFor('reset-crypto-no-reason', () => expect(mockResetBuyCryptoReviewAml).toHaveBeenCalledWith(33, {
      expectedAmlCheck: 'Fail', expectedAmlReason: null,
    }));
    await clickAndWaitFor('reset-fiat-aml', () => expect(mockResetBuyFiatAml).toHaveBeenCalledWith(32));
    await clickAndWaitFor('review-reset-aml', () => expect(mockResetBuyCryptoReviewAml).toHaveBeenCalledTimes(3));
    expect(screen.queryByText(/could not be changed|failed/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ident/ }));
    expect(screen.getByTestId('ident-panel')).toBeInTheDocument();
  });

  it('covers review saves with optional user updates, operational account derivation, and KYC status refresh', async () => {
    const data = {
      ...response('organization'),
      userData: { ...response('organization').userData, accountType: 'Organization' },
      kycSteps: [
        { id: 1, name: 'DfxApproval', status: 'Pending', sequenceNumber: 1 },
        { id: 2, name: 'OperationalActivity', status: 'Pending', sequenceNumber: 1, result: '{"isOperational":true}' },
      ],
    } as ReviewResponse;
    mockGetUserData.mockResolvedValue(data);
    const view = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('organization');

    fireEvent.click(screen.getByTestId('save-review'));
    await waitFor(() => expect(mockUpdateKycStep).toHaveBeenCalledWith(10, expect.objectContaining({ status: 'Completed' })));
    await waitFor(() => expect(mockUpdateUserData).toHaveBeenCalledWith(8, { amlAccountType: 'updated', ignored: null }));
    await waitFor(() => expect(mockGenerateOnboardingPdf).toHaveBeenCalledWith(8, mockFreigabeParams.pdfData));

    mockFreigabeParams = { stepId: 10, status: 'Failed' };
    fireEvent.click(screen.getByTestId('save-review'));
    await waitFor(() => expect(mockUpdateKycStep).toHaveBeenCalledTimes(2));
    expect(mockUpdateUserData).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Operational Activity/ }));
    fireEvent.click(screen.getByTestId('save-step'));
    await waitFor(() => expect(mockUpdateUserData).toHaveBeenLastCalledWith(8, { amlAccountType: 'operativ tätige Gesellschaft' }));
    expect(mockCreateKycLog).toHaveBeenCalled();

    mockUpdateUserData.mockClear();
    mockParams = { id: '9' };
    mockGetUserData.mockResolvedValueOnce({
      ...data,
      userData: { ...data.userData, marker: 'non-operational organization' },
      kycSteps: [{ id: 2, name: 'OperationalActivity', status: 'Pending', sequenceNumber: 1, result: '{"isOperational":false}' }],
    } as ReviewResponse);
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('non-operational organization');
    fireEvent.click(screen.getByTestId('save-step'));
    await waitFor(() => expect(mockCreateKycLog).toHaveBeenCalledTimes(3));
    expect(mockUpdateUserData).not.toHaveBeenCalled();

    mockParams = { id: '10' };
    mockGetUserData.mockResolvedValueOnce({
      ...data,
      userData: { ...data.userData, marker: 'missing operation result' },
      kycSteps: [{ id: 2, name: 'OperationalActivity', status: 'Pending', sequenceNumber: 1 }],
    } as ReviewResponse);
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('missing operation result');
    fireEvent.click(screen.getByTestId('save-step'));
    await waitFor(() => expect(mockCreateKycLog).toHaveBeenCalledTimes(4));
    expect(mockUpdateUserData).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('set-kyc-check'));
    await waitFor(() => expect(mockSetKycStatusCheck).toHaveBeenCalledWith(10, 'Completed'));
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledTimes(9));
  });

  it('saves a generic KYC tab without applying Operational Activity account updates', async () => {
    mockSearchTab = 'legalEntity';
    mockGetUserData.mockResolvedValue({
      ...response('legal entity'),
      userData: { ...response('legal entity').userData, accountType: 'Organization' },
      kycSteps: [{ id: 10, name: 'LegalEntity', status: 'Pending', sequenceNumber: 1 }],
    });
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('legal entity');

    await clickAndWaitFor('save-step', () => {
      expect(mockUpdateKycStep).toHaveBeenCalledWith(11, expect.objectContaining({ status: 'Completed' }));
      expect(mockCreateKycLog).toHaveBeenCalledWith(8, expect.stringContaining('StepSave'));
    });
    expect(mockUpdateUserData).not.toHaveBeenCalled();

    mockUpdateKycStep.mockRejectedValueOnce(new Error('legal entity save failed'));
    await clickAndWaitFor('save-step-error', () =>
      expect(screen.getByText('legal entity save failed')).toBeInTheDocument(),
    );
  });

  it('logs Operational Activity for the original customer after a route change during account update', async () => {
    const pendingUpdate = deferred<void>();
    mockGetUserData.mockResolvedValueOnce({
      ...response('old organization'),
      userData: { ...response('old organization').userData, accountType: 'Organization' },
      kycSteps: [{ id: 10, name: 'OperationalActivity', status: 'Pending', sequenceNumber: 1, result: '{"isOperational":true}' }],
    });
    mockUpdateUserData.mockReturnValueOnce(pendingUpdate.promise);
    mockGetUserData.mockResolvedValueOnce(response('new customer'));
    const view = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('old organization');

    fireEvent.click(screen.getByRole('button', { name: /Operational Activity/ }));
    fireEvent.click(screen.getByTestId('save-step'));
    await waitFor(() => expect(mockUpdateUserData).toHaveBeenCalledWith(8, { amlAccountType: 'operativ tätige Gesellschaft' }));
    const oldSave = mockLastAsyncAction;
    if (!oldSave) throw new Error('Operational Activity save did not start');

    mockParams = { id: '9' };
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('new customer');

    await act(async () => {
      pendingUpdate.resolve();
      await oldSave;
    });
    expect(mockCreateKycLog).toHaveBeenCalledWith(8, expect.stringContaining('userData-amlAccountType-operativ'));
    expect(mockGetUserData).toHaveBeenCalledTimes(2);
  });

  it('renders invalid-session, missing-id, and data-error states without issuing unauthorized requests', async () => {
    mockLoggedIn = false;
    const view = render(<ComplianceReviewScreen />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(mockGetUserData).not.toHaveBeenCalled();

    mockLoggedIn = true;
    mockParams = {};
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    expect(await screen.findByText('No ID provided')).toBeInTheDocument();
    expect(mockGetUserData).not.toHaveBeenCalled();

    mockParams = { id: '8' };
    mockGetUserData.mockRejectedValueOnce(new Error('customer API failed'));
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    expect(await screen.findByText('customer API failed')).toBeInTheDocument();

    mockParams = { id: '9' };
    mockGetUserData.mockRejectedValueOnce('non-Error rejection');
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    expect(await screen.findByText('Unknown error')).toBeInTheDocument();
  });

  it('clears a loaded dossier when the API rejects the current token with 401', async () => {
    mockGetUserData.mockResolvedValueOnce(response('loaded before unauthorized refresh')).mockImplementationOnce(async () => {
      mockToken = undefined;
      throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    });
    const nextRequest = deferred<ReviewResponse>();
    mockGetUserData.mockReturnValueOnce(nextRequest.promise);
    const view = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('loaded before unauthorized refresh');
    await clickAndWaitFor('set-kyc-check', () => expect(mockGetUserData).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.queryByTestId('review-customer')).not.toBeInTheDocument();
    expect(screen.queryByText('Unauthorized')).not.toBeInTheDocument();

    mockToken = 'token-101-201';
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledTimes(3));
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.queryByTestId('review-customer')).not.toBeInTheDocument();

    await act(async () => {
      nextRequest.resolve(response('fresh dossier after reauthentication'));
      await nextRequest.promise;
    });
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('fresh dossier after reauthentication');
  });

  it('keeps bank and AML failures visible while stopping dependent writes', async () => {
    mockGetUserData.mockResolvedValue({
      ...response('customer'),
      transactions: [{ type: 'BuyCrypto', amlCheck: 'Pending', amlReason: 'ManualCheck' }],
    });
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer');

    fireEvent.click(screen.getByRole('button', { name: /BankData Review/ }));
    mockUpdateBankData.mockRejectedValueOnce(new Error('bank update failed'));
    fireEvent.click(screen.getByTestId('approve-bank'));
    expect(await screen.findByText('bank update failed')).toBeInTheDocument();
    expect(mockCreateKycLog).not.toHaveBeenCalled();

    mockUpdateBankData.mockRejectedValueOnce('rejection value');
    await clickAndWaitFor('reject-bank', () =>
      expect(screen.getByText('Error rejecting')).toBeInTheDocument(),
    );

    mockUpdateBankData.mockRejectedValueOnce('approve rejection value');
    await clickAndWaitFor('approve-bank', () =>
      expect(screen.getByText('Error approving')).toBeInTheDocument(),
    );

    mockUpdateBankData.mockRejectedValueOnce(new Error('bank reject failed'));
    await clickAndWaitFor('reject-bank', () =>
      expect(screen.getByText('bank reject failed')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /AML Pending/ }));
    mockUpdateBuyCrypto.mockRejectedValueOnce(new Error('AML write failed'));
    fireEvent.click(screen.getByTestId('update-crypto-aml'));
    expect(await screen.findByText('AML write failed')).toBeInTheDocument();
    expect(mockCreateKycLog).not.toHaveBeenCalled();
  });

  it('reports KYC status failure and distinguishes a failed follow-up reload', async () => {
    mockGetUserData.mockResolvedValueOnce(response('customer')).mockRejectedValueOnce(new Error('reload failed'));
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer');

    mockSetKycStatusCheck.mockRejectedValueOnce(new Error('status write failed'));
    fireEvent.click(screen.getByTestId('set-kyc-check'));
    expect(await screen.findByText('KYC status could not be changed to Check: status write failed. Reload failed: reload failed')).toBeInTheDocument();
    expect(mockGetUserData).toHaveBeenCalledTimes(2);
  });

  it('uses explicit fallbacks for non-Error AML and KYC failures', async () => {
    mockGetUserData.mockResolvedValue(response('customer'));
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer');

    fireEvent.click(screen.getByRole('button', { name: /AML Pending/ }));
    mockResetBuyCryptoReviewAml.mockRejectedValueOnce('reset rejection');
    await clickAndWaitFor('reset-crypto-aml', () =>
      expect(screen.getByText('Error resetting')).toBeInTheDocument(),
    );

    mockUpdateBuyCrypto.mockRejectedValueOnce('AML update rejection');
    await clickAndWaitFor('update-crypto-aml', () =>
      expect(screen.getByText('Error saving')).toBeInTheDocument(),
    );

    mockSetKycStatusCheck.mockRejectedValueOnce('status rejection');
    mockGetUserData.mockRejectedValueOnce(new Error('status reload failed'));
    await clickAndWaitFor('set-kyc-check', () =>
      expect(screen.getByText('KYC status could not be changed to Check: status rejection. Reload failed: status reload failed')).toBeInTheDocument(),
    );
  });

  it('reports unknown KYC write and reload errors for non-Error rejections', async () => {
    mockGetUserData.mockResolvedValue(response('customer'));
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer');

    mockSetKycStatusCheck.mockRejectedValueOnce({ reason: 'unknown' });
    mockGetUserData.mockRejectedValueOnce('raw reload rejection');
    await clickAndWaitFor('set-kyc-check', () =>
      expect(screen.getByText('KYC status could not be changed to Check: Unknown error. Reload failed: Unknown error')).toBeInTheDocument(),
    );
  });

  it('reports a failed refresh after a successful KYC status change', async () => {
    mockGetUserData.mockResolvedValueOnce(response('customer')).mockRejectedValueOnce(new Error('refresh failed'));
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer');

    fireEvent.click(screen.getByTestId('set-kyc-check'));
    expect(await screen.findByText('KYC status was changed to Check, but the data refresh failed: refresh failed')).toBeInTheDocument();
    expect(mockSetKycStatusCheck).toHaveBeenCalledWith(8, 'Completed');
  });

  it('uses the unknown-error fallback when refresh after a successful KYC change rejects without an Error', async () => {
    mockGetUserData.mockResolvedValueOnce(response('customer')).mockRejectedValueOnce('raw refresh rejection');
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer');

    await clickAndWaitFor('set-kyc-check', () =>
      expect(screen.getByText('KYC status was changed to Check, but the data refresh failed: Unknown error')).toBeInTheDocument(),
    );
    expect(mockSetKycStatusCheck).toHaveBeenCalledWith(8, 'Completed');
  });

  it('does not attach refresh failures to a new customer when the scope changes before the handler catches', async () => {
    mockGetUserData.mockResolvedValueOnce(response('customer 8'));
    const view = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer 8');

    let nextCustomerId = 9;
    let pendingCustomerRead: ReturnType<typeof deferred<ReviewResponse>> | undefined;
    async function raceNextRefreshWithRouteChange(actionTestId: string): Promise<void> {
      let resolveRouteChange!: () => void;
      const routeChanged = new Promise<void>((resolve) => { resolveRouteChange = resolve; });
      mockGetUserData.mockImplementationOnce(() => {
        const failedRead = Promise.reject(new Error('old customer refresh failed'));
        void failedRead.catch(() => {
          queueMicrotask(() => {
            mockParams = { id: String(nextCustomerId) };
            const nextScopeId = nextCustomerId + 100;
            mockSession = {
              account: nextScopeId,
              user: nextScopeId + 100,
              address: `0x${nextScopeId.toString(16)}`,
              role: 'Compliance',
            };
            mockRawTokenSession = { ...mockSession };
            mockToken = `token-${nextScopeId}`;
            pendingCustomerRead = deferred<ReviewResponse>();
            nextCustomerId += 1;
            mockGetUserData.mockReturnValueOnce(pendingCustomerRead.promise);
            view.rerender(<ComplianceReviewScreen />);
            resolveRouteChange();
          });
        });
        return failedRead;
      });

      await clickAndWaitFor(actionTestId, () => undefined);
      await routeChanged;
      if (!pendingCustomerRead) throw new Error('New-customer read did not start');
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(screen.queryByText(/refresh failed/)).not.toBeInTheDocument();
      await act(async () => {
        pendingCustomerRead?.resolve(response(`customer ${nextCustomerId - 1}`));
        await pendingCustomerRead?.promise;
      });
      expect(await screen.findByTestId('review-customer')).toHaveTextContent(`customer ${nextCustomerId - 1}`);
      expect(screen.queryByText(/refresh failed/)).not.toBeInTheDocument();
    }

    await raceNextRefreshWithRouteChange('set-kyc-check');

    mockSetKycStatusCheck.mockRejectedValueOnce(new Error('status write failed'));
    await raceNextRefreshWithRouteChange('set-kyc-check');

    fireEvent.click(screen.getByRole('button', { name: /AML Pending/ }));
    mockResetBuyCryptoReviewAml.mockRejectedValueOnce(new Error('reset write failed'));
    await raceNextRefreshWithRouteChange('reset-crypto-aml');

    await raceNextRefreshWithRouteChange('reset-crypto-aml');

    mockResetBuyCryptoReviewAml.mockRejectedValueOnce(new Error('review reset write failed'));
    await raceNextRefreshWithRouteChange('review-reset-aml');

    await raceNextRefreshWithRouteChange('review-reset-aml');
  });

  it('does not request a KYC status change when the customer is already in Check', async () => {
    mockGetUserData.mockResolvedValue({
      ...response('already checked'),
      userData: { ...response('already checked').userData, kycStatus: 'Check' },
    });
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('already checked');

    fireEvent.click(screen.getByTestId('set-kyc-check'));
    expect(mockSetKycStatusCheck).not.toHaveBeenCalled();
  });

  it('reports AML reset validation, log, and refresh failures without hiding the dossier', async () => {
    mockGetUserData.mockResolvedValue(response('customer'));
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer');
    fireEvent.click(screen.getByRole('button', { name: /AML Pending/ }));

    await clickAndWaitFor('reset-missing-aml', () =>
      expect(screen.getByText('Current BuyCrypto AML status is missing; reload the transaction')).toBeInTheDocument(),
    );

    mockResetBuyFiatAml.mockResolvedValueOnce(undefined);
    mockCreateKycLog.mockRejectedValueOnce(new Error('audit log failed'));
    await clickAndWaitFor('reset-fiat-aml', () =>
      expect(screen.getByText(/additional KYC log failed: audit log failed/)).toBeInTheDocument(),
    );

    mockGetUserData.mockRejectedValueOnce(new Error('refresh failed'));
    mockCreateKycLog.mockResolvedValueOnce(undefined);
    await clickAndWaitFor('reset-crypto-aml', () =>
      expect(screen.getByText(/Data refresh failed: refresh failed/)).toBeInTheDocument(),
    );
  });

  it('reports non-Error AML audit-log failures after a successful reset and refresh', async () => {
    mockGetUserData.mockResolvedValue(response('customer'));
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer');
    fireEvent.click(screen.getByRole('button', { name: /AML Pending/ }));

    mockCreateKycLog.mockRejectedValueOnce('raw audit rejection');
    await clickAndWaitFor('reset-fiat-aml', () =>
      expect(screen.getByText('AML check was reset, but the additional KYC log failed: Unknown error')).toBeInTheDocument(),
    );
    expect(mockResetBuyFiatAml).toHaveBeenCalledWith(32);
    expect(mockGetUserData).toHaveBeenCalledTimes(2);
  });

  it('reports non-Error reload failures during AML reset recovery', async () => {
    mockGetUserData.mockResolvedValue(response('customer'));
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer');
    fireEvent.click(screen.getByRole('button', { name: /AML Pending/ }));

    mockResetBuyFiatAml.mockRejectedValueOnce('raw reset rejection');
    mockGetUserData.mockRejectedValueOnce('raw recovery reload rejection');
    await clickAndWaitFor('reset-fiat-aml', () =>
      expect(screen.getByText('Error resetting. Reload failed: Unknown error')).toBeInTheDocument(),
    );
    expect(mockResetBuyFiatAml).toHaveBeenCalledWith(32);
    expect(screen.queryByTestId('review-customer')).not.toBeInTheDocument();
  });

  it('combines an AML audit-log warning with a subsequent refresh failure', async () => {
    mockGetUserData.mockResolvedValue(response('customer'));
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer');
    fireEvent.click(screen.getByRole('button', { name: /AML Pending/ }));

    mockCreateKycLog.mockRejectedValueOnce(new Error('audit log failed'));
    mockGetUserData.mockRejectedValueOnce(new Error('refresh failed'));
    await clickAndWaitFor('reset-fiat-aml', () =>
      expect(screen.getByText('AML check was reset, but the additional KYC log failed: audit log failed. Data refresh failed: refresh failed')).toBeInTheDocument(),
    );
    expect(mockResetBuyFiatAml).toHaveBeenCalledWith(32);
  });

  it('reports non-Error refresh failures after an AML review reset', async () => {
    mockGetUserData.mockResolvedValue(response('customer'));
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer');
    fireEvent.click(screen.getByRole('button', { name: /AML Pending/ }));

    mockGetUserData.mockRejectedValueOnce('raw review reset refresh rejection');
    await clickAndWaitFor('review-reset-aml', () =>
      expect(screen.getByText('AML check was reset, but the data refresh failed: Unknown error')).toBeInTheDocument(),
    );
    expect(mockResetBuyCryptoReviewAml).toHaveBeenCalled();
    expect(screen.queryByTestId('review-customer')).not.toBeInTheDocument();
  });

  it('reports non-Error refresh failures after a successful AML status reset', async () => {
    mockGetUserData.mockResolvedValue(response('customer'));
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer');
    fireEvent.click(screen.getByRole('button', { name: /AML Pending/ }));

    mockGetUserData.mockRejectedValueOnce('raw reset refresh rejection');
    await clickAndWaitFor('reset-crypto-aml', () =>
      expect(screen.getByText('AML check was reset, but Data refresh failed: Unknown error')).toBeInTheDocument(),
    );
    expect(mockResetBuyCryptoReviewAml).toHaveBeenCalled();
    expect(screen.queryByTestId('review-customer')).not.toBeInTheDocument();
  });

  it('reports a failed AML review reset and skips invalid review-reset requests', async () => {
    mockGetUserData.mockResolvedValue(response('customer'));
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer');
    fireEvent.click(screen.getByRole('button', { name: /AML Pending/ }));

    fireEvent.click(screen.getByTestId('review-reset-missing-aml'));
    expect(mockResetBuyCryptoReviewAml).not.toHaveBeenCalled();

    await clickAndWaitFor('review-reset-no-reason-aml', () =>
      expect(mockResetBuyCryptoReviewAml).toHaveBeenCalledWith(33, {
        expectedAmlCheck: 'Fail', expectedAmlReason: null,
      }),
    );

    mockResetBuyCryptoReviewAml.mockRejectedValueOnce(new Error('reset failed'));
    await clickAndWaitFor('review-reset-aml', () =>
      expect(screen.getByText('reset failed')).toBeInTheDocument(),
    );

    mockResetBuyCryptoReviewAml.mockRejectedValueOnce(new Error('second reset failed'));
    mockGetUserData.mockRejectedValueOnce(new Error('review reload failed'));
    await clickAndWaitFor('review-reset-aml', () =>
      expect(screen.getByText('second reset failed. Reload failed: review reload failed')).toBeInTheDocument(),
    );
  });

  it('reports non-Error AML review-reset and recovery failures', async () => {
    mockGetUserData.mockResolvedValue(response('customer'));
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer');
    fireEvent.click(screen.getByRole('button', { name: /AML Pending/ }));

    mockResetBuyCryptoReviewAml.mockRejectedValueOnce('raw review reset rejection');
    mockGetUserData.mockRejectedValueOnce('raw review reload rejection');
    await clickAndWaitFor('review-reset-aml', () =>
      expect(screen.getByText('Error resetting. Reload failed: Unknown error')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('review-customer')).not.toBeInTheDocument();
  });

  it('reports AML reset recovery-refresh and successful-reset refresh failures', async () => {
    mockGetUserData.mockResolvedValue(response('customer'));
    const view = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer');
    fireEvent.click(screen.getByRole('button', { name: /AML Pending/ }));

    mockGetUserData.mockRejectedValueOnce(new Error('recovery reload failed'));
    await clickAndWaitFor('reset-missing-aml', () =>
      expect(screen.getByText(/Reload failed: recovery reload failed/)).toBeInTheDocument(),
    );

    mockParams = { id: '9' };
    mockGetUserData.mockResolvedValueOnce(response('next customer'));
    await act(async () => view.rerender(<ComplianceReviewScreen />));
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('next customer');
    expect(screen.getByTestId('reset-crypto-aml')).toBeInTheDocument();

    mockGetUserData.mockRejectedValueOnce(new Error('post-reset refresh failed'));
    await clickAndWaitFor('review-reset-aml', () =>
      expect(screen.getByText('AML check was reset, but the data refresh failed: post-reset refresh failed')).toBeInTheDocument(),
    );
  });

  it('shows the green visual states for completed Stammdaten, bank, AML, and KYC tabs', async () => {
    mockGetUserData.mockResolvedValue({
      ...response('complete'),
      userData: { ...response('complete').userData, accountType: 'Organization' },
      kycSteps: [
        { id: 1, name: 'NameChange', status: 'Completed', sequenceNumber: 1 },
        { id: 2, name: 'OperationalActivity', status: 'Completed', sequenceNumber: 1 },
        { id: 3, name: 'LegalEntity', status: 'Completed', sequenceNumber: 1 },
      ],
      bankDatas: [{ status: 'Completed' }],
      transactions: [{ type: 'BuyFiat', amlCheck: 'Pass', amlReason: 'ManualCheck' }],
    } as ReviewResponse);
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('complete');

    expect(screen.getByRole('button', { name: /BankData Review/ })).toHaveClass('bg-dfxGreen-100/20');
    expect(screen.getByRole('button', { name: /AML Pending/ })).toHaveClass('bg-dfxGreen-100/20');
    expect(screen.getByRole('button', { name: /Stammdaten/ })).toHaveClass('bg-dfxGreen-100/20');
    expect(screen.getByRole('button', { name: /Operational Activity/ })).toHaveClass('bg-dfxGreen-100/20');
  });

  it('marks AML review red when a manually reviewed transaction failed', async () => {
    mockGetUserData.mockResolvedValue({
      ...response('failed AML'),
      transactions: [{ type: 'BuyCrypto', amlCheck: 'Fail', amlReason: 'ManualCheck' }],
    });
    render(<ComplianceReviewScreen />);

    expect(await screen.findByTestId('review-customer')).toHaveTextContent('failed AML');
    expect(screen.getByRole('button', { name: /AML Pending/ })).toHaveClass('bg-dfxRed-100/20');
  });

  it('shows neutral pending states and no step badge for a configured non-step tab', async () => {
    mockGetUserData.mockResolvedValue({
      ...response('pending'),
      userData: { ...response('pending').userData, accountType: 'Organization' },
      kycSteps: [
        { id: 1, name: 'NameChange', status: 'Pending', sequenceNumber: 1 },
        { id: 2, name: 'OperationalActivity', status: 'Pending', sequenceNumber: 1 },
      ],
      bankDatas: [{ status: 'ManualReview' }],
      transactions: [{ type: 'BuyCrypto', amlCheck: 'Pending', amlReason: 'ManualCheck' }],
    } as ReviewResponse);
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('pending');

    expect(screen.getByRole('button', { name: /Stammdaten/ })).toHaveClass('bg-dfxGray-300');
    expect(screen.getByRole('button', { name: /BankData Review/ })).toHaveClass('bg-dfxGray-300');
    expect(screen.getByRole('button', { name: /AML Pending/ })).toHaveClass('bg-dfxGray-300');
    expect(screen.getByRole('button', { name: /Recommendation/ }).querySelector('span')).toBeNull();
  });

  it('uses the general tabs and empty file lists when optional profile fields are absent', async () => {
    const result = response('sparse customer');
    mockGetUserData.mockResolvedValue({
      ...result,
      userData: { ...result.userData, accountType: undefined },
      kycFiles: undefined,
    } as ReviewResponse);
    render(<ComplianceReviewScreen />);

    expect(await screen.findByTestId('review-customer')).toHaveTextContent('sparse customer');
    expect(screen.queryByRole('button', { name: /Legal Entity/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Operational Activity/ }));
    expect(screen.getByTestId('review-file-count')).toHaveTextContent('0:0');
  });

  it('defaults to the first visible review tab when the URL has no tab parameter', async () => {
    mockSearchTab = null;
    mockGetUserData.mockResolvedValue(response('default tab'));
    render(<ComplianceReviewScreen />);

    expect(await screen.findByTestId('review-customer')).toHaveTextContent('default tab');
    expect(screen.getByRole('button', { name: /AML Pending/ })).toHaveClass('bg-white');
    expect(screen.getByTestId('update-crypto-aml')).toBeInTheDocument();
  });

  it('routes the layout back action and forwards splitter drag to the pane hook', async () => {
    mockGetUserData.mockResolvedValue(response('layout controls'));
    const { container } = render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('layout controls');

    expect(mockOnBack).toBeDefined();
    await act(async () => mockOnBack?.());
    expect(mockNavigate).toHaveBeenCalledWith('/compliance');

    const splitter = container.querySelector('.cursor-col-resize');
    expect(splitter).not.toBeNull();
    fireEvent.mouseDown(splitter as Element);
    expect(mockHandleSplitDrag).toHaveBeenCalledTimes(1);
  });

  it('validates file previews and downloads and displays request failures', async () => {
    mockGetUserData.mockResolvedValue(response('customer'));
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer');

    fireEvent.click(screen.getByTestId('review-download'));
    expect(mockGetKycFile).not.toHaveBeenCalled();

    mockGetKycFile.mockResolvedValueOnce({ content: { type: 'Blob', data: [] }, contentType: 'application/pdf' });
    fireEvent.click(screen.getByTestId('open-review-file'));
    expect(await screen.findByText('Invalid file type')).toBeInTheDocument();

    mockGetKycFile.mockRejectedValueOnce(new Error('preview request failed'));
    fireEvent.click(screen.getByTestId('open-review-file'));
    expect(await screen.findByText('preview request failed')).toBeInTheDocument();

    mockGetKycFile.mockRejectedValueOnce('preview rejection');
    fireEvent.click(screen.getByTestId('open-review-file'));
    expect(await screen.findByText('Error loading file')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('open-review-file'));
    await waitFor(() => expect(screen.getByTestId('review-preview-url')).toHaveTextContent('blob:review-preview'));

    mockGetKycFile.mockResolvedValueOnce({ content: { type: 'Blob', data: [] }, contentType: 'application/pdf' });
    fireEvent.click(screen.getByTestId('review-download'));
    expect(await screen.findByText('Invalid file type')).toBeInTheDocument();
    expect(mockSaveBufferedFile).not.toHaveBeenCalled();

    mockGetKycFile.mockRejectedValueOnce(new Error('download request failed'));
    fireEvent.click(screen.getByTestId('review-download'));
    expect(await screen.findByText('download request failed')).toBeInTheDocument();

    mockGetKycFile.mockRejectedValueOnce('download rejection');
    fireEvent.click(screen.getByTestId('review-download'));
    expect(await screen.findByText('Error downloading file')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('review-download'));
    await waitFor(() => expect(mockSaveBufferedFile).toHaveBeenCalledWith(
      { type: 'Buffer', data: [37, 80, 68, 70] }, 'application/pdf', 'review-document.pdf',
    ));
    fireEvent.click(screen.getByTestId('review-close'));
    await waitFor(() => expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:review-preview'));
  });

  it('handles malformed operation data, step-save errors, preview validation, and PDF generation failure', async () => {
    mockGetUserData.mockResolvedValue({
      ...response('customer'),
      userData: { ...response('customer').userData, accountType: 'Organization' },
      kycSteps: [{ id: 2, name: 'OperationalActivity', status: 'Pending', sequenceNumber: 1, result: 'not-json' }],
    } as ReviewResponse);
    render(<ComplianceReviewScreen />);
    expect(await screen.findByTestId('review-customer')).toHaveTextContent('customer');

    fireEvent.click(screen.getByRole('button', { name: /Operational Activity/ }));
    fireEvent.click(screen.getByTestId('save-step'));
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockCreateKycLog).toHaveBeenCalledTimes(1));
    expect(mockUpdateUserData).not.toHaveBeenCalled();

    mockUpdateKycStep.mockRejectedValueOnce('step rejection');
    fireEvent.click(screen.getByTestId('save-step-error'));
    expect(await screen.findByText('Error saving')).toBeInTheDocument();

    mockGetKycFile.mockResolvedValueOnce({ content: { type: 'Blob', data: [] }, contentType: 'application/pdf' });
    fireEvent.click(screen.getByRole('button', { name: /Freigabe/ }));
    fireEvent.click(screen.getByTestId('open-review-file'));
    expect(await screen.findByText('Invalid file type')).toBeInTheDocument();

    mockUpdateKycStep.mockRejectedValueOnce('freigabe rejection');
    mockFreigabeParams = { stepId: 10, status: 'Failed' };
    fireEvent.click(screen.getByTestId('save-review'));
    expect(await screen.findByText('Error saving')).toBeInTheDocument();

    mockUpdateKycStep.mockRejectedValueOnce(new Error('freigabe API failed'));
    fireEvent.click(screen.getByTestId('save-review'));
    expect(await screen.findByText('freigabe API failed')).toBeInTheDocument();

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGenerateOnboardingPdf.mockRejectedValueOnce(new Error('pdf generation failed'));
    mockFreigabeParams = { stepId: 10, status: 'Completed', pdfData: { processedBy: 'reviewer' } };
    fireEvent.click(screen.getByTestId('save-review'));
    await waitFor(() => expect(mockGenerateOnboardingPdf).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockGetUserData).toHaveBeenCalledTimes(3));
    expect(errorSpy).toHaveBeenCalledWith('Failed to generate PDF:', expect.any(Error));
    errorSpy.mockRestore();
    fireEvent.click(screen.getByTestId('review-close'));
    await waitFor(() => expect(screen.getByTestId('review-preview-url')).toBeEmptyDOMElement());
  });
});
