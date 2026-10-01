import { DfxBankAccount, KundengelderAccount, KundengelderExtract } from 'src/dto/dashboard.dto';

function bankTitle(bank: DfxBankAccount): string {
  return `${bank.name} ${bank.currency}`.trim();
}

/**
 * Every DFX bank account stays on the extract, including a year with no movements.
 * Checkout stays, and Crypto-Crypto is not an account option.
 */
export function withEveryBankAccount(extract: KundengelderExtract, banks: DfxBankAccount[]): KundengelderExtract {
  const byKey = new Map(extract.accounts.map((account) => [account.key, account]));
  const seen = new Set<string>();
  const accounts: KundengelderAccount[] = [];
  const sorted = [...banks].sort(
    (a, b) => a.name.localeCompare(b.name) || a.currency.localeCompare(b.currency) || a.iban.localeCompare(b.iban),
  );

  for (const bank of sorted) {
    const iban = bank.iban.trim();
    if (!iban || !bank.currency.trim() || seen.has(iban)) continue;
    seen.add(iban);
    const existing = byKey.get(iban);
    if (existing) {
      accounts.push({ ...existing, name: bankTitle(bank), iban });
      continue;
    }
    accounts.push({
      key: iban,
      name: bankTitle(bank),
      iban,
      currency: bank.currency,
      lines: [],
    });
  }

  for (const account of extract.accounts) {
    if (account.key === 'CryptoCrypto') continue;
    if (!seen.has(account.key)) accounts.push(account);
  }

  return { ...extract, accounts };
}
