// Component tests for the support issue screen: loading and error states, the info panels, the
// update controls, the message composer with its template and file paths, and the reply suggestion
// offered above the composer. The SDK, the screen's hooks and the heavy child components are
// mocked so the screen renders without the app shell; the pure helpers (placeholders, badges,
// message list) stay real, because what they render is part of what these tests assert.

const mockUseAuthContext = jest.fn();
jest.mock('@dfx.swiss/react', () => ({
  useApi: () => ({ call: jest.fn() }),
  useAuthContext: () => mockUseAuthContext(),
  UserRole: { ADMIN: 'Admin', COMPLIANCE: 'Compliance', SUPPORT: 'Support' },
  Department: { SUPPORT: 'Support', COMPLIANCE: 'Compliance', MARKETING: 'Marketing' },
  SupportIssueInternalState: {
    CREATED: 'Created',
    PENDING: 'Pending',
    IN_PROGRESS: 'InProgress',
    COMPLETED: 'Completed',
  },
  TfaLevel: { STRICT: 'Strict' },
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { LG: 'lg' },
  StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

jest.mock('src/components/compliance/file-preview-panel', () => ({
  FilePreviewPanel: ({ preview, onClose }: { preview?: { name: string }; onClose: () => void }) => (
    <div data-testid="file-preview">
      {preview ? <span data-testid="preview-name">{preview.name}</span> : null}
      <button onClick={onClose}>close-preview</button>
    </div>
  ),
}));

jest.mock('src/components/compliance/limit-request-decision-form', () => ({
  LimitRequestDecisionForm: ({ onDecided }: { onDecided: () => void }) => (
    <button onClick={onDecided}>decide-limit-request</button>
  ),
}));

jest.mock('src/components/support-templates/template-picker-modal', () => ({
  TemplatePickerModal: ({ isOpen, onInsert, onClose }: TemplateModalProps) =>
    isOpen ? (
      <div data-testid="template-picker">
        <button onClick={() => onInsert('Hello $userData.id')}>insert-plain</button>
        <button onClick={() => onInsert('Tx $transaction.id')}>insert-array</button>
        <button onClick={onClose}>close-picker</button>
      </div>
    ) : null,
}));

jest.mock('src/components/support-templates/template-array-picker-modal', () => ({
  TemplateArrayPickerModal: ({ isOpen, onSelect, onCancel }: ArrayModalProps) =>
    isOpen ? (
      <div data-testid="array-picker">
        <button onClick={() => onSelect(11)}>pick-transaction</button>
        <button onClick={onCancel}>cancel-array-picker</button>
      </div>
    ) : null,
}));

const mockUseSupportDashboardGuard = jest.fn();
jest.mock('src/hooks/guard.hook', () => ({
  useSupportDashboardGuard: () => mockUseSupportDashboardGuard(),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

const mockNavigate = jest.fn();
jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockHandleSplitDrag = jest.fn();
jest.mock('src/hooks/split-pane.hook', () => ({
  useSplitPane: () => ({ containerRef: { current: null }, splitPercent: 70, handleSplitDrag: mockHandleSplitDrag }),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_key: string, value: string) => value }),
}));

const mockGetUserData = jest.fn();
const mockComplianceHook = { getUserData: mockGetUserData };
jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => mockComplianceHook,
  LimitRequestFinalDecisions: ['Accepted', 'Rejected'],
}));

const mockGetIssueData = jest.fn();
const mockUpdateIssue = jest.fn();
const mockSendMessage = jest.fn();
const mockGetIssueMessages = jest.fn();
const mockGetMessageFile = jest.fn();
const mockGetClerks = jest.fn();
const mockGetReplySuggestion = jest.fn();
const mockAcceptReplySuggestion = jest.fn();
const mockRejectReplySuggestion = jest.fn();
// One stable object, like the real hook's useMemo: a fresh object on every render would change the
// identity of every callback, re-run the effects that depend on them and put the screen into a
// reload loop that no production render ever performs.
const mockDashboard = {
  getIssueData: mockGetIssueData,
  updateIssue: mockUpdateIssue,
  sendMessage: mockSendMessage,
  getIssueMessages: mockGetIssueMessages,
  getMessageFile: mockGetMessageFile,
  getClerks: mockGetClerks,
  getReplySuggestion: mockGetReplySuggestion,
  acceptReplySuggestion: mockAcceptReplySuggestion,
  rejectReplySuggestion: mockRejectReplySuggestion,
};
jest.mock('src/hooks/support-dashboard.hook', () => ({
  ASSIGNABLE_DEPARTMENTS: ['Support', 'Compliance'],
  CustomerAuthor: 'Customer',
  useSupportDashboard: () => mockDashboard,
}));

const mockToBase64 = jest.fn();
jest.mock('src/util/utils', () => ({
  ...jest.requireActual('src/util/utils'),
  toBase64: (file: File) => mockToBase64(file),
}));

// The label maps index SDK enums that the stub above does not carry; the screen renders the raw
// type/reason through them, which is what these tests assert on anyway.
jest.mock('src/config/labels', () => ({
  IssueTypeLabels: {},
  IssueReasonLabels: {},
}));

