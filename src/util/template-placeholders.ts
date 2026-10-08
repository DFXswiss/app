import { TransactionInfo, UserDataDetail } from 'src/hooks/compliance.hook';
import { SupportIssueInternalData } from 'src/hooks/support-dashboard.hook';
import { appOrigin } from 'src/util/app-origin';

export type TokenSource = 'userData' | 'transaction' | 'issue';

export interface TokenContext {
  userData?: UserDataDetail;
  transactions?: TransactionInfo[];
  issue?: SupportIssueInternalData;
}

export interface TokenSelections {
  transactionId?: number;
}

export type Selector = 'last' | 'first' | 'issue';

export interface TokenDef {
  key: string; // Base key without selector, e.g. 'transaction.id'
  label: string;
  source: TokenSource;
  isArraySource: boolean;
  resolve: (ctx: TokenContext, sel: TokenSelections, selector?: Selector) => string | undefined;
}

export interface DetectedToken {
  fullKey: string; // 'transaction:last.id'
  baseKey: string; // 'transaction.id'
  selector?: Selector;
  source: TokenSource;
  label: string;
  isArraySource: boolean;
  resolve: (ctx: TokenContext, sel: TokenSelections) => string | undefined;
}

export interface ComposerToken {
  key: string; // What gets inserted, e.g. 'transaction:last.id'
  label: string;
  source: TokenSource;
  isArraySource: boolean;
  selector?: Selector;
}

const VALID_SELECTORS: Selector[] = ['last', 'first', 'issue'];

const SELECTOR_LABELS: Record<Selector, string> = {
  last: 'letzte',
  first: 'erste',
  issue: 'aus Issue',
};

function joinName(first?: string, surname?: string): string | undefined {
  const name = [first, surname].filter(Boolean).join(' ').trim();
  return name || undefined;
}

// Cache last/first per transactions-array reference to avoid resorting on every resolve.
// WeakMap allows GC when the array goes out of scope (e.g. on context change).
const sortedTxCache = new WeakMap<TransactionInfo[], { last: TransactionInfo; first: TransactionInfo }>();

function getLastAndFirst(txs: TransactionInfo[]): { last: TransactionInfo; first: TransactionInfo } {
  const cached = sortedTxCache.get(txs);
  if (cached) return cached;
  const sorted = [...txs].sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
  const value = { last: sorted[0], first: sorted[sorted.length - 1] };
  sortedTxCache.set(txs, value);
  return value;
}

function findSelectedTransaction(
  ctx: TokenContext,
  sel: TokenSelections,
  selector?: Selector,
): TransactionInfo | undefined {
  const txs = ctx.transactions;
  if (!txs || txs.length === 0) return undefined;
  if (selector === 'last') return getLastAndFirst(txs).last;
  if (selector === 'first') return getLastAndFirst(txs).first;
  if (selector === 'issue') {
    const issueTxId = ctx.issue?.transaction?.id;
    return issueTxId != null ? txs.find((t) => t.id === issueTxId) : undefined;
  }
  if (sel.transactionId != null) return txs.find((t) => t.id === sel.transactionId);
  if (txs.length === 1) return txs[0];
  return undefined;
}

