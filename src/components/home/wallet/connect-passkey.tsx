import { Blockchain, useSessionContext } from '@dfx.swiss/react';
import { StyledButton, StyledButtonColor, StyledButtonWidth, StyledVerticalStack } from '@dfx.swiss/react-components';
import {
  checkPasskeyPlatform,
  LoginAutoSigner,
  openInSystemBrowser,
  type AuthResult,
  type PlatformReport,
} from '@dfx.swiss/wallet';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSettingsContext } from '../../../contexts/settings.context';
import { useWalletContext, WalletType } from '../../../contexts/wallet.context';
import { ConnectProps } from '../connect-shared';
import { useNavigation } from '../../../hooks/navigation.hook';
import PasskeyDesk from './passkey-desk';
import type { PasskeyHistory } from './passkey-wallet-history';
import {
  passkeyDismissed,
  passkeyMessage,
  passkeyOsTooOld,
  passkeyPlatformBlock,
  passkeyPlatformView,
  passkeyPrfUnsupported,
  passkeyShowIosHint,
  passkeyUnknownCredential,
  PASSKEY_CHOICE_HEADING,
  PASSKEY_COPY_LINK,
  PASSKEY_CREATE,
  PASSKEY_EMAIL_BODY,
  PASSKEY_EMAIL_CONTINUE,
  PASSKEY_EMAIL_HEADING,
  PASSKEY_EXISTING,
  PASSKEY_GENERIC_ERROR,
  PASSKEY_IN_APP_BODY,
  PASSKEY_IN_APP_HEADING,
  PASSKEY_IN_APP_IOS,
  PASSKEY_LINK_COPIED,
  PASSKEY_LOGIN_HEADING,
  PASSKEY_OPEN_BROWSER,
  PASSKEY_PLATFORM_BLOCK,
  PASSKEY_PREPARING,
  PASSKEY_PRF_UNSUPPORTED,
  PASSKEY_RETRY,
  PASSKEY_UNKNOWN_BODY,
  PASSKEY_UNKNOWN_HEADING,
  walletEnvForHost,
} from './passkey-host';
import { getOpenPasskey, setOpenPasskey, subscribeOpenPasskey } from './passkey-session';
import { createWalletClient } from './wallet-client';

export { passkeyPlatformBlock, walletEnvForHost };

type SheetView = 'idle' | 'choice' | 'email' | 'unknown' | 'error';
type CeremonyEntry = 'login' | 'authenticate' | 'register';

declare global {
  interface Window {
    __dfxHandbookPasskeyHistory?: PasskeyHistory;
  }
}

function isMail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function pageUrl(): string {
  const [beforeHash] = window.location.href.split('#');
  return beforeHash;
}

