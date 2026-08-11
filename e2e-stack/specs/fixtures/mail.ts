import { queryOne, waitForRow } from './db';

function apiBase(): string {
  return process.env.E2E_API_URL ?? 'http://api:3000';
}

function frontendBase(): string {
  return process.env.E2E_FRONTEND_URL ?? 'http://frontend';
}

/**
 * Highest Login-notification id seen for an email immediately before requestMailLogin POSTs.
 * completeMailLogin only accepts rows with id > this baseline so a parallel/prior login for the
 * same address cannot supply a wrong or already-consumed OTP.
 */
const loginBaselineByEmail = new Map<string, number>();

/**
 * Triggers POST /v1/auth/mail for `email`. Records the current max Login notification id for this
 * address so completeMailLogin can wait only for a notification created after this call.
 * Omit redirectUri so the default /account redirect is used.
 */
export async function requestMailLogin(email: string, redirectUri?: string): Promise<void> {
  const baselineRow = await queryOne<{ id: number | null }>(
    `SELECT MAX(n.id) AS id
     FROM notification n
     JOIN user_data ud ON ud.id = n."userDataId"
     WHERE ud.mail = $1 AND n.context = 'Login'`,
    [email],
  );
  loginBaselineByEmail.set(email, baselineRow?.id ?? 0);

  const body: { mail: string; redirectUri?: string } = { mail: email };
  if (redirectUri !== undefined) {
    body.redirectUri = redirectUri;
  }

  const res = await fetch(`${apiBase()}/v1/auth/mail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // Endpoint returns 204 with empty body on success.
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /v1/auth/mail failed: ${res.status} ${text}`);
  }
}

/**
 * Reads the one-time login code for `email` from the `notification` table and returns the session JWT.
 *
 * The OTP is NOT in a dedicated column and is NOT in the in-process mailKeyList Map.
 * signInByMail embeds the OTP into loginUrl = .../mail-login?otp=<uuid>, then notificationService.sendMail
 * persists a notification row (context='Login') whose `data` JSON contains texts[].params.url with that URL.
 *
 * Only considers notifications with id greater than the baseline recorded by the matching
 * requestMailLogin call (or 0 if that was never called for this email in this process), so a
 * parallel or prior login for the same address cannot supply a wrong/consumed OTP.
 *
 * Note (informational only, not implemented): in loc the API also logs
 * `[LOCAL DEV] Mail login URL for <mail>: <url>` (auth.service.ts:320-322) as a secondary, less robust
 * way to obtain the same URL. The DB path below is used because it does not depend on log scraping
 * or container log access.
 */
export async function completeMailLogin(email: string): Promise<string> {
  const baseline = loginBaselineByEmail.get(email) ?? 0;
  const row = await waitForRow<{ data: string }>(
    `SELECT n.data
     FROM notification n
     JOIN user_data ud ON ud.id = n."userDataId"
     WHERE ud.mail = $1 AND n.context = 'Login' AND n.id > $2
     ORDER BY n.id DESC
     LIMIT 1`,
    [email, baseline],
  );

  let parsed: { texts?: Array<{ params?: { url?: string } }> };
  try {
    parsed = JSON.parse(row.data) as typeof parsed;
  } catch (e) {
    throw new Error(`completeMailLogin: failed to JSON.parse notification.data: ${e}`);
  }

  const texts = parsed.texts;
  if (!Array.isArray(texts)) {
    throw new Error('completeMailLogin: notification.data.texts is not an array');
  }

  let otp: string | null = null;
  for (const entry of texts) {
    const url = entry?.params?.url;
    if (typeof url === 'string') {
      try {
        const parsedUrl = new URL(url, frontendBase());
        otp = parsedUrl.searchParams.get('otp');
        if (otp) break;
      } catch {
        // try next texts entry
      }
    }
  }

  if (!otp) {
    throw new Error(`completeMailLogin: could not extract otp from notification.data.texts for mail ${email}`);
  }

  const redirectRes = await fetch(`${apiBase()}/v1/auth/mail/redirect?code=${encodeURIComponent(otp)}`);
  if (!redirectRes.ok) {
    const text = await redirectRes.text();
    throw new Error(`GET /v1/auth/mail/redirect failed: ${redirectRes.status} ${text}`);
  }

  const { redirectUrl } = (await redirectRes.json()) as { redirectUrl: string };
  if (!redirectUrl) {
    throw new Error('completeMailLogin: redirect response missing redirectUrl');
  }

  // redirectUrl may be relative or absolute depending on server config.
  const parsedRedirect = new URL(redirectUrl, frontendBase());
  const session = parsedRedirect.searchParams.get('session');
  if (!session) {
    throw new Error(`completeMailLogin: redirectUrl has no session query param: ${redirectUrl}`);
  }

  return session;
}
