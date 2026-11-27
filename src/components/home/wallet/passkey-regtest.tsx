import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsContext } from '../../../contexts/settings.context';
import { useClipboard } from '../../../hooks/clipboard.hook';
import { QrBasic } from '../../payment/qr-code';
import { passkeyMessage } from './passkey-host';
import { readRegtestBalance, readRegtestReceive, type RegtestBalance } from './passkey-regtest-keys';

export interface PasskeyRegtestProps {
  unlocked: boolean;
}

type BalanceView = { kind: 'loading' } | ({ kind: 'amount' } & RegtestBalance) | { kind: 'error'; message: string };

const SATS_PER_BTC = 100_000_000;

// Display only: the wallet package computes the balance in satoshis; the card shows it in BTC.
function formatBtc(sats: number): string {
  return (sats / SATS_PER_BTC).toFixed(8).replace(/\.?0+$/, '');
}

// Bitcoin regtest account of the passkey wallet on DEV and STG builds. The desk renders it only when
// regtestAvailable() holds. Regtest coins carry no value, so every label names the test network.
export default function PasskeyRegtest({ unlocked }: PasskeyRegtestProps): JSX.Element {
  const { translate } = useSettingsContext();
  const { copy, isCopying } = useClipboard();
  const [address, setAddress] = useState<string>();
  const [addressError, setAddressError] = useState<string>();
  const [balance, setBalance] = useState<BalanceView>();
  const loadId = useRef(0);

  useEffect(() => {
    loadId.current += 1;
    setBalance(undefined);
    if (!unlocked) {
      setAddress(undefined);
      setAddressError(undefined);
      return;
    }
    try {
      setAddress(readRegtestReceive());
      setAddressError(undefined);
    } catch (caught) {
      setAddress(undefined);
      setAddressError(passkeyMessage(caught));
    }
  }, [unlocked]);

  const loadBalance = useCallback(async (target: string): Promise<void> => {
    const id = ++loadId.current;
    setBalance({ kind: 'loading' });
    try {
      const result = await readRegtestBalance(target);
      if (id !== loadId.current) return;
      setBalance({ kind: 'amount', confirmed: result.confirmed, unconfirmed: result.unconfirmed });
    } catch (caught) {
      if (id !== loadId.current) return;
      setBalance({ kind: 'error', message: passkeyMessage(caught) });
    }
  }, []);

  useEffect(() => {
    if (address !== undefined) void loadBalance(address);
  }, [address, loadBalance]);

  function balanceText(): string {
    if (balance?.kind === 'amount') {
      const confirmed = translate('screens/home', 'Balance: {{amount}} BTC (regtest)', {
        amount: formatBtc(balance.confirmed),
      });
      if (balance.unconfirmed === 0) return confirmed;
      return `${confirmed} ${translate('screens/home', 'Pending: {{amount}} BTC', {
        amount: formatBtc(balance.unconfirmed),
      })}`;
    }
    if (balance?.kind === 'error') {
      return translate('screens/home', 'Balance not available: {{reason}}', {
        reason: translate('screens/home', balance.message),
      });
    }
    return translate('screens/home', 'Loading balance…');
  }

  return (
    <section
      data-testid="passkey-regtest"
      className="w-full rounded-2xl border border-dashed border-dfxRed-100 px-5 py-4 text-left"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-dfxBlue-800">{translate('screens/home', 'Bitcoin Regtest')}</h3>
        <span className="rounded-full bg-dfxRed-100 px-3 py-1 text-xs font-bold text-white">
          {translate('screens/home', 'Test network')}
        </span>
      </div>
      <p className="pt-1 text-sm text-dfxGray-700">
        {translate('screens/home', 'Regtest coins exist only on the DFX test environment and have no value.')}
      </p>

      {!unlocked ? (
        <p className="pt-3 text-dfxBlue-800">{translate('screens/home', 'Unlock the wallet to show this address.')}</p>
      ) : null}
      {addressError ? <p className="pt-3 text-dfxBlue-800">{translate('screens/home', addressError)}</p> : null}

      {address !== undefined ? (
        <div className="flex flex-col items-center gap-3 pt-3">
          <p className="w-full text-dfxBlue-800" data-testid="passkey-regtest-balance">
            {balanceText()}
          </p>
          <p data-testid="passkey-regtest-address" className="w-full select-all break-all text-dfxBlue-800">
            {address}
          </p>
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() => copy(address)}
              className="flex-1 rounded-full bg-dfxBlue-800 px-5 py-3 text-sm text-white"
            >
              {translate('screens/home', isCopying ? 'Copied' : 'Copy address')}
            </button>
            <button
              type="button"
              onClick={() => void loadBalance(address)}
              disabled={balance?.kind === 'loading'}
              className="flex-1 rounded-full border border-dfxBlue-800 px-5 py-3 text-sm text-dfxBlue-800"
            >
              {translate('screens/home', 'Refresh balance')}
            </button>
          </div>
          <div data-testid="passkey-regtest-qr">
            <QrBasic data={address} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
