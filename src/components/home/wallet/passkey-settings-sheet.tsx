import { useSettingsContext } from '../../../contexts/settings.context';
import PasskeySheet from './passkey-sheet';

interface PasskeySettingsSheetProps {
  unlocked: boolean;
  backupNeeded: boolean;
  backupSeenDate?: string;
  credentialId: string;
  busy: boolean;
  note?: string;
  checks?: { family: string; address: string; matches: boolean }[];
  evmIndex: string;
  validEvmIndex: boolean;
  onEvmIndex: (value: string) => void;
  onWords: () => void;
  onLink?: () => void;
  onVerify: () => void;
  onRefresh: () => void;
  onStatus: () => void;
  onDiagnostics: () => void;
  onAnotherPasskey: () => void;
  onRevoke: () => void;
  onCancel: () => void;
  onClose: () => void;
}

const icons = {
  key: 'M8 11a4 4 0 100 8 4 4 0 000-8zM11 12l8-8M16 7l2 2M14 9l2 2',
  words: 'M5 3h14v18H5zM9 8h6M9 12h6M9 16h3',
  evm: 'M4 7h16M4 12h16M4 17h10',
  verify: 'M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6zM9 12l2 2 4-4',
  storage: 'M7 3h10v18H7zM11 18h2',
  refresh: 'M20 12a8 8 0 11-2.3-5.6M20 4v4h-4',
  status: 'M12 3a9 9 0 110 18 9 9 0 010-18zM12 8h.01M11 12h1v4h1',
  diagnostic: 'M4 12h3l2-6 4 12 2-6h5',
  another: 'M16 17l5-5-5-5M21 12H9M12 21H5a2 2 0 01-2-2V5a2 2 0 012-2h7',
  language:
    'M12 3a9 9 0 110 18 9 9 0 010-18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z',
  revoke: 'M12 3a9 9 0 110 18 9 9 0 010-18zM5.6 5.6l12.8 12.8',
};

function Icon({ path, danger = false }: { path: string; danger?: boolean }): JSX.Element {
  return (
    <span
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-md bg-white ${danger ? 'text-[#B4233D]' : 'text-dfxBlue-800'}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={path} />
      </svg>
    </span>
  );
}

