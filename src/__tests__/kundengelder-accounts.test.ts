import { KundengelderExtract } from 'src/dto/dashboard.dto';
import { withEveryBankAccount } from 'src/util/kundengelder-accounts';

const extract: KundengelderExtract = {
  year: 2024,
  eurRate: 1,
  accounts: [
    {
      key: 'CH3408573177975200001',
      name: 'Raw IBAN',
      iban: 'CH3408573177975200001',
      currency: 'CHF',
      lines: [
        {
          key: 'BuyCrypto after Fee',
          label: 'BuyCrypto after Fee',
          currency: 'CHF',
          amount: 10,
          amountChf: 10,
          count: 1,
        },
      ],
    },
    {
      key: 'CheckoutLtdCHF',
      name: 'Checkout Ltd CHF',
      currency: 'CHF',
      lines: [],
    },
  ],
  diffs: [],
};

describe('withEveryBankAccount', () => {
  it('lists every bank, keeps movements, and leaves non-bank accounts in place', () => {
    const merged = withEveryBankAccount(extract, [
      { name: 'Kaleido', iban: ' CH6008245111962200001 ', currency: 'CHF' },
      { name: 'Maerki Baumann', iban: 'CH3408573177975200001', currency: 'CHF' },
      { name: 'Kaleido', iban: 'CH6008245111962200001', currency: 'CHF' },
      { name: 'Yapeal', iban: '', currency: 'EUR' },
    ]);

    expect(merged.accounts.map((account) => account.name)).toEqual([
      'Kaleido CHF',
      'Maerki Baumann CHF',
      'Checkout Ltd CHF',
    ]);
    expect(merged.accounts[0].lines).toEqual([]);
    expect(merged.accounts[0].key).toBe('CH6008245111962200001');
    expect(merged.accounts[1].lines).toHaveLength(1);
    expect(merged.diffs).toBe(extract.diffs);
  });
});
