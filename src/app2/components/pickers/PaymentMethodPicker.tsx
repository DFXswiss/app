// DFX App 2.0 — buy payment-method picker (bank transfer / instant / card).
//
// Ported from the static app's `payMethods()`/`#paySheet` (public/app2/index.html) — the
// available methods are derived from the selected `Fiat`'s `instantBuyable`/`cardBuyable`
// flags (real API data), never hardcoded.

import { FiatPaymentMethod } from '@dfx.swiss/react';
import type { Fiat } from '@dfx.swiss/react';
import { Sheet, SheetHeader, onActivate } from '../ui';
import { useT, type TranslationKey } from '../../i18n';

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
const INSTANT_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
  </svg>
);
const CARD_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x={3} y={5} width={18} height={14} rx={2.4} stroke="currentColor" strokeWidth={1.7} />
    <path d="M3 9h18" stroke="currentColor" strokeWidth={1.7} />
  </svg>
);

/** Payment methods available for the given fiat currency, in the static app's order
 * (Bank always first, then Instant, then Card — only if the currency actually supports it). */
export function paymentMethodsFor(fiat: Fiat | undefined): PaymentMethodOption[] {
  const options: PaymentMethodOption[] = [
    { id: FiatPaymentMethod.BANK, nameKey: 'payBankN', descKey: 'payBankD', icon: BANK_ICON },
  ];
  if (fiat?.instantBuyable)
    options.push({ id: FiatPaymentMethod.INSTANT, nameKey: 'payInstN', descKey: 'payInstD', icon: INSTANT_ICON });
  if (fiat?.cardBuyable)
    options.push({ id: FiatPaymentMethod.CARD, nameKey: 'payCardN', descKey: 'payCardD', icon: CARD_ICON });
  return options;
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
      <div className="slist" style={{ paddingBottom: 24 }}>
        {options.map((option) => {
          const selected = option.id === value;
          const pick = () => {
            onSelect(option.id);
            onClose();
          };
          return (
            <div
              key={option.id}
              className={`optrow${selected ? ' sel' : ''}`}
              role="button"
              tabIndex={0}
              onClick={pick}
              onKeyDown={onActivate(pick)}
            >
              <span className="oic">{option.icon}</span>
              <div className="oi">
                <b>{t(option.nameKey)}</b>
                <small>{t(option.descKey)}</small>
              </div>
              <svg className="ck" viewBox="0 0 24 24" fill="none">
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
