// DFX App 2.0 — in-app KYC step renderers (blocker #9).
//
// Ported from the static preview's per-step forms (public/app2/index.html —
// `kycFormContact` … `kycFinancial` / `kycIdent`, behaviour ~line 2713-2970).
// Each data-collection step is completed IN THE APP: the form gathers exactly
// the fields the static app did, submits via the matching `useKyc()` method to
// the step's session URL, then advances through `continueKyc(code, true)`.
//
// Only steps that genuinely have no in-app data entry (PaymentAgreement, the
// name/address/phone-change flows and any unknown future step) stay a portal
// hand-off — see `isInAppStep()` and the parent shell in `kyc.tsx`.

import {
  AccountType,
  isStepDone,
  KycStepName,
  KycStepStatus,
  LegalEntity,
  QuestionType,
  SignatoryPower,
  UrlType,
  useKyc,
  useUserContext,
} from '@dfx.swiss/react';
import type {
  Country,
  KycAddress,
  KycBeneficialData,
  KycFileData,
  KycFinancialQuestion,
  KycFinancialResponse,
  KycSession,
  KycStepBase,
  KycStepSession,
} from '@dfx.swiss/react';
import { useCountry } from '@dfx.swiss/react';
import SumsubWebSdk from '@sumsub/websdk-react';
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { SumsubReviewAnswer, SumsubReviewRejectType } from '../../dto/sumsub.dto';
import { LoadingRow } from '../components/ui';
import { useT, type Language, type TranslationKey } from '../i18n';
import { appUrl, isSafeAppUrl } from '../utils/url';
import { isSafeHttpsUrl } from './parts/format';
import { apiStatusCode, isTfaRequiredError, kycHandoffFromError, type KycHandoff } from './kyc-recovery';

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

// Legal-entity options, in the same order the static app offered them.
const LEGAL_ENTITIES: LegalEntity[] = [
  LegalEntity.AG,
  LegalEntity.GMBH,
  LegalEntity.UG,
  LegalEntity.GBR,
  LegalEntity.OHG,
  LegalEntity.KG,
  LegalEntity.GMBH_CO_KG,
  LegalEntity.COOPERATIVE,
  LegalEntity.ASSOCIATION,
  LegalEntity.FOUNDATION,
  LegalEntity.TRUST,
  LegalEntity.COLLECTIVE_COMPANY,
  LegalEntity.LISTED_AG,
  LegalEntity.PUBLIC_INSTITUTION,
  LegalEntity.LIFE_INSURANCE,
  LegalEntity.OTHER,
];

const MAX_BENEFICIAL_OWNERS = 4;

/** Steps whose data can be entered inside the app. Everything else stays a
 * portal hand-off (the parent shell renders that path). */
export function isInAppStep(name: KycStepName): boolean {
  return IN_APP_STEPS.has(name);
}

const IN_APP_STEPS = new Set<KycStepName>([
  KycStepName.CONTACT_DATA,
  KycStepName.PERSONAL_DATA,
  KycStepName.NATIONALITY_DATA,
  KycStepName.IDENT,
  KycStepName.FINANCIAL_DATA,
  KycStepName.LEGAL_ENTITY,
  KycStepName.SIGNATORY_POWER,
  KycStepName.OPERATIONAL_ACTIVITY,
  KycStepName.RECOMMENDATION,
  KycStepName.BENEFICIAL_OWNER,
  KycStepName.RECALL_AGREEMENT,
  KycStepName.SOLE_PROPRIETORSHIP_CONFIRMATION,
  KycStepName.OWNER_DIRECTORY,
  KycStepName.AUTHORITY,
  KycStepName.ADDITIONAL_DOCUMENTS,
  KycStepName.RESIDENCE_PERMIT,
  KycStepName.STATUTES,
]);

function errorMessage(t: TFn, err: unknown): string {
  if (apiStatusCode(err) === 0) return t('loadFail');
  return t('genErr');
}

function readFileAsBase64(file: File): Promise<KycFileData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ file: String(reader.result).split(',')[1] ?? '', fileName: file.name });
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Shared submit machinery — one place owns busy/error, TFA + hand-off routing,
// the FAILED-vs-continue decision, and the `continueKyc` auto-step advance.
// ---------------------------------------------------------------------------

interface StepContext {
  code: string;
  url: string;
  t: TFn;
  language: Language;
  busy: boolean;
  error: string;
  setError: (message: string) => void;
  /** Run a single-submit step call → advance to the next step (or show FAILED). */
  submit: (run: () => Promise<KycStepBase>) => void;
  /** Advance via `continueKyc(code, true)` without a preceding data call. */
  advance: () => Promise<void>;
  /** Advance with a session the caller already fetched (poll loops). */
  onAdvance: (session: KycSession) => void;
  /** Route a caught error to TFA / hand-off / inline message. */
  handleError: (err: unknown) => void;
}

export interface KycStepFormProps {
  code: string;
  step: KycStepSession;
  onAdvance: (session: KycSession) => void;
  onFailed: (result: KycStepBase) => void;
  onTfaRequired: () => void;
  onHandoff: (handoff: KycHandoff) => void;
  onBack: () => void;
}

