// DFX App 2.0 — Alby / WebLN (Lightning) wallet adapter.
//
// Ports the static preview's connectAlby() (public/app2/index.html, ~line 3207)
// and the main app's alby.hook.ts onto app2's connect -> address / sign
// contract. Two login shapes, matching production:
//   • self-custodial node (WebLN exposes node.pubkey) → sign in as
//     `LNNID<pubkey>` and prove ownership with `webln.signMessage`.
//   • hosted getalby.com account (can't sign locally) → hand off to the DFX
//     Alby OAuth endpoint, which logs the user in and returns `?session=<jwt>`;
//     the session bootstrap in session.tsx consumes it on return.
//
// NOTE: could not be exercised end-to-end locally (no Alby extension in the test
// browser). Logic mirrors the shipped hook/preview; a real-wallet pass is
// required before it is considered verified.

import type { GetInfoResponse, WebLNProvider } from 'webln';
import { AuthWalletType } from '@dfx.swiss/react';
import { WalletConnectorError } from './providers';

/** A connected self-custodial Lightning wallet: the LNNID address plus a signer. */
export interface AlbyLightningSession {
  address: string;
  sign: (message: string) => Promise<string>;
}

/** How the caller should proceed after {@link connectAlby}: either a local
 * sign-in session, or a full-page redirect already under way (hosted Alby). */
export type AlbyConnectResult = { kind: 'session'; session: AlbyLightningSession } | { kind: 'redirected' };

interface AlbyRedirectContext {
  /** `useApi().defaultUrl` — the versioned API base, e.g. https://api.dfx.swiss/v1. */
  apiBaseUrl: string;
  /** Partner wallet id / referral, forwarded onto the OAuth call like the main app. */
  wallet?: string;
  usedRef?: string;
}

function getWebln(): WebLNProvider | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as { webln?: WebLNProvider }).webln;
}

function isUserRejection(error: unknown): boolean {
  const message = String((error as { message?: unknown } | undefined)?.message ?? error ?? '');
  return /reject|cancel|denied|permission/i.test(message);
}

/** Enables WebLN and either returns a local Lightning session or triggers the
 * hosted-Alby OAuth redirect. Throws WalletConnectorError on failure. */
export async function connectAlby(redirect: AlbyRedirectContext): Promise<AlbyConnectResult> {
  const webln = getWebln();
  if (!webln) throw new WalletConnectorError('Alby not detected', 'not-installed');

  let info: GetInfoResponse;
  try {
    await webln.enable();
    info = await webln.getInfo();
  } catch (error) {
    if (isUserRejection(error)) throw new WalletConnectorError('Connection cancelled', 'rejected');
    throw new WalletConnectorError('Alby connection failed', 'failed');
  }

  const pubkey = info?.node?.pubkey;
  if (pubkey) {
    const address = 'LNNID' + String(pubkey).toUpperCase();
    return {
      kind: 'session',
      session: {
        address,
        sign: async (message: string) => {
          try {
            return (await webln.signMessage(message)).signature;
          } catch (error) {
            if (isUserRejection(error)) throw new WalletConnectorError('Signature cancelled', 'rejected');
            throw new WalletConnectorError('Alby signing failed', 'failed');
          }
        },
      },
    };
  }

  const alias = info?.node?.alias ?? '';
  if (alias === 'getalby.com' || alias.endsWith('.getalby.com')) {
    // Hosted Alby accounts can't sign locally — hand off to the DFX Alby OAuth
    // page, which returns `?session=<jwt>` to the redirectUri we pass.
    const returnUrl = new URL(window.location.href);
    returnUrl.searchParams.set('type', AuthWalletType.ALBY);
    const params = new URLSearchParams({ redirectUri: returnUrl.toString() });
    if (redirect.wallet) params.set('wallet', redirect.wallet);
    if (redirect.usedRef) params.set('usedRef', redirect.usedRef);
    window.location.href = `${redirect.apiBaseUrl.replace(/\/$/, '')}/auth/alby?${params.toString()}`;
    return { kind: 'redirected' };
  }

  throw new WalletConnectorError('No Alby login method found', 'failed');
}
