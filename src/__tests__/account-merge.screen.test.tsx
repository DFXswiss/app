import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const mockCall = jest.fn();
const mockNavigate = jest.fn();
const mockSetAuthToken = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  useApi: () => ({ call: mockCall }),
  useAuthContext: () => ({ setAuthToken: mockSetAuthToken }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { LG: 'lg' },
  StyledButton: ({ label, onClick }: any) => <button onClick={onClick}>{label}</button>,
  StyledLoadingSpinner: () => <div role="progressbar" />,
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_key: string, text: string) => text }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: jest.fn(),
}));

let mockUrlParams: URLSearchParams;
jest.mock('react-router-dom', () => ({
  useSearchParams: () => [mockUrlParams, jest.fn()],
}));

import AccountMerge from '../screens/account-merge.screen';
import { JobStatus } from '../util/job';

const MERGE_URL = 'auth/mail/confirm';
const JOB = { uid: 'job-uid', expectedSeconds: 65 };
// The screen polls once a second, so anything waiting on a poll has to outlast one full interval —
// the default 1000 ms of findBy/waitFor expires exactly as the first poll fires.
const POLL_TIMEOUT = 3000;

/** Answers the merge endpoint and the job endpoint from two independent queues, by URL. */
function respondWith({ merge = [] as any[], jobs = [] as any[] } = {}) {
  const mergeQueue = [...merge];
  const jobQueue = [...jobs];

  mockCall.mockImplementation(({ url }: { url: string }) => {
    if (url.startsWith(MERGE_URL)) {
      const next = mergeQueue.shift();
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    }
    if (url.startsWith('job/')) {
      const next = jobQueue.shift();
      return next ? Promise.resolve(next) : new Promise(() => undefined);
    }
    throw new Error(`unexpected url: ${url}`);
  });
}

function mergeCalls(): number {
  return mockCall.mock.calls.filter(([{ url }]) => url.startsWith(MERGE_URL)).length;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUrlParams = new URLSearchParams('otp=the-otp');
});

