import { DfxBankAccount, KundengelderAccount, KundengelderExtract, KundengelderSheet } from 'src/dto/dashboard.dto';

function bankTitle(bank: DfxBankAccount): string {
  return `${bank.name} ${bank.currency.trim()}`.trim();
}

function pairKey(iban: string, currency: string): string {
  return `${iban}|${currency}`;
}

function findExistingAccount(
  accounts: KundengelderAccount[],
  iban: string,
  currency: string,
): KundengelderAccount | undefined {
  const composite = pairKey(iban, currency);
  return (
    accounts.find((account) => account.key === composite) ??
    accounts.find(
      (account) => account.currency.trim() === currency && (account.iban?.trim() === iban || account.key === iban),
    )
  );
}

function sheetMatchesBank(sheet: KundengelderSheet, iban: string, currency: string): boolean {
  const sheetCurrency = sheet.currency.trim();
  return (
    (sheet.iban?.trim() === iban && sheetCurrency === currency) ||
    sheet.key === pairKey(iban, currency) ||
    (sheet.key === iban && sheetCurrency === currency)
  );
}

function withBankIban(sheet: KundengelderSheet, banks: DfxBankAccount[]): KundengelderSheet {
  for (const bank of banks) {
    const iban = bank.iban.trim();
    const currency = bank.currency.trim();
    if (!iban || !currency) continue;
    if (!sheetMatchesBank(sheet, iban, currency)) continue;
    if (sheet.iban?.trim() === iban) return sheet;
    return { ...sheet, iban };
  }
  return sheet;
}

function emptyBankSheet(bank: DfxBankAccount, iban: string, currency: string, year: number): KundengelderSheet {
  return {
    key: pairKey(iban, currency),
    name: bankTitle(bank),
    iban,
    currency,
    periodStart: `${year}-01-01`,
    periodEnd: `${year}-12-31`,
    soll: [],
    haben: [],
    rows: [],
    sollSum: 0,
    habenSum: 0,
    control: 0,
    openingCheck: 'unchecked',
  };
}

/**
 * Every DFX bank account stays on the extract, including a year with no movements.
 * Checkout stays, and Crypto-Crypto is not an account option.
 * When sheets are present, banks without a matching sheet are appended as empty sheets.
 */
export function withEveryBankAccount(extract: KundengelderExtract, banks: DfxBankAccount[]): KundengelderExtract {
  const accounts: KundengelderAccount[] = [];
  const seen = new Set<string>();
  const sorted = [...banks].sort(
    (a, b) => a.name.localeCompare(b.name) || a.currency.localeCompare(b.currency) || a.iban.localeCompare(b.iban),
  );

  for (const bank of sorted) {
    const iban = bank.iban.trim();
    const currency = bank.currency.trim();
    if (!iban || !currency) continue;
    const pair = pairKey(iban, currency);
    if (seen.has(pair)) continue;
    seen.add(pair);

    const existing = findExistingAccount(extract.accounts, iban, currency);
    if (existing) {
      seen.add(existing.key);
      accounts.push({ ...existing, name: bankTitle(bank), iban });
      continue;
    }
    accounts.push({
      key: pair,
      name: bankTitle(bank),
      iban,
      currency,
      lines: [],
    });
  }

  for (const account of extract.accounts) {
    if (account.key === 'CryptoCrypto') continue;
    if (seen.has(account.key)) continue;
    const iban = account.iban?.trim();
    const currency = account.currency.trim();
    if (iban && currency && seen.has(pairKey(iban, currency))) continue;
    accounts.push(account);
  }

  const sourceSheets = extract.sheets;
  if (!sourceSheets || sourceSheets.length === 0) {
    return { ...extract, accounts };
  }

  const sheets = sourceSheets.map((sheet) => withBankIban(sheet, sorted));
  const extraSheets: KundengelderSheet[] = [];
  const seenSheetPairs = new Set<string>();
  for (const bank of sorted) {
    const iban = bank.iban.trim();
    const currency = bank.currency.trim();
    if (!iban || !currency) continue;
    const pair = pairKey(iban, currency);
    if (seenSheetPairs.has(pair)) continue;
    seenSheetPairs.add(pair);
    if (sheets.some((sheet) => sheetMatchesBank(sheet, iban, currency))) continue;
    extraSheets.push(emptyBankSheet(bank, iban, currency, extract.year));
  }

  const changed = sheets.some((sheet, index) => sheet !== sourceSheets[index]);
  if (extraSheets.length === 0 && !changed) {
    return { ...extract, accounts };
  }
  return { ...extract, accounts, sheets: [...sheets, ...extraSheets] };
}
