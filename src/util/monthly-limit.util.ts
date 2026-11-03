// Internal AML-error token the api writes into a transaction comment (';'-joined list) when the monthly
// limit blocks the payment. Acknowledging it is not a Pass: the API stamps the transaction and resets it;
// the automatic AML run then drops only this token. There is no payout-address exemption, and a yearly
// limit stays in place.
export const MONTHLY_LIMIT_REACHED_TOKEN = 'MonthlyLimitReached';

// True iff the comment carries the MonthlyLimitReached token as one of its ';'-joined members.
// Membership (not substring), so a longer token that merely contains the string is not a false positive.
export function hasMonthlyLimitReached(comment?: string): boolean {
  if (!comment) return false;
  return comment
    .split(';')
    .map((token) => token.trim())
    .includes(MONTHLY_LIMIT_REACHED_TOKEN);
}
