import type { WalletState } from '@dfx.swiss/wallet';
import { useSettingsContext } from '../../../contexts/settings.context';

interface PasskeyWalletNotesProps {
  state: WalletState;
  unlocked: boolean;
  backupNeeded: boolean;
  busy: boolean;
  onUnlock: () => void;
  onBackup: () => void;
  onAnotherPasskey: () => void;
  onReload: () => void;
}

export default function PasskeyWalletNotes({
  state,
  unlocked,
  backupNeeded,
  busy,
  onUnlock,
  onBackup,
  onAnotherPasskey,
  onReload,
}: PasskeyWalletNotesProps): JSX.Element {
  const { translate } = useSettingsContext();
  const t = (key: string) => translate('screens/home', key);
  const button = 'min-h-[44px] rounded-lg px-4 font-semibold focus-visible:outline focus-visible:outline-2';
  const title =
    state === 'locked'
      ? 'Wallet locked'
      : state === 'seed-mismatch'
        ? 'Wrong passkey'
        : state === 'compromised'
          ? 'Passkey blocked'
          : 'Open in another tab';
  const description =
    state === 'locked'
      ? 'To send, receive or pay, unlock briefly with Face ID, fingerprint or device PIN.'
      : state === 'seed-mismatch'
        ? 'This passkey belongs to a different wallet. Sign in with the right passkey.'
        : state === 'compromised'
          ? 'This passkey was blocked as compromised and no longer opens the wallet.'
          : 'The wallet is already open in another tab. Close it and reload this page.';

  const shield = 'M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6zM12 8v5M12 16h.01';
  const information = 'M12 3a9 9 0 110 18 9 9 0 010-18zM12 8h.01M11 12h1v4h1';
  const alert = 'M12 3l9.5 16.5h-19zM12 10v4M12 17h.01';
  return (
    <>
      {state !== 'unlocked' && (
        <div
          className={`mt-3 grid grid-cols-[24px_1fr] gap-3 rounded-[16px] p-4 text-sm leading-5 ${
            state === 'locked' || state === 'open-elsewhere'
              ? 'bg-[#EEF2F8] text-dfxBlue-800'
              : 'border border-[#F2B8C2] bg-[#FEF0F2] text-[#7A1426]'
          }`}
        >
          <svg
            aria-hidden="true"
            className="mt-0.5 h-[22px] w-[22px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={state === 'locked' || state === 'open-elsewhere' ? information : alert} />
          </svg>
          <div>
            <b className="block text-base font-semibold">{t(title)}</b>
            <p className="mt-1">{t(description)}</p>
            {state === 'locked' ? (
              <button disabled={busy} className={`${button} mt-3 bg-dfxBlue-800 text-white`} onClick={onUnlock}>
                {t('Unlock')}
              </button>
            ) : state === 'open-elsewhere' ? (
              <button className={`${button} mt-3 bg-dfxBlue-800 text-white`} onClick={onReload}>
                {t('Reload')}
              </button>
            ) : (
              <button className={`${button} mt-3 bg-dfxBlue-800 text-white`} onClick={onAnotherPasskey}>
                {t('Use another passkey')}
              </button>
            )}
          </div>
        </div>
      )}
      {unlocked && backupNeeded && (
        <div className="mt-3 grid grid-cols-[24px_1fr] gap-3 rounded-[16px] border border-[#F2D38A] bg-[#FFF6E0] p-4 text-sm leading-5 text-[#8A5A00]">
          <svg
            aria-hidden="true"
            className="mt-0.5 h-[22px] w-[22px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={shield} />
          </svg>
          <div>
            <b className="block text-base font-semibold">{t('Back up your wallet')}</b>
            <p className="mt-1">
              {t('If you lose your passkey, only your recovery words get you back to your funds.')}
            </p>
            <button
              disabled={busy}
              className={`${button} mt-3 bg-dfxBlue-800 text-white disabled:opacity-50`}
              onClick={onBackup}
            >
              {t('Back up now')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
