import type { SupportIssueListItem } from '../hooks/support-dashboard.hook';
import {
  computeStatistics,
  countOpenIssueGroups,
  customerWaitingHours,
  daysSince,
  formatElapsed,
  granularityFor,
  groupOpenIssues,
  hoursSince,
  trendLabel,
  waitTier,
} from '../util/support-stats';

const NOW = new Date('2026-06-18T12:00:00Z');

function hoursAgo(h: number): string {
  return new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString();
}

function daysAgo(d: number): string {
  return new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000).toISOString();
}

function issue(partial: Partial<SupportIssueListItem>): SupportIssueListItem {
  return {
    id: 1,
    uid: 'u1',
    type: 'TransactionIssue',
    reason: 'Other',
    state: 'Pending',
    name: 'Test',
    created: NOW.toISOString(),
    messageCount: 1,
    ...partial,
  };
}

describe('support-helpers elapsed time', () => {
  it('computes hoursSince from string and Date with an explicit now', () => {
    expect(hoursSince(hoursAgo(5), NOW)).toBeCloseTo(5);
    expect(hoursSince(new Date(hoursAgo(3)), NOW)).toBeCloseTo(3);
  });

  it('defaults hoursSince now to the current time', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(hoursSince(threeHoursAgo)).toBeCloseTo(3, 0);
  });

  it('computes daysSince from string and Date with an explicit now', () => {
    expect(daysSince(daysAgo(2), NOW)).toBeCloseTo(2);
    expect(daysSince(new Date(daysAgo(1)), NOW)).toBeCloseTo(1);
  });

  it('defaults daysSince now to the current time', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysSince(twoDaysAgo)).toBeCloseTo(2, 0);
  });

  it('formats elapsed hours across minute, hour, and day paths', () => {
    expect(formatElapsed(0)).toBe('1m');
    expect(formatElapsed(0.5)).toBe('30m');
    expect(formatElapsed(5)).toBe('5h');
    expect(formatElapsed(26)).toBe('1d 2h');
    expect(formatElapsed(48)).toBe('2d');
  });
});

describe('support-helpers customer waiting', () => {
  it('reports the waiting time only while the customer is awaiting a reply', () => {
    expect(
      customerWaitingHours(issue({ lastMessageAuthor: 'Customer', lastMessageDate: hoursAgo(25) }), NOW),
    ).toBeCloseTo(25);
    expect(
      customerWaitingHours(issue({ lastMessageAuthor: 'Customer', lastMessageDate: hoursAgo(5) }), NOW),
    ).toBeCloseTo(5);
  });

  it('returns null when we replied last (timer resets on author flip) or there are no messages', () => {
    expect(customerWaitingHours(issue({ lastMessageAuthor: 'Josh', lastMessageDate: hoursAgo(40) }), NOW)).toBeNull();
    expect(customerWaitingHours(issue({ messageCount: 0 }), NOW)).toBeNull();
    expect(
      customerWaitingHours(issue({ lastMessageAuthor: 'Customer', lastMessageDate: undefined }), NOW),
    ).toBeNull();
  });

  it('defaults customerWaitingHours now to the current time', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(
      customerWaitingHours(issue({ lastMessageAuthor: 'Customer', lastMessageDate: threeHoursAgo })),
    ).toBeCloseTo(3, 0);
  });

  it('maps waiting time to rising-severity tiers (1h/12h/24h; 24h = escalated)', () => {
    expect(waitTier(0.5)).toBe(0);
    expect(waitTier(5)).toBe(1);
    expect(waitTier(13)).toBe(2);
    expect(waitTier(25)).toBe(3);
  });
});

