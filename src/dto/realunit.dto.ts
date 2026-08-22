import { Timeframe } from 'src/util/chart';

export interface HistoricalBalance {
  balance: string;
  timestamp: string;
  valueChf?: number;
}

export interface AccountSummary {
  address: string;
  addressType: number;
  balance: string;
  lastUpdated: string;
  historicalBalances?: HistoricalBalance[];
}

export interface HistoryEvent {
  timestamp: string;
  eventType: string;
  txHash: string;
  addressTypeUpdate?: {
    addressType: string;
  };
  approval?: {
    spender: string;
    value: string;
  };
  tokensDeclaredInvalid?: {
    amount: string;
    message: string;
  };
  transfer?: {
    from: string;
    to: string;
    value: string;
  };
}

export interface AccountHistory {
  address: string;
  addressType: number;
  history: HistoryEvent[];
  totalCount: number;
  pageInfo: PageInfo;
}

export interface Holder {
  address: string;
  balance: string;
  percentage: number;
}

export interface TokenInfo {
  totalShares: {
    total: string;
    timestamp: string;
    txHash: string;
  };
  totalSupply: {
    value: string;
    timestamp: string;
  };
}

export interface TokenPrice {
  timestamp: string;
  chf: number;
  eur: number;
  usd: number;
}

export interface PageInfo {
  endCursor: string;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string;
}

export interface HoldersResponse {
  holders: Holder[];
  pageInfo: PageInfo;
  totalCount: number;
}

export interface PriceHistoryEntry {
  timestamp: string;
  chf: number;
  eur: number;
  usd: number;
}

export enum PaginationDirection {
  NEXT = 'next',
  PREV = 'prev',
}

export interface RealUnitQuote {
  id: number;
  uid: string;
  type: string;
  status: string;
  amount: number;
  estimatedAmount: number;
  created: string;
  userAddress?: string;
  userId?: number;
  userName?: string;
  deactivatedAt?: string;
}

export function quoteIsDeactivated(quote: Pick<RealUnitQuote, 'deactivatedAt'>): boolean {
  return quote.deactivatedAt != null && quote.deactivatedAt !== '';
}

export interface RealUnitTransaction {
  id: number;
  uid: string;
  type: string;
  amountInChf: number;
  assets: string;
  created: string;
  outputDate?: string;
  userAddress?: string;
}

export interface RealUnitBuyVolumePoint {
  timestamp: string;
  chf: number;
  shares: number;
  priceChf: number;
}

export interface RealUnitRegistrationSnapshot {
  completed: number;
  manualReview: number;
  confirmed: number;
  usersActive: number;
  usersNa: number;
  usersBlocked: number;
  usersDeleted: number;
}

export interface RealUnitRegistrationSeriesPoint {
  timestamp: string;
  registered: number;
  confirmed: number;
}

export interface RealUnitRegistrationStats {
  snapshot: RealUnitRegistrationSnapshot;
  series: RealUnitRegistrationSeriesPoint[];
}

export interface RealUnitHolderCountPoint {
  timestamp: string;
  holders: number;
}

export interface RealunitContextInterface {
  accountSummary?: AccountSummary;
  history?: AccountHistory;
  isLoading: boolean;
  holders: Holder[];
  totalCount?: number;
  pageInfo: PageInfo;
  tokenInfo?: TokenInfo;
  tokenPrice?: TokenPrice;
  priceHistory: PriceHistoryEntry[];
  timeframe: Timeframe;
  quotes: RealUnitQuote[];
  transactions: RealUnitTransaction[];
  quotesLoading: boolean;
  transactionsLoading: boolean;
  quotesError: boolean;
  transactionsError: boolean;
  priceHistoryError: boolean;
  buyVolume: RealUnitBuyVolumePoint[];
  buyVolumeLoading: boolean;
  buyVolumeError: boolean;
  holderCount: RealUnitHolderCountPoint[];
  holderCountLoading: boolean;
  holderCountError: boolean;
  registrationStats?: RealUnitRegistrationStats;
  registrationLoading: boolean;
  registrationError: boolean;
  buyVolumeTimeframe: Timeframe;
  holderCountTimeframe: Timeframe;
  registrationTimeframe: Timeframe;
  fetchAccountSummary: (address: string) => void;
  fetchAccountHistory: (address: string, cursor?: string, direction?: PaginationDirection) => void;
  fetchHolders: (cursor?: string, direction?: PaginationDirection) => void;
  fetchTokenInfo: () => void;
  fetchPriceHistory: (timeframe?: Timeframe) => void;
  fetchTokenPrice: () => void;
  fetchQuotes: () => void;
  resetQuotes: () => void;
  fetchTransactions: () => void;
  confirmPayment: (id: number) => Promise<void>;
  deactivateQuote: (id: number) => Promise<void>;
  fetchBuyVolume: (timeframe?: Timeframe) => void;
  fetchHolderCount: (timeframe?: Timeframe) => void;
  fetchRegistrationStats: (timeframe?: Timeframe) => void;
}
