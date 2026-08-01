import {
  PartnerGranularity,
  PartnerStatistic,
  PartnerTimeline,
  PartnerTimelineBucket,
} from 'src/dto/partner-statistic.dto';

const SUPPRESSION_THRESHOLD = 5;

function isoDaysAgo(days: number, end = new Date('2026-06-30T23:59:59.000Z')): string {
  const d = new Date(end);
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

const PERIOD_TO = '2026-06-30T23:59:59.000Z';
const PERIOD_FROM = isoDaysAgo(29, new Date(PERIOD_TO));

/**
 * Realistic monthly-scale Cake partner fixture.
 * allTime volumes/users are production-checked Cake values.
 * Includes nulls for acceptance of suppression UI (asset, timeline bucket, completion counter).
 */
export function buildPartnerStatisticFixture(): PartnerStatistic {
  return {
    period: { from: PERIOD_FROM, to: PERIOD_TO },
    currency: 'CHF',
    totals: {
      volume: {
        buy: 214_850.4,
        sell: 22_310.75,
        swap: 8_640.2,
        total: 245_801.35,
      },
      transactions: {
        buy: 1_842,
        sell: 312,
        swap: 96,
        total: 2_250,
      },
      averageTransactionVolume: 109.25,
      activeUsers: 1_286,
      // null = suppressed under threshold (demo of KPI gap)
      newUsers: null,
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
        { name: 'BTC', blockchain: 'Bitcoin', direction: 'buy', volume: 98_420.5, transactions: 620 },
        { name: 'ETH', blockchain: 'Ethereum', direction: 'buy', volume: 54_210.3, transactions: 410 },
        { name: 'USDT', blockchain: 'Ethereum', direction: 'buy', volume: 28_100.0, transactions: 280 },
        { name: 'XMR', blockchain: 'Monero', direction: 'buy', volume: 18_450.6, transactions: 190 },
        { name: 'BTC', blockchain: 'Bitcoin', direction: 'sell', volume: 12_800.4, transactions: 145 },
        { name: 'LTC', blockchain: 'Litecoin', direction: 'buy', volume: 8_920.0, transactions: 95 },
        // suppressed asset row (null volume/tx) — shown as privacy gap in the bar list
        { name: 'ZEC', blockchain: 'Zcash', direction: 'buy', volume: null, transactions: null },
        { name: 'ETH', blockchain: 'Ethereum', direction: 'sell', volume: 5_210.35, transactions: 88 },
        { name: 'SOL', blockchain: 'Solana', direction: 'swap', volume: 4_120.0, transactions: 52 },
        { name: 'BNB', blockchain: 'BinanceSmartChain', direction: 'buy', volume: 3_890.2, transactions: 48 },
      ],
      fiatCurrencies: [
        { name: 'CHF', volume: 142_000.0, transactions: 1_120 },
        { name: 'EUR', volume: 78_500.5, transactions: 780 },
        { name: 'USD', volume: 25_300.85, transactions: 350 },
      ],
      blockchains: [
        { name: 'Bitcoin', volume: 111_220.9, transactions: 765 },
        { name: 'Ethereum', volume: 87_520.65, transactions: 778 },
        { name: 'Monero', volume: 18_450.6, transactions: 190 },
        { name: 'Litecoin', volume: 8_920.0, transactions: 95 },
        { name: 'Solana', volume: 4_120.0, transactions: 52 },
        { name: 'BinanceSmartChain', volume: 3_890.2, transactions: 48 },
      ],
      paymentMethods: [
        { name: 'Bank', volume: 156_400.0, transactions: 1_380 },
        { name: 'Card', volume: 52_100.35, transactions: 520 },
        { name: 'OnChain', volume: 37_301.0, transactions: 350 },
      ],
    },
    referral: {
      volume: 42_180.5,
      creditEarned: 1_265.4,
      creditPaid: 980.0,
      creditOpen: 285.4,
      currency: 'EUR',
    },
    completion: {
      paymentInfoRequests: {
        buy: {
          requested: 12_480,
          paymentReceived: 1_920,
          waitingForPayment: 340,
          noPaymentReceived: 10_220,
          receivedRate: 0.1538,
        },
        sell: {
          requested: 2_140,
          paymentReceived: 380,
          waitingForPayment: 45,
          noPaymentReceived: 1_715,
          receivedRate: 0.1776,
        },
        swap: {
          // suppressed direction (null counters) for acceptance of Stage A null UI
          requested: null,
          paymentReceived: null,
          waitingForPayment: null,
          noPaymentReceived: null,
          receivedRate: null,
        },
      },
      settlement: {
        buy: {
          received: 1_920,
          delivered: 1_780,
          rejected: 42,
          inProgress: 98,
          deliveredRate: 0.9271,
        },
        sell: {
          received: 380,
          delivered: 350,
          rejected: 8,
          inProgress: 22,
          deliveredRate: 0.9211,
        },
        swap: {
          received: 110,
          delivered: 102,
          rejected: 2,
          inProgress: 6,
          deliveredRate: 0.9273,
        },
      },
    },
    meta: {
      suppressionThreshold: SUPPRESSION_THRESHOLD,
      suppressedCount: 3,
      generatedAt: '2026-07-01T08:00:00.000Z',
    },
  };
}

