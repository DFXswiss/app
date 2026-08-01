/** Partner statistic API contracts (GET /v1/statistic/partner and /timeline). */

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
  direction: 'buy' | 'sell' | 'swap';
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

export type PartnerGranularity = 'day' | 'week' | 'month';

export interface PartnerTimeline {
  period: PartnerStatisticPeriod;
  currency: 'CHF';
  granularity: PartnerGranularity;
  buckets: PartnerTimelineBucket[];
  meta: PartnerStatisticMeta;
}

export type PartnerDirection = 'buy' | 'sell' | 'swap';