export const TOKEN_REGISTRY: TokenDef[] = [
  // UserData
  {
    key: 'userData.id',
    label: 'User Data ID',
    source: 'userData',
    isArraySource: false,
    resolve: (ctx) => (ctx.userData?.id != null ? String(ctx.userData.id) : undefined),
  },
  {
    key: 'userData.mail',
    label: 'Email',
    source: 'userData',
    isArraySource: false,
    resolve: (ctx) => ctx.userData?.mail,
  },
  {
    key: 'userData.firstname',
    label: 'Firstname',
    source: 'userData',
    isArraySource: false,
    resolve: (ctx) => ctx.userData?.firstname,
  },
  {
    key: 'userData.surname',
    label: 'Surname',
    source: 'userData',
    isArraySource: false,
    resolve: (ctx) => ctx.userData?.surname,
  },
  {
    key: 'userData.name',
    label: 'Full name',
    source: 'userData',
    isArraySource: false,
    resolve: (ctx) => joinName(ctx.userData?.firstname, ctx.userData?.surname),
  },
  {
    key: 'userData.verifiedName',
    label: 'Verified name',
    source: 'userData',
    isArraySource: false,
    resolve: (ctx) => ctx.userData?.verifiedName,
  },
  {
    key: 'userData.language',
    label: 'Language',
    source: 'userData',
    isArraySource: false,
    resolve: (ctx) => ctx.userData?.language?.name,
  },
  {
    key: 'userData.country',
    label: 'Country',
    source: 'userData',
    isArraySource: false,
    resolve: (ctx) => ctx.userData?.country?.name,
  },
  {
    key: 'userData.kycLevel',
    label: 'KYC level',
    source: 'userData',
    isArraySource: false,
    resolve: (ctx) => (ctx.userData?.kycLevel != null ? String(ctx.userData.kycLevel) : undefined),
  },
  {
    key: 'userData.phone',
    label: 'Phone',
    source: 'userData',
    isArraySource: false,
    resolve: (ctx) => ctx.userData?.phone,
  },

  // Transaction (Array source — optional selector via :last / :first / :issue)
  {
    key: 'transaction.id',
    label: 'Transaction ID',
    source: 'transaction',
    isArraySource: true,
    resolve: (ctx, sel, selector) => {
      const tx = findSelectedTransaction(ctx, sel, selector);
      return tx ? String(tx.id) : undefined;
    },
  },
  {
    key: 'transaction.uid',
    label: 'Transaction UID',
    source: 'transaction',
    isArraySource: true,
    resolve: (ctx, sel, selector) => findSelectedTransaction(ctx, sel, selector)?.uid,
  },
  {
    key: 'transaction.url',
    label: 'Transaction URL',
    source: 'transaction',
    isArraySource: true,
    resolve: (ctx, sel, selector) => {
      const tx = findSelectedTransaction(ctx, sel, selector);
      if (!tx) return undefined;
      return `${appOrigin()}/tx/${tx.id}`;
    },
  },
  {
    key: 'transaction.amountInChf',
    label: 'Amount (CHF)',
    source: 'transaction',
    isArraySource: true,
    resolve: (ctx, sel, selector) => {
      const tx = findSelectedTransaction(ctx, sel, selector);
      return tx?.amountInChf != null ? tx.amountInChf.toFixed(2) : undefined;
    },
  },
  {
    key: 'transaction.inputAmount',
    label: 'Input amount',
    source: 'transaction',
    isArraySource: true,
    resolve: (ctx, sel, selector) => {
      const tx = findSelectedTransaction(ctx, sel, selector);
      return tx?.inputAmount != null ? String(tx.inputAmount) : undefined;
    },
  },
  {
    key: 'transaction.inputAsset',
    label: 'Input asset',
    source: 'transaction',
    isArraySource: true,
    resolve: (ctx, sel, selector) => findSelectedTransaction(ctx, sel, selector)?.inputAsset,
  },
  {
    key: 'transaction.outputAmount',
    label: 'Output amount',
    source: 'transaction',
    isArraySource: true,
    resolve: (ctx, sel, selector) => {
      const tx = findSelectedTransaction(ctx, sel, selector);
      return tx?.outputAmount != null ? String(tx.outputAmount) : undefined;
    },
  },
  {
    key: 'transaction.outputAsset',
    label: 'Output asset',
    source: 'transaction',
    isArraySource: true,
    resolve: (ctx, sel, selector) => findSelectedTransaction(ctx, sel, selector)?.outputAsset,
  },

  // Issue
  {
    key: 'issue.uid',
    label: 'Issue UID',
    source: 'issue',
    isArraySource: false,
    resolve: (ctx) => ctx.issue?.uid,
  },
  {
    key: 'issue.type',
    label: 'Issue type',
    source: 'issue',
    isArraySource: false,
    resolve: (ctx) => ctx.issue?.type,
  },
  {
    key: 'issue.reason',
    label: 'Issue reason',
    source: 'issue',
    isArraySource: false,
    resolve: (ctx) => ctx.issue?.reason,
  },
];

const TOKEN_BY_KEY = new Map(TOKEN_REGISTRY.map((t) => [t.key, t]));
const PLACEHOLDER_REGEX = /\$([a-zA-Z]+)(?::([a-zA-Z]+))?\.([a-zA-Z]+)/g;

function isValidSelector(s: string | undefined): s is Selector {
  return s != null && (VALID_SELECTORS as string[]).includes(s);
}

