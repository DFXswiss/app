// DFX App 2.0 — buy payment-method picker (bank transfer / instant).
//
// Ported from the static app's `payMethods()`/`#paySheet` (public/app2/index.html), corrected
// against what the API actually accepts for a buy (payment-info.service.ts `buyCheck`): Bank
// (SEPA) is always offered; Instant SEPA needs *both* the fiat's `instantSellable` (DFX sells the
// fiat leg to the user, same buy/sell-is-DFX's-side convention as trade/capabilities.ts) and the
// chosen asset's `instantBuyable` — checking only the fiat's `instantBuyable` (as the ported code
// originally did) is the wrong flag *and* the wrong direction, and ignores the asset entirely, so
// it could offer Instant for combinations the API rejects with a 400.
//
// Card is never offered: the API hard-disables it (fiat-dto.mapper.ts sets cardBuyable/
// cardSellable to `false` unconditionally, and payment-info.service.ts rejects
// FiatPaymentMethod.CARD outright) — there is no live combination that would make it succeed.

import { FiatPaymentMethod } from '@dfx.swiss/react';
import type { Asset, Fiat } from '@dfx.swiss/react';
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

/** Payment methods a buy of `asset` with `fiat` can actually settle with. Bank (SEPA) is always
 * offered; Instant SEPA only when both the fiat and the selected asset allow it. */
export function paymentMethodsFor(fiat: Fiat | undefined, asset: Asset | undefined): PaymentMethodOption[] {
  const out: PaymentMethodOption[] = [
    { id: FiatPaymentMethod.BANK, nameKey: 'payBankN', descKey: 'payBankD', icon: BANK_ICON },
  ];
  if (fiat?.instantSellable && asset?.instantBuyable) {
    out.push({ id: FiatPaymentMethod.INSTANT, nameKey: 'payInstN', descKey: 'payInstD', icon: INSTANT_ICON });
  }
  return out;
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
