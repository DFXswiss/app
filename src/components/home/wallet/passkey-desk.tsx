import type { PasskeyAddress, PasskeyDiagnosticParams, PasskeyWallet } from '@dfx.swiss/core';
import { StyledVerticalStack } from '@dfx.swiss/react-components';
import { checkPasskeyPlatform, KeyRing, passkeyDiagnostic, type PlatformReport } from '@dfx.swiss/wallet';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSettingsContext } from '../../../contexts/settings.context';
import {
  PASSKEY_BITCOIN_CONNECTED,
  PASSKEY_COPY_UNAVAILABLE,
  PASSKEY_GENERIC_ERROR,
  passkeyWalletError,
  walletEnvForHost,
} from './passkey-host';
import { credentialBytes } from './passkey-bytes';
import { createWalletClient, type WalletClient } from './wallet-client';
import {
  getOpenPasskey,
  sameSession,
  setOpenPasskey,
  setPasskeyCloseReason,
  subscribeOpenPasskey,
  type OpenPasskey,
} from './passkey-session';
import { PasskeyReceivePanel, PasskeySendPanel, receiveAddress, type ReceiveFamily } from './passkey-transfer';
import PasskeyWalletCard, { formatWalletAmount } from './passkey-wallet-card';
import PasskeyWalletActions, { WalletAction } from './passkey-wallet-actions';
import PasskeyWordsSheet, { type RecoveryPaths } from './passkey-words-sheet';
import PasskeyRevokeSheet from './passkey-revoke-sheet';
import PasskeySettingsSheet from './passkey-settings-sheet';
import PasskeySheet from './passkey-sheet';
import PasskeyWalletHistory, { PasskeyHistory } from './passkey-wallet-history';

const TOAST_DURATION_MS = 4000;
export const BITCOIN_LINK_TIMEOUT_MS = 15000;

type BitcoinLinkState = 'idle' | 'running' | 'failed';

export interface PasskeyDeskProps {
  balance?: { chf: number; eur: number };
  assets?: { name: string; amount: string; chf: number; eur: number; network?: string }[];
  history?: PasskeyHistory;
  onCancel: () => void;
  onHome?: () => void;
  onRevoked: () => void;
}

function canUseKeys(open: OpenPasskey): open is OpenPasskey & { keys: KeyRing } {
  return open.keys !== undefined;
}

function releaseNothing(): void {
  return undefined;
}

// The API accepts only the mainnet BIP-84 login address. A testnet receive key is a different address.
function bitcoinLoginRing(keys: KeyRing): { ring: KeyRing; release: () => void } {
  if (keys.bitcoinNetwork !== 'testnet4') return { ring: keys, release: releaseNothing };
  const ring = KeyRing.fromMnemonic(keys.mnemonic(), { bitcoinNetwork: 'mainnet' });
  return { ring, release: () => ring.wipe() };
}

function bitcoinAccountPath(path: string): string {
  return path.split('/').slice(0, -2).join('/');
}

function recoveryPaths(keys: KeyRing): RecoveryPaths {
  return {
    evm: keys.evm(0).path,
    bitcoin: bitcoinAccountPath(keys.bitcoinAddress(0, 1).path),
    spark: keys.sparkIdentity().path,
  };
}

function readReceive(family: ReceiveFamily): string {
  const session = getOpenPasskey();
  if (!session?.keys) throw new Error('locked');
  return receiveAddress(session.keys, family);
}

function diagnosticPrf(prf: PlatformReport['prf']): boolean | undefined {
  if (prf === 'yes') return true;
  if (prf === 'no') return false;
  return undefined;
}

async function readClientCapabilities(): Promise<Record<string, boolean> | undefined> {
  const credential = window.PublicKeyCredential as
    { getClientCapabilities?: () => Promise<Record<string, boolean>> } | undefined;
  if (credential === undefined) return undefined;
  if (typeof credential.getClientCapabilities !== 'function') return undefined;
  return credential.getClientCapabilities();
}

function diagnosticRecord(
  report: PlatformReport,
  capabilities: Record<string, boolean> | undefined,
): PasskeyDiagnosticParams {
  const prf = diagnosticPrf(report.prf);
  return passkeyDiagnostic({
    stage: 'Capability',
    outcome: 'completed',
    ...(prf === undefined ? {} : { prf }),
    ...(report.os === undefined ? {} : { os: report.os }),
    ...(capabilities === undefined ? {} : { clientCapabilities: capabilities }),
  }) as PasskeyDiagnosticParams;
}

