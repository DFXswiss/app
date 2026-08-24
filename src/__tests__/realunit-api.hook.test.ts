// Unit tests for useRealunitApi: every method's URL, verb, and optional query params.

import { renderHook } from '@testing-library/react';

const mockCall = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  useApi: () => ({ call: mockCall }),
}));

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: mockCall }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

import { PaginationDirection } from 'src/dto/realunit.dto';
import { useRealunitApi } from 'src/hooks/realunit-api.hook';
import { Timeframe } from 'src/util/chart';

describe('useRealunitApi', () => {
  beforeEach(() => {
    mockCall.mockReset().mockResolvedValue(undefined);
  });

  it('getAccountSummary GETs realunit/account/:address', async () => {
    const { result } = renderHook(() => useRealunitApi());
    await result.current.getAccountSummary('0xabc');
    expect(mockCall).toHaveBeenCalledWith({ url: 'realunit/account/0xabc', method: 'GET' });
  });

  it('getAccountHistory omits cursor params when cursor or direction is missing', async () => {
    const { result } = renderHook(() => useRealunitApi());
    await result.current.getAccountHistory('0xabc');
    expect(mockCall).toHaveBeenCalledWith({ url: 'realunit/account/0xabc/history', method: 'GET' });
  });

  it('getAccountHistory maps prev to before and other directions to after', async () => {
    const { result } = renderHook(() => useRealunitApi());

    await result.current.getAccountHistory('0xabc', 'cur1', PaginationDirection.PREV);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'realunit/account/0xabc/history?before=cur1',
      method: 'GET',
    });

    mockCall.mockClear();
    await result.current.getAccountHistory('0xabc', 'cur2', PaginationDirection.NEXT);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'realunit/account/0xabc/history?after=cur2',
      method: 'GET',
    });
  });

  it('getHolders omits cursor params when cursor or direction is missing', async () => {
    const { result } = renderHook(() => useRealunitApi());
    await result.current.getHolders();
    expect(mockCall).toHaveBeenCalledWith({ url: 'realunit/holders', method: 'GET' });
  });

  it('getHolders maps prev to before and other directions to after', async () => {
    const { result } = renderHook(() => useRealunitApi());

    await result.current.getHolders('h1', PaginationDirection.PREV);
    expect(mockCall).toHaveBeenCalledWith({ url: 'realunit/holders?before=h1', method: 'GET' });

    mockCall.mockClear();
    await result.current.getHolders('h2', PaginationDirection.NEXT);
    expect(mockCall).toHaveBeenCalledWith({ url: 'realunit/holders?after=h2', method: 'GET' });
  });

  it('getTokenInfo GETs realunit/tokenInfo', async () => {
    const { result } = renderHook(() => useRealunitApi());
    await result.current.getTokenInfo();
    expect(mockCall).toHaveBeenCalledWith({ url: 'realunit/tokenInfo', method: 'GET' });
  });

  it('getTokenPrice GETs realunit/price', async () => {
    const { result } = renderHook(() => useRealunitApi());
    await result.current.getTokenPrice();
    expect(mockCall).toHaveBeenCalledWith({ url: 'realunit/price', method: 'GET' });
  });

  it('getPriceHistory uppercases the timeframe query param', async () => {
    const { result } = renderHook(() => useRealunitApi());
    await result.current.getPriceHistory(Timeframe.MONTH);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'realunit/price/history?timeFrame=1M',
      method: 'GET',
    });

    mockCall.mockClear();
    await result.current.getPriceHistory(Timeframe.ALL);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'realunit/price/history?timeFrame=ALL',
      method: 'GET',
    });
  });

  it('getAdminQuotes omits limit/offset when unset and includes them when set', async () => {
    const { result } = renderHook(() => useRealunitApi());

    await result.current.getAdminQuotes();
    expect(mockCall).toHaveBeenCalledWith({ url: 'realunit/admin/quotes', method: 'GET' });

    mockCall.mockClear();
    await result.current.getAdminQuotes(50, 10);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'realunit/admin/quotes?limit=50&offset=10',
      method: 'GET',
    });
  });

  it('getAdminTransactions omits limit/offset when unset and includes them when set', async () => {
    const { result } = renderHook(() => useRealunitApi());

    await result.current.getAdminTransactions();
    expect(mockCall).toHaveBeenCalledWith({ url: 'realunit/admin/transactions', method: 'GET' });

    mockCall.mockClear();
    await result.current.getAdminTransactions(25, 5);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'realunit/admin/transactions?limit=25&offset=5',
      method: 'GET',
    });
  });

  it('confirmPayment PUTs realunit/admin/quotes/:id/confirm-payment', async () => {
    const { result } = renderHook(() => useRealunitApi());
    await result.current.confirmPayment(3);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'realunit/admin/quotes/3/confirm-payment',
      method: 'PUT',
    });
  });

  it('getBuyVolume uppercases the timeframe query param', async () => {
    const { result } = renderHook(() => useRealunitApi());
    await result.current.getBuyVolume(Timeframe.ALL);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'realunit/admin/stats/buy-volume?timeFrame=ALL',
      method: 'GET',
    });
  });

  it('getRegistrationStats uppercases the timeframe query param', async () => {
    const { result } = renderHook(() => useRealunitApi());
    await result.current.getRegistrationStats(Timeframe.MONTH);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'realunit/admin/stats/registration?timeFrame=1M',
      method: 'GET',
    });
  });

  it('getHolderCount uppercases the timeframe query param', async () => {
    const { result } = renderHook(() => useRealunitApi());
    await result.current.getHolderCount(Timeframe.WEEK);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'realunit/admin/stats/holders?timeFrame=1W',
      method: 'GET',
    });
  });

  it('deactivateQuote PUTs realunit/admin/quotes/:id/deactivate', async () => {
    const { result } = renderHook(() => useRealunitApi());
    await result.current.deactivateQuote(7);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'realunit/admin/quotes/7/deactivate',
      method: 'PUT',
    });
  });
});
