// Hook tests for saveCallOutcome: the userData update (phoneCallStatus + queue-specific check date)
// must be written BEFORE the transaction step. A reset transaction is re-evaluated from scratch by
// the AML cron; if the check date is not visible by then, the tx re-pends into its (possibly
// recheck-blocked) queue reason and gets stuck again.

const mockCalls: { method: string; url: string; data?: any }[] = [];
const mockCall = jest.fn();
jest.mock('src/hooks/guarded-api.hook', () => ({ useGuardedApi: () => ({ call: mockCall }) }));
jest.mock('@dfx.swiss/react', () => ({
  AmlReason: { MANUAL_CHECK_PHONE_FAILED: 'ManualCheckPhoneFailed' },
  CheckStatus: { PASS: 'Pass', FAIL: 'Fail' },
  PhoneCallStatus: {
    COMPLETED: 'Completed',
    UNAVAILABLE: 'Unavailable',
    SUSPICIOUS: 'Suspicious',
    FAILED: 'Failed',
    REPEAT: 'Repeat',
    USER_REJECTED: 'UserRejected',
  },
  CallQueue: {
    MANUAL_CHECK_PHONE: 'ManualCheckPhone',
    MANUAL_CHECK_IP_PHONE: 'ManualCheckIpPhone',
    MANUAL_CHECK_IP_COUNTRY_PHONE: 'ManualCheckIpCountryPhone',
    MANUAL_CHECK_EXTERNAL_ACCOUNT_PHONE: 'ManualCheckExternalAccountPhone',
    UNAVAILABLE_SUSPICIOUS: 'UnavailableSuspicious',
  },
}));

import { renderHook } from '@testing-library/react';
import { CallQueue } from '@dfx.swiss/react';
import { CallOutcome, needsExplicitAmlReset, useCompliance } from 'src/hooks/compliance.hook';

const TX_CONTEXT = {
  queue: 'ManualCheckIpCountryPhone',
  userDataId: 7,
  txId: 42,
  sourceType: 'BuyCrypto',
  amlCheck: 'Pass',
  amlReason: 'ManualCheckPhoneFailed',
  buyCryptoResetEligible: true,
} as any;

describe('saveCallOutcome write order', () => {
  beforeEach(() => {
    mockCalls.length = 0;
    // resetMocks is on (CRA default), so the recording implementation must be (re)set per test
    mockCall.mockImplementation(async (cfg: any) => {
      mockCalls.push({ method: cfg.method, url: cfg.url, data: cfg.data });
      return {};
    });
  });

  it('writes the userData check date before resetting the transaction', async () => {
    const { result } = renderHook(() => useCompliance());

    const res = await result.current.saveCallOutcome(TX_CONTEXT, CallOutcome.COMPLETED, {
      signature: 'JR',
      comment: 'called',
      amlAction: 'Reset',
    });

    expect(res.success).toBe(true);
    expect(mockCalls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'PUT userData/7',
      'PUT buyCrypto/42/amlCheck/reviewReset',
      'POST kyc/admin/log',
    ]);
    expect(mockCalls[1].data).toEqual({
      expectedAmlCheck: 'Pass',
      expectedAmlReason: 'ManualCheckPhoneFailed',
    });
    const userDataCall = mockCalls[0];
    expect(userDataCall.data.phoneCallStatus).toBe('Completed');
    expect(userDataCall.data.phoneCallIpCountryCheckDate).toBeDefined();
  });

  it('does not touch the transaction without an AmlCheck action', async () => {
    const { result } = renderHook(() => useCompliance());

    const res = await result.current.saveCallOutcome(TX_CONTEXT, CallOutcome.UNAVAILABLE, {
      signature: 'JR',
      comment: 'no answer',
    });

    expect(res.success).toBe(true);
    expect(mockCalls.map((c) => `${c.method} ${c.url}`)).toEqual(['PUT userData/7', 'POST kyc/admin/log']);
    expect(mockCalls[0].data.phoneCallIpCountryCheckDate).toBeUndefined();
  });
});

// Which queues need the outcome form to clear the transaction itself: exactly those whose AML reason
// sits in the API's BlockAmlReasons, because the recheck cron never picks them up again. Everything
// else must stay untouched so the API keeps deciding.
describe('needsExplicitAmlReset', () => {
  it('is true only for the recheck-blocked queue', () => {
    expect(needsExplicitAmlReset(CallQueue.MANUAL_CHECK_IP_COUNTRY_PHONE)).toBe(true);
  });

  it.each([
    [CallQueue.MANUAL_CHECK_PHONE],
    [CallQueue.MANUAL_CHECK_IP_PHONE],
    [CallQueue.MANUAL_CHECK_EXTERNAL_ACCOUNT_PHONE],
    [CallQueue.UNAVAILABLE_SUSPICIOUS],
  ])('is false for %s', (queue) => {
    expect(needsExplicitAmlReset(queue)).toBe(false);
  });
});
