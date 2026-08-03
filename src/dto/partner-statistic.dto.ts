/** Partner statistic API contracts (GET /v1/statistic/partner and /timeline). */

/**
 * API enum values — single source of truth.
 * Matches backend PartnerStatisticGranularity / direction enums (PascalCase).
 * JSON field names on volume/transactions maps stay lowercase (see PartnerDirectionField).
 */
export const PARTNER_GRANULARITIES = ['Day', 'Week', 'Month'] as const;
export type PartnerGranularity = (typeof PARTNER_GRANULARITIES)[number];

export const PARTNER_DIRECTIONS = ['Buy', 'Sell', 'Swap'] as const;
export type PartnerDirection = (typeof PARTNER_DIRECTIONS)[number];

/** Lowercase keys of volume.buy / SERIES_LABELS — not API enum values. */
export const PARTNER_DIRECTION_FIELDS = ['buy', 'sell', 'swap'] as const;
export type PartnerDirectionField = (typeof PARTNER_DIRECTION_FIELDS)[number];

export interface PartnerStatisticPeriod {
  from: string;
  to: string;
}

export interface PartnerStatisticMeta {
  generatedAt?: string;
}

export interface PartnerVolumeByType {
  buy: number;
  sell: number;
  swap: number;
  total: number;
}

export interface PartnerVolumeBuySell {
  buy: number;
  sell: number;
  total: number;
}

export interface PartnerTransactionsByType {
  buy: number;
  sell: number;
  swap: number;
  total: number;
}

export interface PartnerTotals {
  volume: PartnerVolumeByType;
  transactions: PartnerTransactionsByType;
  averageTransactionVolume: number | null;
  activeUsers: number;
  newUsers: number;
}

export interface PartnerAllTime {
  volume: PartnerVolumeBuySell;
  registeredUsers: number;
  tradingUsers: number;
}

export interface PartnerAssetBreakdown {
  name: string;
  blockchain: string | null;
  direction: PartnerDirection;
  /** CHF */
  volume: number;
  transactions: number;
}

export interface PartnerNamedBreakdown {
  name: string;
  volume: number;
  transactions: number;
}

export interface PartnerBreakdown {
  assets: PartnerAssetBreakdown[];
  fiatCurrencies: PartnerNamedBreakdown[];
  blockchains: PartnerNamedBreakdown[];
  paymentMethods: PartnerNamedBreakdown[];
}

export interface PartnerReferral {
  volume: number;
  creditEarned: number;
  creditPaid: number;
  creditOpen: number;
  currency: 'EUR';
}

export interface PartnerStatistic {
  period: PartnerStatisticPeriod;
  currency: 'CHF';
  totals: PartnerTotals;
  allTime: PartnerAllTime;
  breakdown: PartnerBreakdown;
  referral: PartnerReferral;
  meta: PartnerStatisticMeta;
}

export interface PartnerTimelineVolume {
  buy: number;
  sell: number;
  swap: number;
}

export interface PartnerTimelineBucket {
  date: string;
  volume: PartnerTimelineVolume;
  transactions: PartnerTimelineVolume;
  partial: boolean;
}

export interface PartnerTimeline {
  period: PartnerStatisticPeriod;
  currency: 'CHF';
  granularity: PartnerGranularity;
  buckets: PartnerTimelineBucket[];
  meta: PartnerStatisticMeta;
}
