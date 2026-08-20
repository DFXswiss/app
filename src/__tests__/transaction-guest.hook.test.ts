import { renderHook } from '@testing-library/react';

const mockCall = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  useApi: () => ({ call: mockCall }),
}));

import { useTransactionGuest } from '../hooks/transaction-guest.hook';

describe('useTransactionGuest', () => {
  const uid = 'T1E448FF200A877DC';
  const secret = 'ab'.repeat(32);

  beforeEach(() => {
    mockCall.mockReset();
    mockCall.mockResolvedValue(undefined);
  });

  it('lists assign targets without a session token', async () => {
    const targets = [{ id: 7, bankUsage: 'ABC' }];
    mockCall.mockResolvedValue(targets);
    const { result } = renderHook(() => useTransactionGuest());

    await expect(result.current.getTargets(uid, secret)).resolves.toBe(targets);
    expect(mockCall).toHaveBeenCalledWith({
      url: `transaction/uid/${uid}/${secret}/targets`,
      method: 'GET',
      token: false,
    });
  });

  it('assigns a buy route without a session token', async () => {
    const { result } = renderHook(() => useTransactionGuest());

    await result.current.setTarget(uid, secret, 7);
    expect(mockCall).toHaveBeenCalledWith({
      url: `transaction/uid/${uid}/${secret}/target?buyId=7`,
      method: 'PUT',
      token: false,
    });
  });

  it('loads refund data without a session token', async () => {
    const refund = { refundAmount: 10 };
    mockCall.mockResolvedValue(refund);
    const { result } = renderHook(() => useTransactionGuest());

    await expect(result.current.getRefund(uid, secret)).resolves.toBe(refund);
    expect(mockCall).toHaveBeenCalledWith({
      url: `transaction/uid/${uid}/${secret}/refund`,
      method: 'GET',
      token: false,
    });
  });

  it('submits a refund target without a session token', async () => {
    const target = { refundTarget: 'CH93' };
    const { result } = renderHook(() => useTransactionGuest());

    await result.current.setRefund(uid, secret, target);
    expect(mockCall).toHaveBeenCalledWith({
      url: `transaction/uid/${uid}/${secret}/refund`,
      method: 'PUT',
      data: target,
      token: false,
    });
  });
});
