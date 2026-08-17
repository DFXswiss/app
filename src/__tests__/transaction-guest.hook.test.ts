import { renderHook } from '@testing-library/react';

const mockCall = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  useApi: () => ({ call: mockCall }),
}));

import { useTransactionGuest } from '../hooks/transaction-guest.hook';

describe('useTransactionGuest', () => {
  const uid = 'T1E448FF200A877DC';

  beforeEach(() => {
    mockCall.mockReset();
    mockCall.mockResolvedValue(undefined);
  });

  it('lists assign targets without a session token', async () => {
    const targets = [{ id: 7, bankUsage: 'ABC' }];
    mockCall.mockResolvedValue(targets);
    const { result } = renderHook(() => useTransactionGuest());

    await expect(result.current.getTargets(uid)).resolves.toBe(targets);
    expect(mockCall).toHaveBeenCalledWith({
      url: `transaction/uid/${uid}/targets`,
      method: 'GET',
      token: false,
    });
  });

  it('assigns a buy route without a session token', async () => {
    const { result } = renderHook(() => useTransactionGuest());

    await result.current.setTarget(uid, 7);
    expect(mockCall).toHaveBeenCalledWith({
      url: `transaction/uid/${uid}/target?buyId=7`,
      method: 'PUT',
      token: false,
    });
  });

  it('loads refund data without a session token', async () => {
    const refund = { refundAmount: 10 };
    mockCall.mockResolvedValue(refund);
    const { result } = renderHook(() => useTransactionGuest());

    await expect(result.current.getRefund(uid)).resolves.toBe(refund);
    expect(mockCall).toHaveBeenCalledWith({
      url: `transaction/uid/${uid}/refund`,
      method: 'GET',
      token: false,
    });
  });

  it('submits a refund target without a session token', async () => {
    const target = { refundTarget: 'CH93' };
    const { result } = renderHook(() => useTransactionGuest());

    await result.current.setRefund(uid, target);
    expect(mockCall).toHaveBeenCalledWith({
      url: `transaction/uid/${uid}/refund`,
      method: 'PUT',
      data: target,
      token: false,
    });
  });
});
