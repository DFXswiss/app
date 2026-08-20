import { useState } from 'react';
import { BankDataAlternative, BankDataInfo, UserDataDetail } from 'src/hooks/compliance.hook';
import { useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';
import { statusBadge } from 'src/util/compliance-helpers';
import { formatSwissDate } from 'src/util/utils';
import { StaffIdentityBlock } from './staff-identity';

interface BankDataReviewPanelProps {
  bankDatas: BankDataInfo[];
  userData: UserDataDetail;
  onApprove: (bankDataId: number, clerk: string) => Promise<void>;
  onReject: (bankDataId: number, clerk: string) => Promise<void>;
  isSaving: boolean;
}

type DecisionValue = '' | 'Akzeptiert' | 'Abgelehnt';

type YesNo = '' | 'Ja' | 'Nein';

function AlternativeRows({ alt, verifiedName }: { alt: BankDataAlternative; verifiedName: string }): JSX.Element {
  const [sameVerifiedNamePerson, setSameVerifiedNamePerson] = useState<YesNo>('');
  const [sameBankDataNamePerson, setSameBankDataNamePerson] = useState<YesNo>('');

  const altVerifiedName = alt.verifiedName ?? '-';
  const altBankDataName = alt.name ?? '-';
  const currentVerifiedName = verifiedName || '-';

  return (
    <div className="px-3 py-2 border-b border-dfxGray-300 last:border-0">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        <Row label="bankDataId" value={String(alt.id)} />
        <Row label="userDataId" value={String(alt.userDataId)} />
        <Row label="accountType" value={alt.accountType ?? '-'} />
        <Row label="verifiedName" value={altVerifiedName} />
        <Row label="bankData name" value={altBankDataName} />
        <Row label="type" value={alt.type ?? '-'} />
      </div>

      <div className="mt-3 flex flex-col gap-2 bg-yellow-50 rounded px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-dfxBlue-800">
            Handelt es sich bei &quot;{currentVerifiedName}&quot; und &quot;{altVerifiedName}&quot; wirklich um die
            selbe Person oder ist es ein gemeinschaftliches Ehekonto?
          </span>
          <YesNoSelect value={sameVerifiedNamePerson} onChange={setSameVerifiedNamePerson} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-dfxBlue-800">
            Handelt es sich bei &quot;{altBankDataName}&quot; und &quot;{currentVerifiedName}&quot; wirklich um die
            selbe Person?
          </span>
          <YesNoSelect value={sameBankDataNamePerson} onChange={setSameBankDataNamePerson} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-dfxGray-700">{label}</span>
      <span className="text-sm text-dfxBlue-800">{value}</span>
    </div>
  );
}

function YesNoSelect({ value, onChange }: { value: YesNo; onChange: (v: YesNo) => void }): JSX.Element {
  return (
    <select
      className="ml-4 shrink-0 px-2 py-1 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800"
      value={value}
      onChange={(e) => onChange(e.target.value as YesNo)}
    >
      <option value="">—</option>
      <option value="Ja">Ja</option>
      <option value="Nein">Nein</option>
    </select>
  );
}

function BankDataEntry({
  entry,
  verifiedName,
  onApprove,
  onReject,
  isSaving,
}: {
  entry: BankDataInfo;
  verifiedName: string;
  onApprove: (id: number, clerk: string) => Promise<void>;
  onReject: (id: number, clerk: string) => Promise<void>;
  isSaving: boolean;
}): JSX.Element {
  const { name: clerk, isLoading: isLoadingClerk } = useStaffVerifiedName();
  const [decision, setDecision] = useState<DecisionValue>(
    entry.status === 'Completed' ? 'Akzeptiert' : entry.status === 'Failed' ? 'Abgelehnt' : '',
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const nameMismatch = verifiedName && entry.name && verifiedName.toLowerCase() !== entry.name.toLowerCase();

  async function handleSave(): Promise<void> {
    if (!decision || !clerk) return;
    setIsProcessing(true);
    try {
      if (decision === 'Akzeptiert') {
        await onApprove(entry.id, clerk);
      } else {
        await onReject(entry.id, clerk);
      }
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Status */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-dfxGray-700 font-medium">Status:</span>
        {statusBadge(entry.status ?? '-')}
        <span className="text-xs text-dfxGray-700">Eingangsdatum: {formatSwissDate(entry.created)}</span>
      </div>

      {/* Checks */}
      <div>
        <h3 className="text-dfxGray-700 mb-2 font-semibold text-sm">Checks</h3>
        <div className="bg-white rounded-lg shadow-sm">
          <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
            <span className="text-sm text-dfxBlue-800">IBAN</span>
            <span className="text-sm text-dfxBlue-800 font-mono">{entry.iban}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
            <span className="text-sm text-dfxBlue-800">Type</span>
            <span className="text-sm text-dfxBlue-800">{entry.type ?? '-'}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
            <span className="text-sm text-dfxBlue-800">userData verifiedName</span>
            <span className="text-sm text-dfxBlue-800">{verifiedName || '-'}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
            <span className="text-sm text-dfxBlue-800">bankData name</span>
            <span className={`text-sm ${nameMismatch ? 'text-dfxRed-100 font-semibold' : 'text-dfxBlue-800'}`}>
              {entry.name || '-'}
            </span>
          </div>
          {nameMismatch && (
            <div className="px-3 py-2 border-b border-dfxGray-300 last:border-0">
              <span className="text-sm text-dfxYellow-700">
                Handelt es sich bei &quot;{verifiedName}&quot; und &quot;{entry.name}&quot; um die selbe Person oder ist
                es ein gemeinschaftliches Ehekonto?
              </span>
            </div>
          )}
          {entry.comment && (
            <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300 last:border-0">
              <span className="text-sm text-dfxBlue-800">Comment</span>
              <span className="text-sm text-dfxBlue-800">{entry.comment}</span>
            </div>
          )}
        </div>
      </div>

      {/* Alternative bankData with same IBAN (approved=true, different user) */}
      {entry.alternatives && entry.alternatives.length > 0 && (
        <div>
          <h3 className="text-dfxGray-700 mb-2 font-semibold text-sm">Alternative bankData mit gleicher IBAN:</h3>
          <div className="bg-white rounded-lg shadow-sm">
            {entry.alternatives.map((alt) => (
              <AlternativeRows key={alt.id} alt={alt} verifiedName={verifiedName} />
            ))}
          </div>
        </div>
      )}

      {entry.status === 'ManualReview' ? (
        <>
          {/* Decision */}
          <div className="bg-white rounded-lg shadow-sm px-3 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-dfxBlue-800 font-medium">Die Bank-Daten werden:</span>
              <select
                className={`ml-4 shrink-0 px-2 py-1 text-sm border border-dfxGray-400 rounded ${
                  decision === 'Akzeptiert'
                    ? 'bg-dfxGreen-100/20 text-dfxGreen-100'
                    : decision === 'Abgelehnt'
                      ? 'bg-dfxRed-100/20 text-dfxRed-100'
                      : 'bg-white text-dfxBlue-800'
                }`}
                value={decision}
                onChange={(e) => setDecision(e.target.value as DecisionValue)}
              >
                <option value="">—</option>
                <option value="Akzeptiert">Akzeptiert</option>
                <option value="Abgelehnt">Abgelehnt</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm px-3 py-3">
            <StaffIdentityBlock label="Editor:" />
          </div>

          {/* Save */}
          <div>
            <button
              className="px-4 py-2 text-sm text-white bg-dfxBlue-800 hover:bg-dfxBlue-800/80 rounded-lg transition-colors disabled:opacity-50"
              onClick={handleSave}
              disabled={isSaving || isProcessing || isLoadingClerk || !decision || !clerk}
            >
              {isProcessing ? 'Speichern...' : 'Speichern'}
            </button>
          </div>
        </>
      ) : (
        <div className="bg-dfxGray-100 border border-dfxGray-300 rounded-lg px-3 py-2 text-sm text-dfxGray-700">
          Diese Bank-Daten haben Status {entry.status ?? '-'} und können von Compliance nur im Status ManualReview
          bearbeitet werden.
        </div>
      )}
    </div>
  );
}

export function BankDataReviewPanel({
  bankDatas,
  userData,
  onApprove,
  onReject,
  isSaving,
}: BankDataReviewPanelProps): JSX.Element {
  // Ident-type bank data is created from KYC ident results and not relevant for compliance review.
  const pendingEntries = bankDatas.filter((b) => b.type !== 'Ident' && b.status === 'ManualReview');
  const verifiedName = String(userData.verifiedName ?? '');

  if (pendingEntries.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 text-center text-dfxGray-700">
        Keine Bank-Daten zur Prüfung vorhanden.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {pendingEntries.map((entry) => (
        <div key={entry.id} className="border-b border-dfxGray-300 pb-6 last:border-0">
          <BankDataEntry
            entry={entry}
            verifiedName={verifiedName}
            onApprove={onApprove}
            onReject={onReject}
            isSaving={isSaving}
          />
        </div>
      ))}
    </div>
  );
}
