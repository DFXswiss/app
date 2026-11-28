import { useWalletApi } from '@dfx.swiss/react';
import { StyledVerticalStack } from '@dfx.swiss/react-components';
import { checkPasskeyPlatform, passkeyDiagnostic, type KeyRing, type PlatformReport } from '@dfx.swiss/wallet';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSettingsContext } from '../../../contexts/settings.context';
import { useNavigation } from '../../../hooks/navigation.hook';
import { bitcoinBlockchain, bitcoinLabel, discoverAccount, formatBtc, historyItems } from './passkey-bitcoin';
import { usePasskeyDfxAccount } from './passkey-dfx-account';
import { passkeyMessage, walletEnvForHost } from './passkey-host';
import { passkeySend } from './passkey-payment';
import { sendReview } from './passkey-send-review';
import PasskeyRevokeSheet from './passkey-revoke-sheet';
import {
  getOpenPasskey,
  sameSession,
  setOpenPasskey,
  subscribeOpenPasskey,
  updateOpenPasskey,
  type OpenPasskey,
} from './passkey-session';
import PasskeySettingsSheet from './passkey-settings-sheet';
import PasskeySheet from './passkey-sheet';
import {
  PasskeyReceivePanel,
  PasskeySendPanel,
  RECEIVE_FAMILIES,
  receiveAddress,
  type ReceiveFamily,
  type SendPayment,
} from './passkey-transfer';
import PasskeyWalletActions, { WalletAction } from './passkey-wallet-actions';
import PasskeyWalletCard, { formatWalletAmount } from './passkey-wallet-card';
import PasskeyWalletHistory, { PasskeyHistory } from './passkey-wallet-history';
import PasskeyWordsSheet from './passkey-words-sheet';
import { createWalletClient, type WalletClient } from './wallet-client';

const TOAST_DURATION_MS = 4000;

// One address registration per key ring, shared by every desk in this tab. A new sign-in replaces the ring.
const addressSyncStarted = new WeakSet<object>();

type WalletApiHook = ReturnType<typeof useWalletApi>;
type BitcoinAccount = Awaited<ReturnType<WalletApiHook['getBitcoinAccount']>>;
type WalletConfig = Awaited<ReturnType<WalletApiHook['getConfig']>>;
type DiagnosticPayload = Parameters<WalletClient['diagnostics']>[1];
type NoteKind = 'message' | 'refresh' | 'status' | 'diagnostics' | 'receive';

interface ShownAsset {
  name: string;
  amount: string;
  chf?: number;
  eur?: number;
  network?: string;
}

type ShownReceive =
  { family: ReceiveFamily; label: string; address: string } | { family: ReceiveFamily; label: string; error: string };

export interface PasskeyDeskProps {
  balance?: { chf: number; eur: number };
  assets?: ShownAsset[];
  history?: PasskeyHistory;
  receiveError?: ReceiveFamily;
  onCancel: () => void;
  onHome?: () => void;
  onRevoked: () => void;
}

function canUseKeys(open: OpenPasskey): open is OpenPasskey & { keys: KeyRing } {
  return open.keys !== undefined;
}

