import { delay } from './utils';

/**
 * Async job contract of the API (DFXswiss/backend#4496): an endpoint whose work outruns its short wait
 * window answers HTTP 202 with a job ticket instead of the result. The client polls `GET /job/:uid`
 * until the job is terminal and then asks the originating endpoint for the result again — the
 * result is deliberately not carried in the job.
 */
export enum JobStatus {
  PENDING = 'Pending',
  PROCESSING = 'Processing',
  COMPLETE = 'Complete',
  RETRY = 'Retry',
  FAILED = 'Failed',
  DEAD_LETTER = 'DeadLetter',
}

export interface JobResponse {
  uid: string;
  status: JobStatus;
  expectedSeconds: number;
  error?: string;
}

// Retry is deliberately not terminal: the attempt failed but attempts remain and the job is waiting
// to run again.
const terminalStatus: JobStatus[] = [JobStatus.COMPLETE, JobStatus.FAILED, JobStatus.DEAD_LETTER];

export function isJobTerminal(status: JobStatus): boolean {
  return terminalStatus.includes(status);
}

/**
 * Tells a 202 job ticket apart from the 200 result body. `useApi().call` resolves both through
 * `response.ok` and never exposes the status code, so the body itself has to be the discriminator.
 */
export function isJobResponse(response: unknown): response is JobResponse {
  const job = response as JobResponse | null | undefined;
  return typeof job?.uid === 'string' && typeof job?.status === 'string';
}

interface PollJobOptions {
  intervalSeconds?: number;
  isCancelled?: () => boolean;
}

/**
 * Polls until the job reaches a terminal state, or until its own time budget is spent.
 *
 * The budget is `expectedSeconds` — the group's queue time plus run time — so the client follows the
 * API's configuration instead of a second constant that would drift from it. A job that is still
 * running when the budget is spent, or one abandoned through `isCancelled`, is returned as-is and
 * therefore non-terminal; the caller decides how to present that.
 */
export async function pollJobUntilTerminal(
  job: JobResponse,
  fetchJob: (uid: string) => Promise<JobResponse>,
  { intervalSeconds = 1, isCancelled = () => false }: PollJobOptions = {},
): Promise<JobResponse> {
  const deadline = Date.now() + job.expectedSeconds * 1000;
  let current = job;

  while (!isJobTerminal(current.status) && Date.now() < deadline && !isCancelled()) {
    await delay(intervalSeconds);
    if (isCancelled()) break;

    current = await fetchJob(current.uid);
  }

  return current;
}
