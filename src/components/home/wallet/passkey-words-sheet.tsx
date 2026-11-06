import { useSettingsContext } from '../../../contexts/settings.context';
import PasskeySheet from './passkey-sheet';

interface PasskeyWordsSheetProps {
  words?: string[];
  note?: string;
  acknowledged: boolean;
  busy: boolean;
  onAcknowledged: (acknowledged: boolean) => void;
  onDone: () => void;
  onClose: () => void;
}

export default function PasskeyWordsSheet({
  words,
  note,
  acknowledged,
  busy,
  onAcknowledged,
  onDone,
  onClose,
}: PasskeyWordsSheetProps): JSX.Element {
  const { translate } = useSettingsContext();
  const t = (key: string) => translate('screens/home', key);

  return (
    <PasskeySheet title={t('Recovery words')} onClose={onClose}>
      <p className="my-3 text-sm leading-5 text-dfxGray-800">
        {t(
          'Write the 12 words on paper in this order. Anyone who knows them can access your funds. DFX will never ask for them.',
        )}
      </p>
      {note && (
        <p role="alert" className="text-dfxRed-150">
          {t(note)}
        </p>
      )}
      {words && (
        <ol data-testid="passkey-recovery-words" className="my-4 grid grid-cols-2 gap-2">
          {words.map((word, index) => (
            <li
              key={index}
              className="flex items-baseline gap-2 rounded-md bg-dfxGray-300 px-3 py-2.5 font-mono text-[15px]"
            >
              <span className="min-w-[16px] text-right font-sans text-xs text-dfxGray-800">{index + 1}</span> {word}
            </li>
          ))}
        </ol>
      )}
      <label className="flex min-h-[44px] items-center gap-3">
        <input type="checkbox" checked={acknowledged} onChange={(event) => onAcknowledged(event.target.checked)} />
        {t('I have written the words down on paper.')}
      </label>
      <button
        disabled={!acknowledged || !words || busy}
        className="mt-4 min-h-[44px] w-full rounded-lg bg-dfxBlue-800 px-4 font-semibold text-white disabled:bg-dfxGray-400 disabled:text-dfxGray-800 focus-visible:outline focus-visible:outline-2"
        onClick={onDone}
      >
        {t('Done')}
      </button>
    </PasskeySheet>
  );
}
