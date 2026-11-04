import { spawn } from 'node:child_process';
import net from 'node:net';
import type { Page } from '@playwright/test';
import { queryOne, queryRows } from './fixtures';

/** Loc relying party. The stack hostname `frontend` is not that host. */
export const PASSKEY_PAGE_ORIGIN = 'http://localhost:3001';

/**
 * Chromium virtual authenticator plus a PRF wrapper.
 *
 * The virtual authenticator signs the attestation and the assertion, which is what the API checks.
 * It does not return PRF output. The wrapper keeps those bytes and, only when PRF is missing, adds
 * a fixed 32-byte result. The wallet strips that result before the request leaves the tab. The same
 * bytes on create and get keep the seed check stable for this browser profile.
 */
export async function installVirtualPasskey(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const prf = new Uint8Array(32);
    for (let index = 0; index < prf.length; index += 1) prf[index] = (index * 7 + 3) & 255;

    const credentials = navigator.credentials;
    if (credentials && typeof credentials.create === 'function' && typeof credentials.get === 'function') {
      const nativeCreate = credentials.create.bind(credentials);
      const nativeGet = credentials.get.bind(credentials);

      function withoutPrf(options: CredentialCreationOptions | CredentialRequestOptions | undefined) {
        const publicKey = options?.publicKey;
        const extensions = publicKey?.extensions as Record<string, unknown> | undefined;
        if (!publicKey || !extensions) return options;
        const next = { ...extensions };
        delete next.prf;
        return { ...options, publicKey: { ...publicKey, extensions: next } };
      }

      function withPrf(credential: PublicKeyCredential | null): PublicKeyCredential | null {
        if (!credential || typeof credential.getClientExtensionResults !== 'function') return credential;
        const nativeResults = credential.getClientExtensionResults.bind(credential);
        const report = () => {
          const results = nativeResults() as { prf?: { results?: { first?: BufferSource } } };
          if (results.prf?.results?.first) return results;
          return { ...results, prf: { results: { first: new Uint8Array(prf) } } };
        };
        credential.getClientExtensionResults = report as PublicKeyCredential['getClientExtensionResults'];
        return credential;
      }

      credentials.create = (async (options?: CredentialCreationOptions) => {
        const created = (await nativeCreate(
          withoutPrf(options) as CredentialCreationOptions,
        )) as PublicKeyCredential | null;
        return withPrf(created);
      }) as CredentialContainer['create'];

      credentials.get = (async (options?: CredentialRequestOptions) => {
        const asserted = (await nativeGet(
          withoutPrf(options) as CredentialRequestOptions,
        )) as PublicKeyCredential | null;
        return withPrf(asserted);
      }) as CredentialContainer['get'];
    }

    const webAuthn = window.PublicKeyCredential as
      { getClientCapabilities?: () => Promise<Record<string, boolean>> } | undefined;
    const readCapabilities = webAuthn?.getClientCapabilities?.bind(webAuthn);
    if (webAuthn && readCapabilities) {
      webAuthn.getClientCapabilities = async () => {
        const capabilities = await readCapabilities();
        if (capabilities['extension:prf'] === false) capabilities['extension:prf'] = true;
        return capabilities;
      };
    }

    try {
      Object.defineProperty(navigator, 'userActivation', {
        configurable: true,
        get: () => ({ isActive: true, hasBeenActive: true }),
      });
    } catch {
      // The click's own activation still applies when the browser refuses the override.
    }
  });

  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
  });
}

/**
 * The ceremony has to run on the loc relying party. Other specs stay on `http://frontend`.
 * This forwarder exists only for the passkey page.
 */
export async function ensurePasskeyPage(): Promise<void> {
  if (await portOpen(3001)) return;
  await new Promise<void>((resolve, reject) => {
    const child = spawn('socat', ['TCP-LISTEN:3001,bind=127.0.0.1,fork,reuseaddr', 'TCP:frontend:80'], {
      stdio: 'ignore',
      detached: true,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await portOpen(3001)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('The passkey page forwarder is not listening on 127.0.0.1:3001');
}

/** `absent` means this API image has no passkey controller. Any other status must run the ceremony. */
export async function passkeyRegistrationRoute(): Promise<'absent' | 'present'> {
  const base = process.env.E2E_API_URL ?? 'http://api:3000';
  const response = await fetch(`${base}/v1/auth/passkey/register/begin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
  await response.arrayBuffer();
  if (response.status === 404) return 'absent';
  return 'present';
}

/**
 * Synchronize creates the wallet table and does not run the passkey wallet migration.
 * Copy the default wallet's compliance columns and name the row the API looks up.
 * Returns the new wallet id, or undefined when the row already exists and must not be tracked.
 */
export async function ensurePasskeyWallet(): Promise<number | undefined> {
  const existing = await queryOne<{ id: number }>(`SELECT id FROM wallet WHERE name = $1`, ['DFX Passkey']);
  if (existing) return undefined;

  const columns = await queryRows<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'wallet' AND column_name <> 'id'
     ORDER BY ordinal_position`,
  );
  const names = columns.map((row) => row.column_name);
  if (!names.includes('name') || !names.includes('displayName') || !names.includes('autoTradeApproval')) {
    throw new Error('wallet table is missing name, displayName or autoTradeApproval');
  }

  const quoted = names.map((name) => `"${name.replace(/"/g, '')}"`);
  const selected = names.map((name) => {
    if (name === 'name' || name === 'displayName') return `'DFX Passkey'`;
    if (name === 'autoTradeApproval') return 'true';
    if (name === 'ownerId' || name === 'address') return 'NULL';
    if (name === 'created' || name === 'updated') return 'NOW()';
    return `"${name.replace(/"/g, '')}"`;
  });
  const inserted = await queryRows<{ id: number }>(
    `INSERT INTO wallet (${quoted.join(', ')}) SELECT ${selected.join(', ')} FROM wallet WHERE id = 1 RETURNING id`,
  );
  const id = inserted[0]?.id;
  if (typeof id !== 'number') throw new Error('passkey wallet insert returned no id');
  return id;
}