export interface ComposerSection {
  label?: string; // Sub-heading shown above the chip row, e.g. "Auswahl beim Einfügen"
  tokens: ComposerToken[];
}

function buildComposerSections(): Record<TokenSource, ComposerSection[]> {
  const transactionBases = TOKEN_REGISTRY.filter((t) => t.source === 'transaction' && t.isArraySource);

  const transactionAuswahl: ComposerToken[] = transactionBases.map((token) => ({
    key: token.key,
    label: token.label,
    source: token.source,
    isArraySource: true,
  }));

  const transactionBySelector = (selector: Selector): ComposerToken[] =>
    transactionBases.map((token) => {
      const [src, field] = token.key.split('.');
      return {
        key: `${src}:${selector}.${field}`,
        label: `${token.label} (${SELECTOR_LABELS[selector]})`,
        source: token.source,
        isArraySource: false,
        selector,
      };
    });

  const userData: ComposerToken[] = TOKEN_REGISTRY.filter((t) => t.source === 'userData').map((token) => ({
    key: token.key,
    label: token.label,
    source: token.source,
    isArraySource: false,
  }));

  const issue: ComposerToken[] = TOKEN_REGISTRY.filter((t) => t.source === 'issue').map((token) => ({
    key: token.key,
    label: token.label,
    source: token.source,
    isArraySource: false,
  }));

  return {
    userData: [{ tokens: userData }],
    transaction: [
      { label: 'Auswahl beim Einfügen', tokens: transactionAuswahl },
      { label: 'Letzte Transaktion (:last)', tokens: transactionBySelector('last') },
      { label: 'Erste Transaktion (:first)', tokens: transactionBySelector('first') },
      { label: 'Aus diesem Issue (:issue)', tokens: transactionBySelector('issue') },
    ],
    issue: [{ tokens: issue }],
  };
}

// Sections are static (derived purely from TOKEN_REGISTRY); compute once at module load.
export const COMPOSER_SECTIONS: Record<TokenSource, ComposerSection[]> = buildComposerSections();

export function detectPlaceholders(content: string): DetectedToken[] {
  const seen = new Set<string>();
  const found: DetectedToken[] = [];
  for (const match of content.matchAll(PLACEHOLDER_REGEX)) {
    const [, source, selectorRaw, field] = match;
    const baseKey = `${source}.${field}`;
    const token = TOKEN_BY_KEY.get(baseKey);
    if (!token) continue;
    let selector: Selector | undefined;
    if (selectorRaw) {
      if (!isValidSelector(selectorRaw)) continue;
      // selector only meaningful for array-source tokens
      if (!token.isArraySource) continue;
      selector = selectorRaw;
    }
    const fullKey = selector ? `${source}:${selector}.${field}` : baseKey;
    if (seen.has(fullKey)) continue;
    seen.add(fullKey);
    found.push({
      fullKey,
      baseKey,
      selector,
      source: token.source,
      label: token.label,
      isArraySource: token.isArraySource && !selector,
      resolve: (ctx, sel) => token.resolve(ctx, sel, selector),
    });
  }
  return found;
}

export function requiresArraySelection(content: string, ctx: TokenContext): boolean {
  const detected = detectPlaceholders(content);
  const transactions = ctx.transactions ?? [];
  return detected.some((dt) => dt.source === 'transaction' && !dt.selector) && transactions.length > 1;
}

export function resolvePlaceholders(content: string, ctx: TokenContext, sel: TokenSelections = {}): string {
  return content.replace(PLACEHOLDER_REGEX, (full, source: string, selectorRaw: string | undefined, field: string) => {
    const baseKey = `${source}.${field}`;
    const token = TOKEN_BY_KEY.get(baseKey);
    if (!token) return full;
    let selector: Selector | undefined;
    if (selectorRaw) {
      if (!isValidSelector(selectorRaw)) return full;
      if (!token.isArraySource) return full;
      selector = selectorRaw;
    }
    const value = token.resolve(ctx, sel, selector);
    return value ?? full;
  });
}

export function getNonArrayMissingPlaceholders(content: string, ctx: TokenContext): DetectedToken[] {
  return detectPlaceholders(content).filter((dt) => !dt.isArraySource && dt.resolve(ctx, {}) == null);
}
