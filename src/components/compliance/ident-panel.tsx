import { useState } from 'react';
import { ComplianceUserData, IpLogInfo, KycFile, KycStepInfo } from 'src/hooks/compliance.hook';
import { useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';
import { display, formatBirthday, refName, statusBadge, todayAsString } from 'src/util/compliance-helpers';
import { formatSwissDate } from 'src/util/utils';
import { renderResultTable } from './compliance-review-panel';
import { StaffIdentityBlock } from './staff-identity';

interface IdentPanelProps {
  data: ComplianceUserData;
  onOpenFile: (file: KycFile) => void;
  onSave: (
    stepId: number,
    status: string,
    clerk: string,
    description: string,
    comment?: string,
    result?: string,
  ) => Promise<void>;
  isSaving: boolean;
}

type DecisionValue = '' | 'Akzeptiert' | 'Abgelehnt';

interface IdentResult {
  firstname?: string;
  lastname?: string;
  documentType?: string;
  documentNumber?: string;
  birthday?: string;
  nationality?: string;
  success?: boolean;
  ipCountry?: string;
  country?: string;
  type?: string;
}

function findLatestStep(kycSteps: KycStepInfo[], stepName: string): KycStepInfo | undefined {
  const steps = kycSteps.filter((s) => s.name === stepName);
  const manualReview = steps.filter((s) => s.status === 'ManualReview');
  return (manualReview.length ? manualReview : steps).sort((a, b) => b.sequenceNumber - a.sequenceNumber)[0];
}

function parseIdentResult(step: KycStepInfo): IdentResult | undefined {
  if (!step.result) return undefined;
  try {
    const parsed = JSON.parse(step.result) as Record<string, unknown>;
    const data = parsed.data as Record<string, unknown> | undefined;
    const fixedInfo = data?.fixedInfo as Record<string, unknown> | undefined;
    const info = data?.info as Record<string, unknown> | undefined;

    return {
      firstname: (parsed.firstname ?? fixedInfo?.firstName ?? info?.firstName) as string,
      lastname: (parsed.lastname ?? fixedInfo?.lastName ?? info?.lastName) as string,
      documentType: parsed.documentType as string,
      documentNumber: parsed.documentNumber as string,
      birthday: (parsed.birthday ?? info?.dob) as string,
      nationality: parsed.nationality as string,
      success: parsed.success as boolean,
      ipCountry: (parsed.ipCountry ?? data?.ipCountry) as string,
      country: (parsed.country ?? fixedInfo?.country) as string,
      type: parsed.type as string,
    };
  } catch {
    return undefined;
  }
}

function getUniqueIpCountries(ipLogs: IpLogInfo[]): string[] {
  const countries = ipLogs.map((l) => l.country).filter((c): c is string => !!c);
  return [...new Set(countries)];
}

function InfoLine({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300 last:border-0">
      <span className="text-sm text-dfxBlue-800">{label}</span>
      <span className="text-sm text-dfxBlue-800">{value}</span>
    </div>
  );
}

export function IdentPanel({ data, onOpenFile, onSave, isSaving }: IdentPanelProps): JSX.Element {
  const { name: clerk, isLoading: isLoadingClerk } = useStaffVerifiedName();
  const step = findLatestStep(data.kycSteps, 'Ident');
  const nationalityStep = findLatestStep(data.kycSteps, 'NationalityData');

  const [decision, setDecision] = useState<DecisionValue>(
    step?.status === 'Completed' ? 'Akzeptiert' : step?.status === 'Failed' ? 'Abgelehnt' : '',
  );
  const [rejectionComment, setRejectionComment] = useState(step?.comment ?? '');

  if (!step) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 text-center text-dfxGray-700">
        Kein KYC-Step vorhanden für diese Prüfung.
      </div>
    );
  }

  const identResult = parseIdentResult(step);
  const identFiles = (data.kycFiles ?? []).filter((f) => f.type === 'Identification');
  const ipCountries = getUniqueIpCountries(data.ipLogs ?? []);
  const ud = data.userData;

  let nationalityStepCountry: string | undefined;
  if (nationalityStep?.result) {
    try {
      const parsed = JSON.parse(nationalityStep.result) as Record<string, unknown>;
      const nat = parsed.nationality as Record<string, unknown> | undefined;
      nationalityStepCountry = (nat?.name ?? nat?.symbol) as string;
    } catch {
      // ignore
    }
  }

  function handleSave(): void {
    if (!step || !decision || !clerk) return;
    const status = decision === 'Akzeptiert' ? 'Completed' : 'Failed';
    onSave(
      step.id,
      status,
      clerk,
      'Ident',
      decision === 'Abgelehnt' && rejectionComment ? rejectionComment : undefined,
    );
  }

  const rejectionReasons = ['Identification failed', 'Document expired', 'Name mismatch', 'Photo quality insufficient'];

  return (
    <div className="flex flex-col gap-4">
      {/* Status + Date */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-dfxGray-700 font-medium">Status:</span>
        {statusBadge(step.status)}
        <span className="text-xs text-dfxGray-700">Eingangsdatum: {formatSwissDate(step.created)}</span>
      </div>

      {/* Documents */}
      {identFiles.length > 0 && (
        <div>
          <h3 className="text-dfxGray-700 mb-2 font-semibold text-sm">Dokumente</h3>
          <div className="bg-white rounded-lg shadow-sm">
            {identFiles.map((file) => (
              <button
                key={file.uid}
                className="w-full px-3 py-2 text-left text-sm text-dfxBlue-300 hover:bg-dfxGray-300 transition-colors flex items-center gap-2 border-b border-dfxGray-300 last:border-0"
                onClick={() => onOpenFile(file)}
              >
                <span className="underline">{file.name}</span>
                <span className="text-xs text-dfxGray-700">({file.subType ?? file.type})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* User Data */}
      <div>
        <h3 className="text-dfxGray-700 mb-2 font-semibold text-sm">User Daten</h3>
        <div className="bg-white rounded-lg shadow-sm">
          <InfoLine label="UserDataId" value={display(ud.id)} />
          <InfoLine label="Birthday" value={identResult?.birthday ? formatBirthday(identResult.birthday) : '-'} />
          <InfoLine label="AccountType" value={display(ud.accountType)} />
          <InfoLine
            label="Address"
            value={[ud.street, ud.houseNumber, ud.zip, ud.location].filter(Boolean).join(', ') || '-'}
          />
          <InfoLine label="Document Type" value={identResult?.documentType ?? '-'} />
          <InfoLine label="Mail" value={display(ud.mail)} />
          <InfoLine label="Sprache" value={refName(ud.language)} />
          <InfoLine label="VerifiedName" value={display(ud.verifiedName)} />
          {step.comment && <InfoLine label="Comment" value={step.comment} />}
        </div>
      </div>

      {/* Name Comparison */}
      {identResult && (
        <div>
          <h3 className="text-dfxGray-700 mb-2 font-semibold text-sm">Name-Vergleich</h3>
          <div className="bg-white rounded-lg shadow-sm">
            <div className="flex items-center px-3 py-2 border-b border-dfxGray-300">
              <span className="text-sm text-dfxBlue-800 w-48"></span>
              <span className="text-xs font-medium text-dfxGray-700 w-1/2">DFX</span>
              <span className="text-xs font-medium text-dfxGray-700 w-1/2">Ident</span>
            </div>
            <div className="flex items-center px-3 py-2 border-b border-dfxGray-300">
              <span className="text-sm text-dfxBlue-800 font-medium w-48">Vorname</span>
              <span className="text-sm text-dfxBlue-800 w-1/2">{display(ud.firstname)}</span>
              <span
                className={`text-sm w-1/2 ${
                  identResult.firstname &&
                  ud.firstname &&
                  String(ud.firstname).toLowerCase() !== identResult.firstname.toLowerCase()
                    ? 'text-dfxRed-100 font-semibold'
                    : 'text-dfxBlue-800'
                }`}
              >
                {identResult.firstname ?? '-'}
              </span>
            </div>
            <div className="flex items-center px-3 py-2 border-b border-dfxGray-300 last:border-0">
              <span className="text-sm text-dfxBlue-800 font-medium w-48">Nachname</span>
              <span className="text-sm text-dfxBlue-800 w-1/2">{display(ud.surname)}</span>
              <span
                className={`text-sm w-1/2 ${
                  identResult.lastname &&
                  ud.surname &&
                  String(ud.surname).toLowerCase() !== identResult.lastname.toLowerCase()
                    ? 'text-dfxRed-100 font-semibold'
                    : 'text-dfxBlue-800'
                }`}
              >
                {identResult.lastname ?? '-'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Countries */}
      <div>
        <h3 className="text-dfxGray-700 mb-2 font-semibold text-sm">Länder</h3>
        <div className="bg-white rounded-lg shadow-sm">
          <InfoLine label="Ident Country" value={identResult?.country ?? '-'} />
          <InfoLine label="Ident IP-Country" value={identResult?.ipCountry ?? '-'} />
          <InfoLine label="NationalityStep Land" value={nationalityStepCountry ?? '-'} />
          <InfoLine label="IP-Countries (Logins)" value={ipCountries.length > 0 ? ipCountries.join(', ') : '-'} />
        </div>
      </div>

      {/* Result */}
      {step.result && (
        <div>
          <h3 className="text-dfxGray-700 mb-2 font-semibold text-sm">Result</h3>
          <div className="bg-white rounded-lg shadow-sm overflow-auto max-h-[30vh]">
            {renderResultTable(step.result)}
          </div>
        </div>
      )}

      {/* Aktennotiz Link */}
      <div className="bg-white rounded-lg shadow-sm">
        <a
          href={`/kyc/log?userDataId=${display(ud.id)}&eventDate=${todayAsString()}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full px-3 py-2 text-left text-sm text-dfxBlue-300 underline hover:text-dfxBlue-800 transition-colors block"
        >
          Aktennotiz erstellen
        </a>
      </div>

      {step?.status === 'ManualReview' ? (
        <>
          {/* Decision */}
          <div className="bg-white rounded-lg shadow-sm px-3 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-dfxBlue-800 font-medium">Identifikation wird:</span>
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

          {/* Comment */}
          {decision === 'Abgelehnt' && (
            <div>
              <h3 className="text-dfxGray-700 mb-2 font-semibold text-sm">Kommentar:</h3>
              <select
                className="w-full px-2 py-1 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800"
                value={rejectionComment}
                onChange={(e) => setRejectionComment(e.target.value)}
              >
                <option value="">—</option>
                {rejectionReasons.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="bg-white rounded-lg shadow-sm px-3 py-3">
            <StaffIdentityBlock label="Editor:" />
          </div>

          {/* Save */}
          <div>
            <button
              className="px-4 py-2 text-sm text-white bg-dfxBlue-800 hover:bg-dfxBlue-800/80 rounded-lg transition-colors disabled:opacity-50"
              onClick={handleSave}
              disabled={isSaving || isLoadingClerk || !decision || !clerk}
            >
              {isSaving ? 'Speichern...' : 'Speichern'}
            </button>
          </div>
        </>
      ) : (
        <div className="bg-dfxGray-100 border border-dfxGray-300 rounded-lg px-3 py-2 text-sm text-dfxGray-700">
          Steps im Status Manual Review können akzeptiert oder abgelehnt werden.
        </div>
      )}
    </div>
  );
}
