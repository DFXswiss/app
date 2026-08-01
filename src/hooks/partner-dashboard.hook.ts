import { useCallback, useMemo } from 'react';
import {
  PartnerGranularity,
  PartnerStatistic,
  PartnerTimeline,
} from 'src/dto/partner-statistic.dto';
import {
  buildPartnerStatisticFixture,
  buildPartnerTimelineFixture,
} from 'src/partner-dashboard/fixtures/partner-statistic.fixture';
import { isFixtureMode } from 'src/partner-dashboard/util/format';

export interface PartnerQuery {
  from?: string;
  to?: string;
  granularity?: PartnerGranularity;
}

const AUTH_TOKEN_KEY = 'dfx.authenticationToken';
const DEFAULT_GRANULARITY: PartnerGranularity = 'Day';

function buildQuery(params: PartnerQuery): string {
  const search = new URLSearchParams();
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  if (params.granularity) search.set('granularity', params.granularity);
  const q = search.toString();
  return q ? `?${q}` : '';
}

/**
 * Standalone partner API call — does not use DfxContextProvider / useApi,
 * so fixture mode never touches the network and bootstrap endpoints are never hit.
 */
export async function partnerApiGet<T>(path: string): Promise<T> {
  const rawBase = process.env.REACT_APP_API_URL ?? 'https://api.dfx.swiss';
  // Strip accidental inline comments from .env values (CRA does not strip them).
  const base = rawBase.replace(/\s+#.*$/, '').trim().replace(/\/+$/, '');
  const url = `${base}/v1/${path.replace(/^\/+/, '')}`;

  const headers: Record<string, string> = { Accept: 'application/json' };
  try {
    const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // storage blocked — continue unauthenticated
  }

  const response = await fetch(url, { method: 'GET', headers });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { message?: string };
      if (body?.message) detail = body.message;
    } catch {
      // ignore body parse errors
    }
    throw new Error(`Partner-API ${response.status}: ${detail}`);
  }
  return response.json() as Promise<T>;
}

export function usePartnerDashboard() {
  const fixture = isFixtureMode();

  const getPartnerStatistic = useCallback(
    async (params: PartnerQuery = {}): Promise<PartnerStatistic> => {
      if (fixture) {
        return buildPartnerStatisticFixture({ from: params.from, to: params.to });
      }
      return partnerApiGet<PartnerStatistic>(`statistic/partner${buildQuery(params)}`);
    },
    [fixture],
  );

  const getPartnerTimeline = useCallback(
    async (params: PartnerQuery = {}): Promise<PartnerTimeline> => {
      if (fixture) {
        return buildPartnerTimelineFixture(params.granularity ?? DEFAULT_GRANULARITY, {
          from: params.from,
          to: params.to,
        });
      }
      return partnerApiGet<PartnerTimeline>(`statistic/partner/timeline${buildQuery(params)}`);
    },
    [fixture],
  );

  return useMemo(
    () => ({ getPartnerStatistic, getPartnerTimeline, isFixture: fixture }),
    [getPartnerStatistic, getPartnerTimeline, fixture],
  );
}
