// Unit tests for SupportDashboardIssueScreen ticket switches. Heavy dependencies are mocked so the
// tests focus on stale issue state, request generations, update state, and file-preview cleanup.

const mockUseSupportDashboardGuard = jest.fn();
const mockGetIssueData = jest.fn();
const mockGetIssueMessages = jest.fn();
const mockGetClerks = jest.fn();
const mockUpdateIssue = jest.fn();
const mockSendMessage = jest.fn();
const mockGetMessageFile = jest.fn();
const mockGetUserData = jest.fn();
const mockNavigate = jest.fn();
const mockHandleSplitDrag = jest.fn();

const mockParams: { id?: string } = { id: '1' };
let mockDraftText = '';
let mockListMounts = 0;

jest.mock('@dfx.swiss/react', () => ({
  Department: {
    SUPPORT: 'Support',
    COMPLIANCE: 'Compliance',
  },
  UserRole: {
    ADMIN: 'Admin',
    SUPPORT: 'Support',
    COMPLIANCE: 'Compliance',
  },
  SupportIssueInternalState: {
    CREATED: 'Created',
    PENDING: 'Pending',
    ON_HOLD: 'OnHold',
    CANCELED: 'Canceled',
    COMPLETED: 'Completed',
  },
  useAuthContext: () => ({ session: { role: 'Admin' } }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: ({ size }: { size?: string }) => <div data-testid="loading-spinner" data-size={size} />,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/components/support/info-panel', () => {
  const { useRef } = jest.requireActual('react') as typeof import('react');

  return {
    InfoPanel: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    InfoRow: ({ value }: { value?: React.ReactNode }) => <div>{value}</div>,
    SupportMessageList: ({
      messages,
      onOpenFile,
    }: {
      messages?: { id?: number; message?: string; fileName?: string }[];
      onOpenFile?: (msg: unknown) => void;
    }) => {
      const mountId = useRef(++mockListMounts);
      return (
        <div data-testid="message-list" data-mount={String(mountId.current)}>
          {messages?.map((message, index) => (
            <div key={index}>{message.message}</div>
          ))}
          <button
            type="button"
            data-testid="open-file"
            onClick={() =>
              onOpenFile?.({
                id: 99,
                fileName: 'a.pdf',
                author: 'Customer',
                created: '2026-01-01T00:00:00Z',
              })
            }
          >
            Open
          </button>
        </div>
      );
    },
  };
});

jest.mock('src/components/compliance/file-preview-panel', () => ({
  FilePreviewPanel: () => null,
}));

jest.mock('src/components/compliance/limit-request-decision-form', () => ({
  LimitRequestDecisionForm: () => null,
}));

jest.mock('src/components/support/ticket-note-panel', () => ({
  TicketNotePanel: () => null,
}));

jest.mock('src/components/support-templates/template-array-picker-modal', () => ({
  TemplateArrayPickerModal: () => null,
}));

jest.mock('src/components/support-templates/template-picker-modal', () => ({
  TemplatePickerModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="template-picker-modal" /> : null,
}));

jest.mock('src/components/compliance/staff-identity', () => ({
  STAFF_NAME_MISSING: 'Staff name missing',
  staffNameLoadError: (error: string) => `Staff name error: ${error}`,
}));

jest.mock('src/hooks/guard.hook', () => ({
  useSupportDashboardGuard: (...args: unknown[]) => mockUseSupportDashboardGuard(...args),
}));

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
  LimitRequestFinalDecisions: [],
  useCompliance: () => ({ getUserData: mockGetUserData }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

jest.mock('src/hooks/split-pane.hook', () => ({
  useSplitPane: () => ({
    containerRef: { current: null },
    splitPercent: 70,
    handleSplitDrag: mockHandleSplitDrag,
  }),
}));

jest.mock('src/hooks/support-draft.hook', () => ({
  useSupportDraft: () => [mockDraftText, jest.fn(), jest.fn()],
}));

jest.mock('src/hooks/staff-verified-name.hook', () => ({
  useStaffVerifiedName: () => ({ name: 'Rita', isLoading: false, error: undefined }),
}));

jest.mock('react-router-dom', () => ({
  useParams: () => mockParams,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_namespace: string, value: string) => value }),
}));