export function KycStepForm({ code, step, onAdvance, onFailed, onTfaRequired, onHandoff, onBack }: KycStepFormProps) {
  const { t, language } = useT();
  const kyc = useKyc();
  const { getCountries } = useCountry();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const needsCountries =
    step.name === KycStepName.PERSONAL_DATA ||
    step.name === KycStepName.NATIONALITY_DATA ||
    step.name === KycStepName.BENEFICIAL_OWNER;
  const [countries, setCountries] = useState<Country[] | null>(needsCountries ? null : []);

  useEffect(() => {
    if (!needsCountries) return;
    let active = true;
    getCountries()
      .then((list) => active && setCountries(list))
      .catch(() => active && setCountries([]));
    return () => {
      active = false;
    };
    // getCountries is stable from the hook; re-run only when the step changes.
  }, [needsCountries, step.name]);

  const handleError = (err: unknown): void => {
    if (isTfaRequiredError(err)) return onTfaRequired();
    const handoff = kycHandoffFromError(err);
    if (handoff) return onHandoff(handoff);
    setError(errorMessage(t, err));
  };

  const advance = async (): Promise<void> => {
    const session = await kyc.continueKyc(code, true);
    onAdvance(session);
  };

  const submit = (run: () => Promise<KycStepBase>): void => {
    if (busy) return;
    setBusy(true);
    setError('');
    run()
      .then(async (result) => {
        if (result.status === KycStepStatus.FAILED) return onFailed(result);
        await advance();
      })
      .catch((err: unknown) => {
        handleError(err);
        setBusy(false);
      });
  };

  const ctx: StepContext = {
    code,
    url: step.session?.url ?? '',
    t,
    language,
    busy,
    error,
    setError,
    submit,
    advance,
    onAdvance,
    handleError,
  };

  if (countries === null) {
    return (
      <>
        <StepHead t={t} name={step.name} />
        <div className="sec" style={{ textAlign: 'center', padding: 24 }}>
          <LoadingRow label={t('loading')} />
        </div>
      </>
    );
  }

  return (
    <>
      <StepHead t={t} name={step.name} />
      <StepBody ctx={ctx} step={step} countries={countries} onBack={onBack} setBusy={setBusy} />
    </>
  );
}

function StepBody({
  ctx,
  step,
  countries,
  onBack,
  setBusy,
}: {
  ctx: StepContext;
  step: KycStepSession;
  countries: Country[];
  onBack: () => void;
  setBusy: (busy: boolean) => void;
}) {
  switch (step.name) {
    case KycStepName.CONTACT_DATA:
      return <ContactFields ctx={ctx} />;
    case KycStepName.PERSONAL_DATA:
      return <PersonalFields ctx={ctx} countries={countries} />;
    case KycStepName.NATIONALITY_DATA:
      return <NationalityFields ctx={ctx} countries={countries} />;
    case KycStepName.LEGAL_ENTITY:
      return <LegalEntityFields ctx={ctx} />;
    case KycStepName.SIGNATORY_POWER:
      return <SignatoryFields ctx={ctx} />;
    case KycStepName.OPERATIONAL_ACTIVITY:
      return <OperationalFields ctx={ctx} />;
    case KycStepName.RECOMMENDATION:
      return <RecommendationFields ctx={ctx} />;
    case KycStepName.BENEFICIAL_OWNER:
      return <BeneficialFields ctx={ctx} countries={countries} />;
    case KycStepName.RECALL_AGREEMENT:
      return <AcceptFields ctx={ctx} />;
    case KycStepName.FINANCIAL_DATA:
      return <FinancialFields ctx={ctx} setBusy={setBusy} />;
    case KycStepName.IDENT:
      return <IdentStep ctx={ctx} step={step} onBack={onBack} />;
    default:
      // SoleProprietorshipConfirmation, OwnerDirectory, Authority,
      // AdditionalDocuments, ResidencePermit, Statutes — plain document upload.
      return <FileFields ctx={ctx} />;
  }
}

// ---------------------------------------------------------------------------
// Small shared building blocks
// ---------------------------------------------------------------------------

function StepHead({ t, name }: { t: TFn; name: KycStepName }) {
  const key = `kn_${name}` as TranslationKey;
  const label = t(key);
  return <div className="sectionlabel tight">{label === key ? name : label}</div>;
}

function InlineError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="paybox-note warn" style={{ marginTop: 10 }}>
      {message}
    </div>
  );
}

function SubmitButton({ ctx, label, disabled }: { ctx: StepContext; label: string; disabled?: boolean }) {
  return (
    <button className="btn-primary" type="submit" style={{ marginTop: 10 }} disabled={ctx.busy || disabled}>
      {label}
    </button>
  );
}

