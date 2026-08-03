import {
  PartnerGranularity,
  PartnerStatistic,
  PartnerTimeline,
  PartnerTimelineBucket,
} from 'src/dto/partner-statistic.dto';

/** Default demo window (30 calendar days ending 2026-06-30) — used when callers omit range. */
const DEFAULT_PERIOD_TO = '2026-06-30T23:59:59.000Z';
const DEFAULT_SPAN_DAYS = 30;

export interface FixtureRange {
  from?: string;
  to?: string;
}

function startOfUtcDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function isoAtUtcMidnight(d: Date): string {
  return startOfUtcDay(d).toISOString();
}

/** Inclusive day count between two ISO timestamps (UTC calendar days). */
function spanDays(fromIso: string, toIso: string): number {
  const from = startOfUtcDay(new Date(fromIso)).getTime();
  const to = startOfUtcDay(new Date(toIso)).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.round((to - from) / dayMs) + 1);
}

function resolveRange(range?: FixtureRange): { from: string; to: string; days: number } {
  const to = range?.to ?? DEFAULT_PERIOD_TO;
  let from = range?.from;
  if (!from) {
    const end = new Date(to);
    end.setUTCDate(end.getUTCDate() - (DEFAULT_SPAN_DAYS - 1));
    from = isoAtUtcMidnight(end);
  }
  return { from, to, days: spanDays(from, to) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function scaleNum(n: number, factor: number): number {
  return round2(n * factor);
}

/**
 * Realistic Cake partner fixture.
 * allTime volumes/users are production-checked Cake values (not scaled).
 * Period totals/breakdown scale with the requested window relative to the 30-day base.
 * Values are real throughout — averageTransactionVolume is the only field that can be
 * null (no transactions in the period), per the API contract.
 */
export function buildPartnerStatisticFixture(range?: FixtureRange): PartnerStatistic {
  const { from, to, days } = resolveRange(range);
  // Scale period metrics vs the 30-day base so 90/365 days show larger period totals
  const factor = days / DEFAULT_SPAN_DAYS;

  return {
    period: { from, to },
    currency: 'CHF',
    totals: {
      volume: {
        buy: scaleNum(214_850.4, factor),
        sell: scaleNum(22_310.75, factor),
        swap: scaleNum(8_640.2, factor),
        total: scaleNum(245_801.35, factor),
      },
      transactions: {
        buy: Math.round(1_842 * factor),
        sell: Math.round(312 * factor),
        swap: Math.round(96 * factor),
        total: Math.round(2_250 * factor),
      },
      averageTransactionVolume: 109.25,
      activeUsers: Math.round(1_286 * Math.min(factor, 2)),
      newUsers: Math.round(214 * Math.min(factor, 2)),
    },
    allTime: {
      volume: {
        buy: 11_858_002.52,
        sell: 855_027.41,
        total: 12_713_029.93,
      },
      registeredUsers: 126_547,
      tradingUsers: 24_360,
    },
    breakdown: {
      assets: [
        {
          name: 'BTC',
          blockchain: 'Bitcoin',
          direction: 'Buy',
          volume: scaleNum(98_420.5, factor),
          transactions: Math.round(620 * factor),
        },
        {
          name: 'ETH',
          blockchain: 'Ethereum',
          direction: 'Buy',
          volume: scaleNum(54_210.3, factor),
          transactions: Math.round(410 * factor),
        },
        {
          name: 'USDT',
          blockchain: 'Ethereum',
          direction: 'Buy',
          volume: scaleNum(28_100.0, factor),
          transactions: Math.round(280 * factor),
        },
        {
          name: 'XMR',
          blockchain: 'Monero',
          direction: 'Buy',
          volume: scaleNum(18_450.6, factor),
          transactions: Math.round(190 * factor),
        },
        {
          name: 'BTC',
          blockchain: 'Bitcoin',
          direction: 'Sell',
          volume: scaleNum(12_800.4, factor),
          transactions: Math.round(145 * factor),
        },
        {
          name: 'LTC',
          blockchain: 'Litecoin',
          direction: 'Buy',
          volume: scaleNum(8_920.0, factor),
          transactions: Math.round(95 * factor),
        },
        {
          name: 'ZEC',
          blockchain: 'Zcash',
          direction: 'Buy',
          volume: scaleNum(2_640.8, factor),
          transactions: Math.round(31 * factor),
        },
        {
          name: 'ETH',
          blockchain: 'Ethereum',
          direction: 'Sell',
          volume: scaleNum(5_210.35, factor),
          transactions: Math.round(88 * factor),
        },
        {
          name: 'SOL',
          blockchain: 'Solana',
          direction: 'Swap',
          volume: scaleNum(4_120.0, factor),
          transactions: Math.round(52 * factor),
        },
        {
          name: 'BNB',
          blockchain: 'BinanceSmartChain',
          direction: 'Buy',
          volume: scaleNum(3_890.2, factor),
          transactions: Math.round(48 * factor),
        },
      ],
      fiatCurrencies: [
        {
          name: 'CHF',
          volume: scaleNum(142_000.0, factor),
          transactions: Math.round(1_120 * factor),
        },
        {
          name: 'EUR',
          volume: scaleNum(78_500.5, factor),
          transactions: Math.round(780 * factor),
        },
        {
          // No USD activity in this period — the row must not render (dashboard drops it).
          name: 'USD',
          volume: 0,
          transactions: 0,
        },
      ],
      blockchains: [
        {
          name: 'Bitcoin',
          volume: scaleNum(111_220.9, factor),
          transactions: Math.round(765 * factor),
        },
        {
          name: 'Ethereum',
          volume: scaleNum(87_520.65, factor),
          transactions: Math.round(778 * factor),
        },
        {
          name: 'Monero',
          volume: scaleNum(18_450.6, factor),
          transactions: Math.round(190 * factor),
        },
        {
          name: 'Litecoin',
          volume: scaleNum(8_920.0, factor),
          transactions: Math.round(95 * factor),
        },
        {
          name: 'Solana',
          volume: scaleNum(4_120.0, factor),
          transactions: Math.round(52 * factor),
        },
        {
          name: 'BinanceSmartChain',
          volume: scaleNum(3_890.2, factor),
          transactions: Math.round(48 * factor),
        },
      ],
      paymentMethods: [
        {
          name: 'Bank',
          volume: scaleNum(156_400.0, factor),
          transactions: Math.round(1_380 * factor),
        },
        {
          // No card payments in this period — the row must not render (dashboard drops it).
          name: 'Card',
          volume: 0,
          transactions: 0,
        },
        {
          name: 'OnChain',
          volume: scaleNum(37_301.0, factor),
          transactions: Math.round(350 * factor),
        },
      ],
    },
    referral: {
      volume: scaleNum(42_180.5, factor),
      creditEarned: scaleNum(1_265.4, factor),
      creditPaid: scaleNum(980.0, factor),
      creditOpen: scaleNum(285.4, factor),
      currency: 'EUR',
    },
    meta: {
      generatedAt: '2026-07-01T08:00:00.000Z',
    },
  };
}

const DAY_PATTERN: Array<{ buy: number; sell: number; swap: number }> = [
  { buy: 6200, sell: 710, swap: 240 },
  { buy: 7100, sell: 820, swap: 310 },
  { buy: 5800, sell: 640, swap: 180 },
  { buy: 8400, sell: 910, swap: 420 },
  { buy: 0, sell: 0, swap: 0 }, // real zero day (index 4 in pattern; we also force index 5)
  { buy: 9200, sell: 1050, swap: 380 },
  { buy: 7800, sell: 880, swap: 290 },
  { buy: 6500, sell: 720, swap: 210 },
  { buy: 10100, sell: 1120, swap: 450 },
  { buy: 8700, sell: 940, swap: 330 },
  { buy: 7300, sell: 800, swap: 270 },
  { buy: 9600, sell: 1080, swap: 400 },
];

/** Index relative to a 30-day window that tests pin for real-zero behaviour. */
const ZERO_DAY_INDEX = 5;

function stepDaysFor(granularity: PartnerGranularity): number {
  switch (granularity) {
    case 'Week':
      return 7;
    case 'Month':
      return 30;
    case 'Day':
    default:
      return 1;
  }
}

function makeBucket(
  dateIso: string,
  volume: { buy: number; sell: number; swap: number },
  transactions: { buy: number; sell: number; swap: number },
  opts: { partial?: boolean } = {},
): PartnerTimelineBucket {
  return {
    date: dateIso,
    volume,
    transactions,
    partial: opts.partial === true,
  };
}

/**
 * Timeline fixture that honours requested range + granularity.
 *
 * - Bucket count grows with the window (30 / 90 / 365 days → distinct series lengths).
 * - Edge buckets are partial. One real-zero bucket is preserved (at a fixed offset from
 *   the start when the series is long enough) to keep the null-vs-0 distinction visible.
 * - Coarser granularity thins the series (week ≈ every 7 days, month ≈ every 30).
 */
export function buildPartnerTimelineFixture(
  granularity: PartnerGranularity = 'Day',
  range?: FixtureRange,
): PartnerTimeline {
  const { from, to, days } = resolveRange(range);
  const step = stepDaysFor(granularity);
  const bucketCount = Math.max(1, Math.ceil(days / step));
  // Per-bucket amplitude scales with step so week/month totals stay comparable to day sum
  const amplitude = step;

  const fromStart = startOfUtcDay(new Date(from));
  const buckets: PartnerTimelineBucket[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const bucketDate = new Date(fromStart);
    bucketDate.setUTCDate(bucketDate.getUTCDate() + i * step);
    const dateIso = isoAtUtcMidnight(bucketDate);

    // Day: fixed offset (index 5 zero) — tests pin this.
    // Week/Month: distinct mid-series slot so the marker survives coarse thinning.
    let zeroIdx = ZERO_DAY_INDEX;
    if (granularity !== 'Day') {
      zeroIdx = bucketCount >= 3 ? 1 : -1;
    }
    const isZero = i === zeroIdx;

    if (isZero) {
      buckets.push(
        makeBucket(
          dateIso,
          { buy: 0, sell: 0, swap: 0 },
          { buy: 0, sell: 0, swap: 0 },
          { partial: i === 0 || i === bucketCount - 1 },
        ),
      );
      continue;
    }

    const base = DAY_PATTERN[i % DAY_PATTERN.length];
    const scale = (0.85 + (i % 5) * 0.05) * amplitude;
    const volume = {
      buy: round2(base.buy * scale),
      sell: round2(base.sell * scale),
      swap: round2(base.swap * scale),
    };
    const transactions = {
      buy: Math.round((base.buy / 110) * scale),
      sell: Math.round((base.sell / 70) * scale),
      swap: Math.round((base.swap / 90) * scale),
    };
    buckets.push(
      makeBucket(dateIso, volume, transactions, {
        partial: i === 0 || i === bucketCount - 1,
      }),
    );
  }

  // Guarantee edges are partial even if the zero bucket landed there
  if (buckets.length > 0) {
    buckets[0] = { ...buckets[0], partial: true };
    buckets[buckets.length - 1] = { ...buckets[buckets.length - 1], partial: true };
  }

  return {
    period: { from, to },
    currency: 'CHF',
    granularity,
    buckets,
    meta: {
      generatedAt: '2026-07-01T08:00:00.000Z',
    },
  };
}
