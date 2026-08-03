import de from 'src/translations/languages/de.json';

/**
 * English base keys used by the partner dashboard under screens/partner.
 * Removing any of these from de.json must fail this suite (Gegenprobe).
 */
const PARTNER_KEYS = [
  'Total volume',
  'Transactions',
  'Average transaction size',
  'Active users',
  'New users',
  'Registered users (total)',
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
  'Note',
  'incomplete',
  '{{value}} (incomplete)',
  'Dates marked incomplete only partially cover the selected period (start or end of the range).',
  'Incomplete period sections',
  'Theme',
  'Language',
  'Light',
  'Dark',
  'Sign in',
  'Log out',
  'Wallet address',
  'Challenge to sign',
  'Signature',
  'Public key (optional)',
  'Request challenge',
  'Please wait…',
  'Sign-in failed.',
  'Enter the partner wallet address, request a challenge, sign it with your wallet, then paste the signature.',
  'No partner logo',
  'No data.',
  'Show as table',
  'Hide table',
  'Referral',
  'Referral volume',
  'Credit earned',
  'Credit paid out',
  'Credit open',
  'Payment received',
  'Waiting for payment',
  'No payment',
  'Delivered',
  'In progress',
  'Rejected',
  'Payment info requests with successful payment',
  'A payment info request is created every time payment information is retrieved (e.g. on every amount change in the interface), not once per purchase intent. The rate is therefore not a conversion rate.',
  'Stage A — rate',
  'Received payments that were delivered',
  'Share of received payments that were delivered — including rejected and still-in-progress transactions.',
  'Stage B — rate',
  'Requested:',
  'Received:',
  'Rate: {{rate}}',
  'More information',
  'Buy',
  'Sell',
  'Swap',
  'An error occurred while loading the dashboard. The page remains usable.',
  'Unknown error',
  'Retry',
  'Try again',
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
    expect(partner['Total volume']).toBe('Gesamtvolumen');
    expect(partner['New users']).toBe('Neue Nutzer');
    expect(partner['Show as table']).toBe('Als Tabelle anzeigen');
    expect(partner['Buy']).toBe('Kauf');
    expect(partner['incomplete']).toBe('unvollständig');
  });
});