function CountrySelect({
  countries,
  value,
  onChange,
}: {
  countries: Country[];
  value: string;
  onChange: (value: string) => void;
}) {
  const sorted = [...countries].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <select className="tinput" value={value} onChange={(e) => onChange(e.target.value)}>
      {sorted.map((c) => (
        <option key={c.id} value={String(c.id)}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

/** Sensible default (CH) matching the static app, else the first country. */
function defaultCountryId(countries: Country[]): string {
  const ch = countries.find((c) => c.symbol === 'CH');
  return String((ch ?? countries[0])?.id ?? '');
}

function countryById(countries: Country[], id: string): Country | undefined {
  return countries.find((c) => String(c.id) === id);
}

interface AddressState {
  street: string;
  houseNumber: string;
  zip: string;
  city: string;
  country: string;
}

function emptyAddress(countries: Country[]): AddressState {
  return { street: '', houseNumber: '', zip: '', city: '', country: defaultCountryId(countries) };
}

function addressComplete(address: AddressState): boolean {
  return !!address.street.trim() && !!address.zip.trim() && !!address.city.trim() && !!address.country;
}

function toKycAddress(address: AddressState, countries: Country[]): KycAddress | undefined {
  const country = countryById(countries, address.country);
  if (!country) return undefined;
  return {
    street: address.street.trim(),
    houseNumber: address.houseNumber.trim() || undefined,
    zip: address.zip.trim(),
    city: address.city.trim(),
    country,
  };
}

function AddressFields({
  t,
  countries,
  value,
  onChange,
}: {
  t: TFn;
  countries: Country[];
  value: AddressState;
  onChange: (next: AddressState) => void;
}) {
  const set = (patch: Partial<AddressState>) => onChange({ ...value, ...patch });
  return (
    <>
      <label className="flabel">{t('kycStreet')}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="tinput"
          style={{ flex: 2.2 }}
          autoComplete="street-address"
          value={value.street}
          onChange={(e) => set({ street: e.target.value })}
        />
        <input
          className="tinput"
          style={{ flex: 1 }}
          placeholder={t('kycHouseNr')}
          value={value.houseNumber}
          onChange={(e) => set({ houseNumber: e.target.value })}
        />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="tinput"
          style={{ flex: 1, marginTop: 8 }}
          placeholder={t('kycZip')}
          autoComplete="postal-code"
          value={value.zip}
          onChange={(e) => set({ zip: e.target.value })}
        />
        <input
          className="tinput"
          style={{ flex: 2.2, marginTop: 8 }}
          placeholder={t('kycCity')}
          autoComplete="address-level2"
          value={value.city}
          onChange={(e) => set({ city: e.target.value })}
        />
      </div>
      <label className="flabel">{t('kycCountry')}</label>
      <CountrySelect countries={countries} value={value.country} onChange={(country) => set({ country })} />
    </>
  );
}

function FileInput({ t, onPick }: { t: TFn; onPick: (file: File | undefined) => void }) {
  return (
    <>
      <input
        className="tinput"
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        style={{ padding: 10 }}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onPick(e.target.files?.[0])}
      />
      <div className="tnote" style={{ marginTop: 6 }}>
        {t('kycFileHint')}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Contact / personal / nationality
// ---------------------------------------------------------------------------

function ContactFields({ ctx }: { ctx: StepContext }) {
  const { t } = ctx;
  const { user } = useUserContext();
  // Prefill the known address so a user already on file just confirms it
  // (mirrors the static app's `value="${(USER&&USER.mail)||''}"`).
  const [mail, setMail] = useState(() => user?.mail ?? '');
  const kyc = useKyc();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = mail.trim();
    if (!value.includes('@')) return;
    ctx.submit(() => kyc.setContactData(ctx.code, ctx.url, { mail: value }));
  };

  return (
    <form className="tform" onSubmit={onSubmit}>
      <label className="flabel">{t('ticketEmail')}</label>
      <input
        className="tinput"
        type="email"
        placeholder="you@email.com"
        inputMode="email"
        autoComplete="email"
        value={mail}
        onChange={(e) => setMail(e.target.value)}
      />
      <InlineError message={ctx.error} />
      <SubmitButton ctx={ctx} label={t('xmrContinue')} disabled={!mail.trim().includes('@')} />
    </form>
  );
}

/** Partner/embed contract: PersonalData fields a host can pre-seed via URL
 * params (mirrors the static app's `APPP` prefill). Read once at mount. */
interface PersonalPrefill {
  accountType: string;
  firstName: string;
  lastName: string;
  street: string;
  houseNumber: string;
  zip: string;
  city: string;
  phone: string;
  country: string;
}

function readPersonalPrefill(): PersonalPrefill {
  const empty: PersonalPrefill = {
    accountType: '',
    firstName: '',
    lastName: '',
    street: '',
    houseNumber: '',
    zip: '',
    city: '',
    phone: '',
    country: '',
  };
  if (typeof window === 'undefined') return empty;
  const qp = new URLSearchParams(window.location.search);
  const get = (key: string) => qp.get(key)?.trim() ?? '';
  return {
    accountType: get('account-type'),
    firstName: get('first-name'),
    lastName: get('last-name'),
    street: get('street'),
    houseNumber: get('house-number'),
    zip: get('zip'),
    city: get('city'),
    phone: get('phone'),
    country: get('country'),
  };
}

/** Matches a partner-supplied country param (ISO symbol or name, case-insensitive)
 * to a country id, else undefined. */
function matchCountryId(countries: Country[], value: string): string | undefined {
  const query = value.trim().toLowerCase();
  if (!query) return undefined;
  const match = countries.find(
    (c) => String(c.symbol ?? '').toLowerCase() === query || String(c.name ?? '').toLowerCase() === query,
  );
  return match ? String(match.id) : undefined;
}

/** Resolves a partner-supplied account-type param to an AccountType, else Personal. */
function matchAccountType(value: string): AccountType {
  const want = value.trim().toLowerCase();
  if (!want) return AccountType.PERSONAL;
  return Object.values(AccountType).find((entry) => entry.toLowerCase() === want) ?? AccountType.PERSONAL;
}

function PersonalFields({ ctx, countries }: { ctx: StepContext; countries: Country[] }) {
  const { t } = ctx;
  const kyc = useKyc();
  const prefill = useMemo(readPersonalPrefill, []);
  const [accountType, setAccountType] = useState<AccountType>(() => matchAccountType(prefill.accountType));
  const [firstName, setFirstName] = useState(prefill.firstName);
  const [lastName, setLastName] = useState(prefill.lastName);
  const [phone, setPhone] = useState(prefill.phone);
  const [address, setAddress] = useState<AddressState>(() => ({
    ...emptyAddress(countries),
    street: prefill.street,
    houseNumber: prefill.houseNumber,
    zip: prefill.zip,
    city: prefill.city,
    country: matchCountryId(countries, prefill.country) ?? defaultCountryId(countries),
  }));
  const [orgName, setOrgName] = useState('');
  const [orgAddress, setOrgAddress] = useState<AddressState>(() => emptyAddress(countries));

  const isOrg = accountType !== AccountType.PERSONAL;
  const phoneValid = /^\+?[0-9 ]{6,20}$/.test(phone.trim());
  const baseValid = !!firstName.trim() && !!lastName.trim() && addressComplete(address) && phoneValid;
  const orgValid = !isOrg || (!!orgName.trim() && addressComplete(orgAddress));
  const valid = baseValid && orgValid;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const personalAddress = toKycAddress(address, countries);
    if (!personalAddress) return;
    const data: Parameters<typeof kyc.setPersonalData>[2] = {
      accountType,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim().replace(/ /g, ''),
      address: personalAddress,
    };
    if (isOrg) {
      const organizationAddress = toKycAddress(orgAddress, countries);
      if (!organizationAddress) return;
      data.organizationName = orgName.trim();
      data.organizationAddress = organizationAddress;
    }
    ctx.submit(() => kyc.setPersonalData(ctx.code, ctx.url, data));
  };

  return (
    <form className="tform" onSubmit={onSubmit}>
      <label className="flabel">{t('kycAccountType')}</label>
      <select className="tinput" value={accountType} onChange={(e) => setAccountType(e.target.value as AccountType)}>
        <option value={AccountType.PERSONAL}>{t('at_Personal')}</option>
        <option value={AccountType.ORGANIZATION}>{t('at_Organization')}</option>
        <option value={AccountType.SOLE_PROPRIETORSHIP}>{t('at_SoleProprietorship')}</option>
      </select>
      <label className="flabel">{t('kycFirstName')}</label>
      <input
        className="tinput"
        autoComplete="given-name"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
      />
      <label className="flabel">{t('kycLastName')}</label>
      <input
        className="tinput"
        autoComplete="family-name"
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
      />
      <AddressFields t={t} countries={countries} value={address} onChange={setAddress} />
      <label className="flabel">{t('kycPhone')}</label>
      <input
        className="tinput"
        type="tel"
        placeholder="+41 791234567"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      {isOrg && (
        <div>
          <label className="flabel">{t('kycOrgName')}</label>
          <input
            className="tinput"
            autoComplete="organization"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
          />
          <div className="sectionlabel tight" style={{ marginTop: 10 }}>
            {t('kycOrgAddress')}
          </div>
          <AddressFields t={t} countries={countries} value={orgAddress} onChange={setOrgAddress} />
        </div>
      )}
      <InlineError message={ctx.error} />
      <SubmitButton ctx={ctx} label={t('xmrContinue')} disabled={!valid} />
    </form>
  );
}

function NationalityFields({ ctx, countries }: { ctx: StepContext; countries: Country[] }) {
  const { t } = ctx;
  const kyc = useKyc();
  const [nationality, setNationality] = useState<string>(() => defaultCountryId(countries));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const country = countryById(countries, nationality);
    if (!country) return;
    ctx.submit(() => kyc.setNationalityData(ctx.code, ctx.url, { country }));
  };

  return (
    <form className="tform" onSubmit={onSubmit}>
      <label className="flabel">{t('kycNationality')}</label>
      <CountrySelect countries={countries} value={nationality} onChange={setNationality} />
      <InlineError message={ctx.error} />
      <SubmitButton ctx={ctx} label={t('xmrContinue')} disabled={!nationality} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Legal entity / signatory / operational / recommendation / recall / files
// ---------------------------------------------------------------------------

function FileFields({ ctx }: { ctx: StepContext }) {
  const { t } = ctx;
  const kyc = useKyc();
  const [file, setFile] = useState<File>();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    ctx.submit(async () => kyc.setFileData(ctx.code, ctx.url, await readFileAsBase64(file)));
  };

  return (
    <form className="tform" onSubmit={onSubmit}>
      <label className="flabel">{t('kycUpload')}</label>
      <FileInput t={t} onPick={setFile} />
      <InlineError message={ctx.error} />
      <SubmitButton ctx={ctx} label={t('kycSubmit')} disabled={!file} />
    </form>
  );
}

function LegalEntityFields({ ctx }: { ctx: StepContext }) {
  const { t } = ctx;
  const kyc = useKyc();
  const [legalEntity, setLegalEntity] = useState<LegalEntity>(LEGAL_ENTITIES[0]);
  const [file, setFile] = useState<File>();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    ctx.submit(async () =>
      kyc.setLegalEntityData(ctx.code, ctx.url, { legalEntity, ...(await readFileAsBase64(file)) }),
    );
  };

  return (
    <form className="tform" onSubmit={onSubmit}>
      <label className="flabel">{t('kycLegalForm')}</label>
      <select className="tinput" value={legalEntity} onChange={(e) => setLegalEntity(e.target.value as LegalEntity)}>
        {LEGAL_ENTITIES.map((entity) => (
          <option key={entity} value={entity}>
            {entity}
          </option>
        ))}
      </select>
      <label className="flabel">{t('kycUpload')}</label>
      <FileInput t={t} onPick={setFile} />
      <InlineError message={ctx.error} />
      <SubmitButton ctx={ctx} label={t('kycSubmit')} disabled={!file} />
    </form>
  );
}

function SignatoryFields({ ctx }: { ctx: StepContext }) {
  const { t } = ctx;
  const kyc = useKyc();
  const [signatoryPower, setSignatoryPower] = useState<SignatoryPower>(SignatoryPower.SINGLE);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ctx.submit(() => kyc.setSignatoryPowerData(ctx.code, ctx.url, { signatoryPower }));
  };

  return (
    <form className="tform" onSubmit={onSubmit}>
      <label className="flabel">{t('kycSignatory')}</label>
      <select
        className="tinput"
        value={signatoryPower}
        onChange={(e) => setSignatoryPower(e.target.value as SignatoryPower)}
      >
        <option value={SignatoryPower.SINGLE}>{t('kycSigSingle')}</option>
        <option value={SignatoryPower.DOUBLE}>{t('kycSigDouble')}</option>
        <option value={SignatoryPower.NONE}>{t('kycSigNone')}</option>
      </select>
      <InlineError message={ctx.error} />
      <SubmitButton ctx={ctx} label={t('xmrContinue')} />
    </form>
  );
}

function OperationalFields({ ctx }: { ctx: StepContext }) {
  const { t } = ctx;
  const kyc = useKyc();
  const [isOperational, setIsOperational] = useState(true);
  const [websiteUrl, setWebsiteUrl] = useState('');

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ctx.submit(() =>
      kyc.setOperationalData(ctx.code, ctx.url, { isOperational, websiteUrl: websiteUrl.trim() || undefined }),
    );
  };

  return (
    <form className="tform" onSubmit={onSubmit}>
      <label className="flabel">{t('kycOperational')}</label>
      <select
        className="tinput"
        value={String(isOperational)}
        onChange={(e) => setIsOperational(e.target.value === 'true')}
      >
        <option value="true">{t('yes')}</option>
        <option value="false">{t('no')}</option>
      </select>
      <label className="flabel">
        {t('kycWebsite')} {t('optional')}
      </label>
      <input
        className="tinput"
        type="url"
        placeholder="https://…"
        value={websiteUrl}
        onChange={(e) => setWebsiteUrl(e.target.value)}
      />
      <InlineError message={ctx.error} />
      <SubmitButton ctx={ctx} label={t('xmrContinue')} />
    </form>
  );
}

