import { KundengelderExtract, KundengelderSheet } from 'src/dto/dashboard.dto';
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
    expect(merged.accounts[0].key).toBe('CH6008245111962200001|CHF');
    expect(merged.accounts[0].iban).toBe('CH6008245111962200001');
    expect(merged.accounts[1].key).toBe('CH3408573177975200001');
    expect(merged.accounts[1].iban).toBe('CH3408573177975200001');
    expect(merged.accounts[1].lines).toHaveLength(1);
    expect(merged.diffs).toBe(extract.diffs);
    expect(merged.sheets).toBeUndefined();
  });

  it('omits a blank-currency bank and CryptoCrypto while keeping CheckoutLtdCHF', () => {
    const merged = withEveryBankAccount(
      {
        ...extract,
        accounts: [
          ...extract.accounts,
          { key: 'CryptoCrypto', name: 'Crypto-Crypto', currency: 'CHF', lines: [] },
          { key: 'CHOTHER', name: 'Other', iban: 'CHOTHER', currency: 'CHF', lines: [] },
          { key: 'blank-acc', name: 'Blank Acc', iban: 'CHBLANK', currency: '  ', lines: [] },
        ],
      },
      [
        { name: 'Maerki Baumann', iban: 'CH3408573177975200001', currency: 'CHF' },
        { name: 'Blank FX', iban: 'CH0000000000000000000', currency: '  ' },
      ],
    );

    const keys = merged.accounts.map((account) => account.key);
    expect(keys).not.toContain('CH0000000000000000000');
    expect(keys).not.toContain('CryptoCrypto');
    expect(keys).toContain('CheckoutLtdCHF');
    expect(keys).toContain('CHOTHER');
    expect(keys).toContain('blank-acc');
  });

  it('keeps both currencies of the same IBAN as separate accounts', () => {
    const iban = 'CH3408573177975200001';
    const merged = withEveryBankAccount(
      {
        ...extract,
        accounts: [...extract.accounts, { key: 'alias', name: 'Alias', iban, currency: 'CHF', lines: [] }],
      },
      [
        { name: 'Maerki Baumann', iban, currency: 'CHF' },
        { name: 'Maerki Baumann', iban, currency: 'EUR' },
      ],
    );

    const keys = merged.accounts.map((account) => account.key);
    expect(keys).toEqual([iban, `${iban}|EUR`, 'CheckoutLtdCHF']);
    expect(keys.filter((key) => key === iban)).toHaveLength(1);
    expect(keys.filter((key) => key === `${iban}|EUR`)).toHaveLength(1);
    expect(merged.accounts[0].lines).toHaveLength(1);
    expect(merged.accounts[0].iban).toBe(iban);
    expect(merged.accounts[1].lines).toEqual([]);
    expect(merged.accounts[1].iban).toBe(iban);
    expect(merged.accounts[1].currency).toBe('EUR');
  });

  it('prefers the composite key when an extract account already uses IBAN and currency', () => {
    const iban = 'CH3408573177975200001';
    const { lines } = extract.accounts[0];
    const merged = withEveryBankAccount(
      {
        ...extract,
        accounts: [
          { key: iban, name: 'Bare', iban, currency: 'CHF', lines: [] },
          { key: `${iban}|CHF`, name: 'Composite', iban, currency: 'CHF', lines },
          { key: 'CheckoutLtdCHF', name: 'Checkout Ltd CHF', currency: 'CHF', lines: [] },
        ],
      },
      [{ name: 'Maerki Baumann', iban, currency: 'CHF' }],
    );

    expect(merged.accounts.map((account) => account.key)).toEqual([`${iban}|CHF`, 'CheckoutLtdCHF']);
    expect(merged.accounts[0].lines).toBe(lines);
    expect(merged.accounts[0].name).toBe('Maerki Baumann CHF');
  });

  it('takes an existing account whose key is the IBAN when iban is absent', () => {
    const iban = 'CH1111111111111111111';
    const lines = [{ key: 'L', label: 'L', currency: 'CHF', amount: 1, amountChf: 1, count: 1 }];
    const merged = withEveryBankAccount(
      {
        ...extract,
        accounts: [{ key: iban, name: 'Raw', currency: 'CHF', lines }],
      },
      [{ name: 'Solo', iban, currency: 'CHF' }],
    );

    expect(merged.accounts[0].key).toBe(iban);
    expect(merged.accounts[0].iban).toBe(iban);
    expect(merged.accounts[0].lines).toBe(lines);
  });

  it('does not invent sheets when the extract sheet list is empty', () => {
    const merged = withEveryBankAccount({ ...extract, sheets: [] }, [
      { name: 'Kaleido', iban: 'CH6008245111962200001', currency: 'CHF' },
    ]);
    expect(merged.sheets).toEqual([]);
  });

  it('keeps the extract sheets when every bank already has a sheet', () => {
    const sheets: KundengelderSheet[] = [
      {
        key: 'CH3408573177975200001',
        name: 'Maerki Baumann CHF',
        iban: 'CH3408573177975200001',
        currency: 'CHF',
        soll: [],
        haben: [],
        sollSum: 0,
        habenSum: 0,
        control: 0,
      },
    ];
    const merged = withEveryBankAccount({ ...extract, sheets }, [
      { name: 'Maerki Baumann', iban: 'CH3408573177975200001', currency: 'CHF' },
    ]);
    expect(merged.sheets).toBe(sheets);
  });

  it('appends empty sheets for missing banks and does not duplicate matches', () => {
    const kaleidoIban = 'CH6008245111962200001';
    const maerkiIban = 'CH3408573177975200001';
    const bareIban = 'CH1111111111111111111';
    const newIban = 'CH9999999999999999999';
    const sheets: KundengelderSheet[] = [
      {
        key: '10037',
        name: 'Kaleido Privatbank CHF',
        iban: kaleidoIban,
        currency: 'CHF',
        soll: [],
        haben: [],
        sollSum: 0,
        habenSum: 0,
        control: 0,
      },
      {
        key: `${maerkiIban}|CHF`,
        name: 'Maerki Baumann CHF',
        currency: 'CHF',
        soll: [],
        haben: [],
        sollSum: 0,
        habenSum: 0,
        control: 0,
      },
      {
        key: bareIban,
        name: 'Bare Key CHF',
        currency: 'CHF',
        soll: [],
        haben: [],
        sollSum: 0,
        habenSum: 0,
        control: 0,
      },
      {
        key: newIban,
        name: 'Wrong FX',
        iban: newIban,
        currency: 'CHF',
        soll: [],
        haben: [],
        sollSum: 0,
        habenSum: 0,
        control: 0,
      },
    ];
    const merged = withEveryBankAccount({ ...extract, sheets }, [
      { name: 'Kaleido', iban: kaleidoIban, currency: 'CHF' },
      { name: 'Maerki Baumann', iban: maerkiIban, currency: 'CHF' },
      { name: 'Bare', iban: bareIban, currency: 'CHF' },
      { name: 'New Bank', iban: ` ${newIban} `, currency: ' EUR ' },
      { name: 'New Bank', iban: newIban, currency: 'EUR' },
      { name: 'Yapeal', iban: '', currency: 'EUR' },
      { name: 'Blank FX', iban: 'CH0000000000000000000', currency: '  ' },
    ]);

    expect(merged.sheets).toHaveLength(5);
    expect(merged.sheets?.map((sheet) => sheet.key)).toEqual([
      '10037',
      `${maerkiIban}|CHF`,
      bareIban,
      newIban,
      `${newIban}|EUR`,
    ]);
    expect(merged.sheets?.[0]).toBe(sheets[0]);
    expect(merged.sheets?.[4]).toEqual({
      key: `${newIban}|EUR`,
      name: 'New Bank EUR',
      iban: newIban,
      currency: 'EUR',
      soll: [],
      haben: [],
      rows: [],
      sollSum: 0,
      habenSum: 0,
      control: 0,
    });
    expect(merged.sheets?.[4]).not.toHaveProperty('accountNo');
    expect(merged.sheets?.map((sheet) => sheet.key)).not.toContain('CheckoutLtdCHF');
  });
});
