/**
 * Async job ticket used by account-merge / Checkout.com return.
 * Copied into App 2.0 so this tree does not import the main app's private util.
 * Values must match `src/util/job.ts` — pinned by `legacy-contract.test.ts`.
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

const terminalStatus: JobStatus[] = [JobStatus.COMPLETE, JobStatus.FAILED, JobStatus.DEAD_LETTER];

export function isJobTerminal(status: JobStatus): boolean {
  return terminalStatus.includes(status);
}

export function isJobResponse(response: unknown): response is JobResponse {
  const job = response as JobResponse | null | undefined;
  return typeof job?.uid === 'string' && typeof job?.status === 'string';
}

function delay(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

interface PollJobOptions {
  intervalSeconds?: number;
  isCancelled?: () => boolean;
}

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
