import type { PasskeyWallet } from '@dfx.swiss/core';
import { useAuthContext, useFiatContext } from '@dfx.swiss/react';
import { StyledVerticalStack } from '@dfx.swiss/react-components';
import { KeyRing } from '@dfx.swiss/wallet';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSettingsContext } from '../../../contexts/settings.context';
import { createPasskeyClients, type PasskeyClients, passkeyMessage } from './passkey-host';
import { getOpenPasskey, setOpenPasskey, subscribeOpenPasskey, type OpenPasskey } from './passkey-session';
import PasskeyTransfer, { type ReceiveFamily } from './passkey-transfer';
import PasskeyReceive from './passkey-receive';
import PasskeyWalletCard from './passkey-wallet-card';
import PasskeyWalletActions, { WalletAction } from './passkey-wallet-actions';
import PasskeyWalletNotes from './passkey-wallet-notes';
import PasskeyWordsSheet from './passkey-words-sheet';
import PasskeyRevokeSheet from './passkey-revoke-sheet';
import PasskeySettingsSheet from './passkey-settings-sheet';
import PasskeySheet from './passkey-sheet';
import PasskeyPaySheet from './passkey-pay-sheet';
import PasskeyWalletHistory, { PasskeyHistory } from './passkey-wallet-history';
export type { PasskeyTx } from './passkey-wallet-history';

