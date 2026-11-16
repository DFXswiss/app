// Wallet browser extensions reject a second request while one is still open in their popup, e.g.
// "Already processing connect. Please wait." or "Already processing unlock. Please wait."
const PENDING_WALLET_REQUEST = /^Already processing \S+\. Please wait\.$/;

export const PENDING_WALLET_REQUEST_HINT = 'Please confirm or close the pending request in your wallet.';

// Replaces the raw wallet text with a translation key that tells the user what to do. Any other message stays as it is.
export function mapWalletErrorMessage(message: string): string {
  return PENDING_WALLET_REQUEST.test(message) ? PENDING_WALLET_REQUEST_HINT : message;
}