const mockParams: { id?: string } = { id: '42' };
jest.mock('react-router-dom', () => ({
  useParams: () => mockParams,
}));

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SupportIssueInternalData, SupportMessageInfo, SupportReplySuggestion } from 'src/hooks/support-dashboard.hook';
import SupportDashboardIssueScreen from 'src/screens/support-dashboard-issue.screen';

interface TemplateModalProps {
  isOpen: boolean;
  onInsert: (content: string) => void;
  onClose: () => void;
}

interface ArrayModalProps {
  isOpen: boolean;
  onSelect: (transactionId: number) => void;
  onCancel: () => void;
}

const FULL_ISSUE: SupportIssueInternalData = {
  id: 42,
  created: '2026-08-01T09:00:00.000Z',
  uid: 'issue-uid',
  type: 'TransactionIssue',
  department: 'Compliance',
  reason: 'FundsNotReceived',
  state: 'Pending',
  name: 'Max Muster',
  clerk: 'Alex',
  account: {
    id: 397328,
    status: 'Active',
    verifiedName: 'Max Muster',
    completeName: 'Max Muster',
    accountType: 'Personal',
    kycLevel: '30',
    depositLimit: 100000,
    annualVolume: 5000,
    kycHash: 'hash-1',
    country: { name: 'Switzerland' },
    language: { name: 'German', symbol: 'DE' },
  },
  transaction: {
    id: 7,
    sourceType: 'BankTx',
    type: 'Buy',
    amlCheck: 'Pass',
    amlReason: 'None',
    comment: 'looks fine',
    inputAmount: 100,
    inputAsset: 'EUR',
    outputAmount: 99,
    outputAsset: 'BTC',
    wallet: { name: 'DFX', amlRules: '[]', isKycClient: false },
    isComplete: true,
  },
  limitRequest: { id: 5, limit: 50000, acceptedLimit: 40000, investmentDate: 'Future', fundOrigin: 'Savings', decision: 'Accepted' },
  transactionMissing: { senderIban: 'CH11', receiverIban: 'CH22', date: '2026-07-30T09:00:00.000Z' },
};

// The same ticket with everything optional left out: what the screen renders for a bare generic issue.
const MINIMAL_ISSUE: SupportIssueInternalData = {
  id: 42,
  created: '2026-08-01T09:00:00.000Z',
  uid: 'issue-uid',
  type: 'GenericIssue',
  reason: 'Other',
  state: 'Pending',
  name: 'Max Muster',
  account: {
    id: 397328,
    status: 'Active',
    kycLevel: '20',
    annualVolume: 0,
    kycHash: 'hash-1',
  },
};

const MESSAGES: SupportMessageInfo[] = [
  { id: 1, author: 'Customer', message: 'My money is missing', created: '2026-08-01T09:05:00.000Z' },
  { id: 2, author: 'Alex', message: 'Looking into it', created: '2026-08-01T09:10:00.000Z' },
];

const SUGGESTION: SupportReplySuggestion = {
  id: 3,
  text: 'The transfer arrived, please check again.',
  state: 'Pending',
  messageId: 2,
  isStale: false,
  created: '2026-08-01T09:20:00.000Z',
};