export interface PasskeyDeskProps {
  onOpenApp: (path: '/buy' | '/sell' | '/swap') => void;
  balance?: { chf: number; eur: number };
  assets?: { name: string; amount: string; chf: number; eur: number; network?: string }[];
  history?: PasskeyHistory;
  onSend?: () => void;
  onPasteLink?: () => void;
  onCancel: () => void;
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
  onOpenApp,
  onCancel,
  onRevoked,
  balance,
  assets,
  history,
  onSend,
  onPasteLink,
}: PasskeyDeskProps): JSX.Element {
  const { translate, currency } = useSettingsContext();
  const { currencies } = useFiatContext();
  const [expanded, setExpanded] = useState(false);
  const [sheet, setSheet] = useState<'settings' | 'words' | 'revoke' | 'receive' | 'pay'>();
  const [toast, setToast] = useState<string>();
  const [wordsAcknowledged, setWordsAcknowledged] = useState(false);
  const [revokeAcknowledged, setRevokeAcknowledged] = useState(false);
  const [reason, setReason] = useState<'Lost' | 'Compromised'>('Lost');
  const [method, setMethod] = useState<'passkey' | 'login'>('passkey');
  const { getAuthToken } = useAuthContext();
  const open = useSyncExternalStore(subscribeOpenPasskey, getOpenPasskey, getOpenPasskey);
  const [evmIndex, setEvmIndex] = useState('1');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  const [words, setWords] = useState<string[]>();
  const [receive, setReceive] = useState(false);
  const [checks, setChecks] = useState<{ address: string; matches: boolean }[]>();
  const busyRef = useRef(false);
  const wordsGeneration = useRef(0);
  const wordsKeys = useRef<KeyRing>();

  useEffect(() => {
    const unsubscribe = subscribeOpenPasskey(() => {
      if (!wordsKeys.current) return;
      const current = getOpenPasskey();
      if (!current || !canUseKeys(current) || current.keys !== wordsKeys.current) {
        wordsGeneration.current += 1;
        wordsKeys.current = undefined;
        setWords(undefined);
        setWordsAcknowledged(false);
        setSheet((currentSheet) => (currentSheet === 'words' ? undefined : currentSheet));
      }
    });
    return () => {
      wordsGeneration.current += 1;
      wordsKeys.current = undefined;
      unsubscribe();
    };
  }, []);

  async function run(action: (clients: PasskeyClients, session: OpenPasskey) => Promise<void>): Promise<void> {
    const session = getOpenPasskey();
    if (!session || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNote(undefined);
    try {
      await action(createPasskeyClients(), session);
    } catch (caught) {
      const message = passkeyMessage(caught);
      if (sheet) setNote(message);
      else setToast(translate('screens/home', message));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function replaceWallet(wallet: PasskeyWallet, accessToken?: string): void {
    const latest = getOpenPasskey();
    if (!latest) return;
    setOpenPasskey({ ...latest, wallet, accessToken: accessToken ?? latest.accessToken });
  }

  async function refreshWallet(
    api: PasskeyClients['api'],
    token: string,
    id: number,
  ): Promise<PasskeyWallet | undefined> {
    const list = await api.passkey.wallets(token);
    const match = list.find((item) => item.id === id);
    if (match) replaceWallet(match, token);
    setNote(`Wallets on this account: ${list.length}.`);
    return match;
  }

  async function onLink(family: 'bitcoin' | 'evm', accountIndex: number): Promise<void> {
    const session = getOpenPasskey();
    if (!session || !session.wallet || !canUseKeys(session)) return;
    const keys = session.keys;
    const token = session.accessToken;
    const walletId = session.wallet.id;
    await run(async ({ auth, api }) => {
      const login = family === 'bitcoin' ? bitcoinLoginRing(keys) : { ring: keys, release: releaseNothing };
      let linked: Awaited<ReturnType<PasskeyClients['auth']['link']>>;
      try {
        linked = await auth.link(family, token, login.ring, accountIndex);
      } finally {
        login.release();
      }
      // The link response is an address token. Further account routes still need the ceremony token.
      const linkedText = `Linked ${linked.address.family} ${linked.address.address}.`;
      try {
        await refreshWallet(api, token, walletId);
      } catch (caught) {
        if (sheet) setNote(`${linkedText} ${passkeyMessage(caught)}`);
        else setToast(passkeyMessage(caught));
        return;
      }
      if (sheet) setNote(linkedText);
    });
  }

  async function onRevokeWithPasskey(reason: 'Lost' | 'Compromised'): Promise<void> {
    await run(async ({ auth }) => {
      await auth.revoke(reason);
      setWords(undefined);
      setReceive(false);
      setSheet(undefined);
      setOpenPasskey(undefined);
      onRevoked();
    });
  }

  async function onRevokeById(reason: 'Lost' | 'Compromised'): Promise<void> {
    const session = getOpenPasskey();
    if (!session || !session.wallet) return;
    const fresh = getAuthToken();
    if (!fresh) {
      setNote('Revoke by id needs a fresh mail or wallet login.');
      return;
    }
    const walletId = session.wallet.id;
    await run(async ({ api }) => {
      const updated = await api.passkey.revoke(walletId, reason, fresh);
      if (updated.status !== 'Active') {
        setWords(undefined);
        setReceive(false);
        setSheet(undefined);
        setOpenPasskey(undefined);
        onRevoked();
        return;
      }
      replaceWallet(updated);
      setNote(`Wallet status is ${updated.status}.`);
    });
  }

  const unlocked = open !== undefined && canUseKeys(open);
  const addresses = open?.wallet?.addresses ?? [];
  const sessionWallet = open?.wallet;
  const bitcoinLinkStarted = useRef(false);

  useEffect(() => {
    if (bitcoinLinkStarted.current) return;
    if (!unlocked) return;
    if (sessionWallet === undefined) return;
    if (addresses.some((address) => address.family === 'Bitcoin')) return;
    bitcoinLinkStarted.current = true;
    void onLink('bitcoin', 0);
  }, [unlocked, sessionWallet, addresses, onLink]);

  if (!open?.wallet) return <StyledVerticalStack gap={2} center />;

  const walletState = open.state;
  const index = evmIndexOf(evmIndex);
  let receiveAddress: string | undefined;
  if (receive && unlocked) {
    try {
      receiveAddress = open.keys.evm(0).address;
    } catch {
      receiveAddress = undefined;
    }
  }

  const t = (key: string) => translate('screens/home', key);
  const button =
    'min-h-[44px] rounded-lg px-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
  const backupNeeded = !open.wallet.backupSeenDate;
  const openSheet = (next: typeof sheet) => {
    setNote(undefined);
    setSheet(next);
  };
  const closeSheet = () => {
    wordsGeneration.current += 1;
    wordsKeys.current = undefined;
    setSheet(undefined);
    setWords(undefined);
    setWordsAcknowledged(false);
    setRevokeAcknowledged(false);
    setNote(undefined);
  };
  const toastMessage = (message: string) => setToast(t(message));
  const copyAddress = (address: string) => {
    void navigator.clipboard
      .writeText(address)
      .then(() => toastMessage('Address copied'))
      .catch((caught) => setToast(passkeyMessage(caught)));
  };
  const startAnother = () => {
    if (busyRef.current) return;
    wordsGeneration.current += 1;
    wordsKeys.current = undefined;
    setWords(undefined);
    setReceive(false);
    setSheet(undefined);
    setOpenPasskey(undefined);
  };
  async function unlock(): Promise<boolean> {
    await run(async ({ auth }) => {
      const unlockedSession = await auth.unlock();
      const latest = getOpenPasskey();
      if (!latest) return;
      const keys = unlockedSession.keys;
      let address: string | undefined;
      try {
        address = keys?.evm(0).address;
      } catch {
        address = undefined;
      }
      const expected = latest.wallet?.seedCheckAddress;
      if (unlockedSession.state !== 'unlocked' || !keys) {
        setOpenPasskey({ ...latest, state: unlockedSession.state, keys: undefined });
        return;
      }
      if (expected && !sameSeed(address, expected)) {
        setOpenPasskey({ ...latest, state: 'seed-mismatch', keys: undefined });
        return;
      }
      setOpenPasskey({ ...latest, state: 'unlocked', keys });
    });
    const current = getOpenPasskey();
    return Boolean(current && canUseKeys(current));
  }
  async function withKeys(action: () => void): Promise<void> {
    if (unlocked || (walletState === 'locked' && (await unlock()))) action();
  }
  async function showWords(): Promise<void> {
    if (busyRef.current) return;
    if (!unlocked && !(walletState === 'locked' && (await unlock()))) return;
    await run(async ({ auth }, session) => {
      if (!canUseKeys(session)) return;
      const generation = ++wordsGeneration.current;
      wordsKeys.current = session.keys;
      setWords(undefined);
      setWordsAcknowledged(false);
      const exportPromise = auth.exportMnemonic(
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
      onOpenApp(`/${action.toLowerCase()}` as '/buy' | '/sell' | '/swap');
      return;
    }
    void withKeys(() => {
      if (action === 'Send') {
        if (onSend) onSend();
        else toastMessage('Coming soon');
      } else if (action === 'Receive') {
        setReceive(true);
        openSheet('receive');
      } else {
        openSheet('pay');
      }
    });
  }
  const currentSymbol = currency?.name === 'EUR' ? 'EUR' : 'CHF';
  const bitcoin = addresses.some((address) => address.family === 'Bitcoin');
  const addressLabel = (family: string) =>
    family === 'Spark' ? 'Lightning (Spark)' : family === 'Evm' ? 'Ethereum & EVM' : family;

  return (
    <main className="mx-auto w-full max-w-[560px] pb-10 text-left text-dfxBlue-800">
      <PasskeyWalletCard
        balance={balance}
        currencies={currencies}
        expanded={expanded}
        onExpandedChange={setExpanded}
        onSettings={() => openSheet('settings')}
      />
      <PasskeyWalletNotes
        state={walletState}
        unlocked={unlocked}
        backupNeeded={backupNeeded}
        busy={busy}
        onUnlock={() => void unlock()}
        onBackup={() => void showWords()}
        onAnotherPasskey={startAnother}
        onReload={() => window.location.reload()}
      />
      <PasskeyWalletActions unlocked={unlocked} onAction={onAction} />
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
                    {currentSymbol} {asset[currentSymbol.toLowerCase() as 'chf' | 'eur'].toFixed(2)}
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
                    onClick={() => copyAddress(address.address)}
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
                    onClick={() => void onLink('bitcoin', 0)}
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
          onClick={() => setToast(undefined)}
        >
          {toast}
        </div>
      )}
      {sheet === 'settings' && (
        <PasskeySettingsSheet
          unlocked={unlocked}
          backupNeeded={backupNeeded}
          backupSeenDate={open.wallet.backupSeenDate}
          credentialId={open.wallet.credentialId}
          busy={busy}
          note={note}
          checks={checks}
          evmIndex={evmIndex}
          validEvmIndex={index !== undefined}
          onEvmIndex={setEvmIndex}
          onWords={() => void showWords()}
          onLink={index === undefined ? undefined : () => void onLink('evm', index)}
          onVerify={() =>
            void run(async ({ auth }, session) => {
              if (!canUseKeys(session)) return;
              const login = bitcoinLoginRing(session.keys);
              try {
                const rows = auth.verifyServerAddresses(session.wallet, login.ring);
                setChecks(rows.map((item) => ({ address: item.address, matches: item.matches })));
              } finally {
                login.release();
              }
            })
          }
          onRefresh={() =>
            void run(async ({ api }, session) => {
              await refreshWallet(api, session.accessToken, session.wallet.id);
            })
          }
          onStatus={() =>
            void run(async ({ api }, session) => {
              const rows = await api.passkey.credentialStatus([session.wallet.credentialId]);
              setNote(rows.map((item) => `${item.credentialId}: ${item.status}`).join(', ') || 'No credential status.');
            })
          }
          onDiagnostics={() =>
            void run(async ({ api }) => {
              await api.passkey.diagnostics({ stage: 'Authentication', outcome: 'Success' });
              setNote('Sent. Thank you!');
            })
          }
          onAnotherPasskey={startAnother}
          onRevoke={() => openSheet('revoke')}
          onCancel={onCancel}
          onClose={closeSheet}
        />
      )}
      {sheet === 'words' && (
        <PasskeyWordsSheet
          words={words}
          note={note}
          acknowledged={wordsAcknowledged}
          busy={busy}
          onAcknowledged={setWordsAcknowledged}
          onClose={closeSheet}
          onDone={() =>
            void run(async ({ api }, session) => {
              const updated = await api.passkey.backupSeen(session.wallet.id, session.accessToken);
              replaceWallet(updated);
              closeSheet();
            })
          }
        />
      )}
      {sheet === 'revoke' && (
        <PasskeyRevokeSheet
          note={note}
          backupNeeded={backupNeeded}
          acknowledged={revokeAcknowledged}
          busy={busy}
          reason={reason}
          method={method}
          onBackup={() => void showWords()}
          onReason={setReason}
          onMethod={setMethod}
          onAcknowledged={setRevokeAcknowledged}
          onClose={closeSheet}
          onRevoke={() => void (method === 'passkey' ? onRevokeWithPasskey(reason) : onRevokeById(reason))}
        />
      )}
      {sheet === 'receive' && (
        <PasskeySheet
          title={t('Receive')}
          onClose={() => {
            setReceive(false);
            closeSheet();
          }}
        >
          <p className="my-3 inline-block rounded-full bg-[#EEF2F8] px-3 py-1 text-sm font-semibold">
            {t('Ethereum & EVM networks')}
          </p>
          {receiveAddress ? (
            <>
              <PasskeyReceive address={receiveAddress} onCopy={() => copyAddress(receiveAddress)} />
            </>
          ) : (
            <p role="alert">{t('Unable to derive the address.')}</p>
          )}
        </PasskeySheet>
      )}
      {sheet === 'pay' && (
        <PasskeyPaySheet
          onClose={closeSheet}
          onPasteLink={() => {
            if (onPasteLink) onPasteLink();
            else toastMessage('Coming soon');
          }}
        />
      )}
    </main>
  );
}
