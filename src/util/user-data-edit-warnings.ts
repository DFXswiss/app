import { useSyncExternalStore } from 'react';

// A failed KYC log for an edit whose form is gone: the PUT is in, the log is not. The warning has to
// outlive the form, so it lives here until an Admin sees and dismisses it on the customer dossier.
export interface FailedEditLog {
  userDataId: number;
  message: string;
}

const listeners = new Set<() => void>();
let entries: FailedEditLog[] = [];

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): FailedEditLog[] {
  return entries;
}

export function reportFailedEditLog(userDataId: number, message: string): void {
  const known = entries.some((entry) => entry.userDataId === userDataId);
  entries = known
    ? entries.map((entry) => (entry.userDataId === userDataId ? { userDataId, message } : entry))
    : [...entries, { userDataId, message }];
  notify();
}

export function dismissFailedEditLog(userDataId: number): void {
  if (!entries.some((entry) => entry.userDataId === userDataId)) return;
  entries = entries.filter((entry) => entry.userDataId !== userDataId);
  notify();
}

export function useFailedEditLogs(): FailedEditLog[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
