import type { PasskeyWallet } from '@dfx.swiss/core';
import { StyledVerticalStack } from '@dfx.swiss/react-components';
import { KeyRing } from '@dfx.swiss/wallet';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSettingsContext } from '../../../contexts/settings.context';
import { passkeyMessage } from './passkey-host';
import { createWalletClient, type WalletClient } from './wallet-client';
import { getOpenPasskey, sameSession, setOpenPasskey, subscribeOpenPasskey, type OpenPasskey } from './passkey-session';
import { PasskeyReceivePanel, PasskeySendPanel, type ReceiveFamily } from './passkey-transfer';
import PasskeyWalletCard, { formatWalletAmount } from './passkey-wallet-card';
import PasskeyWalletActions, { WalletAction } from './passkey-wallet-actions';
import PasskeyWalletNotes, { walletStateDescription } from './passkey-wallet-notes';
import PasskeyWordsSheet from './passkey-words-sheet';
import PasskeyRevokeSheet from './passkey-revoke-sheet';
import PasskeySettingsSheet from './passkey-settings-sheet';
import PasskeySheet from './passkey-sheet';
import PasskeyPaySheet from './passkey-pay-sheet';
import PasskeyWalletHistory, { PasskeyHistory } from './passkey-wallet-history';

const TOAST_DURATION_MS = 4000;

export interface PasskeyDeskProps {
  opening?: boolean;
  onOpenApp: (path: '/buy' | '/sell' | '/swap') => void;
  balance?: { chf: number; eur: number };
  assets?: { name: string; amount: string; chf: number; eur: number; network?: string }[];
  history?: PasskeyHistory;
  onPasteLink?: () => void;
  onCancel: () => void;
  onHome?: () => void;
  onRevoked: () => void;
}

function evmIndexOf(value: string): number | undefined {
  if (!/^\d+$/.test(value.trim())) return undefined;
  const index = Number(value);
  if (!Number.isSafeInteger(index) || index > 99) return undefined;
  return index;
}