async function copyPageUrl(): Promise<boolean> {
  const url = pageUrl();
  const clipboard = navigator.clipboard;
  if (clipboard && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(url);
      return true;
    } catch {
      void 0;
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = url;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  try {
    textarea.select();
    return document.execCommand('copy');
  } finally {
    textarea.remove();
  }
}

// Register and log in on the page host, then keep the account in this tab so the rest of the
// merged passkey routes can be tried. /wallet opens this screen without a flag. The tile on /login
// stays behind ?feature=Passkey. Opening the app is separate.
export default function ConnectPasskey(props: ConnectProps): JSX.Element {
  const { isConnect, onCancel, onLogin }: ConnectProps = props;
  const { translate } = useSettingsContext();
  const { login } = useWalletContext();
  const { navigate } = useNavigation();
  const { logout } = useSessionContext();
  const open = useSyncExternalStore(subscribeOpenPasskey, getOpenPasskey, getOpenPasskey);
  const [report, setReport] = useState<PlatformReport | undefined>();
  const [mail, setMail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [view, setView] = useState<SheetView>('idle');
  const [entry, setEntry] = useState<CeremonyEntry>('login');
  const [sheetError, setSheetError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const busyRef = useRef(false);
  const unknownOfferedRef = useRef(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();
  const abandonedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void checkPasskeyPlatform(walletEnvForHost(window.location.hostname)).then((next) => {
      if (!cancelled) setReport(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      abandonedRef.current = true;
      if (copiedTimer.current !== undefined) clearTimeout(copiedTimer.current);
    };
  }, []);

  function markCopied(): void {
    if (copiedTimer.current !== undefined) clearTimeout(copiedTimer.current);
    setCopied(true);
    copiedTimer.current = setTimeout(() => {
      setCopied(false);
      copiedTimer.current = undefined;
    }, 1200);
  }

  async function remember(result: AuthResult, endPreviousSession: boolean): Promise<void> {
    if (abandonedRef.current) return;
    if (endPreviousSession && !isConnect) await logout();
    setOpenPasskey(result);
  }

  function applyCeremonyError(nextEntry: CeremonyEntry, caught: unknown): void {
    if (passkeyDismissed(caught)) {
      if (nextEntry === 'login' && unknownOfferedRef.current) {
        setView('unknown');
        return;
      }
      if (nextEntry === 'register') {
        setView('email');
        return;
      }
      setView('choice');
      return;
    }
    if (passkeyUnknownCredential(caught) && (nextEntry === 'login' || nextEntry === 'authenticate')) {
      unknownOfferedRef.current = true;
      setView('unknown');
      return;
    }
    if (passkeyPrfUnsupported(caught)) {
      setSheetError(PASSKEY_PRF_UNSUPPORTED);
      setView('error');
      return;
    }
    setSheetError(PASSKEY_GENERIC_ERROR);
    setView('error');
  }

  async function run(nextEntry: CeremonyEntry, action: () => Promise<void>): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setEntry(nextEntry);
    setError(undefined);
    setNotice(undefined);
    setSheetError(undefined);
    try {
      await action();
      if (abandonedRef.current) return;
      unknownOfferedRef.current = false;
      setView('idle');
    } catch (caught) {
      if (abandonedRef.current) return;
      applyCeremonyError(nextEntry, caught);
    } finally {
      busyRef.current = false;
      if (!abandonedRef.current) setBusy(false);
    }
  }

  async function openApp(path: '/buy' | '/sell' | '/swap'): Promise<void> {
    if (busyRef.current) return;
    const session = getOpenPasskey();
    if (!session || session.state !== 'unlocked' || !session.keys) return;
    const keys = session.keys;
    busyRef.current = true;
    setError(undefined);
    try {
      await login(WalletType.PASSKEY, keys.evm(0).address, Blockchain.ETHEREUM, async (address, message) =>
        new LoginAutoSigner(keys, walletEnvForHost(window.location.hostname)).sign('evm', address, message),
      );
      if (abandonedRef.current) return;
      if (isConnect) {
        onLogin();
        onCancel();
      } else {
        navigate(path);
      }
    } catch (caught) {
      setError(passkeyMessage(caught));
    } finally {
      busyRef.current = false;
    }
  }

  function startLogin(): void {
    void run('login', async () => {
      const result = await createWalletClient().login();
      await remember(result, true);
    });
  }

  function startAuthenticate(): void {
    void run('authenticate', async () => {
      const result = await createWalletClient().login();
      await remember(result, true);
    });
  }

  function startRegister(): void {
    const address = mail.trim();
    if (!isMail(address)) return;
    void run('register', async () => {
      const result = await createWalletClient().register({ mail: address });
      await remember(result, true);
    });
  }

  function openEmail(): void {
    setView('email');
  }

  function retryError(): void {
    if (entry === 'register') {
      setSheetError(undefined);
      setView('email');
      return;
    }
    if (entry === 'authenticate') {
      startAuthenticate();
      return;
    }
    startLogin();
  }

  async function onCopyLink(): Promise<void> {
    try {
      if (await copyPageUrl()) markCopied();
    } catch {
      return;
    }
  }

  function closeButton(): JSX.Element {
    return (
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.RED}
        label={translate('general/actions', 'Close')}
        onClick={onCancel}
      />
    );
  }

  function preparing(): JSX.Element {
    return (
      <StyledVerticalStack gap={2} center>
        <p role="status" className="text-center text-dfxGray-700">
          {translate('screens/home', PASSKEY_PREPARING)}
        </p>
        {closeButton()}
      </StyledVerticalStack>
    );
  }

  if (open) {
    return (
      <StyledVerticalStack gap={2} center>
        {error ? <p className="text-dfxRed-150">{translate('screens/home', error)}</p> : null}
        <PasskeyDesk
          history={process.env.NODE_ENV === 'production' ? undefined : window.__dfxHandbookPasskeyHistory}
          onOpenApp={(path) => void openApp(path)}
          onCancel={onCancel}
          onRevoked={() => setNotice('The passkey wallet was revoked.')}
        />
      </StyledVerticalStack>
    );
  }

  if (busy) return preparing();

  const osValue = report === undefined ? undefined : (report as { os?: unknown }).os;
  const os = typeof osValue === 'string' ? osValue : undefined;
  const platform = passkeyPlatformView(report);

  if (platform === 'pending') return preparing();

  if (platform === 'in-app') {
    return (
      <StyledVerticalStack gap={2} center>
        <p className="text-center text-dfxBlue-800">{translate('screens/home', PASSKEY_IN_APP_HEADING)}</p>
        <p className="text-center text-dfxGray-700">{translate('screens/home', PASSKEY_IN_APP_BODY)}</p>
        {passkeyShowIosHint(navigator.userAgent) ? (
          <p className="text-center text-dfxGray-700">{translate('screens/home', PASSKEY_IN_APP_IOS)}</p>
        ) : null}
        <StyledButton
          width={StyledButtonWidth.FULL}
          label={translate('screens/home', PASSKEY_OPEN_BROWSER)}
          onClick={() => openInSystemBrowser(pageUrl())}
        />
        <StyledButton
          width={StyledButtonWidth.FULL}
          color={StyledButtonColor.GRAY}
          label={translate('screens/home', copied ? PASSKEY_LINK_COPIED : PASSKEY_COPY_LINK)}
          onClick={() => void onCopyLink()}
        />
      </StyledVerticalStack>
    );
  }

  if (platform === 'os-old') {
    return (
      <StyledVerticalStack gap={2} center>
        <p role="status" className="text-center text-dfxGray-700">
          {translate('screens/home', passkeyOsTooOld(os))}
        </p>
        {closeButton()}
      </StyledVerticalStack>
    );
  }

  if (platform === 'blocked') {
    return (
      <StyledVerticalStack gap={2} center>
        <p className="text-center text-dfxGray-700">{translate('screens/home', PASSKEY_PLATFORM_BLOCK)}</p>
        {closeButton()}
      </StyledVerticalStack>
    );
  }

  if (view === 'choice') {
    return (
      <StyledVerticalStack gap={2} center>
        <p className="text-center text-dfxBlue-800">{translate('screens/home', PASSKEY_CHOICE_HEADING)}</p>
        <StyledButton
          width={StyledButtonWidth.FULL}
          label={translate('screens/home', PASSKEY_EXISTING)}
          onClick={() => startAuthenticate()}
        />
        <StyledButton
          width={StyledButtonWidth.FULL}
          color={StyledButtonColor.GRAY}
          label={translate('screens/home', PASSKEY_CREATE)}
          onClick={() => openEmail()}
        />
      </StyledVerticalStack>
    );
  }

  if (view === 'email') {
    const mailReady = isMail(mail);
    return (
      <StyledVerticalStack gap={2} center>
        <p className="text-center text-dfxBlue-800">{translate('screens/home', PASSKEY_EMAIL_HEADING)}</p>
        <p className="text-center text-dfxGray-700">{translate('screens/home', PASSKEY_EMAIL_BODY)}</p>
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
        <StyledButton
          width={StyledButtonWidth.FULL}
          label={translate('screens/home', PASSKEY_EMAIL_CONTINUE)}
          onClick={() => startRegister()}
          disabled={!mailReady}
        />
      </StyledVerticalStack>
    );
  }

  if (view === 'unknown') {
    return (
      <StyledVerticalStack gap={2} center>
        <p className="text-center text-dfxBlue-800">{translate('screens/home', PASSKEY_UNKNOWN_HEADING)}</p>
        <p className="text-center text-dfxGray-700">{translate('screens/home', PASSKEY_UNKNOWN_BODY)}</p>
        <StyledButton
          width={StyledButtonWidth.FULL}
          label={translate('screens/home', PASSKEY_RETRY)}
          onClick={() => startLogin()}
        />
        <StyledButton
          width={StyledButtonWidth.FULL}
          color={StyledButtonColor.GRAY}
          label={translate('screens/home', PASSKEY_CREATE)}
          onClick={() => openEmail()}
        />
      </StyledVerticalStack>
    );
  }

  if (view === 'error') {
    const message = sheetError === PASSKEY_PRF_UNSUPPORTED ? PASSKEY_PRF_UNSUPPORTED : PASSKEY_GENERIC_ERROR;
    return (
      <StyledVerticalStack gap={2} center>
        <p role="alert" className="text-center text-dfxRed-150">
          {translate('screens/home', message)}
        </p>
        <StyledButton
          width={StyledButtonWidth.FULL}
          label={translate('screens/home', PASSKEY_RETRY)}
          onClick={() => retryError()}
        />
      </StyledVerticalStack>
    );
  }

  return (
    <StyledVerticalStack gap={2} center>
      <p className="text-center text-dfxBlue-800">{translate('screens/home', PASSKEY_LOGIN_HEADING)}</p>
      {notice ? <p className="text-dfxGray-700">{translate('screens/home', notice)}</p> : null}
      <StyledButton
        width={StyledButtonWidth.FULL}
        label={translate('screens/home', 'Log in')}
        onClick={() => startLogin()}
      />
    </StyledVerticalStack>
  );
}
