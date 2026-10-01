import { useT } from '../i18n';
import { cx } from '../css';
import { Sheet, SheetHeader } from './ui';

interface ConfirmationSheetProps {
  open: boolean;
  titleId: string;
  title: string;
  description: string;
  detail?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

/** Standard App 2.0 confirmation sheet for decisions involving a visible external value. */
export function ConfirmationSheet({
  open,
  titleId,
  title,
  description,
  detail,
  confirmLabel,
  onConfirm,
  onClose,
}: ConfirmationSheetProps) {
  const { t } = useT();

  return (
    <Sheet open={open} onClose={onClose} titleId={titleId}>
      <SheetHeader titleId={titleId} title={title} onClose={onClose} />
      <div className={cx('confirm')}>
        <p className={cx('csub')}>{description}</p>
        <div
          className={cx('glass')}
          style={{
            borderRadius: 12,
            padding: '12px 14px',
            margin: '14px 0',
            font: '600 14px ui-monospace, monospace',
            overflowWrap: 'anywhere',
          }}
        >
          {detail}
        </div>
        <div className={cx('qractions')}>
          <button type="button" className={cx('btn-mini')} onClick={onClose}>
            <span>{t('cancel')}</span>
          </button>
          <button type="button" className={cx('btn-mini')} onClick={onConfirm}>
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </Sheet>
  );
}
