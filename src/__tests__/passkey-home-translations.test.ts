import de from '../translations/languages/de.json';
import fr from '../translations/languages/fr.json';
import italian from '../translations/languages/it.json';

it('keeps the home translation keys aligned across German, French and Italian', () => {
  const keys = (translation: { 'screens/home': Record<string, string> }) =>
    Object.keys(translation['screens/home']).sort();
  expect(keys(fr)).toEqual(keys(de));
  expect(keys(italian)).toEqual(keys(de));
});

const addedHomeKeys = [
  'EVM',
  'Bitcoin',
  'Spark',
  'Destination',
  'Paste',
  'Scan',
  'Amount',
  'Sending is not active yet.',
  'Paste is not available in this browser.',
  'Clipboard is not available.',
  'QR scanning is not available in this browser.',
  'This browser has no passkey support',
  'Log in with your device',
  'Preparing your login…',
  'Do you already have an account?',
  'Log in with existing account',
  'Open a new account',
  'Your email',
  'This email is saved with the new passkey account.',
  'Continue',
  'This passkey is not an account',
  'This device offered a passkey that DFX does not recognize. Open a new account. If the device offers that same passkey again, delete the saved DFX passkey in your password settings, then try again.',
  'Open this page in your browser',
  'Passkeys do not work inside Telegram or other in-app browsers. Open this page in Safari or Chrome to log in.',
  "On iPhone, you'll find the compass or Safari icon at the top right.",
  'Open in browser',
  'Copy link',
  'Copied',
  'This passkey cannot hold a wallet on this device.',
  'This operating system cannot sign in with a passkey.',
  'This operating system ({{version}}) cannot sign in with a passkey.',
  'Log in',
  'The passkey wallet was revoked.',
  'Try again',
  'Wallet',
  'Settings',
  'Total balance',
  'Show wallet',
  'Hide wallet',
  'Your wallet',
  'Addresses',
  'Lightning (Spark)',
  'Ethereum & EVM',
  'Buy',
  'Sell',
  'Swap',
  'Send',
  'Receive',
  'Pay',
  'History',
  'Show more',
  'That is all your transactions.',
  'Loading more transactions',
  'No transactions yet.',
  'This passkey did not unlock the wallet. Please try again with the passkey of this wallet.',
  'Use another passkey',
  'Passkey on this device',
  'Unlocked',
  'Security',
  'Recovery words',
  'Check addresses',
  'Checks that DFX shows your own addresses',
  'Help',
  'Reload data',
  'Check passkey status',
  'Record a diagnostic',
  'You will sign in again',
  'Danger zone',
  'Block passkey',
  'The passkey was not blocked. Please try again.',
  'This passkey will no longer open the wallet. This cannot be undone.',
  'What happened?',
  'Passkey lost',
  'You confirm one last time with this passkey.',
  'Device gone, deleted or no longer accessible',
  'Passkey compromised',
  'I understand that this cannot be undone.',
  'Cancel',
  'Block',
  'Write the 12 words on paper in this order. Anyone who knows them can access your funds. DFX will never ask for them.',
  'I have written the words down on paper.',
  'Done',
  'Address copied',
  'DFX home',
  'Currency',
  'Close',
  'Actions',
  'Not connected yet',
  'Connect again',
  'Diagnostic recorded.',
  'Wallets on this account: {{count}}.',
  'Linked {{family}} {{address}}.',
  '{{credentialId}}: {{status}}',
  'Active',
  'Lost',
  'Compromised',
  'Unknown',
  'Copy address',
  'Loading transactions',
  'Loading balance',
  'Payout pending',
  'Could not load transactions.',
  'addresses match',
  'No credential status.',
  'Matches',
  'Differs',
];

const unchangedTranslations: Record<string, string[]> = {
  de: ['EVM', 'Bitcoin', 'Spark', 'Wallet', 'Lightning (Spark)', 'Ethereum & EVM', '{{credentialId}}: {{status}}'],
  fr: [
    'EVM',
    'Bitcoin',
    'Spark',
    'Wallet',
    'Actions',
    'Lightning (Spark)',
    'Ethereum & EVM',
    '{{credentialId}}: {{status}}',
  ],
  it: ['EVM', 'Bitcoin', 'Spark', 'Wallet', 'Lightning (Spark)', 'Ethereum & EVM', '{{credentialId}}: {{status}}'],
};

function checkAddedTranslations(language: string, messages: Record<string, string>): void {
  for (const key of addedHomeKeys) {
    expect(typeof messages[key]).toBe('string');
    expect(messages[key].trim()).not.toBe('');
    expect(messages[key]).toBe(messages[key].trim());
    if (!unchangedTranslations[language].includes(key)) expect(messages[key]).not.toBe(key);
  }
}

it('translates each addedHomeKeys entry in German, French and Italian', () => {
  for (const [language, messages] of [
    ['de', de['screens/home']],
    ['fr', fr['screens/home']],
    ['it', italian['screens/home']],
  ] as const) {
    checkAddedTranslations(language, messages);
  }
});

it('keeps the existing generic error translated', () => {
  const key = 'Something went wrong. Please try again.';
  for (const messages of [de['screens/home'], fr['screens/home'], italian['screens/home']]) {
    expect(messages[key].trim()).not.toBe('');
    expect(messages[key]).not.toBe(key);
  }
});

it('rejects missing and empty translations of added home keys', () => {
  const missing: Record<string, string> = { ...de['screens/home'] };
  delete missing['EVM'];
  expect(() => checkAddedTranslations('de', missing)).toThrow();
  const empty = { ...de['screens/home'], EVM: '' };
  expect(() => checkAddedTranslations('de', empty)).toThrow();
  const whitespace = { ...de['screens/home'], EVM: ' ' };
  expect(() => checkAddedTranslations('de', whitespace)).toThrow();
});
