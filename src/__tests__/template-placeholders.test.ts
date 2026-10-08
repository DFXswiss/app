import { TransactionInfo, UserDataDetail } from 'src/hooks/compliance.hook';
import { SupportIssueInternalData } from 'src/hooks/support-dashboard.hook';
import {
  COMPOSER_SECTIONS,
  detectPlaceholders,
  getNonArrayMissingPlaceholders,
  requiresArraySelection,
  resolvePlaceholders,
  TOKEN_REGISTRY,
  TokenContext,
} from 'src/util/template-placeholders';

function tx(partial: Partial<TransactionInfo> & Pick<TransactionInfo, 'id' | 'uid' | 'created'>): TransactionInfo {
  return {
    sourceType: 'Buy',
    isCompleted: true,
    ...partial,
  } as unknown as TransactionInfo;
}

function userData(partial: Partial<UserDataDetail> = {}): UserDataDetail {
  return { id: 1, ...partial } as unknown as UserDataDetail;
}

function issue(partial: Partial<SupportIssueInternalData> = {}): SupportIssueInternalData {
  return {
    id: 10,
    created: '2024-01-01T00:00:00.000Z',
    uid: 'I-1',
    type: 'TransactionIssue',
    reason: 'Missing',
    state: 'Open',
    name: 'Issue',
    account: {} as SupportIssueInternalData['account'],
    ...partial,
  } as unknown as SupportIssueInternalData;
}

