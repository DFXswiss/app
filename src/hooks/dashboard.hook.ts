import { useMemo } from 'react';
import {
  FinancialChangesEntry,
  FinancialChangesResponse,
  FinancialLogChartResponse,
  FinancialLogResponse,
  KundengelderExtract,
  KundengelderTxList,
  LatestBalanceResponse,
  RefRewardRecipient,
} from 'src/dto/dashboard.dto';
import { useGuardedApi } from './guarded-api.hook';

export function useDashboard() {
  const { call } = useGuardedApi();

  function financialLogParams(from?: string, dailySample?: boolean): URLSearchParams {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (dailySample !== undefined) params.set('dailySample', String(dailySample));
    return params;
  }

  async function getFinancialLog(from?: string, dailySample?: boolean): Promise<FinancialLogResponse> {
    const query = financialLogParams(from, dailySample).toString();

    return call<FinancialLogResponse>({
      url: `dashboard/financial/log${query ? `?${query}` : ''}`,
      method: 'GET',
    });
  }

  async function getFinancialLogChart(from?: string, dailySample?: boolean): Promise<FinancialLogChartResponse> {
    const params = financialLogParams(from, dailySample);
    params.set('byType', 'false');
    const query = params.toString();

    return call<FinancialLogChartResponse>({
      url: `dashboard/financial/log?${query}`,
      method: 'GET',
    });
  }

  async function getFinancialChanges(from?: string, dailySample?: boolean): Promise<FinancialChangesResponse> {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (dailySample !== undefined) params.set('dailySample', String(dailySample));
    const query = params.toString();

    return call<FinancialChangesResponse>({
      url: `dashboard/financial/changes${query ? `?${query}` : ''}`,
      method: 'GET',
    });
  }

  async function getLatestBalance(): Promise<LatestBalanceResponse> {
    return call<LatestBalanceResponse>({
      url: 'dashboard/financial/latest',
      method: 'GET',
    });
  }

  async function getLatestChanges(): Promise<FinancialChangesEntry> {
    return call<FinancialChangesEntry>({
      url: 'dashboard/financial/changes/latest',
      method: 'GET',
    });
  }

  async function getRefRecipients(from?: string): Promise<RefRewardRecipient[]> {
    const query = from ? `?from=${from}` : '';
    return call<RefRewardRecipient[]>({
      url: `dashboard/financial/ref-recipients${query}`,
      method: 'GET',
    });
  }

  async function getKundengelderExtract(year: number): Promise<KundengelderExtract> {
    return call<KundengelderExtract>({
      url: `dashboard/financial/kundengelder?year=${year}`,
      method: 'GET',
    });
  }

  async function getKundengelderLines(year: number, iban: string, line: string): Promise<KundengelderTxList> {
    const params = new URLSearchParams();
    params.set('year', String(year));
    params.set('iban', iban);
    params.set('line', line);
    return call<KundengelderTxList>({
      url: `dashboard/financial/kundengelder/lines?${params.toString()}`,
      method: 'GET',
    });
  }

  return useMemo(
    () => ({
      getFinancialLog,
      getFinancialLogChart,
      getFinancialChanges,
      getLatestBalance,
      getLatestChanges,
      getRefRecipients,
      getKundengelderExtract,
      getKundengelderLines,
    }),
    [call],
  );
}
