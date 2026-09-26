jest.mock('@dfx.swiss/react', () => ({
  AmlReason: {
    MANUAL_CHECK_PHONE: 'ManualCheckPhone',
    MANUAL_CHECK_PHONE_FAILED: 'ManualCheckPhoneFailed',
    MANUAL_CHECK_IP_PHONE: 'ManualCheckIpPhone',
    MANUAL_CHECK_IP_COUNTRY_PHONE: 'ManualCheckIpCountryPhone',
    MANUAL_CHECK_EXTERNAL_ACCOUNT_PHONE: 'ManualCheckExternalAccountPhone',
  },
  CallQueue: {
    MANUAL_CHECK_PHONE: 'ManualCheckPhone',
    MANUAL_CHECK_IP_PHONE: 'ManualCheckIpPhone',
    MANUAL_CHECK_IP_COUNTRY_PHONE: 'ManualCheckIpCountryPhone',
    MANUAL_CHECK_EXTERNAL_ACCOUNT_PHONE: 'ManualCheckExternalAccountPhone',
    UNAVAILABLE_SUSPICIOUS: 'UnavailableSuspicious',
  },
  CheckStatus: { PENDING: 'Pending', FAIL: 'Fail', PASS: 'Pass' },
}));

import { CallQueue, CallQueueItem } from '@dfx.swiss/react';
import {
  CALLBACK_DEADLINE_DAYS,
  callbackDeadline,
  callQueueLabel,
  effectiveCallQueue,
  isPastDeadline,
} from 'src/util/call-queue.util';

function item(overrides: Partial<CallQueueItem> = {}): CallQueueItem {
  return {
    queue: CallQueue.UNAVAILABLE_SUSPICIOUS,
    userDataId: 1,
    date: '2026-09-01T10:00:00.000Z',
    ...overrides,
  } as CallQueueItem;
}

describe('callQueueLabel', () => {
  it('names the Callback queue and leaves the reason queues as they are', () => {
    expect(callQueueLabel(CallQueue.UNAVAILABLE_SUSPICIOUS)).toBe('Callback');
    expect(callQueueLabel(CallQueue.MANUAL_CHECK_IP_PHONE)).toBe('ManualCheckIpPhone');
    expect(callQueueLabel('SomethingElse')).toBe('SomethingElse');
  });
});

describe('effectiveCallQueue', () => {
  it('keeps a reason queue whatever the transaction says', () => {
    expect(effectiveCallQueue(CallQueue.MANUAL_CHECK_IP_PHONE, 'ManualCheckPhone')).toBe(
      CallQueue.MANUAL_CHECK_IP_PHONE,
    );
    expect(effectiveCallQueue(CallQueue.MANUAL_CHECK_PHONE, undefined)).toBe(CallQueue.MANUAL_CHECK_PHONE);
  });

  it.each([
    ['ManualCheckPhone', CallQueue.MANUAL_CHECK_PHONE],
    ['ManualCheckPhoneFailed', CallQueue.MANUAL_CHECK_PHONE],
    ['ManualCheckIpPhone', CallQueue.MANUAL_CHECK_IP_PHONE],
    ['ManualCheckIpCountryPhone', CallQueue.MANUAL_CHECK_IP_COUNTRY_PHONE],
    ['ManualCheckExternalAccountPhone', CallQueue.MANUAL_CHECK_EXTERNAL_ACCOUNT_PHONE],
  ])('resolves a Callback item with reason %s to %s', (reason, queue) => {
    expect(effectiveCallQueue(CallQueue.UNAVAILABLE_SUSPICIOUS, reason)).toBe(queue);
  });

  it('falls back to the plain phone queue for a Callback item without a known reason', () => {
    expect(effectiveCallQueue(CallQueue.UNAVAILABLE_SUSPICIOUS, undefined)).toBe(CallQueue.MANUAL_CHECK_PHONE);
    expect(effectiveCallQueue(CallQueue.UNAVAILABLE_SUSPICIOUS, 'UserDataBlocked')).toBe(CallQueue.MANUAL_CHECK_PHONE);
  });
});

describe('callbackDeadline', () => {
  it('is 14 days after the transaction date for a pending transaction', () => {
    expect(CALLBACK_DEADLINE_DAYS).toBe(14);
    expect(callbackDeadline(item({ amlCheck: 'Pending' as never }))).toEqual(new Date('2026-09-15T10:00:00.000Z'));
  });

  it('is undefined for a failed transaction or one without a status', () => {
    expect(callbackDeadline(item({ amlCheck: 'Fail' as never }))).toBeUndefined();
    expect(callbackDeadline(item())).toBeUndefined();
  });
});

describe('isPastDeadline', () => {
  it('is true only for a deadline before now', () => {
    const now = new Date('2026-09-20T00:00:00.000Z');
    expect(isPastDeadline(new Date('2026-09-19T23:59:59.000Z'), now)).toBe(true);
    expect(isPastDeadline(new Date('2026-09-20T00:00:00.000Z'), now)).toBe(false);
    expect(isPastDeadline(new Date('2026-09-21T00:00:00.000Z'), now)).toBe(false);
    expect(isPastDeadline(undefined, now)).toBe(false);
  });

  it('defaults to the current time', () => {
    expect(isPastDeadline(new Date(Date.now() - 1000))).toBe(true);
    expect(isPastDeadline(new Date(Date.now() + 60_000))).toBe(false);
  });
});
