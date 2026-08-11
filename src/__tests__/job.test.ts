// Mock @dfx.swiss/react to avoid ES module issues (src/util/job imports delay from src/util/utils)
jest.mock('@dfx.swiss/react', () => ({}));
jest.mock('src/dto/safe.dto', () => ({}));

import { JobResponse, JobStatus, isJobResponse, isJobTerminal, pollJobUntilTerminal } from '../util/job';

function job(status: JobStatus, overrides: Partial<JobResponse> = {}): JobResponse {
  return { uid: 'job-uid', status, expectedSeconds: 65, ...overrides };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('isJobResponse', () => {
  it('detects a 202 job ticket', () => {
    expect(isJobResponse(job(JobStatus.PENDING))).toBe(true);
  });

  it('rejects the 200 merge result', () => {
    expect(isJobResponse({ kycHash: 'hash', accessToken: 'token' })).toBe(false);
  });

  it('rejects a merge result that carries no access token', () => {
    expect(isJobResponse({ kycHash: 'hash' })).toBe(false);
  });

  it('rejects a body that is not an object', () => {
    expect(isJobResponse(null)).toBe(false);
    expect(isJobResponse(undefined)).toBe(false);
    expect(isJobResponse('Complete')).toBe(false);
    expect(isJobResponse({})).toBe(false);
  });
});

describe('isJobTerminal', () => {
  it.each([[JobStatus.COMPLETE], [JobStatus.FAILED], [JobStatus.DEAD_LETTER]])('treats %s as terminal', (status) => {
    expect(isJobTerminal(status)).toBe(true);
  });

  // Retry means the last attempt failed but the job will run again — polling must not stop there.
  it.each([[JobStatus.PENDING], [JobStatus.PROCESSING], [JobStatus.RETRY]])('treats %s as still running', (status) => {
    expect(isJobTerminal(status)).toBe(false);
  });
});

describe('pollJobUntilTerminal', () => {
  it('returns an already terminal ticket without asking the API', async () => {
    const fetchJob = jest.fn();

    const result = await pollJobUntilTerminal(job(JobStatus.COMPLETE), fetchJob, { intervalSeconds: 0 });

    expect(result.status).toBe(JobStatus.COMPLETE);
    expect(fetchJob).not.toHaveBeenCalled();
  });

  it('polls until the job completes', async () => {
    const fetchJob = jest
      .fn()
      .mockResolvedValueOnce(job(JobStatus.PROCESSING))
      .mockResolvedValueOnce(job(JobStatus.COMPLETE));

    const result = await pollJobUntilTerminal(job(JobStatus.PENDING), fetchJob, { intervalSeconds: 0 });

    expect(result.status).toBe(JobStatus.COMPLETE);
    expect(fetchJob).toHaveBeenCalledTimes(2);
    expect(fetchJob).toHaveBeenCalledWith('job-uid');
  });

  it('keeps polling while the job is retrying', async () => {
    const fetchJob = jest
      .fn()
      .mockResolvedValueOnce(job(JobStatus.RETRY))
      .mockResolvedValueOnce(job(JobStatus.COMPLETE));

    const result = await pollJobUntilTerminal(job(JobStatus.PROCESSING), fetchJob, { intervalSeconds: 0 });

    expect(result.status).toBe(JobStatus.COMPLETE);
    expect(fetchJob).toHaveBeenCalledTimes(2);
  });

  it('stops on a failed job and keeps its error', async () => {
    const fetchJob = jest.fn().mockResolvedValue(job(JobStatus.FAILED, { error: 'Job job-uid failed' }));

    const result = await pollJobUntilTerminal(job(JobStatus.PENDING), fetchJob, { intervalSeconds: 0 });

    expect(result.status).toBe(JobStatus.FAILED);
    expect(result.error).toBe('Job job-uid failed');
    expect(fetchJob).toHaveBeenCalledTimes(1);
  });

  it('gives up, still running, once the expectedSeconds budget is spent', async () => {
    // Deterministic clock: the first reading fixes the deadline, the last one is past it.
    jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(2_000)
      .mockReturnValue(99_000);
    const fetchJob = jest.fn().mockResolvedValue(job(JobStatus.PROCESSING));

    const result = await pollJobUntilTerminal(job(JobStatus.PENDING, { expectedSeconds: 10 }), fetchJob, {
      intervalSeconds: 0,
    });

    expect(result.status).toBe(JobStatus.PROCESSING);
    expect(fetchJob).toHaveBeenCalledTimes(2);
  });

  it('stops asking once the caller has cancelled', async () => {
    let cancelled = false;
    const fetchJob = jest.fn().mockImplementation(() => {
      cancelled = true;
      return Promise.resolve(job(JobStatus.PROCESSING));
    });

    const result = await pollJobUntilTerminal(job(JobStatus.PENDING), fetchJob, {
      intervalSeconds: 0,
      isCancelled: () => cancelled,
    });

    expect(result.status).toBe(JobStatus.PROCESSING);
    expect(fetchJob).toHaveBeenCalledTimes(1);
  });

  // A screen unmounted before the first interval elapses must not keep a timer alive for a whole
  // interval: the long interval here would stall the test if the loop started waiting regardless.
  it('returns straight away when it is cancelled before the first poll', async () => {
    const fetchJob = jest.fn();

    const result = await pollJobUntilTerminal(job(JobStatus.PENDING), fetchJob, {
      intervalSeconds: 30,
      isCancelled: () => true,
    });

    expect(result.status).toBe(JobStatus.PENDING);
    expect(fetchJob).not.toHaveBeenCalled();
  });
});
