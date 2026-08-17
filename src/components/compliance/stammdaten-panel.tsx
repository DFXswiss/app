import { Country } from '@dfx.swiss/react';
import { useEffect, useState } from 'react';
import { useSettingsContext } from 'src/contexts/settings.context';
import { ComplianceUserData, KycFile, KycStepInfo, UserDataDetail } from 'src/hooks/compliance.hook';
import { useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';
import { statusBadge, formatDateTime } from 'src/util/compliance-helpers';
import { StaffIdentityBlock } from './staff-identity';

interface StammdatenPanelProps {
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

interface ChangeSection {
  label: string;
  stepName: string;
  fileType?: string;
}

interface ComparisonRow {
  label: string;
  oldValue: string;
  newValue: string;
}

interface DocumentCheckItem {
  id: string;
  label: string;
}

const nameCheckItemsPersonal: DocumentCheckItem[] = [
  { id: 'heiratsurkunde', label: 'Die Heiratsurkunde bestätigt den neuen Namen' },
  { id: 'namensaenderungsurkunde', label: 'Die Namensänderungsurkunde bestätigt den neuen Namen' },
  { id: 'gerichtsbeschluss', label: 'Der Gerichtsbeschluss bestätigt den neuen Namen' },
  {
    id: 'ausweisVergleich',
    label: 'Der aktualisierte Reisepass/Personalausweis mit altem Ausweis bestätigt den neuen Namen',
  },
];

const nameCheckItemsCompany: DocumentCheckItem[] = [
  { id: 'hrAuszug', label: 'Der HR-Auszug bestätigt den neuen Namen' },
];

const addressCheckItemsPersonal: DocumentCheckItem[] = [
  { id: 'meldebescheinigung', label: 'Die Meldebescheinigung / Wohnsitzbestätigung liegt vor' },
  { id: 'amtlicherAusweis', label: 'Der amtliche Ausweis mit aktualisierter Adresse liegt vor' },
  { id: 'rechnung', label: 'Die Rechnung (Strom, Handy, Krankenkasse) liegt vor' },
  { id: 'bankdokument', label: 'Das Bankdokument liegt vor' },
  { id: 'mietvertrag', label: 'Der Mietvertrag oder Grundbuchauszug liegt vor' },
  { id: 'behoerdenkorrespondenz', label: 'Die offizielle Behördenkorrespondenz liegt vor' },
];

const addressCheckItemsCompany: DocumentCheckItem[] = [
  { id: 'hrAuszug', label: 'Der HR-Auszug liegt vor' },
  { id: 'vrProtokoll', label: 'Das Protokoll von der VR-Sitzung liegt vor' },
  { id: 'pensionskasseRechnung', label: 'Die Rechnung (z.B. Pensionskasse) liegt vor' },
  { id: 'bankbeleg', label: 'Der Bankbeleg liegt vor' },
];

const changeSections: ChangeSection[] = [
  { label: 'Namensänderung', stepName: 'NameChange', fileType: 'NameChange' },
  { label: 'Adressänderung', stepName: 'AddressChange', fileType: 'AddressChange' },
];

function findLatestStep(kycSteps: KycStepInfo[], stepName: string): KycStepInfo | undefined {
  return kycSteps.filter((s) => s.name === stepName).sort((a, b) => b.sequenceNumber - a.sequenceNumber)[0];
}

function safeString(value: unknown): string {
  if (value == null) return '-';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return obj.name?.toString() ?? obj.symbol?.toString() ?? '-';
  }
  return String(value);
}

// AddressChange step results store country as `{ id }` only (see kyc-data.dto.ts).
// Resolve via the loaded countries list so the new country is displayed by name.
function countryString(value: unknown, countries: Country[]): string {
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (obj.name == null && obj.symbol == null && typeof obj.id === 'number') {
      const match = countries.find((c) => c.id === obj.id);
      if (match) return match.name ?? match.symbol ?? '-';
    }
  }
  return safeString(value);
}

