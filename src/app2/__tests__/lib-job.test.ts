import { JobStatus, isJobResponse, isJobTerminal, pollJobUntilTerminal, type JobResponse } from '../lib/job';

function job(status: JobStatus, extra: Partial<JobResponse> = {}): JobResponse {
  return { uid: 'job-1', status, expectedSeconds: 1, ...extra };
}

describe('app2 job helpers', () => {
  it('classifies responses and terminal statuses', () => {
    expect(isJobResponse(job(JobStatus.PENDING))).toBe(true);
    expect(isJobResponse(null)).toBe(false);
    expect(isJobTerminal(JobStatus.COMPLETE)).toBe(true);
    expect(isJobTerminal(JobStatus.PENDING)).toBe(false);
  });

  it('falls back to its own interval and cancellation defaults when given no options', async () => {
    const fetchJob = jest.fn().mockResolvedValue(job(JobStatus.COMPLETE));
    const result = await pollJobUntilTerminal(job(JobStatus.PENDING), fetchJob);
    expect(result.status).toBe(JobStatus.COMPLETE);
    expect(fetchJob).toHaveBeenCalledTimes(1);
  });

  it('stops before fetching when cancellation lands during the wait', async () => {
    const fetchJob = jest.fn();
    let checks = 0;
    const result = await pollJobUntilTerminal(job(JobStatus.PENDING), fetchJob, {
      intervalSeconds: 0,
      isCancelled: () => checks++ > 0,
    });
    expect(result.status).toBe(JobStatus.PENDING);
    expect(fetchJob).not.toHaveBeenCalled();
  });
});
