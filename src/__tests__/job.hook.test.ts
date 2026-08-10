const mockCall = jest.fn();
const mockSetAuthToken = jest.fn();
const mockNavigate = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  useApi: () => ({ call: mockCall }),
  useAuthContext: () => ({ setAuthToken: mockSetAuthToken }),
}));

jest.mock('@dfx.swiss/react-components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    StyledButton: () => null,
    StyledVerticalStack: ({ children }: any) => createElement('div', null, children),
  };
});

jest.mock('react-router-dom', () => {
  const { useState } = jest.requireActual('react');
  return {
    useSearchParams: () => {
      const [params, setParams] = useState(() => new URLSearchParams('otp=otp-secret-42'));
      const setUrlParams = (next: URLSearchParams) => setParams(new URLSearchParams(next.toString()));
      return [params, setUrlParams];
    },
  };
});

jest.mock('src/components/job/job-progress', () => ({
  JobProgress: () => null,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

import { act, render, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { JobStatus, JobTicket } from 'src/dto/job.dto';
import { JOB_TRACKER_TIMEOUT_ERROR, useJobTracker } from '../hooks/job.hook';
import AccountMerge from '../screens/account-merge.screen';

const resultPayload = { kycHash: 'hash-1', accessToken: 'token-1' };

function makeTicket(overrides: Partial<JobTicket> = {}): JobTicket {
  return {
    uid: 'J7f3a9c2e1b8d4a60',
    group: 'AccountMerge',
    status: JobStatus.Pending,
    created: new Date().toISOString(),
    expectedSeconds: 65,
    ...overrides,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('useJobTracker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should set result on first fetch without ticket', async () => {
    const fetchResult = jest.fn().mockResolvedValue(resultPayload);
    const { result } = renderHook(() => useJobTracker(fetchResult));

    await act(async () => {
      result.current.start();
      await flushMicrotasks();
    });

    expect(result.current.result).toEqual(resultPayload);
    expect(result.current.ticket).toBeUndefined();
    expect(result.current.error).toBeUndefined();
    expect(fetchResult).toHaveBeenCalledTimes(1);
  });

  it('should poll until result after receiving a ticket', async () => {
    const ticket = makeTicket();
    const fetchResult = jest.fn().mockResolvedValueOnce(ticket).mockResolvedValueOnce(resultPayload);
    const { result } = renderHook(() => useJobTracker(fetchResult));

    await act(async () => {
      result.current.start();
      await flushMicrotasks();
    });

    expect(result.current.ticket).toEqual(ticket);
    expect(result.current.result).toBeUndefined();
    expect(fetchResult).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1000);
      await flushMicrotasks();
    });

    expect(result.current.result).toEqual(resultPayload);
    expect(fetchResult).toHaveBeenCalledTimes(2);
  });

  it('should set error on Failed ticket and stop polling', async () => {
    const ticket = makeTicket({ status: JobStatus.Failed });
    const fetchResult = jest.fn().mockResolvedValue(ticket);
    const { result } = renderHook(() => useJobTracker(fetchResult));

    await act(async () => {
      result.current.start();
      await flushMicrotasks();
    });

    expect(result.current.error).toBe('Job Failed');
    expect(result.current.result).toBeUndefined();
    expect(fetchResult).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(10000);
      await flushMicrotasks();
    });

    expect(fetchResult).toHaveBeenCalledTimes(1);
  });

  it('should retry after a transient error without setting error', async () => {
    const fetchResult = jest
      .fn()
      .mockRejectedValueOnce({ statusCode: 500, message: 'boom' })
      .mockResolvedValueOnce(resultPayload);
    const { result } = renderHook(() => useJobTracker(fetchResult));

    await act(async () => {
      result.current.start();
      await flushMicrotasks();
    });

    expect(result.current.error).toBeUndefined();
    expect(result.current.result).toBeUndefined();
    expect(fetchResult).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1000);
      await flushMicrotasks();
    });

    expect(result.current.error).toBeUndefined();
    expect(result.current.result).toEqual(resultPayload);
    expect(fetchResult).toHaveBeenCalledTimes(2);
  });

  it('should time out a hanging fetch after the tracking deadline and discard its late result', async () => {
    let resolveFetch!: (value: typeof resultPayload) => void;
    const fetchResult = jest.fn().mockImplementation(
      () =>
        new Promise<typeof resultPayload>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const { result } = renderHook(() => useJobTracker(fetchResult));

    await act(async () => {
      result.current.start();
      await flushMicrotasks();
    });

    expect(result.current.error).toBeUndefined();
    expect(fetchResult).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(600_000);
      await flushMicrotasks();
    });

    expect(result.current.error).toBe(JOB_TRACKER_TIMEOUT_ERROR);
    expect(result.current.result).toBeUndefined();

    await act(async () => {
      resolveFetch(resultPayload);
      await flushMicrotasks();
    });

    expect(result.current.result).toBeUndefined();
    expect(result.current.error).toBe(JOB_TRACKER_TIMEOUT_ERROR);
  });
});

describe('AccountMerge screen - otp code stability across polls', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockCall.mockReset();
    mockSetAuthToken.mockReset();
    mockNavigate.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('polls the mail-confirm endpoint with the same code after the otp is removed from the URL', async () => {
    const ticket: JobTicket = {
      uid: 'J7f3a9c2e1b8d4a60',
      group: 'AccountMerge',
      status: JobStatus.Pending,
      created: new Date().toISOString(),
      expectedSeconds: 65,
    };
    mockCall.mockResolvedValueOnce(ticket).mockResolvedValueOnce({ kycHash: 'hash-1', accessToken: 'token-1' });

    await act(async () => {
      render(createElement(AccountMerge));
      await flushMicrotasks();
    });

    expect(mockCall).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1000);
      await flushMicrotasks();
    });

    expect(mockCall).toHaveBeenCalledTimes(2);

    const firstUrl = mockCall.mock.calls[0][0].url as string;
    const secondUrl = mockCall.mock.calls[1][0].url as string;

    expect(firstUrl).toBe('auth/mail/confirm?code=otp-secret-42');
    expect(secondUrl).toBe(firstUrl);
    expect(secondUrl).not.toContain('code=null');
  });
});
