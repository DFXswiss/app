const mockSession = { isLoggedIn: false, address: undefined as string | undefined, openConnect: jest.fn() };
const mockUser: { user: { mail?: string } | undefined } = { user: undefined };
const mockGetProfile = jest.fn();
const mockUpdateMail = jest.fn();
const mockLocation: { state: unknown } = { state: undefined };

const mockSupport = {
  tickets: [] as Array<Record<string, unknown>>,
  supportIssue: undefined as Record<string, unknown> | undefined,
  isLoading: false,
  isError: false,
  loadTickets: jest.fn(),
  loadSupportIssue: jest.fn(),
  createSupportIssue: jest.fn(),
  submitMessage: jest.fn(),
  setSync: jest.fn(),
  loadFileData: jest.fn(),
};

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {
    BITCOIN: 'Bitcoin',
    ETHEREUM: 'Ethereum',
    SEPOLIA: 'Sepolia',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
    OPTIMISM: 'Optimism',
    ARBITRUM: 'Arbitrum',
    POLYGON: 'Polygon',
    BASE: 'Base',
    GNOSIS: 'Gnosis',
    HAQQ: 'Haqq',
    SOLANA: 'Solana',
    TRON: 'Tron',
    CARDANO: 'Cardano',
    DEFICHAIN: 'DeFiChain',
    LIGHTNING: 'Lightning',
  },
  ApiException: class ApiException extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  SupportIssueType: {
    GENERIC_ISSUE: 'GenericIssue',
    TRANSACTION_ISSUE: 'TransactionIssue',
    VERIFICATION_CALL: 'VerificationCall',
    KYC_ISSUE: 'KycIssue',
    LIMIT_REQUEST: 'LimitRequest',
    PARTNERSHIP_REQUEST: 'PartnershipRequest',
    NOTIFICATION_OF_CHANGES: 'NotificationOfChanges',
    BUG_REPORT: 'BugReport',
  },
  SupportIssueReason: {
    OTHER: 'Other',
    FUNDS_NOT_RECEIVED: 'FundsNotReceived',
    TRANSACTION_MISSING: 'TransactionMissing',
  },
  SupportIssueState: { PENDING: 'Pending', COMPLETED: 'Completed', CREATED: 'Created', CANCELED: 'Canceled' },
  SupportMessageStatus: { SENT: 'Sent', FAILED: 'Failed', PENDING: 'Pending' },
  SupportChatContextProvider: ({ children }: { children: React.ReactNode }) => children,
  useSupportChatContext: () => mockSupport,
  useUser: () => ({ getProfile: mockGetProfile }),
  useUserContext: () => ({ user: mockUser.user, updateMail: mockUpdateMail }),
}));

jest.mock('react-router-dom', () => ({
  useLocation: () => mockLocation,
}));

jest.mock('../wallets/session', () => ({
  useWalletSession: () => mockSession,
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiException } from '@dfx.swiss/react';
import SupportScreen from '../screens/support';
import { LanguageProvider } from '../i18n';
import { ToastProvider } from '../components/ui';

function renderSupport() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <SupportScreen />
      </ToastProvider>
    </LanguageProvider>,
  );
}

