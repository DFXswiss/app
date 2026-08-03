import { FormEvent, useState } from 'react';
import { PARTNER_PROGRAM_NAME } from 'src/config/partner-dashboard.config';
import { DfxLogo } from 'src/partner-dashboard/logos/dfx-logo';
import { usePartnerTranslation } from 'src/partner-dashboard/util/i18n';
import { PartnerLanguage, PartnerTheme } from 'src/partner-dashboard/util/theme';

export interface LoginScreenProps {
  theme: PartnerTheme;
  onThemeChange: (theme: PartnerTheme) => void;
  language: PartnerLanguage;
  onLanguageChange: (lang: PartnerLanguage) => void;
  requestChallenge: (address: string) => Promise<string>;
  signIn: (address: string, signature: string, key?: string) => Promise<void>;
}

/**
 * Neutral DFX-only login. No partner name, logo, or metrics — those appear only after auth.
 *
 * Flow: address → challenge → sign challenge offline → paste signature → sign in.
 * (Company path: GET /auth/challenge then POST /auth/signIn; see partner-auth.hook.)
 */
export function LoginScreen({
  theme,
  onThemeChange,
  language,
  onLanguageChange,
  requestChallenge,
  signIn,
}: LoginScreenProps): JSX.Element {
  const { translate } = usePartnerTranslation();
  const [address, setAddress] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [signature, setSignature] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRequestChallenge(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    setChallenge(null);
    try {
      const msg = await requestChallenge(address);
      setChallenge(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('Sign-in failed.'));
    } finally {
      setBusy(false);
    }
  }

  async function onSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(address, signature, key || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('Sign-in failed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-3 sm:px-4 py-10 space-y-6" data-testid="partner-login">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p
          className="text-2xs font-medium uppercase tracking-[0.18em] partner-text-tertiary"
          data-testid="login-program-name"
        >
          {PARTNER_PROGRAM_NAME}
        </p>
        <div className="flex flex-wrap items-center gap-2 ml-auto" data-testid="partner-switchers">
          <div className="partner-switcher" role="group" aria-label={translate('Theme')}>
            <button
              type="button"
              aria-pressed={theme === 'light'}
              onClick={() => onThemeChange('light')}
              data-testid="theme-light"
            >
              {translate('Light')}
            </button>
            <button
              type="button"
              aria-pressed={theme === 'dark'}
              onClick={() => onThemeChange('dark')}
              data-testid="theme-dark"
            >
              {translate('Dark')}
            </button>
          </div>
          <div className="partner-switcher" role="group" aria-label={translate('Language')}>
            <button
              type="button"
              aria-pressed={language === 'de'}
              onClick={() => onLanguageChange('de')}
              data-testid="lang-de"
            >
              DE
            </button>
            <button
              type="button"
              aria-pressed={language === 'en'}
              onClick={() => onLanguageChange('en')}
              data-testid="lang-en"
            >
              EN
            </button>
          </div>
        </div>
      </div>

      <div className="partner-card space-y-5">
        <div className="flex items-center gap-3" data-testid="login-brand">
          <DfxLogo className="h-8 w-auto" title="DFX" />
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
            {translate('Sign in')}
          </h1>
        </div>
        <p className="text-sm partner-text-secondary" data-testid="login-hint">
          {translate(
            'Enter the partner wallet address, request a challenge, sign it with your wallet, then paste the signature.',
          )}
        </p>

        <form className="space-y-3" onSubmit={challenge ? onSignIn : onRequestChallenge}>
          <label className="block space-y-1">
            <span className="text-2xs font-medium uppercase tracking-wide partner-text-tertiary">
              {translate('Wallet address')}
            </span>
            <input
              type="text"
              name="address"
              autoComplete="off"
              spellCheck={false}
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setChallenge(null);
              }}
              className="partner-input w-full"
              data-testid="login-address"
              disabled={busy}
              required
            />
          </label>

          {challenge && (
            <>
              <label className="block space-y-1">
                <span className="text-2xs font-medium uppercase tracking-wide partner-text-tertiary">
                  {translate('Challenge to sign')}
                </span>
                <textarea
                  readOnly
                  value={challenge}
                  rows={3}
                  className="partner-input w-full font-mono text-xs"
                  data-testid="login-challenge"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-2xs font-medium uppercase tracking-wide partner-text-tertiary">
                  {translate('Signature')}
                </span>
                <textarea
                  name="signature"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  rows={3}
                  className="partner-input w-full font-mono text-xs"
                  data-testid="login-signature"
                  disabled={busy}
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="text-2xs font-medium uppercase tracking-wide partner-text-tertiary">
                  {translate('Public key (optional)')}
                </span>
                <input
                  type="text"
                  name="key"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  className="partner-input w-full font-mono text-xs"
                  data-testid="login-key"
                  disabled={busy}
                  autoComplete="off"
                />
              </label>
            </>
          )}

          {error && (
            <p className="text-sm partner-error-text" data-testid="login-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="partner-btn-primary w-full px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            data-testid={challenge ? 'login-submit' : 'login-challenge-btn'}
            disabled={busy || !address.trim() || (challenge != null && !signature.trim())}
          >
            {busy
              ? translate('Please wait…')
              : challenge
                ? translate('Sign in')
                : translate('Request challenge')}
          </button>
        </form>
      </div>
    </div>
  );
}
