// DFX App 2.0 — sell payout bank-account picker (bottom sheet).
//
// Lists the signed-in user's saved payout accounts (`useBankAccountContext()` — real API
// data, no separate fetch of our own) and lets them add a new one. The add-IBAN step runs the
// same client-side check the static app used before ever calling the API (iban.ts —
// `ibanCheck`), then creates it via `createAccount({ iban })`.

import { useState } from 'react';
import type { BankAccount } from '@dfx.swiss/react';
import { useBankAccountContext } from '@dfx.swiss/react';
import { ibanCheck, ibanErrorMessage } from '../../screens/trade/iban';
import { Sheet, SheetHeader, Spinner, onActivate, useToast } from '../ui';
import { useT } from '../../i18n';

interface BankAccountPickerProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  value?: BankAccount;
  onSelect: (account: BankAccount) => void;
}

export function BankAccountPicker({ open, onClose, titleId, value, onSelect }: BankAccountPickerProps) {
  const { t } = useT();
  const { showToast } = useToast();
  const { bankAccounts, isLoading, createAccount } = useBankAccountContext();
  const [adding, setAdding] = useState(false);
  const [iban, setIban] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const accounts = bankAccounts ?? [];

  const close = () => {
    setAdding(false);
    setIban('');
    setFieldError('');
    onClose();
  };

  const pick = (account: BankAccount) => {
    onSelect(account);
    close();
  };

  const submitNewIban = async () => {
    const check = ibanCheck(iban);
    if (!check.ok) {
      setFieldError(ibanErrorMessage(t, check));
      return;
    }
    setFieldError('');
    setSubmitting(true);
    try {
      const account = await createAccount({ iban: iban.replace(/\s+/g, '').toUpperCase() });
      setSubmitting(false);
      showToast(t('personalIbanCreated'));
      pick(account);
    } catch {
      setSubmitting(false);
      setFieldError(t('genErr'));
    }
  };

  return (
    <Sheet open={open} onClose={close} titleId={titleId}>
      <SheetHeader titleId={titleId} title={t('baAdd')} onClose={close} />
      <div className="slist" style={{ padding: '6px 16px 22px' }}>
        {!adding ? (
          <>
            {isLoading && (
              <div className="glass tkempty">
                <Spinner /> {t('loading')}
              </div>
            )}
            {!isLoading && !accounts.length && <p className="tnote">{t('noBankAccts')}</p>}
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                className={`swrow${value?.id === account.id ? ' active' : ''}`}
                onClick={() => pick(account)}
                disabled={value?.id === account.id}
              >
                <span className="swlogo">
                  <svg viewBox="0 0 24 24" fill="none" style={{ width: 22, height: 22 }}>
                    <rect x={3} y={6} width={18} height={12} rx={2.4} stroke="#0E3A63" strokeWidth={1.7} />
                    <path d="M3 10h18" stroke="#0E3A63" strokeWidth={1.7} />
                  </svg>
                </span>
                <span className="swtx">
                  <b>{account.label || account.iban}</b>
                  {account.label && <small>{account.iban}</small>}
                </span>
                {account.default && <span className="pill-chip act">{t('baDefault')}</span>}
              </button>
            ))}
            <button type="button" className="swrow add" onClick={() => setAdding(true)}>
              <span className="swlogo plus">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
              </span>
              <span className="swtx">
                <b>{t('baAdd')}</b>
              </span>
            </button>
          </>
        ) : (
          <div style={{ padding: '2px 2px 4px' }}>
            <p className="tnote" style={{ padding: 0, marginBottom: 10 }}>
              {t('sellNeedIban')}
            </p>
            <div className="efield">
              <input
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                placeholder="CH.. / DE.."
                autoComplete="off"
                aria-label={t('payoutIban')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitNewIban();
                }}
              />
              <button
                type="button"
                aria-label={t('baAddBtn')}
                disabled={submitting}
                onClick={() => void submitNewIban()}
              >
                {submitting ? (
                  <Spinner />
                ) : (
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 12h14m0 0-6-6m6 6-6 6"
                      stroke="#fff"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            </div>
            {fieldError && (
              <div className="paybox-note warn" style={{ marginTop: 8 }}>
                {fieldError}
              </div>
            )}
            <div
              className="backrow"
              role="button"
              tabIndex={0}
              style={{ padding: '12px 0 0' }}
              onClick={() => setAdding(false)}
              onKeyDown={onActivate(() => setAdding(false))}
            >
              <span>{t('cancel')}</span>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
