import { useEffect, useState } from 'react';
import { KycFile, KycStepInfo, UserDataDetail } from 'src/hooks/compliance.hook';
import { useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';
import { StaffIdentityBlock } from './staff-identity';
import {
  buildAddress,
  display,
  formatBirthday,
  formatDate,
  formatDateTime,
  formatValue,
  refName,
  statusBadge,
} from 'src/util/compliance-helpers';

type DecisionValue = '' | 'Akzeptiert' | 'Abgelehnt';

export interface ComplianceReviewFreigabeSaveParams {
  stepId: number;
  status: string;
  result?: string;
  comment?: string;
  userDataUpdate?: Record<string, unknown>;
  pdfData?: {
    finalDecision: string;
    processedBy: string;
    complexOrgStructure?: string;
    highRisk?: string;
    depositLimit?: string;
    amlAccountType?: string;
    commentGmeR?: string;
    reasonSeatingCompany?: string;
    businessActivities?: string;
  };
}

interface OnboardingComplianceReviewFreigabePanelProps {
  step: KycStepInfo | undefined;
  userData: UserDataDetail;
  kycSteps: KycStepInfo[];
  kycFiles: KycFile[];
  onOpenFile: (file: KycFile) => void;
  onSave: (params: ComplianceReviewFreigabeSaveParams) => Promise<void>;
  isSaving: boolean;
}

interface SavedComment {
  complexOrgStructure?: string;
  highRisk?: string;
  depositLimit?: string;
  amlAccountType?: string;
  processedBy?: string;
  finalDecision?: string;
}

function findStep(steps: KycStepInfo[], name: string): KycStepInfo | undefined {
  return steps.filter((s) => s.name === name).sort((a, b) => b.sequenceNumber - a.sequenceNumber)[0];
}

function parseResult(step: KycStepInfo | undefined): Record<string, unknown> | undefined {
  if (!step?.result) return undefined;
  try {
    return JSON.parse(step.result) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function findFile(files: KycFile[], type?: string, subType?: string, valid?: boolean): KycFile | undefined {
  return files.find(
    (f) =>
      (!type || f.type === type) && (!subType || f.subType === subType) && (valid === undefined || f.valid === valid),
  );
}

function findLatestFile(files: KycFile[], type: string, subType: string): KycFile | undefined {
  return files
    .filter((f) => f.type === type && f.subType === subType)
    .sort((a, b) => {
      // Sort by created date if available, otherwise by id (higher id = newer)
      if (a.created && b.created) {
        return new Date(b.created).getTime() - new Date(a.created).getTime();
      }
      return b.id - a.id;
    })[0];
}

function renderStepResult(result: string | undefined): JSX.Element | null {
  if (!result) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(result);
  } catch {
    return <span className="text-sm text-dfxBlue-800">{result}</span>;
  }

  // Array of {key, value} objects (e.g. FinancialData)
  if (Array.isArray(parsed)) {
    const entries = parsed
      .filter((item): item is { key: string; value: unknown } => item && typeof item.key === 'string')
      .map((item) => ({ label: item.key, value: formatValue(item.value) }));
    if (entries.length > 0) return <InfoTable rows={entries} />;
  }

  // Flat object (e.g. BeneficialOwner)
  if (typeof parsed === 'object' && parsed !== null) {
    const entries = Object.entries(parsed as Record<string, unknown>).map(([key, value]) => ({
      label: key,
      value: formatValue(value),
    }));
    return <InfoTable rows={entries} />;
  }

  return <span className="text-sm text-dfxBlue-800">{String(parsed)}</span>;
}

function findFileExcludeSubType(files: KycFile[], type: string, excludeSubType: string): KycFile | undefined {
  return files.find((f) => f.type === type && f.subType !== excludeSubType);
}

// --- Sub-components ---

function SectionTitle({ title }: { title: string }): JSX.Element {
  return <div className="text-sm font-bold text-dfxBlue-800 mt-4 mb-1">{title}</div>;
}

function InfoTable({
  rows,
}: {
  rows: { label: string; value: string; isLink?: boolean; href?: string }[];
}): JSX.Element {
  return (
    <table className="w-full">
      <tbody>
        {rows
          .filter((r) => r.label !== '')
          .map((row) => (
            <tr key={row.label}>
              <td className="py-0.5 pr-4 text-left text-sm text-dfxBlue-800 w-56 align-top">{row.label}</td>
              <td className="py-0.5 text-left text-sm text-dfxBlue-800 break-all">
                {row.isLink && row.href ? (
                  <a
                    href={row.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-dfxBlue-300 underline hover:text-dfxBlue-800"
                  >
                    {row.value}
                  </a>
                ) : (
                  row.value
                )}
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

function DocLink({
  label,
  file,
  onOpenFile,
  decision,
  onDecisionChange,
}: {
  label: string;
  file: KycFile | undefined;
  onOpenFile: (f: KycFile) => void;
  decision?: DecisionValue;
  onDecisionChange?: (v: DecisionValue) => void;
}): JSX.Element {
  return (
    <tr>
      <td className="py-0.5 pr-4 text-left text-sm text-dfxBlue-800 w-56 align-top">{label}</td>
      <td className="py-0.5 text-left text-sm">
        {file ? (
          <button
            className="text-dfxBlue-300 underline hover:text-dfxBlue-800 transition-colors text-left"
            onClick={() => onOpenFile(file)}
          >
            {file.name}
          </button>
        ) : (
          <span className="text-dfxGray-700">(nicht vorhanden)</span>
        )}
      </td>
      <td className="py-0.5 text-right">
        {onDecisionChange ? (
          <select
            className={`px-2 py-1 text-sm border border-dfxGray-400 rounded ${decision === 'Akzeptiert' ? 'bg-dfxGreen-100/20 text-dfxGreen-100' : decision === 'Abgelehnt' ? 'bg-dfxRed-100/20 text-dfxRed-100' : 'bg-white text-dfxBlue-800'}`}
            value={decision ?? ''}
            onChange={(e) => onDecisionChange(e.target.value as DecisionValue)}
          >
            <option value="">—</option>
            <option value="Akzeptiert">Akzeptiert</option>
            <option value="Abgelehnt">Abgelehnt</option>
          </select>
        ) : decision === 'Akzeptiert' ? (
          <span className="px-2 py-1 text-sm font-medium text-dfxGreen-100">{decision}</span>
        ) : decision === 'Abgelehnt' ? (
          <span className="px-2 py-1 text-sm font-medium text-primary-red">{decision}</span>
        ) : null}
      </td>
    </tr>
  );
}

function DropdownField({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <tr>
      <td className="py-1 pr-4 text-left text-sm text-dfxBlue-800 w-56 align-top">{label}</td>
      <td className="py-1" />
      <td className="py-1 text-right">
        <select
          className={`px-2 py-1 text-sm border border-dfxGray-400 rounded disabled:opacity-50 disabled:cursor-not-allowed ${value === 'Akzeptiert' ? 'bg-dfxGreen-100/20 text-dfxGreen-100' : value === 'Abgelehnt' ? 'bg-dfxRed-100/20 text-dfxRed-100' : 'bg-white text-dfxBlue-800'}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
}

function TextareaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <tr>
      <td className="py-2 pr-4 text-left text-sm text-dfxBlue-800 w-56 align-top whitespace-pre-line">{label}</td>
      <td className="py-2 text-left" colSpan={2}>
        <textarea
          className="w-full px-2 py-1 text-sm border border-dfxGray-400 rounded bg-dfxGray-300/30 text-dfxBlue-800 resize-y"
          rows={3}
          value={value}
          placeholder="n.a."
          onChange={(e) => onChange(e.target.value)}
        />
      </td>
    </tr>
  );
}

// --- Main component ---

export function ComplianceReviewFreigabePanel({
  step,
  userData,
  kycSteps,
  kycFiles,
  onOpenFile,
  onSave,
  isSaving,
}: OnboardingComplianceReviewFreigabePanelProps): JSX.Element {
  // Derived from predecessor step status (read-only, like in GS)
  const ownerDirectoryStep = findStep(kycSteps, 'OwnerDirectory');
  const legalEntityStepForDecision = findStep(kycSteps, 'LegalEntity');
  const authorityStepForDecision = findStep(kycSteps, 'Authority');

  function stepToDecision(s: KycStepInfo | undefined): DecisionValue {
    if (!s) return '';
    if (s.status === 'Completed') return 'Akzeptiert';
    if (s.status === 'Failed') return 'Abgelehnt';
    return '';
  }

  const stockRegisterDecision = stepToDecision(ownerDirectoryStep);
  const commercialRegisterDecision = stepToDecision(legalEntityStepForDecision);
  const authorityDecision = stepToDecision(authorityStepForDecision);

  const [complexOrgStructure, setComplexOrgStructure] = useState('');
  const [highRisk, setHighRisk] = useState('');
  const [amlAccountType, setAmlAccountType] = useState('');
  const [commentGmeR, setCommentGmeR] = useState('');
  const [reasonSeatingCompany, setReasonSeatingCompany] = useState('');
  const [businessActivities, setBusinessActivities] = useState('');
  const [finalDecision, setFinalDecision] = useState<DecisionValue>('');
  const { name: processedByName, isLoading: isLoadingClerk } = useStaffVerifiedName();
  const [processedBy, setProcessedBy] = useState('');

  useEffect(() => {
    if (processedByName) setProcessedBy(processedByName);
  }, [processedByName]);

  // Load saved state from result.complianceReview and result text fields
  useEffect(() => {
    if (!step) return;

    if (step.result) {
      try {
        const parsed = JSON.parse(step.result) as Record<string, unknown>;

        // Restore text fields
        if (parsed.CommentGmeR) setCommentGmeR(String(parsed.CommentGmeR));
        if (parsed.ReasonSeatingCompany) setReasonSeatingCompany(String(parsed.ReasonSeatingCompany));
        if (parsed.BusinessActivities) setBusinessActivities(String(parsed.BusinessActivities));

        // Restore decisions from complianceReview
        const saved = parsed.complianceReview as SavedComment | undefined;
        if (saved && typeof saved === 'object') {
          if (saved.complexOrgStructure) setComplexOrgStructure(saved.complexOrgStructure);
          if (saved.highRisk) setHighRisk(saved.highRisk);
          if (saved.amlAccountType) setAmlAccountType(saved.amlAccountType);
          if (saved.finalDecision) setFinalDecision(saved.finalDecision as DecisionValue);
        }
      } catch {
        // ignore
      }
    }
  }, [step]);

  if (!step) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 text-center text-dfxGray-700">
        Kein DfxApproval-Step vorhanden.
      </div>
    );
  }

  const accountType = display(userData.accountType);
  const isOrganization = accountType === 'Organization';
  const legalEntityStep = findStep(kycSteps, 'LegalEntity');
  const legalEntityResult = parseResult(legalEntityStep);
  const legalEntity = legalEntityResult?.legalEntity ? String(legalEntityResult.legalEntity) : '';
  const isGmbH = legalEntity === 'GmbH';

  const kycHash = display(userData.kycHash);
  const financialDataStep = findStep(kycSteps, 'FinancialData');
  const beneficialOwnerStep = findStep(kycSteps, 'BeneficialOwner');
  const signatoryPowerStep = findStep(kycSteps, 'SignatoryPower');
  const operationalActivityStep = findStep(kycSteps, 'OperationalActivity');
  const operationalActivityResult = parseResult(operationalActivityStep);

  async function handleSave(): Promise<void> {
    if (!step || !finalDecision) return;

    const status = finalDecision === 'Akzeptiert' ? 'Completed' : 'Failed';

    // Comment: plain text for GS compatibility
    const comment = finalDecision === 'Abgelehnt' ? 'Blocked' : undefined;

    // depositLimit is always 100000 at onboarding (for all account types).
    // For Personal: organization-only fields are hidden in the UI; force fixed values for amlAccountType
    // and skip complexOrgStructure/highRisk so they neither land in result, userDataUpdate nor PDF.
    const isPersonal = accountType === 'Personal';
    const effectiveComplexOrg = isPersonal ? '' : complexOrgStructure;
    const effectiveHighRisk = isPersonal ? '' : highRisk;
    const effectiveDepositLimit = '100000';
    const effectiveAmlAccountType = isPersonal ? 'natural person' : amlAccountType;
    const effectiveCommentGmeR = isPersonal ? '' : commentGmeR;
    const effectiveReasonSeatingCompany = isPersonal ? '' : reasonSeatingCompany;
    const effectiveBusinessActivities = isPersonal ? '' : businessActivities;

    // Result: merge text fields + complianceReview into existing result
    let existingResult: Record<string, unknown> = {};
    if (step.result) {
      try {
        existingResult = JSON.parse(step.result) as Record<string, unknown>;
      } catch {
        // keep empty
      }
    }

    existingResult.CommentGmeR = effectiveCommentGmeR || undefined;
    existingResult.ReasonSeatingCompany = effectiveReasonSeatingCompany || undefined;
    existingResult.BusinessActivities = effectiveBusinessActivities || undefined;

    existingResult.complianceReview = {
      complexOrgStructure: effectiveComplexOrg || undefined,
      highRisk: effectiveHighRisk || undefined,
      depositLimit: effectiveDepositLimit || undefined,
      amlAccountType: effectiveAmlAccountType || undefined,
      processedBy: processedBy || undefined,
      finalDecision,
    } as SavedComment;

    const result = JSON.stringify(existingResult);

    const userDataUpdate: Record<string, unknown> = {};
    if (effectiveComplexOrg) userDataUpdate.complexOrgStructure = effectiveComplexOrg === 'Ja';
    if (effectiveHighRisk) userDataUpdate.highRisk = effectiveHighRisk === 'Ja';
    if (effectiveDepositLimit) userDataUpdate.depositLimit = Number.parseInt(effectiveDepositLimit);
    if (effectiveAmlAccountType) userDataUpdate.amlAccountType = effectiveAmlAccountType;

    await onSave({
      stepId: step.id,
      status,
      result,
      comment,
      userDataUpdate: Object.keys(userDataUpdate).length > 0 ? userDataUpdate : undefined,
      pdfData: {
        finalDecision,
        processedBy,
        complexOrgStructure: effectiveComplexOrg || undefined,
        highRisk: effectiveHighRisk || undefined,
        depositLimit: effectiveDepositLimit || undefined,
        amlAccountType: effectiveAmlAccountType || undefined,
        commentGmeR: effectiveCommentGmeR || undefined,
        reasonSeatingCompany: effectiveReasonSeatingCompany || undefined,
        businessActivities: effectiveBusinessActivities || undefined,
      },
    });
  }

  // --- User info rows ---
  const userInfoRows = [
    { label: 'UserDataId', value: display(userData.id) },
    { label: 'Account Type', value: accountType },
    {
      label: 'Name Kontoeröffner',
      value: [userData.firstname, userData.surname].filter(Boolean).join(' ') || '-',
    },
    ...(isOrganization ? [{ label: 'Name Vertragspartei', value: display(userData.organization?.name) }] : []),
    { label: 'Privat-Adresse', value: buildAddress(userData) },
    ...(isOrganization ? [{ label: 'Firmen-Adresse', value: buildAddress(userData.organization) }] : []),
    { label: 'Geburtstag', value: userData.birthday ? formatBirthday(userData.birthday) : '-' },
    { label: 'Mail', value: display(userData.mail) },
    { label: 'Phone', value: display(userData.phone) },
    { label: 'Sprache', value: refName(userData.language) },
    { label: 'Nationalität', value: refName(userData.nationality) },
    { label: 'lastNameCheckDate', value: userData.lastNameCheckDate ? formatDate(userData.lastNameCheckDate) : '-' },
    { label: 'PEP', value: display(userData.pep) },
    { label: 'HighRisk', value: display(userData.highRisk) },
    { label: 'identDocumentId', value: display(userData.identDocumentId) },
    { label: 'identificationType', value: display(userData.identificationType) },
    { label: 'identDocumentType', value: display(userData.identDocumentType) },
    {
      label: 'kycHash',
      value: kycHash !== '-' ? kycHash : '-',
      isLink: kycHash !== '-',
      href: kycHash !== '-' ? `/kyc?code=${kycHash}` : undefined,
    },
    ...(isOrganization
      ? [{ label: 'accountOpenerAuthorization', value: display(userData.organization?.accountOpenerAuthorization) }]
      : []),
  ];

  // --- Document files ---
  const deckblatt = findFile(kycFiles, 'UserNotes', 'GwGFileCover');
  const identDoc = findFile(kycFiles, 'Identification', undefined, true);
  const identForm = findFile(kycFiles, 'UserNotes', 'IdentificationForm');
  const riskProfile = findFile(kycFiles, 'UserNotes', 'RiskProfile');
  const formAK = kycFiles.find((f) => f.subType === 'FormA' || f.subType === 'FormK');
  const nameCheckDfx = findFile(kycFiles, 'UserNotes', 'DfxNameCheck');
  const nameCheckPersonal = findFileExcludeSubType(kycFiles, 'NameCheck', 'BusinessNameCheck');
  const nameCheckBusiness = findFile(kycFiles, 'NameCheck', 'BusinessNameCheck');
  const stockRegisterFile = kycFiles.find((f) => f.type === 'StockRegister');
  const commercialRegisterFile = kycFiles.find((f) => f.type === 'CommercialRegister');
  const authorityFile = kycFiles.find((f) => f.type === 'Authority');
  const onboardingReportFile = findLatestFile(kycFiles, 'UserNotes', 'OnboardingReport');

  const signatoryPowerResult = parseResult(signatoryPowerStep);

  return (
    <>
      <div className="flex flex-col gap-2">
        {/* Title */}
        <h2 className="text-xl font-bold text-dfxBlue-800 mb-2">GwG Kunden Onboarding</h2>

        {/* Status */}
        <div className="flex items-center gap-3 mb-2">
          <span className="text-sm text-dfxGray-700 font-medium">Status:</span>
          {statusBadge(step.status)}
        </div>

        {/* Section 1: User Data */}
        <SectionTitle title="User Daten:" />
        <InfoTable rows={userInfoRows} />

        {/* Section 3: FinancialData */}
        {financialDataStep?.result && (
          <>
            <SectionTitle title="FinancialData:" />
            {renderStepResult(financialDataStep.result)}
          </>
        )}

        {/* Section 4: BeneficialOwners */}
        {beneficialOwnerStep?.result && (
          <>
            <SectionTitle title="BeneficialOwners:" />
            {renderStepResult(beneficialOwnerStep.result)}
          </>
        )}

        {/* Section 5: Step Results (only Organization) */}
        {isOrganization && (
          <>
            <InfoTable
              rows={[
                { label: 'Legal Entity', value: legalEntity || '-' },
                {
                  label: 'SignatoryPower',
                  value: signatoryPowerResult?.signatoryPower ? String(signatoryPowerResult.signatoryPower) : '-',
                },
                {
                  label: 'OperationalActivity',
                  value:
                    operationalActivityResult?.isOperational != null
                      ? String(operationalActivityResult.isOperational)
                      : '-',
                },
                {
                  label: 'WebsiteUrl',
                  value: operationalActivityResult?.websiteUrl ? String(operationalActivityResult.websiteUrl) : '-',
                  isLink: !!operationalActivityResult?.websiteUrl,
                  href: operationalActivityResult?.websiteUrl
                    ? String(operationalActivityResult.websiteUrl)
                    : undefined,
                },
              ]}
            />
          </>
        )}

        {/* Documents + Decisions + Footer — one table for consistent column alignment */}
        <table className="w-full mt-4">
          <colgroup>
            <col style={{ width: '220px' }} />
            <col />
            <col style={{ width: '180px' }} />
          </colgroup>
          <tbody>
            {/* Section 6: Documents */}
            <tr>
              <td colSpan={3} className="text-sm font-bold text-dfxBlue-800 pt-4 pb-1">
                Documents:
              </td>
            </tr>
            <DocLink label="Deckblatt" file={deckblatt} onOpenFile={onOpenFile} />
            <DocLink label="Identifikationsdokument" file={identDoc} onOpenFile={onOpenFile} />
            <DocLink label="Identifizierungsformular" file={identForm} onOpenFile={onOpenFile} />
            <DocLink label="Risikoprofil" file={riskProfile} onOpenFile={onOpenFile} />
            <DocLink label="Formular A oder K" file={formAK} onOpenFile={onOpenFile} />
            <DocLink label="Name Check DFX" file={nameCheckDfx} onOpenFile={onOpenFile} />
            <DocLink label="Name Check Dilisense Personal" file={nameCheckPersonal} onOpenFile={onOpenFile} />
            {isOrganization && (
              <DocLink label="Name Check Dilisense Business" file={nameCheckBusiness} onOpenFile={onOpenFile} />
            )}
            {isOrganization && (
              <DocLink
                label="Entscheid zum Handelsregisterauszug:"
                file={commercialRegisterFile}
                onOpenFile={onOpenFile}
                decision={commercialRegisterDecision}
              />
            )}
            {isOrganization && (
              <DocLink
                label="Entscheid zur Vollmacht:"
                file={authorityFile}
                onOpenFile={onOpenFile}
                decision={authorityDecision}
              />
            )}
            {isOrganization && !isGmbH && (
              <DocLink
                label="Entscheid zum Aktienbuch:"
                file={stockRegisterFile}
                onOpenFile={onOpenFile}
                decision={stockRegisterDecision}
              />
            )}

            {/* Onboarding Report PDF */}
            <DocLink label="Onboarding Report PDF:" file={onboardingReportFile} onOpenFile={onOpenFile} />

            {/* Spacer */}
            <tr>
              <td className="py-3" colSpan={3} />
            </tr>

            {/* Section 7: Decision Fields */}
            {accountType !== 'Personal' && (
              <>
                <DropdownField
                  label="Complex organization structure:"
                  value={complexOrgStructure}
                  options={[
                    { value: 'Ja', label: 'Ja' },
                    { value: 'Nein', label: 'Nein' },
                  ]}
                  onChange={setComplexOrgStructure}
                />
                <DropdownField
                  label='Risiko Einstufung als "Geschäftsbeziehung mit erhöhtem Risiko":'
                  value={highRisk}
                  options={[
                    { value: 'Ja', label: 'Ja' },
                    { value: 'Nein', label: 'Nein' },
                  ]}
                  onChange={setHighRisk}
                />
              </>
            )}
            {accountType !== 'Personal' && (
              <DropdownField
                label="amlAccountType:"
                value={amlAccountType}
                options={[
                  { value: 'operativ tätige Gesellschaft', label: 'operativ tätige Gesellschaft' },
                  { value: 'Sitzgesellschaft', label: 'Sitzgesellschaft' },
                  { value: 'Einzelunternehmen', label: 'Einzelunternehmen' },
                  { value: 'Stiftung', label: 'Stiftung' },
                  { value: 'Verein', label: 'Verein' },
                ]}
                onChange={setAmlAccountType}
              />
            )}
            {accountType !== 'Personal' && (
              <>
                <TextareaField
                  label="Wenn GmeR:
Kommentar für die Aufnahme"
                  value={commentGmeR}
                  onChange={setCommentGmeR}
                />
                <TextareaField
                  label="Wenn Sitzgesellschaft:
Gründe für die Verwendung einer Sitzgesellschaften"
                  value={reasonSeatingCompany}
                  onChange={setReasonSeatingCompany}
                />
                <TextareaField
                  label="Bei Einzelunternehmen und Organisationen:
Beschreibung der Geschäftlichen Aktivitäten"
                  value={businessActivities}
                  onChange={setBusinessActivities}
                />
              </>
            )}

            {/* Spacer */}
            <tr>
              <td className="py-3" colSpan={3} />
            </tr>

            {/* Final Decision */}
            <DropdownField
              label="Finaler Entscheid:"
              value={finalDecision}
              options={[
                { value: 'Akzeptiert', label: 'Akzeptiert' },
                { value: 'Abgelehnt', label: 'Abgelehnt' },
              ]}
              onChange={(v) => setFinalDecision(v as DecisionValue)}
            />

            {/* Spacer */}
            <tr>
              <td className="py-3" colSpan={3} />
            </tr>

            {/* UTC Date + Processed by */}
            <tr>
              <td className="py-1 pr-4 text-left text-sm text-dfxBlue-800">Datum:</td>
              <td className="py-1 text-left text-sm text-dfxBlue-800" colSpan={2}>
                {formatDateTime(new Date().toISOString())}
              </td>
            </tr>
            <tr>
              <td className="py-1 pr-4 align-top" colSpan={3}>
                <StaffIdentityBlock label="Bearbeitet von:" />
              </td>
            </tr>
          </tbody>
        </table>

        {/* Save */}
        <div className="mt-4">
          <button
            className="px-4 py-2 text-sm text-white bg-dfxBlue-800 hover:bg-dfxBlue-800/80 rounded-lg transition-colors disabled:opacity-50"
            onClick={handleSave}
            disabled={isSaving || isLoadingClerk || !finalDecision || !processedBy}
          >
            {isSaving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </>
  );
}