function getCheckItems(stepName: string, accountType: string): DocumentCheckItem[] {
  const isCompany = accountType === 'Organization' || accountType === 'SoleProprietorship';

  switch (stepName) {
    case 'NameChange':
      return isCompany ? nameCheckItemsCompany : nameCheckItemsPersonal;
    case 'AddressChange':
      return isCompany ? addressCheckItemsCompany : addressCheckItemsPersonal;
    default:
      return [];
  }
}

function buildComparisonRows(
  stepName: string,
  result: string,
  userData: UserDataDetail,
  countries: Country[],
): ComparisonRow[] {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(result) as Record<string, unknown>;
  } catch {
    return [];
  }

  switch (stepName) {
    case 'NameChange':
      return [
        { label: 'Vorname', oldValue: safeString(userData.firstname), newValue: safeString(parsed.firstName) },
        { label: 'Nachname', oldValue: safeString(userData.surname), newValue: safeString(parsed.lastName) },
      ];

    case 'AddressChange': {
      const addr = (parsed.address ?? {}) as Record<string, unknown>;
      return [
        { label: 'Strasse', oldValue: safeString(userData.street), newValue: safeString(addr.street) },
        { label: 'Hausnummer', oldValue: safeString(userData.houseNumber), newValue: safeString(addr.houseNumber) },
        { label: 'PLZ', oldValue: safeString(userData.zip), newValue: safeString(addr.zip) },
        { label: 'Ort', oldValue: safeString(userData.location), newValue: safeString(addr.city) },
        {
          label: 'Land',
          oldValue: countryString(userData.country, countries),
          newValue: countryString(addr.country, countries),
        },
      ];
    }

    default:
      return [];
  }
}