describe('SupportScreen', () => {
  beforeEach(() => {
    if (typeof Element !== 'undefined' && typeof Element.prototype.scrollTo !== 'function') {
      Element.prototype.scrollTo = function scrollTo() {
        return undefined;
      };
    }
    jest.clearAllMocks();
    mockSession.isLoggedIn = false;
    mockSession.address = undefined;
    mockUser.user = undefined;
    mockLocation.state = undefined;
    mockSupport.tickets = [];
    mockSupport.supportIssue = undefined;
    mockSupport.isLoading = false;
    mockSupport.isError = false;
    mockGetProfile.mockResolvedValue({ firstName: 'Ada', lastName: 'Lovelace' });
    mockUpdateMail.mockResolvedValue(undefined);
    mockSupport.loadTickets.mockResolvedValue(undefined);
    mockSupport.loadSupportIssue.mockResolvedValue(undefined);
    mockSupport.createSupportIssue.mockResolvedValue('uid-1');
    mockSupport.submitMessage.mockResolvedValue(undefined);
    mockSupport.loadFileData.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the knowledge base and connect CTA while logged out', () => {
    renderSupport();
    expect(screen.getByRole('heading')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/create a support ticket|support-ticket erstellen|crea un ticket|créer un ticket/i));
    expect(mockSession.openConnect).toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/search for your problem/i), { target: { value: 'zzzz-no-hit' } });
    expect(screen.getByText(/no topic matches|kein thema|nessun argomento|aucune rubrique/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/search for your problem/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /wallet/i }));
    const chips = document.querySelector('.kbchips') as HTMLDivElement | null;
    if (chips && typeof chips.scrollTo !== 'function') {
      chips.scrollTo = jest.fn();
    }
    fireEvent.click(screen.getByRole('button', { name: /more topics/i }));
  });

  it('lists tickets, opens a thread and submits a new issue', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0xabcdef1234567890';
    mockUser.user = undefined;
    mockSupport.tickets = [
      {
        uid: 't1',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [{ id: 1, message: 'hello', status: 'Sent' }],
      },
      {
        uid: 't2',
        type: 'BugReport',
        state: 'Completed',
        created: '2026-01-01T10:00:00Z',
        messages: [{ id: 2, fileName: 'shot.png', status: 'Sent' }],
      },
      {
        uid: 't3',
        type: 'KycIssue',
        state: 'Created',
        created: '2026-01-03T10:00:00Z',
        messages: [],
      },
      {
        uid: 't4',
        type: 'LimitRequest',
        state: 'Canceled',
        created: '2026-01-04T10:00:00Z',
        messages: [{ id: 4, message: 'later', status: 'Sent' }],
      },
    ];
    renderSupport();
    await waitFor(() => expect(mockSupport.loadTickets).toHaveBeenCalled());
    await waitFor(() => expect(mockGetProfile).toHaveBeenCalled());

    fireEvent.click(screen.getAllByText(/hello/)[0]);
    expect(mockSupport.loadSupportIssue).toHaveBeenCalledWith('t1');

    fireEvent.click(screen.getByText(/create a support ticket|support-ticket erstellen|crea un ticket|créer un ticket/i));
    const messageBox = () => screen.getAllByLabelText('Message')[0];
    fireEvent.change(messageBox(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /submit ticket/i }));
    expect(await screen.findByText(/please describe your issue/i)).toBeInTheDocument();

    fireEvent.change(messageBox(), { target: { value: 'Need help' } });
    fireEvent.click(screen.getByRole('button', { name: /submit ticket/i }));
    expect(await screen.findByText(/add an email/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/email for our reply/i), { target: { value: 'ada@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /submit ticket/i }));
    await waitFor(() => expect(mockUpdateMail).toHaveBeenCalled());
    await waitFor(() => expect(mockSupport.createSupportIssue).toHaveBeenCalled());
  });

  it('handles ticket load failure, mail-taken create and a transaction preset', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockUser.user = { mail: 'old@example.com' };
    mockSupport.loadTickets.mockRejectedValueOnce(new Error('down'));
    mockLocation.state = {
      supportPreset: { type: 'TransactionIssue', reason: 'TransactionMissing', transactionUid: 'tx-9' },
    };
    renderSupport();
    await waitFor(() => expect(screen.getByText(/couldn't load|nicht laden|caricare|charger/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut|riprova|réessayer/i }));

    mockSupport.createSupportIssue.mockRejectedValueOnce(new ApiException(409, 'exists'));
    fireEvent.change(screen.getAllByLabelText('Message')[0], { target: { value: 'preset' } });
    fireEvent.click(screen.getByRole('button', { name: /submit ticket/i }));
    await waitFor(() => expect(mockSupport.createSupportIssue).toHaveBeenCalled());
  });

  it('sends a chat message and rejects an oversized attachment', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockUser.user = { mail: 'a@b.c' };
    mockSupport.tickets = [
      {
        uid: 't1',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [{ id: 1, message: 'hello', status: 'Sent', author: 'Customer' }],
      },
    ];
    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [{ id: 1, message: 'hello', status: 'Sent', author: 'Customer', created: '2026-01-02T10:00:00Z' }],
    };
    mockSupport.loadSupportIssue.mockImplementation(async () => undefined);
    renderSupport();
    fireEvent.click(screen.getAllByText(/hello/)[0]);
    const boxes = screen.getAllByLabelText('Message');
    fireEvent.change(boxes[boxes.length - 1], { target: { value: 'follow up' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(mockSupport.submitMessage).toHaveBeenCalled());

    const input = document.getElementById('chatFileInput') as HTMLInputElement;
    const huge = new File([new Uint8Array(11 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [huge] } });
  });

  it('shows the empty ticket list and retries a failed profile prefetch', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0xabcdef1234567890';
    mockGetProfile.mockRejectedValueOnce(new Error('profile-down'));
    renderSupport();
    expect(await screen.findByText(/don't have any tickets|keine tickets|nessun ticket|aucun ticket/i)).toBeInTheDocument();
    await waitFor(() => expect(mockGetProfile).toHaveBeenCalled());
  });

  it('cancels an in-flight profile fetch on unmount', async () => {
    mockSession.isLoggedIn = true;
    let resolveProfile: ((value: { firstName: string; lastName: string }) => void) | undefined;
    mockGetProfile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveProfile = resolve;
        }),
    );
    const { unmount } = renderSupport();
    unmount();
    resolveProfile?.({ firstName: 'Late', lastName: 'Name' });
  });

  it('lists remaining issue types, filters the knowledge base and scrolls chips', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockSupport.tickets = [
      {
        uid: 'v1',
        type: 'VerificationCall',
        state: 'Pending',
        created: '2026-02-01T10:00:00Z',
        messages: [{ id: 1, message: 'call me', status: 'Sent' }],
      },
      {
        uid: 'p1',
        type: 'PartnershipRequest',
        state: 'Pending',
        created: '2026-02-02T10:00:00Z',
        messages: [{ id: 2, fileName: 'deck.pdf', status: 'Sent' }],
      },
      {
        uid: 'c1',
        type: 'NotificationOfChanges',
        state: 'Pending',
        created: '2026-02-03T10:00:00Z',
        messages: [],
      },
      {
        uid: 'x1',
        type: 'NotARealType',
        state: 'Pending',
        created: '2026-02-04T10:00:00Z',
        messages: [{ id: 3, message: 'mystery', status: 'Sent' }],
      },
    ];
    renderSupport();
    expect(await screen.findByText(/verification call|verifizierungs|chiamata di verifica|appel de v/i)).toBeInTheDocument();
    expect(screen.getByText(/partnership|partnerschaft/i)).toBeInTheDocument();
    expect(screen.getByText(/account changes|kontoänderungen|modifiche al conto|modifications du compte/i)).toBeInTheDocument();
    expect(screen.getAllByText(/general question|allgemeine frage|domanda generale|question générale/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/deck.pdf/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /accept payments|zahlungen annehmen|accetta pagamenti|accepter des paiements/i }));
    expect(screen.getByText(/accept crypto payments|krypto-zahlungen|pagamenti in cripto|paiements crypto/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/search for your problem/i), { target: { value: 'revolut' } });
    expect(screen.getAllByText(/revolut/i).length).toBeGreaterThan(0);

    const chips = document.querySelector('.kbchips') as HTMLDivElement;
    Object.defineProperty(chips, 'scrollWidth', { configurable: true, value: 800 });
    Object.defineProperty(chips, 'clientWidth', { configurable: true, value: 120 });
    Object.defineProperty(chips, 'scrollLeft', { configurable: true, writable: true, value: 0 });
    const scrollTo = jest.fn(function scrollTo(this: HTMLDivElement, arg?: ScrollToOptions | number) {
      if (typeof arg === 'object' && arg && typeof arg.left === 'number') this.scrollLeft = arg.left;
    });
    chips.scrollTo = scrollTo;
    fireEvent.scroll(chips);
    fireEvent.click(screen.getByRole('button', { name: /more topics/i }));
    expect(scrollTo).toHaveBeenCalled();
    Object.defineProperty(chips, 'scrollLeft', { configurable: true, writable: true, value: 680 });
    fireEvent.scroll(chips);
  });

  it('opens a ticket from the keyboard and creates one when mail is already on file', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0xabcdef1234567890';
    mockUser.user = { mail: 'ada@example.com' };
    mockSupport.tickets = [
      {
        uid: 't1',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [{ id: 1, message: 'hello', status: 'Sent' }],
      },
    ];
    renderSupport();
    fireEvent.click(await screen.findByRole('button', { name: /hello/i }));
    expect(mockSupport.loadSupportIssue).toHaveBeenCalledWith('t1');

    const contact = screen.getByText(/create a support ticket|support-ticket erstellen|crea un ticket|créer un ticket/i);
    fireEvent.keyDown(contact.closest('[role="button"]') as HTMLElement, { key: ' ' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '5' } });
    fireEvent.change(screen.getAllByLabelText('Message')[0], { target: { value: 'A bug' } });
    fireEvent.change(screen.getByLabelText(/name|name|nome|nom/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /submit ticket/i }));
    expect(mockSupport.createSupportIssue).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/name|name|nome|nom/i), { target: { value: 'Ada' } });
    fireEvent.click(screen.getByRole('button', { name: /submit ticket/i }));
    await waitFor(() =>
      expect(mockSupport.createSupportIssue).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'BugReport', name: 'Ada', message: 'A bug' }),
      ),
    );
    expect(mockUpdateMail).not.toHaveBeenCalled();
  });

  it('surfaces a generic create error and a mail-related rejection', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockUser.user = { mail: 'old@example.com' };
    renderSupport();
    fireEvent.click(screen.getByText(/create a support ticket|support-ticket erstellen|crea un ticket|créer un ticket/i));
    fireEvent.change(screen.getAllByLabelText('Message')[0], { target: { value: 'help' } });

    mockSupport.createSupportIssue.mockRejectedValueOnce(new Error('server-boom'));
    fireEvent.click(screen.getByRole('button', { name: /submit ticket/i }));
    expect(await screen.findByText(/could not create|nicht erstellt|impossibile creare|impossible de créer/i)).toBeInTheDocument();

    mockSupport.createSupportIssue.mockRejectedValueOnce(new Error('invalid mail address'));
    fireEvent.click(screen.getByRole('button', { name: /submit ticket/i }));
    expect(await screen.findByText(/add an email|e-mail/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/email for our reply/i), { target: { value: 'ada@example.com' } });
    mockSupport.createSupportIssue.mockRejectedValueOnce('plain');
    fireEvent.click(screen.getByRole('button', { name: /submit ticket/i }));
    await waitFor(() => expect(mockSupport.createSupportIssue).toHaveBeenCalledTimes(3));
  });

  it('ignores a second submit while a ticket is in flight', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockUser.user = { mail: 'a@b.c' };
    let resolveCreate: ((uid: string) => void) | undefined;
    mockSupport.createSupportIssue.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    renderSupport();
    fireEvent.click(screen.getByText(/create a support ticket|support-ticket erstellen|crea un ticket|créer un ticket/i));
    fireEvent.change(screen.getAllByLabelText('Message')[0], { target: { value: 'wait' } });
    fireEvent.click(screen.getByRole('button', { name: /submit ticket/i }));
    fireEvent.click(screen.getByRole('button', { name: /submit ticket|sending/i }));
    expect(mockSupport.createSupportIssue).toHaveBeenCalledTimes(1);
    resolveCreate?.('uid-wait');
    await waitFor(() => expect(mockSupport.loadSupportIssue).toHaveBeenCalledWith('uid-wait'));
  });

  it('ignores a support preset until signed in and accepts an unmatched topic', async () => {
    mockLocation.state = { supportPreset: { type: 'LimitRequest', reason: 'Other' } };
    renderSupport();
    expect(screen.queryByRole('dialog', { name: /new ticket|neues ticket|nuovo ticket|nouveau ticket/i })).not.toBeInTheDocument();

    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockUser.user = { mail: 'a@b.c' };
    renderSupport();
    expect(await screen.findByRole('button', { name: /submit ticket/i })).toBeInTheDocument();
  });

  it('opens an empty thread, retries a load failure and shows a closed ticket', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockSupport.tickets = [
      {
        uid: 'empty',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [],
      },
      {
        uid: 'closed',
        type: 'BugReport',
        state: 'Completed',
        created: '2026-01-01T10:00:00Z',
        messages: [{ id: 9, message: 'done', status: 'Sent' }],
      },
    ];
    mockSupport.loadSupportIssue.mockRejectedValueOnce(new Error('thread-down'));
    renderSupport();
    fireEvent.click(await screen.findByRole('button', { name: /general question/i }));
    expect(await screen.findByText(/couldn't load|nicht laden|caricare|charger/i)).toBeInTheDocument();
    mockSupport.supportIssue = {
      uid: 'empty',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [],
    };
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut|riprova|réessayer/i }));
    expect(await screen.findByText(/write the first|schreib unten|scrivi il primo|écris le premier/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    mockSupport.supportIssue = {
      uid: 'closed',
      type: 'BugReport',
      state: 'Completed',
      messages: [{ id: 9, message: 'done', status: 'Sent', author: 'Support', created: '2026-01-01T10:00:00Z' }],
    };
    fireEvent.click(screen.getByText('done'));
    expect(await screen.findByText(/ticket is closed|ticket ist geschlossen|ticket è chiuso|ticket est fermé/i)).toBeInTheDocument();
  });

  it('shows a loading ticket list, a loading thread and the poll error banner', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockSupport.isLoading = true;
    const first = renderSupport();
    expect(screen.getAllByText(/loading|laden|caricamento|chargement/i).length).toBeGreaterThan(0);
    first.unmount();

    mockSupport.isLoading = true;
    mockSupport.tickets = [
      {
        uid: 't1',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [{ id: 1, message: 'hello', status: 'Sent' }],
      },
    ];
    mockSupport.supportIssue = undefined;
    const { unmount } = renderSupport();
    fireEvent.click(screen.getAllByText(/hello/)[0]);
    expect(screen.getAllByText(/loading|laden|caricamento|chargement/i).length).toBeGreaterThan(0);
    unmount();

    mockSupport.isLoading = false;
    mockSupport.isError = true;
    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [{ id: 1, message: 'hello', status: 'Sent', author: 'Customer', created: '2026-01-02T10:00:00Z' }],
    };
    renderSupport();
    fireEvent.click(screen.getAllByText(/hello/)[0]);
    expect(screen.getAllByText(/couldn't load|nicht laden|caricare|charger/i).length).toBeGreaterThan(0);
  });

  it('attaches a file, sends it, and ignores an empty file pick', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockUser.user = { mail: 'a@b.c' };
    mockSupport.tickets = [
      {
        uid: 't1',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [{ id: 1, message: 'hello', status: 'Sent' }],
      },
    ];
    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [{ id: 1, message: 'hello', status: 'Sent', author: 'Customer', created: '2026-01-02T10:00:00Z' }],
    };
    renderSupport();
    fireEvent.click(screen.getAllByText(/hello/)[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Attach file' }));
    const input = document.getElementById('chatFileInput') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    const ok = new File(['note'], 'note.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [ok] } });
    expect(screen.getByText('note.pdf')).toBeInTheDocument();
    fireEvent.click(screen.getByText('✕'));
    expect(screen.queryByText('note.pdf')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { files: [ok] } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(mockSupport.submitMessage).toHaveBeenCalledWith(undefined, [ok]));
  });

  it('sends on Enter, keeps Shift+Enter, and toasts a submit failure', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockSupport.tickets = [
      {
        uid: 't1',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [{ id: 1, message: 'hello', status: 'Sent' }],
      },
    ];
    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [{ id: 1, message: 'hello', status: 'Sent', author: 'Customer', created: '2026-01-02T10:00:00Z' }],
    };
    mockSupport.submitMessage.mockRejectedValueOnce(new Error('send-down'));
    renderSupport();
    fireEvent.click(screen.getAllByText(/hello/)[0]);
    const composer = screen.getAllByLabelText('Message').at(-1) as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: 'ping' } });
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true });
    expect(mockSupport.submitMessage).not.toHaveBeenCalled();
    fireEvent.keyDown(composer, { key: 'Enter' });
    await waitFor(() => expect(mockSupport.submitMessage).toHaveBeenCalled());
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    fireEvent.change(composer, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  });

  it('settles a successful send, a failed send and a replaced retry', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    const issue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [{ id: 1, message: 'hello', status: 'Sent', author: 'Customer', created: '2026-01-02T10:00:00Z' }],
    };
    mockSupport.tickets = [{ ...issue, created: '2026-01-02T10:00:00Z', messages: issue.messages }];
    mockSupport.supportIssue = issue;
    renderSupport();
    fireEvent.click(screen.getAllByText(/hello/)[0]);
    const composer = screen.getAllByLabelText('Message').at(-1) as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: 'follow up' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(mockSupport.submitMessage).toHaveBeenCalled());

    mockSupport.supportIssue = {
      ...issue,
      messages: [
        ...issue.messages,
        { id: 2, message: 'follow up', status: 'Pending', author: 'Customer', created: new Date().toISOString() },
      ],
    };
    fireEvent.change(screen.getByLabelText(/search for your problem/i), { target: { value: 'x' } });
    await waitFor(() => expect(composer.value).toBe(''));

    mockSupport.supportIssue = {
      ...issue,
      messages: [
        { id: 3, message: 'failed one', status: 'Failed', author: 'Customer', created: '2026-01-02T11:00:00Z' },
      ],
    };
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getAllByText(/hello|failed one/)[0]);
    expect(await screen.findByRole('button', { name: /retry|erneut senden|riprova|réessayer/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut senden|riprova|réessayer/i }));
    await waitFor(() => expect(mockSupport.submitMessage).toHaveBeenCalledTimes(2));

    mockSupport.supportIssue = {
      ...issue,
      messages: [
        { id: 3, message: 'failed one', status: 'Failed', author: 'Customer', created: '2026-01-02T11:00:00Z' },
        { id: 4, message: 'failed one', status: 'Failed', author: 'Customer', created: new Date().toISOString() },
      ],
    };
    fireEvent.change(screen.getAllByLabelText('Message').at(-1) as HTMLElement, { target: { value: 'x' } });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('times out a retry send, hides the replaced message and later drops the marker', async () => {
    jest.useFakeTimers();
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    const issue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [{ id: 1, message: 'hello', status: 'Sent', author: 'Customer', created: '2026-01-02T10:00:00Z' }],
    };
    mockSupport.tickets = [
      {
        uid: 't1',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [{ id: 3, message: 'send-hang', status: 'Failed' }],
      },
    ];
    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [
        { id: 3, message: 'send-hang', status: 'Failed', author: 'Customer', created: '2026-01-02T11:00:00Z' },
      ],
    };
    mockSupport.submitMessage.mockImplementation(() => new Promise(() => undefined));
    renderSupport();
    fireEvent.click(screen.getByRole('button', { name: /send-hang/i }));
    fireEvent.click(screen.getByRole('button', { name: /^retry$|^erneut senden$|^riprova$|^réessayer$/i }));

    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [
        { id: 3, message: 'send-hang', status: 'Failed', author: 'Customer', created: '2026-01-02T11:00:00Z' },
        { id: 8, message: 'send-hang', status: 'Sent', author: 'Customer', created: new Date().toISOString() },
      ],
    };
    fireEvent.change(screen.getByLabelText(/search for your problem/i), { target: { value: 'z' } });
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [
        { id: 8, message: 'send-hang', status: 'Failed', author: 'Customer', created: new Date().toISOString() },
      ],
    };
    fireEvent.change(screen.getByLabelText(/search for your problem/i), { target: { value: 'zz' } });
  });

  it('retries a failed attachment and toasts when the local file is missing', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    const encoded = window.btoa('hello-bytes');
    mockSupport.tickets = [
      {
        uid: 't1',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [{ id: 1, fileName: 'note.txt', status: 'Failed' }],
      },
    ];
    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [
        {
          id: 1,
          fileName: 'note.txt',
          file: { file: `data:text/plain;base64,${encoded}`, type: 'text/plain' },
          status: 'Failed',
          author: 'Customer',
          created: '2026-01-02T10:00:00Z',
        },
      ],
    };
    renderSupport();
    fireEvent.click(screen.getByRole('button', { name: /note.txt/i }));
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut senden|riprova|réessayer/i }));
    await waitFor(() => expect(mockSupport.submitMessage).toHaveBeenCalled());

    mockSupport.tickets = [
      {
        uid: 't1',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [{ id: 2, fileName: 'bad.bin', status: 'Failed' }],
      },
    ];
    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [
        {
          id: 2,
          fileName: 'bad.bin',
          file: { file: 'data:application/octet-stream;base64,!!!!', type: 'application/octet-stream' },
          status: 'Failed',
          author: 'Customer',
          created: '2026-01-02T10:00:00Z',
        },
      ],
    };
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: /bad\.bin/i }));
    const decode = window.atob;
    window.atob = () => {
      throw new Error('bad-b64');
    };
    const retry = await screen.findByRole('button', { name: /^retry$|^erneut senden$|^riprova$|^réessayer$/i });
    fireEvent.click(retry);
    window.atob = decode;
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('toasts when retrying a corrupt local attachment', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockSupport.tickets = [
      {
        uid: 't1',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [{ id: 2, fileName: 'bad.bin', status: 'Failed' }],
      },
    ];
    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [
        {
          id: 2,
          fileName: 'bad.bin',
          file: { file: 'data:application/octet-stream;base64,xxxx', type: 'application/octet-stream' },
          status: 'Failed',
          author: 'Customer',
          created: '2026-01-02T10:00:00Z',
        },
      ],
    };
    const decode = window.atob;
    window.atob = () => {
      throw new Error('bad-b64');
    };
    renderSupport();
    fireEvent.click(screen.getByRole('button', { name: /bad\.bin/i }));
    fireEvent.click(screen.getByRole('button', { name: /^retry$|^erneut senden$|^riprova$|^réessayer$/i }));
    window.atob = decode;
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('loads image and non-image attachments, including a raw base64 retry payload', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    const raw = window.btoa('img-bytes');
    mockSupport.loadFileData.mockImplementation(async (id: number) => {
      const issue = mockSupport.supportIssue as { messages: Array<Record<string, unknown>> };
      const message = issue.messages.find((item) => item.id === id);
      if (message) message.file = { ...(message.file as object), url: `https://files.example/${id}` };
    });
    mockSupport.tickets = [
      {
        uid: 't1',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [{ id: 1, message: 'photo-thread', status: 'Sent' }],
      },
    ];
    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [
        {
          id: 1,
          fileName: 'shot.png',
          status: 'Sent',
          author: 'Support',
          created: '2026-01-02T10:00:00Z',
        },
        {
          id: 2,
          fileName: 'brief.pdf',
          file: { url: 'https://files.example/brief.pdf' },
          status: 'Sent',
          author: 'Support',
          created: '2026-01-02T10:01:00Z',
        },
        {
          id: 3,
          fileName: 'raw.bin',
          file: { file: raw, type: 'application/octet-stream' },
          status: 'Failed',
          author: 'Customer',
          created: '2026-01-02T10:02:00Z',
        },
        {
          id: 4,
          fileName: 'empty.bin',
          file: { file: 'data:application/octet-stream;base64,', type: 'application/octet-stream' },
          status: 'Failed',
          author: 'Customer',
          created: '2026-01-02T10:03:00Z',
        },
      ],
    };
    renderSupport();
    fireEvent.click(screen.getByRole('button', { name: /photo-thread/i }));
    await waitFor(() => expect(mockSupport.loadFileData).toHaveBeenCalledWith(1));

    fireEvent.click(screen.getByText('brief.pdf'));
    fireEvent.keyDown(screen.getByText('brief.pdf'), { key: 'Enter' });

    fireEvent.click(screen.getAllByRole('button', { name: /retry|erneut senden|riprova|réessayer/i })[0]);
    await waitFor(() => expect(mockSupport.submitMessage).toHaveBeenCalled());
  });

  it('toasts when an attachment fetch fails and ignores a second send while busy', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockSupport.loadFileData.mockRejectedValue(new Error('file-down'));
    mockSupport.submitMessage.mockImplementation(() => new Promise(() => undefined));
    mockSupport.tickets = [
      {
        uid: 't1',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [{ id: 1, fileName: 'doc.pdf', status: 'Sent' }],
      },
    ];
    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [
        {
          id: 1,
          fileName: 'doc.pdf',
          status: 'Sent',
          author: 'Support',
          created: '2026-01-02T10:00:00Z',
        },
        {
          id: 2,
          message: 'retry-me',
          status: 'Failed',
          author: 'Customer',
          created: '2026-01-02T10:01:00Z',
        },
      ],
    };
    renderSupport();
    fireEvent.click(screen.getByRole('button', { name: /doc\.pdf/i }));
    fireEvent.click(screen.getByText('doc.pdf'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    const composer = screen.getAllByLabelText('Message').at(-1) as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: 'busy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut senden|riprova|réessayer/i }));
    expect(mockSupport.submitMessage).toHaveBeenCalledTimes(1);
  });

  it('closes the new-issue sheet from the scrim and auto-load/file-miss paths', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockUser.user = { mail: 'a@b.c' };
    mockSupport.loadFileData.mockRejectedValueOnce(new Error('img-down'));
    mockSupport.tickets = [
      {
        uid: 't1',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [{ id: 1, fileName: 'shot.png', status: 'Sent' }],
      },
    ];
    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [
        {
          id: 1,
          fileName: 'shot.png',
          status: 'Sent',
          author: 'Support',
          created: '2026-01-02T10:00:00Z',
        },
        {
          id: 2,
          fileName: 'miss.pdf',
          status: 'Sent',
          author: 'Support',
          created: '2026-01-02T10:01:00Z',
        },
      ],
    };
    renderSupport();
    fireEvent.click(screen.getByRole('button', { name: /shot\.png/i }));
    await waitFor(() => expect(mockSupport.loadFileData).toHaveBeenCalled());
    mockSupport.loadFileData.mockImplementationOnce(async () => {
      const issue = mockSupport.supportIssue as { messages: Array<Record<string, unknown>> };
      const message = issue.messages.find((item) => item.id === 2);
      if (message) message.file = { url: 'https://files.example/miss.pdf' };
    });
    fireEvent.click(screen.getByText('miss.pdf'));
    await waitFor(() => expect(mockSupport.loadFileData).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByText(/create a support ticket|support-ticket erstellen|crea un ticket|créer un ticket/i));
    fireEvent.click(document.querySelector('.scrim') as HTMLElement);
    expect(screen.queryByRole('button', { name: /submit ticket/i })).not.toBeInTheDocument();
  });

  it('closes the new-issue sheet from the header', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockUser.user = { mail: 'a@b.c' };
    renderSupport();
    fireEvent.click(screen.getByText(/create a support ticket|support-ticket erstellen|crea un ticket|créer un ticket/i));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('button', { name: /submit ticket/i })).not.toBeInTheDocument();
  });

  it('retries a failed ticket list, ignores a second create, and toasts a missing local file', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockUser.user = { mail: 'a@b.c' };
    mockSupport.loadTickets.mockRejectedValueOnce(new Error('down')).mockRejectedValueOnce(new Error('down'));
    renderSupport();
    expect(await screen.findByText(/couldn't load|nicht laden|caricare|charger/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut|riprova|réessayer/i }));
    await waitFor(() => expect(mockSupport.loadTickets).toHaveBeenCalledTimes(2));

    mockSupport.loadTickets.mockResolvedValue(undefined);
    let resolveCreate: ((uid: string) => void) | undefined;
    mockSupport.createSupportIssue.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    fireEvent.click(screen.getByText(/create a support ticket|support-ticket erstellen|crea un ticket|créer un ticket/i));
    fireEvent.change(screen.getAllByLabelText('Message')[0], { target: { value: 'wait' } });
    fireEvent.click(screen.getByRole('button', { name: /submit ticket/i }));
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    expect(mockSupport.createSupportIssue).toHaveBeenCalledTimes(1);
    resolveCreate?.('uid-wait');
    await waitFor(() => expect(mockSupport.loadSupportIssue).toHaveBeenCalledWith('uid-wait'));
  });

  it('retries a failed message with no local file and ignores an attachment click while loading', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockSupport.loadFileData.mockImplementation(() => new Promise(() => undefined));
    mockSupport.tickets = [
      {
        uid: 't1',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [{ id: 1, message: 'open-me', status: 'Sent' }],
      },
    ];
    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [
        {
          id: 1,
          fileName: 'gone.pdf',
          status: 'Failed',
          author: 'Customer',
          created: '2026-01-02T10:00:00Z',
        },
        {
          id: 2,
          fileName: 'shot.png',
          status: 'Sent',
          author: 'Support',
          created: '2026-01-02T10:01:00Z',
        },
        {
          id: 3,
          fileName: 'empty.bin',
          file: { file: 'data:application/octet-stream;base64,', type: 'application/octet-stream' },
          status: 'Failed',
          author: 'Customer',
          created: '2026-01-02T10:02:00Z',
        },
      ],
    };
    renderSupport();
    fireEvent.click(screen.getByRole('button', { name: /open-me/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /^retry$|^erneut senden$|^riprova$|^réessayer$/i })[0]);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    document.querySelectorAll('.msg-file').forEach((node) => fireEvent.click(node));
    fireEvent.click(screen.getAllByRole('button', { name: /^retry$|^erneut senden$|^riprova$|^réessayer$/i })[1]);
  });

  it('toasts when attachment bytes load without a URL and ignores a send for another ticket', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockSupport.loadFileData.mockResolvedValue(undefined);
    mockSupport.submitMessage.mockImplementation(() => new Promise(() => undefined));
    mockSupport.tickets = [
      {
        uid: 't1',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [{ id: 1, fileName: 'doc.pdf', status: 'Sent' }],
      },
    ];
    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [
        {
          id: 1,
          fileName: 'doc.pdf',
          status: 'Sent',
          author: 'Support',
          created: '2026-01-02T10:00:00Z',
        },
      ],
    };
    renderSupport();
    fireEvent.click(screen.getByRole('button', { name: /doc\.pdf/i }));
    fireEvent.click(screen.getByText('doc.pdf'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    const composer = screen.getAllByLabelText('Message').at(-1) as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: 'cross' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    mockSupport.supportIssue = {
      uid: 'other',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [],
    };
    fireEvent.change(screen.getByLabelText(/search for your problem/i), { target: { value: 'zz' } });
  });

  it('submits a ticket with an out-of-range type', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockUser.user = { mail: 'a@b.c' };
    renderSupport();
    fireEvent.click(screen.getByText(/create a support ticket|support-ticket erstellen|crea un ticket|créer un ticket/i));
    fireEvent.change(screen.getByLabelText('Topic', { selector: 'select' }), { target: { value: '99' } });
    fireEvent.change(screen.getAllByLabelText('Message')[0], { target: { value: 'typed' } });
    fireEvent.click(screen.getByRole('button', { name: /submit ticket/i }));
    await waitFor(() => expect(mockSupport.createSupportIssue).toHaveBeenCalled());
  });

  it('skips download when an inline image is tapped', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockUser.user = { mail: 'a@b.c' };
    mockSupport.tickets = [
      {
        uid: 'img',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [{ id: 1, fileName: 'shot.png', status: 'Sent' }],
      },
    ];
    mockSupport.supportIssue = {
      uid: 'img',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [
        {
          id: 1,
          fileName: 'shot.png',
          file: { url: 'https://files.example/shot.png' },
          status: 'Sent',
          author: 'Support',
          created: '2026-01-02T10:00:00Z',
        },
      ],
    };
    renderSupport();
    fireEvent.click(screen.getByRole('button', { name: /shot\.png/i }));
    fireEvent.click(await screen.findByAltText('shot.png'));
  });

  it('retries a typeless attachment and downloads a ready document', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockUser.user = { mail: 'a@b.c' };
    mockSupport.tickets = [
      {
        uid: 't1',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [{ id: 1, fileName: 'note.txt', status: 'Failed' }],
      },
    ];
    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [
        {
          id: 1,
          fileName: 'note.txt',
          file: { file: btoa('hi') },
          status: 'Failed',
          author: 'Customer',
          created: '2026-01-02T10:01:00Z',
        },
        {
          id: 2,
          fileName: 'brief.pdf',
          file: { url: 'https://files.example/brief.pdf' },
          status: 'Sent',
          author: 'Support',
          created: '2026-01-02T10:02:00Z',
        },
      ],
    };
    renderSupport();
    fireEvent.click(screen.getByRole('button', { name: /note\.txt/i }));
    const pdfs = await screen.findAllByText('brief.pdf');
    fireEvent.click(pdfs[pdfs.length - 1]);
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut senden|riprova|réessayer/i }));
    await waitFor(() => expect(mockSupport.submitMessage).toHaveBeenCalled());
  });

  it('sends a file-only message and times out after the issue uid changes', async () => {
    jest.useFakeTimers();
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockUser.user = { mail: 'a@b.c' };
    mockSupport.submitMessage.mockImplementation(() => new Promise(() => undefined));
    mockSupport.tickets = [
      {
        uid: 't1',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [{ id: 1, message: 'hello', status: 'Sent' }],
      },
    ];
    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [{ id: 1, message: 'hello', status: 'Sent', author: 'Customer', created: '2026-01-02T10:00:00Z' }],
    };
    renderSupport();
    fireEvent.click(screen.getByRole('button', { name: /hello/i }));
    const input = document.getElementById('chatFileInput') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], 'note.txt', { type: '' });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    mockSupport.supportIssue = {
      uid: 'other',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [{ id: 1, message: 'hello', status: 'Sent', author: 'Customer', created: '2026-01-02T10:00:00Z' }],
    };
    fireEvent.change(screen.getByLabelText(/search for your problem/i), { target: { value: 'z' } });
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('times out a send, a matching sent candidate and a retry', async () => {
    jest.useFakeTimers();
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockUser.user = { mail: 'a@b.c' };
    mockSupport.submitMessage.mockImplementation(() => new Promise(() => undefined));
    mockSupport.tickets = [
      {
        uid: 't1',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [{ id: 1, message: 'hello', status: 'Sent' }],
      },
    ];
    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [
        { id: 1, message: 'hello', status: 'Sent', author: 'Customer', created: '2026-01-02T10:00:00Z' },
        {
          id: 2,
          message: 'retry-me',
          fileName: 'note.txt',
          file: { file: btoa('hi') },
          status: 'Failed',
          author: 'Customer',
          created: '2026-01-02T10:01:00Z',
        },
      ],
    };
    renderSupport();
    fireEvent.click(screen.getByRole('button', { name: /hello/i }));
    const composer = screen.getAllByLabelText('Message').at(-1) as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: 'follow up' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [
        { id: 1, message: 'hello', status: 'Sent', author: 'Customer', created: '2026-01-02T10:00:00Z' },
        {
          id: 2,
          message: 'retry-me',
          fileName: 'note.txt',
          file: { file: btoa('hi') },
          status: 'Failed',
          author: 'Customer',
          created: '2026-01-02T10:01:00Z',
        },
        { id: 3, message: 'follow up', status: 'Sent', author: 'Customer', created: new Date().toISOString() },
      ],
    };
    fireEvent.change(screen.getByLabelText(/search for your problem/i), { target: { value: 'x' } });
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    const retries = screen.getAllByRole('button', { name: /retry|erneut senden|riprova|réessayer/i });
    fireEvent.click(retries[retries.length - 1]);
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('clears the composer when a pending send settles and keeps it on failure', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    mockUser.user = { mail: 'a@b.c' };
    mockSupport.submitMessage.mockImplementation(() => new Promise(() => undefined));
    mockSupport.tickets = [
      {
        uid: 't1',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [{ id: 1, message: 'hello', status: 'Sent' }],
      },
    ];
    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [{ id: 1, message: 'hello', status: 'Sent', author: 'Customer', created: '2026-01-02T10:00:00Z' }],
    };
    renderSupport();
    fireEvent.click(screen.getByRole('button', { name: /hello/i }));
    const composer = screen.getAllByLabelText('Message').at(-1) as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: 'pending-ok' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [
        { id: 1, message: 'hello', status: 'Sent', author: 'Customer', created: '2026-01-02T10:00:00Z' },
        { id: 4, message: 'pending-ok', status: 'Pending', author: 'Customer', created: new Date().toISOString() },
      ],
    };
    fireEvent.change(screen.getByLabelText(/search for your problem/i), { target: { value: 'a' } });
    await waitFor(() => expect(composer).toHaveValue(''));

    fireEvent.change(composer, { target: { value: 'keep-me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.change(composer, { target: { value: 'edited' } });
    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [
        { id: 1, message: 'hello', status: 'Sent', author: 'Customer', created: '2026-01-02T10:00:00Z' },
        { id: 6, message: 'keep-me', status: 'Pending', author: 'Customer', created: new Date().toISOString() },
      ],
    };
    fireEvent.change(screen.getByLabelText(/search for your problem/i), { target: { value: 'aa' } });
    await waitFor(() => expect(composer).toHaveValue('edited'));

    fireEvent.change(composer, { target: { value: 'pending-fail' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [
        { id: 1, message: 'hello', status: 'Sent', author: 'Customer', created: '2026-01-02T10:00:00Z' },
        { id: 5, message: 'pending-fail', status: 'Failed', author: 'Customer', created: new Date().toISOString() },
      ],
    };
    fireEvent.change(screen.getByLabelText(/search for your problem/i), { target: { value: 'b' } });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('drops an in-flight image load on unmount and then downloads after a failed auto-load', async () => {
    mockSession.isLoggedIn = true;
    mockSession.address = '0x1';
    let resolveFile: ((value: unknown) => void) | undefined;
    mockSupport.loadFileData.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFile = resolve;
        }),
    );
    mockSupport.tickets = [
      {
        uid: 't1',
        type: 'GenericIssue',
        state: 'Pending',
        created: '2026-01-02T10:00:00Z',
        messages: [{ id: 1, fileName: 'shot.png', status: 'Sent' }],
      },
    ];
    mockSupport.supportIssue = {
      uid: 't1',
      type: 'GenericIssue',
      state: 'Pending',
      messages: [
        {
          id: 1,
          fileName: 'shot.png',
          status: 'Sent',
          author: 'Support',
          created: '2026-01-02T10:00:00Z',
        },
      ],
    };
    const pending = renderSupport();
    fireEvent.click(screen.getByRole('button', { name: /shot\.png/i }));
    pending.unmount();
    resolveFile?.(undefined);

    mockSupport.loadFileData.mockReset();
    mockSupport.loadFileData.mockRejectedValueOnce(new Error('img-down'));
    mockSupport.loadFileData.mockImplementationOnce(async () => {
      const issue = mockSupport.supportIssue as { messages: Array<Record<string, unknown>> };
      issue.messages[0].file = { url: 'https://files.example/shot.png' };
    });
    renderSupport();
    fireEvent.click(screen.getByRole('button', { name: /shot\.png/i }));
    expect(await screen.findByText('shot.png')).toBeInTheDocument();
    fireEvent.click(screen.getByText('shot.png'));
    await waitFor(() => expect(mockSupport.loadFileData).toHaveBeenCalled());
  });
});
