import type { PasskeyDiagnosticParams, PasskeyWallet } from '@dfx.swiss/core';
import { StyledVerticalStack } from '@dfx.swiss/react-components';
import { checkPasskeyPlatform, KeyRing, passkeyDiagnostic, type PlatformReport } from '@dfx.swiss/wallet';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSettingsContext } from '../../../contexts/settings.context';
import { passkeyMessage, walletEnvForHost } from './passkey-host';
import { credentialBytes } from './passkey-bytes';
import { createWalletClient, type WalletClient } from './wallet-client';
import { getOpenPasskey, sameSession, setOpenPasskey, subscribeOpenPasskey, type OpenPasskey } from './passkey-session';
import { PasskeyReceivePanel, PasskeySendPanel, receiveAddress, type ReceiveFamily } from './passkey-transfer';
import PasskeyWalletCard, { formatWalletAmount } from './passkey-wallet-card';
import PasskeyWalletActions, { WalletAction } from './passkey-wallet-actions';
import PasskeyWordsSheet from './passkey-words-sheet';
import PasskeyRevokeSheet from './passkey-revoke-sheet';
import PasskeyPaySheet from './passkey-pay-sheet';
import PasskeySettingsSheet from './passkey-settings-sheet';
import PasskeySheet from './passkey-sheet';
import PasskeyWalletHistory, { PasskeyHistory } from './passkey-wallet-history';

const TOAST_DURATION_MS = 4000;

const APP_PATH = { Buy: '/buy', Sell: '/sell', Swap: '/swap' } as const;

type ShownReceive =
  { family: ReceiveFamily; label: string; address: string } | { family: ReceiveFamily; label: string; error: string };

export interface PasskeyDeskProps {
  opening?: boolean;
  onOpenApp?: (path: '/buy' | '/sell' | '/swap') => void;
  balance?: { chf: number; eur: number };
  assets?: { name: string; amount: string; chf: number; eur: number; network?: string }[];
  history?: PasskeyHistory;
  receiveError?: ReceiveFamily;
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
export function bitcoinLoginRing(keys: KeyRing): { ring: KeyRing; release: () => void } {
  if (keys.bitcoinNetwork !== 'testnet4') return { ring: keys, release: releaseNothing };
  const ring = KeyRing.fromMnemonic(keys.mnemonic(), { bitcoinNetwork: 'mainnet' });
  return { ring, release: () => ring.wipe() };
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
  onOpenApp,
  opening = false,
  balance,
  assets,
  history,
  receiveError,
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
  const [sheet, setSheet] = useState<'settings' | 'words' | 'revoke' | 'receive' | 'send' | 'pay'>();
  const [toast, setToast] = useState<string>();
  const [revokeAcknowledged, setRevokeAcknowledged] = useState(false);
  const [reason, setReason] = useState<'Lost' | 'Compromised'>('Lost');
  const open = useSyncExternalStore(subscribeOpenPasskey, getOpenPasskey, getOpenPasskey);
  const [operationBusy, setBusy] = useState(false);
  const busy = operationBusy || opening;
  const [note, setNoteValue] = useState<string>();
  const [noteKind, setNoteKind] = useState<'message' | 'refresh' | 'status' | 'diagnostics' | 'receive'>('message');
  const [words, setWords] = useState<string[]>();
  const [checks, setChecks] = useState<{ family: string; address: string; matches: boolean }[]>();
  const busyRef = useRef(false);
  const mounted = useRef(false);
  const sheetRef = useRef<typeof sheet>();
  const sheetSession = useRef<OpenPasskey>();
  const sheetOrigin = useRef<HTMLElement | null>(null);
  const sheetGeneration = useRef(0);
  const wordsGeneration = useRef(0);
  const wordsKeys = useRef<KeyRing>();
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const noteKindRef = useRef(noteKind);

  function clearToastTimer(): void {
    if (toastTimer.current !== undefined) {
      clearTimeout(toastTimer.current);
      toastTimer.current = undefined;
    }
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

  function showMessage(message: string): void {
    setNote(message);
  }

  function closeSheet(): void {
    sheetGeneration.current += 1;
    sheetRef.current = undefined;
    sheetSession.current = undefined;
    wordsGeneration.current += 1;
    wordsKeys.current = undefined;
    setSheet(undefined);
    setWords(undefined);
    setRevokeAcknowledged(false);
    setNote(undefined);
    setChecks(undefined);
  }

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeOpenPasskey(() => {
      if (sheetRef.current && sheetSession.current && !sameSession(getOpenPasskey(), sheetSession.current)) {
        closeSheet();
        return;
      }
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
      clearToastTimer();
      unsubscribe();
    };
  }, []);

  async function run(
    action: (client: WalletClient, session: OpenPasskey, isCurrent: () => boolean) => Promise<void>,
  ): Promise<void> {
    const session = getOpenPasskey();
    if (!session || busyRef.current || opening) return;
    busyRef.current = true;
    setBusy(true);
    setNote(undefined);
    let generation = sheetGeneration.current;
    const isCurrent = () => generation === sheetGeneration.current && sameSession(getOpenPasskey(), session);
    try {
      const result = action(createWalletClient(), session, isCurrent);
      generation = sheetGeneration.current;
      await result;
    } catch (caught) {
      if (!isCurrent()) return;
      showMessage(passkeyMessage(caught));
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
    // The open session outlives this desk. A mounted sibling reads the update.
    const latest = getOpenPasskey();
    if (!latest || !sameSession(latest, session)) return;
    setOpenPasskey({ ...latest, wallet });
  }

  async function refreshWallet(
    client: WalletClient,
    session: OpenPasskey,
    isCurrent: () => boolean,
    reportCount: boolean,
  ): Promise<PasskeyWallet | undefined> {
    const list = await client.wallets(session.accessToken);
    const match = list.find((item) => item.id === session.wallet.id);
    if (match) replaceWallet(match, session);
    if (reportCount && isLive(session) && isCurrent()) {
      setNote(translate('screens/home', 'Wallets on this account: {{count}}.', { count: list.length }), 'refresh');
    }
    return match;
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
      if (isCurrent()) {
        setWords(undefined);
        setSheet(undefined);
      }
      const current = getOpenPasskey();
      if (current && sameSession(current, session)) {
        current.keys?.wipe();
        setOpenPasskey(undefined);
        onRevoked();
      }
    });
  }

