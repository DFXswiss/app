export enum JobStatus {
  Pending = 'Pending',
  Processing = 'Processing',
  Complete = 'Complete',
  Failed = 'Failed',
  DeadLetter = 'DeadLetter',
}

export interface JobTicket {
  uid: string;
  group: string;
  status: JobStatus;
  created: string;
  started?: string;
  finished?: string;
  expectedSeconds: number;
}

export function isJobTicket(value: unknown): value is JobTicket {
  return typeof value === 'object' && value !== null && 'uid' in value && 'status' in value;
}
