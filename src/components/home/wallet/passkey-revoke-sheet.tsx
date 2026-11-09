import { useEffect, useRef } from 'react';
import { useSettingsContext } from '../../../contexts/settings.context';
import PasskeySheet from './passkey-sheet';

interface PasskeyRevokeSheetProps {
  note?: string;
  acknowledged: boolean;
  busy: boolean;
  returnFocus?: HTMLElement | null;
  reason: 'Lost' | 'Compromised';
  onReason: (value: 'Lost' | 'Compromised') => void;
  onAcknowledged: (value: boolean) => void;
  onRevoke: () => void;
  onClose: () => void;
}

export default function PasskeyRevokeSheet(props: PasskeyRevokeSheetProps): JSX.Element {
  const { translate } = useSettingsContext();
  const noteRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    noteRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [props.note]);
  const t = (key: string) => translate('screens/home', key);
  const button = 'min-h-[52px] rounded-md px-4 text-base font-semibold focus-visible:outline focus-visible:outline-2';

  return (
    <PasskeySheet title={t('Block passkey')} onClose={props.onClose} busy={props.busy} returnFocus={props.returnFocus}>
      {props.note && (
        <div ref={noteRef} role="alert" className="mb-3 scroll-mt-[68px] rounded-[16px] bg-[#EEF2F8] p-4 text-sm">
          {t(props.note)}
        </div>
      )}
      <p className="text-sm leading-5 text-dfxGray-800">
        {t('This passkey will no longer open the wallet. This cannot be undone.')}
      </p>
      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-dfxGray-800">{t('What happened?')}</legend>
        {(['Lost', 'Compromised'] as const).map((item) => (
          <label
            key={item}
            className={`mt-2 flex min-h-[60px] cursor-pointer items-start gap-3 rounded-md border p-3.5 ${props.reason === item ? 'border-dfxBlue-800 bg-[#EEF2F8] shadow-[inset_0_0_0_1px_#072440]' : 'border-dfxGray-600'}`}
          >
            <input
              type="radio"
              name="reason"
              aria-label={t(item === 'Lost' ? 'Passkey lost' : 'Passkey compromised')}
              checked={props.reason === item}
              onChange={() => props.onReason(item)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-dfxBlue-800"
            />
            <span>
              <b className="block text-base font-semibold">
                {t(item === 'Lost' ? 'Passkey lost' : 'Passkey compromised')}
              </b>
              <span className="mt-0.5 block text-sm leading-5 text-dfxGray-800">
                {t(
                  item === 'Lost'
                    ? 'Device gone, deleted or no longer accessible'
                    : 'Someone else may have access. Move your funds to a safe address with “Send” first.',
                )}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="mt-5 text-sm leading-5 text-dfxGray-800">{t('You confirm one last time with this passkey.')}</p>
      <label className="mt-5 flex min-h-[44px] items-start gap-3 text-[15px] leading-[22px]">
        <input
          type="checkbox"
          className="mt-0.5 h-[22px] w-[22px] shrink-0 accent-dfxBlue-800"
          checked={props.acknowledged}
          onChange={(event) => props.onAcknowledged(event.target.checked)}
        />
        {t('I understand that this cannot be undone.')}
      </label>
      <div className="mt-5 grid grid-cols-[1fr_1.4fr] gap-2">
        <button className={`${button} border border-dfxGray-600`} disabled={props.busy} onClick={props.onClose}>
          {t('Cancel')}
        </button>
        <button
          disabled={!props.acknowledged || props.busy}
          className={`${button} bg-[#B4233D] text-white disabled:bg-dfxGray-400 disabled:text-dfxGray-800`}
          onClick={props.onRevoke}
        >
          {t('Block')}
        </button>
      </div>
    </PasskeySheet>
  );
}
