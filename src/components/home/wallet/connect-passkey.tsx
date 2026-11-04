import { DfxApiClient } from '@dfx.swiss/core';
import { useSessionContext } from '@dfx.swiss/react';
import { StyledButton, StyledButtonColor, StyledButtonWidth, StyledVerticalStack } from '@dfx.swiss/react-components';
import {
  PasskeyAuth,
  PasskeyCeremonies,
  checkPasskeyPlatform,
  RP_IDS,
  type AuthResult,
  type PlatformReport,
  type WalletEnv,
} from '@dfx.swiss/wallet';
import { useEffect, useRef, useState } from 'react';
import { Api } from '../../../config/api';
import { useSettingsContext } from '../../../contexts/settings.context';
import { useWalletContext, WalletType } from '../../../contexts/wallet.context';
import { ConnectProps } from '../connect-shared';

const STG_HOST = 'stg.app.dfx.swiss';
const PLATFORM_BLOCK = 'This browser has no passkey support';
const GENERIC_ERROR = 'Something went wrong. Please try again.';
const LOCKED = 'This passkey did not unlock the wallet';
const SEED_MISMATCH = 'This passkey does not match the wallet';

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
  return PLATFORM_BLOCK;
}

function isMail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') return error.message;
  return GENERIC_ERROR;
}

function passkeyAuthForThisPage(): PasskeyAuth {
  const env = walletEnvForHost(window.location.hostname);
  const api = new DfxApiClient({ apiUrl: `${Api.url.replace(/\/$/, '')}/${Api.version}` });
  return new PasskeyAuth({ api, ceremonies: new PasskeyCeremonies(env), env });
}

// Register and log in on the page host. The tile stays behind ?feature=Passkey. A browser that cannot run
// the ceremony keeps the disabled placeholder.
export default function ConnectPasskey(props: ConnectProps): JSX.Element {
  const { isConnect, onLogin, onCancel }: ConnectProps = props;
  const { translate } = useSettingsContext();
  const { setSession } = useWalletContext();
  const { logout } = useSessionContext();
  const [report, setReport] = useState<PlatformReport | undefined>();
  const [mail, setMail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void checkPasskeyPlatform(walletEnvForHost(window.location.hostname)).then((next) => {
      if (!cancelled) setReport(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const block = passkeyPlatformBlock(report);

  async function finish(result: AuthResult): Promise<void> {
    if (result.state === 'seed-mismatch') {
      setError(SEED_MISMATCH);
      return;
    }
    if (result.state !== 'unlocked') {
      setError(LOCKED);
      return;
    }
    if (!isConnect) await logout();
    await setSession(result.accessToken, WalletType.PASSKEY);
    onLogin();
  }

  async function run(action: (auth: PasskeyAuth) => Promise<AuthResult>): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await finish(await action(passkeyAuthForThisPage()));
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function onRegister(): Promise<void> {
    const address = mail.trim();
    if (!isMail(address)) return;
    await run((auth) => auth.register({ mail: address }));
  }

  if (!report?.available) {
    return (
      <StyledVerticalStack gap={2} center>
        <p className="text-dfxGray-700">{translate('screens/home', 'Passkey login arrives with the wallet beta')}</p>
        {block ? <p className="text-dfxGray-700">{translate('screens/home', block)}</p> : null}

        <StyledButton
          width={StyledButtonWidth.FULL}
          color={StyledButtonColor.GRAY}
          label={translate('screens/home', 'Passkey')}
          onClick={() => undefined}
          disabled
        />
        <StyledButton
          width={StyledButtonWidth.FULL}
          color={StyledButtonColor.RED}
          label={translate('general/actions', 'Close')}
          onClick={onCancel}
        />
      </StyledVerticalStack>
    );
  }

  const mailReady = isMail(mail);

  return (
    <StyledVerticalStack gap={2} center>
      <label className="w-full text-left text-dfxBlue-800" htmlFor="passkey-mail">
        {translate('screens/kyc', 'Email address')}
        <input
          id="passkey-mail"
          type="email"
          name="mail"
          autoComplete="email"
          value={mail}
          disabled={busy}
          placeholder={translate('screens/kyc', 'example@mail.com')}
          onChange={(event) => setMail(event.target.value)}
          className="mt-1 w-full rounded-md border border-dfxGray-500 p-4 text-base font-normal"
        />
      </label>

      {error ? <p className="text-dfxRed-150">{translate('screens/home', error)}</p> : null}

      <StyledButton
        width={StyledButtonWidth.FULL}
        label={translate('screens/home', 'Create passkey')}
        onClick={() => void onRegister()}
        disabled={busy || !mailReady}
      />
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.GRAY}
        label={translate('screens/home', 'Log in')}
        onClick={() => void run((auth) => auth.login())}
        disabled={busy}
      />
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.RED}
        label={translate('general/actions', 'Close')}
        onClick={onCancel}
      />
    </StyledVerticalStack>
  );
}
