// Unit tests for RealunitSupportIssueScreen ticket switches. Heavy dependencies are mocked so the
// tests focus on stale issue/message state, ticket-bound updates, and clerk-list fallbacks.

const mockUseRealunitGuard = jest.fn();
const mockGetIssueData = jest.fn();
const mockGetIssueMessages = jest.fn();
const mockGetClerks = jest.fn();
const mockUpdateIssue = jest.fn();
const mockCreateMessage = jest.fn();
const mockGetFile = jest.fn();
const mockNavigate = jest.fn();
const mockHandleSplitDrag = jest.fn();

const mockParams: { id?: string } = { id: '1' };
let mockDraftText = '';

jest.mock('@dfx.swiss/react', () => ({
  Department: {
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
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: ({ size }: { size?: string }) => <div data-testid="loading-spinner" data-size={size} />,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/components/support/info-panel', () => ({
  InfoPanel: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  InfoRow: ({ value }: { value?: React.ReactNode }) => <div>{value}</div>,
  SupportMessageList: ({ messages }: { messages?: { id?: number; message?: string }[] }) => (
    <div data-testid="message-list">
      {messages?.map((message, index) => (
        <div key={index}>{message.message}</div>
      ))}
    </div>
  ),
}));

jest.mock('src/components/compliance/file-preview-panel', () => ({
  FilePreviewPanel: () => null,
}));

jest.mock('src/components/compliance/staff-identity', () => ({
  STAFF_NAME_MISSING: 'Staff name missing',
  staffNameLoadError: (error: string) => `Staff name error: ${error}`,
}));

jest.mock('src/hooks/guard.hook', () => ({
  useRealunitGuard: (...args: unknown[]) => mockUseRealunitGuard(...args),
}));

jest.mock('src/hooks/support-dashboard.hook', () => {
  const actual = jest.requireActual(
    'src/hooks/support-dashboard.hook',
  ) as typeof import('src/hooks/support-dashboard.hook');
  return { ...actual };
});

jest.mock('src/hooks/realunit-support.hook', () => {
  const actual = jest.requireActual(
    'src/hooks/realunit-support.hook',
  ) as typeof import('src/hooks/realunit-support.hook');
  return {
    ...actual,
    useRealunitSupport: () => ({
      getIssueData: mockGetIssueData,
      getIssueMessages: mockGetIssueMessages,
      getClerks: mockGetClerks,
      updateIssue: mockUpdateIssue,
      createMessage: mockCreateMessage,
      getFile: mockGetFile,
    }),
  };
});

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

jest.mock('src/util/utils', () => ({
  saveBufferedFile: jest.fn(),
  toBase64: jest.fn(),
}));

jest.mock('src/util/message-composer', () => ({
  isSendShortcut: () => false,
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import RealunitSupportIssueScreen from 'src/screens/realunit-support-issue.screen';
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
    uid: 'RU-' + id,
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
  rerender(<RealunitSupportIssueScreen />);
}

describe('RealunitSupportIssueScreen ticket switches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.id = '1';
    mockDraftText = '';
    mockGetIssueData.mockImplementation((id: number) => Promise.resolve(issue(id)));
    mockGetIssueMessages.mockImplementation((id: number) => Promise.resolve([{ id, message: `body-${id}` }]));
    mockGetClerks.mockResolvedValue([{ clerkUserDataId: 7, clerk: 'Rita' }]);
    mockUpdateIssue.mockResolvedValue(undefined);
    mockCreateMessage.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ignores a late ticket A load after switching to ticket B', async () => {
    const ticketA = createDeferred<ReturnType<typeof issue>>();
    mockGetIssueData.mockImplementation((id: number) => (id === 1 ? ticketA.promise : Promise.resolve(issue(id))));
    const { rerender } = render(<RealunitSupportIssueScreen />);

    await waitFor(() => expect(mockGetIssueData).toHaveBeenCalledWith(1));
    navigateTo('2', rerender);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();

    await act(async () => {
      ticketA.resolve(issue(1, { name: 'Stale A' }));
      await ticketA.promise;
    });

    expect(screen.queryByText('Stale A')).not.toBeInTheDocument();
    expect(screen.getByText('Ticket 2')).toBeInTheDocument();
  });

  it('ignores the first ticket A request after an A to B to A navigation', async () => {
    const firstTicketA = createDeferred<ReturnType<typeof issue>>();
    let ticketACalls = 0;
    mockGetIssueData.mockImplementation((id: number) => {
      if (id !== 1) return Promise.resolve(issue(id));
      ticketACalls += 1;
      return ticketACalls === 1 ? firstTicketA.promise : Promise.resolve(issue(1));
    });
    const { rerender } = render(<RealunitSupportIssueScreen />);

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

  it('ignores late ticket A messages after switching to ticket B', async () => {
    const messagesA = createDeferred<{ id: number; message: string }[]>();
    mockGetIssueMessages.mockImplementation((id: number) =>
      id === 1 ? messagesA.promise : Promise.resolve([{ id: 2, message: 'body-B' }]),
    );
    const { rerender } = render(<RealunitSupportIssueScreen />);

    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();
    await waitFor(() => expect(mockGetIssueMessages).toHaveBeenCalledWith(1));

    navigateTo('2', rerender);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();
    expect(await screen.findByText('body-B')).toBeInTheDocument();

    await act(async () => {
      messagesA.resolve([{ id: 1, message: 'body-A' }]);
      await messagesA.promise;
    });

    expect(screen.queryByText('body-A')).not.toBeInTheDocument();
    expect(screen.getByText('body-B')).toBeInTheDocument();
  });

  it('does not start a second send on A after A to B to A while A is in flight', async () => {
    mockDraftText = 'hello';
    const sendA = createDeferred<void>();
    mockCreateMessage.mockReturnValue(sendA.promise);
    const { rerender } = render(<RealunitSupportIssueScreen />);

    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(mockCreateMessage).toHaveBeenCalledTimes(1);

    navigateTo('2', rerender);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();

    mockDraftText = 'hello';
    navigateTo('1', rerender);
    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: '...' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '...' }));
    expect(mockCreateMessage).toHaveBeenCalledTimes(1);
  });

  it('writes ticket A draft after a failed send even if the clerk switched to B', async () => {
    mockDraftText = 'hello';
    const sendA = createDeferred<void>();
    mockCreateMessage.mockReturnValue(sendA.promise);
    const { rerender } = render(<RealunitSupportIssueScreen />);

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

  it('does not reload after a ticket A update finishes on ticket B', async () => {
    const updateA = createDeferred<void>();
    mockUpdateIssue.mockReturnValue(updateA.promise);
    const { rerender } = render(<RealunitSupportIssueScreen />);

    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(mockUpdateIssue).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Updating...' })).toBeInTheDocument();

    navigateTo('2', rerender);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();
    expect(screen.queryByText('Updating...')).not.toBeInTheDocument();
    const issueLoadsBeforeUpdateFinishes = mockGetIssueData.mock.calls.length;

    await act(async () => {
      updateA.resolve();
      await updateA.promise;
    });

    expect(mockGetIssueData).toHaveBeenCalledTimes(issueLoadsBeforeUpdateFinishes);
    expect(screen.getByText('Ticket 2')).toBeInTheDocument();
  });

  it('does not show a ticket A update error on ticket B', async () => {
    const updateA = createDeferred<void>();
    mockUpdateIssue.mockReturnValue(updateA.promise);
    const { rerender } = render(<RealunitSupportIssueScreen />);

    expect(await screen.findByText('Ticket 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    navigateTo('2', rerender);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();

    await act(async () => {
      updateA.reject(new Error('Update A failed'));
      await updateA.promise.catch(() => undefined);
    });

    expect(screen.queryByText('Update A failed')).not.toBeInTheDocument();
    expect(screen.getByText('Ticket 2')).toBeInTheDocument();
  });

  it('keeps A updating after A to B to A and reloads A when the PUT finishes', async () => {
    const update = createDeferred<void>();
    mockUpdateIssue.mockReturnValue(update.promise);
    const { rerender } = render(<RealunitSupportIssueScreen />);

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
    const { rerender } = render(<RealunitSupportIssueScreen />);

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

  it('does not let a stale loadIssue overwrite the post-PUT payload after A to B to A', async () => {
    const update = createDeferred<void>();
    mockUpdateIssue.mockReturnValue(update.promise);
    const { rerender } = render(<RealunitSupportIssueScreen />);

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

  it('keeps the rendered post-PUT payload when the stale loadIssue finishes last', async () => {
    const update = createDeferred<void>();
    mockUpdateIssue.mockReturnValue(update.promise);
    const { rerender } = render(<RealunitSupportIssueScreen />);

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
      postPutGet.deferred.resolve(issue(1, { clerk: 'FreshClerk' }));
      await postPutGet.deferred.promise;
    });

    expect(await screen.findByDisplayValue('FreshClerk')).toBeInTheDocument();

    await act(async () => {
      staleGet.deferred.resolve(issue(1, { clerk: 'StaleClerk' }));
      await staleGet.deferred.promise;
    });

    expect(screen.getByDisplayValue('FreshClerk')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('StaleClerk')).not.toBeInTheDocument();
  });

  it('keeps the empty clerk-list hint after switching tickets', async () => {
    const hint = 'Clerk list is empty. Assign after the API update is live.';
    mockGetClerks.mockResolvedValue([]);
    const { rerender } = render(<RealunitSupportIssueScreen />);

    expect(await screen.findByText(hint)).toBeInTheDocument();

    navigateTo('2', rerender);
    expect(await screen.findByText('Ticket 2')).toBeInTheDocument();
    expect(screen.getByText(hint)).toBeInTheDocument();
    expect(mockGetClerks).toHaveBeenCalledTimes(1);
  });

  it('shows an unresolved assigned clerk id as the selected fallback option', async () => {
    mockGetIssueData.mockResolvedValue(issue(1, { clerkUserDataId: 99 }));

    render(<RealunitSupportIssueScreen />);

    expect(await screen.findByDisplayValue('#99')).toHaveValue('99');
  });
});