function RecommendationFields({ ctx }: { ctx: StepContext }) {
  const { t } = ctx;
  const kyc = useKyc();
  const [key, setKey] = useState('');

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = key.trim();
    if (!value) return;
    ctx.submit(() => kyc.setRecommendationData(ctx.code, ctx.url, { key: value }));
  };

  return (
    <form className="tform" onSubmit={onSubmit}>
      <label className="flabel">{t('kycRecKey')}</label>
      <input className="tinput" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
      <InlineError message={ctx.error} />
      <SubmitButton ctx={ctx} label={t('xmrContinue')} disabled={!key.trim()} />
    </form>
  );
}

function AcceptFields({ ctx }: { ctx: StepContext }) {
  const { t } = ctx;
  const kyc = useKyc();
  const [accepted, setAccepted] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!accepted) return;
    ctx.submit(() => kyc.setRecallData(ctx.code, ctx.url, { accepted: true }));
  };

  return (
    <form className="tform" onSubmit={onSubmit}>
      <label
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
          color: '#fff',
          fontSize: 13.5,
          lineHeight: 1.5,
          margin: '6px 0 4px',
        }}
      >
        <input
          type="checkbox"
          style={{ marginTop: 3 }}
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
        />
        {t('kycAccept')}
      </label>
      <InlineError message={ctx.error} />
      <SubmitButton ctx={ctx} label={t('xmrContinue')} disabled={!accepted} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Beneficial owners — dynamic list, mirrors the static app's add-person flow.
