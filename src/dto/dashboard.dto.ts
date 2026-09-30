/** Chart mode: GET /dashboard/financial/log?byType=false — only these three fields are present. */
export interface FinancialLogChartEntry {
  timestamp: string;
  totalBalanceChf: number;
  btcPriceChf: number;
}

/** Full mode: GET /dashboard/financial/log with byType omitted or true — extends the chart fields. */
export interface FinancialLogEntry extends FinancialLogChartEntry {
  plusBalanceChf: number;
  minusBalanceChf: number;
  balancesByType?: Record<string, { plusBalanceChf: number; minusBalanceChf: number }>;
}

export type FinancialLogEntryWithBalancesByType = FinancialLogEntry & {
  balancesByType: NonNullable<FinancialLogEntry['balancesByType']>;
};

export interface FinancialLogResponse {
  entries: FinancialLogEntry[];
}

export interface FinancialLogChartResponse {
  entries: FinancialLogChartEntry[];
}

export interface FinancialChangesEntry {
  timestamp: string;
  total: number;
  plus: {
    total: number;
    buyCrypto: number;
    buyFiat: number;
    paymentLink: number;
    trading: number;
  };
  minus: {
    total: number;
    bank: number;
    kraken: { total: number; withdraw: number; trading: number };
    ref: { total: number; amount: number; fee: number };
    binance: { total: number; withdraw: number; trading: number };
    blockchain: { total: number; txIn: number; txOut: number; trading: number };
  };
}

export interface FinancialChangesResponse {
  entries: FinancialChangesEntry[];
}

export interface BalanceByGroup {
  name: string;
  plusBalanceChf: number;
  minusBalanceChf: number;
  netBalanceChf: number;
  assets?: Record<string, number>;
}

export interface RefRewardRecipient {
  userDataId: number;
  count: number;
  totalChf: number;
}

export interface LatestBalanceResponse {
  timestamp: string;
  byType: BalanceByGroup[];
  byBlockchain: BalanceByGroup[];
}

export interface KundengelderLine {
  key: string;
  label: string;
  currency: string;
  amount: number;
  amountChf: number;
  count: number;
}

export interface KundengelderAccount {
  key: string; // IBAN or CheckoutLtdCHF | CheckoutLtdEUR | CryptoCrypto
  name: string;
  iban?: string;
  currency: string;
  lines: KundengelderLine[];
}

export interface KundengelderDiff {
  key: string; // e.g. `${iban}|BuyCrypto after Fee` or with `|CHF`/`|EUR` suffix for Revolut
  live: number;
  booked: number;
  delta: number;
}

export interface KundengelderExtract {
  year: number;
  eurRate: number;
  accounts: KundengelderAccount[];
  diffs: KundengelderDiff[];
}

export interface KundengelderTx {
  id: number;
  bookingDate?: string; // JSON date
  type: string;
  currency?: string;
  amount?: number;
  afterFee?: number;
  instructionId?: string;
  accountServiceRef?: string;
}

export interface KundengelderTxList {
  year: number;
  accountKey: string;
  line: string;
  rows: KundengelderTx[];
}