describe('support-helpers statistics', () => {
  it('chooses daily granularity for short periods and monthly for long ones', () => {
    expect(granularityFor(7)).toBe('day');
    expect(granularityFor(30)).toBe('day');
    expect(granularityFor(183)).toBe('month');
    expect(granularityFor(365)).toBe('month');
  });

  it('counts only tickets within the selected period and averages their messages', () => {
    const issues = [
      issue({ id: 1, created: daysAgo(2), messageCount: 4 }),
      issue({ id: 2, created: daysAgo(10), messageCount: 2 }),
      issue({ id: 3, created: daysAgo(40), messageCount: 10 }), // outside 30d
    ];

    const stats = computeStatistics(issues, 30, NOW);
    expect(stats.total).toBe(2);
    expect(stats.avgMessages).toBeCloseTo(3); // (4 + 2) / 2
    expect(stats.perDay).toBeCloseTo(2 / 30);
  });

  it('builds one daily bucket per day for a 7-day period, oldest first', () => {
    const stats = computeStatistics([issue({ created: hoursAgo(1) })], 7, NOW);
    expect(stats.granularity).toBe('day');
    expect(stats.trend).toHaveLength(7);
    expect(stats.trend[stats.trend.length - 1].count).toBe(1); // today
    expect(stats.trend.reduce((s, b) => s + b.count, 0)).toBe(1);
  });

  it('builds twelve monthly buckets for a yearly period', () => {
    const stats = computeStatistics([], 365, NOW);
    expect(stats.granularity).toBe('month');
    expect(stats.trend).toHaveLength(12);
  });

  it('increments the current month bucket for an in-period ticket on a yearly window', () => {
    const stats = computeStatistics([issue({ created: daysAgo(2) })], 365, NOW);
    expect(stats.granularity).toBe('month');
    expect(stats.total).toBe(1);
    expect(stats.trend[stats.trend.length - 1].count).toBe(1);
    expect(stats.trend.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(1);
  });

  it('defaults computeStatistics now to the current time', () => {
    const stats = computeStatistics([]);
    expect(stats.total).toBe(0);
    expect(stats.avgMessages).toBe(0);
  });

  it('returns zeroed values for an empty input', () => {
    const stats = computeStatistics([], 30, NOW);
    expect(stats.total).toBe(0);
    expect(stats.avgMessages).toBe(0);
    expect(stats.perDay).toBe(0);
  });

  it('averages resolution hours for completed tickets updated inside the period', () => {
    const issues = [
      issue({
        id: 1,
        type: 'KycIssue',
        state: 'Completed',
        created: daysAgo(5),
        updated: daysAgo(1),
      }),
      issue({
        id: 2,
        type: 'KycIssue',
        state: 'Completed',
        created: daysAgo(4),
        updated: daysAgo(2),
      }),
      issue({
        id: 5,
        type: 'BugReport',
        state: 'Completed',
        created: daysAgo(3),
        updated: daysAgo(1),
      }),
      issue({
        id: 3,
        type: 'BugReport',
        state: 'Completed',
        created: daysAgo(40),
        updated: daysAgo(35), // updated outside 30d window
      }),
      issue({
        id: 4,
        type: 'GenericIssue',
        state: 'Completed',
        created: daysAgo(3),
        // no updated → ignored
      }),
    ];

    const stats = computeStatistics(issues, 30, NOW);
    expect(stats.avgResolutionHours).toBeCloseTo((4 * 24 + 2 * 24 + 2 * 24) / 3);
    expect(stats.resolutionByType).toEqual([
      { key: 'KycIssue', count: 2, avgHours: (96 + 48) / 2 },
      { key: 'BugReport', count: 1, avgHours: 48 },
    ]);
  });

  it('treats a missing messageCount as 0 toward avgMessages', () => {
    const stats = computeStatistics(
      [issue({ created: daysAgo(1), messageCount: undefined }), issue({ id: 2, created: daysAgo(1), messageCount: 4 })],
      30,
      NOW,
    );
    expect(stats.avgMessages).toBeCloseTo(2);
  });

  it('returns perDay 0 when periodDays is 0', () => {
    const stats = computeStatistics([issue({ created: hoursAgo(1) })], 0, NOW);
    expect(stats.perDay).toBe(0);
  });
});

describe('support-helpers trendLabel', () => {
  it('formats the day label in Swiss notation regardless of the interface language', () => {
    expect(trendLabel('2026-06-18', 'day', 'en-US')).toBe('18.06.');
    expect(trendLabel('2026-06-18', 'day', 'de-CH')).toBe('18.06.');
  });

  it('translates the month name into the interface language', () => {
    expect(trendLabel('2026-06', 'month', 'en-US')).toBe('Jun');
    expect(trendLabel('2026-06', 'month', 'fr-FR')).toBe('juin');
    expect(trendLabel('2026-06', 'month', 'it-IT')).toBe('giu');
  });
});

describe('groupOpenIssues', () => {
  it('puts customer-waiting tickets first, newest customer message on top, regardless of state', () => {
    const groups = groupOpenIssues([
      issue({ id: 1, state: 'Pending', lastMessageAuthor: 'Customer', lastMessageDate: '2026-08-30T11:00:00Z' }),
      issue({ id: 2, state: 'Created', lastMessageAuthor: 'Customer', lastMessageDate: '2026-08-31T09:00:00Z' }),
      issue({ id: 3, state: 'Created', lastMessageAuthor: 'Jana' }),
    ]);

    expect(groups.customerWaiting.map((i) => i.id)).toEqual([2, 1]);
    expect(groups.created.map((i) => i.id)).toEqual([3]);
    expect(groups.pending).toEqual([]);
    expect(countOpenIssueGroups(groups)).toBe(3);
  });

  it('splits the rest into Created and Pending, newest created on top', () => {
    const groups = groupOpenIssues([
      issue({ id: 1, state: 'Pending', created: '2026-08-28T10:00:00Z', lastMessageAuthor: 'Jana' }),
      issue({ id: 2, state: 'Pending', created: '2026-08-30T10:00:00Z', lastMessageAuthor: 'Jana' }),
      issue({ id: 3, state: 'Created', created: '2026-08-29T10:00:00Z' }),
    ]);

    expect(groups.customerWaiting).toEqual([]);
    expect(groups.created.map((i) => i.id)).toEqual([3]);
    expect(groups.pending.map((i) => i.id)).toEqual([2, 1]);
  });

  it('applies the state filter before grouping, also to customer-waiting tickets', () => {
    const groups = groupOpenIssues(
      [
        issue({ id: 1, state: 'Pending', lastMessageAuthor: 'Customer', lastMessageDate: '2026-08-30T11:00:00Z' }),
        issue({ id: 2, state: 'Created', lastMessageAuthor: 'Customer', lastMessageDate: '2026-08-31T09:00:00Z' }),
        issue({ id: 3, state: 'Created' }),
      ],
      'Created',
    );

    expect(groups.customerWaiting.map((i) => i.id)).toEqual([2]);
    expect(groups.created.map((i) => i.id)).toEqual([3]);
    expect(groups.pending).toEqual([]);
    expect(countOpenIssueGroups(groups)).toBe(2);
  });

  it('returns empty groups and a zero count for an empty input', () => {
    const groups = groupOpenIssues([]);
    expect(groups).toEqual({ customerWaiting: [], created: [], pending: [] });
    expect(countOpenIssueGroups(groups)).toBe(0);
  });

  it('treats an empty-string stateFilter as no filter', () => {
    const groups = groupOpenIssues(
      [
        issue({ id: 1, state: 'Pending', lastMessageAuthor: 'Jana' }),
        issue({ id: 2, state: 'Created', lastMessageAuthor: 'Jana' }),
      ],
      '',
    );

    expect(groups.created.map((i) => i.id)).toEqual([2]);
    expect(groups.pending.map((i) => i.id)).toEqual([1]);
    expect(countOpenIssueGroups(groups)).toBe(2);
  });

  it('puts a customer-authored ticket without lastMessageDate into customerWaiting', () => {
    const groups = groupOpenIssues([
      issue({ id: 9, state: 'Pending', lastMessageAuthor: 'Customer', lastMessageDate: undefined }),
      issue({
        id: 10,
        state: 'Created',
        lastMessageAuthor: 'Customer',
        lastMessageDate: '2026-08-31T09:00:00Z',
      }),
    ]);

    expect(groups.customerWaiting.map((i) => i.id)).toEqual([10, 9]);
    expect(groups.created).toEqual([]);
    expect(groups.pending).toEqual([]);
  });

  it('drops tickets that are neither Created nor Pending and not customer-waiting', () => {
    const groups = groupOpenIssues([
      issue({ id: 1, state: 'OnHold', lastMessageAuthor: 'Jana' }),
      issue({ id: 2, state: 'Completed', lastMessageAuthor: 'Josh' }),
      issue({ id: 3, state: 'Canceled' }),
    ]);

    expect(groups.customerWaiting).toEqual([]);
    expect(groups.created).toEqual([]);
    expect(groups.pending).toEqual([]);
    expect(countOpenIssueGroups(groups)).toBe(0);
  });
});