// The app offers exactly the families GET /v1/wallet/config enables; none is assumed.
export function enabledFamilies(config: WalletConfig): ReceiveFamily[] {
  return RECEIVE_FAMILIES.filter((family) => config.families[family] === true);
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

function diagnosticRecord(report: PlatformReport, capabilities: Record<string, boolean> | undefined): DiagnosticPayload {
  const prf = diagnosticPrf(report.prf);
  return passkeyDiagnostic({
    stage: 'Capability',
    outcome: 'completed',
    ...(prf === undefined ? {} : { prf }),
    ...(report.os === undefined ? {} : { os: report.os }),
    ...(capabilities === undefined ? {} : { clientCapabilities: capabilities }),
  }) as DiagnosticPayload;
}

// Keys stay in tab memory. Account data, fees and the prepared payment come from wallet-api.
export default function PasskeyDesk({
  onCancel,
  onHome = onCancel,
  onRevoked,
  balance,
  assets,
  history,
  receiveError,
}: PasskeyDeskProps): JSX.Element {
  const { translate, locale } = useSettingsContext();
  const { navigate } = useNavigation();
  const open = useSyncExternalStore(subscribeOpenPasskey, getOpenPasskey, getOpenPasskey);
  const walletApi = useWalletApi(open?.token);
  const dfxAccount = usePasskeyDfxAccount();
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
  const [busy, setBusy] = useState(false);
  const [note, setNoteValue] = useState<string>();
  const [noteKind, setNoteKind] = useState<NoteKind>('message');
  const [words, setWords] = useState<string[]>();
  const [families, setFamilies] = useState<ReceiveFamily[]>();
  const [account, setAccount] = useState<BitcoinAccount>();
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
  const walletApiRef = useRef(walletApi);
  walletApiRef.current = walletApi;

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

  function setNote(message?: string, kind: NoteKind = 'message'): void {
    noteKindRef.current = kind;
    setNoteValue(message);
    setNoteKind(kind);
  }

  function showMessage(message: string): void {
    const current = sheetRef.current;
    if (current === 'settings' || current === 'words' || current === 'revoke' || current === 'receive') {
      setNote(message);
    } else {
      displayToast(translate('screens/home', message));
    }
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

  function isLive(session: OpenPasskey): boolean {
    return mounted.current && sameSession(getOpenPasskey(), session);
  }

  async function run(
    action: (client: WalletClient, session: OpenPasskey, isCurrent: () => boolean) => Promise<void>,
  ): Promise<void> {
    const session = getOpenPasskey();
    if (!session || busyRef.current) return;
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

  // Families, then the Bitcoin account with the device's gap-limit discovery. wallet-api answers
  // balance, used flags and history; the device only chooses which of its addresses to ask about.
  async function loadWallet(session: OpenPasskey): Promise<void> {
    const api = walletApiRef.current;
    const config = await api.getConfig();
    if (!isLive(session)) return;
    const enabled = enabledFamilies(config);
    setFamilies(enabled);
    if (!enabled.includes('bitcoin') || !canUseKeys(session)) return;
    const blockchain = bitcoinBlockchain(session.bitcoinNetwork);
    const found = await discoverAccount(session.keys, session.receiveIndex ?? 0, (addresses) =>
      api.getBitcoinAccount(blockchain, { addresses }),
    );
    if (!isLive(session)) return;
    setAccount(found.account);
    updateOpenPasskey(session, { receiveIndex: found.receiveIndex });
  }

  const token = open?.token;
  const keys = open?.keys;

  useEffect(() => {
    const session = getOpenPasskey();
    if (!session) return;
    setFamilies(undefined);
    setAccount(undefined);
    loadWallet(session).catch((caught) => {
      if (isLive(session)) displayToast(translate('screens/home', passkeyMessage(caught)));
    });
    if (session.keys && !addressSyncStarted.has(session.keys)) {
      addressSyncStarted.add(session.keys);
      createWalletClient()
        .syncAddresses(session, session.keys)
        .catch((caught: unknown) => {
          if (isLive(session)) displayToast(translate('screens/home', passkeyMessage(caught)));
        });
    }
  }, [token, keys]);

  if (!open) return <StyledVerticalStack gap={2} center />;

  const t = (key: string) => translate('screens/home', key);
  const network = open.bitcoinNetwork;
  const shownFamilies = families ?? [];
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
    if (!busyRef.current) closeSheet();
  };
  const copyAddress = async (address: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is not available.');
      await navigator.clipboard.writeText(address);
      displayToast(t('Address copied'));
    } catch (caught) {
      displayToast(translate('screens/home', passkeyMessage(caught)));
    }
  };
  const endSession = () => {
    getOpenPasskey()?.keys?.wipe();
    setOpenPasskey(undefined);
    dfxAccount.disconnect().catch(() => undefined);
  };
  const startAnother = () => {
    wordsGeneration.current += 1;
    wordsKeys.current = undefined;
    setWords(undefined);
    setSheet(undefined);
    endSession();
  };
  const readReceive = (family: ReceiveFamily): string => {
    const session = getOpenPasskey();
    if (!session?.keys) throw new Error('locked');
    return receiveAddress(session.keys, family, session.receiveIndex ?? 0);
  };
  const sendPayment: SendPayment = async (input, confirm) => {
    const sent = await passkeySend(input, (prepared) => confirm(sendReview(prepared, input)));
    const session = getOpenPasskey();
    if (session) loadWallet(session).catch(() => undefined);
    return sent;
  };

  async function showWords(): Promise<void> {
    await run(async (client, session) => {
      if (!canUseKeys(session)) return;
      const generation = ++wordsGeneration.current;
      wordsKeys.current = session.keys;
      setWords(undefined);
      const exportPromise = client.exportMnemonic(session);
      if (generation === wordsGeneration.current) openSheet('words');
      const exported = await exportPromise;
      const current = getOpenPasskey();
      if (generation === wordsGeneration.current && current?.keys === session.keys) setWords(exported);
    });
  }

  async function openDfx(path: '/buy' | '/sell'): Promise<void> {
    await run(async (_client, session) => {
      if (!canUseKeys(session)) return;
      await dfxAccount.connect(session.keys);
      if (isLive(session)) navigate(path);
    });
  }

  function onAction(action: WalletAction): void {
    if (action === 'Swap' || action === 'Pay') return;
    const openNow = getOpenPasskey();
    if (!openNow || !canUseKeys(openNow)) return;
    if (action === 'Buy') void openDfx('/buy');
    else if (action === 'Sell') void openDfx('/sell');
    else if (action === 'Send') openSheet('send');
    else openSheet('receive');
  }

  const receiveLabel: Record<ReceiveFamily, string> = {
    evm: t('Ethereum & EVM'),
    bitcoin: t(bitcoinLabel(network)),
    spark: t('Lightning (Spark)'),
  };
  const sessionKeys = expanded && canUseKeys(open) ? open.keys : undefined;
  const receiveRows: ShownReceive[] =
    sessionKeys === undefined
      ? []
      : shownFamilies.map((family): ShownReceive => {
          const label = receiveLabel[family];
          try {
            if (receiveError === family) throw new Error();
            return { family, label, address: receiveAddress(sessionKeys, family, open.receiveIndex ?? 0) };
          } catch (caught) {
            return { family, label, error: t(passkeyMessage(caught)) };
          }
        });
  const accountAssets: ShownAsset[] | undefined = account && [
    { name: 'Bitcoin', amount: formatBtc(account.balance.total), network: t(bitcoinLabel(network)) },
  ];
  const shownAssets = assets ?? accountAssets;
  const shownHistory: PasskeyHistory | undefined =
    history ?? (account && { items: historyItems(account.history, t, locale), hasMore: false });
  const bitcoinEnabled = shownFamilies.includes('bitcoin');

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
            {shownAssets?.map((asset, index) => {
              const fiat = asset[currentSymbol.toLowerCase() as 'chf' | 'eur'];
              return (
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
                    {fiat !== undefined && (
                      <div className="text-sm">
                        {currentSymbol} {formatWalletAmount(fiat, locale)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
      <PasskeyWalletHistory history={shownHistory} />
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
          credentialId={open.credentialId}
          busy={busy}
          note={note}
          noteKind={
            noteKind === 'refresh' || noteKind === 'status' || noteKind === 'diagnostics' ? noteKind : 'message'
          }
          onWords={() => void showWords()}
          onRefresh={() =>
            void run(async (_client, session, isCurrent) => {
              await loadWallet(session);
              if (isCurrent()) setNote(t('Data reloaded.'), 'refresh');
            })
          }
          onStatus={() =>
            void run(async (client, session, isCurrent) => {
              const rows = await client.credentials(session);
              if (isCurrent()) {
                setNote(
                  translate('screens/home', 'Passkeys on this account: {{count}}.', { count: rows.length }),
                  'status',
                );
              }
            })
          }
          onDiagnostics={() =>
            void run(async (client, session, isCurrent) => {
              const report = await checkPasskeyPlatform(walletEnvForHost(window.location.hostname));
              const capabilities = await readClientCapabilities();
              await client.diagnostics(session, diagnosticRecord(report, capabilities));
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
          onAcknowledged={setRevokeAcknowledged}
          onClose={requestCloseSheet}
          onRevoke={() =>
            void run(async (client, session) => {
              await client.revoke(session);
              setWords(undefined);
              setSheet(undefined);
              if (sameSession(getOpenPasskey(), session)) {
                endSession();
                onRevoked();
              }
            })
          }
        />
      )}
      {sheet === 'receive' && (
        <PasskeySheet title={t('Receive')} busy={busy} onClose={requestCloseSheet}>
          {note && <p role="alert">{t(note)}</p>}
          <PasskeyReceivePanel
            families={shownFamilies}
            bitcoinLabel={bitcoinLabel(network)}
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
          {bitcoinEnabled ? (
            <PasskeySendPanel
              loadFees={() => walletApiRef.current.getBitcoinFees(bitcoinBlockchain(network))}
              send={sendPayment}
            />
          ) : (
            <p className="pt-4 text-dfxGray-700">{t('Sending is not available for this wallet yet.')}</p>
          )}
        </PasskeySheet>
      )}
    </main>
  );
}