  if (!open?.wallet) return <StyledVerticalStack gap={2} center />;

  const t = (key: string) => translate('screens/home', key);
  const button =
    'min-h-[44px] rounded-lg px-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
  const openSheet = (next: typeof sheet) => {
    if (sheetRef.current === undefined) sheetOrigin.current = document.activeElement as HTMLElement | null;
    sheetGeneration.current += 1;
    sheetRef.current = next;
    sheetSession.current = getOpenPasskey();
    setNote(undefined);
    setSheet(next);
  };
  const requestCloseSheet = () => {
    if (!busyRef.current && !opening) closeSheet();
  };
  const toastMessage = (message: string) => displayToast(t(message));
  const copyAddress = async (address: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is not available.');
      await navigator.clipboard.writeText(address);
      toastMessage('Address copied');
    } catch (caught) {
      displayToast(translate('screens/home', passkeyMessage(caught)));
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
    if (action === 'Buy' || action === 'Sell' || action === 'Swap') {
      onOpenApp?.(APP_PATH[action]);
      return;
    }
    const openNow = getOpenPasskey();
    if (!openNow || !canUseKeys(openNow)) return;
    if (action === 'Send') openSheet('send');
    else if (action === 'Pay') openSheet('pay');
    else openSheet('receive');
  }
  const receiveLabel: Record<ReceiveFamily, string> = {
    evm: t('Ethereum & EVM'),
    bitcoin: 'Bitcoin',
    spark: t('Lightning (Spark)'),
  };
  const sessionKeys = expanded && canUseKeys(open) ? open.keys : undefined;
  const receiveRows: ShownReceive[] =
    sessionKeys === undefined
      ? []
      : (['evm', 'bitcoin', 'spark'] as const).map((family): ShownReceive => {
          const label = receiveLabel[family];
          try {
            if (receiveError === family) throw new Error();
            return { family, label, address: receiveAddress(sessionKeys, family) };
          } catch (caught) {
            return { family, label, error: t(passkeyMessage(caught)) };
          }
        });

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
                  key={`${row.family}:${'address' in row ? row.address : row.error}`}
                  className="flex min-h-[58px] items-center justify-between gap-2 px-4 py-2"
                >
                  <div className="min-w-0">
                    <b>{row.label}</b>
                    {'address' in row ? (
                      <p className="truncate font-mono text-sm [font-feature-settings:'calt'_0]" title={row.address}>
                        {row.address.slice(0, 10)}…{row.address.slice(-8)}
                      </p>
                    ) : (
                      <p className="text-sm">{row.error}</p>
                    )}
                  </div>
                  {'address' in row && (
                    <button
                      className={button}
                      aria-label={`${t('Copy address')} ${row.label}`}
                      onClick={() => void copyAddress(row.address)}
                    >
                      ⧉
                    </button>
                  )}
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
            if (!busyRef.current) openSheet('revoke');
          }}
          onCancel={onCancel}
          onClose={requestCloseSheet}
        />
      )}
      {sheet === 'words' && (
        <PasskeyWordsSheet
          words={words}
          note={note}
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
      {sheet === 'pay' && <PasskeyPaySheet open onClose={requestCloseSheet} onToast={toastMessage} />}
    </main>
  );
}
