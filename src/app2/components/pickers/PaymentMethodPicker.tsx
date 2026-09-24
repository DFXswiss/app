// DFX App 2.0 — buy payment-method picker.
// Instant is intentionally unavailable in App2 until product approval. Bank remains the only
// offered buy method even when the API currently advertises Instant capability.

import { FiatPaymentMethod } from '@dfx.swiss/react';
import type { Asset, Fiat } from '@dfx.swiss/react';
import { Sheet, SheetHeader, onActivate } from '../ui';
import { useT, type TranslationKey } from '../../i18n';
import { cx } from '../../css';

export interface PaymentMethodOption {
  id: FiatPaymentMethod;
  nameKey: TranslationKey;
  descKey: TranslationKey;
  icon: JSX.Element;
}

const BANK_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x={3} y={6} width={18} height={12} rx={2.4} stroke="currentColor" strokeWidth={1.7} />
    <path d="M3 10h18" stroke="currentColor" strokeWidth={1.7} />
  </svg>
);
/** Available buy methods. Fiat/asset capabilities do not enable Instant before product approval. */
export function paymentMethodsFor(_fiat: Fiat | undefined, _asset: Asset | undefined): PaymentMethodOption[] {
  return [{ id: FiatPaymentMethod.BANK, nameKey: 'payBankN', descKey: 'payBankD', icon: BANK_ICON }];
}

interface PaymentMethodPickerProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  options: PaymentMethodOption[];
  value: FiatPaymentMethod;
  onSelect: (method: FiatPaymentMethod) => void;
}

export function PaymentMethodPicker({ open, onClose, titleId, options, value, onSelect }: PaymentMethodPickerProps) {
  const { t } = useT();

  return (
    <Sheet open={open} onClose={onClose} titleId={titleId}>
      <SheetHeader titleId={titleId} title={t('choosePay')} onClose={onClose} />
      <div className={cx('slist')} style={{ paddingBottom: 24 }}>
        {options.map((option) => {
          const selected = option.id === value;
          const pick = () => {
            onSelect(option.id);
            onClose();
          };
          return (
            <div
              key={option.id}
              className={cx('optrow', selected && 'sel')}
              role="button"
              tabIndex={0}
              onClick={pick}
              onKeyDown={onActivate(pick)}
            >
              <span className={cx('oic')}>{option.icon}</span>
              <div className={cx('oi')}>
                <b>{t(option.nameKey)}</b>
                <small>{t(option.descKey)}</small>
              </div>
              <svg className={cx('ck')} viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12l4 4 10-10"
                  stroke="currentColor"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