async function renderScreen(): Promise<void> {
  render(<SupportDashboardIssueScreen />);
  await waitFor(() => expect(mockGetClerks).toHaveBeenCalled(), { timeout: 5000 });
  await screen.findByRole('button', { name: 'Update' }, { timeout: 5000 });
  // the thread and the suggestion are fetched once the ticket is in; drain those promise chains so
  // every test starts from a settled screen
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

const composer = (): HTMLTextAreaElement => screen.getByPlaceholderText(/Type a message/) as HTMLTextAreaElement;
const button = (name: string | RegExp): HTMLElement => screen.getByRole('button', { name });

describe('SupportDashboardIssueScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.id = '42';
    mockUseAuthContext.mockReturnValue({ session: { role: 'Admin' } });
    mockGetIssueData.mockResolvedValue(FULL_ISSUE);
    mockGetIssueMessages.mockResolvedValue(MESSAGES);
    // resolved a tick late on purpose: the clerk list always arrives after the ticket, and on CI the
    // gap is wide enough that a test interacting with a clerk dropdown before it is filled sees an
    // empty one — which is exactly the failure this ordering reproduces locally
    mockGetClerks.mockImplementation(
      () => new Promise<string[]>((resolve) => setTimeout(() => resolve(['Alex', 'Robin']), 0)),
    );
    mockGetReplySuggestion.mockResolvedValue(undefined);
    mockUpdateIssue.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue(undefined);
    mockAcceptReplySuggestion.mockResolvedValue(SUGGESTION);
    mockRejectReplySuggestion.mockResolvedValue(SUGGESTION);
    mockGetUserData.mockResolvedValue({ userData: { id: 397328, mail: 'max@example.com' }, transactions: [] });
    mockToBase64.mockResolvedValue('data:application/pdf;base64,AAA');
    global.URL.createObjectURL = jest.fn(() => 'blob:preview');
    global.URL.revokeObjectURL = jest.fn();
  });

  describe('loading and failure', () => {
    it('shows a spinner until the ticket is loaded', () => {
      mockGetIssueData.mockReturnValue(new Promise(() => undefined));

      render(<SupportDashboardIssueScreen />);

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('shows why the ticket could not be loaded', async () => {
      mockGetIssueData.mockRejectedValue(new Error('boom'));

      render(<SupportDashboardIssueScreen />);

      expect(await screen.findByText('boom')).toBeInTheDocument();
    });

    it('falls back to a generic message when the failure carries none', async () => {
      mockGetIssueData.mockRejectedValue({});

      render(<SupportDashboardIssueScreen />);

      expect(await screen.findByText('Unknown error')).toBeInTheDocument();
    });

    it('loads nothing without a ticket id', async () => {
      mockParams.id = undefined;

      render(<SupportDashboardIssueScreen />);

      await waitFor(() => expect(mockGetClerks).toHaveBeenCalled());
      expect(mockGetIssueData).not.toHaveBeenCalled();
      expect(mockGetReplySuggestion).not.toHaveBeenCalled();
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('survives a clerk list that cannot be loaded', async () => {
      mockGetClerks.mockRejectedValue(new Error('no clerks'));

      await renderScreen();

      expect(screen.getByText('Issue Details')).toBeInTheDocument();
    });

    it('reports a message thread that cannot be loaded', async () => {
      mockGetIssueMessages.mockRejectedValue(new Error('thread down'));

      await renderScreen();

      expect(await screen.findByText('thread down')).toBeInTheDocument();
    });

    it('falls back to a generic message when the thread failure carries none', async () => {
      mockGetIssueMessages.mockRejectedValue({});

      await renderScreen();

      expect(await screen.findByText('Failed to load messages')).toBeInTheDocument();
    });
  });

  describe('ticket details', () => {
    it('shows the full ticket, its transaction, limit request and missing transfer', async () => {
      await renderScreen();

      expect(screen.getByText('issue-uid')).toBeInTheDocument();
      expect(screen.getAllByText('Max Muster').length).toBeGreaterThan(0);
      expect(screen.getByText('Transaction')).toBeInTheDocument();
      expect(screen.getByText('looks fine')).toBeInTheDocument();
      expect(screen.getByText('CH11')).toBeInTheDocument();
      expect(screen.getByText('Limit Request')).toBeInTheDocument();
      expect(screen.getByText('Savings')).toBeInTheDocument();
      expect(screen.getByText('German (DE)')).toBeInTheDocument();
    });

    it('shows a bare ticket without the optional panels', async () => {
      mockGetIssueData.mockResolvedValue(MINIMAL_ISSUE);

      await renderScreen();

      expect(screen.queryByText('Transaction')).not.toBeInTheDocument();
      expect(screen.queryByText('Limit Request')).not.toBeInTheDocument();
      expect(screen.queryByText('Transaction Missing')).not.toBeInTheDocument();
      expect(screen.getAllByText('-').length).toBeGreaterThan(0);
    });

    it('leads to the compliance view of the account for compliance staff', async () => {
      await renderScreen();

      fireEvent.click(button('397328'));

      expect(mockNavigate).toHaveBeenCalledWith('/compliance/user/397328');
    });

    it('leads to the support view for a support clerk', async () => {
      mockUseAuthContext.mockReturnValue({ session: { role: 'Support' } });

      await renderScreen();

      fireEvent.click(button('397328'));

      expect(mockNavigate).toHaveBeenCalledWith('/support/user/397328');
      expect(screen.queryByText('decide-limit-request')).not.toBeInTheDocument();
    });

    it('opens the compliance dossier from the compliance row', async () => {
      await renderScreen();

      fireEvent.click(button('Open User'));

      expect(mockNavigate).toHaveBeenCalledWith('/compliance/user/397328');
    });

    it('reloads the ticket after a limit request decision', async () => {
      await renderScreen();

      mockGetIssueData.mockClear();
      fireEvent.click(button('decide-limit-request'));

      await waitFor(() => expect(mockGetIssueData).toHaveBeenCalled());
    });

    it('keeps a non-final decision out of the decided state', async () => {
      mockGetIssueData.mockResolvedValue({
        ...FULL_ISSUE,
        limitRequest: { ...FULL_ISSUE.limitRequest, decision: 'Pending', acceptedLimit: undefined },
      } as SupportIssueInternalData);

      await renderScreen();

      expect(screen.getByText('decide-limit-request')).toBeInTheDocument();
    });
  });

  describe('update controls', () => {
    it('sends the selected state, department and clerk', async () => {
      await renderScreen();

      mockGetIssueData.mockClear();
      fireEvent.change(screen.getByDisplayValue('Pending'), { target: { value: 'InProgress' } });
      fireEvent.click(button('Update'));

      await waitFor(() =>
        expect(mockUpdateIssue).toHaveBeenCalledWith(42, {
          state: 'InProgress',
          department: 'Compliance',
          clerk: 'Alex',
        }),
      );
      await waitFor(() => expect(mockGetIssueData).toHaveBeenCalled());
    });

    it('leaves an unset department and clerk out of the update', async () => {
      mockGetIssueData.mockResolvedValue(MINIMAL_ISSUE);

      await renderScreen();

      fireEvent.click(button('Update'));

      await waitFor(() =>
        expect(mockUpdateIssue).toHaveBeenCalledWith(42, {
          state: 'Pending',
          department: undefined,
          clerk: undefined,
        }),
      );
    });

    it('reassigns the ticket to another department and clerk', async () => {
      await renderScreen();

      // the clerk list arrives after the ticket; without its options a change event on the select is
      // dropped, which is what made this test flaky in CI
      await screen.findAllByRole('option', { name: 'Robin' }, { timeout: 5000 });

      // the update controls in order: state, department, clerk (the fourth select is the composer author)
      const selects = document.querySelectorAll('select');
      fireEvent.change(selects[1], { target: { value: 'Support' } });
      fireEvent.change(selects[2], { target: { value: 'Robin' } });
      fireEvent.click(button('Update'));

      await waitFor(() =>
        expect(mockUpdateIssue).toHaveBeenCalledWith(42, {
          state: 'Pending',
          department: 'Support',
          clerk: 'Robin',
        }),
      );
    });

    it('reports why an update failed', async () => {
      mockUpdateIssue.mockRejectedValue(new Error('update boom'));

      await renderScreen();
      fireEvent.click(button('Update'));

      expect(await screen.findByText('update boom')).toBeInTheDocument();
    });

    it('reports a failure that is not an error object', async () => {
      mockUpdateIssue.mockRejectedValue('nope');

      await renderScreen();
      fireEvent.click(button('Update'));

      expect(await screen.findByText('Update failed')).toBeInTheDocument();
    });
  });

  describe('message thread', () => {
    it('renders the conversation', async () => {
      await renderScreen();

      expect(await screen.findByText('My money is missing')).toBeInTheDocument();
      expect(screen.getByText('Messages (2)')).toBeInTheDocument();
    });

    it('offers to load messages that arrived while the ticket was open', async () => {
      jest.useFakeTimers();
      try {
        await renderScreen();
        mockGetIssueMessages.mockResolvedValue([
          ...MESSAGES,
          { id: 3, author: 'Customer', message: 'Any news?', created: '2026-08-01T09:30:00.000Z' },
        ]);

        await act(async () => {
          jest.advanceTimersByTime(15000);
          await Promise.resolve();
          await Promise.resolve();
        });

        fireEvent.click(button(/1 new message — load/));
        await waitFor(() => expect(screen.getByText('Any news?')).toBeInTheDocument());
      } finally {
        jest.useRealTimers();
      }
    });

    it('stays quiet while polling finds nothing new', async () => {
      jest.useFakeTimers();
      try {
        await renderScreen();

        await act(async () => {
          jest.advanceTimersByTime(15000);
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(screen.queryByText(/new message/)).not.toBeInTheDocument();
      } finally {
        jest.useRealTimers();
      }
    });

    it('falls back to a generic message when a failing poll carries none', async () => {
      jest.useFakeTimers();
      try {
        await renderScreen();
        mockGetIssueMessages.mockRejectedValue({});

        await act(async () => {
          jest.advanceTimersByTime(15000);
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(screen.getByText('Failed to load messages')).toBeInTheDocument();
      } finally {
        jest.useRealTimers();
      }
    });

    it('reports a failing poll', async () => {
      jest.useFakeTimers();
      try {
        await renderScreen();
        mockGetIssueMessages.mockRejectedValue(new Error('poll boom'));

        await act(async () => {
          jest.advanceTimersByTime(15000);
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(screen.getByText('poll boom')).toBeInTheDocument();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('sending a reply', () => {
    it('sends the typed text under the selected author', async () => {
      await renderScreen();

      fireEvent.change(composer(), { target: { value: 'On its way' } });
      fireEvent.click(button('Send'));

      await waitFor(() => expect(mockSendMessage).toHaveBeenCalledWith(42, { author: 'Alex', message: 'On its way' }));
      await waitFor(() => expect(composer().value).toEqual(''));
    });

    it('sends on Enter and keeps typing on Shift+Enter', async () => {
      await renderScreen();

      fireEvent.change(composer(), { target: { value: 'Enter sends' } });
      fireEvent.keyDown(composer(), { key: 'Enter', shiftKey: true });
      expect(mockSendMessage).not.toHaveBeenCalled();

      fireEvent.keyDown(composer(), { key: 'Enter' });
      await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1));
    });

    it('ignores an empty message', async () => {
      await renderScreen();

      fireEvent.keyDown(composer(), { key: 'Enter' });

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('sends attachments, with the text on the last one', async () => {
      await renderScreen();

      const first = new File(['a'], 'a.pdf', { type: 'application/pdf' });
      const second = new File(['b'], 'b.pdf', { type: 'application/pdf' });
      fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [first, second] } });
      fireEvent.change(composer(), { target: { value: 'See attached' } });
      fireEvent.click(button('Send'));

      await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(2));
      expect(mockSendMessage).toHaveBeenNthCalledWith(1, 42, {
        author: 'Alex',
        message: undefined,
        file: 'data:application/pdf;base64,AAA',
        fileName: 'a.pdf',
      });
      expect(mockSendMessage).toHaveBeenNthCalledWith(2, 42, {
        author: 'Alex',
        message: 'See attached',
        file: 'data:application/pdf;base64,AAA',
        fileName: 'b.pdf',
      });
    });

    it('sends under another clerk name', async () => {
      await renderScreen();
      await screen.findAllByRole('option', { name: 'Robin' }, { timeout: 5000 });

      fireEvent.change(screen.getByTitle('Author'), { target: { value: 'Robin' } });
      fireEvent.change(composer(), { target: { value: 'On its way' } });
      fireEvent.click(button('Send'));

      await waitFor(() => expect(mockSendMessage).toHaveBeenCalledWith(42, { author: 'Robin', message: 'On its way' }));
    });

    it('keeps a picked author when the ticket arrives again', async () => {
      // the ticket carries no clerk at first, so the default is the first of the list; the reload
      // delivers one, which re-runs the effect that resolves the default author
      mockGetIssueData.mockResolvedValueOnce({ ...FULL_ISSUE, clerk: undefined } as SupportIssueInternalData);

      await renderScreen();
      await screen.findAllByRole('option', { name: 'Robin' }, { timeout: 5000 });
      fireEvent.change(screen.getByTitle('Author'), { target: { value: 'Robin' } });

      fireEvent.click(button('Update'));

      // the reloaded ticket is in once the clerk control shows its clerk — the default-author effect
      // has run by then, and must have left the pick alone
      await waitFor(() =>
        expect((document.querySelectorAll('select')[2] as HTMLSelectElement).value).toEqual('Alex'),
      );
      expect((screen.getByTitle('Author') as HTMLSelectElement).value).toEqual('Robin');
    });

    it('opens the file dialog from the attach button', async () => {
      await renderScreen();

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const click = jest.spyOn(fileInput, 'click').mockImplementation(() => undefined);

      fireEvent.click(screen.getByTitle('Attach file'));

      expect(click).toHaveBeenCalled();
    });

    it('ignores a file dialog that was closed without a selection', async () => {
      await renderScreen();

      fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: null } });

      expect(button('Send')).toBeDisabled();
    });

    it('drops an attachment again before sending', async () => {
      await renderScreen();

      const file = new File(['a'], 'a.pdf', { type: 'application/pdf' });
      fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });

      expect(screen.getByText('a.pdf')).toBeInTheDocument();
      fireEvent.click(button('×'));
      expect(screen.queryByText('a.pdf')).not.toBeInTheDocument();
    });

    it('refuses to send a text that still carries placeholders', async () => {
      await renderScreen();

      fireEvent.change(composer(), { target: { value: 'Hello $userData.id' } });

      expect(button('Send')).toBeDisabled();
      expect(screen.getByText(/enthält noch Platzhalter/)).toBeInTheDocument();
    });

    it('refuses the send that Enter would trigger for a text with placeholders', async () => {
      await renderScreen();

      fireEvent.change(composer(), { target: { value: 'Hello $userData.id' } });
      fireEvent.keyDown(composer(), { key: 'Enter' });

      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(await screen.findByText(/Senden nicht möglich/)).toBeInTheDocument();
    });

    it('reports why sending failed', async () => {
      mockSendMessage.mockRejectedValue(new Error('send boom'));

      await renderScreen();
      fireEvent.change(composer(), { target: { value: 'Hi' } });
      fireEvent.click(button('Send'));

      expect(await screen.findByText('send boom')).toBeInTheDocument();
    });

    it('reports a send failure that is not an error object', async () => {
      mockSendMessage.mockRejectedValue('nope');

      await renderScreen();
      fireEvent.change(composer(), { target: { value: 'Hi' } });
      fireEvent.click(button('Send'));

      expect(await screen.findByText('Send failed')).toBeInTheDocument();
    });
  });

  describe('templates', () => {
    it('inserts a resolved template into the composer', async () => {
      await renderScreen();

      fireEvent.click(button('Vorlage einfügen'));
      await screen.findByTestId('template-picker');
      fireEvent.click(button('insert-plain'));

      await waitFor(() => expect(composer().value).toEqual('Hello 397328'));
      expect(mockGetUserData).toHaveBeenCalledWith(397328);
    });

    it('appends a second template below the first', async () => {
      await renderScreen();

      fireEvent.change(composer(), { target: { value: 'Hi' } });
      fireEvent.click(button('Vorlage einfügen'));
      await screen.findByTestId('template-picker');
      fireEvent.click(button('insert-plain'));

      await waitFor(() => expect(composer().value).toEqual('Hi\nHello 397328'));
    });

    it('reuses the account data it already loaded', async () => {
      await renderScreen();

      fireEvent.click(button('Vorlage einfügen'));
      await screen.findByTestId('template-picker');
      fireEvent.click(button('close-picker'));
      fireEvent.click(button('Vorlage einfügen'));
      await screen.findByTestId('template-picker');

      expect(mockGetUserData).toHaveBeenCalledTimes(1);
    });

    it('asks which transaction a template refers to when there is more than one', async () => {
      mockGetUserData.mockResolvedValue({
        userData: { id: 397328 },
        transactions: [{ id: 11 }, { id: 12 }],
      });

      await renderScreen();
      fireEvent.click(button('Vorlage einfügen'));
      await screen.findByTestId('template-picker');
      fireEvent.click(button('insert-array'));

      fireEvent.click(await screen.findByText('pick-transaction'));

      await waitFor(() => expect(composer().value).toEqual('Tx 11'));
    });

    it('drops a template whose transaction is not picked', async () => {
      mockGetUserData.mockResolvedValue({ userData: { id: 397328 }, transactions: [{ id: 11 }, { id: 12 }] });

      await renderScreen();
      fireEvent.click(button('Vorlage einfügen'));
      await screen.findByTestId('template-picker');
      fireEvent.click(button('insert-array'));
      fireEvent.click(await screen.findByText('cancel-array-picker'));

      expect(screen.queryByTestId('array-picker')).not.toBeInTheDocument();
      expect(composer().value).toEqual('');
    });

    it('treats a response without transactions as none', async () => {
      mockGetUserData.mockResolvedValue({ userData: { id: 397328 } });

      await renderScreen();
      fireEvent.click(button('Vorlage einfügen'));
      await screen.findByTestId('template-picker');
      fireEvent.click(button('insert-array'));

      await waitFor(() => expect(composer().value).toEqual('Tx $transaction.id'));
    });

    it('reports why the account data for templates could not be loaded', async () => {
      mockGetUserData.mockRejectedValue(new Error('userdata boom'));

      await renderScreen();
      fireEvent.click(button('Vorlage einfügen'));

      expect(await screen.findByText('userdata boom')).toBeInTheDocument();
    });

    it('reports a template load failure that is not an error object', async () => {
      mockGetUserData.mockRejectedValue('nope');

      await renderScreen();
      fireEvent.click(button('Vorlage einfügen'));

      expect(await screen.findByText('Failed to load user data for templates')).toBeInTheDocument();
    });

    it('does not offer templates for a ticket without an account', async () => {
      mockGetIssueData.mockResolvedValue({
        ...MINIMAL_ISSUE,
        account: { ...MINIMAL_ISSUE.account, id: undefined },
      } as unknown as SupportIssueInternalData);

      await renderScreen();

      expect(button('Vorlage einfügen')).toBeDisabled();
    });
  });

  describe('attachments', () => {
    it('opens an attachment in the preview and closes it again', async () => {
      mockGetIssueMessages.mockResolvedValue([
        { id: 1, author: 'Customer', message: 'Receipt', fileName: 'receipt.pdf', created: '2026-08-01T09:05:00.000Z' },
      ]);
      mockGetMessageFile.mockResolvedValue({
        data: { type: 'Buffer', data: [1, 2, 3] },
        contentType: 'application/pdf',
      });

      await renderScreen();
      fireEvent.click(await screen.findByRole('button', { name: 'receipt.pdf' }));

      expect(await screen.findByTestId('preview-name')).toHaveTextContent('receipt.pdf');

      fireEvent.click(button('close-preview'));
      expect(screen.queryByTestId('preview-name')).not.toBeInTheDocument();
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    });

    it('replaces a preview that is already open', async () => {
      mockGetIssueMessages.mockResolvedValue([
        { id: 1, author: 'Customer', fileName: 'first.pdf', created: '2026-08-01T09:05:00.000Z' },
        { id: 2, author: 'Customer', fileName: 'second.pdf', created: '2026-08-01T09:06:00.000Z' },
      ]);
      mockGetMessageFile.mockResolvedValue({
        data: { type: 'Buffer', data: [1] },
        contentType: 'application/pdf',
      });

      await renderScreen();
      fireEvent.click(await screen.findByRole('button', { name: 'first.pdf' }));
      await screen.findByTestId('preview-name');
      fireEvent.click(button('second.pdf'));

      await waitFor(() => expect(screen.getByTestId('preview-name')).toHaveTextContent('second.pdf'));
      expect(global.URL.revokeObjectURL).toHaveBeenCalled();
    });

    it('rejects a file the API did not return as a buffer', async () => {
      mockGetIssueMessages.mockResolvedValue([
        { id: 1, author: 'Customer', fileName: 'broken.pdf', created: '2026-08-01T09:05:00.000Z' },
      ]);
      mockGetMessageFile.mockResolvedValue({ data: { type: 'Text', data: 'x' }, contentType: 'text/plain' });

      await renderScreen();
      fireEvent.click(await screen.findByRole('button', { name: 'broken.pdf' }));

      expect(await screen.findByText('Invalid file type')).toBeInTheDocument();
    });

    it('reports why an attachment could not be loaded', async () => {
      mockGetIssueMessages.mockResolvedValue([
        { id: 1, author: 'Customer', fileName: 'gone.pdf', created: '2026-08-01T09:05:00.000Z' },
      ]);
      mockGetMessageFile.mockRejectedValue(new Error('file boom'));

      await renderScreen();
      fireEvent.click(await screen.findByRole('button', { name: 'gone.pdf' }));

      expect(await screen.findByText('file boom')).toBeInTheDocument();
    });

    it('reports an attachment failure that is not an error object', async () => {
      mockGetIssueMessages.mockResolvedValue([
        { id: 1, author: 'Customer', fileName: 'gone.pdf', created: '2026-08-01T09:05:00.000Z' },
      ]);
      mockGetMessageFile.mockRejectedValue('nope');

      await renderScreen();
      fireEvent.click(await screen.findByRole('button', { name: 'gone.pdf' }));

      expect(await screen.findByText('Error loading file')).toBeInTheDocument();
    });
  });

  describe('reply suggestion', () => {
    it('offers the suggestion that awaits a decision', async () => {
      mockGetReplySuggestion.mockResolvedValue(SUGGESTION);

      await renderScreen();

      expect(await screen.findByText('Suggested reply')).toBeInTheDocument();
      expect(screen.getByText(SUGGESTION.text)).toBeInTheDocument();
      expect(mockGetReplySuggestion).toHaveBeenCalledWith(42);
    });

    it('shows nothing when none awaits a decision', async () => {
      await renderScreen();

      expect(screen.queryByText('Suggested reply')).not.toBeInTheDocument();
    });

    it('turns an accepted suggestion into the clerk own draft', async () => {
      mockGetReplySuggestion.mockResolvedValue(SUGGESTION);

      await renderScreen();
      fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));

      await waitFor(() => expect(mockAcceptReplySuggestion).toHaveBeenCalledWith(42, 3));
      await waitFor(() => expect(composer().value).toEqual(SUGGESTION.text));
      expect(screen.queryByText('Suggested reply')).not.toBeInTheDocument();
    });

    it('appends an accepted suggestion below what the clerk already wrote', async () => {
      mockGetReplySuggestion.mockResolvedValue(SUGGESTION);

      await renderScreen();
      await screen.findByText('Suggested reply');
      fireEvent.change(composer(), { target: { value: 'Hi Max' } });
      fireEvent.click(button('Accept'));

      await waitFor(() => expect(composer().value).toEqual(`Hi Max\n${SUGGESTION.text}`));
    });

    it('records a discarded suggestion and leaves the composer alone', async () => {
      mockGetReplySuggestion.mockResolvedValue(SUGGESTION);

      await renderScreen();
      fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));

      await waitFor(() => expect(mockRejectReplySuggestion).toHaveBeenCalledWith(42, 3));
      await waitFor(() => expect(screen.queryByText('Suggested reply')).not.toBeInTheDocument());
      expect(composer().value).toEqual('');
    });

    it('picks up a suggestion that arrives while the ticket is open', async () => {
      jest.useFakeTimers();
      try {
        await renderScreen();
        mockGetReplySuggestion.mockResolvedValue(SUGGESTION);

        await act(async () => {
          jest.advanceTimersByTime(15000);
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(screen.getByText('Suggested reply')).toBeInTheDocument();
      } finally {
        jest.useRealTimers();
      }
    });

    it('reports why the suggestion could not be loaded', async () => {
      mockGetReplySuggestion.mockRejectedValue(new Error('suggestion boom'));

      await renderScreen();

      expect(await screen.findByText('suggestion boom')).toBeInTheDocument();
    });

    it('falls back to a generic message when the load failure carries none', async () => {
      mockGetReplySuggestion.mockRejectedValue({});

      await renderScreen();

      expect(await screen.findByText('Failed to load reply suggestion')).toBeInTheDocument();
    });

    it('reports why a decision could not be recorded', async () => {
      mockGetReplySuggestion.mockResolvedValue(SUGGESTION);
      mockAcceptReplySuggestion.mockRejectedValue(new Error('decision boom'));

      await renderScreen();
      fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));

      expect(await screen.findByText('decision boom')).toBeInTheDocument();
      expect(screen.getByText('Suggested reply')).toBeInTheDocument();
    });

    it('reports a decision failure that is not an error object', async () => {
      mockGetReplySuggestion.mockResolvedValue(SUGGESTION);
      mockRejectReplySuggestion.mockRejectedValue('nope');

      await renderScreen();
      fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));

      expect(await screen.findByText('Suggestion update failed')).toBeInTheDocument();
    });
  });

  // The states a ticket reaches when fields the API marks optional are actually absent, and the
  // paths the screen only takes on the second click or on the way out.
  describe('sparse data and second passes', () => {
    it('loads and polls no thread for a ticket without a uid', async () => {
      jest.useFakeTimers();
      try {
        mockGetIssueData.mockResolvedValue({ ...FULL_ISSUE, uid: undefined } as unknown as SupportIssueInternalData);

        render(<SupportDashboardIssueScreen />);
        await waitFor(() => expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument(), {
          timeout: 5000,
        });

        await act(async () => {
          jest.advanceTimersByTime(15000);
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(mockGetIssueMessages).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('blocks the template button while the account data is still loading', async () => {
      mockGetUserData.mockReturnValue(new Promise(() => undefined));

      await renderScreen();
      fireEvent.click(screen.getByTitle('Vorlage einfügen'));

      await waitFor(() => expect(screen.getByTitle('Lade Userdaten...')).toBeDisabled());
      expect(mockGetUserData).toHaveBeenCalledTimes(1);
    });

    it('leaves an empty state out of the update', async () => {
      mockGetIssueData.mockResolvedValue({ ...MINIMAL_ISSUE, state: '' } as SupportIssueInternalData);

      await renderScreen();
      fireEvent.click(button('Update'));

      await waitFor(() =>
        expect(mockUpdateIssue).toHaveBeenCalledWith(42, { state: undefined, department: undefined, clerk: undefined }),
      );
    });

    it('sends an attachment without a text', async () => {
      await renderScreen();

      const file = new File(['a'], 'a.pdf', { type: 'application/pdf' });
      fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
      fireEvent.click(button('Send'));

      await waitFor(() =>
        expect(mockSendMessage).toHaveBeenCalledWith(42, {
          author: 'Alex',
          message: undefined,
          file: 'data:application/pdf;base64,AAA',
          fileName: 'a.pdf',
        }),
      );
    });

    it('renders a language without a symbol, unpriced amounts and an incomplete transaction', async () => {
      mockGetIssueData.mockResolvedValue({
        ...FULL_ISSUE,
        account: { ...FULL_ISSUE.account, language: { name: 'German' } },
        transaction: {
          ...FULL_ISSUE.transaction,
          inputAsset: undefined,
          outputAsset: undefined,
          isComplete: false,
        },
        limitRequest: { ...FULL_ISSUE.limitRequest, decision: undefined },
      } as SupportIssueInternalData);

      await renderScreen();

      expect(screen.getByText('German')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('No')).toBeInTheDocument();
    });

    it('offers the limit request decision for a ticket nobody has taken yet', async () => {
      mockGetIssueData.mockResolvedValue({
        ...FULL_ISSUE,
        clerk: undefined,
        limitRequest: { ...FULL_ISSUE.limitRequest, decision: undefined },
      } as SupportIssueInternalData);

      await renderScreen();

      expect(screen.getByText('decide-limit-request')).toBeInTheDocument();
    });

    it('counts more than one new message in the plural', async () => {
      jest.useFakeTimers();
      try {
        await renderScreen();
        mockGetIssueMessages.mockResolvedValue([
          ...MESSAGES,
          { id: 3, author: 'Customer', message: 'Any news?', created: '2026-08-01T09:30:00.000Z' },
          { id: 4, author: 'Customer', message: 'Still waiting', created: '2026-08-01T09:31:00.000Z' },
        ]);

        await act(async () => {
          jest.advanceTimersByTime(15000);
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(screen.getByRole('button', { name: /2 new messages — load/ })).toBeInTheDocument();
      } finally {
        jest.useRealTimers();
      }
    });

    it('has nothing to release when the preview is closed without one open', async () => {
      await renderScreen();

      fireEvent.click(button('close-preview'));

      expect(global.URL.revokeObjectURL).not.toHaveBeenCalled();
    });

    it('has nothing to release when the screen goes away without a preview', async () => {
      const { unmount } = render(<SupportDashboardIssueScreen />);
      await screen.findByRole('button', { name: 'Update' }, { timeout: 5000 });

      unmount();

      expect(global.URL.revokeObjectURL).not.toHaveBeenCalled();
    });

    it('releases an open preview when the screen goes away', async () => {
      mockGetIssueMessages.mockResolvedValue([
        { id: 1, author: 'Customer', fileName: 'receipt.pdf', created: '2026-08-01T09:05:00.000Z' },
      ]);
      mockGetMessageFile.mockResolvedValue({ data: { type: 'Buffer', data: [1] }, contentType: 'application/pdf' });

      const { unmount } = render(<SupportDashboardIssueScreen />);
      await screen.findByRole('button', { name: 'Update' }, { timeout: 5000 });
      fireEvent.click(await screen.findByRole('button', { name: 'receipt.pdf' }));
      await screen.findByTestId('preview-name');

      unmount();

      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    });
  });

  it('lets the split between conversation and preview be dragged', async () => {
    await renderScreen();

    fireEvent.mouseDown(document.querySelector('.cursor-col-resize'));

    expect(mockHandleSplitDrag).toHaveBeenCalled();
  });

  it('picks the clerk of the ticket as the message author when it is a known clerk', async () => {
    await renderScreen();

    const authorSelect = screen.getByTitle('Author') as HTMLSelectElement;
    expect(authorSelect.value).toEqual('Alex');
    expect(within(authorSelect).getAllByRole('option')).toHaveLength(2);
  });

  it('falls back to the first clerk for a ticket whose clerk is unknown', async () => {
    mockGetIssueData.mockResolvedValue({ ...FULL_ISSUE, clerk: 'Someone else' } as SupportIssueInternalData);

    await renderScreen();

    expect((screen.getByTitle('Author') as HTMLSelectElement).value).toEqual('Alex');
  });

  it('leaves the author empty when there is no clerk at all', async () => {
    mockGetClerks.mockResolvedValue([]);
    mockGetIssueData.mockResolvedValue(MINIMAL_ISSUE);

    await renderScreen();

    expect((screen.getByTitle('Author') as HTMLSelectElement).value).toEqual('');
  });
});
