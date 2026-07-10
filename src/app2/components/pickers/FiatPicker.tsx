// DFX App 2.0 — fiat currency picker (bottom sheet).
//
// Ported from the static app's `#curSheet` (public/app2/index.html: `buildCurrency()`),
// same `.slist`/`.optrow` markup as the currency/language/payment-method pickers.

import type { Fiat } from '@dfx.swiss/react';
import { FiatGlyph } from '../../screens/trade/glyphs';
import { Sheet, SheetHeader, onActivate } from '../ui';
import { useT } from '../../i18n';

interface FiatPickerProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  currencies: Fiat[];
  value?: Fiat;
  onSelect: (currency: Fiat) => void;
}

const CHECK_ICON = (
  <svg className="ck" viewBox="0 0 24 24" fill="none">
    <path d="M5 12l4 4 10-10" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function FiatPicker({ open, onClose, titleId, currencies, value, onSelect }: FiatPickerProps) {
  const { t } = useT();

  return (
    <Sheet open={open} onClose={onClose} titleId={titleId}>
      <SheetHeader titleId={titleId} title={t('chooseCur')} onClose={onClose} />
      <div className="slist" style={{ paddingBottom: 24 }}>
        {currencies.map((fiat) => {
          const selected = value?.id === fiat.id;
          const pick = () => {
            onSelect(fiat);
            onClose();
          };
          return (
            <div
              key={fiat.id}
              className={`optrow${selected ? ' sel' : ''}`}
              role="button"
              tabIndex={0}
              onClick={pick}
              onKeyDown={onActivate(pick)}
            >
              <span style={{ flex: '0 0 auto', lineHeight: 0 }}>
                <FiatGlyph code={fiat.name} />
              </span>
              <div className="oi">
                <b>{fiat.name}</b>
              </div>
              {CHECK_ICON}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
