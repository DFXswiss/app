const mockCall = jest.fn();

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: mockCall }),
}));

import { renderHook } from '@testing-library/react';
import { useDashboard } from 'src/hooks/dashboard.hook';

describe('useDashboard Kundengelder methods', () => {
  beforeEach(() => {
    mockCall.mockReset().mockResolvedValue(undefined);
  });

  it('getKundengelderExtract(2024) calls GET dashboard/financial/kundengelder?year=2024', async () => {
    const { result } = renderHook(() => useDashboard());

    await result.current.getKundengelderExtract(2024);

    expect(mockCall).toHaveBeenCalledWith({
      url: 'dashboard/financial/kundengelder?year=2024',
      method: 'GET',
    });
  });

  it('getKundengelderLines encodes year, iban and line as query params', async () => {
    const { result } = renderHook(() => useDashboard());

    await result.current.getKundengelderLines(2024, 'CheckoutLtdEUR', 'BuyCrypto after Fee');

    expect(mockCall).toHaveBeenCalledTimes(1);
    const firstCall = mockCall.mock.calls[0];
    if (!firstCall) throw new Error('expected mockCall to have been called');
    const callArg = firstCall[0] as { url: string; method: string };
    expect(callArg.method).toBe('GET');
    expect(callArg.url.startsWith('dashboard/financial/kundengelder/lines?')).toBe(true);

    const query = callArg.url.slice(callArg.url.indexOf('?') + 1);
    const params = new URLSearchParams(query);
    expect(params.get('year')).toBe('2024');
    expect(params.get('iban')).toBe('CheckoutLtdEUR');
    expect(params.get('line')).toBe('BuyCrypto after Fee');
  });
});
