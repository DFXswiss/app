// Unit tests for SupportDashboardIssueScreen beyond ticket switches: the info panels, the update form,
// the composer (text, files, templates, placeholders, shortcut), message polling, the file preview and
// the error paths of every load. Child components are replaced by small stand-ins that expose their
// callbacks, so each branch of the screen is driven directly.

const mockGetIssueData = jest.fn();
const mockGetIssueMessages = jest.fn();
const mockGetClerks = jest.fn();
const mockUpdateIssue = jest.fn();
const mockSendMessage = jest.fn();
const mockGetMessageFile = jest.fn();
const mockGetUserData = jest.fn();
const mockNavigate = jest.fn();
const mockClearDraft = jest.fn();
const mockToBase64 = jest.fn();
const mockSaveBufferedFile = jest.fn();
const mockWriteDraft = jest.fn();

const mockParams: { id?: string } = { id: '1' };
const mockSession: { role?: string } = { role: 'Admin' };
const mockStaff: { name?: string; isLoading: boolean; error?: string } = { name: 'Rita', isLoading: false };
let mockDraftText = '';
let mockNoteDraftChange: ((next?: { text: string }) => void) | undefined;
let mockDecided: (() => void) | undefined;

jest.mock('@dfx.swiss/react', () => ({
  Department: { SUPPORT: 'Support', COMPLIANCE: 'Compliance' },
  UserRole: { ADMIN: 'Admin', SUPPORT: 'Support', COMPLIANCE: 'Compliance' },
  SupportIssueInternalState: { CREATED: 'Created', PENDING: 'Pending', COMPLETED: 'Completed' },
  useAuthContext: () => ({ session: mockSession }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/components/support/info-panel', () => ({
  InfoPanel: ({ title, children }: { title: string; children?: React.ReactNode }) => (
    <table aria-label={title}>
      <tbody>{children}</tbody>
    </table>
  ),
  InfoRow: ({ label, value }: { label: string; value?: React.ReactNode }) => (
    <tr data-testid={`row-${label}`}>
      <td>{value}</td>
    </tr>
  ),
  SupportMessageList: ({
    messages,
    onOpenFile,
  }: {
    messages?: { id: number; message?: string }[];
    onOpenFile?: (msg: unknown) => void;
  }) => (
    <div data-testid="message-list">
      {messages?.map((message) => (
        <div key={message.id}>{message.message}</div>
      ))}
      <button type="button" onClick={() => onOpenFile?.({ id: 99, fileName: 'a.pdf' })}>
        open-file
      </button>
      <button type="button" onClick={() => onOpenFile?.({ id: 98 })}>
        open-no-file
      </button>
    </div>
  ),
}));

jest.mock('src/components/compliance/file-preview-panel', () => ({
  FilePreviewPanel: ({
    preview,
    onClose,
    onDownload,
  }: {
    preview?: { name: string };
    onClose: () => void;
    onDownload: () => void;
  }) => (
    <div data-testid="file-preview">
      {preview?.name}
      <button type="button" onClick={onClose}>
        close-preview
      </button>
      <button type="button" onClick={onDownload}>
        download-preview
      </button>
    </div>
  ),
}));

jest.mock('src/components/compliance/limit-request-decision-form', () => ({
  LimitRequestDecisionForm: ({ decidedAs, onDecided }: { decidedAs?: string; onDecided: () => void }) => {
    mockDecided = onDecided;
    return <div data-testid="decision-form">{decidedAs ?? 'open'}</div>;
  },
}));

jest.mock('src/components/support/ticket-note-panel', () => ({
  TicketNotePanel: ({
    draft,
    onDraftChange,
  }: {
    draft?: { text: string };
    onDraftChange: (next?: { text: string }) => void;
  }) => {
    mockNoteDraftChange = onDraftChange;
    return <div data-testid="note-panel">{draft?.text ?? 'no-draft'}</div>;
  },
}));

jest.mock('src/components/support-templates/template-picker-modal', () => ({
  TemplatePickerModal: ({
    isOpen,
    onClose,
    onInsert,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onInsert: (content: string) => void;
  }) =>
    isOpen ? (
      <div data-testid="template-picker">
        <button type="button" onClick={() => onInsert('Simple template')}>
          insert-simple
        </button>
        <button type="button" onClick={() => onInsert('ARRAY template')}>
          insert-array
        </button>
        <button type="button" onClick={onClose}>
          close-picker
        </button>
      </div>
    ) : null,
}));

jest.mock('src/components/support-templates/template-array-picker-modal', () => ({
  TemplateArrayPickerModal: ({
    isOpen,
    onSelect,
    onCancel,
  }: {
    isOpen: boolean;
    onSelect: (transactionId: number) => void;
    onCancel: () => void;
  }) => (
    <div data-testid="array-picker" data-open={String(isOpen)}>
      <button type="button" onClick={() => onSelect(5)}>
        select-transaction
      </button>
      <button type="button" onClick={onCancel}>
        cancel-array
      </button>
    </div>
  ),
}));

jest.mock('src/components/compliance/staff-identity', () => ({
  STAFF_NAME_MISSING: 'Staff name missing',
  staffNameLoadError: (error: string) => `Staff name error: ${error}`,
}));

jest.mock('src/hooks/guard.hook', () => ({ useSupportDashboardGuard: () => undefined }));

jest.mock('src/hooks/support-dashboard.hook', () => ({
  ASSIGNABLE_DEPARTMENTS: ['Support', 'Compliance'],
  useSupportDashboard: () => ({
    getIssueData: mockGetIssueData,
    getIssueMessages: mockGetIssueMessages,
    getClerks: mockGetClerks,
    updateIssue: mockUpdateIssue,
    sendMessage: mockSendMessage,
    getMessageFile: mockGetMessageFile,
  }),
}));

jest.mock('src/hooks/compliance.hook', () => ({
  LimitRequestFinalDecisions: ['Accepted', 'Rejected'],
  useCompliance: () => ({ getUserData: mockGetUserData }),
}));

jest.mock('src/hooks/navigation.hook', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('src/hooks/layout-config.hook', () => ({ useLayoutOptions: () => undefined }));
jest.mock('src/hooks/split-pane.hook', () => ({
  useSplitPane: () => ({ containerRef: { current: null }, splitPercent: 70, handleSplitDrag: jest.fn() }),
}));

jest.mock('src/hooks/support-draft.hook', () => {
  const { useState } = jest.requireActual('react') as typeof import('react');
  return {
    useSupportDraft: () => {
      const [text, setText] = useState(mockDraftText);
      return [text, setText, mockClearDraft];
    },
  };
});

jest.mock('src/hooks/staff-verified-name.hook', () => ({ useStaffVerifiedName: () => mockStaff }));
jest.mock('react-router-dom', () => ({ useParams: () => mockParams }));
jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_namespace: string, value: string) => value }),
}));
jest.mock('src/util/compliance-helpers', () => ({
  formatDateTime: (value: string) => `at ${value}`,
  statusBadge: (status: string) => <span>{status}</span>,
}));
jest.mock('src/util/support-helpers', () => ({
  reasonLabel: (reason: string) => reason,
  typeLabel: (type: string) => type,
}));
jest.mock('src/util/support-draft', () => ({ writeDraft: (...args: unknown[]) => mockWriteDraft(...args) }));
jest.mock('src/util/template-placeholders', () => ({
  detectPlaceholders: (text: string) => (text.includes('$x') ? [{ fullKey: 'x' }] : []),
  requiresArraySelection: (content: string) => content.startsWith('ARRAY'),
  resolvePlaceholders: (content: string, _ctx: unknown, selections: { transactionId?: number }) =>
    selections.transactionId ? `${content} #${selections.transactionId}` : content,
}));
jest.mock('src/util/utils', () => ({
  saveBufferedFile: (...args: unknown[]) => mockSaveBufferedFile(...args),
  toBase64: (...args: unknown[]) => mockToBase64(...args),
}));
jest.mock('src/util/message-composer', () => ({
  isSendShortcut: (e: { key: string; metaKey: boolean }) => e.key === 'Enter' && e.metaKey,
}));

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import SupportDashboardIssueScreen from 'src/screens/support-dashboard-issue.screen';