function dayBucket(
  dayOffset: number,
  volume: { buy: number; sell: number; swap: number } | null,
  transactions: { buy: number; sell: number; swap: number } | null,
  opts: { suppressed?: boolean; partial?: boolean } = {},
): PartnerTimelineBucket {
  return {
    date: isoDaysAgo(29 - dayOffset, new Date(PERIOD_TO)),
    volume,
    transactions,
    suppressed: opts.suppressed === true,
    partial: opts.partial === true,
  };
}

/**
 * 30 daily buckets.
 * Days 0 and 29 are partial (period edges) — visibly marked in charts.
 * Day 12 is suppressed (null, not zero). Day 5 is a true zero-activity day.
 */
export function buildPartnerTimelineFixture(granularity: PartnerGranularity = 'day'): PartnerTimeline {
  const pattern: Array<{ buy: number; sell: number; swap: number }> = [
    { buy: 6200, sell: 710, swap: 240 },
    { buy: 7100, sell: 820, swap: 310 },
    { buy: 5800, sell: 640, swap: 180 },
    { buy: 8400, sell: 910, swap: 420 },
    { buy: 0, sell: 0, swap: 0 }, // real zero day
    { buy: 9200, sell: 1050, swap: 380 },
    { buy: 7800, sell: 880, swap: 290 },
    { buy: 6500, sell: 720, swap: 210 },
    { buy: 10100, sell: 1120, swap: 450 },
    { buy: 8700, sell: 940, swap: 330 },
    { buy: 7300, sell: 800, swap: 270 },
    { buy: 9600, sell: 1080, swap: 400 },
  ];

  const buckets: PartnerTimelineBucket[] = [];
  for (let i = 0; i < 30; i++) {
    if (i === 12) {
      // suppressed bucket: null, not 0
      buckets.push(dayBucket(i, null, null, { suppressed: true }));
      continue;
    }
    const base = pattern[i % pattern.length];
    const scale = 0.85 + (i % 5) * 0.05;
    const volume = {
      buy: Math.round(base.buy * scale * 100) / 100,
      sell: Math.round(base.sell * scale * 100) / 100,
      swap: Math.round(base.swap * scale * 100) / 100,
    };
    const transactions = {
      buy: Math.round((base.buy / 110) * scale),
      sell: Math.round((base.sell / 70) * scale),
      swap: Math.round((base.swap / 90) * scale),
    };
    buckets.push(
      dayBucket(i, volume, transactions, {
        // Both period edges are partial so the mark is visible at start and end of the chart
        partial: i === 0 || i === 29,
      }),
    );
  }

  // For week/month fixtures, thin the series to coarser buckets for local demo
  let resultBuckets = buckets;
  if (granularity === 'week') {
    resultBuckets = buckets.filter((_, idx) => idx % 7 === 0).map((b, idx, arr) => ({
      ...b,
      partial: idx === 0 || idx === arr.length - 1,
    }));
  } else if (granularity === 'month') {
    resultBuckets = [
      { ...buckets[0], partial: true },
      { ...buckets[15], partial: false },
      { ...buckets[29], partial: true },
    ];
  }

  return {
    period: { from: PERIOD_FROM, to: PERIOD_TO },
    currency: 'CHF',
    granularity,
    buckets: resultBuckets,
    meta: {
      suppressionThreshold: SUPPRESSION_THRESHOLD,
      suppressedCount: resultBuckets.filter((b) => b.suppressed).length,
      generatedAt: '2026-07-01T08:00:00.000Z',
    },
  };
}
