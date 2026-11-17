import { PropsWithChildren, useEffect, useRef } from 'react';
import { useSettingsContext } from '../../../contexts/settings.context';

export default function PasskeySheet({
  title,
  onClose,
  busy,
  returnFocus,
  children,
}: PropsWithChildren<{
  title: string;
  onClose: () => void;
  busy?: boolean;
  returnFocus?: HTMLElement | null;
}>): JSX.Element {
  const { translate } = useSettingsContext();
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const focusTarget = useRef(returnFocus);
  close.current = onClose;
  useEffect(() => {
    const previous =
      focusTarget.current === undefined ? (document.activeElement as HTMLElement | null) : focusTarget.current;
    dialog.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') close.current();
      if (event.key !== 'Tab' || !dialog.current) return;
      const items = Array.from(
        dialog.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]',
        ),
      );
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="passkey-sheet-title"
        className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-t-[20px] bg-white text-left text-dfxBlue-800 shadow-xl sm:mx-6 sm:max-h-[86vh] sm:rounded-[20px]"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between bg-white px-5 py-3">
          <h2 id="passkey-sheet-title" className="text-[20px] font-bold">
            {title}
          </h2>
          <button
            className="min-h-[44px] min-w-[44px] rounded focus-visible:outline focus-visible:outline-2"
            aria-label={translate('screens/home', 'Close')}
            disabled={busy}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="px-5 pb-8">{children}</div>
      </div>
    </div>
  );
}