// Keys stay in tab memory; existing account operations are exposed by the wallet interface.
export default function PasskeyDesk({
  onCancel,
  onHome = onCancel,
  onRevoked,
  balance,
  assets,
  history,
}: PasskeyDeskProps): JSX.Element {
  const { translate, locale } = useSettingsContext();
  const [currentSymbol, setCurrentSymbol] = useState<'CHF' | 'EUR'>(() => {
    try {
      return localStorage.getItem('dfx.wallet.currency') === 'EUR' ? 'EUR' : 'CHF';
    } catch {
      return 'CHF';
    }
  });
  const [expanded, setExpanded] = useState(false);
  const [sheet, setSheet] = useState<'settings' | 'words' | 'revoke' | 'receive' | 'send'>();
  const [toast, setToast] = useState<string>();
  const [revokeAcknowledged, setRevokeAcknowledged] = useState(false);
  const [reason, setReason] = useState<'Lost' | 'Compromised'>('Compromised');
  const [bitcoinLink, setBitcoinLink] = useState<BitcoinLinkState>('idle');
  const [statusOk, setStatusOk] = useState(false);
  const open = useSyncExternalStore(subscribeOpenPasskey, getOpenPasskey, getOpenPasskey);
  const [busy, setBusy] = useState(false);
  const [note, setNoteValue] = useState<string>();
  const [noteKind, setNoteKind] = useState<'message' | 'refresh' | 'status' | 'diagnostics' | 'receive'>('message');
  const [words, setWords] = useState<string[]>();
  const [checks, setChecks] = useState<{ family: string; address: string; matches: boolean }[]>();
  const busyRef = useRef(false);
  const mounted = useRef(false);
  const sheetRef = useRef<typeof sheet>();
  const sheetOrigin = useRef<HTMLElement | null>(null);
  const sheetGeneration = useRef(0);
  const wordsGeneration = useRef(0);
  const wordsKeys = useRef<KeyRing>();
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const linkTimer = useRef<ReturnType<typeof setTimeout>>();
  const linkGeneration = useRef(0);
  const loginReleases = useRef<Array<() => void>>([]);
  const noteKindRef = useRef(noteKind);

  function clearToastTimer(): void {
    if (toastTimer.current !== undefined) {
      clearTimeout(toastTimer.current);
      toastTimer.current = undefined;
    }
  }

  function clearLinkTimer(): void {
    if (linkTimer.current !== undefined) {
      clearTimeout(linkTimer.current);
      linkTimer.current = undefined;
    }
  }

  function releaseTrackedLoginRing(release: () => void): void {
    const index = loginReleases.current.indexOf(release);
    if (index < 0) return;
    loginReleases.current.splice(index, 1);
    release();
  }

  function releaseOutstandingLoginRings(): void {
    const pending = loginReleases.current.splice(0);
    for (const release of pending) release();
  }

  function displayToast(message: string): void {
    clearToastTimer();
    setToast(message);
    toastTimer.current = setTimeout(() => {
      toastTimer.current = undefined;
      setToast(undefined);
    }, TOAST_DURATION_MS);
  }

  function dismissToast(): void {
    clearToastTimer();
    setToast(undefined);
  }

  function setNote(
    message?: string,
    kind: 'message' | 'refresh' | 'status' | 'diagnostics' | 'receive' = 'message',
  ): void {
    noteKindRef.current = kind;
    setNoteValue(message);
    setNoteKind(kind);
  }

  function showMessage(message: string, kind: 'message' | 'link' = 'message'): void {
    if (kind === 'link') {
      displayToast(translate('screens/home', message));
      return;
    }
    const current = sheetRef.current;
    if (current === 'settings' || current === 'words' || current === 'revoke' || current === 'receive') {
      setNote(message);
    } else {
      displayToast(translate('screens/home', message));
    }
  }

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeOpenPasskey(() => {
      if (!wordsKeys.current) return;
      const current = getOpenPasskey();
      if (!current || current.keys !== wordsKeys.current) {
        wordsGeneration.current += 1;
        wordsKeys.current = undefined;
        setWords(undefined);
        if (sheetRef.current === 'words') {
          sheetGeneration.current += 1;
          sheetRef.current = undefined;
        }
        setSheet((currentSheet) => (currentSheet === 'words' ? undefined : currentSheet));
      }
    });
    return () => {
      mounted.current = false;
      sheetGeneration.current += 1;
      wordsGeneration.current += 1;
      wordsKeys.current = undefined;
      linkGeneration.current += 1;
      clearToastTimer();
      clearLinkTimer();
      releaseOutstandingLoginRings();
      unsubscribe();
    };
  }, []);

  async function run(
    action: (client: WalletClient, session: OpenPasskey, isCurrent: () => boolean) => Promise<void>,
  ): Promise<void> {
    const session = getOpenPasskey();
    if (!session || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNote(undefined);
    let generation = sheetGeneration.current;
    const isCurrent = () => generation === sheetGeneration.current;
    try {
      const result = action(createWalletClient(), session, isCurrent);
      generation = sheetGeneration.current;
      await result;
    } catch (caught) {
      if (!isCurrent()) return;
      const message = passkeyWalletError(caught);
      if (message === undefined) {
        if (sheetRef.current === 'words') {
          wordsGeneration.current += 1;
          wordsKeys.current = undefined;
          sheetGeneration.current += 1;
          sheetRef.current = undefined;
          setWords(undefined);
          setSheet(undefined);
          setNote(undefined);
        }
        return;
      }
      showMessage(message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function liveSession(session: OpenPasskey): OpenPasskey | undefined {
    const latest = getOpenPasskey();
    if (!mounted.current || !sameSession(latest, session)) return undefined;
    return latest;
  }

  function isLive(session: OpenPasskey): boolean {
    return liveSession(session) !== undefined;
  }

  function replaceWallet(wallet: PasskeyWallet, session: OpenPasskey): void {
    const latest = liveSession(session);
    if (latest) setOpenPasskey({ ...latest, wallet });
  }

  function markLink(session: OpenPasskey, next: BitcoinLinkState): void {
    if (!mounted.current) return;
    if (!sameSession(getOpenPasskey(), session)) {
      setBitcoinLink('idle');
      return;
    }
    setBitcoinLink(next);
  }

  function applyLinkedAddress(linkedAddress: PasskeyAddress, session: OpenPasskey): void {
    const latest = liveSession(session);
    if (latest === undefined) {
      if (mounted.current) setBitcoinLink('idle');
      return;
    }
    const present = latest.wallet.addresses.some(
      (item) => item.address === linkedAddress.address && item.family === linkedAddress.family,
    );
    const wallet = present
      ? latest.wallet
      : { ...latest.wallet, addresses: [...latest.wallet.addresses, linkedAddress] };
    replaceWallet(wallet, session);
    setBitcoinLink('idle');
  }

  async function linkBitcoin(
    client: WalletClient,
    keys: KeyRing,
    token: string,
    accountIndex: number,
  ): Promise<PasskeyAddress> {
    const login = bitcoinLoginRing(keys);
    loginReleases.current.push(login.release);
    try {
      const linked = await client.link('bitcoin', token, login.ring, accountIndex);
      return linked.address;
    } finally {
      releaseTrackedLoginRing(login.release);
    }
  }

  async function finishLink(
    client: WalletClient,
    session: OpenPasskey,
    isCurrent: () => boolean,
    address: PasskeyAddress,
    reportSuccess: boolean,
  ): Promise<void> {
    applyLinkedAddress(address, session);
    try {
      await refreshWallet(client, session, isCurrent, false);
    } catch {
      if (isLive(session)) showMessage(PASSKEY_GENERIC_ERROR);
      return;
    }
    if (reportSuccess && isCurrent() && sameSession(getOpenPasskey(), session)) {
      showMessage(PASSKEY_BITCOIN_CONNECTED, 'link');
    }
  }

  async function refreshWallet(
    client: WalletClient,
    session: OpenPasskey,
    isCurrent: () => boolean,
    reportCount: boolean,
  ): Promise<PasskeyWallet | undefined> {
    const list = await client.wallets(session.accessToken);
    const match = list.find((item) => item.id === session.wallet.id);
    if (match && match.status !== 'Active') {
      const current = getOpenPasskey();
      if (current && sameSession(current, session)) {
        current.keys?.wipe();
        setPasskeyCloseReason('blocked');
        setOpenPasskey(undefined);
      }
      return match;
    }
    if (match) replaceWallet(match, session);
    if (reportCount && isLive(session) && isCurrent()) {
      setNote(translate('screens/home', 'Wallets on this account: {{count}}.', { count: list.length }), 'refresh');
    }
    return match;
  }

  async function onLink(accountIndex: number, reportSuccess: boolean): Promise<void> {
    const session = getOpenPasskey();
    if (!session || !session.wallet || !canUseKeys(session)) return;
    const keys = session.keys;
    const token = session.accessToken;
    await run(async (client, original, isCurrent) => {
      const generation = ++linkGeneration.current;
      markLink(original, 'running');
      if (reportSuccess) {
        let address: PasskeyAddress;
        try {
          address = await linkBitcoin(client, keys, token, accountIndex);
        } catch (caught) {
          markLink(original, 'failed');
          throw caught;
        }
        await finishLink(client, original, isCurrent, address, true);
        return;
      }
      const work = linkBitcoin(client, keys, token, accountIndex).then(
        (address) => ({ ok: true as const, address }),
        () => ({ ok: false as const }),
      );
      const timeout = new Promise<'timeout'>((resolve) => {
        linkTimer.current = setTimeout(() => resolve('timeout'), BITCOIN_LINK_TIMEOUT_MS);
      });
      let outcome: 'timeout' | { ok: true; address: PasskeyAddress } | { ok: false };
      try {
        outcome = await Promise.race([work, timeout]);
      } finally {
        clearLinkTimer();
      }
      if (!mounted.current) return;
      if (outcome === 'timeout') {
        markLink(original, 'failed');
        void work.then((settled) => {
          if (!mounted.current || linkGeneration.current !== generation) return;
          if (!sameSession(getOpenPasskey(), original)) {
            setBitcoinLink('idle');
            return;
          }
          if (!settled.ok) return;
          applyLinkedAddress(settled.address, original);
        });
        return;
      }
      if (!outcome.ok) {
        markLink(original, 'failed');
        return;
      }
      await finishLink(client, original, isCurrent, outcome.address, false);
    });
  }

  async function onRevokeWithPasskey(reason: 'Lost' | 'Compromised'): Promise<void> {
    await run(async (client, session, isCurrent) => {
      const revoked = await client.revoke(reason, session.wallet.credentialId);
      if (revoked.status === 'Active') {
        if (isCurrent() && sameSession(getOpenPasskey(), session)) {
          setNote('The passkey was not blocked. Please try again.');
        }
        return;
      }
      const current = getOpenPasskey();
      if (current && sameSession(current, session)) {
        setWords(undefined);
        setSheet(undefined);
        current.keys?.wipe();
        setPasskeyCloseReason('revoked');
        setOpenPasskey(undefined);
        onRevoked();
      }
    });
  }

  const unlocked = open !== undefined && canUseKeys(open);
  const addresses = open?.wallet?.addresses ?? [];
  const sessionWallet = open?.wallet;
  const bitcoinLinkStarted = useRef(false);

  useEffect(() => {
    if (bitcoinLinkStarted.current) return;
    if (busy || busyRef.current) return;
    if (!unlocked) return;
    if (sessionWallet === undefined) return;
    if (addresses.some((address) => address.family === 'Bitcoin')) return;
    bitcoinLinkStarted.current = true;
    void onLink(0, false);
  }, [busy, unlocked, sessionWallet, addresses, onLink]);

  if (!open?.wallet) return <StyledVerticalStack gap={2} center />;

  const t = (key: string) => translate('screens/home', key);
  const button =
    'min-h-[44px] rounded-lg px-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
  const openSheet = (next: typeof sheet) => {
    if (sheetRef.current === undefined) sheetOrigin.current = document.activeElement as HTMLElement | null;
    sheetGeneration.current += 1;
    sheetRef.current = next;
    setNote(undefined);
    setSheet(next);
  };
  const closeSheet = () => {
    sheetGeneration.current += 1;
    sheetRef.current = undefined;
    wordsGeneration.current += 1;
    wordsKeys.current = undefined;
    setSheet(undefined);
    setWords(undefined);
    setRevokeAcknowledged(false);
    setNote(undefined);
    setChecks(undefined);
  };
  const requestCloseSheet = () => {
    if (!busyRef.current) closeSheet();
  };
  const toastMessage = (message: string) => displayToast(t(message));
  const copyAddress = async (address: string) => {
    try {
      if (!navigator.clipboard?.writeText) {
        displayToast(translate('screens/home', PASSKEY_COPY_UNAVAILABLE));
        return;
      }
      await navigator.clipboard.writeText(address);
      if (!mounted.current) return;
      toastMessage('Address copied');
    } catch {
      if (!mounted.current) return;
      displayToast(translate('screens/home', PASSKEY_COPY_UNAVAILABLE));
    }
  };
  const startAnother = () => {
    wordsGeneration.current += 1;
    wordsKeys.current = undefined;
    setWords(undefined);
    setChecks(undefined);
    setSheet(undefined);
    getOpenPasskey()?.keys?.wipe();
    setOpenPasskey(undefined);
  };
  async function showWords(): Promise<void> {
    if (busyRef.current) return;
    const openNow = getOpenPasskey();
    if (!openNow || !canUseKeys(openNow)) return;
    await run(async (client, session) => {
      if (!canUseKeys(session)) return;
      const generation = ++wordsGeneration.current;
      wordsKeys.current = session.keys;
      setWords(undefined);
      const exportPromise = client.exportMnemonic(
        session.wallet.credentialId ? credentialBytes(session.wallet.credentialId) : undefined,
      );
      if (generation === wordsGeneration.current) openSheet('words');
      const exported = await exportPromise;
      const current = getOpenPasskey();
      if (generation === wordsGeneration.current && current && canUseKeys(current) && current.keys === session.keys) {
        setWords(exported);
      }
    });
  }
  function onAction(action: WalletAction): void {
    if (action === 'Buy' || action === 'Sell' || action === 'Swap' || action === 'Pay') return;
    const openNow = getOpenPasskey();
    if (!openNow || !canUseKeys(openNow)) return;
    if (action === 'Send') openSheet('send');
    else openSheet('receive');
  }
  const bitcoin = addresses.some((address) => address.family === 'Bitcoin');
  const receiveLabel: Record<ReceiveFamily, string> = {
    evm: t('Ethereum & EVM'),
    bitcoin: 'Bitcoin',
    spark: t('Lightning (Spark)'),
  };
  const sessionKeys = expanded && canUseKeys(open) ? open.keys : undefined;
  const receiveRows =
    sessionKeys === undefined
      ? []
      : (['evm', 'bitcoin', 'spark'] as const).map((family) => ({
          family,
          label: receiveLabel[family],
          address: receiveAddress(sessionKeys, family),
        }));

  return (
    <main className="mx-auto w-full max-w-[560px] pb-10 text-left text-dfxBlue-800">
      <PasskeyWalletCard
        onHome={onHome}
        balance={balance}
        busy={busy}
        currency={currentSymbol}
        onCurrencyChange={(symbol) => {
          setCurrentSymbol(symbol);
          try {
            localStorage.setItem('dfx.wallet.currency', symbol);
          } catch {
            // Keep the selection in memory when storage is unavailable.
          }
        }}
        expanded={expanded}
        onExpandedChange={setExpanded}
        onSettings={() => openSheet('settings')}
      />
      <PasskeyWalletActions busy={busy} onAction={onAction} />
      {expanded && (
        <section id="passkey-wallet-details" className="mt-6">
          <h2 className="mb-2 text-xl font-bold">{t('Your wallet')}</h2>
          <div className="overflow-hidden rounded-[16px] bg-dfxGray-300">
            {assets?.map((asset, index) => (
              <div
                key={`${asset.name}:${index}`}
                className="flex min-h-[60px] items-center justify-between gap-2 border-b border-white px-4 py-3"
              >
                <div>
                  <b>{asset.name}</b>
                  {asset.network && <p className="text-sm">{asset.network}</p>}
                </div>
                <div className="text-right">
                  <div>{asset.amount}</div>
                  <div className="text-sm">
                    {currentSymbol} {formatWalletAmount(asset[currentSymbol.toLowerCase() as 'chf' | 'eur'], locale)}
                  </div>
                </div>
              </div>
            ))}
            <h3 className="px-4 pt-4 font-semibold">{t('Addresses')}</h3>
            <ul>
              {receiveRows.map((row) => (
                <li
                  key={`${row.family}:${row.address}`}
                  className="flex min-h-[58px] items-center justify-between gap-2 px-4 py-2"
                >
                  <div className="min-w-0">
                    <b>{row.label}</b>
                    <p className="truncate font-mono text-sm [font-feature-settings:'calt'_0]" title={row.address}>
                      {row.address.slice(0, 10)}…{row.address.slice(-8)}
                    </p>
                    {row.family === 'bitcoin' && !bitcoin && bitcoinLink === 'failed' && (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <p className="text-sm">{t('Not connected to DFX yet')}</p>
                        <button
                          className={`${button} border border-dfxGray-500`}
                          disabled={busy}
                          onClick={() => void onLink(0, true)}
                        >
                          {t('Connect again')}
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    className={button}
                    aria-label={`${t('Copy address')} ${row.label}`}
                    onClick={() => void copyAddress(row.address)}
                  >
                    ⧉
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      <PasskeyWalletHistory history={history} />
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-dfxBlue-800 px-4 py-3 text-white"
          onClick={dismissToast}
        >
          {toast}
        </div>
      )}
      {sheet === 'settings' && (
        <PasskeySettingsSheet
          credentialId={open.wallet.credentialId}
          busy={busy}
          note={note}
          noteKind={
            noteKind === 'refresh' || noteKind === 'status' || noteKind === 'diagnostics' ? noteKind : 'message'
          }
          statusOk={statusOk}
          checks={checks}
          onWords={() => void showWords()}
          onVerify={() =>
            void run(async (client, session, isCurrent) => {
              if (!canUseKeys(session)) return;
              const login = bitcoinLoginRing(session.keys);
              try {
                const rows = client.verifyServerAddresses(session.wallet, login.ring);
                if (isLive(session) && isCurrent()) {
                  setChecks(
                    rows.map((item) => ({ family: item.family, address: item.address, matches: item.matches })),
                  );
                }
              } finally {
                login.release();
              }
            })
          }
          onRefresh={() =>
            void run(async (client, session, isCurrent) => {
              await refreshWallet(client, session, isCurrent, true);
            })
          }
          onStatus={() =>
            void run(async (client, session, isCurrent) => {
              const rows = await client.credentialStatus([session.wallet.credentialId]);
              if (isCurrent()) {
                setStatusOk(rows.length > 0 && rows.every((item) => item.status === 'Active'));
                setNote(
                  rows
                    .map((item) =>
                      translate('screens/home', '{{credentialId}}: {{status}}', {
                        credentialId: item.credentialId,
                        status: translate('screens/home', item.status),
                      }),
                    )
                    .join(', ') || translate('screens/home', 'No credential status.'),
                  'status',
                );
              }
            })
          }
          onDiagnostics={() =>
            void run(async (client, _session, isCurrent) => {
              const report = await checkPasskeyPlatform(walletEnvForHost(window.location.hostname));
              const capabilities = await readClientCapabilities();
              await client.diagnostics(diagnosticRecord(report, capabilities));
              if (isCurrent()) setNote('Diagnostic recorded.', 'diagnostics');
            })
          }
          onAnotherPasskey={startAnother}
          onRevoke={() => {
            if (!busyRef.current) {
              setReason('Compromised');
              setRevokeAcknowledged(false);
              openSheet('revoke');
            }
          }}
          onCancel={onCancel}
          onClose={requestCloseSheet}
        />
      )}
      {sheet === 'words' && canUseKeys(open) && (
        <PasskeyWordsSheet
          words={words}
          note={note}
          paths={recoveryPaths(open.keys)}
          busy={busy}
          returnFocus={sheetOrigin.current}
          onClose={requestCloseSheet}
          onDone={closeSheet}
        />
      )}
      {sheet === 'revoke' && (
        <PasskeyRevokeSheet
          note={note}
          acknowledged={revokeAcknowledged}
          busy={busy}
          returnFocus={sheetOrigin.current}
          reason={reason}
          onReason={setReason}
          onAcknowledged={setRevokeAcknowledged}
          onClose={requestCloseSheet}
          onRevoke={() => {
            setChecks(undefined);
            void onRevokeWithPasskey(reason);
          }}
        />
      )}
      {sheet === 'receive' && (
        <PasskeySheet title={t('Receive')} busy={busy} onClose={requestCloseSheet}>
          {note && <p role="alert">{t(note)}</p>}
          <PasskeyReceivePanel
            readReceive={readReceive}
            onReceiveError={(message) => {
              if (message !== undefined) setNote(message, 'receive');
              else if (noteKindRef.current === 'receive') setNote(undefined);
            }}
          />
        </PasskeySheet>
      )}
      {sheet === 'send' && (
        <PasskeySheet title={t('Send')} busy={busy} onClose={requestCloseSheet}>
          <PasskeySendPanel />
        </PasskeySheet>
      )}
    </main>
  );
}
