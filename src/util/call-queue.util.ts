import { AmlReason, CallQueue, CallQueueItem, CheckStatus } from '@dfx.swiss/react';

// Days a pending phone transaction may wait before the API fails it (aml-helper getAmlResult), counted
// from the day it was created. Shown in the Callback queue as the deadline for the customer to call back.
export const CALLBACK_DEADLINE_DAYS = 14;

// The queue key `UnavailableSuspicious` predates the queue's meaning and lives in @dfx.swiss/core, so
// the tool names the queue: it lists the transactions of accounts a clerk has to call again.
export function callQueueLabel(queue: CallQueue | string): string {
  return queue === CallQueue.UNAVAILABLE_SUSPICIOUS ? 'Callback' : queue;
}

// The queues a transaction is decided in. The Callback queue is a view on parked transactions, not a
// decision of its own, so nothing keyed by decision queue carries an entry for it.
export type DecisionQueue = Exclude<CallQueue, CallQueue.UNAVAILABLE_SUSPICIOUS>;

// The reason queue a transaction belongs to by its AML reason. The failed-call verdict
// (ManualCheckPhoneFailed) is written by every phone check, so the check it came from is not
// recoverable; it is decided on the plain phone check date. If the API's re-run after a completed
// call still needs a specific check, the transaction reappears in that reason queue (the API decides,
// the tool does not guess the check).
function queueForAmlReason(amlReason: string): DecisionQueue | undefined {
  switch (amlReason) {
    case AmlReason.MANUAL_CHECK_PHONE:
    case AmlReason.MANUAL_CHECK_PHONE_FAILED:
      return CallQueue.MANUAL_CHECK_PHONE;
    case AmlReason.MANUAL_CHECK_IP_PHONE:
      return CallQueue.MANUAL_CHECK_IP_PHONE;
    case AmlReason.MANUAL_CHECK_IP_COUNTRY_PHONE:
      return CallQueue.MANUAL_CHECK_IP_COUNTRY_PHONE;
    case AmlReason.MANUAL_CHECK_EXTERNAL_ACCOUNT_PHONE:
      return CallQueue.MANUAL_CHECK_EXTERNAL_ACCOUNT_PHONE;
    default:
      return undefined;
  }
}

// A Callback item is a transaction parked from one of the reason queues. Its outcome has to act as
// that queue's would (which check date a completed call writes, whether the recheck-blocked reason
// needs the explicit reset), so the transaction's reason decides, not the queue it is listed in.
export function effectiveCallQueue(queue: CallQueue, amlReason?: string): DecisionQueue {
  if (queue !== CallQueue.UNAVAILABLE_SUSPICIOUS) return queue;
  return (amlReason && queueForAmlReason(amlReason)) || CallQueue.MANUAL_CHECK_PHONE;
}

// The API sends the mark date with every queue item; the SDK's item type predates the field.
export interface CallQueueItemWithStatusDate extends CallQueueItem {
  phoneCallStatusDate?: string;
}

// Only a pending transaction still has a deadline; a failed one waits for the customer's refund request
// or for a completed call, without a date.
export function callbackDeadline(item: CallQueueItem): Date | undefined {
  if (item.amlCheck !== CheckStatus.PENDING) return undefined;
  const deadline = new Date(item.date);
  deadline.setDate(deadline.getDate() + CALLBACK_DEADLINE_DAYS);
  return deadline;
}

export function isPastDeadline(deadline: Date | undefined, now: Date = new Date()): boolean {
  return deadline != null && deadline.getTime() < now.getTime();
}