function issue(id: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    created: '2026-01-01T00:00:00Z',
    uid: 'SI-' + id,
    type: 'GenericIssue',
    department: 'Support',
    reason: 'Other',
    state: 'Pending',
    clerk: 'Rita',
    name: 'Ticket ' + id,
    account: { id: 8, status: 'Active', kycLevel: '50', annualVolume: 1000, kycHash: 'h' },
    ...extra,
  };
}

function rowText(label: string): string | null {
  return screen.getByTestId(`row-${label}`).textContent;
}

async function renderLoaded(): Promise<ReturnType<typeof render>> {
  const view = render(<SupportDashboardIssueScreen />);
  expect(await screen.findByTestId('row-UID')).toBeInTheDocument();
  // Lets the clerk and message loads that the first render started settle inside act.
  await act(async () => undefined);
  return view;
}

beforeAll(() => {
  if (typeof URL.createObjectURL !== 'function') {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn() });
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
  }
});

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.id = '1';
  mockSession.role = 'Admin';
  mockStaff.name = 'Rita';
  mockStaff.isLoading = false;
  mockStaff.error = undefined;
  mockDraftText = '';
  mockNoteDraftChange = undefined;
  mockDecided = undefined;
  mockGetIssueData.mockImplementation((id: number) => Promise.resolve(issue(id)));
  mockGetIssueMessages.mockResolvedValue([{ id: 1, message: 'first message' }]);
  mockGetClerks.mockResolvedValue(['Rita', 'Tom']);
  mockUpdateIssue.mockResolvedValue(undefined);
  mockSendMessage.mockResolvedValue(undefined);
  mockGetUserData.mockResolvedValue({ userData: { id: 8 }, transactions: [{ id: 5 }] });
  mockToBase64.mockImplementation((file: File) => Promise.resolve(`b64-${file.name}`));
  jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
  jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('SupportDashboardIssueScreen panels', () => {
  it('shows a spinner while there is no ticket id', async () => {
    mockParams.id = undefined;
    render(<SupportDashboardIssueScreen />);
    await act(async () => undefined);

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(mockGetIssueData).not.toHaveBeenCalled();
  });

  it('shows the fallback text of a load error without a message', async () => {
    mockGetIssueData.mockRejectedValue({});
    render(<SupportDashboardIssueScreen />);

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('shows the issue and account data with every optional field present', async () => {
    mockGetIssueData.mockResolvedValue(
      issue(1, {
        account: {
          id: 8,
          status: 'Active',
          verifiedName: 'Alice Muster',
          completeName: 'Alice M.',
          accountType: 'Personal',
          kycLevel: '50',
          depositLimit: 100000,
          annualVolume: 1000,
          kycHash: 'h',
          country: { name: 'Switzerland' },
          language: { name: 'English', symbol: 'EN' },
        },
      }),
    );
    await renderLoaded();

    expect(rowText('Verified Name')).toBe('Alice Muster');
    expect(rowText('DFX Name')).toBe('Alice M.');
    expect(rowText('Account Type')).toBe('Personal');
    expect(rowText('Deposit Limit')).toBe(`${(100000).toLocaleString()} CHF`);
    expect(rowText('Country')).toBe('Switzerland');
    expect(rowText('Language')).toBe('English (EN)');
    expect(rowText('Department')).toBe('Support');
    expect(rowText('Created')).toBe('at 2026-01-01T00:00:00Z');
  });

  it('shows dashes for missing account fields and a language without symbol', async () => {
    mockGetIssueData.mockResolvedValue(
      issue(1, {
        department: undefined,
        clerk: undefined,
        account: {
          id: 8,
          status: 'Active',
          kycLevel: '50',
          annualVolume: 1000,
          kycHash: 'h',
          language: { name: 'German' },
        },
      }),
    );
    await renderLoaded();

    expect(rowText('Verified Name')).toBe('-');
    expect(rowText('DFX Name')).toBe('-');
    expect(rowText('Account Type')).toBe('-');
    expect(rowText('Deposit Limit')).toBe('-');
    expect(rowText('Country')).toBe('-');
    expect(rowText('Language')).toBe('German');
    expect(rowText('Department')).toBe('-');
    expect(screen.getAllByRole('option', { name: '-' })).toHaveLength(2);
  });

  it('shows a dash for an account without language', async () => {
    await renderLoaded();

    expect(rowText('Language')).toBe('-');
    expect(screen.queryByRole('option', { name: '-' })).not.toBeInTheDocument();
  });

  it('opens the account in the compliance tool for compliance staff', async () => {
    mockGetIssueData.mockResolvedValue(issue(1, { department: 'Compliance' }));
    await renderLoaded();

    fireEvent.click(within(screen.getByTestId('row-UserData ID')).getByRole('button', { name: '8' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open User' }));

    expect(mockNavigate).toHaveBeenNthCalledWith(1, '/compliance/user/8');
    expect(mockNavigate).toHaveBeenNthCalledWith(2, '/compliance/user/8');
  });

  it('opens the account in the support tool for support staff', async () => {
    mockSession.role = 'Support';
    await renderLoaded();

    fireEvent.click(within(screen.getByTestId('row-UserData ID')).getByRole('button', { name: '8' }));

    expect(mockNavigate).toHaveBeenCalledWith('/support/user/8');
    expect(screen.queryByRole('button', { name: 'Open User' })).not.toBeInTheDocument();
  });

  it('shows a transaction with every optional field', async () => {
    mockGetIssueData.mockResolvedValue(
      issue(1, {
        transaction: {
          id: 3,
          sourceType: 'BankTx',
          type: 'BuyCrypto',
          amlCheck: 'Pass',
          amlReason: 'NA',
          comment: 'checked',
          inputAmount: 100,
          inputAsset: 'CHF',
          outputAmount: 0.001,
          outputAsset: 'BTC',
          wallet: { name: 'DFX' },
          isComplete: true,
        },
      }),
    );
    await renderLoaded();

    const panel = screen.getByRole('table', { name: 'Transaction' });
    expect(within(panel).getByTestId('row-AML Check')).toHaveTextContent('Pass');
    expect(within(panel).getByTestId('row-AML Reason')).toHaveTextContent('NA');
    expect(within(panel).getByTestId('row-Comment')).toHaveTextContent('checked');
    expect(within(panel).getByTestId('row-Input')).toHaveTextContent('100 CHF');
    expect(within(panel).getByTestId('row-Output')).toHaveTextContent('0.001 BTC');
    expect(within(panel).getByTestId('row-Wallet')).toHaveTextContent('DFX');
    expect(within(panel).getByTestId('row-Complete')).toHaveTextContent('Yes');
  });

  it('shows a transaction with only its required fields', async () => {
    mockGetIssueData.mockResolvedValue(
      issue(1, {
        transaction: {
          id: 3,
          sourceType: 'BankTx',
          type: 'BuyCrypto',
          inputAmount: 5,
          outputAmount: 6,
          isComplete: false,
        },
      }),
    );
    await renderLoaded();

    const panel = screen.getByRole('table', { name: 'Transaction' });
    expect(within(panel).queryByTestId('row-AML Check')).not.toBeInTheDocument();
    expect(within(panel).queryByTestId('row-AML Reason')).not.toBeInTheDocument();
    expect(within(panel).queryByTestId('row-Comment')).not.toBeInTheDocument();
    expect(within(panel).queryByTestId('row-Wallet')).not.toBeInTheDocument();
    expect(within(panel).getByTestId('row-Input').textContent).toBe('5 ');
    expect(within(panel).getByTestId('row-Output').textContent).toBe('6 ');
    expect(within(panel).getByTestId('row-Complete')).toHaveTextContent('No');
  });

  it('shows a transaction without amounts or completion state', async () => {
    mockGetIssueData.mockResolvedValue(issue(1, { transaction: { id: 3, sourceType: 'BankTx', type: 'BuyCrypto' } }));
    await renderLoaded();

    const panel = screen.getByRole('table', { name: 'Transaction' });
    expect(within(panel).queryByTestId('row-Input')).not.toBeInTheDocument();
    expect(within(panel).queryByTestId('row-Output')).not.toBeInTheDocument();
    expect(within(panel).queryByTestId('row-Complete')).not.toBeInTheDocument();
  });

  it('shows the missing-transaction details that are present', async () => {
    mockGetIssueData.mockResolvedValue(
      issue(1, { transactionMissing: { senderIban: 'CH01', receiverIban: 'CH02', date: '2026-02-01' } }),
    );
    const { unmount } = await renderLoaded();

    const panel = screen.getByRole('table', { name: 'Transaction Missing' });
    expect(within(panel).getByTestId('row-Sender IBAN')).toHaveTextContent('CH01');
    expect(within(panel).getByTestId('row-Receiver IBAN')).toHaveTextContent('CH02');
    expect(within(panel).getByTestId('row-Date')).toHaveTextContent('at 2026-02-01');
    unmount();

    mockGetIssueData.mockResolvedValue(issue(1, { transactionMissing: {} }));
    await renderLoaded();
    expect(within(screen.getByRole('table', { name: 'Transaction Missing' })).queryAllByRole('row')).toHaveLength(0);
  });

  it('shows a decided limit request with its source-of-funds text to compliance', async () => {
    mockGetIssueData.mockResolvedValue(
      issue(1, {
        limitRequest: {
          id: 4,
          limit: 100000,
          acceptedLimit: 50000,
          investmentDate: 'Now',
          fundOrigin: 'Savings',
          fundOriginText: 'Salary from ten years of work',
          decision: 'Accepted',
        },
      }),
    );
    await renderLoaded();

    const panel = screen.getByRole('table', { name: 'Limit Request' });
    expect(within(panel).getByTestId('row-Requested')).toHaveTextContent(`${(100000).toLocaleString()} CHF`);
    expect(within(panel).getByTestId('row-Accepted')).toHaveTextContent(`${(50000).toLocaleString()} CHF`);
    expect(within(panel).getByTestId('row-Fund Origin')).toHaveTextContent('Savings');
    expect(within(panel).getByTestId('row-Fund Origin Details')).toHaveTextContent('Salary from ten years of work');
    expect(within(panel).getByTestId('row-Investment Date')).toHaveTextContent('Now');
    expect(within(panel).getByTestId('row-Decision')).toHaveTextContent('Accepted');
    expect(screen.getByTestId('decision-form')).toHaveTextContent('Accepted');
  });

  it('shows an open limit request without the optional rows and reloads after a decision', async () => {
    mockGetIssueData.mockResolvedValue(
      issue(1, { limitRequest: { id: 4, limit: 100000, investmentDate: 'Now', fundOrigin: 'Savings' } }),
    );
    await renderLoaded();

    const panel = screen.getByRole('table', { name: 'Limit Request' });
    expect(within(panel).queryByTestId('row-Accepted')).not.toBeInTheDocument();
    expect(within(panel).queryByTestId('row-Fund Origin Details')).not.toBeInTheDocument();
    expect(within(panel).queryByTestId('row-Decision')).not.toBeInTheDocument();
    expect(screen.getByTestId('decision-form')).toHaveTextContent('open');

    await act(async () => mockDecided?.());
    expect(mockGetIssueData).toHaveBeenCalledTimes(2);
  });

  it('passes a decision that is not final to the form as open', async () => {
    mockGetIssueData.mockResolvedValue(
      issue(1, {
        limitRequest: { id: 4, limit: 100000, investmentDate: 'Now', fundOrigin: 'Savings', decision: 'InProgress' },
      }),
    );
    await renderLoaded();

    expect(screen.getByTestId('decision-form')).toHaveTextContent('open');
  });

  it('hides the decision form from support staff', async () => {
    mockSession.role = 'Support';
    mockGetIssueData.mockResolvedValue(
      issue(1, { limitRequest: { id: 4, limit: 100000, investmentDate: 'Now', fundOrigin: 'Savings' } }),
    );
    await renderLoaded();

    expect(screen.queryByTestId('decision-form')).not.toBeInTheDocument();
  });

  it('ignores a decision reload of a ticket the clerk has left', async () => {
    mockGetIssueData.mockImplementation((id: number) =>
      Promise.resolve(issue(id, { limitRequest: { id: 4, limit: 1, investmentDate: 'Now', fundOrigin: 'Savings' } })),
    );
    const { rerender } = await renderLoaded();
    const staleDecided = mockDecided;

    mockParams.id = '2';
    rerender(<SupportDashboardIssueScreen />);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();
    const callsBefore = mockGetIssueData.mock.calls.length;

    await act(async () => staleDecided?.());
    expect(mockGetIssueData).toHaveBeenCalledTimes(callsBefore);
  });
});

describe('SupportDashboardIssueScreen update form', () => {
  it('ignores an update that finishes or fails after the clerk left the ticket', async () => {
    let resolveUpdate: () => void = () => undefined;
    let rejectUpdate: (e: unknown) => void = () => undefined;
    mockUpdateIssue
      .mockImplementationOnce(() => new Promise<void>((resolve) => (resolveUpdate = resolve)))
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => (rejectUpdate = reject)));
    const { rerender } = await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    mockParams.id = '2';
    rerender(<SupportDashboardIssueScreen />);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();
    const loadsBefore = mockGetIssueData.mock.calls.length;
    await act(async () => resolveUpdate());
    expect(mockGetIssueData).toHaveBeenCalledTimes(loadsBefore);

    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    mockParams.id = '3';
    rerender(<SupportDashboardIssueScreen />);
    expect(await screen.findByText('Ticket 3')).toBeInTheDocument();
    await act(async () => rejectUpdate(new Error('stale update')));

    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update' })).toBeEnabled();
  });

  it('sends the chosen state, department and clerk, including a clerk outside the list', async () => {
    mockGetIssueData.mockResolvedValue(issue(1, { clerk: 'Former Clerk' }));
    await renderLoaded();

    expect(screen.getByRole('option', { name: 'Former Clerk' })).toBeInTheDocument();
    const [stateSelect, departmentSelect, clerkSelect] = screen.getAllByRole('combobox');
    fireEvent.change(stateSelect, { target: { value: 'Completed' } });
    fireEvent.change(departmentSelect, { target: { value: 'Compliance' } });
    fireEvent.change(clerkSelect, { target: { value: 'Tom' } });

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Update' })));

    expect(mockUpdateIssue).toHaveBeenCalledWith(1, { state: 'Completed', department: 'Compliance', clerk: 'Tom' });
  });

  it('sends empty choices as unset', async () => {
    mockGetIssueData.mockResolvedValue(issue(1, { state: '', department: undefined, clerk: undefined }));
    await renderLoaded();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Update' })));

    expect(mockUpdateIssue).toHaveBeenCalledWith(1, { state: undefined, department: undefined, clerk: undefined });
  });

  it('shows the update error, also when it is not an Error', async () => {
    mockUpdateIssue.mockRejectedValueOnce(new Error('No access')).mockRejectedValueOnce('nope');
    await renderLoaded();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Update' })));
    expect(screen.getByTestId('error-hint')).toHaveTextContent('No access');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Update' })));
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Update failed');
  });

  it('keeps the clerk list empty when it cannot be loaded', async () => {
    mockGetClerks.mockRejectedValue(new Error('down'));
    await renderLoaded();

    expect(screen.queryByRole('option', { name: 'Tom' })).not.toBeInTheDocument();
  });

  it('keeps a newer note draft when a stale note panel reports its note as created', async () => {
    const { rerender } = await renderLoaded();

    act(() => mockNoteDraftChange?.({ text: 'draft A' }));
    expect(screen.getByTestId('note-panel')).toHaveTextContent('draft A');
    act(() => mockNoteDraftChange?.(undefined));
    expect(screen.getByTestId('note-panel')).toHaveTextContent('no-draft');

    const staleChange = mockNoteDraftChange;
    mockParams.id = '2';
    rerender(<SupportDashboardIssueScreen />);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();
    act(() => mockNoteDraftChange?.({ text: 'draft B' }));

    act(() => staleChange?.(undefined));
    expect(screen.getByTestId('note-panel')).toHaveTextContent('draft B');
  });
});

describe('SupportDashboardIssueScreen messages', () => {
  it('ignores a load error and messages of a ticket the clerk has left', async () => {
    let rejectIssue: (e: unknown) => void = () => undefined;
    mockGetIssueData.mockImplementationOnce(() => new Promise((_resolve, reject) => (rejectIssue = reject)));
    const { rerender } = render(<SupportDashboardIssueScreen />);
    mockParams.id = '2';
    rerender(<SupportDashboardIssueScreen />);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();
    await act(async () => rejectIssue(new Error('stale load')));
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();

    let resolveMessages: (value: unknown) => void = () => undefined;
    mockGetIssueMessages.mockImplementationOnce(() => new Promise((resolve) => (resolveMessages = resolve)));
    mockParams.id = '3';
    rerender(<SupportDashboardIssueScreen />);
    expect(await screen.findByText('Ticket 3')).toBeInTheDocument();
    mockParams.id = '4';
    rerender(<SupportDashboardIssueScreen />);
    expect(await screen.findByText('Ticket 4')).toBeInTheDocument();
    await act(async () => resolveMessages([{ id: 30, message: 'stale message of ticket 3' }]));

    expect(screen.queryByText('stale message of ticket 3')).not.toBeInTheDocument();
  });

  it.each([
    [new Error('messages down'), 'messages down'],
    [{}, 'Failed to load messages'],
  ])('shows the message load error %#', async (error, expected) => {
    let rejectMessages: (e: unknown) => void = () => undefined;
    mockGetIssueMessages.mockImplementationOnce(() => new Promise((_resolve, reject) => (rejectMessages = reject)));
    await renderLoaded();

    await act(async () => rejectMessages(error));

    expect(screen.getByTestId('error-hint')).toHaveTextContent(expected);
  });

  it('ignores a message load error of a ticket the clerk has left', async () => {
    let rejectA: (e: unknown) => void = () => undefined;
    mockGetIssueMessages.mockImplementation((uid: string) =>
      uid === 'SI-1' ? new Promise((_resolve, reject) => (rejectA = reject)) : Promise.resolve([]),
    );
    const { rerender } = await renderLoaded();

    mockParams.id = '2';
    rerender(<SupportDashboardIssueScreen />);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();
    await act(async () => rejectA(new Error('stale')));

    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('announces new messages on poll and loads them on request', async () => {
    jest.useFakeTimers();
    await renderLoaded();
    expect(await screen.findByText('first message')).toBeInTheDocument();

    mockGetIssueMessages.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    await act(async () => jest.advanceTimersByTime(15000));
    expect(screen.getByRole('button', { name: '1 new message — load' })).toBeInTheDocument();

    mockGetIssueMessages.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]);
    await act(async () => jest.advanceTimersByTime(15000));
    expect(screen.getByRole('button', { name: '2 new messages — load' })).toBeInTheDocument();

    mockGetIssueMessages.mockResolvedValueOnce([
      { id: 1, message: 'first message' },
      { id: 2, message: 'second' },
      { id: 3, message: 'third' },
    ]);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '2 new messages — load' })));
    expect(screen.getByText('third')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new message/ })).not.toBeInTheDocument();

    mockGetIssueMessages.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]);
    await act(async () => jest.advanceTimersByTime(15000));
    expect(screen.queryByRole('button', { name: /new message/ })).not.toBeInTheDocument();
  });

  it('shows a poll error and its fallback', async () => {
    jest.useFakeTimers();
    await renderLoaded();
    expect(await screen.findByText('first message')).toBeInTheDocument();

    mockGetIssueMessages.mockRejectedValueOnce(new Error('poll down'));
    await act(async () => jest.advanceTimersByTime(15000));
    expect(screen.getByTestId('error-hint')).toHaveTextContent('poll down');

    mockGetIssueMessages.mockRejectedValueOnce({});
    await act(async () => jest.advanceTimersByTime(15000));
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Failed to load messages');
  });

  it('polls nothing before the issue is loaded and ignores a poll answer of a ticket the clerk has left', async () => {
    jest.useFakeTimers();
    let resolveIssue: (value: unknown) => void = () => undefined;
    mockGetIssueData.mockImplementationOnce(() => new Promise((resolve) => (resolveIssue = resolve)));
    const { rerender } = render(<SupportDashboardIssueScreen />);
    await act(async () => jest.advanceTimersByTime(15000));
    expect(mockGetIssueMessages).not.toHaveBeenCalled();
    await act(async () => resolveIssue(issue(1)));
    expect(await screen.findByText('first message')).toBeInTheDocument();

    let resolvePoll: (value: unknown) => void = () => undefined;
    let rejectPoll: (e: unknown) => void = () => undefined;
    mockGetIssueMessages
      .mockImplementationOnce(() => new Promise((resolve) => (resolvePoll = resolve)))
      .mockImplementationOnce(() => new Promise((_resolve, reject) => (rejectPoll = reject)));
    await act(async () => jest.advanceTimersByTime(30000));

    mockParams.id = '2';
    mockGetIssueMessages.mockResolvedValue([]);
    rerender(<SupportDashboardIssueScreen />);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();
    await act(async () => {
      resolvePoll([{ id: 1 }, { id: 7 }]);
      rejectPoll(new Error('stale poll'));
    });

    expect(screen.queryByRole('button', { name: /new message/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });
});

describe('SupportDashboardIssueScreen composer', () => {
  it('starts no second send on the shortcut while a send is in flight', async () => {
    mockDraftText = 'hello';
    mockSendMessage.mockReturnValue(new Promise(() => undefined));
    await renderLoaded();
    const textarea = screen.getByPlaceholderText(/Type a message/);

    await act(async () => fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true }));
    await act(async () => fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true }));

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it('finishes a file send after the screen unmounted', async () => {
    let resolveSend: () => void = () => undefined;
    mockSendMessage.mockImplementationOnce(() => new Promise<void>((resolve) => (resolveSend = resolve)));
    const { unmount } = await renderLoaded();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['a'], 'a.pdf')] } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));

    unmount();
    await act(async () => resolveSend());

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it('sends a text message on the shortcut and ignores other keys', async () => {
    mockDraftText = 'hello';
    await renderLoaded();

    const textarea = screen.getByPlaceholderText(/Type a message/);
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(mockSendMessage).not.toHaveBeenCalled();

    await act(async () => fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true }));

    expect(mockClearDraft).toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(1, { author: 'Rita', message: 'hello' });
  });

  it('sends nothing without text or files', async () => {
    await renderLoaded();
    const textarea = screen.getByPlaceholderText(/Type a message/);
    fireEvent.change(textarea, { target: { value: '   ' } });

    await act(async () => fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true }));

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('refuses to send a text with unresolved placeholders', async () => {
    mockDraftText = 'Dear $x';
    await renderLoaded();

    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute(
      'title',
      'Text enthält noch Platzhalter: $x – bitte manuell korrigieren.',
    );
    expect(screen.getByText(/Der Text enthält noch Platzhalter/)).toBeInTheDocument();

    await act(async () =>
      fireEvent.keyDown(screen.getByPlaceholderText(/Type a message/), { key: 'Enter', metaKey: true }),
    );

    expect(screen.getByTestId('error-hint')).toHaveTextContent('unausgefüllte Platzhalter: $x');
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('waits for the staff name before sending', async () => {
    mockDraftText = 'hello';
    mockStaff.isLoading = true;
    await renderLoaded();

    expect(screen.getByTitle('Author')).toHaveTextContent('…');
    await act(async () =>
      fireEvent.keyDown(screen.getByPlaceholderText(/Type a message/), { key: 'Enter', metaKey: true }),
    );

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('refuses to send without a staff name and names the reason', async () => {
    mockDraftText = 'hello';
    mockStaff.name = undefined;
    const { unmount } = await renderLoaded();

    expect(screen.getByTitle('Author')).toHaveTextContent('—');
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Staff name missing');
    await act(async () =>
      fireEvent.keyDown(screen.getByPlaceholderText(/Type a message/), { key: 'Enter', metaKey: true }),
    );
    expect(screen.getAllByTestId('error-hint')[0]).toHaveTextContent('Staff name missing');
    unmount();

    mockStaff.error = 'lookup failed';
    await renderLoaded();
    await act(async () =>
      fireEvent.keyDown(screen.getByPlaceholderText(/Type a message/), { key: 'Enter', metaKey: true }),
    );
    expect(screen.getAllByTestId('error-hint')[0]).toHaveTextContent('Staff name error: lookup failed');
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('attaches files, removes one and sends the rest with the text on the last file', async () => {
    mockDraftText = 'see attached';
    await renderLoaded();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const click = jest.spyOn(input, 'click').mockImplementation(() => undefined);

    fireEvent.click(screen.getByTitle('Attach file'));
    expect(click).toHaveBeenCalled();

    const files = [new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf'), new File(['c'], 'c.pdf')];
    fireEvent.change(input, { target: { files } });
    expect(screen.getByText('c.pdf')).toBeInTheDocument();

    fireEvent.click(within(screen.getByText('b.pdf').parentElement as HTMLElement).getByRole('button'));
    expect(screen.queryByText('b.pdf')).not.toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));

    expect(mockSendMessage).toHaveBeenNthCalledWith(1, 1, {
      author: 'Rita',
      message: undefined,
      file: 'b64-a.pdf',
      fileName: 'a.pdf',
    });
    expect(mockSendMessage).toHaveBeenNthCalledWith(2, 1, {
      author: 'Rita',
      message: 'see attached',
      file: 'b64-c.pdf',
      fileName: 'c.pdf',
    });
    expect(screen.queryByText('a.pdf')).not.toBeInTheDocument();
  });

  it('accepts a file selection without files', async () => {
    await renderLoaded();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: null } });

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('keeps the files not yet sent and the text after a failed send', async () => {
    await renderLoaded();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf')] } });
    mockSendMessage.mockResolvedValueOnce(undefined).mockRejectedValueOnce('broken');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));

    expect(screen.getByTestId('error-hint')).toHaveTextContent('Send failed');
    expect(screen.queryByText('a.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('b.pdf')).toBeInTheDocument();
    expect(mockWriteDraft).toHaveBeenCalledWith('1', '');
  });

  it('restores the text after a failed text send', async () => {
    mockDraftText = 'hello';
    mockSendMessage.mockRejectedValueOnce(new Error('server down'));
    await renderLoaded();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })));

    expect(screen.getByTestId('error-hint')).toHaveTextContent('server down');
    expect(screen.getByPlaceholderText(/Type a message/)).toHaveValue('hello');
  });

  it('inserts a template, waits for a transaction choice when the template needs one, and cancels', async () => {
    mockDraftText = 'Hi';
    await renderLoaded();

    await act(async () => fireEvent.click(screen.getByTitle('Vorlage einfügen')));
    expect(mockGetUserData).toHaveBeenCalledWith(8);
    fireEvent.click(screen.getByRole('button', { name: 'insert-simple' }));
    expect(screen.getByPlaceholderText(/Type a message/)).toHaveValue('Hi\nSimple template');

    fireEvent.click(screen.getByRole('button', { name: 'insert-array' }));
    expect(screen.getByTestId('array-picker')).toHaveAttribute('data-open', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'cancel-array' }));
    expect(screen.getByTestId('array-picker')).toHaveAttribute('data-open', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'select-transaction' }));
    expect(screen.getByPlaceholderText(/Type a message/)).toHaveValue('Hi\nSimple template');

    fireEvent.click(screen.getByRole('button', { name: 'insert-array' }));
    fireEvent.click(screen.getByRole('button', { name: 'select-transaction' }));
    expect(screen.getByPlaceholderText(/Type a message/)).toHaveValue('Hi\nSimple template\nARRAY template #5');

    fireEvent.click(screen.getByRole('button', { name: 'close-picker' }));
    expect(screen.queryByTestId('template-picker')).not.toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByTitle('Vorlage einfügen')));
    expect(mockGetUserData).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('template-picker')).toBeInTheDocument();
  });

  it('inserts a template into an empty composer and takes user data without transactions', async () => {
    mockGetUserData.mockResolvedValue({ userData: { id: 8 } });
    await renderLoaded();

    await act(async () => fireEvent.click(screen.getByTitle('Vorlage einfügen')));
    fireEvent.click(screen.getByRole('button', { name: 'insert-simple' }));

    expect(screen.getByPlaceholderText(/Type a message/)).toHaveValue('Simple template');
  });

  it('shows why the user data for templates could not be loaded', async () => {
    mockGetUserData.mockRejectedValueOnce(new Error('user data down')).mockRejectedValueOnce('nope');
    await renderLoaded();

    await act(async () => fireEvent.click(screen.getByTitle('Vorlage einfügen')));
    expect(screen.getByTestId('error-hint')).toHaveTextContent('user data down');

    await act(async () => fireEvent.click(screen.getByTitle('Vorlage einfügen')));
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Failed to load user data for templates');
    expect(screen.queryByTestId('template-picker')).not.toBeInTheDocument();
  });

  it('ignores a failed user data load of a ticket the clerk has left', async () => {
    let rejectUserData: (e: unknown) => void = () => undefined;
    mockGetUserData.mockImplementationOnce(() => new Promise((_resolve, reject) => (rejectUserData = reject)));
    const { rerender } = await renderLoaded();
    fireEvent.click(screen.getByTitle('Vorlage einfügen'));
    expect(screen.getByTitle('Lade Userdaten...')).toBeDisabled();

    mockParams.id = '2';
    rerender(<SupportDashboardIssueScreen />);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();
    await act(async () => rejectUserData(new Error('stale')));

    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });
});

