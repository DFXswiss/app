import { renderHook } from '@testing-library/react';

const mockCall = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  useApi: () => ({ call: mockCall }),
}));

import useVirtualIban from '../hooks/virtual-iban.hook';

describe('useVirtualIban().createPersonalIban', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('creates a personal IBAN and returns the API response', async () => {
    const apiResponse = {
      id: 7,
      iban: 'CH9300762011623852957',
      currency: 'CHF',
      bank: 'Yapeal',
      active: true,
      acceptsPayments: true,
    };
    mockCall.mockResolvedValue(apiResponse);
    const { result } = renderHook(() => useVirtualIban());

    const personalIban = await result.current.createPersonalIban({ currency: 'CHF' });

    expect(mockCall).toHaveBeenCalledWith({
      url: 'buy/personalIban',
      method: 'POST',
      data: { currency: 'CHF' },
    });
    expect(personalIban).toBe(apiResponse);
  });
});