// ---------------------------------------------------------------------------

interface OwnerState extends AddressState {
  firstName: string;
  lastName: string;
}

function emptyOwner(countries: Country[]): OwnerState {
  return { firstName: '', lastName: '', ...emptyAddress(countries) };
}

function BeneficialFields({ ctx, countries }: { ctx: StepContext; countries: Country[] }) {
  const { t } = ctx;
  const kyc = useKyc();
  const [hasBeneficialOwners, setHasBeneficialOwners] = useState(false);
  const [involved, setInvolved] = useState(true);
  const [owners, setOwners] = useState<OwnerState[]>(() => [emptyOwner(countries)]);

  const updateOwner = (index: number, patch: Partial<OwnerState>) =>
    setOwners((list) => list.map((owner, i) => (i === index ? { ...owner, ...patch } : owner)));

  const namedOwners = owners.filter((owner) => owner.firstName.trim() && owner.lastName.trim());
  const valid = !hasBeneficialOwners || namedOwners.length > 0;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const data: KycBeneficialData = {
      hasBeneficialOwners,
      isAccountHolderInvolved: involved,
    };
    if (hasBeneficialOwners) {
      const beneficialOwners = namedOwners.map((owner) => {
        const kycAddress = toKycAddress(owner, countries);
        return {
          firstName: owner.firstName.trim(),
          lastName: owner.lastName.trim(),
          street: kycAddress?.street ?? owner.street.trim(),
          houseNumber: owner.houseNumber.trim() || undefined,
          zip: owner.zip.trim(),
          city: owner.city.trim(),
          country: kycAddress?.country ?? countryById(countries, owner.country) ?? countries[0],
        };
      });
      if (!beneficialOwners.length) return;
      data.beneficialOwners = beneficialOwners;
    }
    ctx.submit(() => kyc.setBeneficialData(ctx.code, ctx.url, data));
  };

  return (
    <form className="tform" onSubmit={onSubmit}>
      <label className="flabel">{t('kycHasBO')}</label>
      <select
        className="tinput"
        value={String(hasBeneficialOwners)}
        onChange={(e) => setHasBeneficialOwners(e.target.value === 'true')}
      >
        <option value="false">{t('no')}</option>
        <option value="true">{t('yes')}</option>
      </select>
      <label className="flabel">{t('kycBOInvolved')}</label>
      <select className="tinput" value={String(involved)} onChange={(e) => setInvolved(e.target.value === 'true')}>
        <option value="true">{t('yes')}</option>
        <option value="false">{t('no')}</option>
      </select>
      {hasBeneficialOwners && (
        <div>
          {owners.map((owner, index) => (
            <div key={index}>
              <div className="sectionlabel tight">
                {t('kycOwner')} {index + 1}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="tinput"
                  placeholder={t('kycFirstName')}
                  value={owner.firstName}
                  onChange={(e) => updateOwner(index, { firstName: e.target.value })}
                />
                <input
                  className="tinput"
                  placeholder={t('kycLastName')}
                  value={owner.lastName}
                  onChange={(e) => updateOwner(index, { lastName: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  className="tinput"
                  style={{ flex: 2.2 }}
                  placeholder={t('kycStreet')}
                  value={owner.street}
                  onChange={(e) => updateOwner(index, { street: e.target.value })}
                />
                <input
                  className="tinput"
                  style={{ flex: 1 }}
                  placeholder={t('kycHouseNr')}
                  value={owner.houseNumber}
                  onChange={(e) => updateOwner(index, { houseNumber: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  className="tinput"
                  style={{ flex: 1 }}
                  placeholder={t('kycZip')}
                  value={owner.zip}
                  onChange={(e) => updateOwner(index, { zip: e.target.value })}
                />
                <input
                  className="tinput"
                  style={{ flex: 2.2 }}
                  placeholder={t('kycCity')}
                  value={owner.city}
                  onChange={(e) => updateOwner(index, { city: e.target.value })}
                />
              </div>
              <div style={{ marginTop: 8 }}>
                <CountrySelect
                  countries={countries}
                  value={owner.country}
                  onChange={(country) => updateOwner(index, { country })}
                />
              </div>
            </div>
          ))}
          {owners.length < MAX_BENEFICIAL_OWNERS && (
            <button
              type="button"
              className="btn-mini"
              style={{ marginTop: 10, width: 'auto' }}
              onClick={() => setOwners((list) => [...list, emptyOwner(countries)])}
            >
              {t('kycAddOwner')}
            </button>
          )}
        </div>
      )}
      <InlineError message={ctx.error} />
      <SubmitButton ctx={ctx} label={t('xmrContinue')} disabled={!valid} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Financial questionnaire — server-driven, one visible question at a time.
// ---------------------------------------------------------------------------

function visibleQuestions(
  questions: KycFinancialQuestion[],
  responses: KycFinancialResponse[],
): KycFinancialQuestion[] {
  return questions.filter(
    (q) =>
      !q.conditions?.length ||
      q.conditions.some((c) => responses.some((r) => r.key === c.question && r.value === c.response)),
  );
}

function FinancialFields({ ctx, setBusy }: { ctx: StepContext; setBusy: (busy: boolean) => void }) {
  const { t } = ctx;
  const kyc = useKyc();
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<KycFinancialQuestion[]>([]);
  const [responses, setResponses] = useState<KycFinancialResponse[]>([]);

  // Answer controls for the current question.
  const [checkboxValue, setCheckboxValue] = useState(false);
  const [singleValue, setSingleValue] = useState('');
  const [multiValues, setMultiValues] = useState<string[]>([]);
  const [textValue, setTextValue] = useState('');
  const advancingRef = useRef(false);

  useEffect(() => {
    let active = true;
    kyc
      .getFinancialData(ctx.code, ctx.url, ctx.language)
      .then((data) => {
        if (!active) return;
        setQuestions(data.questions ?? []);
        setResponses(data.responses ?? []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoading(false);
        ctx.handleError(err);
      });
    return () => {
      active = false;
    };
  }, [ctx.code, ctx.url, ctx.language]);

  const visible = visibleQuestions(questions, responses);
  const current = visible.find((q) => !responses.some((r) => r.key === q.key));

  // Reset the answer controls whenever we move to a fresh question.
  useEffect(() => {
    setCheckboxValue(false);
    setSingleValue(current?.options?.[0]?.key ?? '');
    setMultiValues([]);
    setTextValue('');
  }, [current?.key]);

  // Once every visible question is answered, advance the whole step (guard against
  // a double-advance from Strict-Mode re-invocation).
  useEffect(() => {
    if (loading || current || questions.length === 0 || advancingRef.current) return;
    advancingRef.current = true;
    setBusy(true);
    ctx.advance().catch((err: unknown) => {
      advancingRef.current = false;
      setBusy(false);
      ctx.handleError(err);
    });
  }, [loading, current, questions.length]);

  if (loading) {
    return (
      <div className="sec" style={{ textAlign: 'center', padding: 24 }}>
        <LoadingRow label={t('loading')} />
      </div>
    );
  }

  if (!current) {
    // All answered — the advance effect is running; keep a spinner meanwhile.
    return (
      <div className="sec" style={{ textAlign: 'center', padding: 24 }}>
        <LoadingRow label={t('loading')} />
      </div>
    );
  }

  const answerValue = (): string | undefined => {
    switch (current.type) {
      case QuestionType.CONFIRMATION:
        return checkboxValue ? 'true' : undefined;
      case QuestionType.SINGLE_CHOICE:
        return singleValue || undefined;
      case QuestionType.MULTIPLE_CHOICE:
        return multiValues.length ? multiValues.join(',') : undefined;
      default:
        return textValue.trim() || undefined;
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (ctx.busy) return;
    const value = answerValue();
    if (value == null) return;
    const nextResponses = responses.filter((r) => r.key !== current.key).concat([{ key: current.key, value }]);
    setBusy(true);
    ctx.setError('');
    kyc
      .setFinancialData(ctx.code, ctx.url, { responses: nextResponses })
      .then((result) => {
        setBusy(false);
        // Persist the answer locally so the next visible question is computed.
        setResponses(nextResponses);
        if (isStepDone(result)) {
          // The advance effect fires once `current` becomes undefined.
        }
      })
      .catch((err: unknown) => {
        setBusy(false);
        ctx.handleError(err);
      });
  };

  const toggleMulti = (key: string, checked: boolean) =>
    setMultiValues((list) => (checked ? [...list, key] : list.filter((k) => k !== key)));

  return (
    <form className="tform" onSubmit={onSubmit}>
      <div className="tnote" style={{ marginBottom: 4 }}>
        {visible.indexOf(current) + 1} / {visible.length}
      </div>
      <label className="flabel" style={{ fontSize: 14, color: '#fff' }}>
        {current.title}
      </label>
      {current.type !== QuestionType.CONFIRMATION && current.description && (
        <div className="tnote" style={{ margin: '-2px 0 8px' }}>
          {current.description}
        </div>
      )}
      {current.type === QuestionType.CONFIRMATION && (
        <label
          style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: '#fff', fontSize: 13.5, lineHeight: 1.5 }}
        >
          <input
            type="checkbox"
            style={{ marginTop: 3 }}
            checked={checkboxValue}
            onChange={(e) => setCheckboxValue(e.target.checked)}
          />
          {current.description || current.title}
        </label>
      )}
      {current.type === QuestionType.SINGLE_CHOICE && (
        <select className="tinput" value={singleValue} onChange={(e) => setSingleValue(e.target.value)}>
          {(current.options ?? []).map((option) => (
            <option key={option.key} value={option.key}>
              {option.text}
            </option>
          ))}
        </select>
      )}
      {current.type === QuestionType.MULTIPLE_CHOICE &&
        (current.options ?? []).map((option) => (
          <label
            key={option.key}
            style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#fff', fontSize: 13.5, margin: '6px 0' }}
          >
            <input
              type="checkbox"
              checked={multiValues.includes(option.key)}
              onChange={(e) => toggleMulti(option.key, e.target.checked)}
            />
            {option.text}
          </label>
        ))}
      {current.type === QuestionType.TEXT && (
        <input className="tinput" autoComplete="off" value={textValue} onChange={(e) => setTextValue(e.target.value)} />
      )}
      <InlineError message={ctx.error} />
      <button
        className="btn-primary"
        type="submit"
        style={{ marginTop: 12 }}
        disabled={ctx.busy || answerValue() == null}
      >
        {t('xmrContinue')}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Ident — Sumsub WebSDK (Token) or hosted browser link, both auto-polling.
// ---------------------------------------------------------------------------

/** Trusted DFX-portal deep link for the KYC hand-off (mirrors the static app's
 * `KYC_URL + "?code=" + code`). */
function portalKycUrl(code: string): string | undefined {
  return appUrl(`/kyc?code=${encodeURIComponent(code)}`);
}

function IdentStep({ ctx, step, onBack }: { ctx: StepContext; step: KycStepSession; onBack: () => void }) {
  const { t } = ctx;
  const kyc = useKyc();
  const [failure, setFailure] = useState('');
  const [sdkFailed, setSdkFailed] = useState(false);
  const advancedRef = useRef(false);

  const session = step.session;
  const tokenUrl = session?.type === UrlType.TOKEN && session.url ? session.url : undefined;
  const browserUrl = session?.type === UrlType.BROWSER && isSafeHttpsUrl(session.url) ? session.url : undefined;

  // 3s auto-step poll — advances as soon as the ident step is no longer current.
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => {
      if (advancedRef.current) return;
      kyc
        .continueKyc(ctx.code, true)
        .then((next) => {
          const cur = next.currentStep;
          if (!cur || cur.name !== KycStepName.IDENT || isStepDone(cur)) {
            advancedRef.current = true;
            clearInterval(id);
            ctx.onAdvance(next);
          }
        })
        .catch(() => {
          /* transient poll error — keep polling */
        });
    }, 3000);
    return () => clearInterval(id);
  }, [ctx.code, session?.type, session?.url]);

  const manualDone = () => {
    advancedRef.current = true;
    ctx.advance().catch(ctx.handleError);
  };

  if (!session) {
    return (
      <>
        <div className="paybox-note" style={{ margin: '10px 0' }}>
          {t('kycInReview')}
        </div>
        <button className="btn-mini" style={{ width: 'auto' }} onClick={onBack}>
          {t('kycOverview')}
        </button>
      </>
    );
  }

  // Sumsub SDK failed to load/init — fall back to the DFX-portal hand-off so the
  // user can still finish ident (mirrors the static app's `kycLegacyStep`).
  if (sdkFailed) {
    const portalUrl = portalKycUrl(ctx.code);
    return (
      <>
        <div className="paybox-note" style={{ margin: '10px 0' }}>
          {t('kycLegacyNote')}
        </div>
        {(isSafeAppUrl(portalUrl) || isSafeHttpsUrl(portalUrl)) && (
          <a
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
            href={portalUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('finishOnDfx')}
          </a>
        )}
        <button className="btn-mini" style={{ marginTop: 10, width: '100%' }} disabled={ctx.busy} onClick={manualDone}>
          {t('kycIdentDone2')}
        </button>
      </>
    );
  }

  if (tokenUrl) {
    return (
      <>
        {failure ? (
          <div className="paybox-note warn" style={{ margin: '10px 0' }}>
            {t('kycFailed')}
            <br />
            {failure}
          </div>
        ) : (
          <div style={{ minHeight: 420, background: '#fff', borderRadius: 16, overflow: 'hidden' }}>
            <SumsubWebSdk
              accessToken={tokenUrl}
              expirationHandler={() => Promise.resolve(tokenUrl)}
              config={{ lang: ctx.language }}
              options={{ addViewportTag: false, adaptIframeHeight: true }}
              onMessage={(type: string, payload: SumsubStatusPayload) => {
                if (type === 'idCheck.onApplicantStatusChanged') {
                  const result = payload?.reviewResult;
                  if (
                    result?.reviewAnswer === SumsubReviewAnswer.RED &&
                    result.reviewRejectType === SumsubReviewRejectType.FINAL
                  ) {
                    setFailure(result.moderationComment || t('genErr'));
                  }
                }
              }}
              onError={() => setSdkFailed(true)}
            />
          </div>
        )}
        <div className="tnote" style={{ marginTop: 8, textAlign: 'center' }}>
          {t('kycIdentWait')}
        </div>
      </>
    );
  }

  if (browserUrl) {
    return (
      <>
        <div className="paybox-note" style={{ margin: '10px 0' }}>
          {t('kycIdentLead')}
        </div>
        <a
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
          href={browserUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('kycIdentOpen')}
        </a>
        <div className="tnote" style={{ marginTop: 10, textAlign: 'center' }}>
          {t('kycIdentWait')}
        </div>
      </>
    );
  }

  // API / None session — nothing to embed; wait for review and let the poll run.
  return (
    <>
      <div className="paybox-note" style={{ margin: '10px 0' }}>
        {t('kycInReview')}
      </div>
      <button className="btn-mini" style={{ marginTop: 10, width: '100%' }} disabled={ctx.busy} onClick={manualDone}>
        {t('kycIdentDone2')}
      </button>
    </>
  );
}

interface SumsubStatusPayload {
  reviewResult?: {
    reviewAnswer?: SumsubReviewAnswer;
    reviewRejectType?: SumsubReviewRejectType;
    moderationComment?: string;
  };
}