describe('SupportDashboardIssueScreen file preview', () => {
  const pdf = { data: { type: 'Buffer', data: [1, 2, 3] }, contentType: 'application/pdf' };

  it('opens an attachment, downloads it and closes the preview', async () => {
    mockGetMessageFile.mockResolvedValue(pdf);
    await renderLoaded();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'open-file' })));
    expect(mockGetMessageFile).toHaveBeenCalledWith('SI-1', 99, 'View');
    expect(screen.getByTestId('file-preview')).toHaveTextContent('a.pdf');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'open-file' })));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'download-preview' })));
    expect(mockGetMessageFile).toHaveBeenLastCalledWith('SI-1', 99, 'Download');
    expect(mockSaveBufferedFile).toHaveBeenCalledWith(pdf.data, 'application/pdf', 'a.pdf');

    fireEvent.click(screen.getByRole('button', { name: 'close-preview' }));
    expect(screen.getByTestId('file-preview')).not.toHaveTextContent('a.pdf');
  });

  it('does nothing for a message without a file, and closes or downloads nothing without a preview', async () => {
    await renderLoaded();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'open-no-file' })));
    fireEvent.click(screen.getByRole('button', { name: 'close-preview' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'download-preview' })));

    expect(mockGetMessageFile).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('refuses an attachment that is not a buffer', async () => {
    mockGetMessageFile
      .mockResolvedValueOnce({ data: undefined, contentType: 'x' })
      .mockResolvedValueOnce({ data: { type: 'Other', data: [] }, contentType: 'x' })
      .mockResolvedValueOnce({ data: { type: 'Buffer', data: 'x' }, contentType: 'x' });
    await renderLoaded();

    for (let i = 0; i < 3; i++) {
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'open-file' })));
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Invalid file type');
    }
  });

  it('shows the error of an attachment that cannot be loaded', async () => {
    mockGetMessageFile.mockRejectedValueOnce(new Error('file gone')).mockRejectedValueOnce('nope');
    await renderLoaded();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'open-file' })));
    expect(screen.getByTestId('error-hint')).toHaveTextContent('file gone');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'open-file' })));
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Error loading file');
  });

  it('ignores an attachment answer that a newer request or a ticket change overtook', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    let rejectStale: (e: unknown) => void = () => undefined;
    mockGetMessageFile
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(pdf)
      .mockImplementationOnce(() => new Promise((_resolve, reject) => (rejectStale = reject)));
    const { rerender } = await renderLoaded();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'open-file' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'open-file' })));
    await act(async () => resolveFirst({ data: undefined, contentType: 'x' }));
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'open-file' })));
    mockParams.id = '2';
    rerender(<SupportDashboardIssueScreen />);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();
    await act(async () => rejectStale(new Error('stale')));

    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('refuses a download that is not a buffer and shows a download error', async () => {
    mockGetMessageFile
      .mockResolvedValueOnce(pdf)
      .mockResolvedValueOnce({ data: undefined, contentType: 'x' })
      .mockResolvedValueOnce({ data: { type: 'Other', data: [] }, contentType: 'x' })
      .mockResolvedValueOnce({ data: { type: 'Buffer', data: 'x' }, contentType: 'x' })
      .mockRejectedValueOnce(new Error('download failed'))
      .mockRejectedValueOnce('nope');
    await renderLoaded();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'open-file' })));

    for (const expected of ['Invalid file type', 'Invalid file type', 'Invalid file type', 'download failed']) {
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'download-preview' })));
      expect(screen.getByTestId('error-hint')).toHaveTextContent(expected);
    }
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'download-preview' })));
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Error downloading file');
    expect(mockSaveBufferedFile).not.toHaveBeenCalled();
  });

  it('ignores a download answer of a ticket the clerk has left', async () => {
    let resolveDownload: (value: unknown) => void = () => undefined;
    let rejectDownload: (e: unknown) => void = () => undefined;
    mockGetMessageFile
      .mockResolvedValueOnce(pdf)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveDownload = resolve)))
      .mockResolvedValueOnce(pdf)
      .mockImplementationOnce(() => new Promise((_resolve, reject) => (rejectDownload = reject)));
    const { rerender } = await renderLoaded();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'open-file' })));
    const staleDownload = screen.getByRole('button', { name: 'download-preview' });
    await act(async () => fireEvent.click(staleDownload));

    mockParams.id = '2';
    rerender(<SupportDashboardIssueScreen />);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();
    await act(async () => resolveDownload(pdf));
    expect(mockSaveBufferedFile).not.toHaveBeenCalled();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'open-file' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'download-preview' })));
    mockParams.id = '3';
    rerender(<SupportDashboardIssueScreen />);
    expect(await screen.findByText('Ticket 3')).toBeInTheDocument();
    await act(async () => rejectDownload(new Error('stale')));

    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('revokes the preview URL when the screen unmounts', async () => {
    mockGetMessageFile.mockResolvedValue(pdf);
    const { unmount } = await renderLoaded();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'open-file' })));

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });
});
