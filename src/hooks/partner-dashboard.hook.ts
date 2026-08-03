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
import { useGuardedApi } from './guarded-api.hook';

export interface PartnerQuery {
  from?: string;
  to?: string;
  granularity?: PartnerGranularity;
}

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
 * Partner metrics via the main-app session (`useGuardedApi` + session token).
 * Fixture mode returns baked-in data and never hits the network — kept so
 * presentation tests can render the dashboard without API/auth providers.
 */
export function usePartnerDashboard() {
  // staff/partner endpoints answer HTTP 403 { code: 'TFA_REQUIRED' } when the session still needs 2FA;
  // useGuardedApi routes that into the bearer-based 2FA flow instead of surfacing a raw error
  const { call: guardedCall } = useGuardedApi();
  const fixture = isFixtureMode();

  const getPartnerStatistic = useCallback(
    async (params: PartnerQuery = {}): Promise<PartnerStatistic> => {
      if (fixture) {
        return buildPartnerStatisticFixture({ from: params.from, to: params.to });
      }
      return guardedCall<PartnerStatistic>({
        url: `statistic/partner${buildQuery(params)}`,
        method: 'GET',
      });
    },
    [fixture, guardedCall],
  );

  const getPartnerTimeline = useCallback(
    async (params: PartnerQuery = {}): Promise<PartnerTimeline> => {
      if (fixture) {
        return buildPartnerTimelineFixture(params.granularity ?? DEFAULT_GRANULARITY, {
          from: params.from,
          to: params.to,
        });
      }
      return guardedCall<PartnerTimeline>({
        url: `statistic/partner/timeline${buildQuery(params)}`,
        method: 'GET',
      });
    },
    [fixture, guardedCall],
  );

  return useMemo(
    () => ({ getPartnerStatistic, getPartnerTimeline, isFixture: fixture }),
    [getPartnerStatistic, getPartnerTimeline, fixture],
  );
}
