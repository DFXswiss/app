import { Transaction } from '@dfx.swiss/react';
import { MrosStatus } from 'src/dto/mros.dto';
import { KycStepInfo } from 'src/hooks/compliance.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { hasScorechainHighRisk, scorechainHighlightValue } from 'src/util/scorechain.util';
import { formatSwissDate, formatSwissDateTimeWithSeconds } from 'src/util/utils';

export function DetailRow({
  label,
  value,
  url,
  mono,
}: {
  label: string;
  value?: string | number | null;
  url?: string | null;
  mono?: boolean;
}): JSX.Element | null {
  if (value == null || value === '') return null;

  return (
    <tr>
      <td className="pr-3 py-0.5 font-medium whitespace-nowrap">{label}:</td>
      <td className={`py-0.5${mono ? ' font-mono break-all' : ''}`}>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-dfxBlue-300 underline hover:text-dfxBlue-800"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </td>
    </tr>
  );
}

export function TransactionDetailRows({
  tx,
  amlCheck,
  amlReason,
  comment,
  chargebackAllowedDate,
  chargebackAllowedDateUser,
  scorechainLink,
}: {
  tx: Transaction;
  amlCheck?: string;
  amlReason?: string;
  comment?: string;
  chargebackAllowedDate?: string;
  chargebackAllowedDateUser?: string;
  // When set AND `comment` carries the ScorechainHighRisk token, the Comment value deep-links into the
  // customer's Scorechain screenings. Omit it and this component renders exactly as before.
  scorechainLink?: { userDataId: number; buyCryptoId?: number; buyFiatId?: number };
}): JSX.Element {
  const { navigate } = useNavigation();

  const showScorechainLink = scorechainLink != null && hasScorechainHighRisk(comment);
  function goToScorechain(): void {
    if (scorechainLink == null) return;
    const value = scorechainHighlightValue({
      buyCryptoId: scorechainLink.buyCryptoId,
      buyFiatId: scorechainLink.buyFiatId,
    });
    navigate(
      {
        pathname: `/compliance/scorechain/user/${scorechainLink.userDataId}`,
        search: value ? `?highlight=${value}` : '',
      },
      { clearParams: ['status', 'search'] },
    );
  }

  return (
    <table className="text-sm text-dfxBlue-800 text-left">
      <tbody>
        <DetailRow label="Date" value={tx.date ? formatSwissDateTimeWithSeconds(tx.date) : undefined} />
        <DetailRow label="Type" value={tx.type} />
        <DetailRow label="AmlCheck" value={amlCheck} />
        <DetailRow label="AmlReason" value={amlReason} />
        {showScorechainLink ? (
          <tr>
            <td className="pr-3 py-0.5 font-medium whitespace-nowrap">Comment:</td>
            <td className="py-0.5">
              <button className="text-dfxBlue-300 underline hover:text-dfxBlue-800 text-left" onClick={goToScorechain}>
                {comment}
              </button>
            </td>
          </tr>
        ) : (
          <DetailRow label="Comment" value={comment} />
        )}
        <DetailRow
          label="Input"
          value={
            tx.inputAmount != null
              ? `${tx.inputAmount} ${tx.inputAsset ?? ''}${tx.inputBlockchain ? ` (${tx.inputBlockchain})` : ''}`
              : undefined
          }
        />
        <DetailRow label="Input TX" value={tx.inputTxId} url={tx.inputTxUrl} mono />
        {tx.state !== 'Returned' && (
          <DetailRow
            label="Output"
            value={
              tx.outputAmount != null
                ? `${tx.outputAmount} ${tx.outputAsset ?? ''}${tx.outputBlockchain ? ` (${tx.outputBlockchain})` : ''}`
                : undefined
            }
          />
        )}
        <DetailRow label="Output TX" value={tx.outputTxId} url={tx.outputTxUrl} mono />
        <DetailRow label="Exchange Rate" value={tx.exchangeRate} />
        {tx.fees && (
          <>
            <DetailRow label="Fee Total" value={`${tx.fees.total}%`} />
            <DetailRow label="Fee DFX" value={`${tx.fees.dfx}%`} />
            <DetailRow label="Fee Network" value={tx.fees.network ? `${tx.fees.network}%` : undefined} />
            <DetailRow
              label="Fee Bank (fixed)"
              value={tx.fees.bankFixed == null ? undefined : `${tx.fees.bankFixed}%`}
            />
            <DetailRow
              label="Fee Bank (variable)"
              value={tx.fees.bankVariable == null ? undefined : `${tx.fees.bankVariable}%`}
            />
            <DetailRow label="Fee Bank" value={tx.fees.bank ? `${tx.fees.bank}%` : undefined} />
          </>
        )}
        {tx.chargebackAmount != null && (
          <>
            {tx.chargebackAmount != null && (
              <>
                <DetailRow label="Chargeback Amount" value={`${tx.chargebackAmount} ${tx.chargebackAsset ?? ''}`} />
                <DetailRow label="Chargeback Target" value={tx.chargebackTarget} />
                <DetailRow label="Chargeback TX" value={tx.chargeBackTxId} url={tx.chargeBackTxUrl} mono />
                <DetailRow
                  label="Chargeback Date"
                  value={tx.chargebackDate ? formatSwissDateTimeWithSeconds(tx.chargebackDate) : undefined}
                />
              </>
            )}
            <DetailRow
              label="Chargeback Allowed Date Compliance"
              value={chargebackAllowedDate ? formatSwissDateTimeWithSeconds(chargebackAllowedDate) : undefined}
            />
            <DetailRow
              label="Chargeback Allowed Date User"
              value={chargebackAllowedDateUser ? formatSwissDateTimeWithSeconds(chargebackAllowedDateUser) : undefined}
            />
          </>
        )}
      </tbody>
    </table>
  );
}

