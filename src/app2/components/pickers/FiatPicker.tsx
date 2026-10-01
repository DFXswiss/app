// DFX App 2.0 — fiat currency picker (bottom sheet).
//
// Ported from the static app's `#curSheet` (public/app2/index.html: `buildCurrency()`),
// same `.slist`/`.optrow` markup as the currency/language/payment-method pickers.

import type { Fiat } from '@dfx.swiss/react';
import { FiatGlyph } from '../../screens/trade/glyphs';
import { Sheet, SheetHeader, Spinner, onActivate } from '../ui';
import { useT } from '../../i18n';
import { cx } from '../../css';

interface FiatPickerProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  currencies: Fiat[];
  value?: Fiat;
  onSelect: (currency: Fiat) => void;
  loading?: boolean;
  loadError?: boolean;
  onRetry?: () => void;
  emptyMessage?: string;
}

const CHECK_ICON = (
  <svg className={cx('ck')} viewBox="0 0 24 24" fill="none">
    <path d="M5 12l4 4 10-10" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function FiatPicker({
  open,
  onClose,
  titleId,
  currencies,
  value,
  onSelect,
  loading = false,
  loadError = false,
  onRetry,
  emptyMessage,
}: FiatPickerProps) {
  const { t } = useT();

  return (
    <Sheet open={open} onClose={onClose} titleId={titleId}>
      <SheetHeader titleId={titleId} title={t('chooseCur')} onClose={onClose} />
      <div className={cx('slist')} style={{ paddingBottom: 24 }}>
        {loading ? (
          <p role="status" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Spinner /> {t('loading')}
          </p>
        ) : loadError ? (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span>{t('loadFail')}</span>
            {onRetry && (
              <button type="button" className={cx('btn-mini')} onClick={onRetry}>
                {t('retry')}
              </button>
            )}
          </div>
        ) : currencies.length === 0 && emptyMessage ? (
          <p role="status">{emptyMessage}</p>
        ) : (
          currencies.map((fiat) => {
            const selected = value?.id === fiat.id;
            const pick = () => {
              onSelect(fiat);
              onClose();
            };
            return (
              <div
                key={fiat.id}
                className={cx('optrow', selected && 'sel')}
                role="button"
                tabIndex={0}
                onClick={pick}
                onKeyDown={onActivate(pick)}
              >
                <span aria-hidden="true" style={{ flex: '0 0 auto', lineHeight: 0 }}>
                  <FiatGlyph code={fiat.name} />
                </span>
                <div className={cx('oi')}>
                  <b>{fiat.name}</b>
                </div>
                {CHECK_ICON}
              </div>
            );
          })
        )}
      </div>
    </Sheet>
  );
}
