import { RP_IDS, type PlatformReport, type WalletEnv } from '@dfx.swiss/wallet';

const STG_HOST = 'stg.app.dfx.swiss';

export const PASSKEY_PLATFORM_BLOCK = 'This browser has no passkey support';
export const PASSKEY_GENERIC_ERROR = 'Something went wrong. Please try again.';
export const PASSKEY_LOGIN_HEADING = 'Log in with your device';
export const PASSKEY_PREPARING = 'Preparing your login…';
export const PASSKEY_CHOICE_HEADING = 'Do you already have an account?';
export const PASSKEY_EXISTING = 'Log in with existing account';
export const PASSKEY_CREATE = 'Open a new account';
export const PASSKEY_RETRY = 'Try again';
export const PASSKEY_EMAIL_HEADING = 'Your email';
export const PASSKEY_EMAIL_BODY = 'This email is saved with the new passkey account.';
export const PASSKEY_EMAIL_CONTINUE = 'Continue';
export const PASSKEY_UNKNOWN_HEADING = 'This passkey is not an account';
export const PASSKEY_UNKNOWN_BODY =
  'This device offered a passkey that DFX does not recognize. Open a new account. If the device offers that same passkey again, delete the saved DFX passkey in your password settings, then try again.';
export const PASSKEY_IN_APP_HEADING = 'Open this page in your browser';
export const PASSKEY_IN_APP_BODY =
  'Passkeys do not work inside Telegram or other in-app browsers. Open this page in Safari or Chrome to log in.';
export const PASSKEY_IN_APP_IOS = "On iPhone, you'll find the compass or Safari icon at the top right.";
export const PASSKEY_OPEN_BROWSER = 'Open in browser';
export const PASSKEY_COPY_LINK = 'Copy link';
export const PASSKEY_LINK_COPIED = 'Copied';
export const PASSKEY_PRF_UNSUPPORTED = 'This passkey cannot hold a wallet on this device.';

export type PasskeyPlatformView = 'pending' | 'in-app' | 'os-old' | 'blocked' | 'ready';

function errorRecord(error: unknown): Record<string, unknown> | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  return error as Record<string, unknown>;
}

// Host of this page, mapped onto the wallet package's relying-party environments. Staging is its own
// relying party only when the installed package lists that host. An older package has no such entry, so
// the host stays on the production check and the platform report stays unavailable.
export function walletEnvForHost(hostname: string): WalletEnv {
  if (hostname === RP_IDS.loc || hostname === '127.0.0.1') return 'loc';
  if (hostname === RP_IDS.dev) return 'dev';
  if (hostname === STG_HOST && RP_IDS['stg' as WalletEnv] === STG_HOST) return 'stg' as WalletEnv;
  return 'prd';
}

// One sentence for every unavailable reason. The ceremony does not start when the platform cannot run it.
export function passkeyPlatformBlock(report: PlatformReport | undefined): string | undefined {
  if (!report || report.available || !report.reason) return undefined;
  return PASSKEY_PLATFORM_BLOCK;
}

export function passkeyOsTooOld(os: string | undefined): { key: string; version?: string } {
  const trimmed = (os ?? '').trim();
  if (trimmed === '') return { key: 'This operating system cannot sign in with a passkey.' };
  return { key: 'This operating system ({{version}}) cannot sign in with a passkey.', version: trimmed };
}

export function passkeyDismissed(error: unknown): boolean {
  const record = errorRecord(error);
  if (!record) return false;
  return record.name === 'NotAllowedError' || record.name === 'AbortError' || record.code === 'ceremony-cancelled';
}

export function passkeyUnknownCredential(error: unknown): boolean {
  const record = errorRecord(error);
  if (!record) return false;
  const message = typeof record.message === 'string' ? record.message.toLowerCase() : '';
  const code = typeof record.code === 'string' ? record.code.toLowerCase() : '';
  return (
    message.includes('unknown credential') ||
    code.includes('unknown credential') ||
    record.code === 'UnknownCredential'
  );
}

export function passkeyPrfUnsupported(error: unknown): boolean {
  const record = errorRecord(error);
  if (!record) return false;
  if (record.code === 'prf-unavailable') return true;
  return typeof record.message === 'string' && record.message.toLowerCase().includes('no prf');
}

export function passkeyShowIosHint(userAgent: string): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent);
}

export function passkeyPlatformView(report: PlatformReport | undefined): PasskeyPlatformView {
  if (report === undefined) return 'pending';
  if (report.reason === 'in-app-browser') return 'in-app';
  if (report.reason === 'os-too-old') return 'os-old';
  if (!report.available) return 'blocked';
  return 'ready';
}

export function passkeyMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') return error.message;
  return PASSKEY_GENERIC_ERROR;
}
