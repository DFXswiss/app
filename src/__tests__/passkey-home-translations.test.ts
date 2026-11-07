import de from '../translations/languages/de.json';
import fr from '../translations/languages/fr.json';
import italian from '../translations/languages/it.json';

it('keeps the home translation keys aligned across German, French and Italian', () => {
  const keys = (translation: { 'screens/home': Record<string, string> }) =>
    Object.keys(translation['screens/home']).sort();
  expect(keys(fr)).toEqual(keys(de));
  expect(keys(italian)).toEqual(keys(de));
});

it('translates the passkey login and revocation messages in all supported languages', () => {
  const keys = [
    'This browser has no passkey support',
    'Something went wrong. Please try again.',
    'Log in with your device',
    'Preparing your login…',
    'Do you already have an account?',
    'Log in with existing account',
    'Open a new account',
    'Try again',
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
    'Log in',
    'The passkey wallet was revoked.',
    'You confirm one last time with this passkey.',
    'Clipboard is not available.',
  ];
  for (const language of [de, fr, italian]) {
    const messages: Record<string, string> = language['screens/home'];
    for (const key of keys) {
      expect(typeof messages[key]).toBe('string');
      expect(messages[key].trim()).not.toBe('');
      expect(messages[key]).toBe(messages[key].trim());
      expect(messages[key]).not.toBe(key);
    }
  }
});
