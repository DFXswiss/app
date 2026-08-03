import { jwtDecode } from 'jwt-decode';

/** Same storage key as the main app / @dfx.swiss store. */
export const AUTH_TOKEN_KEY = 'dfx.authenticationToken';

/**
 * Company JWT payload (API generateCompanyToken).
 * `user` is the wallet id; there is no wallet name on the token.
 */
export interface PartnerJwt {
  exp?: number;
  iat?: number;
  address?: string;
  user?: number;
  role?: string;
  ip?: string;
}

export function readAuthToken(): string | null {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeAuthToken(token: string): void {
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  try {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // storage blocked
  }
}

export function decodePartnerToken(token: string): PartnerJwt | null {
  try {
    return jwtDecode<PartnerJwt>(token);
  } catch {
    return null;
  }
}

/** True when the JWT decodes and is not expired (with a 30s clock skew). */
export function isTokenValid(token: string | null | undefined): boolean {
  if (!token) return false;
  const payload = decodePartnerToken(token);
  if (!payload) return false;
  if (typeof payload.exp !== 'number') {
    // Company tokens always carry exp; missing exp is treated as invalid.
    return false;
  }
  const skewMs = 30_000;
  return payload.exp * 1000 > Date.now() - skewMs;
}

export function shortAddress(address: string | undefined | null): string {
  if (!address) return 'Partner';
  const a = address.trim();
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
