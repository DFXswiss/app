// The public IBAN sample is already verified on shared dev and prod accounts.
// Registering it there sends those accounts an IBAN merge mail. A shared API
// call therefore has to carry the caller's own IBAN and own dfx.swiss mail.
const SHARED_EXAMPLE_IBAN = 'CH9300762011623852957';
const OWN_MAIL = /^(joshua\.krueger|joshua)(\+[a-z0-9._-]+)?@dfx\.swiss$/i;

export function normalizeIban(iban: string): string {
  return iban.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function isSharedApi(apiUrl: string): boolean {
  let host: string;
  try {
    // Node keeps the brackets on an IPv6 hostname, so [::1] and ::1 are one host.
    host = new URL(apiUrl).hostname.replace(/[[\]]/g, '');
  } catch {
    throw new Error(`API URL is not valid: ${apiUrl}`);
  }

  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
  if (host === 'api' || host.endsWith('.e2e.test')) return false;
  return true;
}

export function assertSharedAccount(apiUrl: string, iban: string, mail?: string): void {
  if (!isSharedApi(apiUrl)) return;

  const normalized = normalizeIban(iban);
  if (normalized === '' || normalized === SHARED_EXAMPLE_IBAN) {
    throw new Error('Set TEST_IBAN to your own IBAN. The example IBAN is refused against a shared DFX API.');
  }

  if (!mail || !OWN_MAIL.test(mail)) {
    throw new Error("Set TEST_EMAIL to your own dfx.swiss address. Another person's mailbox is refused.");
  }
}
