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
import { AUTH_TOKEN_KEY, clearAuthToken, isTokenValid, readAuthToken } from 'src/partner-dashboard/util/auth';
import { isFixtureMode } from 'src/partner-dashboard/util/format';

export interface PartnerQuery {
  from?: string;
  to?: string;
  granularity?: PartnerGranularity;
}

const DEFAULT_GRANULARITY: PartnerGranularity = 'Day';

export class PartnerApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'PartnerApiError';
    this.status = status;
  }
}

export function partnerApiBase(): string {
  const rawBase = process.env.REACT_APP_API_URL ?? 'https://api.dfx.swiss';
  // Strip accidental inline comments from .env values (CRA does not strip them).
  return rawBase.replace(/\s+#.*$/, '').trim().replace(/\/+$/, '');
}

function buildQuery(params: PartnerQuery): string {
  const search = new URLSearchParams();
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  if (params.granularity) search.set('granularity', params.granularity);
  const q = search.toString();
  return q ? `?${q}` : '';
}

async function parseErrorDetail(response: Response): Promise<string> {
  let detail = response.statusText;
  try {
    const body = (await response.json()) as { message?: string };
    if (body?.message) detail = body.message;
  } catch {
    // ignore body parse errors
  }
  return detail;
}

/**
 * Standalone partner API GET — does not use DfxContextProvider / useApi,
 * so fixture mode never touches the network and bootstrap endpoints are never hit.
 *
 * On 401 the stored token is cleared so the login screen can take over.
 */
export async function partnerApiGet<T>(path: string): Promise<T> {
  const base = partnerApiBase();
  const url = `${base}/v1/${path.replace(/^\/+/, '')}`;

  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = readAuthToken();
  if (token && isTokenValid(token)) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { method: 'GET', headers });
  if (!response.ok) {
    if (response.status === 401) {
      clearAuthToken();
    }
    const detail = await parseErrorDetail(response);
    throw new PartnerApiError(response.status, `Partner-API ${response.status}: ${detail}`);
  }
  return response.json() as Promise<T>;
}

export async function partnerApiPost<T>(
  path: string,
  body: unknown,
  options: { auth?: boolean } = {},
): Promise<T> {
  const base = partnerApiBase();
  const url = `${base}/v1/${path.replace(/^\/+/, '')}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (options.auth !== false) {
    const token = readAuthToken();
    if (token && isTokenValid(token)) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.status === 401) {
      clearAuthToken();
    }
    const detail = await parseErrorDetail(response);
    throw new PartnerApiError(response.status, detail || `Partner-API ${response.status}`);
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

// Re-export for callers that previously imported the key from this module.
export { AUTH_TOKEN_KEY };
