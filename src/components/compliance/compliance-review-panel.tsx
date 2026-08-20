import { ReactNode, useEffect, useMemo, useState } from 'react';
import { KycFile, KycStepInfo, UserDataDetail } from 'src/hooks/compliance.hook';
import { useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';
import { extractLegalEntity, statusBadge, todayAsString } from 'src/util/compliance-helpers';
import { formatSwissDate } from 'src/util/utils';
import { CheckItemConfig } from './compliance-review-configs';
import { StaffIdentityBlock } from './staff-identity';

type DecisionValue = '' | 'Akzeptiert' | 'Abgelehnt';

interface ComplianceReviewPanelProps {
  step: KycStepInfo | undefined;
  files: KycFile[];
  allFiles: KycFile[];
  checkItems: CheckItemConfig[];
  showResult?: boolean;
  decisionLabel: string;
  rejectionReasons: string[];
  userData: UserDataDetail;
  kycSteps: KycStepInfo[];
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

// Resolves "{path}" placeholders, supporting dotted nested keys like "organization.name"
// or "country.symbol". Falls back to '-' if any segment is missing.
function resolveLabel(label: string, source: object): string {
  return label.replace(/\{([\w.]+)\}/g, (_, path: string) => {
    let cursor: unknown = source;
    for (const segment of path.split('.')) {
      if (cursor == null || typeof cursor !== 'object') return '-';
      cursor = (cursor as Record<string, unknown>)[segment];
    }
    if (cursor == null) return '-';
    if (typeof cursor === 'object') {
      const obj = cursor as Record<string, unknown>;
      return (obj.name || obj.symbol || obj.id || '-').toString();
    }
    return String(cursor);
  });
}

function formatResultValue(value: unknown): ReactNode {
  if (value == null) return '-';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'object') return JSON.stringify(value);
  const str = String(value);
  if (/^https?:\/\//.test(str)) {
    return (
      <a
        href={str}
        target="_blank"
        rel="noopener noreferrer"
        className="text-dfxBlue-400 underline hover:text-dfxBlue-800 break-all"
      >
        {str}
      </a>
    );
  }
  return str;
}

export function renderResultTable(result: string | undefined): JSX.Element | null {
  if (!result) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(result);
  } catch {
    parsed = result;
  }

  // Array of {key, value} objects (e.g. FinancialData)
  if (Array.isArray(parsed)) {
    const entries = parsed.filter(
      (item): item is { key: string; value: unknown } => item && typeof item.key === 'string',
    );
    if (entries.length > 0) {
      return (
        <table className="w-full">
          <tbody>
            {entries.map((entry) => {
              const isRisky = typeof entry.value === 'string' && entry.value === 'yes_risky_business';
              const rowClass = isRisky ? 'bg-dfxRed-100/20' : '';
              return (
                <tr key={entry.key} className={rowClass}>
                  <td className="py-0.5 pr-4 text-left text-sm text-dfxBlue-800 w-56 align-top">{entry.key}</td>
                  <td className="py-0.5 text-left text-sm text-dfxBlue-800">{formatResultValue(entry.value)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    }
  }

  // Flat object (e.g. BeneficialOwner)
  if (typeof parsed === 'object' && parsed !== null) {
    return (
      <table className="w-full">
        <tbody>
          {Object.entries(parsed as Record<string, unknown>).map(([key, value]) => (
            <tr key={key}>
              <td className="py-0.5 pr-4 text-left text-sm text-dfxBlue-800 w-56 align-top">{key}</td>
              <td className="py-0.5 text-left text-sm text-dfxBlue-800">{formatResultValue(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return <pre className="text-sm text-dfxBlue-800 whitespace-pre-wrap p-3">{String(parsed)}</pre>;
}

export function ComplianceReviewPanel({
  step,
  files,
  allFiles,
  checkItems,
  showResult,
  decisionLabel,
  rejectionReasons,
  userData,
  kycSteps,
  onOpenFile,
  onSave,
  isSaving,
}: ComplianceReviewPanelProps): JSX.Element {
  const { name: clerk, isLoading: isLoadingClerk } = useStaffVerifiedName();
  const [checks, setChecks] = useState<Record<string, string>>({});
  const [decision, setDecision] = useState<DecisionValue>('');
  const [rejectionComment, setRejectionComment] = useState('');

  // Labels can reference fields that live outside UserData (e.g. {legalEntity}
  // is stored on the LegalEntity step result). Merge them into the resolver source.
  const labelSource = useMemo(
    () => ({ ...userData, legalEntity: extractLegalEntity(kycSteps, userData.accountType) }),
    [userData, kycSteps],
  );

  // Only steps in ManualReview can be accepted/rejected by compliance.
  const isComplianceActionable = step?.status === 'ManualReview';

  useEffect(() => {
    if (!step) return;

    const initial: Record<string, string> = {};
    for (const item of checkItems) {
      initial[item.id] = '';
    }

    // Try to restore from result.complianceReview
    let restored = false;
    if (step.result) {
      try {
        const parsed = JSON.parse(step.result) as Record<string, unknown>;
        const saved = parsed.complianceReview as Record<string, string> | undefined;
        if (saved && typeof saved === 'object') {
          for (const item of checkItems) {
            if (saved[item.id]) initial[item.id] = saved[item.id];
          }
          if (saved.decision) setDecision(saved.decision as DecisionValue);
          if (saved.rejectionReason) setRejectionComment(saved.rejectionReason);
          restored = true;
        }
      } catch {
        // No parseable result
      }
    }

    setChecks(initial);

    if (!restored) {
      if (step.status === 'Completed') {
        setDecision('Akzeptiert');
      } else if (step.status === 'Failed') {
        setDecision('Abgelehnt');
        setRejectionComment(step.comment ?? '');
      } else {
        setDecision('');
        setRejectionComment('');
      }
    }
  }, [step, checkItems]);

  if (!step) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 text-center text-dfxGray-700">
        Kein KYC-Step vorhanden für diese Prüfung.
      </div>
    );
  }

  function handleSave(): void {
    if (!step || !decision || !clerk) return;
    const status = decision === 'Akzeptiert' ? 'Completed' : 'Failed';

    // Comment: plain text for GS compatibility
    const comment = decision === 'Abgelehnt' && rejectionComment ? rejectionComment : undefined;

    // Result: merge complianceReview into existing result
    let existingResult: Record<string, unknown> = {};
    if (step.result) {
      try {
        existingResult = JSON.parse(step.result) as Record<string, unknown>;
      } catch {
        // keep empty
      }
    }

    const checksData: Record<string, string> = {};
    for (const [key, value] of Object.entries(checks)) {
      if (value) checksData[key] = value;
    }
    checksData.decision = decision;
    if (decision === 'Abgelehnt' && rejectionComment) {
      checksData.rejectionReason = rejectionComment;
    }

    existingResult.complianceReview = checksData;
    const result = JSON.stringify(existingResult);

    onSave(step.id, status, clerk, step.name, comment, result);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Status + Date */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-dfxGray-700 font-medium">Status:</span>
        {statusBadge(step.status)}
        <span className="text-xs text-dfxGray-700">Eingangsdatum: {formatSwissDate(step.created)}</span>
      </div>

      {/* Result */}
      {showResult && step.result && (
        <div>
          <h3 className="text-dfxGray-700 mb-2 font-semibold text-sm">Result</h3>
          <div className="bg-white rounded-lg shadow-sm">{renderResultTable(step.result)}</div>
        </div>
      )}

      {/* Documents */}
      {files.length > 0 && (
        <div>
          <h3 className="text-dfxGray-700 mb-2 font-semibold text-sm">Dokumente</h3>
          <div className="bg-white rounded-lg shadow-sm">
            {files.map((file) => (
              <button
                key={file.uid}
                className="w-full px-3 py-2 text-left text-sm text-dfxBlue-300 hover:bg-dfxGray-300 transition-colors flex items-center gap-2 border-b border-dfxGray-300 last:border-0"
                onClick={() => onOpenFile(file)}
              >
                <span className="underline">{file.name}</span>
                <span className="text-xs text-dfxGray-700">({file.type})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Checklist */}
      {checkItems.length > 0 && (
        <div>
          <h3 className="text-dfxGray-700 mb-2 font-semibold text-sm">Checks</h3>
          <div className="bg-white rounded-lg shadow-sm">
            {checkItems.map((item) => {
              if (item.visibleCondition && !item.visibleCondition(userData)) return null;
              if (item.type === 'conditional' && item.condition && !item.condition(checks)) return null;

              if (item.type === 'info') {
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300 last:border-0"
                  >
                    <span className="text-sm text-dfxBlue-800">{item.label}</span>
                    <span className="text-sm text-dfxBlue-800">
                      {item.value ? resolveLabel(item.value, labelSource) : ''}
                    </span>
                  </div>
                );
              }

              if (item.type === 'link' && item.href) {
                const resolvedHref = resolveLabel(item.href, { ...labelSource, today: todayAsString() });
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300 last:border-0"
                  >
                    <a
                      href={resolvedHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-dfxBlue-300 underline hover:text-dfxBlue-800 transition-colors"
                    >
                      {item.label}
                    </a>
                  </div>
                );
              }

              if (item.type === 'fileLink') {
                const linkedFile = allFiles.find((f) => f.type === item.fileType);
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300 last:border-0"
                  >
                    {linkedFile ? (
                      <button
                        className="text-sm text-dfxBlue-300 underline hover:text-dfxBlue-800 transition-colors"
                        onClick={() => onOpenFile(linkedFile)}
                      >
                        {item.label}
                      </button>
                    ) : (
                      <span className="text-sm text-dfxGray-700">{item.label} (nicht vorhanden)</span>
                    )}
                  </div>
                );
              }

              if (item.type === 'select' && item.options) {
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300 last:border-0"
                  >
                    <span className="text-sm text-dfxBlue-800">{resolveLabel(item.label, labelSource)}</span>
                    <select
                      className="ml-4 shrink-0 px-2 py-1 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800"
                      value={checks[item.id] ?? ''}
                      onChange={(e) => setChecks((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    >
                      <option value="">—</option>
                      {item.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }

              const displayLabel =
                item.altLabel && item.altCondition?.(userData) ? item.altLabel : resolveLabel(item.label, labelSource);

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300 last:border-0"
                >
                  <span className="text-sm text-dfxBlue-800">{displayLabel}</span>
                  <select
                    className="ml-4 shrink-0 px-2 py-1 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800"
                    value={checks[item.id] ?? ''}
                    onChange={(e) => setChecks((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  >
                    <option value="">—</option>
                    <option value="Yes">Ja</option>
                    <option value="No">Nein</option>
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isComplianceActionable ? (
        <>
          {/* Decision */}
          <div className="bg-white rounded-lg shadow-sm px-3 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-dfxBlue-800 font-medium">{decisionLabel}</span>
              <select
                className={`ml-4 shrink-0 px-2 py-1 text-sm border border-dfxGray-400 rounded ${decision === 'Akzeptiert' ? 'bg-dfxGreen-100/20 text-dfxGreen-100' : decision === 'Abgelehnt' ? 'bg-dfxRed-100/20 text-dfxRed-100' : 'bg-white text-dfxBlue-800'}`}
                value={decision}
                onChange={(e) => setDecision(e.target.value as DecisionValue)}
              >
                <option value="">—</option>
                <option value="Akzeptiert">Akzeptiert</option>
                <option value="Abgelehnt">Abgelehnt</option>
              </select>
            </div>
          </div>

          {/* Comment - only shown when rejected and rejection reasons exist */}
          {decision === 'Abgelehnt' && rejectionReasons.length > 0 && (
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