function canUseKeys(open: OpenPasskey): open is OpenPasskey & { keys: KeyRing } {
  return open.state === 'unlocked' && open.keys !== undefined;
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

function readReceive(family: ReceiveFamily): string {
  const session = getOpenPasskey();
  if (!session || !canUseKeys(session)) throw new Error('locked');
  if (family === 'evm') return session.keys.evm(0).address;
  if (family === 'spark') return session.keys.sparkIdentity().address;
  const login = bitcoinLoginRing(session.keys);
  try {
    return login.ring.bitcoinAddress(0, 0).address;
  } finally {
    login.release();
  }
}

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

// Same rule as the wallet package: only a 20-byte hex address can be the seed check.
function sameSeed(derived: string | undefined, expected: string): boolean {
  if (!derived || !EVM_ADDRESS.test(derived) || !EVM_ADDRESS.test(expected)) return false;
  return derived.toLowerCase() === expected.toLowerCase();
}

function credentialBytes(id: string): Uint8Array {
  const padded = id.replace(/-/g, '+').replace(/_/g, '/');
  const text = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

// Keys stay in tab memory; existing account operations are exposed by the wallet interface.
export default function PasskeyDesk({
  opening = false,
  onOpenApp,
  onCancel,
  onHome = onCancel,
  onRevoked,
  balance,
  assets,
  history,
  onPasteLink,
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
  const [wordsAcknowledged, setWordsAcknowledged] = useState(false);
  const [revokeAcknowledged, setRevokeAcknowledged] = useState(false);
  const [reason, setReason] = useState<'Lost' | 'Compromised'>('Lost');
  const open = useSyncExternalStore(subscribeOpenPasskey, getOpenPasskey, getOpenPasskey);
  const [evmIndex, setEvmIndex] = useState('1');
  const [operationBusy, setBusy] = useState(false);
  const busy = operationBusy || opening;
  const [note, setNoteValue] = useState<string>();
  const [noteKind, setNoteKind] = useState<'message' | 'refresh' | 'status' | 'diagnostics' | 'link'>('message');
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
    kind: 'message' | 'refresh' | 'status' | 'diagnostics' | 'link' = 'message',
  ): void {
    setNoteValue(message);
    setNoteKind(kind);
  }

  function showMessage(message: string, kind: 'message' | 'link' = 'message'): void {
    const current = sheetRef.current;
    if (current === 'settings' || current === 'words' || current === 'revoke' || current === 'receive') {
      setNote(message, kind);
    } else {
      displayToast(kind === 'link' ? message : translate('screens/home', message));
    }
  }

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeOpenPasskey(() => {
      if (!wordsKeys.current) return;
      const current = getOpenPasskey();
      if (!current || !canUseKeys(current) || current.keys !== wordsKeys.current) {
        wordsGeneration.current += 1;
        wordsKeys.current = undefined;
        setWords(undefined);
        setWordsAcknowledged(false);
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
    const latest = liveSession(session);
    if (latest) setOpenPasskey({ ...latest, wallet });
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

  async function onLink(family: 'bitcoin' | 'evm', accountIndex: number, reportSuccess: boolean): Promise<void> {
    const session = getOpenPasskey();
    if (!session || !session.wallet || !canUseKeys(session)) return;
    const keys = session.keys;
    const token = session.accessToken;
    await run(async (client, original, isCurrent) => {
      const login = family === 'bitcoin' ? bitcoinLoginRing(keys) : { ring: keys, release: releaseNothing };
      let linked: Awaited<ReturnType<WalletClient['link']>>;
      try {
        linked = await client.link(family, token, login.ring, accountIndex);
      } finally {
        login.release();
      }
      // The link response is an address token. Further account routes still need the ceremony token.
      const linkedText = translate('screens/home', 'Linked {{family}} {{address}}.', {
        family: linked.address.family,
        address: linked.address.address,
      });
      try {
        await refreshWallet(client, original, isCurrent, false);
      } catch (caught) {
        if (isCurrent()) {
          showMessage(`${linkedText} ${translate('screens/home', passkeyMessage(caught))}`);
        }
        return;
      }
      if (isCurrent() && reportSuccess) showMessage(linkedText, 'link');
    });
  }

  async function onRevokeWithPasskey(reason: 'Lost' | 'Compromised'): Promise<void> {
    await run(async (client, session, isCurrent) => {
      const revoked = await client.revoke(reason);
      if (revoked.status === 'Active') {
        if (isCurrent() && sameSession(getOpenPasskey(), session)) {
          setNote('The passkey was not blocked. Please try again.');
        }
        return;
      }
      if (revoked.id !== session.wallet.id) {
        if (isCurrent() && sameSession(getOpenPasskey(), session)) {
          setRevokeAcknowledged(false);
          setNote('You confirmed with a different passkey. That passkey is now blocked; this wallet is still active.');
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
    void onLink('bitcoin', 0, false);
  }, [busy, unlocked, sessionWallet, addresses, onLink]);

  if (!open?.wallet) return <StyledVerticalStack gap={2} center />;

  const walletState = open.state;
  const index = evmIndexOf(evmIndex);

  const t = (key: string) => translate('screens/home', key);
  const button =
    'min-h-[44px] rounded-lg px-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
  const backupMissing = !open.wallet.backupSeenDate;
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
    setWordsAcknowledged(false);
    setRevokeAcknowledged(false);
    setNote(undefined);
    setChecks(undefined);
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
    if (busyRef.current) return;
    wordsGeneration.current += 1;
    wordsKeys.current = undefined;
    setWords(undefined);
    setChecks(undefined);
    setSheet(undefined);
    getOpenPasskey()?.keys?.wipe();
    setOpenPasskey(undefined);
  };
  async function unlock(): Promise<boolean> {
    const original = getOpenPasskey();
    await run(async (client, session, isCurrent) => {
      const unlockedSession = await client.unlock();
      const latest = liveSession(session);
      if (!latest) {
        unlockedSession.keys?.wipe();
        return;
      }
      const keys = unlockedSession.keys;
      let address: string | undefined;
      try {
        address = keys?.evm(0).address;
      } catch {
        address = undefined;
      }
      const expected = latest.wallet?.seedCheckAddress;
      if (unlockedSession.state !== 'unlocked' || !keys) {
        keys?.wipe();
        setOpenPasskey({ ...latest, state: unlockedSession.state, keys: undefined });
        if (unlockedSession.state === 'locked' && isCurrent()) {
          showMessage('This passkey did not unlock the wallet. Please try again with the passkey of this wallet.');
        }
        return;
      }
      if (expected && !sameSeed(address, expected)) {
        keys.wipe();
        setOpenPasskey({ ...latest, state: 'seed-mismatch', keys: undefined });
        return;
      }
      setOpenPasskey({ ...latest, state: 'unlocked', keys });
    });
    const current = getOpenPasskey();
    return Boolean(original && current && sameSession(current, original) && canUseKeys(current));
  }
  async function withKeys(action: () => void): Promise<void> {
    if (unlocked || (walletState === 'locked' && (await unlock()))) action();
  }
  async function showWords(): Promise<void> {
    if (busyRef.current) return;
    if (!unlocked && !(walletState === 'locked' && (await unlock()))) {
      const state = getOpenPasskey()?.state;
      if (sheetRef.current && (state === 'seed-mismatch' || state === 'compromised' || state === 'open-elsewhere')) {
        setNote(walletStateDescription(state));
      }
      return;
    }
    await run(async (client, session) => {
      if (!canUseKeys(session)) return;
      const generation = ++wordsGeneration.current;
      wordsKeys.current = session.keys;
      setWords(undefined);
      setWordsAcknowledged(false);
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
    void withKeys(() => {
      if (action === 'Buy' || action === 'Sell' || action === 'Swap') {
        onOpenApp(`/${action.toLowerCase()}` as '/buy' | '/sell' | '/swap');
      } else if (action === 'Send') {
        openSheet('send');
      } else if (action === 'Receive') {
        openSheet('receive');
      } else {
        openSheet('pay');
      }
    });
  }
  const bitcoin = addresses.some((address) => address.family === 'Bitcoin');
  const addressLabel = (family: string) =>
    family === 'Spark' ? t('Lightning (Spark)') : family === 'Evm' ? t('Ethereum & EVM') : family;

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
      <PasskeyWalletNotes
        state={walletState}
        unlocked={unlocked}
        backupNeeded={open.wallet.backupRequired}
        busy={busy}
        onUnlock={() => void unlock()}
        onBackup={() => void showWords()}
        onAnotherPasskey={startAnother}
        onReload={() => window.location.reload()}
      />
      <PasskeyWalletActions unlocked={unlocked} canUnlock={walletState === 'locked'} busy={busy} onAction={onAction} />
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
              {addresses.map((address) => (
                <li
                  key={`${address.family}:${address.path}:${address.address}`}
                  className="flex min-h-[58px] items-center justify-between gap-2 px-4 py-2"
                >
                  <div className="min-w-0">
                    <b>{addressLabel(address.family)}</b>
                    <p className="truncate font-mono text-sm" title={address.address}>
                      {address.address.slice(0, 10)}…{address.address.slice(-8)}
                    </p>
                  </div>
                  <button
                    className={button}
                    aria-label={`${t('Copy address')} ${addressLabel(address.family)}`}
                    onClick={() => void copyAddress(address.address)}
                  >
                    ⧉
                  </button>
                </li>
              ))}
              {!bitcoin && (
                <li className="flex items-center justify-between gap-2 px-4 py-2">
                  <div>
                    <b>Bitcoin</b>
                    <p className="text-sm">{t('Not connected yet')}</p>
                  </div>
                  <button
                    className={`${button} border border-dfxGray-500`}
                    disabled={busy || !unlocked}
                    onClick={() => void onLink('bitcoin', 0, true)}
                  >
                    {t('Connect again')}
                  </button>
                </li>
              )}
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
          unlocked={unlocked}
          canUnlock={walletState === 'locked'}
          backupNeeded={backupMissing}
          backupSeenDate={open.wallet.backupSeenDate}
          credentialId={open.wallet.credentialId}
          busy={busy}
          note={note}
          noteKind={noteKind}
          checks={checks}
          evmIndex={evmIndex}
          validEvmIndex={index !== undefined}
          onEvmIndex={setEvmIndex}
          onWords={() => void showWords()}
          onLink={index === undefined ? undefined : () => void onLink('evm', index, true)}
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
              await client.diagnostics({ stage: 'Authentication', outcome: 'Success' });
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
          acknowledged={wordsAcknowledged}
          busy={busy}
          returnFocus={sheetOrigin.current}
          onAcknowledged={setWordsAcknowledged}
          onClose={requestCloseSheet}
          onDone={() =>
            void run(async (client, session, isCurrent) => {
              const updated = await client.backupSeen(session.wallet.id, session.accessToken);
              if (!isCurrent() || !isLive(session)) return;
              replaceWallet(updated, session);
              closeSheet();
            })
          }
        />
      )}
      {sheet === 'revoke' && (
        <PasskeyRevokeSheet
          note={note}
          backupNeeded={backupMissing}
          canBackUp={unlocked || walletState === 'locked'}
          acknowledged={revokeAcknowledged}
          busy={busy}
          returnFocus={sheetOrigin.current}
          reason={reason}
          onBackup={() => void showWords()}
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
          <PasskeyReceivePanel unlocked={unlocked} readReceive={readReceive} onReceiveError={setNote} />
        </PasskeySheet>
      )}
      {sheet === 'send' && (
        <PasskeySheet title={t('Send')} busy={busy} onClose={requestCloseSheet}>
          <PasskeySendPanel />
        </PasskeySheet>
      )}
      {sheet === 'pay' && (
        <PasskeyPaySheet
          onClose={requestCloseSheet}
          onPasteLink={() => {
            if (onPasteLink) onPasteLink();
            else toastMessage('Coming soon');
          }}
        />
      )}
    </main>
  );
}
