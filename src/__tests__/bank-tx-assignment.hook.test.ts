// Unit tests for useBankTxAssignment: GET unassigned list, PUT assign payload, and the
// AssignableBankTxTypes allow-list (excludes Pending/GSheet/Unknown on purpose).

import { renderHook } from '@testing-library/react';

const mockCall = jest.fn();

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: mockCall }),
}));

import {
  AssignableBankTxTypes,
  useBankTxAssignment,
} from 'src/hooks/bank-tx-assignment.hook';

describe('useBankTxAssignment', () => {
  beforeEach(() => {
    // react-scripts sets resetMocks:true, which wipes implementations before each test
    mockCall.mockReset().mockResolvedValue(undefined);
  });

  it('getUnassignedBankTx calls GET bankTx/unassigned and returns the response as-is', async () => {
    const payload = [
      {
        id: 1,
        accountServiceRef: 'ref-1',
        amount: 100,
        currency: 'EUR',
        type: 'Pending',
      },
    ];
    mockCall.mockResolvedValue(payload);

    const { result } = renderHook(() => useBankTxAssignment());
    const entries = await result.current.getUnassignedBankTx();

    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall).toHaveBeenCalledWith({ url: 'bankTx/unassigned', method: 'GET' });
    expect(entries).toBe(payload);
  });

  it('assignBankTx calls PUT bankTx/:id with the dto body', async () => {
    mockCall.mockResolvedValue(undefined);

    const { result } = renderHook(() => useBankTxAssignment());
    await result.current.assignBankTx(42, { type: 'BuyCrypto', buyId: 7 });

    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'bankTx/42',
      method: 'PUT',
      data: { type: 'BuyCrypto', buyId: 7 },
    });
  });

  it('AssignableBankTxTypes excludes the three unassigned markers Pending, GSheet, Unknown', () => {
    expect(AssignableBankTxTypes).not.toContain('Pending');
    expect(AssignableBankTxTypes).not.toContain('GSheet');
    expect(AssignableBankTxTypes).not.toContain('Unknown');
  });
});
