import de from 'src/translations/languages/de.json';

/**
 * English base keys used by the partner dashboard under screens/partner.
 * Removing any of these from de.json must fail this suite (Gegenprobe).
 */
const PARTNER_KEYS = [
  'Partner Dashboard',
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

const partner = (de as { 'screens/partner': Record<string, string> })['screens/partner'];

describe('partner dashboard translations (screens/partner)', () => {
  it('defines a non-empty German translation for every partner UI key', () => {
    expect(partner).toBeDefined();
    for (const key of PARTNER_KEYS) {
      const value = partner[key];
      expect(value).toBeDefined();
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('keeps a few known German strings that partners already saw', () => {
    expect(partner['Partner Dashboard']).toBe('Partner-Dashboard');
    expect(partner['Total volume']).toBe('Gesamtvolumen');
    expect(partner['New users']).toBe('Neue Nutzer');
    expect(partner['Show as table']).toBe('Als Tabelle anzeigen');
    expect(partner['Buy']).toBe('Kauf');
  });
});
