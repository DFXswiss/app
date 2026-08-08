/**
 * Test-only BIP39 mnemonic for signature-login wallets (testWallet / loginAs).
 * Distinct from E2E_EVM_DEPOSIT_SEED (used only for deposit-address seeding in global.setup).
 * This is a well-known throwaway phrase for local ephemeral stacks — not a secret.
 */
export const TEST_WALLET_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/**
 * Fixed, non-overlapping HD wallet indices per elevated role.
 * Index 0 is reserved for the default testWallet() / signatureLogin() used by smoke and authedPage.
 * Source of role string values: api/src/shared/auth/user-role.enum.ts (UserRole enum).
 */
export const ROLE_WALLET_INDEX = {
  User: 1,
  Admin: 2,
  Compliance: 3,
  Support: 4,
  Marketing: 5,
  RealUnit: 6,
} as const;

let testEmailCounter = 0;

/** Build a unique test email so reruns/rapid calls do not collide (counter-based, like the
 * factories' uniqueTag()/e2eMail(), not the previous Date.now()-only scheme which could repeat
 * within the same millisecond for two calls with the same tag). */
export function testEmail(tag: string): string {
  testEmailCounter += 1;
  const safe = tag.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `e2e+${safe}-${testEmailCounter}@dfx.swiss`;
}

/** Public test IBAN (Swiss sample) for payment-related specs. */
export const TEST_IBAN = 'CH9300762011623852957';

/**
 * Best-effort defaults from the standard API seed. A consuming test should confirm
 * buyable/sellable via GET /v1/asset and GET /v1/fiat at runtime rather than trusting
 * these constants blindly, since seed data can change.
 */
export const TEST_FIAT = 'CHF';
export const TEST_ASSET = 'ETH';
