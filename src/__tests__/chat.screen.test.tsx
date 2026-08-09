// Component tests for the customer support chat screen (src/screens/chat.screen.tsx).
// Mirrors the mock pattern of support-issue-receiver-iban.test.tsx: full object-literal
// factories for @dfx.swiss/react and @dfx.swiss/react-components (no requireActual).

const mockNavigate = jest.fn();
const mockLoadSupportIssue = jest.fn();
const mockSetSync = jest.fn();
const mockSubmitMessage = jest.fn();
const mockLoadFileData = jest.fn();
const mockGetTransactionByUid = jest.fn();
const mockTranslate = jest.fn((_ns: string, key: string) => key);
const mockTranslateError = jest.fn((message: string) => message);
const mockSupportIssueUidGet = jest.fn();
const mockSupportIssueUidSet = jest.fn();
const mockUseLayoutOptions = jest.fn();

let mockSupportIssue: any;
let mockIsLoading = false;
let mockIssueUidParam: string | undefined;

jest.mock('@dfx.swiss/react', () => {
  const SupportMessageStatus = {
    SENT: 'Sent',
    RECEIVED: 'Received',
    FAILED: 'Failed',
  };

  const SupportIssueType = {
    GENERIC_ISSUE: 'GenericIssue',
    TRANSACTION_ISSUE: 'TransactionIssue',
    VERIFICATION_CALL: 'VerificationCall',
    KYC_ISSUE: 'KycIssue',
    LIMIT_REQUEST: 'LimitRequest',
    PARTNERSHIP_REQUEST: 'PartnershipRequest',
    NOTIFICATION_OF_CHANGES: 'NotificationOfChanges',
    BUG_REPORT: 'BugReport',
  };

  const TransactionState = {
    UNASSIGNED: 'Unassigned',
    WAITING_FOR_PAYMENT: 'WaitingForPayment',
    CREATED: 'Created',
    PROCESSING: 'Processing',
    COMPLETED: 'Completed',
    FAILED: 'Failed',
  };

  const TransactionType = {
    BUY: 'Buy',
    SELL: 'Sell',
    SWAP: 'Swap',
  };

  return {
    SupportMessageStatus,
    SupportIssueType,
    SupportIssueReason: {},
    SupportIssueState: { PENDING: 'Pending' },
    TransactionState,
    TransactionType,
    Department: {
      SUPPORT: 'Support',
      COMPLIANCE: 'Compliance',
      MARKETING: 'Marketing',
      COOPERATION: 'Cooperation',
    },
    UserRole: {
      ADMIN: 'Admin',
      SUPPORT: 'Support',
      COMPLIANCE: 'Compliance',
      MARKETING: 'Marketing',
      CUSTODY: 'Custody',
    },
    useSupportChatContext: () => ({
      supportIssue: mockSupportIssue,
      isLoading: mockIsLoading,
      loadSupportIssue: mockLoadSupportIssue,
      setSync: mockSetSync,
      submitMessage: mockSubmitMessage,
      loadFileData: mockLoadFileData,
    }),
    useTransaction: () => ({
      getTransactionByUid: mockGetTransactionByUid,
    }),
  };
});

jest.mock('@dfx.swiss/react-components', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');

  return {
    AssetIconVariant: { BTC: 'BTC', ETH: 'ETH', USDT: 'USDT' },
    DfxAssetIcon: ({ asset }: any) => React.createElement('div', { 'data-testid': `asset-icon-${asset}` }),
    DfxIcon: () => React.createElement('div', { 'data-testid': 'dfx-icon-help' }),
    IconSize: { LG: 'lg' },
    IconVariant: { HELP: 'help' },
    SpinnerSize: { LG: 'lg', MD: 'md' },
    SpinnerVariant: { LIGHT_MODE: 'light' },
    StyledCollapsible: ({ titleContent, children }: any) =>
      React.createElement('div', { 'data-testid': 'tx-collapsible' }, titleContent, children),
    StyledLoadingSpinner: () => React.createElement('div', { 'data-testid': 'loading-spinner' }),
    StyledVerticalStack: ({ children }: any) => React.createElement('div', null, children),
  };
});

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (ns: string, key: string) => mockTranslate(ns, key),
    translateError: (message: string) => mockTranslateError(message),
    locale: 'en-US',
  }),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  // Capture options so onBack (chat.screen.tsx) can be exercised without the layout shell.
  useLayoutOptions: (options: unknown) => mockUseLayoutOptions(options),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

jest.mock('src/hooks/session-store.hook', () => ({
  useSessionStore: () => ({
    supportIssueUid: {
      get: () => mockSupportIssueUidGet(),
      set: (v: string) => mockSupportIssueUidSet(v),
      remove: jest.fn(),
    },
  }),
}));

jest.mock('src/screens/transaction.screen', () => ({
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  TxInfo: () => require('react').createElement('div', { 'data-testid': 'tx-info' }),
}));

jest.mock('src/config/labels', () => ({
  IssueTypeLabels: {
    GenericIssue: 'Generic issue',
    TransactionIssue: 'Transaction issue',
  },
  toPaymentStateLabel: (state: string) => `label-${state}`,
}));

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: mockIssueUidParam }),
  };
});

import { SupportMessageStatus } from '@dfx.swiss/react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ChatScreen from 'src/screens/chat.screen';

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    author: 'Customer',
    created: new Date(2024, 6, 10, 14, 30),
    message: 'Hello from customer',
    status: SupportMessageStatus.RECEIVED,
    ...overrides,
  };
}

function makeIssue(overrides: Record<string, unknown> = {}) {
  return {
    uid: 'issue-uid-1',
    state: 'Pending',
    type: 'GenericIssue',
    reason: 'Other',
    name: 'Test',
    created: new Date(2024, 6, 10),
    messages: [makeMessage()],
    ...overrides,
  };
}

function renderChat() {
  return render(<ChatScreen />);
}

