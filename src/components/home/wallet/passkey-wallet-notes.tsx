import type { WalletState } from '@dfx.swiss/wallet';
import { useSettingsContext } from '../../../contexts/settings.context';

interface PasskeyWalletNotesProps {
  state: WalletState;
  busy: boolean;
  onUnlock: () => void;
}

export function walletStateDescription(state: WalletState): string {
  return state === 'seed-mismatch'
    ? 'This passkey belongs to a different wallet. Sign in with the right passkey.'
    : state === 'compromised'
      ? 'This passkey was blocked as compromised and no longer opens the wallet.'
      : 'The wallet is already open in another tab. Close it and reload this page.';
}

export default function PasskeyWalletNotes({ state, busy, onUnlock }: PasskeyWalletNotesProps): JSX.Element {
  const { translate } = useSettingsContext();
  const t = (key: string) => translate('screens/home', key);
  const button = 'min-h-[44px] rounded-lg px-4 font-semibold focus-visible:outline focus-visible:outline-2';
  if (state === 'unlocked') return <></>;

  return (
    <div className="mt-3 grid grid-cols-[24px_1fr] gap-3 rounded-[16px] bg-[#EEF2F8] p-4 text-sm leading-5 text-dfxBlue-800">
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
        <path d="M12 3a9 9 0 110 18 9 9 0 010-18zM12 8h.01M11 12h1v4h1" />
      </svg>
      <div>
        <b className="block text-base font-semibold">{t('Wallet locked')}</b>
        <p className="mt-1">{t('To use the wallet, unlock briefly with Face ID, fingerprint or device PIN.')}</p>
        <button disabled={busy} className={`${button} mt-3 bg-dfxBlue-800 text-white`} onClick={onUnlock}>
          {t('Unlock')}
        </button>
      </div>
    </div>
  );
}
