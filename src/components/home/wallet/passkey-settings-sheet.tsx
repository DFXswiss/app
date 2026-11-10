import { useSettingsContext } from '../../../contexts/settings.context';
import PasskeySheet from './passkey-sheet';

interface PasskeySettingsSheetProps {
  credentialId: string;
  busy: boolean;
  note?: string;
  noteKind?: 'message' | 'refresh' | 'status' | 'diagnostics';
  checks?: { family: string; address: string; matches: boolean }[];
  onWords: () => void;
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
  verify: 'M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6zM9 12l2 2 4-4',
  refresh: 'M20 12a8 8 0 11-2.3-5.6M20 4v4h-4',
  status: 'M12 3a9 9 0 110 18 9 9 0 010-18zM12 8h.01M11 12h1v4h1',
  diagnostic: 'M4 12h3l2-6 4 12 2-6h5',
  another: 'M16 17l5-5-5-5M21 12H9M12 21H5a2 2 0 01-2-2V5a2 2 0 012-2h7',
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
  const { translate } = useSettingsContext();
  const t = (key: string) => translate('screens/home', key);
  const row =
    'flex min-h-[60px] w-full items-center gap-3 border-b border-dfxGray-400 px-4 py-3 text-left last:border-b-0 focus-visible:outline focus-visible:outline-2';
  const text = 'min-w-0 flex-1 text-base font-medium';
  const sub = 'block text-sm font-normal leading-5 text-dfxGray-800';
  const group = 'mt-6 px-1 pb-2 text-sm font-semibold text-dfxGray-800';
  const card = 'overflow-hidden rounded-[16px] bg-dfxGray-300';
  const button =
    'min-h-[44px] rounded-md border border-dfxGray-500 bg-white px-4 font-semibold focus-visible:outline focus-visible:outline-2';
  const refreshResult = props.noteKind === 'refresh';
  const diagnosticsResult = props.noteKind === 'diagnostics';
  const statusResult = props.noteKind === 'status';
  const checksColor = !props.checks?.length
    ? ''
    : props.checks.every((item) => item.matches)
      ? 'text-dfxGreen-300'
      : 'text-dfxRed-150';
  return (
    <PasskeySheet title={t('Settings')} onClose={props.onClose} busy={props.busy}>
      <div className="mb-5 flex items-center gap-3 rounded-[16px] bg-[#EEF2F8] px-4 py-3.5">
        <Icon path={icons.key} />
        <div>
          <b className="block text-base font-semibold">{t('Passkey on this device')}</b>
          <span className="mt-1 inline-block rounded-[6px] bg-[#E9F6EE] px-2 py-0.5 text-xs font-semibold text-dfxGreen-300">
            {t('Unlocked')}
          </span>
        </div>
      </div>
      {props.note && !refreshResult && !diagnosticsResult && !statusResult && (
        <p role="alert" className="my-3 break-all text-dfxRed-150">
          {t(props.note)}
        </p>
      )}
      <h3 className={group}>{t('Security')}</h3>
      <div className={card}>
        <button className={row} disabled={props.busy} onClick={props.onWords}>
          <Icon path={icons.words} />
          <span className={text}>{t('Recovery words')}</span>
          <Chevron />
        </button>
        <button className={row} disabled={props.busy} onClick={props.onVerify}>
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
                {t(
                  item.family === 'Spark'
                    ? 'Lightning (Spark)'
                    : item.family === 'Evm'
                      ? 'Ethereum & EVM'
                      : item.family,
                )}{' '}
                <span className="font-mono">
                  {item.address.slice(0, 10)}…{item.address.slice(-8)}
                </span>
                : {t(item.matches ? 'Matches' : 'Differs')}
              </li>
            ))}
          </ul>
        )}
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
                {props.note}
              </small>
            )}
          </span>
          <Chevron />
        </button>
        <button
          className={row}
          aria-label={t('Record a diagnostic')}
          disabled={props.busy}
          onClick={props.onDiagnostics}
        >
          <Icon path={icons.diagnostic} />
          <span className={text}>
            {t('Record a diagnostic')}
            {diagnosticsResult && (
              <small role="status" className="block text-sm font-semibold text-dfxGreen-300">
                {t('Diagnostic recorded.')}
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
