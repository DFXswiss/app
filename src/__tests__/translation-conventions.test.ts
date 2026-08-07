/**
 * Convention guards for translation files touched by payment-QR work.
 * Not a full i18n linter — only Anrede capitalization (de) and "wallet" as
 * common noun (fr/it), so portefeuille/portafoglio regressions fail the suite.
 */

import de from '../translations/languages/de.json';
import fr from '../translations/languages/fr.json';
import itLang from '../translations/languages/it.json';

/** German informal address forms that must be capitalized when used as Anrede. */
const DE_ANREDE = /\b(du|dich|dir|dein|deine|deinen|deinem|deiner|deines)\b/g;

/**
 * Known pre-existing lowercase Anrede forms left in de.json (full German value).
 * A new lowercase Anrede must not be added here without an explicit decision.
 */
const DE_ANREDE_EXCEPTIONS: readonly string[] = [
  'Der Zugriff auf interne Werkzeuge setzt neu eine identifizierte Person hinter dem Konto voraus. Deine Rolle ist unverändert — es fehlt lediglich deine Identifikation.',
  'Keine dir zugeordneten Tickets',
  'Die bestehende EUR-IBAN (CH8583019DFXSWISSEURX) hat derzeit technische Probleme. Bitte verwende stattdessen deine persönliche IBAN für EUR-Transaktionen. Du findest deine persönliche IBAN auf der Kaufseite.',
];

/** Full-string product-name exceptions where the English token "wallet" is intentional. */
const WALLET_EXCEPTIONS: readonly string[] = ['Login avec votre wallet BTC Taro'];

function collectStringValues(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) {
      collectStringValues(value, out);
    }
  }
  return out;
}

function lowercaseAnredeHits(value: string): string[] {
  const hits: string[] = [];
  DE_ANREDE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DE_ANREDE.exec(value)) !== null) {
    hits.push(match[0]);
  }
  return hits;
}

function containsWalletAsWord(value: string): boolean {
  // Whole word, case-insensitive; {{wallet}} is handled via exception list.
  return /\bwallet\b/i.test(value);
}

function isWalletException(value: string): boolean {
  // Exact match only — substring exceptions would silence any sentence containing the product name.
  if (WALLET_EXCEPTIONS.some((ex) => value === ex)) {
    return true;
  }
  // Placeholder-only hits: strip {{wallet}} and re-check (variable name is English by convention).
  const withoutPlaceholders = value.replace(/\{\{\s*wallet\s*\}\}/gi, '');
  return !/\bwallet\b/i.test(withoutPlaceholders);
}

describe('translation conventions (payment-related language quality)', () => {
  describe('de.json — Anrede capitalization', () => {
    const values = collectStringValues(de);

    it('has translation strings to inspect (no vacuum)', () => {
      expect(values.length).toBeGreaterThan(100);
    });

    it('writes Du/Dich/Dir/Dein… uppercase except the named legacy list', () => {
      const violations: { value: string; hits: string[] }[] = [];

      for (const value of values) {
        if (DE_ANREDE_EXCEPTIONS.includes(value)) continue;
        const hits = lowercaseAnredeHits(value);
        if (hits.length > 0) {
          violations.push({ value, hits });
        }
      }

      expect(violations).toEqual([]);
    });

    it('still lists every named exception (exceptions must remain present)', () => {
      for (const exception of DE_ANREDE_EXCEPTIONS) {
        expect(values).toContain(exception);
      }
    });
  });

  describe('fr.json / it.json — no "wallet" as common noun', () => {
    const frValues = collectStringValues(fr);
    const itValues = collectStringValues(itLang);

    it('has fr and it strings to inspect (no vacuum)', () => {
      expect(frValues.length).toBeGreaterThan(100);
      expect(itValues.length).toBeGreaterThan(100);
    });

    it('fr.json does not use wallet as Gattungswort outside named exceptions', () => {
      const violations = frValues.filter((v) => containsWalletAsWord(v) && !isWalletException(v));
      expect(violations).toEqual([]);
    });

    it('it.json does not use wallet as Gattungswort outside named exceptions', () => {
      const violations = itValues.filter((v) => containsWalletAsWord(v) && !isWalletException(v));
      expect(violations).toEqual([]);
    });

    it('payment copy uses portefeuille / portafoglio instead of wallet as Gattungswort', () => {
      const frPayment = (fr as { 'screens/payment': Record<string, string> })['screens/payment'];
      const itPayment = (itLang as { 'screens/payment': Record<string, string> })['screens/payment'];

      expect(frPayment['Choose your wallet to open the payment.']).toMatch(/portefeuille/i);
      expect(frPayment['Choose your wallet to open the payment.']).not.toMatch(/\bwallet\b/i);

      expect(itPayment['Choose your wallet to open the payment.']).toMatch(/portafoglio/i);
      expect(itPayment['Choose your wallet to open the payment.']).not.toMatch(/\bwallet\b/i);
    });
  });
});