function ComparisonTable({ rows }: { rows: ComparisonRow[] }): JSX.Element {
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-dfxGray-400">
          <th className="py-1 pr-4 text-left text-xs font-semibold text-dfxGray-700 w-28">Feld</th>
          <th className="py-1 pr-4 text-left text-xs font-semibold text-dfxGray-700">Aktuell</th>
          <th className="py-1 text-left text-xs font-semibold text-dfxGray-700">Neu</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const changed = row.oldValue !== row.newValue;
          return (
            <tr key={row.label} className={changed ? 'bg-yellow-50' : ''}>
              <td className="py-1 pr-4 text-sm text-dfxBlue-800 font-medium">{row.label}</td>
              <td className="py-1 pr-4 text-sm text-dfxGray-700">{row.oldValue}</td>
              <td className={`py-1 text-sm ${changed ? 'text-dfxBlue-800 font-semibold' : 'text-dfxGray-700'}`}>
                {row.newValue}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ChangeSectionPanel({
  section,
  step,
  files,
  userData,
  checkItems,
  onOpenFile,
  onSave,
  isSaving,
}: {
  section: ChangeSection;
  step: KycStepInfo;
  files: KycFile[];
  userData: UserDataDetail;
  checkItems: DocumentCheckItem[];
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
}): JSX.Element {
  const { name: clerk, isLoading: isLoadingClerk } = useStaffVerifiedName();
  const [decision, setDecision] = useState<DecisionValue>(
    step.status === 'Completed' ? 'Akzeptiert' : step.status === 'Failed' ? 'Abgelehnt' : '',
  );
  const [comment, setComment] = useState(step.comment ?? '');
  const [checks, setChecks] = useState<Record<string, string>>({});

  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const item of checkItems) {
      initial[item.id] = '';
    }

    if (step.result) {
      try {
        const parsed = JSON.parse(step.result) as Record<string, unknown>;
        const saved = parsed.complianceReview as Record<string, string> | undefined;
        if (saved && typeof saved === 'object') {
          for (const item of checkItems) {
            if (saved[item.id]) initial[item.id] = saved[item.id];
          }
          if (saved.decision) setDecision(saved.decision as DecisionValue);
          if (saved.rejectionComment) setComment(saved.rejectionComment);
        }
      } catch {
        // no parseable result
      }
    }

    setChecks(initial);
  }, [step, checkItems]);

  const { countries } = useSettingsContext();
  const relatedFiles = section.fileType ? files.filter((f) => f.type === section.fileType) : [];
  const comparisonRows = step.result ? buildComparisonRows(section.stepName, step.result, userData, countries) : [];

  function handleSave(): void {
    if (!decision || !clerk) return;
    const status = decision === 'Akzeptiert' ? 'Completed' : 'Failed';
    const comment_ = decision === 'Abgelehnt' && comment ? comment : undefined;

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
    if (comment_) checksData.rejectionComment = comment_;

    existingResult.complianceReview = checksData;
    const result = JSON.stringify(existingResult);

    onSave(step.id, status, clerk, section.stepName, comment_, result);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-dfxBlue-800">{section.label}</span>
        {statusBadge(step.status)}
        <span className="text-xs text-dfxGray-700">Eingangsdatum: {formatDateTime(step.created)}</span>
      </div>

      {/* Comparison table */}
      {comparisonRows.length > 0 && (
        <div>
          <h3 className="text-dfxGray-700 mb-2 font-semibold text-sm">Datenvergleich</h3>
          <div className="bg-white rounded-lg shadow-sm p-3 overflow-auto">
            <ComparisonTable rows={comparisonRows} />
          </div>
        </div>
      )}

      {/* Files */}
      {relatedFiles.length > 0 && (
        <div>
          <h3 className="text-dfxGray-700 mb-2 font-semibold text-sm">Dokumente</h3>
          <div className="bg-white rounded-lg shadow-sm">
            {relatedFiles.map((file) => (
              <button
                key={file.uid}
                className="w-full px-3 py-2 text-left text-sm text-dfxBlue-300 hover:bg-dfxGray-300 transition-colors flex items-center gap-2 border-b border-dfxGray-300 last:border-0"
                onClick={() => onOpenFile(file)}
              >
                <span className="underline">{file.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Document checks */}
      {checkItems.length > 0 && (
        <div>
          <h3 className="text-dfxGray-700 mb-2 font-semibold text-sm">Checks</h3>
          <div className="bg-white rounded-lg shadow-sm">
            {checkItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300 last:border-0"
              >
                <span className="text-sm text-dfxBlue-800">{item.label}</span>
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
            ))}
          </div>
        </div>
      )}

      {step.status === 'ManualReview' ? (
        <>
          {/* Decision */}
          <div className="bg-white rounded-lg shadow-sm px-3 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-dfxBlue-800 font-medium">Entscheid:</span>
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
                <option value="">---</option>
                <option value="Akzeptiert">Akzeptiert</option>
                <option value="Abgelehnt">Abgelehnt</option>
              </select>
            </div>
          </div>

          {/* Comment */}
          {decision === 'Abgelehnt' && (
            <div>
              <h3 className="text-dfxGray-700 mb-2 font-semibold text-sm">Kommentar:</h3>
              <input
                type="text"
                className="w-full px-2 py-1 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800"
                placeholder="Ablehnungsgrund..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          )}

          {/* Clerk */}
          <div className="bg-white rounded-lg shadow-sm px-3 py-3">
            <div className="flex items-center justify-between">
              <StaffIdentityBlock label="Editor:" />
            </div>
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

export function StammdatenPanel({ data, onOpenFile, onSave, isSaving }: StammdatenPanelProps): JSX.Element {
  const accountType = String(data.userData.accountType ?? '');

  const activeSections = changeSections
    .map((section) => ({
      section,
      step: findLatestStep(data.kycSteps, section.stepName),
    }))
    .filter((entry): entry is { section: ChangeSection; step: KycStepInfo } => entry.step !== undefined);

  if (activeSections.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 text-center text-dfxGray-700">
        Keine Stammdatenänderungen vorhanden.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {activeSections.map(({ section, step }) => (
        <div key={section.stepName} className="border-b border-dfxGray-300 pb-6 last:border-0">
          <ChangeSectionPanel
            section={section}
            step={step}
            files={data.kycFiles ?? []}
            userData={data.userData}
            checkItems={getCheckItems(section.stepName, accountType)}
            onOpenFile={onOpenFile}
            onSave={onSave}
            isSaving={isSaving}
          />
        </div>
      ))}
    </div>
  );
}
