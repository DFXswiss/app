import { StyledButton, StyledButtonColor, StyledButtonWidth, StyledVerticalStack } from '@dfx.swiss/react-components';
import { checkPasskeyPlatform, openInSystemBrowser, type PlatformReport } from '@dfx.swiss/wallet';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSettingsContext } from '../../../contexts/settings.context';
import { ConnectProps } from '../connect-shared';
import { useNavigation } from '../../../hooks/navigation.hook';
import PasskeyDesk from './passkey-desk';
import type { ReceiveFamily } from './passkey-transfer';
import type { PasskeyHistory } from './passkey-wallet-history';
import {
  passkeyDismissed,
  passkeyOsTooOld,
  passkeyPlatformBlock,
  passkeyPlatformView,
  passkeyPrfUnsupported,
  passkeyShowIosHint,
  passkeyUnknownCredential,
  PASSKEY_CHOICE_HEADING,
  PASSKEY_COPY_LINK,
  PASSKEY_CREATE,
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
import { getOpenPasskey, setOpenPasskey, subscribeOpenPasskey, type OpenPasskey } from './passkey-session';
import { createWalletClient } from './wallet-client';

export { passkeyPlatformBlock, walletEnvForHost };

type SheetView = 'idle' | 'choice' | 'unknown' | 'error';
type CeremonyEntry = 'login' | 'authenticate' | 'register';

const PASSKEY_DID_NOT_UNLOCK =
  'This passkey did not unlock the wallet. Please try again with the passkey of this wallet.';

declare global {
  interface Window {
    __dfxHandbookPasskeyHistory?: PasskeyHistory;
    __dfxHandbookPasskeyBalance?: { chf: number; eur: number };
    __dfxHandbookPasskeyAssets?: { name: string; amount: string; chf: number; eur: number; network?: string }[];
    __dfxHandbookPasskeyReceiveError?: ReceiveFamily;
  }
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
// stays behind ?feature=Passkey.
export default function ConnectPasskey(props: ConnectProps): JSX.Element {
  const { onCancel }: ConnectProps = props;
  const { translate } = useSettingsContext();
  const { navigate } = useNavigation();
  const open = useSyncExternalStore(subscribeOpenPasskey, getOpenPasskey, getOpenPasskey);
  const [report, setReport] = useState<PlatformReport | undefined>();
  const [busy, setBusy] = useState(false);
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

  // A wallet-api session without an unlocked key ring cannot open the wallet; it is dropped.
  function remember(result: OpenPasskey, initialSession: OpenPasskey | undefined): void {
    if (abandonedRef.current || getOpenPasskey() !== initialSession) {
      result.keys?.wipe();
      return;
    }
    if (!result.keys) {
      setSheetError(PASSKEY_DID_NOT_UNLOCK);
      return;
    }
    setOpenPasskey(result);
  }

  function applyCeremonyError(nextEntry: CeremonyEntry, caught: unknown): void {
    if (passkeyDismissed(caught)) {
      if (nextEntry === 'login' && unknownOfferedRef.current) {
        setView('unknown');
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

  async function run(
    nextEntry: CeremonyEntry,
    action: (initialSession: OpenPasskey | undefined) => Promise<void>,
  ): Promise<void> {
    if (busyRef.current) return;
    const initialSession = getOpenPasskey();
    busyRef.current = true;
    setBusy(true);
    setEntry(nextEntry);
    setNotice(undefined);
    setSheetError(undefined);
    try {
      await action(initialSession);
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

  function startLogin(): void {
    void run('login', async (initialSession) => {
      remember(await createWalletClient().login(), initialSession);
    });
  }

  function startAuthenticate(): void {
    void run('authenticate', async (initialSession) => {
      remember(await createWalletClient().login(), initialSession);
    });
  }

  // wallet-api registers the passkey without an e-mail. The DFX account asks for it during buy or KYC.
  function startRegister(): void {
    void run('register', async (initialSession) => {
      remember(await createWalletClient().register(), initialSession);
    });
  }

  function retryError(): void {
    if (entry === 'register') {
      startRegister();
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
      <StyledVerticalStack gap={2} center full>
        <PasskeyDesk
          onHome={() => navigate('/')}
          balance={process.env.NODE_ENV === 'production' ? undefined : window.__dfxHandbookPasskeyBalance}
          assets={process.env.NODE_ENV === 'production' ? undefined : window.__dfxHandbookPasskeyAssets}
          history={process.env.NODE_ENV === 'production' ? undefined : window.__dfxHandbookPasskeyHistory}
          receiveError={process.env.NODE_ENV === 'production' ? undefined : window.__dfxHandbookPasskeyReceiveError}
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
    const osHint = passkeyOsTooOld(os);
    return (
      <StyledVerticalStack gap={2} center>
        <p role="status" className="text-center text-dfxGray-700">
          {translate(
            'screens/home',
            osHint.key,
            osHint.version === undefined ? undefined : { version: osHint.version },
          )}
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
          onClick={() => startRegister()}
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
          onClick={() => startRegister()}
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
      {sheetError ? (
        <p role="alert" className="text-center text-dfxRed-150">
          {translate('screens/home', sheetError)}
        </p>
      ) : null}
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
