import { isJobTerminal, type JobResponse } from '@dfx.swiss/react';

/** Poll the public job endpoint within the ticket's budget, including slow requests. */
export function pollJobUntilTerminal(
  job: JobResponse,
  fetchJob: (uid: string) => Promise<JobResponse>,
  signal: AbortSignal,
): Promise<JobResponse> {
  if (signal.aborted || isJobTerminal(job.status)) return Promise.resolve(job);

  return new Promise((resolve, reject) => {
    let current = job;
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      settled = true;
      clearTimeout(timer);
      clearTimeout(deadlineTimer);
      signal.removeEventListener('abort', finish);
    };
    const finish = () => {
      cleanup();
      resolve(current);
    };
    const tick = async () => {
      try {
        const next = await fetchJob(current.uid);
        if (settled) return;
        current = next;
        if (isJobTerminal(current.status)) finish();
        else timer = setTimeout(tick, 1000);
      } catch (error) {
        if (settled) return;
        cleanup();
        reject(error);
      }
    };
    const deadlineTimer = setTimeout(finish, Math.max(0, job.expectedSeconds * 1000));
    signal.addEventListener('abort', finish);
    timer = setTimeout(tick, 1000);
  });
}
