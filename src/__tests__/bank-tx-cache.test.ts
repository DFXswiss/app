import type { BankTxSearchResult } from 'src/hooks/compliance.hook';
import { BANK_TX_CACHE_PREFIX, cacheBankTx, readCachedBankTx } from 'src/util/bank-tx-cache';

function bankTx(overrides: Partial<BankTxSearchResult> = {}): BankTxSearchResult {
  return {
    id: 99,
    accountServiceRef: 'ref-99',
    amount: 250,
    currency: 'CHF',
    type: 'Incoming',
    name: 'Alice',
    iban: 'CH9300762011623852957',
    ...overrides,
  };
}

describe('bank-tx-cache', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('exports the prefix that session cleanup allowlists', () => {
    expect(BANK_TX_CACHE_PREFIX).toBe('dfx.bankTx.');
  });

  describe('cacheBankTx', () => {
    it('stores the row as JSON under prefix + id', () => {
      const row = bankTx({ id: 42, transactionId: 7 });
      cacheBankTx(row);
      expect(sessionStorage.getItem(`${BANK_TX_CACHE_PREFIX}42`)).toBe(JSON.stringify(row));
    });
  });

  describe('readCachedBankTx', () => {
    it('returns undefined when no entry exists', () => {
      expect(readCachedBankTx('42')).toBeUndefined();
    });

    it('returns the parsed row after a cache write', () => {
      const row = bankTx({ id: 42, transactionId: 7 });
      cacheBankTx(row);
      expect(readCachedBankTx('42')).toEqual(row);
    });

    it('does not read a different id', () => {
      cacheBankTx(bankTx({ id: 1 }));
      expect(readCachedBankTx('2')).toBeUndefined();
    });

    it('returns undefined for invalid JSON', () => {
      sessionStorage.setItem(`${BANK_TX_CACHE_PREFIX}42`, '{not-json');
      expect(readCachedBankTx('42')).toBeUndefined();
    });

    it('returns undefined for an empty stored string', () => {
      sessionStorage.setItem(`${BANK_TX_CACHE_PREFIX}42`, '');
      expect(readCachedBankTx('42')).toBeUndefined();
    });
  });
});