const statusColors: Record<string, string> = {
  Completed: 'bg-dfxGray-300 text-dfxGreen-100',
  Pass: 'bg-dfxGray-300 text-dfxGreen-100',
  Accepted: 'bg-dfxGray-300 text-dfxGreen-100',
  Yes: 'bg-dfxGray-300 text-dfxGreen-100',
  Failed: 'bg-dfxGray-300 text-primary-red',
  Fail: 'bg-dfxGray-300 text-primary-red',
  Rejected: 'bg-dfxGray-300 text-primary-red',
  No: 'bg-dfxGray-300 text-primary-red',
  Created: 'bg-dfxGray-300 text-dfxBlue-300',
};

const fallbackColor = 'bg-dfxGray-300 text-dfxBlue-800';

export function statusBadge(status: string): JSX.Element {
  const classes = statusColors[status] ?? fallbackColor;
  return <span className={`px-2 py-1 rounded text-xs ${classes}`}>{status}</span>;
}

export function boolBadge(value: boolean, trueLabel = 'Yes', falseLabel = 'No'): JSX.Element {
  return statusBadge(value ? trueLabel : falseLabel);
}

const mrosStatusClasses: Record<MrosStatus, string> = {
  [MrosStatus.DRAFT]: 'bg-dfxGray-400 text-dfxBlue-800',
  [MrosStatus.SUBMITTED]: 'bg-dfxBlue-300/20 text-dfxBlue-400',
  [MrosStatus.CONFIRMED]: 'bg-dfxGreen-100/20 text-dfxGreen-300',
  [MrosStatus.CLOSED]: 'bg-dfxGray-700/20 text-dfxGray-800',
};

export function mrosStatusBadge(status: MrosStatus): JSX.Element {
  const classes = mrosStatusClasses[status] ?? 'bg-dfxGray-400 text-dfxBlue-800';
  return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${classes}`}>{status}</span>;
}

export function todayAsString(): string {
  return new Date().toISOString().split('T')[0];
}

// Mirrors `BankTxUnassignedTypes` in DFXswiss/api (bank-tx.entity.ts).
// Only these types still allow a manual Return via compliance.
export const BankTxUnassignedTypes = ['GSheet', 'Unknown', 'Pending'];

// Sentinel ref code the backend assigns when a user has no real referrer.
// The frontend treats it as "no ref" everywhere it reasons about the used ref.
export const DEFAULT_REF = '000-000';

export function formatDate(value: string): string {
  return formatSwissDate(value);
}

export function formatBirthday(birthday: string): string {
  const birth = new Date(birthday);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return `${formatDate(birthday)} (${age} Jahre)`;
}

export function formatDateTime(value: string): string {
  return formatSwissDateTimeWithSeconds(value);
}

// Keeps its own option set: the two-digit year is the point of the "short" variant.
export function formatDateTimeShort(value: string): string {
  return new Date(value).toLocaleString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '-';

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch (e) {
    console.error('formatValue failed:', e, value);
    return 'Fehler: Wert kann nicht ermittelt werden';
  }
}

export type Primitive = string | number | boolean | null | undefined;

// Display a typed primitive UI value: null/undefined/'' → '-'.
// For unknown / dynamic values (e.g. JSON-parsed result fields), use formatValue() instead.
export function display(value: Primitive): string {
  if (value == null || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

// Resolve a reference type ({ name?, symbol? }) to its display name.
export function refName(ref?: { name?: string; symbol?: string }): string {
  return ref?.name ?? ref?.symbol ?? '-';
}

// Resolve the legal entity for a user from the latest LegalEntity KYC step result.
// Sole proprietorships are treated as Einzelunternehmen without a step lookup.
export function extractLegalEntity(kycSteps: KycStepInfo[], accountType?: string): string {
  if (accountType === 'SoleProprietorship') return 'Einzelunternehmen';

  const legalEntityStep = kycSteps
    .filter((s) => s.name === 'LegalEntity')
    .sort((a, b) => b.sequenceNumber - a.sequenceNumber)[0];

  if (legalEntityStep?.result) {
    try {
      const parsed = JSON.parse(legalEntityStep.result) as Record<string, unknown>;
      if (parsed.legalEntity) return String(parsed.legalEntity);
    } catch {
      // ignore parse errors
    }
  }

  return '-';
}

// Build a comma-separated address line. Works for UserData and Organization (structural typing).
export function buildAddress(parts?: {
  street?: string;
  houseNumber?: string;
  zip?: string;
  location?: string;
  country?: { name?: string };
}): string {
  if (!parts) return '-';
  const lines = [
    [parts.street, parts.houseNumber].filter(Boolean).join(' '),
    [parts.zip, parts.location].filter(Boolean).join(' '),
    parts.country?.name,
  ].filter((l): l is string => Boolean(l && l.length));
  return lines.length > 0 ? lines.join(', ') : '-';
}

export interface KycLogResult {
  table: string;
  column: string;
  value: string;
}

export function buildKycLogMessage(parts: {
  description: string;
  clerk: string;
  results: KycLogResult[];
  comment?: string;
}): string {
  const resultStr = parts.results.map((r) => `${r.table}-${r.column}-${r.value}`).join(', ');
  const sections = [`Services - ${parts.description}`, `Editor: ${parts.clerk.trim()}`, `result: ${resultStr}`];
  const comment = parts.comment?.trim();
  if (comment) sections.push(`comment: ${comment}`);
  return sections.join('; ');
}
