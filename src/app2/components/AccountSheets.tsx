// DFX App 2.0 — account-management sheets (bank accounts · wallet addresses ·
// change email · verification call · display currency · CoinTracking key).
//
// Ported from the static preview's account-management flows
// (public/app2/index.html: `openBankAccounts()`, `openAddresses()`,
// `openChangeMail()`, `openVCall()`, `openCtKey()` and the currency picker).
// Every action goes through the real @dfx.swiss/react contexts — no bespoke
// fetching. Language uses the shared `LanguageSheet`; display currency reuses
// the shared `FiatPicker`, so all three preference sheets keep identical markup.

import {
  ApiException,
  type BankAccount,
  type Fiat,
  KycLevel,
  PhoneCallTime,
  type Referral,
  useApi,
  useBankAccountContext,
  useFiatContext,
  useUserContext,
} from '@dfx.swiss/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type TranslationKey, useT } from '../i18n';
import { shortAddress } from '../screens/parts/format';
import { ibanCheck, ibanErrorMessage } from '../screens/trade/iban';
import { FiatPicker } from './pickers/FiatPicker';
import { LanguageSheet } from './LanguageSheet';
import { Sheet, SheetHeader, Spinner, useToast } from './ui';

export type AccountSheet =
  'bankaccts' | 'addresses' | 'email' | 'vcall' | 'language' | 'currency' | 'ctkey' | 'referral';

interface SheetProps {
  open: boolean;
  onClose: () => void;
}

const COPY_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x={9} y={9} width={11} height={11} rx={2} stroke="currentColor" strokeWidth={1.8} />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
  </svg>
);

/** `•••• 1234` — mask an IBAN down to its last four, matching the static app's `maskIban`. */
function maskIban(iban: string): string {
  const s = (iban ?? '').replace(/\s+/g, '');
  return s.length <= 4 ? s : `•••• ${s.slice(-4)}`;
}

function copyToClipboard(value: string, showToast: (m: string) => void, t: (k: 'copied' | 'copyFail') => string) {
  if (!value || !navigator.clipboard) {
    showToast(t('copyFail'));
    return;
  }
  navigator.clipboard
    .writeText(value)
    .then(() => showToast(t('copied')))
    .catch(() => showToast(t('copyFail')));
}

