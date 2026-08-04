import de from 'src/translations/languages/de.json';
import fr from 'src/translations/languages/fr.json';
import itIT from 'src/translations/languages/it.json';

/**
 * English base keys used by the partner dashboard under screens/partner.
 * Removing any of these from a language file must fail this suite (Gegenprobe).
 *
 * There is no en.json: partnerTranslate() (src/partner-dashboard/util/i18n.ts)
 * calls i18next with the English text as both key and defaultValue, so English
 * falls back to the literal key text itself. Only de/fr/it are checked here.
 */
const PARTNER_KEYS = [
  'Non-Custodial Partner Program',
  'NC Partner Program',
  'Total volume',
  'This period',
  'All-time totals',
  'Transactions',
  'Average transaction size',
  'Active users',
  'New users',
  'Registered users (total)',
  'Trading users (total)',
  'Lifetime volume',
  'of registered users',
  'No registered users yet',
  'Volume by cryptocurrency',
  'Fiat currencies',
  'Blockchains',
  'Payment methods',
  'Partner metrics could not be loaded.',
  'Demo data',
  '30 days',
  '90 days',
  '365 days',
  'Day',
  'Week',
  'Month',
  'Period and granularity',
  'Period',
  'Granularity',
  'Volume over time',
  'No volume data for the selected period.',
  'Transactions over time',
  'No transaction data for the selected period.',
  'Shows how much was traded in each period, split into buy, sell and swap.',
  'Shows how many operations happened in each period, split into buy, sell and swap.',
  'Date',
  'No data.',
  'Show as table',
  'Hide table',
  'Referral',
  'Referral volume',
  'Credit earned',
  'Credit paid out',
  'Credit open',
  'Buy',
  'Sell',
  'Swap',
  'An error occurred while loading the dashboard. The page remains usable.',
  'Unknown error',
  'Retry',
  'Try again',
  'Theme',
  'Light',
  'Dark',
  'Language',
] as const;

type PartnerTranslations = Record<string, string>;

function partnerNamespace(doc: unknown): PartnerTranslations {
  return (doc as { 'screens/partner': PartnerTranslations })['screens/partner'];
}

const LANGUAGES: Record<string, PartnerTranslations> = {
  de: partnerNamespace(de),
  fr: partnerNamespace(fr),
  it: partnerNamespace(itIT),
};

/**
 * Keys whose translated value is deliberately identical to the English source
 * text. Each entry below was checked against real precedent elsewhere in the
 * same translation files before being allow-listed — this list must not grow
 * without that check (that would just soften the test, not verify anything).
 *
 * - Blockchains (de, fr): kept as the loanword "Blockchain(s)" everywhere in
 *   the app, not only here — see screens/compliance, screens/home and
 *   screens/payment in de.json and fr.json, which all keep the identical
 *   English spelling.
 * - Date (fr): French orthography for "date" is spelled identically to
 *   English; not a missed translation.
 * - Referral (de, it): kept as an English loanword in both languages,
 *   consistent with the compound "Referral volume" translations in this same
 *   screens/partner section ("Referral-Volumen", "Volume referral") — the verb
 *   stem stays "Referral", only the surrounding word is translated.
 * - Swap (de): kept as the loanword in German across the app (screens/safe,
 *   navigation/links), and already used untranslated inside two other
 *   screens/partner sentences in this very file
 *   ("aufgeteilt nach Kauf, Verkauf und Swap").
 *
 * Blockchains (de) and Swap (de) were not named in the PR review notes that
 * flagged the other three — flagged here for a human to confirm, not silently
 * assumed.
 */
const ALLOWED_UNTRANSLATED: Record<string, readonly string[]> = {
  de: ['Blockchains', 'Referral', 'Swap'],
  fr: ['Blockchains', 'Date'],
  it: ['Referral'],
};

describe.each(Object.entries(LANGUAGES))('partner dashboard translations — %s', (lang, table) => {
  it('defines a non-empty translation for every partner UI key', () => {
    expect(table).toBeDefined();
    for (const key of PARTNER_KEYS) {
      const value = table[key];
      expect(value).toBeDefined();
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('has exactly the canonical screens/partner key set (no missing, no extra keys)', () => {
    expect(Object.keys(table).sort()).toEqual([...PARTNER_KEYS].sort());
  });

  it('has no key left as the literal English source text outside the reviewed exceptions', () => {
    const allowed = new Set(ALLOWED_UNTRANSLATED[lang] ?? []);
    const untranslated = PARTNER_KEYS.filter((key) => table[key] === key && !allowed.has(key));
    expect(untranslated).toEqual([]);
  });
});

describe('partner dashboard translations (screens/partner)', () => {
  it('keeps a few known German strings that partners already saw', () => {
    const partner = LANGUAGES.de;
    expect(partner['Non-Custodial Partner Program']).toBe('Non-Custodial Partnerprogramm');
    expect(partner['NC Partner Program']).toBe('NC Partner Programm');
    expect(partner['Total volume']).toBe('Gesamtvolumen');
    expect(partner['New users']).toBe('Neue Nutzer');
    expect(partner['Show as table']).toBe('Als Tabelle anzeigen');
    expect(partner['Buy']).toBe('Kauf');
  });
});
