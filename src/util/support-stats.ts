// Pure ticket aging, escalation and statistics logic — no React or API dependencies,
// so it is cheap to unit-test in isolation.
import type { SupportIssueListItem } from 'src/hooks/support-dashboard.hook';

// Author marker the backend stamps on customer messages (mirrors `CustomerAuthor` in DFXswiss/backend).
export const CustomerAuthor = 'Customer';

// --- Customer waiting & escalation ---

// A ticket escalates once a customer has waited this long without a reply (= the top tier).
export const ESCALATION_HOURS = 24;

// Customer-waiting thresholds (hours waiting for a reply) with rising severity.
// The ≥24h tier equals the escalation threshold.
export const WAIT_TIER_HOURS = [1, 12, 24] as const;

// 0 = fresh (<1h), 1 = ≥1h, 2 = ≥12h, 3 = ≥24h (escalated)
export function waitTier(hoursWaiting: number): 0 | 1 | 2 | 3 {
  if (hoursWaiting >= 24) return 3;
  if (hoursWaiting >= 12) return 2;
  if (hoursWaiting >= 1) return 1;
  return 0;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function hoursSince(date: string | Date, now: Date = new Date()): number {
  return (now.getTime() - new Date(date).getTime()) / HOUR_MS;
}

export function daysSince(date: string | Date, now: Date = new Date()): number {
  return (now.getTime() - new Date(date).getTime()) / DAY_MS;
}

// Hours the customer has been waiting for a reply, or null if the ball is on our side
// (we answered last, or there are no messages yet). The clock restarts on every
// customer message because `lastMessageDate` always points at the latest message.
export function customerWaitingHours(issue: SupportIssueListItem, now: Date = new Date()): number | null {
  if (issue.lastMessageAuthor !== CustomerAuthor || !issue.lastMessageDate) return null;
  return hoursSince(issue.lastMessageDate, now);
}

// Human-friendly "2d 4h" / "5h" / "20m" elapsed string.
export function formatElapsed(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = Math.floor(hours / 24);
  const rest = Math.floor(hours % 24);
  return rest > 0 ? `${days}d ${rest}h` : `${days}d`;
}

// --- Open-ticket grouping ---

// Mirrors SupportIssueInternalState.CREATED / PENDING (kept as literals: this module has no
// @dfx.swiss/react dependency).
export const OpenIssueState = { created: 'Created', pending: 'Pending' } as const;

export interface OpenIssueGroups {
  customerWaiting: SupportIssueListItem[];
  created: SupportIssueListItem[];
  pending: SupportIssueListItem[];
}

// Splits an open-ticket list into the three dashboard sections: tickets whose last message came
// from the customer first (newest customer message on top), then the remaining Created and
// Pending tickets (newest created on top). An optional state filter narrows the list beforehand.
export function groupOpenIssues(issues: SupportIssueListItem[], stateFilter = ''): OpenIssueGroups {
  const filtered = stateFilter ? issues.filter((i) => i.state === stateFilter) : issues;

  const customerWaiting = filtered
    .filter((i) => i.lastMessageAuthor === CustomerAuthor)
    .sort((a, b) => new Date(b.lastMessageDate ?? 0).getTime() - new Date(a.lastMessageDate ?? 0).getTime());

  const rest = filtered.filter((i) => i.lastMessageAuthor !== CustomerAuthor);
  const byCreated = (a: SupportIssueListItem, b: SupportIssueListItem): number =>
    new Date(b.created).getTime() - new Date(a.created).getTime();

  return {
    customerWaiting,
    created: rest.filter((i) => i.state === OpenIssueState.created).sort(byCreated),
    pending: rest.filter((i) => i.state === OpenIssueState.pending).sort(byCreated),
  };
}

export function countOpenIssueGroups(groups: OpenIssueGroups): number {
  return groups.customerWaiting.length + groups.created.length + groups.pending.length;
}

// --- Statistics ---

export type StatGranularity = 'day' | 'month';

// Selectable analysis periods for the statistics tab. Labels are i18n keys (with
// interpolation params) resolved at render time, not hardcoded strings.
export const STAT_PERIODS: { days: number; labelKey: string; labelParams: Record<string, number> }[] = [
  { days: 7, labelKey: '{{days}} days', labelParams: { days: 7 } },
  { days: 30, labelKey: '{{days}} days', labelParams: { days: 30 } },
  { days: 183, labelKey: '{{months}} months', labelParams: { months: 6 } },
  { days: 365, labelKey: '{{months}} months', labelParams: { months: 12 } },
];
export const DEFAULT_STAT_PERIOD_DAYS = 365;

export interface TicketBucket {
  key: string; // stable bucket key ("YYYY-MM-DD" / "YYYY-MM"); localized for display via trendLabel()
  count: number;
}

export interface ResolutionBucket {
  key: string; // issue type
  avgHours: number;
  count: number;
}

// Ticket state marking a resolved ticket (mirrors SupportIssueInternalState.COMPLETED in DFXswiss/backend).
export const COMPLETED_STATE = 'Completed';

export interface TicketStatistics {
  periodDays: number;
  total: number; // tickets created within the period
  avgMessages: number; // mean messages per ticket within the period
  perDay: number; // tickets per day within the period
  granularity: StatGranularity;
  trend: TicketBucket[]; // buckets across the period, oldest first
  avgResolutionHours: number; // mean creation→completion time of tickets completed in the period
  resolutionByType: ResolutionBucket[]; // average resolution time per type, descending by count
}

const pad = (n: number): string => String(n).padStart(2, '0');
const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export function granularityFor(periodDays: number): StatGranularity {
  return periodDays <= 31 ? 'day' : 'month';
}

// Turns a stable bucket key ("YYYY-MM-DD" / "YYYY-MM") into a display label. The numeric day label
// is notation and stays Swiss; a month name is a word and follows the interface language.
export function trendLabel(stableKey: string, granularity: StatGranularity, locale: string): string {
  const [y, m, d] = stableKey.split('-').map(Number);
  return granularity === 'day'
    ? new Date(y, m - 1, d).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' })
    : new Date(y, m - 1, 1).toLocaleString(locale, { month: 'short' });
}

export function computeStatistics(
  issues: SupportIssueListItem[],
  periodDays: number,
  now: Date = new Date(),
): TicketStatistics {
  const granularity = granularityFor(periodDays);

  // Build the (empty) buckets first and let their span define the period window, so the
  // headline `total` always equals the sum of the trend buckets. Filtering `inPeriod` by a
  // rolling `daysSince <= periodDays` window instead would let a boundary-aged ticket count
  // toward `total` while its bucket key falls before the oldest bucket and is dropped.
  const buckets = new Map<string, number>();
  let periodStart: Date;
  if (granularity === 'day') {
    periodStart = new Date(now);
    periodStart.setHours(0, 0, 0, 0);
    periodStart.setDate(periodStart.getDate() - (Math.round(periodDays) - 1));
    for (let d = Math.round(periodDays) - 1; d >= 0; d--) {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - d);
      buckets.set(dayKey(date), 0);
    }
  } else {
    const months = Math.max(1, Math.round(periodDays / 30));
    periodStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    for (let m = months - 1; m >= 0; m--) {
      buckets.set(monthKey(new Date(now.getFullYear(), now.getMonth() - m, 1)), 0);
    }
  }

  const inPeriod = issues.filter((i) => new Date(i.created) >= periodStart && new Date(i.created) <= now);
  const total = inPeriod.length;
  const messages = inPeriod.reduce((sum, i) => sum + (i.messageCount ?? 0), 0);

  for (const issue of inPeriod) {
    const d = new Date(issue.created);
    const key = granularity === 'day' ? dayKey(d) : monthKey(d);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) as number) + 1);
  }

  // resolution time per type for tickets completed within the period (same window as above)
  const resolved = issues.filter(
    (i) => i.state === COMPLETED_STATE && i.updated && new Date(i.updated) >= periodStart && new Date(i.updated) <= now,
  );
  const resolutionHours = (i: SupportIssueListItem): number =>
    (new Date(i.updated as string).getTime() - new Date(i.created).getTime()) / (60 * 60 * 1000);
  const byType = new Map<string, { sum: number; count: number }>();
  for (const i of resolved) {
    const e = byType.get(i.type) ?? { sum: 0, count: 0 };
    e.sum += resolutionHours(i);
    e.count += 1;
    byType.set(i.type, e);
  }
  const resolutionByType = Array.from(byType.entries())
    .map(([key, v]) => ({ key, avgHours: v.sum / v.count, count: v.count }))
    .sort((a, b) => b.count - a.count);
  const avgResolutionHours =
    resolved.length > 0 ? resolved.reduce((sum, i) => sum + resolutionHours(i), 0) / resolved.length : 0;

  return {
    periodDays,
    total,
    avgMessages: total > 0 ? messages / total : 0,
    perDay: periodDays > 0 ? total / periodDays : 0,
    granularity,
    // Stable bucket keys; the screen localizes them at render time.
    trend: Array.from(buckets.entries()).map(([key, count]) => ({ key, count })),
    avgResolutionHours,
    resolutionByType,
  };
}
