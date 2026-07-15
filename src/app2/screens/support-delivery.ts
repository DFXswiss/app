import type { SupportIssue, SupportMessage } from '@dfx.swiss/react';

export interface SendAttempt {
  issueUid: string;
  beforeIds: number[];
  text?: string;
  file?: File;
  clearComposer: boolean;
  startedAt: number;
  replacesMessageId?: number;
}

export function findSendCandidate(messages: SupportMessage[], attempt: SendAttempt): SupportMessage | undefined {
  return messages.find((message) => {
    if (attempt.beforeIds.includes(message.id)) return false;
    const createdAt = new Date(message.created).getTime();
    if (Number.isFinite(createdAt) && createdAt < attempt.startedAt - 1_000) return false;
    const sameText = (message.message?.trim() ?? '') === (attempt.text?.trim() ?? '');
    const sameFile = (message.fileName ?? '') === (attempt.file?.name ?? '');
    return sameText && sameFile;
  });
}

export function shouldSyncSupportIssue(activeUid: string | undefined, issue: SupportIssue | undefined): boolean {
  return !!activeUid && issue?.uid === activeUid && issue.messages.length > 0;
}
