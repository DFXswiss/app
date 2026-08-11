import { renderHook } from '@testing-library/react';

const mockCall = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  useApi: () => ({ call: mockCall }),
}));

import useVirtualIban from '../hooks/virtual-iban.hook';

describe('useVirtualIban().getPersonalIbans', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('requests the personal-IBAN rows and returns the API response', async () => {
    const apiResponse = [
      {
        id: 7,
        iban: 'CH9300762011623852957',
        currency: 'CHF',
        bank: 'Yapeal',
        active: true,
        acceptsPayments: true,
      },
    ];
    mockCall.mockResolvedValue(apiResponse);
    const { result } = renderHook(() => useVirtualIban());

    const personalIbans = await result.current.getPersonalIbans();

    expect(mockCall).toHaveBeenCalledWith({
      url: 'buy/personalIban',
      method: 'GET',
    });
    expect(personalIbans).toBe(apiResponse);
  });
});
