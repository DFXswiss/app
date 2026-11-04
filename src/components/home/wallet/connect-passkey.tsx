import { useAuthContext, useSessionContext } from '@dfx.swiss/react';
import { StyledButton, StyledButtonColor, StyledButtonWidth, StyledVerticalStack } from '@dfx.swiss/react-components';
import { checkPasskeyPlatform, type AuthResult, type PlatformReport } from '@dfx.swiss/wallet';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSettingsContext } from '../../../contexts/settings.context';
import { useWalletContext, WalletType } from '../../../contexts/wallet.context';
import { ConnectProps } from '../connect-shared';
import PasskeyDesk from './passkey-desk';
import {
  createPasskeyClients,
  passkeyMessage,
  passkeyPlatformBlock,
  PASSKEY_NO_ACCOUNT,
  walletEnvForHost,
} from './passkey-host';
import { getOpenPasskey, setOpenPasskey, subscribeOpenPasskey } from './passkey-session';

export { passkeyPlatformBlock, walletEnvForHost };

function isMail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// Register, log in and claim on the page host, then keep the account in this tab so the rest of the
// merged passkey routes can be tried. The tile stays behind ?feature=Passkey. Opening the app is separate.
export default function ConnectPasskey(props: ConnectProps): JSX.Element {
  const { isConnect, onLogin, onCancel }: ConnectProps = props;
  const { translate } = useSettingsContext();
  const { setSession } = useWalletContext();
  const { logout } = useSessionContext();
  const { getAuthToken } = useAuthContext();
  const open = useSyncExternalStore(subscribeOpenPasskey, getOpenPasskey, getOpenPasskey);
  const [report, setReport] = useState<PlatformReport | undefined>();
  const [mail, setMail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
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

  async function remember(result: AuthResult, endPreviousSession: boolean): Promise<void> {
    if (endPreviousSession && !isConnect) await logout();
    setOpenPasskey(result);
  }

  async function run(action: () => Promise<void>): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await action();
    } catch (caught) {
      setError(passkeyMessage(caught));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function openApp(): Promise<void> {
    if (busyRef.current) return;
    const session = getOpenPasskey();
    if (!session) return;
    busyRef.current = true;
    setError(undefined);
    try {
      await setSession(session.accessToken, WalletType.PASSKEY);
      onLogin();
      // The ceremony does not reload the page, so the connect step has to be left here.
      onCancel();
    } catch (caught) {
      setError(passkeyMessage(caught));
    } finally {
      busyRef.current = false;
    }
  }

  async function onRegister(): Promise<void> {
    const address = mail.trim();
    if (!isMail(address)) return;
    await run(async () => {
      const result = await createPasskeyClients().auth.register({ mail: address });
      await remember(result, true);
    });
  }

  async function onLoginWithPasskey(): Promise<void> {
    await run(async () => {
      const result = await createPasskeyClients().auth.login();
      await remember(result, true);
    });
  }

  async function onClaim(): Promise<void> {
    const token = getAuthToken();
    if (!token) {
      setError(PASSKEY_NO_ACCOUNT);
      setNotice(undefined);
      return;
    }
    await run(async () => {
      const result = await createPasskeyClients().auth.claim(token);
      await remember(result, false);
    });
  }

  if (open) {
    return (
      <StyledVerticalStack gap={2} center>
        {error ? <p className="text-dfxRed-150">{translate('screens/home', error)}</p> : null}
        <PasskeyDesk
          onOpenApp={() => void openApp()}
          onCancel={onCancel}
          onRevoked={() => setNotice('The passkey wallet was revoked.')}
        />
      </StyledVerticalStack>
    );
  }

  const block = passkeyPlatformBlock(report);

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

      {notice ? <p className="text-dfxGray-700">{translate('screens/home', notice)}</p> : null}
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
        onClick={() => void onLoginWithPasskey()}
        disabled={busy}
      />
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.GRAY}
        label={translate('screens/home', 'Add passkey to this account')}
        onClick={() => void onClaim()}
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