describe('template-placeholders', () => {
  const originalEnv = process.env.REACT_APP_PUBLIC_URL;
  const originalLocation = window.location;

  beforeEach(() => {
    delete process.env.REACT_APP_PUBLIC_URL;
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { origin: 'https://embedding.example.org' },
    });
  });

  afterAll(() => {
    if (originalEnv === undefined) {
      delete process.env.REACT_APP_PUBLIC_URL;
    } else {
      process.env.REACT_APP_PUBLIC_URL = originalEnv;
    }
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  describe('TOKEN_REGISTRY', () => {
    const fullCtx: TokenContext = {
      userData: userData({
        id: 42,
        mail: 'ada@example.com',
        firstname: 'Ada',
        surname: 'Lovelace',
        verifiedName: 'Ada Lovelace',
        language: { name: 'English' } as UserDataDetail['language'],
        country: { name: 'Switzerland' } as UserDataDetail['country'],
        kycLevel: 50,
        phone: '+41000000000',
      }),
      transactions: [
        tx({
          id: 7,
          uid: 'T-7',
          created: '2024-06-01T00:00:00.000Z',
          amountInChf: 12.5,
          inputAmount: 100,
          inputAsset: 'CHF',
          outputAmount: 0.001,
          outputAsset: 'BTC',
        }),
      ],
      issue: issue({ uid: 'ISSUE-1', type: 'Limit', reason: 'TooLow' }),
    };

    it('resolves concrete values when the source is present', () => {
      const byKey = Object.fromEntries(TOKEN_REGISTRY.map((t) => [t.key, t]));
      const sel = {};

      expect(byKey['userData.id'].resolve(fullCtx, sel)).toBe('42');
      expect(byKey['userData.mail'].resolve(fullCtx, sel)).toBe('ada@example.com');
      expect(byKey['userData.firstname'].resolve(fullCtx, sel)).toBe('Ada');
      expect(byKey['userData.surname'].resolve(fullCtx, sel)).toBe('Lovelace');
      expect(byKey['userData.name'].resolve(fullCtx, sel)).toBe('Ada Lovelace');
      expect(byKey['userData.verifiedName'].resolve(fullCtx, sel)).toBe('Ada Lovelace');
      expect(byKey['userData.language'].resolve(fullCtx, sel)).toBe('English');
      expect(byKey['userData.country'].resolve(fullCtx, sel)).toBe('Switzerland');
      expect(byKey['userData.kycLevel'].resolve(fullCtx, sel)).toBe('50');
      expect(byKey['userData.phone'].resolve(fullCtx, sel)).toBe('+41000000000');

      expect(byKey['transaction.id'].resolve(fullCtx, sel)).toBe('7');
      expect(byKey['transaction.uid'].resolve(fullCtx, sel)).toBe('T-7');
      expect(byKey['transaction.amountInChf'].resolve(fullCtx, sel)).toBe('12.50');
      expect(byKey['transaction.inputAmount'].resolve(fullCtx, sel)).toBe('100');
      expect(byKey['transaction.inputAsset'].resolve(fullCtx, sel)).toBe('CHF');
      expect(byKey['transaction.outputAmount'].resolve(fullCtx, sel)).toBe('0.001');
      expect(byKey['transaction.outputAsset'].resolve(fullCtx, sel)).toBe('BTC');

      expect(byKey['issue.uid'].resolve(fullCtx, sel)).toBe('ISSUE-1');
      expect(byKey['issue.type'].resolve(fullCtx, sel)).toBe('Limit');
      expect(byKey['issue.reason'].resolve(fullCtx, sel)).toBe('TooLow');
    });

    it('returns undefined for every registry entry when the source is missing', () => {
      for (const token of TOKEN_REGISTRY) {
        expect(token.resolve({}, {})).toBeUndefined();
      }
    });

    it('covers both branches of each != null ? String(...) converter', () => {
      const byKey = Object.fromEntries(TOKEN_REGISTRY.map((t) => [t.key, t]));
      const sel = {};

      expect(byKey['userData.id'].resolve({ userData: userData({ id: 0 }) }, sel)).toBe('0');
      expect(byKey['userData.kycLevel'].resolve({ userData: userData({ kycLevel: 0 }) }, sel)).toBe('0');
      expect(byKey['userData.kycLevel'].resolve({ userData: userData({ kycLevel: undefined }) }, sel)).toBeUndefined();

      const zeroTx = tx({
        id: 1,
        uid: 'T-1',
        created: '2024-01-01T00:00:00.000Z',
        amountInChf: 0,
        inputAmount: 0,
        outputAmount: 0,
      });
      expect(byKey['transaction.amountInChf'].resolve({ transactions: [zeroTx] }, sel)).toBe('0.00');
      expect(byKey['transaction.inputAmount'].resolve({ transactions: [zeroTx] }, sel)).toBe('0');
      expect(byKey['transaction.outputAmount'].resolve({ transactions: [zeroTx] }, sel)).toBe('0');

      const nullishTx = tx({ id: 2, uid: 'T-2', created: '2024-01-02T00:00:00.000Z' });
      expect(byKey['transaction.amountInChf'].resolve({ transactions: [nullishTx] }, sel)).toBeUndefined();
      expect(byKey['transaction.inputAmount'].resolve({ transactions: [nullishTx] }, sel)).toBeUndefined();
      expect(byKey['transaction.outputAmount'].resolve({ transactions: [nullishTx] }, sel)).toBeUndefined();
    });

    it('covers joinName with both names, one name, and none', () => {
      const name = TOKEN_REGISTRY.find((t) => t.key === 'userData.name');
      expect(name?.resolve({ userData: userData({ firstname: 'Ada', surname: 'Lovelace' }) }, {})).toBe('Ada Lovelace');
      expect(name?.resolve({ userData: userData({ firstname: 'Ada' }) }, {})).toBe('Ada');
      expect(name?.resolve({ userData: userData({ surname: 'Lovelace' }) }, {})).toBe('Lovelace');
      expect(name?.resolve({ userData: userData({}) }, {})).toBeUndefined();
    });
  });

  describe('transaction.url', () => {
    const urlToken = TOKEN_REGISTRY.find((t) => t.key === 'transaction.url');
    const single = tx({ id: 99, uid: 'T-99', created: '2024-01-01T00:00:00.000Z' });

    it('builds the URL from the env var and strips trailing slashes', () => {
      process.env.REACT_APP_PUBLIC_URL = 'https://app.example.com///';
      expect(urlToken?.resolve({ transactions: [single] }, {})).toBe('https://app.example.com/tx/99');
    });

    it('falls back to window.location.origin when the env var is unset', () => {
      expect(urlToken?.resolve({ transactions: [single] }, {})).toBe('https://embedding.example.org/tx/99');
    });

    it('returns undefined without a transaction', () => {
      expect(urlToken?.resolve({}, {})).toBeUndefined();
      expect(urlToken?.resolve({ transactions: [] }, {})).toBeUndefined();
    });
  });

  describe('findSelectedTransaction via resolvers', () => {
    const idToken = TOKEN_REGISTRY.find((t) => t.key === 'transaction.id');
    const older = tx({ id: 1, uid: 'T-1', created: '2024-01-01T00:00:00.000Z' });
    const newer = tx({ id: 2, uid: 'T-2', created: '2024-06-01T00:00:00.000Z' });
    const txs = [older, newer];

    it('returns undefined for missing or empty transactions', () => {
      expect(idToken?.resolve({}, {})).toBeUndefined();
      expect(idToken?.resolve({ transactions: [] }, {})).toBeUndefined();
    });

    it('selects last and first, and hits the sort cache on a second call', () => {
      expect(idToken?.resolve({ transactions: txs }, {}, 'last')).toBe('2');
      expect(idToken?.resolve({ transactions: txs }, {}, 'first')).toBe('1');
      // Second call with the same array reference exercises the WeakMap cache.
      expect(idToken?.resolve({ transactions: txs }, {}, 'last')).toBe('2');
      expect(idToken?.resolve({ transactions: txs }, {}, 'first')).toBe('1');
    });

    it('selects the issue transaction when present and skips when absent', () => {
      expect(
        idToken?.resolve({ transactions: txs, issue: issue({ transaction: { id: 1 } as never }) }, {}, 'issue'),
      ).toBe('1');
      expect(idToken?.resolve({ transactions: txs, issue: issue() }, {}, 'issue')).toBeUndefined();
      expect(idToken?.resolve({ transactions: txs }, {}, 'issue')).toBeUndefined();
      expect(
        idToken?.resolve({ transactions: txs, issue: issue({ transaction: { id: 999 } as never }) }, {}, 'issue'),
      ).toBeUndefined();
    });

    it('uses an explicit transactionId, a single transaction, or nothing when several are unselected', () => {
      expect(idToken?.resolve({ transactions: txs }, { transactionId: 1 })).toBe('1');
      expect(idToken?.resolve({ transactions: [older] }, {})).toBe('1');
      expect(idToken?.resolve({ transactions: txs }, {})).toBeUndefined();
    });
  });

  describe('COMPOSER_SECTIONS', () => {
    it('exposes userData, transaction and issue sections with selector keys and labels', () => {
      expect(COMPOSER_SECTIONS.userData).toHaveLength(1);
      expect(COMPOSER_SECTIONS.userData[0].tokens.some((t) => t.key === 'userData.mail')).toBe(true);

      expect(COMPOSER_SECTIONS.issue).toHaveLength(1);
      expect(COMPOSER_SECTIONS.issue[0].tokens.some((t) => t.key === 'issue.uid')).toBe(true);

      expect(COMPOSER_SECTIONS.transaction).toHaveLength(4);
      expect(COMPOSER_SECTIONS.transaction[0].label).toBe('Auswahl beim Einfügen');
      expect(COMPOSER_SECTIONS.transaction[0].tokens.some((t) => t.key === 'transaction.id' && t.isArraySource)).toBe(
        true,
      );

      const lastId = COMPOSER_SECTIONS.transaction[1].tokens.find((t) => t.key === 'transaction:last.id');
      expect(lastId).toMatchObject({
        key: 'transaction:last.id',
        label: 'Transaction ID (letzte)',
        isArraySource: false,
        selector: 'last',
      });
      expect(COMPOSER_SECTIONS.transaction[2].label).toBe('Erste Transaktion (:first)');
      expect(COMPOSER_SECTIONS.transaction[3].label).toBe('Aus diesem Issue (:issue)');
      expect(COMPOSER_SECTIONS.transaction[2].tokens.some((t) => t.key === 'transaction:first.uid')).toBe(true);
      expect(COMPOSER_SECTIONS.transaction[3].tokens.some((t) => t.key === 'transaction:issue.url')).toBe(true);
    });
  });

  describe('detectPlaceholders', () => {
    it('skips unknown tokens, invalid selectors and selectors on non-array tokens', () => {
      expect(detectPlaceholders('Hello $unknown.field and $userData:last.mail and $userData:nope.id')).toEqual([]);
    });

    it('collapses duplicates, clears isArraySource when a selector is given, and resolve works', () => {
      const detected = detectPlaceholders(
        'A $transaction:last.id B $transaction:last.id C $transaction.id D $userData.mail',
      );
      expect(detected.map((d) => d.fullKey)).toEqual(['transaction:last.id', 'transaction.id', 'userData.mail']);

      const selected = detected.find((d) => d.fullKey === 'transaction:last.id');
      expect(selected?.isArraySource).toBe(false);
      expect(selected?.selector).toBe('last');

      const unselected = detected.find((d) => d.fullKey === 'transaction.id');
      expect(unselected?.isArraySource).toBe(true);

      const txs = [
        tx({ id: 1, uid: 'T-1', created: '2024-01-01T00:00:00.000Z' }),
        tx({ id: 2, uid: 'T-2', created: '2024-06-01T00:00:00.000Z' }),
      ];
      expect(selected?.resolve({ transactions: txs }, {})).toBe('2');
      expect(
        detected.find((d) => d.fullKey === 'userData.mail')?.resolve({ userData: userData({ mail: 'x' }) }, {}),
      ).toBe('x');
    });
  });

  describe('requiresArraySelection', () => {
    const content = 'See $transaction.id';

    it('is true only for an unselected transaction token with more than one transaction', () => {
      const txs = [
        tx({ id: 1, uid: 'T-1', created: '2024-01-01T00:00:00.000Z' }),
        tx({ id: 2, uid: 'T-2', created: '2024-06-01T00:00:00.000Z' }),
      ];
      expect(requiresArraySelection(content, { transactions: txs })).toBe(true);
    });

    it('is false with a selector, with one transaction, and with transactions undefined', () => {
      const many = [
        tx({ id: 1, uid: 'T-1', created: '2024-01-01T00:00:00.000Z' }),
        tx({ id: 2, uid: 'T-2', created: '2024-06-01T00:00:00.000Z' }),
      ];
      expect(requiresArraySelection('See $transaction:last.id', { transactions: many })).toBe(false);
      expect(
        requiresArraySelection(content, {
          transactions: [tx({ id: 1, uid: 'T-1', created: '2024-01-01T00:00:00.000Z' })],
        }),
      ).toBe(false);
      expect(requiresArraySelection(content, {})).toBe(false);
    });
  });

  describe('resolvePlaceholders', () => {
    it('replaces known tokens and leaves unknown / invalid / unresolvable tokens untouched', () => {
      const ctx: TokenContext = {
        userData: userData({ mail: 'ada@example.com', firstname: 'Ada' }),
        transactions: [tx({ id: 5, uid: 'T-5', created: '2024-01-01T00:00:00.000Z' })],
      };

      expect(resolvePlaceholders('Hi $userData.mail / $userData.firstname', ctx)).toBe('Hi ada@example.com / Ada');
      expect(resolvePlaceholders('Keep $unknown.field', ctx)).toBe('Keep $unknown.field');
      expect(resolvePlaceholders('Keep $userData:last.mail', ctx)).toBe('Keep $userData:last.mail');
      expect(resolvePlaceholders('Keep $userData:nope.mail', ctx)).toBe('Keep $userData:nope.mail');
      expect(resolvePlaceholders('Keep $userData.phone', ctx)).toBe('Keep $userData.phone');
      // default sel argument
      expect(resolvePlaceholders('$transaction.id', ctx)).toBe('5');
    });

    it('uses an explicit selection when provided', () => {
      const txs = [
        tx({ id: 1, uid: 'T-1', created: '2024-01-01T00:00:00.000Z' }),
        tx({ id: 2, uid: 'T-2', created: '2024-06-01T00:00:00.000Z' }),
      ];
      expect(resolvePlaceholders('$transaction.id', { transactions: txs }, { transactionId: 1 })).toBe('1');
      expect(resolvePlaceholders('$transaction:last.uid', { transactions: txs })).toBe('T-2');
    });
  });

  describe('getNonArrayMissingPlaceholders', () => {
    it('returns non-array placeholders that do not resolve', () => {
      const missing = getNonArrayMissingPlaceholders('$userData.mail and $transaction:last.id', {});
      expect(missing.map((d) => d.fullKey).sort()).toEqual(['transaction:last.id', 'userData.mail']);
    });

    it('returns an empty list when every non-array placeholder resolves', () => {
      const ctx: TokenContext = {
        userData: userData({ mail: 'ada@example.com' }),
        transactions: [tx({ id: 1, uid: 'T-1', created: '2024-01-01T00:00:00.000Z' })],
      };
      expect(getNonArrayMissingPlaceholders('$userData.mail and $transaction:last.id', ctx)).toEqual([]);
    });

    it('ignores unselected array-source placeholders even when missing', () => {
      expect(getNonArrayMissingPlaceholders('$transaction.id', {})).toEqual([]);
    });
  });
});
