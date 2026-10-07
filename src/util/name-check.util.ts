// Internal AML-error token the api writes into a transaction comment (';'-joined list) when the name-check
// refresh of the account could not be completed. It is not a name-check hit: no screening result exists. A
// Reset hands the transaction back to the automatic AML run, which repeats the refresh. Kept next to
// scorechain.util.ts and ref-user-kyc.util.ts: same shape, same reason.
export const NAME_CHECK_UNAVAILABLE_TOKEN = 'NameCheckUnavailable';

// True iff the comment carries the NameCheckUnavailable token as one of its ';'-joined members.
// Membership (not substring), so a longer token that merely contains the string is not a false positive.
export function hasNameCheckUnavailable(comment?: string): boolean {
  if (!comment) return false;
  return comment
    .split(';')
    .map((token) => token.trim())
    .includes(NAME_CHECK_UNAVAILABLE_TOKEN);
}