jest.mock('src/util/compliance-helpers', () => ({
  formatDateTime: (value: string) => value,
  statusBadge: (status: string) => <span>{status}</span>,
}));

jest.mock('src/util/support-helpers', () => ({
  reasonLabel: (reason: string) => reason,
  typeLabel: (type: string) => type,
}));

jest.mock('src/util/support-draft', () => ({
  writeDraft: jest.fn(),
}));

jest.mock('src/util/template-placeholders', () => ({
  detectPlaceholders: () => [],
  requiresArraySelection: () => false,
  resolvePlaceholders: (content: string) => content,
}));

jest.mock('src/util/utils', () => ({
  saveBufferedFile: jest.fn(),
  toBase64: jest.fn(),
}));

jest.mock('src/util/message-composer', () => ({
  isSendShortcut: () => false,
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import SupportDashboardIssueScreen from 'src/screens/support-dashboard-issue.screen';
import { writeDraft } from 'src/util/support-draft';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  const controls = {
    resolve: (_value: T) => {
      throw new Error('deferred not initialized');
    },
    reject: (_reason: unknown) => {
      throw new Error('deferred not initialized');
    },
  };
  const promise = new Promise<T>((resolve, reject) => {
    controls.resolve = resolve;
    controls.reject = reject;
  });
  return { promise, resolve: controls.resolve, reject: controls.reject };
}

function issue(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    created: '2026-01-01T00:00:00Z',
    uid: 'SI-' + id,
    type: 'GenericIssue',
    department: 'Support',
    reason: 'Other',
    state: 'Pending',
    name: 'Ticket ' + id,
    account: { id: 8, status: 'Active', kycLevel: '50', annualVolume: 0, kycHash: 'h' },
    ...extra,
  };
}

function navigateTo(id: string, rerender: (ui: React.ReactElement) => void): void {
  mockParams.id = id;
  rerender(<SupportDashboardIssueScreen />);
}

describe('SupportDashboardIssueScreen ticket switches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.id = '1';
    mockDraftText = '';
    mockListMounts = 0;
    mockGetIssueData.mockImplementation((id: number) => Promise.resolve(issue(id)));
    mockGetIssueMessages.mockImplementation((uid: string) => Promise.resolve([{ id: 1, message: `body-${uid}` }]));
    mockGetClerks.mockResolvedValue([]);
    mockUpdateIssue.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue(undefined);
    mockGetUserData.mockResolvedValue({ userData: { id: 8 }, transactions: [] });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('hides ticket A load errors on the first render after switching to ticket B', async () => {
    mockGetIssueData.mockRejectedValueOnce(new Error('ticket A exploded'));
    const { rerender } = render(<SupportDashboardIssueScreen />);

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('ticket A exploded');

    navigateTo('2', rerender);

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.queryByText('ticket A exploded')).not.toBeInTheDocument();
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();
  });

  it('shows the load error for ticket B after a successful ticket A load', async () => {
    const { rerender } = render(<SupportDashboardIssueScreen />);

    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();

    mockGetIssueData.mockImplementation((id: number) => {
      if (id === 2) return Promise.reject(new Error('ticket B exploded'));
      return Promise.resolve(issue(id));
    });
    navigateTo('2', rerender);

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('ticket B exploded');
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('remounts the message list and removes ticket A messages when switching to ticket B', async () => {
    mockGetIssueMessages.mockImplementation((uid: string) =>
      Promise.resolve([{ id: uid === 'SI-1' ? 1 : 2, message: uid === 'SI-1' ? 'body-A' : 'body-B' }]),
    );
    const { rerender } = render(<SupportDashboardIssueScreen />);

    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();
    expect(await screen.findByText('body-A')).toBeInTheDocument();
    const firstMount = Number(screen.getByTestId('message-list').getAttribute('data-mount'));

    navigateTo('2', rerender);

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();
    expect(await screen.findByText('body-B')).toBeInTheDocument();
    const secondMount = Number(screen.getByTestId('message-list').getAttribute('data-mount'));

    expect(secondMount).toBeGreaterThan(firstMount);
    expect(screen.queryByText('body-A')).not.toBeInTheDocument();
  });

  it('ignores the first ticket A request after an A to B to A navigation', async () => {
    const firstTicketA = createDeferred<ReturnType<typeof issue>>();
    let ticketACalls = 0;
    mockGetIssueData.mockImplementation((id: number) => {
      if (id !== 1) return Promise.resolve(issue(id));
      ticketACalls += 1;
      return ticketACalls === 1 ? firstTicketA.promise : Promise.resolve(issue(1));
    });
    const { rerender } = render(<SupportDashboardIssueScreen />);

    await waitFor(() => expect(mockGetIssueData).toHaveBeenCalledWith(1));
    navigateTo('2', rerender);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();

    navigateTo('1', rerender);
    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();

    await act(async () => {
      firstTicketA.resolve(issue(1, { name: 'Stale A' }));
      await firstTicketA.promise;
    });

    expect(screen.queryByText('Stale A')).not.toBeInTheDocument();
    expect(screen.getByText('Ticket 1')).toBeInTheDocument();
  });

  it('clears the updating indicator when switching tickets', async () => {
    const update = createDeferred<void>();
    mockUpdateIssue.mockReturnValue(update.promise);
    const { rerender } = render(<SupportDashboardIssueScreen />);

    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(screen.getByRole('button', { name: 'Updating...' })).toBeInTheDocument();

    navigateTo('2', rerender);

    expect(screen.queryByText('Updating...')).not.toBeInTheDocument();
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();
    expect(screen.queryByText('Updating...')).not.toBeInTheDocument();
  });

  it('revokes the open file preview URL when switching tickets', async () => {
    if (typeof URL.createObjectURL !== 'function') {
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn() });
    }
    if (typeof URL.revokeObjectURL !== 'function') {
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
    }
    const createObjectURL = jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ticket-preview');
    const revokeObjectURL = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    mockGetMessageFile.mockResolvedValue({
      data: { type: 'Buffer', data: [1, 2, 3] },
      contentType: 'application/pdf',
    });
    const { rerender } = render(<SupportDashboardIssueScreen />);

    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId('open-file'));
    });
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());

    navigateTo('2', rerender);

    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:ticket-preview'));
  });

  it('does not open the template picker on ticket B with ticket A user data', async () => {
    const userDataA = createDeferred<{ userData: { id: number }; transactions: never[] }>();
    mockGetUserData.mockReturnValue(userDataA.promise);
    const { rerender } = render(<SupportDashboardIssueScreen />);

    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Vorlage einfügen'));
    expect(mockGetUserData).toHaveBeenCalledWith(8);

    navigateTo('2', rerender);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();

    await act(async () => {
      userDataA.resolve({ userData: { id: 8 }, transactions: [] });
      await userDataA.promise;
    });

    expect(screen.queryByTestId('template-picker-modal')).not.toBeInTheDocument();
  });

  it('does not clear B sendInFlight when a stale A send finishes', async () => {
    mockDraftText = 'hello';
    const sendA = createDeferred<void>();
    mockSendMessage.mockReturnValueOnce(sendA.promise).mockReturnValue(new Promise(() => undefined));
    const { rerender } = render(<SupportDashboardIssueScreen />);

    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByRole('button', { name: '...' })).toBeDisabled();

    navigateTo('2', rerender);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(mockSendMessage).toHaveBeenCalledTimes(2);

    await act(async () => {
      sendA.resolve();
      await sendA.promise;
    });

    expect(screen.getByRole('button', { name: '...' })).toBeDisabled();
  });

  it('does not start a second send on A after A to B to A while A is in flight', async () => {
    mockDraftText = 'hello';
    const sendA = createDeferred<void>();
    mockSendMessage.mockReturnValue(sendA.promise);
    const { rerender } = render(<SupportDashboardIssueScreen />);

    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(mockSendMessage).toHaveBeenCalledTimes(1);

    navigateTo('2', rerender);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();

    mockDraftText = 'hello';
    navigateTo('1', rerender);
    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: '...' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '...' }));
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it('writes ticket A draft after a failed send even if the clerk switched to B', async () => {
    mockDraftText = 'hello';
    const sendA = createDeferred<void>();
    mockSendMessage.mockReturnValue(sendA.promise);
    const { rerender } = render(<SupportDashboardIssueScreen />);

    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    navigateTo('2', rerender);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();

    await act(async () => {
      sendA.reject(new Error('Send failed'));
      await sendA.promise.catch(() => undefined);
    });

    expect(writeDraft).toHaveBeenCalledWith('1', 'hello');
  });

  it('keeps A updating after A to B to A and reloads A when the PUT finishes', async () => {
    const update = createDeferred<void>();
    mockUpdateIssue.mockReturnValue(update.promise);
    const { rerender } = render(<SupportDashboardIssueScreen />);

    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(mockUpdateIssue).toHaveBeenCalledTimes(1);

    navigateTo('2', rerender);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();

    navigateTo('1', rerender);
    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Updating...' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Updating...' }));
    expect(mockUpdateIssue).toHaveBeenCalledTimes(1);

    const ticketALoadsBeforePut = mockGetIssueData.mock.calls.filter((call) => call[0] === 1).length;

    await act(async () => {
      update.resolve();
      await update.promise;
    });

    await waitFor(() => {
      expect(mockGetIssueData.mock.calls.filter((call) => call[0] === 1).length).toBeGreaterThan(ticketALoadsBeforePut);
    });
  });

  it('shows the update error on A after a failed update following A to B to A', async () => {
    const update = createDeferred<void>();
    mockUpdateIssue.mockReturnValue(update.promise);
    const { rerender } = render(<SupportDashboardIssueScreen />);

    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    navigateTo('2', rerender);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();

    navigateTo('1', rerender);
    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();

    await act(async () => {
      update.reject(new Error('Update failed'));
      await update.promise.catch(() => undefined);
    });

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Update failed');
  });

  it('reloads ticket A messages when send succeeds after A to B to A', async () => {
    mockDraftText = 'hello';
    const sendA = createDeferred<void>();
    mockSendMessage.mockReturnValue(sendA.promise);
    const { rerender } = render(<SupportDashboardIssueScreen />);

    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(mockSendMessage).toHaveBeenCalledTimes(1);

    navigateTo('2', rerender);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();

    navigateTo('1', rerender);
    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();

    const ticketAMessageLoads = mockGetIssueMessages.mock.calls.filter((call) => call[0] === 'SI-1').length;

    await act(async () => {
      sendA.resolve();
      await sendA.promise;
    });

    await waitFor(() => {
      expect(mockGetIssueMessages.mock.calls.filter((call) => call[0] === 'SI-1').length).toBeGreaterThan(
        ticketAMessageLoads,
      );
    });
  });

  it('does not let a stale loadIssue overwrite the post-PUT payload after A to B to A', async () => {
    const update = createDeferred<void>();
    mockUpdateIssue.mockReturnValue(update.promise);
    const { rerender } = render(<SupportDashboardIssueScreen />);

    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    const pendingGets: { id: number; deferred: Deferred<ReturnType<typeof issue>> }[] = [];
    mockGetIssueData.mockImplementation((id: number) => {
      const deferred = createDeferred<ReturnType<typeof issue>>();
      pendingGets.push({ id, deferred });
      return deferred.promise;
    });

    navigateTo('2', rerender);
    navigateTo('1', rerender);

    await waitFor(() => {
      expect(pendingGets.filter((call) => call.id === 1).length).toBe(1);
    });

    await act(async () => {
      update.resolve();
      await update.promise;
    });

    await waitFor(() => {
      expect(pendingGets.filter((call) => call.id === 1).length).toBe(2);
    });

    const ticketAGets = pendingGets.filter((call) => call.id === 1);
    const staleGet = ticketAGets[0];
    const postPutGet = ticketAGets[1];

    await act(async () => {
      staleGet.deferred.resolve(issue(1, { clerk: 'StaleClerk' }));
      await staleGet.deferred.promise;
    });

    expect(screen.queryByDisplayValue('StaleClerk')).not.toBeInTheDocument();

    await act(async () => {
      postPutGet.deferred.resolve(issue(1, { clerk: 'FreshClerk' }));
      await postPutGet.deferred.promise;
    });

    expect(await screen.findByDisplayValue('FreshClerk')).toBeInTheDocument();
  });
});
