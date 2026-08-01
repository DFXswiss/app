/** Partner statistic API contracts (GET /v1/statistic/partner and /timeline). */

/**
 * API enum values — single source of truth.
 * Matches backend PartnerStatisticGranularity / direction enums (PascalCase).
 * JSON field names on volume/transactions/completion maps stay lowercase (see PartnerDirectionField).
 */
export const PARTNER_GRANULARITIES = ['Day', 'Week', 'Month'] as const;
export type PartnerGranularity = (typeof PARTNER_GRANULARITIES)[number];

export const PARTNER_DIRECTIONS = ['Buy', 'Sell', 'Swap'] as const;
export type PartnerDirection = (typeof PARTNER_DIRECTIONS)[number];

/** Lowercase keys of volume.buy / completion.buy / SERIES_LABELS — not API enum values. */
export const PARTNER_DIRECTION_FIELDS = ['buy', 'sell', 'swap'] as const;
export type PartnerDirectionField = (typeof PARTNER_DIRECTION_FIELDS)[number];

export interface PartnerStatisticPeriod {
  from: string;
  to: string;
}

export interface PartnerStatisticMeta {
  suppressionThreshold: number;
  suppressedCount: number;
  generatedAt?: string;
}

export interface PartnerVolumeByType {
  buy: number | null;
  sell: number | null;
  swap: number | null;
  total: number | null;
}

export interface PartnerVolumeBuySell {
  buy: number | null;
  sell: number | null;
  total: number | null;
}

export interface PartnerTransactionsByType {
  buy: number | null;
  sell: number | null;
  swap: number | null;
  total: number | null;
}

export interface PartnerTotals {
  volume: PartnerVolumeByType;
  transactions: PartnerTransactionsByType;
  averageTransactionVolume: number | null;
  activeUsers: number | null;
  newUsers: number | null;
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
  /** CHF; null when suppressed under k (fixture may include null for UI acceptance). */
  volume: number | null;
  transactions: number | null;
}

export interface PartnerNamedBreakdown {
  name: string;
  volume: number | null;
  transactions: number | null;
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

export interface PartnerPaymentInfoDirection {
  requested: number | null;
  paymentReceived: number | null;
  waitingForPayment: number | null;
  noPaymentReceived: number | null;
  receivedRate: number | null;
}

export interface PartnerPaymentInfoRequests {
  buy: PartnerPaymentInfoDirection;
  sell: PartnerPaymentInfoDirection;
  swap: PartnerPaymentInfoDirection;
}

export interface PartnerSettlementDirection {
  received: number | null;
  delivered: number | null;
  rejected: number | null;
  inProgress: number | null;
  deliveredRate: number | null;
}

export interface PartnerSettlement {
  buy: PartnerSettlementDirection;
  sell: PartnerSettlementDirection;
  swap: PartnerSettlementDirection;
}

export interface PartnerCompletion {
  paymentInfoRequests: PartnerPaymentInfoRequests;
  settlement: PartnerSettlement;
}

export interface PartnerStatistic {
  period: PartnerStatisticPeriod;
  currency: 'CHF';
  totals: PartnerTotals;
  allTime: PartnerAllTime;
  breakdown: PartnerBreakdown;
  referral: PartnerReferral;
  completion: PartnerCompletion;
  meta: PartnerStatisticMeta;
}

export interface PartnerTimelineVolume {
  buy: number;
  sell: number;
  swap: number;
}

export interface PartnerTimelineBucket {
  date: string;
  volume: PartnerTimelineVolume | null;
  transactions: PartnerTimelineVolume | null;
  suppressed: boolean;
  partial: boolean;
}

export interface PartnerTimeline {
  period: PartnerStatisticPeriod;
  currency: 'CHF';
  granularity: PartnerGranularity;
  buckets: PartnerTimelineBucket[];
  meta: PartnerStatisticMeta;
}