describe('AccountMerge', () => {
  it('shows the result directly when the merge finishes inside the wait window', async () => {
    respondWith({ merge: [{ kycHash: 'hash', accessToken: 'token' }] });

    render(<AccountMerge />);

    expect(await screen.findByText('Account merged successfully!')).toBeInTheDocument();
    expect(mockSetAuthToken).toHaveBeenCalledWith('token');
    expect(mergeCalls()).toBe(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // The regression from the issue: a 202 used to leave the screen on the spinner forever.
  it('polls the job and asks the merge endpoint again once it completes', async () => {
    respondWith({
      merge: [
        { ...JOB, status: JobStatus.PENDING },
        { kycHash: 'hash', accessToken: 'token' },
      ],
      jobs: [{ ...JOB, status: JobStatus.COMPLETE }],
    });

    render(<AccountMerge />);

    expect(await screen.findByText('Account merged successfully!', {}, { timeout: POLL_TIMEOUT })).toBeInTheDocument();
    expect(mockCall).toHaveBeenCalledWith({ url: 'job/job-uid', method: 'GET', token: false });
    // The access token is only issued in the HTTP context, so the result has to be fetched again.
    expect(mergeCalls()).toBe(2);
    expect(mockSetAuthToken).toHaveBeenCalledWith('token');
  });

  // The job belongs to the merge's master while the caller is still signed in as the slave, so
  // sending the session token makes the API reject its own caller with a 404. The merge call itself
  // must keep its token — that is what the fresh access token is issued from.
  it('polls the job unauthenticated but keeps the session token on the merge call', async () => {
    respondWith({
      merge: [
        { ...JOB, status: JobStatus.PENDING },
        { kycHash: 'hash', accessToken: 'token' },
      ],
      jobs: [{ ...JOB, status: JobStatus.COMPLETE }],
    });

    render(<AccountMerge />);
    await screen.findByText('Account merged successfully!', {}, { timeout: POLL_TIMEOUT });

    const [jobCall] = mockCall.mock.calls.map(([c]) => c).filter((c) => c.url.startsWith('job/'));
    const mergeCallConfigs = mockCall.mock.calls.map(([c]) => c).filter((c) => c.url.startsWith(MERGE_URL));

    expect(jobCall.token).toBe(false);
    expect(mergeCallConfigs).toHaveLength(2);
    mergeCallConfigs.forEach((c) => expect(c.token).toBeUndefined());
  });

  it('skips polling when the 202 ticket is already complete', async () => {
    respondWith({
      merge: [{ ...JOB, status: JobStatus.COMPLETE }, { kycHash: 'hash' }],
    });

    render(<AccountMerge />);

    expect(await screen.findByText('Account merged successfully!')).toBeInTheDocument();
    expect(mockCall).not.toHaveBeenCalledWith(expect.objectContaining({ url: 'job/job-uid' }));
    expect(mergeCalls()).toBe(2);
  });

  it('keeps showing the waiting state while the job is still running', async () => {
    respondWith({ merge: [{ ...JOB, status: JobStatus.PENDING }] });

    render(<AccountMerge />);

    await waitFor(() => expect(mockCall).toHaveBeenCalledWith({ url: 'job/job-uid', method: 'GET', token: false }), {
      timeout: POLL_TIMEOUT,
    });
    expect(screen.getByText('Merging your accounts...')).toBeInTheDocument();
    expect(screen.queryByText('Account merged successfully!')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // Budget spent while the job is still running: it may yet succeed, so the user is told to come
  // back rather than that the merge failed. expectedSeconds 0 exhausts the budget immediately.
  it('tells the user to come back later when the job outlasts its budget', async () => {
    respondWith({ merge: [{ ...JOB, expectedSeconds: 0, status: JobStatus.PENDING }] });

    render(<AccountMerge />);

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith({
        pathname: '/error',
        search: 'msg=Merging your accounts is taking longer than expected. Please try again later.',
      }),
    );
  });

  it('sends the user to their account with the kycHash', async () => {
    respondWith({ merge: [{ kycHash: 'hash', accessToken: 'token' }] });

    render(<AccountMerge />);
    fireEvent.click(await screen.findByRole('button', { name: 'My account' }));

    expect(mockNavigate).toHaveBeenCalledWith('/account?code=hash');
  });

  it('reports a failed job with the message the API supplied', async () => {
    respondWith({
      merge: [{ ...JOB, status: JobStatus.FAILED, error: 'Job job-uid failed, contact support if this persists.' }],
    });

    render(<AccountMerge />);

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith({
        pathname: '/error',
        search: 'msg=Job job-uid failed, contact support if this persists.',
      }),
    );
    expect(mergeCalls()).toBe(1);
  });

  it('falls back to a translated message when a dead-lettered job carries none', async () => {
    respondWith({ merge: [{ ...JOB, status: JobStatus.DEAD_LETTER }] });

    render(<AccountMerge />);

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/error', search: 'msg=Account merge failed' }),
    );
  });

  it('still maps the synchronous error codes', async () => {
    respondWith({ merge: [Object.assign(new Error('nope'), { statusCode: 400 })] });

    render(<AccountMerge />);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/error', search: 'msg=Invalid link' }));
  });

  it('maps a 409 to the already-completed message', async () => {
    respondWith({ merge: [Object.assign(new Error('nope'), { statusCode: 409 })] });

    render(<AccountMerge />);

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/error', search: 'msg=Merge is already completed' }),
    );
  });

  it('passes through an error it has no mapping for', async () => {
    respondWith({ merge: [Object.assign(new Error('Network error: down'), { statusCode: 500 })] });

    render(<AccountMerge />);

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/error', search: 'msg=Network error: down' }),
    );
  });

  // The result call answering with another ticket would mean the merge un-completed itself; report
  // it rather than handing the render an object with no kycHash.
  it('reports a failure when the result call returns another ticket', async () => {
    respondWith({
      merge: [
        { ...JOB, status: JobStatus.PENDING },
        { ...JOB, status: JobStatus.FAILED, error: 'Job job-uid failed' },
      ],
      jobs: [{ ...JOB, status: JobStatus.COMPLETE }],
    });

    render(<AccountMerge />);

    await waitFor(
      () => expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/error', search: 'msg=Job job-uid failed' }),
      { timeout: POLL_TIMEOUT },
    );
  });

  it('stays silent when the screen unmounts before the merge fails', async () => {
    let rejectMerge!: (error: unknown) => void;
    mockCall.mockImplementation(() => new Promise((_, reject) => (rejectMerge = reject)));

    const { unmount } = render(<AccountMerge />);
    unmount();

    await act(async () => {
      rejectMerge(Object.assign(new Error('nope'), { statusCode: 400 }));
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // setAuthToken writes global auth context, not component state, so a merge that lands after the
  // user has navigated away has to be dropped rather than silently signing them in.
  it('discards the result when the screen unmounts before the merge lands', async () => {
    let resolveMerge!: (result: unknown) => void;
    mockCall.mockImplementation(() => new Promise((resolve) => (resolveMerge = resolve)));

    const { unmount } = render(<AccountMerge />);
    unmount();

    await act(async () => {
      resolveMerge({ kycHash: 'hash', accessToken: 'token' });
    });

    expect(mockSetAuthToken).not.toHaveBeenCalled();
  });

  it('redirects to KYC without an otp', () => {
    mockUrlParams = new URLSearchParams();

    render(<AccountMerge />);

    expect(mockNavigate).toHaveBeenCalledWith('/kyc');
    expect(mockCall).not.toHaveBeenCalled();
  });

  // StrictMode runs the effect, its cleanup, then the effect again on the same instance — so the
  // cancellation flag has to be re-armed, or the second run would discard its own result and strand
  // the user on the spinner, which is the very failure this screen is meant to stop doing.
  it('still completes when the effect is invoked twice on the same instance', async () => {
    respondWith({ merge: [{ kycHash: 'hash', accessToken: 'token' }, { kycHash: 'hash', accessToken: 'token' }] });

    render(
      <React.StrictMode>
        <AccountMerge />
      </React.StrictMode>,
    );

    expect(await screen.findByText('Account merged successfully!')).toBeInTheDocument();
  });
});
