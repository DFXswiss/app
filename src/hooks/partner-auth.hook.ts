import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearAuthToken,
  decodePartnerToken,
  isTokenValid,
  PartnerJwt,
  readAuthToken,
  writeAuthToken,
} from 'src/partner-dashboard/util/auth';
import { isFixtureMode } from 'src/partner-dashboard/util/format';
import { partnerApiBase, partnerApiPost, PartnerApiError } from 'src/hooks/partner-dashboard.hook';

export interface PartnerAuthState {
  /** Fixture mode or a non-expired stored token. */
  isAuthenticated: boolean;
  isFixture: boolean;
  token: string | null;
  session: PartnerJwt | null;
  /** Request company challenge (must precede signIn for company path). */
  requestChallenge: (address: string) => Promise<string>;
  /** Sign in with address + signature of the challenge; stores the token. */
  signIn: (address: string, signature: string, key?: string) => Promise<void>;
  logout: () => void;
  /** Clear session after 401 / invalid token without throwing. */
  invalidateSession: () => void;
}

/**
 * Partner wallet auth without DfxContextProvider.
 *
 * The main app’s useAuth/useSessionContext require the full DFX provider tree
 * (API bootstrap, language/fiat/assets) and use the user signMessage path.
 * Company partners use GET /v1/auth/challenge + POST /v1/auth/signIn (challenge
 * presence selects companySignIn on the API). This hook mirrors that path with
 * standalone fetch — same token storage key as the main app.
 */
export function usePartnerAuth(): PartnerAuthState {
  const fixture = isFixtureMode();
  const [token, setToken] = useState<string | null>(() => {
    if (fixture) return null;
    const stored = readAuthToken();
    return isTokenValid(stored) ? stored : null;
  });

  // Drop expired / garbage tokens on mount (non-fixture only).
  useEffect(() => {
    if (fixture) return;
    const stored = readAuthToken();
    if (stored && !isTokenValid(stored)) {
      clearAuthToken();
      setToken(null);
    }
  }, [fixture]);

  const session = useMemo(() => {
    if (fixture || !token) return null;
    return decodePartnerToken(token);
  }, [fixture, token]);

  const isAuthenticated = fixture || isTokenValid(token);

  const invalidateSession = useCallback(() => {
    clearAuthToken();
    setToken(null);
  }, []);

  const logout = useCallback(() => {
    clearAuthToken();
    setToken(null);
  }, []);

  const requestChallenge = useCallback(async (address: string): Promise<string> => {
    const trimmed = address.trim();
    if (!trimmed) throw new Error('Address is required');
    const base = partnerApiBase();
    const url = `${base}/v1/auth/challenge?address=${encodeURIComponent(trimmed)}`;
    const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = (await response.json()) as { message?: string };
        if (body?.message) detail = body.message;
      } catch {
        // ignore
      }
      throw new PartnerApiError(response.status, detail || `Challenge failed (${response.status})`);
    }
    const data = (await response.json()) as { challenge?: string };
    if (!data.challenge) throw new Error('Challenge response missing challenge');
    return data.challenge;
  }, []);

  const signIn = useCallback(
    async (address: string, signature: string, key?: string): Promise<void> => {
      const trimmed = address.trim();
      const sig = signature.trim();
      if (!trimmed) throw new Error('Address is required');
      if (!sig) throw new Error('Signature is required');

      const body: Record<string, string> = { address: trimmed, signature: sig };
      if (key?.trim()) body.key = key.trim();

      const result = await partnerApiPost<{ accessToken: string }>('auth/signIn', body, {
        auth: false,
      });
      if (!result.accessToken) throw new Error('Sign-in response missing accessToken');
      if (!isTokenValid(result.accessToken)) {
        throw new Error('Received an invalid or expired token');
      }
      writeAuthToken(result.accessToken);
      setToken(result.accessToken);
    },
    [],
  );

  return useMemo(
    () => ({
      isAuthenticated,
      isFixture: fixture,
      token,
      session,
      requestChallenge,
      signIn,
      logout,
      invalidateSession,
    }),
    [isAuthenticated, fixture, token, session, requestChallenge, signIn, logout, invalidateSession],
  );
}