function Chevron(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px] shrink-0 text-dfxGray-800"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export default function PasskeySettingsSheet(props: PasskeySettingsSheetProps): JSX.Element {
  const { translate, language, availableLanguages, changeLanguage } = useSettingsContext();
  const t = (key: string) => translate('screens/home', key);
  const row =
    'flex min-h-[60px] w-full items-center gap-3 border-b border-dfxGray-400 px-4 py-3 text-left last:border-b-0 focus-visible:outline focus-visible:outline-2';
  const text = 'min-w-0 flex-1 text-base font-medium';
  const sub = 'block text-sm font-normal leading-5 text-dfxGray-800';
  const group = 'mt-6 px-1 pb-2 text-sm font-semibold text-dfxGray-800';
  const card = 'overflow-hidden rounded-[16px] bg-dfxGray-300';
  const button =
    'min-h-[44px] rounded-md border border-dfxGray-500 bg-white px-4 font-semibold focus-visible:outline focus-visible:outline-2';
  const badge = props.backupNeeded
    ? 'border border-[#F2D38A] bg-[#FFF6E0] text-[#8A5A00]'
    : 'bg-[#E9F6EE] text-dfxGreen-300';
  const refreshResult = props.note?.startsWith('Wallets on this account:');
  const diagnosticsResult = props.note === 'Sent. Thank you!';
  const statusResult =
    props.note &&
    (props.note === 'No credential status.' ||
      Boolean(props.credentialId && props.note.includes(`${props.credentialId}:`)))
      ? props.note
      : undefined;
  const linkResult = /^Linked Evm 0x[0-9a-f]{40}\.$/i.test(props.note ?? '');
  const checksColor = props.checks?.every((item) => item.matches) ? 'text-dfxGreen-300' : 'text-dfxRed-150';
  return (
    <PasskeySheet title={t('Settings')} onClose={props.onClose} busy={props.busy}>
      <div className="mb-5 flex items-center gap-3 rounded-[16px] bg-[#EEF2F8] px-4 py-3.5">
        <Icon path={icons.key} />
        <div>
          <b className="block text-base font-semibold">{t('Passkey on this device')}</b>
          <span
            className={`mt-1 inline-block rounded-[6px] px-2 py-0.5 text-xs font-semibold ${props.unlocked ? 'bg-[#E9F6EE] text-dfxGreen-300' : 'border border-dfxGray-500 bg-white text-dfxGray-800'}`}
          >
            {t(props.unlocked ? 'Unlocked' : 'Locked')}
          </span>
        </div>
      </div>
      {props.note && !refreshResult && !diagnosticsResult && !statusResult && !linkResult && (
        <p role="alert" className="my-3 break-all text-dfxRed-150">
          {t(props.note)}
        </p>
      )}
      <h3 className={group}>{t('Security')}</h3>
      <div className={card}>
        <button className={row} disabled={props.busy} onClick={props.onWords}>
          <Icon path={icons.words} />
          <span className={text}>
            {t('Recovery words')}
            <small className={sub}>{t(props.unlocked ? 'In case the passkey is gone' : 'Unlock to view')}</small>
            <small className={`mt-1 inline-block rounded-[6px] px-2 py-0.5 text-xs font-semibold ${badge}`}>
              {props.backupNeeded ? t('Not backed up') : `${t('Backed up on')} ${props.backupSeenDate}`}
            </small>
          </span>
          <Chevron />
        </button>
        <div className={row}>
          <Icon path={icons.evm} />
          <div className="min-w-0 flex-1">
            <label className="block text-base font-medium" htmlFor="passkey-evm-index">
              {t('Another EVM account')}
              <small className={sub}>{t('Link account 1 to 99 to this passkey')}</small>
            </label>
            <div className="mt-2 flex w-full items-center gap-2">
              <input
                id="passkey-evm-index"
                inputMode="numeric"
                value={props.evmIndex}
                onChange={(event) => props.onEvmIndex(event.target.value)}
                className="h-11 min-w-0 flex-1 rounded border border-dfxGray-500 p-2"
              />
              <button
                disabled={props.busy || !props.unlocked || !props.validEvmIndex}
                className={button}
                onClick={props.onLink}
              >
                {t('Link')}
              </button>
            </div>
            {linkResult && (
              <small role="status" className="mt-1 block break-all text-sm font-semibold text-dfxGreen-300">
                {props.note}
              </small>
            )}
          </div>
        </div>
        <button className={row} disabled={props.busy || !props.unlocked} onClick={props.onVerify}>
          <Icon path={icons.verify} />
          <span className={text}>
            {t('Check addresses')}
            <small className={`${sub} ${props.checks ? `font-semibold ${checksColor}` : ''}`}>
              {props.checks
                ? `${props.checks.filter((item) => item.matches).length} / ${props.checks.length} ${t('addresses match')}`
                : t('Checks that DFX shows your own addresses')}
            </small>
          </span>
          <Chevron />
        </button>
        {props.checks && (
          <ul className="px-4 pb-3 text-sm">
            {props.checks.map((item, index) => (
              <li
                key={`${item.family}:${item.address}:${index}`}
                className={item.matches ? 'text-dfxGreen-300' : 'text-dfxRed-150'}
              >
                {item.family}{' '}
                <span className="font-mono">
                  {item.address.slice(0, 10)}…{item.address.slice(-8)}
                </span>
                : {t(item.matches ? 'Matches' : 'Differs')}
              </li>
            ))}
          </ul>
        )}
        <div className={row}>
          <Icon path={icons.storage} />
          <span className={text}>
            {t('Storage')}
            <small className={sub}>{t('Only on this device. If it is lost, you need your recovery words.')}</small>
          </span>
        </div>
      </div>
      <h3 className={group}>{t('Help')}</h3>
      <div className={card}>
        <button className={row} aria-label={t('Reload data')} disabled={props.busy} onClick={props.onRefresh}>
          <Icon path={icons.refresh} />
          <span className={text}>
            {t('Reload data')}
            {refreshResult && (
              <small role="status" className="block text-sm font-semibold text-dfxGreen-300">
                {props.note}
              </small>
            )}
          </span>
          <Chevron />
        </button>
        <button
          className={row}
          aria-label={t('Check passkey status')}
          disabled={props.busy || !props.credentialId}
          onClick={props.onStatus}
        >
          <Icon path={icons.status} />
          <span className={text}>
            {t('Check passkey status')}
            {statusResult && (
              <small role="status" className="block text-sm font-semibold text-dfxGreen-300">
                {t(statusResult)}
              </small>
            )}
          </span>
          <Chevron />
        </button>
        <button
          className={row}
          aria-label={t('Send diagnostics to support')}
          disabled={props.busy}
          onClick={props.onDiagnostics}
        >
          <Icon path={icons.diagnostic} />
          <span className={text}>
            {t('Send diagnostics to support')}
            {diagnosticsResult && (
              <small role="status" className="block text-sm font-semibold text-dfxGreen-300">
                {t('Sent. Thank you!')}
              </small>
            )}
          </span>
          <Chevron />
        </button>
        <button
          className={row}
          aria-label={t('Use another passkey')}
          disabled={props.busy}
          onClick={props.onAnotherPasskey}
        >
          <Icon path={icons.another} />
          <span className={text}>
            {t('Use another passkey')}
            <small className={sub}>{t('You will sign in again')}</small>
          </span>
          <Chevron />
        </button>
      </div>
      <h3 className={group}>{t('App')}</h3>
      <div className={card}>
        <label className={row} htmlFor="passkey-language">
          <Icon path={icons.language} />
          <span className={text}>
            {t('Language')}
            <small className={sub}>{t('Applies to the whole DFX app')}</small>
          </span>
          <select
            id="passkey-language"
            className="min-h-[44px] rounded border border-dfxGray-500 bg-white px-2"
            value={language?.symbol ?? ''}
            onChange={(event) => {
              const next = availableLanguages.find((item) => item.symbol === event.target.value);
              if (next) changeLanguage(next);
            }}
          >
            {availableLanguages.map((item) => (
              <option key={item.symbol} value={item.symbol}>
                {item.symbol}
              </option>
            ))}
          </select>
        </label>
      </div>
      <h3 className={group}>{t('Danger zone')}</h3>
      <div className={card}>
        <button className={`${row} text-[#B4233D]`} disabled={props.busy} onClick={props.onRevoke}>
          <Icon path={icons.revoke} danger />
          <span className={text}>{t('Block passkey')}</span>
          <Chevron />
        </button>
      </div>
      <button className={`${button} mt-5`} disabled={props.busy} onClick={props.onCancel}>
        {t('Close')}
      </button>
    </PasskeySheet>
  );
}
