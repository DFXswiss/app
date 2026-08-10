import { renderHook } from '@testing-library/react';

// capture the api call args; the hook resolves call() to the returned payload
const mockCall = jest.fn();

// useCompliance loads a few @dfx.swiss/react enum values at module scope, so the mock provides them
// alongside the guarded api (which returns our capturing call).
jest.mock('@dfx.swiss/react', () => ({
  useApi: () => ({ call: mockCall }),
  PhoneCallStatus: {
    COMPLETED: 'Completed',
    UNAVAILABLE: 'Unavailable',
    SUSPICIOUS: 'Suspicious',
    FAILED: 'Failed',
    REPEAT: 'Repeat',
  },
  CallQueue: {
    MANUAL_CHECK_PHONE: 'ManualCheckPhone',
    MANUAL_CHECK_IP_PHONE: 'ManualCheckIpPhone',
    MANUAL_CHECK_IP_COUNTRY_PHONE: 'ManualCheckIpCountryPhone',
    MANUAL_CHECK_EXTERNAL_ACCOUNT_PHONE: 'ManualCheckExternalAccountPhone',
    UNAVAILABLE_SUSPICIOUS: 'UnavailableSuspicious',
  },
}));

// useCompliance sources its call from useGuardedApi, which calls useNavigation (react-router hooks);
// stub both so renderHook works without a <Router> wrapper.
jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: mockCall }),
}));

jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

import { useCompliance } from '../hooks/compliance.hook';
import { ChargebackBlockReason, PendingChargebackEntry } from '../dto/chargeback.dto';

type PendingChargebackPayload = Omit<PendingChargebackEntry, 'requestedDate' | 'date' | 'chargebackDate'> & {
  requestedDate: string;
  date: string;
  chargebackDate?: string;
};

// JSON round-trip: mirrors real HTTP transport (drops undefined keys, keeps ISO strings, breaks aliasing)
function asTransport<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('useCompliance().getPendingChargebacks', () => {
  beforeEach(() => {
    // react-scripts sets resetMocks:true, which wipes implementations before each test
    mockCall.mockReset().mockResolvedValue([]);
  });

  it('issues GET support/pending-chargebacks and returns the payload', async () => {
    const payload: PendingChargebackPayload[] = [
      {
        txId: 9001,
        uid: 'T-9001',
        sourceType: 'BuyCrypto',
        entityId: 1001,
        userDataId: 2001,
        userName: 'Fixture User',
        inputAmount: 100,
        inputAsset: 'EUR',
        chargebackAmount: 100,
        chargebackAsset: 'EUR',
        blockReasons: [ChargebackBlockReason.MISSING_CHARGEBACK_AMOUNT],
        requestedDate: '2026-01-15T10:00:00.000Z',
        date: '2026-01-15T10:00:00.000Z',
      },
    ];
    mockCall.mockResolvedValue(asTransport(payload));

    const { result } = renderHook(() => useCompliance());

    const entries = await result.current.getPendingChargebacks();

    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'support/pending-chargebacks',
      method: 'GET',
    });
    expect(entries).toEqual(payload);
    expect(entries[0].requestedDate).toBe('2026-01-15T10:00:00.000Z');
  });
});
