import { useMemo } from 'react';
import { useGuardedApi } from './guarded-api.hook';
import {
  AccountHistory,
  AccountSummary,
  HoldersResponse,
  PaginationDirection,
  PriceHistoryEntry,
  RealUnitBuyVolumePoint,
  RealUnitHolderCountPoint,
  RealUnitQuote,
  RealUnitRegistrationStats,
  RealUnitTransaction,
  TokenInfo,
  TokenPrice,
} from 'src/dto/realunit.dto';
import { Timeframe } from 'src/util/chart';
import { apiUrl } from 'src/util/utils';

export function useRealunitApi() {
  const { call } = useGuardedApi();

  async function getAccountSummary(address: string): Promise<AccountSummary> {
    return call<AccountSummary>({
      url: `realunit/account/${address}`,
      method: 'GET',
    });
  }

  async function getAccountHistory(
    address: string,
    cursor?: string,
    direction?: PaginationDirection,
  ): Promise<AccountHistory> {
    const params = new URLSearchParams();
    cursor && direction && params.set(String(direction) === 'prev' ? 'before' : 'after', cursor);

    return call<AccountHistory>({
      url: apiUrl({ path: `realunit/account/${address}/history`, params }),
      method: 'GET',
    });
  }

  async function getHolders(cursor?: string, direction?: PaginationDirection): Promise<HoldersResponse> {
    const params = new URLSearchParams();
    cursor && direction && params.set(String(direction) === 'prev' ? 'before' : 'after', cursor);

    return call<HoldersResponse>({
      url: apiUrl({ path: 'realunit/holders', params }),
      method: 'GET',
    });
  }

  async function getTokenInfo(): Promise<TokenInfo> {
    return call<TokenInfo>({
      url: 'realunit/tokenInfo',
      method: 'GET',
    });
  }

  async function getTokenPrice(): Promise<TokenPrice> {
    return call<TokenPrice>({
      url: 'realunit/price',
      method: 'GET',
    });
  }

  async function getPriceHistory(timeFrame: Timeframe): Promise<PriceHistoryEntry[]> {
    const params = new URLSearchParams();
    params.set('timeFrame', timeFrame.toUpperCase());

    return call<PriceHistoryEntry[]>({
      url: apiUrl({ path: 'realunit/price/history', params }),
      method: 'GET',
    });
  }

  async function getAdminQuotes(limit?: number, offset?: number): Promise<RealUnitQuote[]> {
    const params = new URLSearchParams();
    if (limit != null) params.set('limit', String(limit));
    if (offset != null) params.set('offset', String(offset));

    return call<RealUnitQuote[]>({
      url: apiUrl({ path: 'realunit/admin/quotes', params }),
      method: 'GET',
    });
  }

  async function getAdminTransactions(limit?: number, offset?: number): Promise<RealUnitTransaction[]> {
    const params = new URLSearchParams();
    if (limit != null) params.set('limit', String(limit));
    if (offset != null) params.set('offset', String(offset));

    return call<RealUnitTransaction[]>({
      url: apiUrl({ path: 'realunit/admin/transactions', params }),
      method: 'GET',
    });
  }

  async function confirmPayment(id: number): Promise<void> {
    return call<void>({
      url: `realunit/admin/quotes/${id}/confirm-payment`,
      method: 'PUT',
    });
  }

  async function deactivateQuote(id: number): Promise<void> {
    return call<void>({
      url: `realunit/admin/quotes/${id}/deactivate`,
      method: 'PUT',
    });
  }

  async function getBuyVolume(timeFrame: Timeframe): Promise<RealUnitBuyVolumePoint[]> {
    const params = new URLSearchParams();
    params.set('timeFrame', timeFrame.toUpperCase());
    return call<RealUnitBuyVolumePoint[]>({
      url: apiUrl({ path: 'realunit/admin/stats/buy-volume', params }),
      method: 'GET',
    });
  }

  async function getRegistrationStats(timeFrame: Timeframe): Promise<RealUnitRegistrationStats> {
    const params = new URLSearchParams();
    params.set('timeFrame', timeFrame.toUpperCase());
    return call<RealUnitRegistrationStats>({
      url: apiUrl({ path: 'realunit/admin/stats/registration', params }),
      method: 'GET',
    });
  }

  async function getHolderCount(timeFrame: Timeframe): Promise<RealUnitHolderCountPoint[]> {
    const params = new URLSearchParams();
    params.set('timeFrame', timeFrame.toUpperCase());
    return call<RealUnitHolderCountPoint[]>({
      url: apiUrl({ path: 'realunit/admin/stats/holders', params }),
      method: 'GET',
    });
  }

  return useMemo(
    () => ({
      getAccountSummary,
      getAccountHistory,
      getHolders,
      getTokenInfo,
      getTokenPrice,
      getPriceHistory,
      getAdminQuotes,
      getAdminTransactions,
      confirmPayment,
      deactivateQuote,
      getBuyVolume,
      getRegistrationStats,
      getHolderCount,
    }),
    [call],
  );
}