describe('ChatScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockIsLoading = false;
    mockIssueUidParam = undefined;
    mockSupportIssue = makeIssue();
    mockSupportIssueUidGet.mockReturnValue('issue-uid-1');
    mockLoadSupportIssue.mockResolvedValue(undefined);
    mockSubmitMessage.mockResolvedValue(undefined);
    mockLoadFileData.mockResolvedValue(undefined);
    mockGetTransactionByUid.mockReset();
    mockTranslate.mockImplementation((_ns: string, key: string) => key);
    mockTranslateError.mockImplementation((message: string) => message);
    Element.prototype.scrollIntoView = jest.fn();
    // Default: motion allowed so later scrolls can use smooth.
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    // Image attachment previews
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-preview');
    global.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  // --- Screen shell / routing ---

  it('shows a loading spinner while the issue is loading', () => {
    mockIsLoading = true;
    mockSupportIssue = undefined;
    renderChat();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('shows a loading spinner when there is no support issue yet', () => {
    mockSupportIssue = undefined;
    renderChat();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('loads the session issue and enables sync when a stored uid is present', async () => {
    renderChat();
    await waitFor(() => {
      expect(mockSetSync).toHaveBeenCalledWith(true);
      expect(mockLoadSupportIssue).toHaveBeenCalledWith('issue-uid-1');
    });
  });

  it('navigates to the issue form when no session uid is available', async () => {
    mockSupportIssueUidGet.mockReturnValue(undefined);
    mockSupportIssue = undefined;
    renderChat();
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/support/issue', { replace: true });
    });
  });

  it('stores the route param uid and replaces the URL', async () => {
    mockIssueUidParam = 'param-uid-9';
    mockSupportIssueUidGet.mockReturnValue(undefined);
    mockSupportIssue = undefined;
    renderChat();
    await waitFor(() => {
      expect(mockSupportIssueUidSet).toHaveBeenCalledWith('param-uid-9');
      expect(mockNavigate).toHaveBeenCalledWith('/support/chat', { replace: true });
    });
  });

  it('redirects to the issue form when loadSupportIssue rejects', async () => {
    mockLoadSupportIssue.mockRejectedValue(new Error('not found'));
    mockSupportIssue = undefined;
    renderChat();
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/support/issue', { replace: true });
    });
  });

  it('disables sync on unmount', async () => {
    const { unmount } = renderChat();
    await waitFor(() => expect(mockSetSync).toHaveBeenCalledWith(true));
    unmount();
    expect(mockSetSync).toHaveBeenCalledWith(false);
  });

  it('registers an onBack handler that navigates to the tickets list', () => {
    renderChat();
    expect(mockUseLayoutOptions).toHaveBeenCalled();
    const options = mockUseLayoutOptions.mock.calls[mockUseLayoutOptions.mock.calls.length - 1][0] as {
      onBack?: () => void;
    };
    expect(options.onBack).toEqual(expect.any(Function));
    options.onBack?.();
    expect(mockNavigate).toHaveBeenCalledWith('/support/tickets');
  });

  it('scrolls to the latest message when messages are present', async () => {
    renderChat();
    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });

  it('jumps without animation on the first scroll, then uses smooth for later messages', async () => {
    const scrollIntoView = Element.prototype.scrollIntoView as jest.Mock;
    const { rerender } = renderChat();
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'auto' });

    // Second open with a longer thread — same mount so hasScrolledToEndRef stays true.
    mockSupportIssue = makeIssue({
      messages: [makeMessage({ id: 1, message: 'First' }), makeMessage({ id: 2, message: 'Second' })],
    });
    rerender(<ChatScreen />);
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'smooth' });
    });
  });

  it('always uses auto scroll when the user prefers reduced motion', async () => {
    (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    const scrollIntoView = Element.prototype.scrollIntoView as jest.Mock;
    const { rerender } = renderChat();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'auto' });

    mockSupportIssue = makeIssue({
      messages: [makeMessage({ id: 1, message: 'First' }), makeMessage({ id: 2, message: 'Second' })],
    });
    rerender(<ChatScreen />);
    await waitFor(() => {
      expect(scrollIntoView.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'auto' });
  });

  // --- B2 DFX colours ---

  it('styles the customer bubble with dfxBlue-800 and the support bubble with dfxGray-300', () => {
    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({ id: 1, author: 'Customer', message: 'Customer text' }),
        makeMessage({ id: 2, author: 'Support Agent', message: 'Support text', status: undefined }),
      ],
    });
    renderChat();

    const customerText = screen.getByText('Customer text');
    const supportText = screen.getByText('Support text');
    const customerBubble = customerText.closest('div.flex.flex-col.max-w-xs');
    const supportBubble = supportText.closest('div.flex.flex-col.max-w-xs');

    expect(customerBubble).toHaveClass('bg-dfxBlue-800');
    expect(customerBubble).toHaveClass('text-white');
    expect(customerBubble?.className).not.toContain('24A1DE');
    expect(supportBubble).toHaveClass('bg-dfxGray-300');
    expect(supportBubble).toHaveClass('text-dfxBlue-800');
  });

  it('uses ground-dependent timestamp colours (light on blue, dfxGray-800 on grey)', () => {
    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({ id: 1, author: 'Customer', message: 'Customer text', created: new Date(2024, 6, 10, 10, 15) }),
        makeMessage({
          id: 2,
          author: 'Support Agent',
          message: 'Support text',
          status: undefined,
          created: new Date(2024, 6, 10, 10, 20),
        }),
      ],
    });
    renderChat();

    const customerBubble = screen.getByText('Customer text').closest('div.flex.flex-col.max-w-xs');
    const supportBubble = screen.getByText('Support text').closest('div.flex.flex-col.max-w-xs');
    const customerTime = customerBubble?.querySelector('.text-white\\/70, [class*="text-white"]');
    // Tailwind class is text-white/70 — check class string
    const customerTimeRow = customerBubble?.querySelector('.text-xs.italic');
    const supportTimeRow = supportBubble?.querySelector('.text-xs.italic');
    expect(customerTimeRow?.className).toContain('text-white/70');
    expect(supportTimeRow?.className).toContain('text-dfxGray-800');
    expect(customerTime).toBeTruthy();
  });

  it('renders the support author name in text-dfxBlue-400 (not red)', () => {
    mockSupportIssue = makeIssue({
      messages: [makeMessage({ id: 1, author: 'Support Agent', message: 'Hi', status: undefined })],
    });
    renderChat();
    const author = screen.getByText('Support Agent');
    expect(author).toHaveClass('text-dfxBlue-400');
    expect(author).not.toHaveClass('text-dfxRed-150');
  });

  // --- B3 date separators ---

  it('renders a date separator above the first message', () => {
    const now = new Date();
    mockSupportIssue = makeIssue({
      messages: [makeMessage({ created: now, message: 'First' })],
    });
    renderChat();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(mockTranslate).toHaveBeenCalledWith('screens/support', 'Today');
  });

  it('renders a date separator when the calendar day changes, including same day-of-month across months', () => {
    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({ id: 1, created: new Date(2024, 6, 6, 12, 0), message: 'July' }),
        makeMessage({ id: 2, created: new Date(2024, 7, 6, 12, 0), message: 'August' }),
      ],
    });
    renderChat();
    // Two separators — one for each calendar day (first message + day change).
    const separators = document.querySelectorAll('.bg-dfxGray-300.text-dfxGray-700.rounded-full');
    expect(separators.length).toBe(2);
  });

  it('does not insert a second separator for messages on the same calendar day', () => {
    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({ id: 1, created: new Date(2024, 6, 6, 9, 0), message: 'Morning' }),
        makeMessage({ id: 2, created: new Date(2024, 6, 6, 18, 0), message: 'Evening' }),
      ],
    });
    renderChat();
    const separators = document.querySelectorAll('.bg-dfxGray-300.text-dfxGray-700.rounded-full');
    expect(separators.length).toBe(1);
  });

  it('labels yesterday messages with Yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    mockSupportIssue = makeIssue({
      messages: [makeMessage({ created: yesterday, message: 'Y-msg' })],
    });
    renderChat();
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(mockTranslate).toHaveBeenCalledWith('screens/support', 'Yesterday');
  });

  // --- B4 delivery status only on own messages ---

  it('shows delivery status icons only on customer messages', () => {
    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({ id: 1, author: 'Customer', message: 'Mine', status: SupportMessageStatus.RECEIVED }),
        makeMessage({ id: 2, author: 'Support Agent', message: 'Theirs', status: undefined }),
      ],
    });
    renderChat();
    expect(screen.getByTestId('msg-status-received')).toBeInTheDocument();
    const supportBubble = screen.getByText('Theirs').closest('div.flex.flex-col.max-w-xs');
    expect(within(supportBubble as HTMLElement).queryByTestId('msg-status-received')).not.toBeInTheDocument();
    expect(within(supportBubble as HTMLElement).queryByTestId('msg-status-sent')).not.toBeInTheDocument();
    expect(within(supportBubble as HTMLElement).queryByTestId('msg-status-failed')).not.toBeInTheDocument();
  });

  it('shows the sending clock for SENT and the error icon for FAILED customer messages', () => {
    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({ id: 1, author: 'Customer', message: 'Sending', status: SupportMessageStatus.SENT }),
        makeMessage({ id: 2, author: 'Customer', message: 'Failed', status: SupportMessageStatus.FAILED }),
      ],
    });
    renderChat();
    expect(screen.getByTestId('msg-status-sent')).toBeInTheDocument();
    expect(screen.getByTestId('msg-status-failed')).toBeInTheDocument();
  });

  it('renders a failed customer message with an error surface, not as a retry control', () => {
    // Resend is not on the published SDK yet — failed bubbles stay visible as errors only.
    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({ id: 77, author: 'Customer', message: 'Lost packet', status: SupportMessageStatus.FAILED }),
      ],
    });
    renderChat();

    const failed = screen.getByTestId('msg-failed');
    expect(failed).toHaveClass('border-dfxRed-100');
    expect(failed.className).not.toMatch(/pointer-events-none/);
    expect(failed.className).not.toMatch(/opacity-60/);
    expect(screen.queryByRole('button', { name: 'Retry sending message' })).not.toBeInTheDocument();
    expect(screen.queryByText('Tap to retry')).not.toBeInTheDocument();
    expect(screen.getByTestId('msg-status-failed')).toBeInTheDocument();
  });

  it('treats a missing author as a customer message (right-aligned, with status)', () => {
    mockSupportIssue = makeIssue({
      messages: [makeMessage({ id: 1, author: undefined, message: 'No author', status: SupportMessageStatus.SENT })],
    });
    renderChat();
    expect(screen.getByTestId('msg-status-sent')).toBeInTheDocument();
    const bubble = screen.getByText('No author').closest('div.flex.flex-col.max-w-xs');
    expect(bubble).toHaveClass('bg-dfxBlue-800');
  });

  // --- B5 author visible with attachments ---

  it('shows the support author name above a file attachment', () => {
    // B5: author must stay visible when a loaded DataFile is present (the old guard was `!file`).
    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({
          id: 1,
          author: 'Support Agent',
          message: undefined,
          fileName: 'statement.pdf',
          file: {
            file: 'x',
            type: 'application/pdf',
            size: 1024,
            url: 'https://example.com/statement.pdf',
          },
          status: undefined,
        }),
      ],
    });
    renderChat();
    expect(screen.getByText('Support Agent')).toBeInTheDocument();
    expect(screen.getByText('statement.pdf')).toBeInTheDocument();
  });

  // --- B1 dead code gone ---

  it('does not render reply previews, reaction chips, or a bubble menu', () => {
    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({
          id: 1,
          author: 'Customer',
          message: 'With legacy fields',
          replyTo: 99,
          reactions: [{ emoji: '👍', users: ['a'] }],
        }),
      ],
    });
    renderChat();
    expect(screen.queryByText('Reply')).not.toBeInTheDocument();
    expect(screen.queryByText('👍')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Reply to');
  });

  // --- InputComponent ---

  it('updates the controlled textarea value through onChange alone (onInput was removed as redundant)', () => {
    // After removing the duplicate onInput handler, typing must still land in the field via onChange.
    renderChat();
    const textarea = screen.getByPlaceholderText('Write a message...') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Typed via change' } });
    expect(textarea.value).toBe('Typed via change');
  });

  it('submits a typed message and clears the input', async () => {
    renderChat();
    const textarea = screen.getByPlaceholderText('Write a message...');
    fireEvent.change(textarea, { target: { value: 'Need help' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(mockSubmitMessage).toHaveBeenCalledWith('Need help', []);
    });
  });

  it('disables the send button when the input is empty and enables it when text is present', () => {
    renderChat();
    const sendButton = screen.getByRole('button', { name: 'Send message' });
    // disabled + inactive styles when empty
    expect(sendButton).toBeDisabled();
    expect(sendButton).toHaveClass('bg-dfxGray-500');
    expect(sendButton).not.toHaveClass('bg-dfxBlue-800');
    expect(mockTranslate).toHaveBeenCalledWith('screens/support', 'Send message');
    expect(mockTranslate).toHaveBeenCalledWith('screens/support', 'Attach file');

    // canSend true — active surface
    fireEvent.change(screen.getByPlaceholderText('Write a message...'), { target: { value: 'Hi' } });
    expect(sendButton).not.toBeDisabled();
    expect(sendButton).toHaveClass('bg-dfxBlue-800');
    expect(sendButton).toHaveClass('text-white');
    expect(sendButton).toHaveClass('cursor-pointer');
  });

  it('enables send for an attachment without text and submits files alone', async () => {
    // Mirrors the SDK guard: hasText || hasFiles.
    renderChat();
    const sendButton = screen.getByRole('button', { name: 'Send message' });
    expect(sendButton).toBeDisabled();

    const image = new File(['png'], 'shot.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.paste(screen.getByPlaceholderText('Write a message...'), {
        clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => image }] },
      });
    });

    expect(sendButton).not.toBeDisabled();
    fireEvent.click(sendButton);
    await waitFor(() => {
      expect(mockSubmitMessage).toHaveBeenCalled();
      const [msg, files] = mockSubmitMessage.mock.calls[0];
      expect(msg === undefined || msg === '' || msg === null || !String(msg).trim()).toBe(true);
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('shot.png');
    });
  });

  it('does not enable send for whitespace-only text without files', () => {
    renderChat();
    fireEvent.change(screen.getByPlaceholderText('Write a message...'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('does not submit when the input is empty', () => {
    renderChat();
    const sendButton = screen.getByRole('button', { name: 'Send message' });
    expect(sendButton).toBeDisabled();
    fireEvent.click(sendButton);
    expect(mockSubmitMessage).not.toHaveBeenCalled();
  });

  it('shows a length error above 4000 characters and blocks send', async () => {
    renderChat();
    const textarea = screen.getByPlaceholderText('Write a message...');
    const long = 'x'.repeat(4001);
    fireEvent.change(textarea, { target: { value: long } });
    expect(mockTranslateError).toHaveBeenCalledWith('message_length');
    expect(screen.getByText('message_length')).toBeInTheDocument();

    const sendButton = screen.getByRole('button', { name: 'Send message' });
    expect(sendButton).toBeDisabled();
    fireEvent.click(sendButton);
    expect(mockSubmitMessage).not.toHaveBeenCalled();

    // Clearing the error when value shrinks again
    fireEvent.change(textarea, { target: { value: 'ok' } });
    expect(screen.queryByText('message_length')).not.toBeInTheDocument();
    expect(sendButton).not.toBeDisabled();
  });

  it('styles the composer as a white pill on grey with a top separator', () => {
    renderChat();
    const textarea = screen.getByPlaceholderText('Write a message...');
    // Pill surface on the auto-grow grid (parent of the textarea)
    const pill = textarea.parentElement;
    expect(pill).toHaveClass('bg-white');
    expect(pill).toHaveClass('border-dfxGray-500');
    expect(pill).toHaveClass('rounded-full');
    expect(textarea).toHaveClass('bg-transparent');
    // Composer bar — grey ground + top rule separating it from the thread
    const bar = pill?.parentElement?.parentElement;
    expect(bar).toHaveClass('bg-dfxGray-300');
    expect(bar).toHaveClass('border-t');
    expect(bar).toHaveClass('border-dfxGray-500');
    // Soft top corners only (scale: lg) — not a full pill like the field
    expect(bar).toHaveClass('rounded-t-lg');
    // Home-indicator inset (no prior safe-area pattern in the repo)
    expect(bar?.className).toMatch(/safe-area-inset-bottom/);
  });

  it('does not send when Enter is pressed on an empty field', () => {
    // Covers handleSend's early return: the button is disabled when empty, but Enter still
    // reaches handleSend via handleKeyDown.
    renderChat();
    const textarea = screen.getByPlaceholderText('Write a message...');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(mockSubmitMessage).not.toHaveBeenCalled();
  });

  it('sends on Enter and inserts a newline on Shift+Enter', async () => {
    renderChat();
    const textarea = screen.getByPlaceholderText('Write a message...') as HTMLTextAreaElement;

    // 234:4 false — non-Enter keys must not send or alter the value.
    fireEvent.change(textarea, { target: { value: 'stay' } });
    fireEvent.keyDown(textarea, { key: 'a' });
    expect(textarea.value).toBe('stay');
    expect(mockSubmitMessage).not.toHaveBeenCalled();

    // 237:38 false — Shift+Enter on an empty field keeps the empty string branch.
    fireEvent.change(textarea, { target: { value: '' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(textarea.value).toBe('');

    fireEvent.change(textarea, { target: { value: 'Line1' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(textarea.value).toContain('\n');

    fireEvent.change(textarea, { target: { value: 'Send me' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    await waitFor(() => {
      expect(mockSubmitMessage).toHaveBeenCalledWith('Send me', []);
    });
  });

  it('attaches selected files and allows removing them before send', async () => {
    renderChat();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello'], 'note.pdf', { type: 'application/pdf' });

    // 223:4 false — empty / cancelled file pick must not add chips.
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [] } });
    });
    expect(screen.queryByText('note.pdf')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    expect(screen.getByText('note.pdf')).toBeInTheDocument();
    // Chip contrast: dfxBlue-800 on dfxGray-400
    const chip = screen.getByText('note.pdf').parentElement as HTMLElement;
    expect(chip).toHaveClass('text-dfxBlue-800');
    expect(chip).toHaveClass('bg-dfxGray-400');

    // Chip layout: paperclip svg + name + close svg — click the last svg (MdOutlineClose).
    const svgs = chip.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(svgs[svgs.length - 1]);
    expect(screen.queryByText('note.pdf')).not.toBeInTheDocument();
  });

  it('submits selected files together with the message text', async () => {
    renderChat();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello'], 'doc.pdf', { type: 'application/pdf' });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    const textarea = screen.getByPlaceholderText('Write a message...');
    fireEvent.change(textarea, { target: { value: 'With file' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(mockSubmitMessage).toHaveBeenCalled();
      const [msg, files] = mockSubmitMessage.mock.calls[0];
      expect(msg).toBe('With file');
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('doc.pdf');
    });
  });

  it('pastes image files from the clipboard and shows a preview chip', async () => {
    renderChat();
    const textarea = screen.getByPlaceholderText('Write a message...');
    const image = new File(['png-bytes'], 'screenshot.png', { type: 'image/png' });
    const clipboardData = {
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => image }],
    };

    await act(async () => {
      fireEvent.paste(textarea, { clipboardData });
    });

    expect(screen.getByText('screenshot.png')).toBeInTheDocument();
    expect(screen.getByTestId('attachment-preview')).toHaveAttribute('src', 'blob:mock-preview');
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('leaves text-only paste to the default browser behaviour', async () => {
    renderChat();
    const textarea = screen.getByPlaceholderText('Write a message...');
    const clipboardData = {
      items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
    };
    await act(async () => {
      fireEvent.paste(textarea, { clipboardData });
    });
    expect(screen.queryByTestId('attachment-preview')).not.toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects disallowed file types on paste with the shared file_type error', async () => {
    renderChat();
    const textarea = screen.getByPlaceholderText('Write a message...');
    const bad = new File(['x'], 'payload.exe', { type: 'application/octet-stream' });
    const clipboardData = {
      items: [{ kind: 'file', type: 'application/octet-stream', getAsFile: () => bad }],
    };
    await act(async () => {
      fireEvent.paste(textarea, { clipboardData });
    });
    expect(mockTranslateError).toHaveBeenCalledWith('file_type');
    expect(screen.getByText('file_type')).toBeInTheDocument();
    expect(screen.queryByText('payload.exe')).not.toBeInTheDocument();
  });

  it('accepts dropped files on the composer and shows a drag highlight', async () => {
    renderChat();
    const zone = screen.getByTestId('composer-drop-zone');
    const pdf = new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' });

    fireEvent.dragOver(zone);
    expect(zone.className).toMatch(/ring-dfxBlue-400/);

    await act(async () => {
      fireEvent.drop(zone, { dataTransfer: { files: [pdf] } });
    });
    expect(zone.className).not.toMatch(/ring-dfxBlue-400/);
    expect(screen.getByText('scan.pdf')).toBeInTheDocument();
    // Non-image chips keep the paperclip (no preview img).
    expect(screen.queryByTestId('attachment-preview')).not.toBeInTheDocument();
  });

  it('clears the drag highlight when the pointer leaves the composer without dropping', () => {
    // Covers handleDragLeave (chat.screen.tsx ~450–453).
    renderChat();
    const zone = screen.getByTestId('composer-drop-zone');
    fireEvent.dragOver(zone);
    expect(zone.className).toMatch(/ring-dfxBlue-400/);

    fireEvent.dragLeave(zone);
    expect(zone.className).not.toMatch(/ring-dfxBlue-400/);
  });

  it('does nothing when a drop carries an empty file list (addFiles early return)', async () => {
    // 370: if (files.length === 0) return
    renderChat();
    const zone = screen.getByTestId('composer-drop-zone');
    await act(async () => {
      fireEvent.drop(zone, { dataTransfer: { files: [] } });
    });
    expect(screen.queryByTestId('attachment-preview')).not.toBeInTheDocument();
    expect(mockTranslateError).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('treats a drop with missing dataTransfer.files as an empty list', async () => {
    // 460: e.dataTransfer.files ?? [] — synthetic events may omit files; keep the fallback.
    renderChat();
    const zone = screen.getByTestId('composer-drop-zone');
    await act(async () => {
      fireEvent.drop(zone, { dataTransfer: {} });
    });
    expect(screen.queryByTestId('attachment-preview')).not.toBeInTheDocument();
    expect(mockTranslateError).not.toHaveBeenCalled();
  });

  it('ignores paste when clipboardData has no items list', async () => {
    // 426: if (!items) return
    renderChat();
    const textarea = screen.getByPlaceholderText('Write a message...');
    await act(async () => {
      fireEvent.paste(textarea, { clipboardData: {} });
    });
    expect(screen.queryByTestId('attachment-preview')).not.toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('skips clipboard file items whose getAsFile() returns null', async () => {
    // 433: if (file) files.push(file) — false branch when the browser yields no File.
    renderChat();
    const textarea = screen.getByPlaceholderText('Write a message...');
    await act(async () => {
      fireEvent.paste(textarea, {
        clipboardData: {
          items: [{ kind: 'file', type: 'image/png', getAsFile: () => null }],
        },
      });
    });
    expect(screen.queryByTestId('attachment-preview')).not.toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('clears a prior file_type error when a valid attachment is added', async () => {
    // 378 true path + 380 true ternary (prev === fileTypeError → undefined).
    renderChat();
    const textarea = screen.getByPlaceholderText('Write a message...');
    const bad = new File(['x'], 'payload.exe', { type: 'application/octet-stream' });
    await act(async () => {
      fireEvent.paste(textarea, {
        clipboardData: { items: [{ kind: 'file', type: 'application/octet-stream', getAsFile: () => bad }] },
      });
    });
    expect(screen.getByText('file_type')).toBeInTheDocument();

    const good = new File(['%PDF'], 'ok.pdf', { type: 'application/pdf' });
    await act(async () => {
      fireEvent.paste(textarea, {
        clipboardData: { items: [{ kind: 'file', type: 'application/pdf', getAsFile: () => good }] },
      });
    });
    expect(screen.queryByText('file_type')).not.toBeInTheDocument();
    expect(screen.getByText('ok.pdf')).toBeInTheDocument();
  });

  it('does not clear a message_length error when attaching a file over the limit', async () => {
    // 378: accepted.length > 0 && length <= 4000 — false when length > 4000 (keep length error).
    renderChat();
    const textarea = screen.getByPlaceholderText('Write a message...') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'x'.repeat(4001) } });
    expect(screen.getByText('message_length')).toBeInTheDocument();

    const good = new File(['%PDF'], 'late.pdf', { type: 'application/pdf' });
    await act(async () => {
      fireEvent.paste(textarea, {
        clipboardData: { items: [{ kind: 'file', type: 'application/pdf', getAsFile: () => good }] },
      });
    });
    expect(screen.getByText('message_length')).toBeInTheDocument();
    expect(screen.getByText('late.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('revokes object URLs when an image chip is removed', async () => {
    renderChat();
    const textarea = screen.getByPlaceholderText('Write a message...');
    const image = new File(['png'], 'a.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.paste(textarea, {
        clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => image }] },
      });
    });
    expect(URL.createObjectURL).toHaveBeenCalled();
    const chip = screen.getByText('a.png').parentElement as HTMLElement;
    fireEvent.click(chip.querySelectorAll('svg')[chip.querySelectorAll('svg').length - 1]);
    await waitFor(() => {
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-preview');
    });
  });

  // --- Scroll orientation ---

  function scrollThreadAwayFromBottom() {
    const el = screen.getByTestId('chat-scroll');
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 1000 });
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 200 });
    Object.defineProperty(el, 'scrollTop', { configurable: true, writable: true, value: 0 });
    fireEvent.scroll(el);
  }

  /** Find a React useRef object whose `.current` is `el` (walks fiber ancestors). */
  function findReactRefFor(el: Element): { current: Element | null } | null {
    const fiberKey = Object.keys(el).find(
      (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
    );
    if (!fiberKey) return null;
    let fiber: { memoizedState?: { memoizedState?: unknown; next?: unknown }; return?: unknown } | null = (
      el as unknown as Record<string, unknown>
    )[fiberKey] as {
      memoizedState?: { memoizedState?: unknown; next?: unknown };
      return?: unknown;
    };
    while (fiber) {
      let hook: { memoizedState?: unknown; next?: unknown } | null | undefined = fiber.memoizedState;
      while (hook) {
        const m = hook.memoizedState as { current?: unknown } | null | undefined;
        if (m && typeof m === 'object' && 'current' in m && m.current === el) {
          return m as { current: Element | null };
        }
        hook = hook.next as typeof hook;
      }
      fiber = fiber.return as typeof fiber;
    }
    return null;
  }

  it('keeps the scroll position and shows New + unread when messages arrive while scrolled up', async () => {
    const scrollIntoView = Element.prototype.scrollIntoView as jest.Mock;
    const { rerender } = renderChat();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    const callsAfterOpen = scrollIntoView.mock.calls.length;

    scrollThreadAwayFromBottom();
    expect(screen.getByTestId('scroll-to-bottom')).toBeInTheDocument();
    expect(screen.queryByTestId('unread-count')).not.toBeInTheDocument();

    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({ id: 1, message: 'Old' }),
        makeMessage({ id: 2, message: 'New one', author: 'Support Agent', status: undefined }),
      ],
    });
    rerender(<ChatScreen />);

    // No auto-scroll while the user is reading further up.
    expect(scrollIntoView.mock.calls.length).toBe(callsAfterOpen);
    expect(screen.getByTestId('new-messages-divider')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByTestId('unread-count')).toHaveTextContent('1');
  });

  it('advances the message counter when the end anchor is not mounted, so that batch is not unread later', async () => {
    // Covers the !messagesEndRef.current early return (chat.screen.tsx ~113–115):
    // while the spinner is up the anchor is not in the tree, but prevMessageCount must still
    // move forward so those messages are not treated as unread once the user scrolls up later.
    const scrollIntoView = Element.prototype.scrollIntoView as jest.Mock;

    // 1) Open the thread once so hasScrolledToEndRef is true.
    const { rerender } = renderChat();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());

    // 2) Hide the thread (loading) but keep an issue with one message.
    mockIsLoading = true;
    mockSupportIssue = makeIssue({
      messages: [makeMessage({ id: 1, message: 'While loading start' })],
    });
    rerender(<ChatScreen />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

    // 3) A second message arrives while the end anchor is still unmounted → !end branch.
    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({ id: 1, message: 'While loading start' }),
        makeMessage({ id: 2, message: 'Arrived during load', author: 'Support Agent', status: undefined }),
      ],
    });
    rerender(<ChatScreen />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

    // 4) Show the thread again (same length — effect does not re-fire).
    mockIsLoading = false;
    rerender(<ChatScreen />);
    await waitFor(() => expect(screen.getByTestId('chat-scroll')).toBeInTheDocument());
    scrollThreadAwayFromBottom();

    // 5) Only a later arrival should count as unread (counter already at 2).
    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({ id: 1, message: 'While loading start' }),
        makeMessage({ id: 2, message: 'Arrived during load', author: 'Support Agent', status: undefined }),
        makeMessage({ id: 3, message: 'After reveal', author: 'Support Agent', status: undefined }),
      ],
    });
    rerender(<ChatScreen />);

    expect(screen.getByTestId('unread-count')).toHaveTextContent('1');
    expect(screen.getByTestId('new-messages-divider')).toBeInTheDocument();
    // “New” sits immediately before the post-reveal message, not before the in-load batch.
    const afterReveal = screen.getByText('After reveal');
    const divider = screen.getByTestId('new-messages-divider');
    expect(
      afterReveal.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    const duringLoad = screen.getByText('Arrived during load');
    expect(
      duringLoad.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('scrolls to the bottom on button click and clears the New marker', async () => {
    const scrollIntoView = Element.prototype.scrollIntoView as jest.Mock;
    const { rerender } = renderChat();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    scrollThreadAwayFromBottom();

    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({ id: 1, message: 'Old' }),
        makeMessage({ id: 2, message: 'New one', author: 'Support Agent', status: undefined }),
      ],
    });
    rerender(<ChatScreen />);
    expect(screen.getByTestId('new-messages-divider')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('scroll-to-bottom'));
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'smooth' });
    expect(screen.queryByTestId('new-messages-divider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('scroll-to-bottom')).not.toBeInTheDocument();
  });

  it('still auto-scrolls when new messages arrive while the user is at the bottom', async () => {
    const scrollIntoView = Element.prototype.scrollIntoView as jest.Mock;
    const { rerender } = renderChat();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    // Stay near bottom (default isNearBottomRef = true; ensure scroll metrics agree).
    const el = screen.getByTestId('chat-scroll');
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 500 });
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 500 });
    Object.defineProperty(el, 'scrollTop', { configurable: true, writable: true, value: 0 });
    fireEvent.scroll(el);

    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({ id: 1, message: 'Old' }),
        makeMessage({ id: 2, message: 'Fresh', author: 'Support Agent', status: undefined }),
      ],
    });
    rerender(<ChatScreen />);
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'smooth' });
    });
    expect(screen.queryByTestId('new-messages-divider')).not.toBeInTheDocument();
  });

  it('does not mark unread when the message list shrinks or stays without additions', async () => {
    // 126: else if (added > 0) — false when length drops (or would for added <= 0).
    const scrollIntoView = Element.prototype.scrollIntoView as jest.Mock;
    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({ id: 1, message: 'One' }),
        makeMessage({ id: 2, message: 'Two', author: 'Support Agent', status: undefined }),
      ],
    });
    const { rerender } = renderChat();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    const callsAfterOpen = scrollIntoView.mock.calls.length;
    scrollThreadAwayFromBottom();

    mockSupportIssue = makeIssue({
      messages: [makeMessage({ id: 1, message: 'One' })],
    });
    rerender(<ChatScreen />);

    expect(scrollIntoView.mock.calls.length).toBe(callsAfterOpen);
    expect(screen.queryByTestId('new-messages-divider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('unread-count')).not.toBeInTheDocument();
  });

  it('keeps the first New marker when further messages arrive while scrolled up', async () => {
    // 131: firstUnread already set — do not overwrite on a second batch (else of === undefined && previousLength > 0).
    const scrollIntoView = Element.prototype.scrollIntoView as jest.Mock;
    const { rerender } = renderChat();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    scrollThreadAwayFromBottom();

    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({ id: 1, message: 'Old' }),
        makeMessage({ id: 2, message: 'First new', author: 'Support Agent', status: undefined }),
      ],
    });
    rerender(<ChatScreen />);
    expect(screen.getByTestId('unread-count')).toHaveTextContent('1');
    expect(screen.getByTestId('new-messages-divider')).toBeInTheDocument();
    const firstNew = screen.getByText('First new');
    const dividerAfterFirst = screen.getByTestId('new-messages-divider');
    expect(
      firstNew.compareDocumentPosition(dividerAfterFirst) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();

    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({ id: 1, message: 'Old' }),
        makeMessage({ id: 2, message: 'First new', author: 'Support Agent', status: undefined }),
        makeMessage({ id: 3, message: 'Second new', author: 'Support Agent', status: undefined }),
      ],
    });
    rerender(<ChatScreen />);

    expect(screen.getByTestId('unread-count')).toHaveTextContent('2');
    // Divider stays anchored before the first new message, not moved to the second batch.
    const dividerAfterSecond = screen.getByTestId('new-messages-divider');
    const stillFirst = screen.getByText('First new');
    const secondNew = screen.getByText('Second new');
    // compareDocumentPosition(other): PRECEDING means other precedes this node.
    expect(
      stillFirst.compareDocumentPosition(dividerAfterSecond) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    expect(
      secondNew.compareDocumentPosition(dividerAfterSecond) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });

  it('ignores thread scroll events when the scroll container ref is unset', async () => {
    // 151: if (!el) return in handleThreadScroll — crash guard; ref nulled via fiber.
    const { rerender } = renderChat();
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    scrollThreadAwayFromBottom();

    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({ id: 1, message: 'Old' }),
        makeMessage({ id: 2, message: 'New one', author: 'Support Agent', status: undefined }),
      ],
    });
    rerender(<ChatScreen />);
    expect(screen.getByTestId('unread-count')).toHaveTextContent('1');

    const scrollEl = screen.getByTestId('chat-scroll');
    const scrollRef = findReactRefFor(scrollEl);
    if (!scrollRef) throw new Error('expected scrollContainerRef on chat-scroll fiber');
    scrollRef.current = null;

    // Metrics would clear unread if the handler ran past the guard.
    Object.defineProperty(scrollEl, 'scrollHeight', { configurable: true, get: () => 200 });
    Object.defineProperty(scrollEl, 'clientHeight', { configurable: true, get: () => 200 });
    Object.defineProperty(scrollEl, 'scrollTop', { configurable: true, writable: true, value: 0 });
    fireEvent.scroll(scrollEl);

    expect(screen.getByTestId('unread-count')).toHaveTextContent('1');
    expect(screen.getByTestId('scroll-to-bottom')).toBeInTheDocument();

    scrollRef.current = scrollEl;
  });

  it('no-ops scrollToBottom when the end anchor ref is unset', async () => {
    // 160: if (!end) return in scrollToBottom.
    const scrollIntoView = Element.prototype.scrollIntoView as jest.Mock;
    const { rerender } = renderChat();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    scrollThreadAwayFromBottom();

    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({ id: 1, message: 'Old' }),
        makeMessage({ id: 2, message: 'New one', author: 'Support Agent', status: undefined }),
      ],
    });
    rerender(<ChatScreen />);
    expect(screen.getByTestId('scroll-to-bottom')).toBeInTheDocument();

    const scrollEl = screen.getByTestId('chat-scroll');
    const endEl = scrollEl.lastElementChild as HTMLElement;
    const endRef = findReactRefFor(endEl);
    if (!endRef) throw new Error('expected messagesEndRef on end-anchor fiber');
    endRef.current = null;

    const callsBefore = scrollIntoView.mock.calls.length;
    fireEvent.click(screen.getByTestId('scroll-to-bottom'));

    expect(scrollIntoView.mock.calls.length).toBe(callsBefore);
    expect(screen.getByTestId('scroll-to-bottom')).toBeInTheDocument();
    expect(screen.getByTestId('new-messages-divider')).toBeInTheDocument();

    endRef.current = endEl;
  });

  it('jumps without animation when scroll-to-bottom is used under reduced motion', async () => {
    // 161: prefersReducedMotion() ? 'auto' : 'smooth' — auto branch on the jump button.
    (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    const scrollIntoView = Element.prototype.scrollIntoView as jest.Mock;
    const { rerender } = renderChat();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    scrollThreadAwayFromBottom();

    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({ id: 1, message: 'Old' }),
        makeMessage({ id: 2, message: 'New one', author: 'Support Agent', status: undefined }),
      ],
    });
    rerender(<ChatScreen />);

    fireEvent.click(screen.getByTestId('scroll-to-bottom'));
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'auto' });
    expect(screen.queryByTestId('scroll-to-bottom')).not.toBeInTheDocument();
  });

  // --- ChatBubbleFileEmbed ---

  it('triggers loadFileData when an unloaded attachment is clicked and shows errors', async () => {
    mockLoadFileData.mockRejectedValue(new Error('boom'));
    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({
          id: 42,
          author: 'Support Agent',
          message: undefined,
          fileName: 'report.pdf',
          file: undefined,
          status: undefined,
        }),
      ],
    });
    renderChat();
    fireEvent.click(screen.getByText('report.pdf'));
    await waitFor(() => {
      expect(mockLoadFileData).toHaveBeenCalledWith(42);
      expect(screen.getByText('Download failed')).toBeInTheDocument();
    });
  });

  it('opens a loaded document attachment in a new tab', () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({
          id: 5,
          author: 'Support Agent',
          message: undefined,
          fileName: 'invoice.pdf',
          file: {
            file: 'x',
            type: 'application/pdf',
            size: 2048,
            url: 'https://example.com/invoice.pdf',
          },
          status: undefined,
        }),
      ],
    });
    renderChat();
    fireEvent.click(screen.getByText('invoice.pdf'));
    expect(openSpy).toHaveBeenCalledWith('https://example.com/invoice.pdf', '_blank');
    openSpy.mockRestore();
  });

  it('opens and closes an image lightbox for a loaded image attachment', () => {
    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({
          id: 6,
          author: 'Support Agent',
          message: undefined,
          fileName: 'photo.png',
          file: {
            file: 'x',
            type: 'image/png',
            size: 4096,
            url: 'https://example.com/photo.png',
          },
          status: undefined,
        }),
      ],
    });
    renderChat();
    const thumbs = screen.getAllByAltText('photo.png');
    fireEvent.click(thumbs[0]);
    // Lightbox image appears (second img with same alt)
    expect(screen.getAllByAltText('photo.png').length).toBeGreaterThanOrEqual(2);

    // Close via the top-right button
    const closeButtons = screen.getAllByRole('button');
    const lightboxClose = closeButtons.find((b) => b.className.includes('absolute'));
    expect(lightboxClose).toBeTruthy();
    fireEvent.click(lightboxClose as HTMLElement);
    expect(screen.getAllByAltText('photo.png')).toHaveLength(1);
  });

  it('stops propagation when the lightbox backdrop is clicked', () => {
    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({
          id: 7,
          author: 'Support Agent',
          message: undefined,
          fileName: 'shot.jpg',
          file: {
            file: 'x',
            type: 'image/jpeg',
            size: 1024,
            url: 'https://example.com/shot.jpg',
          },
          status: undefined,
        }),
      ],
    });
    renderChat();
    fireEvent.click(screen.getAllByAltText('shot.jpg')[0]);
    const backdrop = document.querySelector('.fixed.inset-0');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop as Element);
    // Still open (stopPropagation only — no close on backdrop)
    expect(document.querySelector('.fixed.inset-0')).toBeTruthy();
  });

  // --- TransactionComponent ---

  it('renders a linked transaction collapsible with asset icon for a completed buy', async () => {
    mockGetTransactionByUid.mockResolvedValue({
      type: 'Buy',
      state: 'Completed',
      inputAsset: 'CHF',
      outputAsset: 'BTC',
      inputAmount: 100,
      outputAmount: 0.01,
    });
    mockSupportIssue = makeIssue({
      transaction: { uid: 'tx-1', url: 'https://example.com/tx' },
    });
    renderChat();
    await waitFor(() => {
      expect(mockGetTransactionByUid).toHaveBeenCalledWith('tx-1');
      expect(screen.getByTestId('tx-collapsible')).toBeInTheDocument();
      expect(screen.getByTestId('asset-icon-BTC')).toBeInTheDocument();
      expect(screen.getByTestId('tx-info')).toBeInTheDocument();
    });
  });

  it('uses the help icon when no matching asset icon is found', async () => {
    mockGetTransactionByUid.mockResolvedValue({
      type: 'Buy',
      state: 'Completed',
      inputAsset: 'UNKNOWN',
      outputAsset: 'UNKNOWN2',
      inputAmount: 1,
      outputAmount: 2,
    });
    mockSupportIssue = makeIssue({
      transaction: { uid: 'tx-2', url: 'https://example.com/tx' },
    });
    renderChat();
    await waitFor(() => {
      expect(screen.getByTestId('dfx-icon-help')).toBeInTheDocument();
    });
  });

  it('prefers inputAsset for sell transactions and strips a leading d from asset codes', async () => {
    mockGetTransactionByUid.mockResolvedValue({
      type: 'Sell',
      state: 'Completed',
      inputAsset: 'dBTC',
      outputAsset: 'CHF',
      inputAmount: 0.5,
      outputAmount: 20000,
    });
    mockSupportIssue = makeIssue({
      transaction: { uid: 'tx-3', url: 'https://example.com/tx' },
    });
    renderChat();
    await waitFor(() => {
      expect(screen.getByTestId('asset-icon-BTC')).toBeInTheDocument();
    });
  });

  it('marks unassigned transactions without an asset icon and with the red state class', async () => {
    mockGetTransactionByUid.mockResolvedValue({
      type: 'Buy',
      state: 'Unassigned',
      inputAsset: 'BTC',
      outputAsset: 'BTC',
      inputAmount: 1,
      outputAmount: 1,
    });
    mockSupportIssue = makeIssue({
      transaction: { uid: 'tx-4', url: 'https://example.com/tx' },
    });
    renderChat();
    await waitFor(() => {
      expect(screen.getByTestId('dfx-icon-help')).toBeInTheDocument();
      expect(screen.getByText('label-Unassigned')).toHaveClass('text-dfxRed-100');
    });
  });

  it('shows a transaction loading spinner while the fetch is in flight', async () => {
    let resolveTx!: (value: unknown) => void;
    mockGetTransactionByUid.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTx = resolve;
        }),
    );
    mockSupportIssue = makeIssue({
      transaction: { uid: 'tx-load', url: 'https://example.com/tx' },
    });
    renderChat();
    expect(await screen.findByText('Loading transaction...')).toBeInTheDocument();
    // Spinner next to the loading label (screen shell spinner is gone once the issue is loaded).
    expect(screen.getAllByTestId('loading-spinner').length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      resolveTx({
        type: 'Buy',
        state: 'Completed',
        inputAsset: 'CHF',
        outputAsset: 'BTC',
        inputAmount: 1,
        outputAmount: 0.001,
      });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.queryByText('Loading transaction...')).not.toBeInTheDocument();
      expect(screen.getByTestId('tx-collapsible')).toBeInTheDocument();
    });
  });

  it('shows a transaction loading state then an error message when the fetch fails', async () => {
    mockGetTransactionByUid.mockRejectedValue({ message: 'tx gone' });
    mockSupportIssue = makeIssue({
      transaction: { uid: 'tx-err', url: 'https://example.com/tx' },
    });
    renderChat();
    await waitFor(() => {
      expect(screen.getByText('tx gone')).toBeInTheDocument();
      expect(screen.getByText('tx gone')).toHaveClass('text-dfxRed-100');
    });
  });

  it('falls back to Unknown error when the transaction fetch rejection has no message', async () => {
    mockGetTransactionByUid.mockRejectedValue({});
    mockSupportIssue = makeIssue({
      transaction: { uid: 'tx-err2', url: 'https://example.com/tx' },
    });
    renderChat();
    await waitFor(() => {
      expect(screen.getByText('Unknown error')).toBeInTheDocument();
    });
  });

  it('renders amount arrow only when both input and output assets are present', async () => {
    mockGetTransactionByUid.mockResolvedValue({
      type: 'Buy',
      state: 'Completed',
      inputAsset: 'CHF',
      outputAsset: 'ETH',
      inputAmount: 50,
      outputAmount: 0.02,
    });
    mockSupportIssue = makeIssue({
      transaction: { uid: 'tx-5', url: 'https://example.com/tx' },
    });
    renderChat();
    await waitFor(() => {
      expect(screen.getByText(/50 CHF/)).toBeInTheDocument();
      expect(screen.getByText(/→/)).toBeInTheDocument();
      expect(screen.getByText(/0.02 ETH/)).toBeInTheDocument();
    });
  });

  it('renders asset labels with empty amounts when amounts are missing', async () => {
    // 164:36 inputAmount ?? '' and 166:37 outputAmount ?? '' — assets present, amounts undefined.
    mockGetTransactionByUid.mockResolvedValue({
      type: 'Buy',
      state: 'Completed',
      inputAsset: 'CHF',
      outputAsset: 'ETH',
      inputAmount: undefined,
      outputAmount: undefined,
    });
    mockSupportIssue = makeIssue({
      transaction: { uid: 'tx-amounts-empty', url: 'https://example.com/tx' },
    });
    renderChat();
    await waitFor(() => {
      expect(screen.getByTestId('tx-collapsible')).toBeInTheDocument();
    });
    const title = screen.getByTestId('tx-collapsible');
    // Leading space from `${''} ${asset}` is intentional; match asset tokens and the arrow.
    expect(title.textContent).toMatch(/CHF/);
    expect(title.textContent).toMatch(/→/);
    expect(title.textContent).toMatch(/ETH/);
    expect(title.textContent).not.toMatch(/\d+\s*CHF/);
    expect(title.textContent).not.toMatch(/\d+\s*ETH/);
  });

  it('renders only the available asset side when the other is missing', async () => {
    // Output-only side (existing path).
    mockGetTransactionByUid.mockResolvedValue({
      type: 'Buy',
      state: 'Completed',
      inputAsset: undefined,
      outputAsset: 'ETH',
      inputAmount: undefined,
      outputAmount: 1,
    });
    mockSupportIssue = makeIssue({
      transaction: { uid: 'tx-6', url: 'https://example.com/tx' },
    });
    const { unmount } = renderChat();
    await waitFor(() => {
      expect(screen.getByText(/1 ETH/)).toBeInTheDocument();
      expect(screen.queryByText(/→/)).not.toBeInTheDocument();
    });
    unmount();

    // 166:17 else — inputAsset only, no outputAsset (and no arrow).
    mockGetTransactionByUid.mockResolvedValue({
      type: 'Buy',
      state: 'Completed',
      inputAsset: 'CHF',
      outputAsset: undefined,
      inputAmount: 10,
      outputAmount: undefined,
    });
    mockSupportIssue = makeIssue({
      transaction: { uid: 'tx-6b', url: 'https://example.com/tx' },
    });
    renderChat();
    await waitFor(() => {
      expect(screen.getByText(/10 CHF/)).toBeInTheDocument();
      expect(screen.queryByText(/→/)).not.toBeInTheDocument();
    });
  });

  it('does not show a second author header when consecutive messages share the same author', () => {
    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({ id: 1, author: 'Support Agent', message: 'One', status: undefined }),
        makeMessage({
          id: 2,
          author: 'Support Agent',
          message: undefined,
          fileName: 'follow-up.pdf',
          status: undefined,
        }),
      ],
    });
    renderChat();
    expect(screen.getAllByText('Support Agent')).toHaveLength(1);
    // 348:12 else — same author + attachment: hasHeader false and hasFile true → no pt-1.5.
    const fileBubble = screen.getByText('follow-up.pdf').closest('div.flex.flex-col.max-w-xs');
    expect(fileBubble).toBeTruthy();
    expect(fileBubble?.className).not.toContain('pt-1.5');
  });

  it('shows Downloading… while loadFileData is in flight', async () => {
    let resolveLoad!: () => void;
    mockLoadFileData.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({
          id: 8,
          author: 'Support Agent',
          message: undefined,
          fileName: 'pending.pdf',
          file: undefined,
          status: undefined,
        }),
      ],
    });
    renderChat();
    fireEvent.click(screen.getByText('pending.pdf'));
    expect(await screen.findByText('Downloading...')).toBeInTheDocument();
    await act(async () => {
      resolveLoad();
      await Promise.resolve();
    });
  });

  it('shows Document · size for a loaded non-image attachment', () => {
    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({
          id: 9,
          author: 'Support Agent',
          message: undefined,
          fileName: 'sheet.xlsx',
          file: {
            file: 'x',
            type: 'application/vnd.ms-excel',
            size: 1024,
            url: 'https://example.com/sheet.xlsx',
          },
          status: undefined,
        }),
      ],
    });
    renderChat();
    expect(screen.getByText(/Document/)).toBeInTheDocument();
  });

  it('falls back to Document for an unknown MIME type prefix', () => {
    mockSupportIssue = makeIssue({
      messages: [
        makeMessage({
          id: 10,
          author: 'Support Agent',
          message: undefined,
          fileName: 'blob.bin',
          file: {
            file: 'x',
            type: 'application/octet-stream',
            size: 10,
            url: 'https://example.com/blob.bin',
          },
          status: undefined,
        }),
      ],
    });
    renderChat();
    expect(screen.getByText(/Document/)).toBeInTheDocument();
  });
});
