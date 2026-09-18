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

describe('useDashboard financial methods', () => {
  beforeEach(() => {
    mockCall.mockReset().mockResolvedValue(undefined);
  });

  it('getFinancialLog() calls GET dashboard/financial/log', async () => {
    const { result } = renderHook(() => useDashboard());

    await result.current.getFinancialLog();

    expect(mockCall).toHaveBeenCalledWith({
      url: 'dashboard/financial/log',
      method: 'GET',
    });
  });

  it("getFinancialLog('2024-01-01') calls GET dashboard/financial/log?from=2024-01-01", async () => {
    const { result } = renderHook(() => useDashboard());

    await result.current.getFinancialLog('2024-01-01');

    expect(mockCall).toHaveBeenCalledWith({
      url: 'dashboard/financial/log?from=2024-01-01',
      method: 'GET',
    });
  });

  it('getFinancialLog(undefined, false) calls GET dashboard/financial/log?dailySample=false', async () => {
    const { result } = renderHook(() => useDashboard());

    await result.current.getFinancialLog(undefined, false);

    expect(mockCall).toHaveBeenCalledWith({
      url: 'dashboard/financial/log?dailySample=false',
      method: 'GET',
    });
  });

  it('getFinancialLogChart() calls GET dashboard/financial/log?byType=false', async () => {
    const { result } = renderHook(() => useDashboard());

    await result.current.getFinancialLogChart();

    expect(mockCall).toHaveBeenCalledWith({
      url: 'dashboard/financial/log?byType=false',
      method: 'GET',
    });
  });

  it('getFinancialChanges() calls GET dashboard/financial/changes', async () => {
    const { result } = renderHook(() => useDashboard());

    await result.current.getFinancialChanges();

    expect(mockCall).toHaveBeenCalledWith({
      url: 'dashboard/financial/changes',
      method: 'GET',
    });
  });

  it("getFinancialChanges('2024-01-01') calls GET dashboard/financial/changes?from=2024-01-01", async () => {
    const { result } = renderHook(() => useDashboard());

    await result.current.getFinancialChanges('2024-01-01');

    expect(mockCall).toHaveBeenCalledWith({
      url: 'dashboard/financial/changes?from=2024-01-01',
      method: 'GET',
    });
  });

  it('getFinancialChanges(undefined, true) calls GET dashboard/financial/changes?dailySample=true', async () => {
    const { result } = renderHook(() => useDashboard());

    await result.current.getFinancialChanges(undefined, true);

    expect(mockCall).toHaveBeenCalledWith({
      url: 'dashboard/financial/changes?dailySample=true',
      method: 'GET',
    });
  });

  it('getLatestBalance() calls GET dashboard/financial/latest', async () => {
    const { result } = renderHook(() => useDashboard());

    await result.current.getLatestBalance();

    expect(mockCall).toHaveBeenCalledWith({
      url: 'dashboard/financial/latest',
      method: 'GET',
    });
  });

  it('getLatestChanges() calls GET dashboard/financial/changes/latest', async () => {
    const { result } = renderHook(() => useDashboard());

    await result.current.getLatestChanges();

    expect(mockCall).toHaveBeenCalledWith({
      url: 'dashboard/financial/changes/latest',
      method: 'GET',
    });
  });

  it('getRefRecipients() calls GET dashboard/financial/ref-recipients', async () => {
    const { result } = renderHook(() => useDashboard());

    await result.current.getRefRecipients();

    expect(mockCall).toHaveBeenCalledWith({
      url: 'dashboard/financial/ref-recipients',
      method: 'GET',
    });
  });

  it("getRefRecipients('2024-01-01') calls GET dashboard/financial/ref-recipients?from=2024-01-01", async () => {
    const { result } = renderHook(() => useDashboard());

    await result.current.getRefRecipients('2024-01-01');

    expect(mockCall).toHaveBeenCalledWith({
      url: 'dashboard/financial/ref-recipients?from=2024-01-01',
      method: 'GET',
    });
  });
});