/** Shared `.tinput` currency `<select>` — empty option + one per available fiat. */
function CurrencySelect({
  value,
  onChange,
  currencies,
}: {
  value: string;
  onChange: (value: string) => void;
  currencies: Fiat[];
}) {
  return (
    <select className="tinput" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {currencies.map((fiat) => (
        <option key={fiat.id} value={String(fiat.id)}>
          {fiat.name}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Bank accounts — list (default + currency badges), inline edit (label /
// preferred currency / set default) and inline remove-confirm, plus an add form.
// ---------------------------------------------------------------------------

function BankAccountsSheet({ open, onClose }: SheetProps) {
  const { t } = useT();
  const { showToast } = useToast();
  const { bankAccounts, isLoading, createAccount, updateAccount } = useBankAccountContext();
  const { currencies } = useFiatContext();

  const [iban, setIban] = useState('');
  const [addLabel, setAddLabel] = useState('');
  const [addCurrency, setAddCurrency] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  const [editId, setEditId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editCurrency, setEditCurrency] = useState('');
  const [removeId, setRemoveId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setIban('');
    setAddLabel('');
    setAddCurrency('');
    setAddError('');
    setEditId(null);
    setRemoveId(null);
  }, [open]);

  const fiats = currencies ?? [];
  const fiatById = (id: string): Fiat | undefined => fiats.find((f) => String(f.id) === id);
  const accounts = (bankAccounts ?? []).filter((b) => b.active !== false);

  const openEdit = (account: BankAccount) => {
    setRemoveId(null);
    if (editId === account.id) {
      setEditId(null);
      return;
    }
    setEditId(account.id);
    setEditLabel(account.label ?? '');
    setEditCurrency(account.preferredCurrency ? String(account.preferredCurrency.id) : '');
  };

  const openRemove = (account: BankAccount) => {
    setEditId(null);
    setRemoveId(removeId === account.id ? null : account.id);
  };

  const saveEdit = async (account: BankAccount) => {
    setBusyId(account.id);
    try {
      await updateAccount(account.id, { label: editLabel.trim(), preferredCurrency: fiatById(editCurrency) });
      showToast(t('saved'));
      setEditId(null);
    } catch {
      showToast(t('genErr'), { assertive: true });
    } finally {
      setBusyId(null);
    }
  };

  const setDefault = async (account: BankAccount) => {
    setBusyId(account.id);
    try {
      await updateAccount(account.id, { default: true });
      showToast(t('saved'));
      setEditId(null);
    } catch {
      showToast(t('genErr'), { assertive: true });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (account: BankAccount) => {
    setBusyId(account.id);
    try {
      await updateAccount(account.id, { active: false });
      showToast(t('saved'));
      setRemoveId(null);
    } catch {
      showToast(t('genErr'), { assertive: true });
    } finally {
      setBusyId(null);
    }
  };

  const add = async () => {
    const check = ibanCheck(iban);
    if (!check.ok) {
      setAddError(ibanErrorMessage(t, check));
      return;
    }
    setAdding(true);
    setAddError('');
    try {
      await createAccount({
        iban: iban.replace(/\s+/g, '').toUpperCase(),
        label: addLabel.trim() || undefined,
        preferredCurrency: fiatById(addCurrency),
      });
      showToast(t('saved'));
      setIban('');
      setAddLabel('');
      setAddCurrency('');
    } catch {
      setAddError(t('genErr'));
    } finally {
      setAdding(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} titleId="baSheetTitle">
      <SheetHeader titleId="baSheetTitle" title={t('bankAccounts')} onClose={onClose} />
      <div className="slist" style={{ paddingBottom: 24 }}>
        {isLoading && !accounts.length ? (
          <div className="ocp-empty" style={{ padding: 20, gap: 8 }}>
            <Spinner /> {t('loading')}
          </div>
        ) : (
          <>
            {!accounts.length && (
              <div className="ocp-empty" style={{ padding: '12px 4px 4px' }}>
                {t('noBankAccts')}
              </div>
            )}
            {accounts.map((account) => (
              <div
                key={account.id}
                className="glass"
                style={{ borderRadius: 14, padding: '12px 14px', marginBottom: 9 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b
                      style={{
                        display: 'block',
                        fontSize: 14,
                        color: '#fff',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontFeatureSettings: "'tnum'",
                      }}
                    >
                      {account.label || maskIban(account.iban)}
                    </b>
                    {account.label && (
                      <small
                        style={{
                          display: 'block',
                          fontSize: 12,
                          color: 'var(--t-muted)',
                          marginTop: 2,
                          fontFeatureSettings: "'tnum'",
                        }}
                      >
                        {maskIban(account.iban)}
                      </small>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      justifyContent: 'flex-end',
                    }}
                  >
                    {account.default && <span className="pill-chip act">{t('baDefault')}</span>}
                    {account.preferredCurrency?.name && (
                      <span className="pill-chip ina">{account.preferredCurrency.name}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
                  <button type="button" className="actpill" onClick={() => openEdit(account)}>
                    {t('baEdit')}
                  </button>
                  <button type="button" className="actpill danger" onClick={() => openRemove(account)}>
                    {t('baRemove')}
                  </button>
                </div>
                {editId === account.id && (
                  <div
                    className="tform"
                    style={{ marginTop: 10, borderTop: '1px solid var(--hair-soft)', paddingTop: 10 }}
                  >
                    <label className="flabel">{t('baLabel')}</label>
                    <input className="tinput" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
                    <label className="flabel">{t('baCurrency')}</label>
                    <CurrencySelect value={editCurrency} onChange={setEditCurrency} currencies={fiats} />
                    {!account.default && (
                      <button
                        type="button"
                        className="btn-mini"
                        style={{ width: 'auto', marginTop: 8 }}
                        disabled={busyId === account.id}
                        onClick={() => void setDefault(account)}
                      >
                        {t('baSetDefault')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ marginTop: 8 }}
                      disabled={busyId === account.id}
                      onClick={() => void saveEdit(account)}
                    >
                      {busyId === account.id ? <Spinner /> : t('save')}
                    </button>
                  </div>
                )}
                {removeId === account.id && (
                  <div style={{ marginTop: 10, borderTop: '1px solid var(--hair-soft)', paddingTop: 10 }}>
                    <div className="paybox-note warn" style={{ marginBottom: 9 }}>
                      {t('baRemoveConfirm')}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="btn-mini danger"
                        style={{ width: 'auto' }}
                        disabled={busyId === account.id}
                        onClick={() => void remove(account)}
                      >
                        {t('baRemoveYes')}
                      </button>
                      <button
                        type="button"
                        className="btn-mini"
                        style={{ width: 'auto' }}
                        onClick={() => setRemoveId(null)}
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div className="sectionlabel" style={{ padding: '14px 2px 8px' }}>
              {t('baAdd')}
            </div>
            <div className="tform">
              <label className="flabel">{t('iban')}</label>
              <input
                className="tinput"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                placeholder="CH.. / DE.."
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void add();
                }}
              />
              <label className="flabel">
                {t('baLabel')} <span style={{ color: 'var(--t-faint)', fontWeight: 400 }}>{t('optional')}</span>
              </label>
              <input
                className="tinput"
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                autoComplete="off"
              />
              <label className="flabel">{t('baCurrency')}</label>
              <CurrencySelect value={addCurrency} onChange={setAddCurrency} currencies={fiats} />
              {addError && (
                <div className="paybox-note warn" style={{ marginTop: 8 }}>
                  {addError}
                </div>
              )}
              <button
                type="button"
                className="btn-primary"
                style={{ marginTop: 10 }}
                disabled={adding}
                onClick={() => void add()}
              >
                {adding ? <Spinner /> : t('baAddBtn')}
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Wallet addresses — rename (label) and remove per linked address. Removing the
// active address hands off to the context (fallback address / sign-out) and
// closes the sheet.
// ---------------------------------------------------------------------------

function AddressesSheet({ open, onClose }: SheetProps) {
  const { t } = useT();
  const { showToast } = useToast();
  const { user, userAddresses, renameAddress, deleteAddress } = useUserContext();

  const [renameFor, setRenameFor] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [removeFor, setRemoveFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRenameFor(null);
    setRemoveFor(null);
  }, [open]);

  const activeAddress = user?.activeAddress?.address?.toLowerCase();

  const openRename = (address: string, current: string) => {
    setRemoveFor(null);
    if (renameFor === address) {
      setRenameFor(null);
      return;
    }
    setRenameFor(address);
    setLabel(current);
  };

  const save = async (address: string) => {
    setBusy(address);
    try {
      await renameAddress(address, label.trim());
      showToast(t('saved'));
      setRenameFor(null);
    } catch {
      showToast(t('genErr'), { assertive: true });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (address: string) => {
    setBusy(address);
    try {
      await deleteAddress(address);
      showToast(t('addrRemoved'));
      setRemoveFor(null);
      if (address.toLowerCase() === activeAddress) onClose();
    } catch {
      showToast(t('genErr'), { assertive: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} titleId="addrSheetTitle">
      <SheetHeader titleId="addrSheetTitle" title={t('addresses')} onClose={onClose} />
      <div className="slist" style={{ paddingBottom: 24 }}>
        {!userAddresses.length && (
          <div className="ocp-empty" style={{ padding: '12px 4px' }}>
            {t('noAddresses')}
          </div>
        )}
        {userAddresses.map((a) => {
          const active = activeAddress && a.address.toLowerCase() === activeAddress;
          return (
            <div key={a.address} className="glass" style={{ borderRadius: 14, padding: '12px 14px', marginBottom: 9 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b
                    style={{
                      display: 'block',
                      fontSize: 14,
                      color: '#fff',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {a.label || shortAddress(a.address)}
                  </b>
                  {a.label && (
                    <small style={{ display: 'block', fontSize: 12, color: 'var(--t-muted)', marginTop: 2 }}>
                      {shortAddress(a.address)}
                    </small>
                  )}
                </div>
                {active && <span className="pill-chip act">{t('addrActive')}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  className="actpill"
                  style={{ width: 'auto' }}
                  onClick={() => openRename(a.address, a.label ?? '')}
                >
                  {t('addrRename')}
                </button>
                <button
                  type="button"
                  className="actpill danger"
                  style={{ width: 'auto' }}
                  onClick={() => {
                    setRenameFor(null);
                    setRemoveFor(removeFor === a.address ? null : a.address);
                  }}
                >
                  {t('addrRemove')}
                </button>
              </div>
              {renameFor === a.address && (
                <div
                  className="tform"
                  style={{ marginTop: 10, borderTop: '1px solid var(--hair-soft)', paddingTop: 10 }}
                >
                  <label className="flabel">{t('baLabel')}</label>
                  <input className="tinput" value={label} onChange={(e) => setLabel(e.target.value)} />
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ marginTop: 8 }}
                    disabled={busy === a.address}
                    onClick={() => void save(a.address)}
                  >
                    {busy === a.address ? <Spinner /> : t('save')}
                  </button>
                </div>
              )}
              {removeFor === a.address && (
                <div style={{ marginTop: 10, borderTop: '1px solid var(--hair-soft)', paddingTop: 10 }}>
                  <div className="paybox-note warn" style={{ marginBottom: 9 }}>
                    {t('addrRemove')}?
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="btn-mini danger"
                      style={{ width: 'auto' }}
                      disabled={busy === a.address}
                      onClick={() => void remove(a.address)}
                    >
                      {t('baRemoveYes')}
                    </button>
                    <button
                      type="button"
                      className="btn-mini"
                      style={{ width: 'auto' }}
                      onClick={() => setRemoveFor(null)}
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Change email — request a 6-digit code for the new address, then verify it.
// ---------------------------------------------------------------------------

function ChangeEmailSheet({ open, onClose }: SheetProps) {
  const { t } = useT();
  const { showToast } = useToast();
  const { user, updateMail, verifyMail } = useUserContext();

  const [step, setStep] = useState<1 | 2>(1);
  const [mail, setMail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setMail(user?.mail ?? '');
    setCode('');
    setError('');
  }, [open, user?.mail]);

  const request = async () => {
    const value = mail.trim();
    if (!value || !value.includes('@')) {
      setError(t('tkNeedMail'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await updateMail(value);
      setStep(2);
    } catch (e) {
      setError(e instanceof ApiException && e.statusCode === 409 ? t('mailTaken') : t('mailErr'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    const token = code.trim();
    if (!/^\d{6}$/.test(token)) return;
    setBusy(true);
    setError('');
    try {
      await verifyMail(token);
      showToast(t('emailVerified'));
      onClose();
    } catch {
      setError(t('codeWrong'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} titleId="emailSheetTitle">
      <SheetHeader titleId="emailSheetTitle" title={t('changeEmail')} onClose={onClose} />
      <div className="slist" style={{ paddingBottom: 24 }}>
        {step === 1 ? (
          <>
            <p className="paybox-note" style={{ margin: '2px 2px 10px' }}>
              {t('changeEmailLead')}
            </p>
            <div className="tform">
              <label className="flabel">{t('newEmail')}</label>
              <input
                className="tinput"
                type="email"
                inputMode="email"
                placeholder="you@email.com"
                value={mail}
                onChange={(e) => setMail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void request();
                }}
              />
              {error && (
                <div className="paybox-note warn" style={{ marginTop: 8 }}>
                  {error}
                </div>
              )}
              <button
                type="button"
                className="btn-primary"
                style={{ marginTop: 10 }}
                disabled={busy}
                onClick={() => void request()}
              >
                {busy ? <Spinner /> : t('sendCode')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="paybox-note" style={{ margin: '2px 2px 10px' }}>
              {t('codeSent')} {mail}
            </p>
            <div className="tform">
              <label className="flabel">{t('emailCode')}</label>
              <input
                className="tinput"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                style={{ textAlign: 'center', letterSpacing: 6, fontSize: 18 }}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void verify();
                }}
              />
              {error && (
                <div className="paybox-note warn" style={{ marginTop: 8 }}>
                  {error}
                </div>
              )}
              <button
                type="button"
                className="btn-primary"
                style={{ marginTop: 10 }}
                disabled={busy}
                onClick={() => void verify()}
              >
                {busy ? <Spinner /> : t('verify')}
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Verification call — accept toggle + preferred call-time slots.
// ---------------------------------------------------------------------------

const PHONE_TIMES: PhoneCallTime[] = [
  PhoneCallTime.H_9_TO_10,
  PhoneCallTime.H_10_TO_11,
  PhoneCallTime.H_11_TO_12,
  PhoneCallTime.H_12_TO_13,
  PhoneCallTime.H_13_TO_14,
  PhoneCallTime.H_14_TO_15,
  PhoneCallTime.H_15_TO_16,
  PhoneCallTime.H_9_TO_16,
];

const PHONE_TIME_LABELS: Record<PhoneCallTime, string> = {
  [PhoneCallTime.H_9_TO_10]: '09:00–10:00',
  [PhoneCallTime.H_10_TO_11]: '10:00–11:00',
  [PhoneCallTime.H_11_TO_12]: '11:00–12:00',
  [PhoneCallTime.H_12_TO_13]: '12:00–13:00',
  [PhoneCallTime.H_13_TO_14]: '13:00–14:00',
  [PhoneCallTime.H_14_TO_15]: '14:00–15:00',
  [PhoneCallTime.H_15_TO_16]: '15:00–16:00',
  [PhoneCallTime.H_9_TO_16]: '09:00–16:00',
};

function VerificationCallSheet({ open, onClose }: SheetProps) {
  const { t } = useT();
  const { showToast } = useToast();
  const { user, updateCallSettings } = useUserContext();

  const [accept, setAccept] = useState(false);
  const [times, setTimes] = useState<Set<PhoneCallTime>>(new Set());
  const [busy, setBusy] = useState(false);

  const kyc = user?.kyc;
  useEffect(() => {
    if (!open) return;
    setAccept(!!kyc?.phoneCallAccepted);
    setTimes(new Set(kyc?.preferredPhoneTimes ?? []));
  }, [open, kyc]);

  const toggle = (value: PhoneCallTime) =>
    setTimes((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const save = async () => {
    setBusy(true);
    try {
      await updateCallSettings(Array.from(times), accept);
      showToast(t('saved'));
      onClose();
    } catch {
      showToast(t('genErr'), { assertive: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} titleId="vcallSheetTitle">
      <SheetHeader titleId="vcallSheetTitle" title={t('verifCall')} onClose={onClose} />
      <div className="slist" style={{ paddingBottom: 24 }}>
        <p className="paybox-note" style={{ margin: '2px 2px 12px' }}>
          {t('verifCallLead')}
        </p>
        <label className="amtoggle">
          <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
          <span>{t('acceptCall')}</span>
        </label>
        <div className="sectionlabel" style={{ padding: '14px 2px 8px' }}>
          {t('preferredTimes')}
        </div>
        <div className="tslots">
          {PHONE_TIMES.map((value) => (
            <button
              key={value}
              type="button"
              className={`tslot${times.has(value) ? ' on' : ''}`}
              onClick={() => toggle(value)}
            >
              {PHONE_TIME_LABELS[value]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn-primary"
          style={{ marginTop: 16 }}
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? <Spinner /> : t('save')}
        </button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// CoinTracking — read-only API key. If none exists yet, one is generated on
// open (the secret is only ever shown once, at creation); otherwise the stored
// read key is shown with a remove action so it can be regenerated.
// ---------------------------------------------------------------------------

function CoinTrackingSheet({ open, onClose }: SheetProps) {
  const { t } = useT();
  const { showToast } = useToast();
  const { keyCT, generateKeyCT, deleteKeyCT } = useUserContext();

  const [loading, setLoading] = useState(false);
  const [secret, setSecret] = useState<string | undefined>();
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const generated = useRef(false);

  useEffect(() => {
    if (!open) {
      generated.current = false;
      setSecret(undefined);
      setConflict(false);
      setError(false);
      return;
    }
    if (keyCT || generated.current) return;
    generated.current = true;
    setLoading(true);
    setError(false);
    generateKeyCT()
      .then((key) => setSecret(key?.secret))
      .catch((e) => {
        if (e instanceof ApiException && e.statusCode === 409) setConflict(true);
        else setError(true);
      })
      .finally(() => setLoading(false));
  }, [open, keyCT, generateKeyCT]);

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteKeyCT();
      showToast(t('ctDeleted'));
      onClose();
    } catch {
      showToast(t('genErr'), { assertive: true });
    } finally {
      setDeleting(false);
    }
  };

  const displayKey = keyCT ?? (conflict ? t('ctHaveKey') : undefined);

  return (
    <Sheet open={open} onClose={onClose} titleId="ctSheetTitle">
      <SheetHeader titleId="ctSheetTitle" title={t('ctConnect')} onClose={onClose} />
      <div className="slist" style={{ paddingBottom: 24 }}>
        {loading ? (
          <div
            className="paybox-note"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 14, fontSize: 13 }}
          >
            <Spinner /> {t('loading')}
          </div>
        ) : error ? (
          <div className="paybox-note warn" style={{ padding: 12 }}>
            {t('genErr')}
          </div>
        ) : (
          <>
            <div className="glass" style={{ borderRadius: 14, padding: '2px 14px' }}>
              <div className="kv">
                <span className="kk">{t('ctApiKey')}</span>
                <span className="vv">{displayKey ?? '—'}</span>
                {displayKey && !conflict && (
                  <button
                    type="button"
                    className="cpy"
                    aria-label={t('ctApiKey')}
                    onClick={() => copyToClipboard(displayKey, showToast, t)}
                  >
                    {COPY_ICON}
                  </button>
                )}
              </div>
              {secret && (
                <div className="kv">
                  <span className="kk">{t('ctSecret')}</span>
                  <span className="vv">{secret}</span>
                  <button
                    type="button"
                    className="cpy"
                    aria-label={t('ctSecret')}
                    onClick={() => copyToClipboard(secret, showToast, t)}
                  >
                    {COPY_ICON}
                  </button>
                </div>
              )}
            </div>
            <p className="paybox-note">{secret ? t('ctHint') : t('ctHintExisting')}</p>
            <button
              type="button"
              className="btn-mini danger"
              style={{ marginTop: 6 }}
              disabled={deleting}
              onClick={() => void remove()}
            >
              {deleting ? <Spinner /> : t('ctDelete')}
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Display currency — reuses the shared FiatPicker, persisting via updateCurrency.
// ---------------------------------------------------------------------------

function CurrencySheet({ open, onClose }: SheetProps) {
  const { t } = useT();
  const { showToast } = useToast();
  const { currencies } = useFiatContext();
  const { user, updateCurrency } = useUserContext();

  return (
    <FiatPicker
      open={open}
      onClose={onClose}
      titleId="acctCurTitle"
      currencies={currencies ?? []}
      value={user?.currency}
      onSelect={(fiat) => {
        void updateCurrency(fiat)
          .then(() => showToast(fiat.name))
          .catch(() => showToast(t('genErr'), { assertive: true }));
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Invite & earn — the full referral view behind the account's "Einladen &
// verdienen" row. Shows the user's own referral code/link (copy) with the
// commission rate and invited count, a form to create a personal per-person
// invite (name + optional email → generated code), and the list of the user's
// invitations with confirm/reject actions on the pending ones.
//
// Ported from `renderInvite()` / `recRow()` / `submitInvite()` / `confirmRec()`
// in the static preview. The referral summary comes from `getRef()` (passed in
// from the account screen); the per-person recommendation CRUD has no dedicated
// @dfx.swiss/react hook, so it uses the library's low-level `useApi().call`
// against `/recommendation` (a v1 endpoint — the API hook's default version).
// ---------------------------------------------------------------------------

const REF_LINK_BASE = 'https://app.dfx.swiss/login?code=';

interface Recommendation {
  id: number;
  name?: string;
  mail?: string;
  code?: string;
  status: string;
}

/** Chip variant per recommendation status (matches recRow's `chip` mapping). */
function statusChip(status: string): string {
  switch (status) {
    case 'Completed':
      return 'act';
    case 'Pending':
      return 'pend';
    case 'Rejected':
    case 'Expired':
      return 'ina';
    default:
      return 'rdy';
  }
}

const STATUS_LABEL_KEY: Record<string, TranslationKey> = {
  Created: 'st_Created',
  Pending: 'st_Pending',
  Completed: 'st_Completed',
  Rejected: 'st_Rejected',
  Expired: 'st_Expired',
};

const PERSON_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <circle cx={12} cy={8} r={4} stroke="currentColor" strokeWidth={1.8} />
    <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
  </svg>
);
const CHECK_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M5 12l4 4 10-10" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CROSS_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
  </svg>
);

function InviteSheet({ open, onClose }: SheetProps) {
  const { t } = useT();
  const { showToast } = useToast();
  const { user } = useUserContext();
  const { call } = useApi();

  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [alias, setAlias] = useState('');
  const [mail, setMail] = useState('');
  const [generating, setGenerating] = useState(false);
  const [formError, setFormError] = useState('');

  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const data = await call<Recommendation[]>({ url: '/recommendation', method: 'GET' });
      setRecs(Array.isArray(data) ? data : []);
    } catch {
      setRecs([]);
      setLoadError(true);
    }
  }, [call]);

  useEffect(() => {
    if (!open) return;
    setRecs(null);
    setAlias('');
    setMail('');
    setFormError('');
    void load();
  }, [open, load]);

  const submit = async () => {
    const name = alias.trim();
    const email = mail.trim();
    if (!name) return;
    if (email && !email.includes('@')) return;
    setGenerating(true);
    setFormError('');
    try {
      await call({
        url: '/recommendation',
        method: 'POST',
        data: email ? { recommendedAlias: name, recommendedMail: email } : { recommendedAlias: name },
      });
      setAlias('');
      setMail('');
      await load();
      showToast(t('inviteCreated'));
    } catch (e) {
      // A KYC/permission rejection means the account can't invite yet — surface the
      // dedicated hint; anything else is a generic failure (matches submitInvite).
      const message = e instanceof ApiException ? e.message : '';
      const isKyc = /kyc|level|permission|denied|forbidden|recommend/i.test(message);
      setFormError((isKyc ? t('inviteKyc') : t('genErr')) + (message ? `: ${message}` : ''));
    } finally {
      setGenerating(false);
    }
  };

  const confirm = async (id: number, accept: boolean) => {
    setBusyId(id);
    try {
      await call({ url: `/recommendation/${id}/${accept ? 'confirm' : 'reject'}`, method: 'PUT' });
      showToast(accept ? t('inviteConfirmed') : t('inviteRejected'));
      await load();
    } catch {
      showToast(t('genErr'), { assertive: true });
    } finally {
      setBusyId(null);
    }
  };

  const level = user?.kyc.level;

  return (
    <Sheet open={open} onClose={onClose} titleId="inviteSheetTitle">
      <SheetHeader titleId="inviteSheetTitle" title={t('inviteTitle')} onClose={onClose} />
      <div className="slist" style={{ paddingBottom: 24 }}>
        <p className="paybox-note" style={{ margin: '2px 2px 12px' }}>
          {t('inviteLead')}
        </p>

        {level != null && level < KycLevel.Completed && (
          <div className="paybox-note warn" style={{ marginBottom: 12 }}>
            {t('inviteKyc')}
          </div>
        )}

        <div className="glass" style={{ borderRadius: 18, padding: 14 }}>
          <div className="tform">
            <p style={{ color: 'var(--t-muted)', fontSize: 12.5, lineHeight: 1.45, margin: '0 2px 4px' }}>
              {t('inviteFormLead')}
            </p>
            <label className="flabel">{t('inviteName')}</label>
            <input
              className="tinput"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder={t('inviteNameP')}
              autoComplete="off"
            />
            <label className="flabel">
              {t('inviteEmail')} <span style={{ color: 'var(--t-faint)', fontWeight: 400 }}>{t('optional')}</span>
            </label>
            <input
              className="tinput"
              type="email"
              inputMode="email"
              value={mail}
              onChange={(e) => setMail(e.target.value)}
              placeholder="you@email.com"
            />
            {formError && (
              <div className="paybox-note warn" style={{ marginTop: 10 }}>
                {formError}
              </div>
            )}
            <button
              type="button"
              className="btn-primary"
              style={{ marginTop: 8 }}
              disabled={generating}
              onClick={() => void submit()}
            >
              {generating ? <Spinner /> : t('inviteGen')}
            </button>
          </div>
        </div>

        <div className="sectionlabel tight">{t('inviteYours')}</div>
        {recs == null ? (
          <div className="ocp-empty" style={{ padding: 20, gap: 8 }}>
            <Spinner /> {t('loading')}
          </div>
        ) : recs.length === 0 ? (
          loadError ? (
            <div className="ocp-empty" style={{ flexDirection: 'column', gap: 12, textAlign: 'center' }}>
              <span>{t('loadFail')}</span>
              <button type="button" className="btn-mini" style={{ width: 'auto' }} onClick={() => void load()}>
                {t('retry')}
              </button>
            </div>
          ) : (
            <div className="ocp-empty">{t('inviteNone')}</div>
          )
        ) : (
          recs.map((rec) => {
            const name = rec.name || rec.mail || `#${rec.id}`;
            const link = rec.code ? REF_LINK_BASE + encodeURIComponent(rec.code) : '';
            return (
              <div key={rec.id} className="rcol" style={{ padding: '14px 15px', marginTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="rci">{PERSON_ICON}</span>
                  <div className="rtt" style={{ flex: 1 }}>
                    <b>{name}</b>
                    {rec.mail && rec.mail !== name && <small>{rec.mail}</small>}
                  </div>
                  <span className={`pill-chip ${statusChip(rec.status)}`}>
                    {t(STATUS_LABEL_KEY[rec.status] ?? 'st_Created')}
                  </span>
                </div>
                {rec.status === 'Pending' && (
                  <>
                    <div className="paybox-note" style={{ margin: '8px 0 6px' }}>
                      {t('invitePendingHint')}
                    </div>
                    <div className="row2">
                      <button
                        type="button"
                        className="btn-mini"
                        disabled={busyId === rec.id}
                        onClick={() => void confirm(rec.id, true)}
                      >
                        {CHECK_ICON}
                        {t('inviteConfirm')}
                      </button>
                      <button
                        type="button"
                        className="btn-mini danger"
                        disabled={busyId === rec.id}
                        onClick={() => void confirm(rec.id, false)}
                      >
                        {CROSS_ICON}
                        {t('inviteReject')}
                      </button>
                    </div>
                  </>
                )}
                {rec.status === 'Created' && rec.code && (
                  <>
                    <div className="kv" style={{ paddingLeft: 0, paddingRight: 0 }}>
                      <span className="kk">{t('inviteCode')}</span>
                      <span className="vv">{rec.code}</span>
                      <button
                        type="button"
                        className="cpy"
                        aria-label={t('inviteCopyLink')}
                        onClick={() => copyToClipboard(link, showToast, t)}
                      >
                        {COPY_ICON}
                      </button>
                    </div>
                    <button
                      type="button"
                      className="btn-mini"
                      style={{ marginTop: 10, width: '100%' }}
                      onClick={() => copyToClipboard(link, showToast, t)}
                    >
                      {COPY_ICON}
                      {t('inviteCopyLink')}
                    </button>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------

export function AccountSheets({
  open,
  onClose,
}: {
  open: AccountSheet | null;
  onClose: () => void;
  referral?: Referral;
}) {
  return (
    <>
      <BankAccountsSheet open={open === 'bankaccts'} onClose={onClose} />
      <AddressesSheet open={open === 'addresses'} onClose={onClose} />
      <ChangeEmailSheet open={open === 'email'} onClose={onClose} />
      <VerificationCallSheet open={open === 'vcall'} onClose={onClose} />
      <CoinTrackingSheet open={open === 'ctkey'} onClose={onClose} />
      <LanguageSheet open={open === 'language'} onClose={onClose} />
      <CurrencySheet open={open === 'currency'} onClose={onClose} />
      <InviteSheet open={open === 'referral'} onClose={onClose} />
    </>
  );
}
