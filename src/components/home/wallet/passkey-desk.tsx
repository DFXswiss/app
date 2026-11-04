import type { PasskeyWallet } from '@dfx.swiss/core';
import { useAuthContext } from '@dfx.swiss/react';
import { StyledButton, StyledButtonColor, StyledButtonWidth, StyledVerticalStack } from '@dfx.swiss/react-components';
import type { KeyRing, WalletState } from '@dfx.swiss/wallet';
import { useRef, useState, useSyncExternalStore } from 'react';
import { useSettingsContext } from '../../../contexts/settings.context';
import {
  createPasskeyClients,
  type PasskeyClients,
  passkeyMessage,
  PASSKEY_LOCKED,
  PASSKEY_SEED_MISMATCH,
} from './passkey-host';
import { getOpenPasskey, setOpenPasskey, subscribeOpenPasskey, type OpenPasskey } from './passkey-session';

export interface PasskeyDeskProps {
  onOpenApp: () => void;
  onCancel: () => void;
  onRevoked: () => void;
}

function stateText(state: WalletState): string {
  if (state === 'locked') return PASSKEY_LOCKED;
  if (state === 'seed-mismatch') return PASSKEY_SEED_MISMATCH;
  if (state === 'compromised') return 'This passkey was revoked as compromised';
  if (state === 'open-elsewhere') return 'This wallet is open in another tab';
  return 'The wallet is unlocked.';
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

// Every account route of the merged passkey wallet, after a ceremony has remembered the session.
// Keys stay in tab memory. Opening the app is a separate step.
export default function PasskeyDesk({ onOpenApp, onCancel, onRevoked }: PasskeyDeskProps): JSX.Element {
  const { translate } = useSettingsContext();
  const { getAuthToken } = useAuthContext();
  const open = useSyncExternalStore(subscribeOpenPasskey, getOpenPasskey, getOpenPasskey);
  const [evmIndex, setEvmIndex] = useState('1');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  const [words, setWords] = useState<string[]>();
  const [checks, setChecks] = useState<{ address: string; matches: boolean }[]>();
  const busyRef = useRef(false);

  async function run(action: (clients: PasskeyClients, session: OpenPasskey) => Promise<void>): Promise<void> {
    const session = getOpenPasskey();
    if (!session || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNote(undefined);
    try {
      await action(createPasskeyClients(), session);
    } catch (caught) {
      setNote(passkeyMessage(caught));
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

  async function onLink(family: 'bitcoin' | 'evm'): Promise<void> {
    const session = getOpenPasskey();
    if (!session || !session.wallet || !canUseKeys(session)) return;
    const index = evmIndexOf(evmIndex);
    if (family === 'evm' && index === undefined) return;
    const keys = session.keys;
    const token = session.accessToken;
    const walletId = session.wallet.id;
    const accountIndex = family === 'evm' && index !== undefined ? index : 0;
    await run(async ({ auth, api }) => {
      const linked = await auth.link(family, token, keys, accountIndex);
      // The link response is an address token. Further account routes still need the ceremony token.
      const linkedText = `Linked ${linked.address.family} ${linked.address.address}.`;
      try {
        await refreshWallet(api, token, walletId);
      } catch (caught) {
        setNote(`${linkedText} ${passkeyMessage(caught)}`);
        return;
      }
      setNote(linkedText);
    });
  }

  async function onRevokeWithPasskey(reason: 'Lost' | 'Compromised'): Promise<void> {
    await run(async ({ auth }) => {
      await auth.revoke(reason);
      setWords(undefined);
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
        setOpenPasskey(undefined);
        onRevoked();
        return;
      }
      replaceWallet(updated);
      setNote(`Wallet status is ${updated.status}.`);
    });
  }

  if (!open) return <StyledVerticalStack gap={2} center />;

  const unlocked = canUseKeys(open);
  const index = evmIndexOf(evmIndex);
  const addresses = open.wallet?.addresses ?? [];

  return (
    <StyledVerticalStack gap={2} center>
      <p className="text-dfxBlue-800">{translate('screens/home', 'Passkey wallet')}</p>
      <p className="text-dfxGray-700">
        {translate(
          'screens/home',
          `Wallet ${open.wallet?.id ?? ''}, ${open.wallet?.status ?? 'unknown'}, ${open.state}.`,
        )}
      </p>
      <p className="text-dfxGray-700">{translate('screens/home', stateText(open.state))}</p>

      <ul className="w-full text-left text-dfxBlue-800">
        {addresses.map((address) => {
          const mark = checks?.find((row) => row.address === address.address);
          const verdict = mark ? (mark.matches ? 'matches' : 'differs') : '';
          return (
            <li key={`${address.family}:${address.path}:${address.address}`}>
              {address.family} {address.address} {address.path} {verdict}
            </li>
          );
        })}
      </ul>

      {note ? <p className="text-dfxGray-700">{translate('screens/home', note)}</p> : null}
      {words ? (
        <p data-testid="passkey-recovery-words" className="break-all text-dfxBlue-800">
          {words.join(' ')}
        </p>
      ) : null}

      <StyledButton
        width={StyledButtonWidth.FULL}
        label={translate('screens/home', 'Open the app')}
        onClick={onOpenApp}
        disabled={busy}
      />
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.GRAY}
        label={translate('screens/home', 'Unlock wallet')}
        onClick={() =>
          void run(async ({ auth }) => {
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
          })
        }
        disabled={busy}
      />
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.GRAY}
        label={translate('screens/home', 'Link Bitcoin')}
        onClick={() => void onLink('bitcoin')}
        disabled={busy || !unlocked}
      />
      <label className="w-full text-left text-dfxBlue-800" htmlFor="passkey-evm-index">
        {translate('screens/home', 'EVM account index')}
        <input
          id="passkey-evm-index"
          inputMode="numeric"
          value={evmIndex}
          disabled={busy}
          onChange={(event) => setEvmIndex(event.target.value)}
          className="mt-1 w-full rounded-md border border-dfxGray-500 p-4 text-base font-normal"
        />
      </label>
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.GRAY}
        label={translate('screens/home', 'Link EVM account')}
        onClick={() => void onLink('evm')}
        disabled={busy || !unlocked || index === undefined}
      />
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.GRAY}
        label={translate('screens/home', 'Refresh wallets')}
        onClick={() =>
          void run(async ({ api }, session) => {
            await refreshWallet(api, session.accessToken, session.wallet.id);
          })
        }
        disabled={busy || open.wallet?.id === undefined}
      />
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.GRAY}
        label={translate('screens/home', 'Mark backup seen')}
        onClick={() =>
          void run(async ({ api }, session) => {
            const updated = await api.passkey.backupSeen(session.wallet.id, session.accessToken);
            replaceWallet(updated);
            setNote('Backup marked as seen.');
          })
        }
        disabled={busy || open.wallet?.id === undefined}
      />
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.GRAY}
        label={translate('screens/home', 'Check server addresses')}
        onClick={() =>
          void run(async ({ auth }, session) => {
            if (!canUseKeys(session)) return;
            const rows = auth.verifyServerAddresses(session.wallet, session.keys);
            setChecks(rows.map((row) => ({ address: row.address, matches: row.matches })));
            setNote(`Checked ${rows.length} addresses.`);
          })
        }
        disabled={busy || !unlocked}
      />
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.GRAY}
        label={translate('screens/home', 'Credential status')}
        onClick={() =>
          void run(async ({ api }, session) => {
            const rows = await api.passkey.credentialStatus([session.wallet.credentialId]);
            setNote(rows.map((row) => `${row.credentialId}: ${row.status}`).join(', ') || 'No credential status.');
          })
        }
        disabled={busy || !open.wallet?.credentialId}
      />
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.GRAY}
        label={translate('screens/home', 'Record a diagnostic')}
        onClick={() =>
          void run(async ({ api }) => {
            await api.passkey.diagnostics({ stage: 'Authentication', outcome: 'Success' });
            setNote('Diagnostic recorded.');
          })
        }
        disabled={busy}
      />
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.GRAY}
        label={translate('screens/home', words ? 'Hide recovery words' : 'Show recovery words')}
        onClick={() => {
          if (words) {
            setWords(undefined);
            return;
          }
          const session = getOpenPasskey();
          if (!session || !canUseKeys(session)) return;
          void run(async ({ auth }) => {
            const current = getOpenPasskey();
            const id = current?.wallet?.credentialId;
            const exported = await auth.exportMnemonic(id ? credentialBytes(id) : undefined);
            setWords(exported);
            setNote('Recovery words stay on this page until you hide them.');
          });
        }}
        disabled={busy || (!words && !unlocked)}
      />
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.RED}
        label={translate('screens/home', 'Revoke with passkey as lost')}
        onClick={() => void onRevokeWithPasskey('Lost')}
        disabled={busy}
      />
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.RED}
        label={translate('screens/home', 'Revoke with passkey as compromised')}
        onClick={() => void onRevokeWithPasskey('Compromised')}
        disabled={busy}
      />
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.RED}
        label={translate('screens/home', 'Revoke this wallet by id as lost')}
        onClick={() => void onRevokeById('Lost')}
        disabled={busy || open.wallet?.id === undefined}
      />
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.RED}
        label={translate('screens/home', 'Revoke this wallet by id as compromised')}
        onClick={() => void onRevokeById('Compromised')}
        disabled={busy || open.wallet?.id === undefined}
      />
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.GRAY}
        label={translate('screens/home', 'Start another ceremony')}
        onClick={() => {
          if (busyRef.current) return;
          setWords(undefined);
          setOpenPasskey(undefined);
        }}
        disabled={busy}
      />
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.RED}
        label={translate('general/actions', 'Close')}
        onClick={onCancel}
        disabled={busy}
      />
    </StyledVerticalStack>
  );
}
