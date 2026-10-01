// SDK jobs are mocked; these tests prove local timing/cancellation, not backend execution.
jest.mock('@dfx.swiss/react', () => ({
  isJobTerminal: (status: string) => ['Complete', 'Failed', 'DeadLetter'].includes(status),
}));

import type { JobResponse } from '@dfx.swiss/react';
import { pollJobUntilTerminal } from '../lib/job';

const { setTimeout: realSetTimeout } = jest.requireActual<typeof import('timers')>('timers');

// Drain chained promise continuations without advancing the fake polling clock.
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => realSetTimeout(resolve, 0));
}

const ticket = (status = 'Pending', expectedSeconds = 3): JobResponse => ({
  uid: 'merge-job',
  status: status as JobResponse['status'],
  expectedSeconds,
});

describe('App 2.0 job polling', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it.each(['Complete', 'Failed', 'DeadLetter'])('returns a terminal %s ticket without polling', async (status) => {
    const getJob = jest.fn();
    const job = ticket(status);
    await expect(pollJobUntilTerminal(job, getJob, new AbortController().signal)).resolves.toBe(job);
    expect(getJob).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('returns immediately for a signal aborted before polling starts', async () => {
    const controller = new AbortController();
    controller.abort();
    const getJob = jest.fn();
    const job = ticket();
    await expect(pollJobUntilTerminal(job, getJob, controller.signal)).resolves.toBe(job);
    expect(getJob).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('polls once per second through retry and returns the terminal job', async () => {
    const completed = ticket('Complete');
    const getJob = jest.fn().mockResolvedValueOnce(ticket('Retry')).mockResolvedValueOnce(completed);
    const result = pollJobUntilTerminal(ticket(), getJob, new AbortController().signal);
    jest.advanceTimersByTime(999);
    expect(getJob).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await flushMicrotasks();
    expect(getJob).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(999);
    expect(getJob).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    await flushMicrotasks();
    await expect(result).resolves.toBe(completed);
    expect(getJob.mock.calls).toEqual([['merge-job'], ['merge-job']]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each([0, -1, 0.5])('does not poll beyond a %s-second budget', async (seconds) => {
    const job = ticket('Pending', seconds);
    const getJob = jest.fn();
    const result = pollJobUntilTerminal(job, getJob, new AbortController().signal);
    jest.advanceTimersByTime(1000);
    await expect(result).resolves.toBe(job);
    expect(getJob).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rejects a failed lookup and clears both timers', async () => {
    const error = new Error('network');
    const getJob = jest.fn().mockRejectedValue(error);
    const result = pollJobUntilTerminal(ticket(), getJob, new AbortController().signal);
    const assertion = expect(result).rejects.toBe(error);
    jest.advanceTimersByTime(1000);
    await assertion;
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(['abort', 'deadline'])('ignores a late successful lookup after %s', async (stop) => {
    const controller = new AbortController();
    let finish!: (value: JobResponse) => void;
    const getJob = jest.fn().mockReturnValue(
      new Promise<JobResponse>((resolve) => {
        finish = resolve;
      }),
    );
    const job = ticket();
    const result = pollJobUntilTerminal(job, getJob, controller.signal);
    jest.advanceTimersByTime(1000);
    expect(getJob).toHaveBeenCalledTimes(1);
    if (stop === 'abort') controller.abort();
    else jest.advanceTimersByTime(2000);
    await expect(result).resolves.toBe(job);
    finish(ticket('Complete'));
    await Promise.resolve();
    expect(jest.getTimerCount()).toBe(0);
    expect(getJob).toHaveBeenCalledTimes(1);
  });

  it('ignores a rejected lookup after cancellation', async () => {
    const controller = new AbortController();
    let fail!: (error: Error) => void;
    const getJob = jest.fn().mockReturnValue(
      new Promise<JobResponse>((_resolve, reject) => {
        fail = reject;
      }),
    );
    const job = ticket();
    const result = pollJobUntilTerminal(job, getJob, controller.signal);
    jest.advanceTimersByTime(1000);
    controller.abort();
    await expect(result).resolves.toBe(job);
    fail(new Error('late network failure'));
    await Promise.resolve();
    expect(jest.getTimerCount()).toBe(0);
  });
});
