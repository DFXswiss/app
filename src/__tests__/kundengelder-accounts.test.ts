import { KundengelderExtract, KundengelderSheet } from 'src/dto/dashboard.dto';
import { withEveryBankAccount } from 'src/util/kundengelder-accounts';

const extract: KundengelderExtract = {
  year: 2024,
  eurRate: 1,
  accounts: [
    {
      key: 'CH2100000000000000005',
      name: 'Raw IBAN',
      iban: 'CH2100000000000000005',
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
      { name: 'Ledger Bank', iban: ' CH2100000000000000003 ', currency: 'CHF' },
      { name: 'Sample Bank', iban: 'CH2100000000000000005', currency: 'CHF' },
      { name: 'Ledger Bank', iban: 'CH2100000000000000003', currency: 'CHF' },
      { name: 'Zed Blank', iban: '', currency: 'EUR' },
    ]);

    expect(merged.accounts.map((account) => account.name)).toEqual([
      'Ledger Bank CHF',
      'Sample Bank CHF',
      'Checkout Ltd CHF',
    ]);
    expect(merged.accounts[0].lines).toEqual([]);
    expect(merged.accounts[0].key).toBe('CH2100000000000000003|CHF');
    expect(merged.accounts[0].iban).toBe('CH2100000000000000003');
    expect(merged.accounts[1].key).toBe('CH2100000000000000005');
    expect(merged.accounts[1].iban).toBe('CH2100000000000000005');
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
        { name: 'Sample Bank', iban: 'CH2100000000000000005', currency: 'CHF' },
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
    const iban = 'CH2100000000000000005';
    const merged = withEveryBankAccount(
      {
        ...extract,
        accounts: [...extract.accounts, { key: 'alias', name: 'Alias', iban, currency: 'CHF', lines: [] }],
      },
      [
        { name: 'Sample Bank', iban, currency: 'CHF' },
        { name: 'Sample Bank', iban, currency: 'EUR' },
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
    const iban = 'CH2100000000000000005';
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
      [{ name: 'Sample Bank', iban, currency: 'CHF' }],
    );

    expect(merged.accounts.map((account) => account.key)).toEqual([`${iban}|CHF`, 'CheckoutLtdCHF']);
    expect(merged.accounts[0].lines).toBe(lines);
    expect(merged.accounts[0].name).toBe('Sample Bank CHF');
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
      { name: 'Ledger Bank', iban: 'CH2100000000000000003', currency: 'CHF' },
    ]);
    expect(merged.sheets).toEqual([]);
  });

  it('keeps the extract sheets when every bank already has a sheet', () => {
    const sheets: KundengelderSheet[] = [
      {
        key: 'CH2100000000000000005',
        name: 'Sample Bank CHF',
        iban: 'CH2100000000000000005',
        currency: 'CHF',
        soll: [],
        haben: [],
        sollSum: 0,
        habenSum: 0,
        control: 0,
      },
    ];
    const merged = withEveryBankAccount({ ...extract, sheets }, [
      { name: 'Sample Bank', iban: 'CH2100000000000000005', currency: 'CHF' },
    ]);
    expect(merged.sheets).toBe(sheets);
  });

  it('appends empty sheets for missing banks and does not duplicate matches', () => {
    const ledgerIban = 'CH2100000000000000003';
    const sampleIban = 'CH2100000000000000005';
    const bareIban = 'CH1111111111111111111';
    const newIban = 'CH9999999999999999999';
    const sheets: KundengelderSheet[] = [
      {
        key: '90001',
        name: 'Sample Ledger CHF',
        iban: ledgerIban,
        currency: 'CHF',
        soll: [],
        haben: [],
        sollSum: 0,
        habenSum: 0,
        control: 0,
      },
      {
        key: `${sampleIban}|CHF`,
        name: 'Sample Bank CHF',
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
      { name: 'Ledger Bank', iban: ledgerIban, currency: 'CHF' },
      { name: 'Sample Bank', iban: sampleIban, currency: 'CHF' },
      { name: 'Bare', iban: bareIban, currency: 'CHF' },
      { name: 'New Bank', iban: ` ${newIban} `, currency: ' EUR ' },
      { name: 'New Bank', iban: newIban, currency: 'EUR' },
      { name: 'Zed Blank', iban: '', currency: 'EUR' },
      { name: 'Blank FX', iban: 'CH0000000000000000000', currency: '  ' },
    ]);

    expect(merged.sheets).toHaveLength(5);
    expect(merged.sheets?.map((sheet) => sheet.key)).toEqual([
      '90001',
      `${sampleIban}|CHF`,
      bareIban,
      newIban,
      `${newIban}|EUR`,
    ]);
    expect(merged.sheets?.[0]).toBe(sheets[0]);
    expect(merged.sheets?.[1]?.iban).toBe(sampleIban);
    expect(merged.sheets?.[1]).not.toBe(sheets[1]);
    expect(merged.sheets?.[2]?.iban).toBe(bareIban);
    expect(merged.sheets?.[4]).toEqual({
      key: `${newIban}|EUR`,
      name: 'New Bank EUR',
      iban: newIban,
      currency: 'EUR',
      periodStart: '2024-01-01',
      periodEnd: '2024-12-31',
      soll: [],
      haben: [],
      rows: [],
      sollSum: 0,
      habenSum: 0,
      control: 0,
      openingCheck: 'unchecked',
    });
    expect(merged.sheets?.[4]).not.toHaveProperty('accountNo');
    expect(merged.sheets?.map((sheet) => sheet.key)).not.toContain('CheckoutLtdCHF');
  });

  it('copies the bare IBAN onto a matched bank sheet and leaves Checkout unchanged', () => {
    const iban = 'CH2100000000000000008';
    const bankSheet: KundengelderSheet = {
      key: `${iban}|CHF`,
      name: 'Sample Pair CHF',
      currency: 'CHF',
      soll: [],
      haben: [],
      sollSum: 0,
      habenSum: 0,
      control: 0,
    };
    const checkout: KundengelderSheet = {
      key: 'CheckoutLtdCHF',
      name: 'Checkout CHF',
      currency: 'CHF',
      soll: [],
      haben: [],
      sollSum: 0,
      habenSum: 0,
      control: 0,
    };
    const merged = withEveryBankAccount({ ...extract, sheets: [bankSheet, checkout] }, [
      { name: 'Sample Pair', iban, currency: 'CHF' },
    ]);

    expect(merged.sheets?.[0]).toMatchObject({ key: bankSheet.key, iban });
    expect(merged.sheets?.[1]).toBe(checkout);
  });
});
