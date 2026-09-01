import { SpinnerSize, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ErrorHint } from 'src/components/error-hint';
import { InfoPanel, InfoRow, SupportMessageList } from 'src/components/support/info-panel';
import { useSettingsContext } from 'src/contexts/settings.context';
import { RealUnitCheckEvidenceDto, RealUnitCustomerDetailDto } from 'src/dto/realunit-compliance.dto';
import { useRealunitGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useRealunitCompliance } from 'src/hooks/realunit-compliance.hook';
import { formatDate, statusBadge } from 'src/util/compliance-helpers';

function bool(value?: boolean): string {
  return value == null ? '-' : value ? 'Yes' : 'No';
}

// Generic read-only table for the reduced dossier's customer-scoped slices.
function CollectionTable<T>({
  title,
  rows,
  columns,
  emptyText,
}: {
  title: string;
  rows: T[];
  columns: { header: string; render: (row: T) => React.ReactNode }[];
  emptyText: string;
}): JSX.Element {
  return (
    <div>
      <h2 className="text-dfxGray-700 mb-2">
        {title} ({rows.length})
      </h2>
      <div className="bg-white rounded-lg shadow-sm max-h-[40vh] overflow-auto scroll-shadow">
        {rows.length === 0 ? (
          <div className="p-4 text-dfxGray-700 text-sm">{emptyText}</div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-dfxGray-300">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.header}
                    className="px-2 py-1.5 text-left text-xs font-semibold text-dfxBlue-800 whitespace-nowrap"
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-dfxGray-300">
                  {columns.map((c) => (
                    <td key={c.header} className="px-2 py-1.5 text-xs text-dfxBlue-800 text-left align-top">
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function RealunitComplianceUserScreen(): JSX.Element {
  useRealunitGuard();

  const { id } = useParams();
  const { translate } = useSettingsContext();
  const { getCustomer, downloadFile, downloadDossier } = useRealunitCompliance();

  const [customer, setCustomer] = useState<RealUnitCustomerDetailDto>();
  const [isLoading, setIsLoading] = useState(true);
  const [isDossierLoading, setIsDossierLoading] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();

  useLayoutOptions({
    title: translate('screens/compliance', 'RealUnit Customer'),
    backButton: true,
    noMaxWidth: true,
    textStart: true,
  });

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    getCustomer(+id)
      .then(setCustomer)
      .catch((e: Error) => setLoadError(e.message ?? 'Unknown error'))
      .finally(() => setIsLoading(false));
  }, [id, getCustomer]);

  const handleDownload = useCallback(
    async (fileUid: string, fileName: string): Promise<void> => {
      if (!id) return;
      setActionError(undefined);
      try {
        const res = await downloadFile(+id, fileUid);
        if (res.content?.type !== 'Buffer' || !Array.isArray(res.content.data)) {
          setActionError('Invalid file type');
          return;
        }
        const blob = new Blob([new Uint8Array(res.content.data)], { type: res.contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.name || fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e: unknown) {
        setActionError(e instanceof Error ? e.message : 'Error downloading file');
      }
    },
    [id, downloadFile],
  );

  const handleDossierDownload = useCallback(async (): Promise<void> => {
    if (!id) return;
    setActionError(undefined);
    setIsDossierLoading(true);
    try {
      await downloadDossier(+id);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Error downloading dossier');
    } finally {
      setIsDossierLoading(false);
    }
  }, [id, downloadDossier]);

  if (loadError) return <ErrorHint message={loadError} />;
  if (isLoading || !customer) return <StyledLoadingSpinner size={SpinnerSize.LG} />;

  const org = customer.organization;

  // Renders one api-resolved check evidence 1:1 (api = decision authority; which step/file counts is decided
  // there). Both rows must always be visible — a missing check is a compliance finding, not an empty state.
  const checkValue = (check?: RealUnitCheckEvidenceDto) => {
    if (!check)
      return (
        <span className="px-2 py-1 rounded text-xs bg-dfxGray-300 text-primary-red font-semibold">
          {translate('screens/compliance', 'Missing')}
        </span>
      );

    // capture as locals so the download closure keeps the narrowing without a non-null assertion
    const { fileUid, fileName } = check;
    return (
      <span className="inline-flex items-center gap-2">
        {check.status && statusBadge(check.status)}
        {check.type && <span className="text-dfxGray-700">{check.type}</span>}
        {formatDate(check.date)}
        {fileUid && fileName && (
          <button
            className="px-2 py-1 text-xs font-medium bg-white border border-dfxGray-400 text-dfxBlue-800 rounded hover:bg-dfxGray-300 transition-colors"
            onClick={() => handleDownload(fileUid, fileName)}
          >
            {translate('general/actions', 'Download')}
          </button>
        )}
      </span>
    );
  };

  return (
    <div className="w-full max-w-screen-xl mx-auto flex flex-col gap-6 p-4 md:p-6 text-left">
      {actionError && <ErrorHint message={actionError} />}

      {/* Full dossier export (ZIP of all visible files; audit-logged api-side) */}
      <div className="flex justify-end">
        <button
          className="px-3 py-1.5 text-sm font-medium bg-white border border-dfxGray-400 text-dfxBlue-800 rounded hover:bg-dfxGray-300 transition-colors disabled:opacity-50"
          onClick={handleDossierDownload}
          disabled={isDossierLoading}
        >
          {isDossierLoading
            ? translate('screens/compliance', 'Preparing ZIP ...')
            : translate('screens/compliance', 'Download dossier (ZIP)')}
        </button>
      </div>

      {/* Identity / KYC status */}
      <div className="flex gap-4 flex-wrap">
        <InfoPanel title={translate('screens/compliance', 'Identity')}>
          <InfoRow label="ID" value={String(customer.id)} mono />
          <InfoRow label="Created" value={formatDate(customer.created)} />
          <InfoRow label="Account Type" value={customer.accountType ?? '-'} />
          <InfoRow label="Email" value={customer.mail ?? '-'} />
          <InfoRow label="First Name" value={customer.firstname ?? '-'} />
          <InfoRow label="Surname" value={customer.surname ?? '-'} />
          <InfoRow label="Verified Name" value={customer.verifiedName ?? '-'} />
          <InfoRow
            label="Address"
            value={[customer.street, customer.houseNumber].filter(Boolean).join(' ') || '-'}
          />
          <InfoRow label="ZIP / City" value={[customer.zip, customer.location].filter(Boolean).join(' ') || '-'} />
          <InfoRow label="Country" value={customer.country?.name ?? '-'} />
          <InfoRow label="Nationality" value={customer.nationality?.name ?? '-'} />
          <InfoRow label="Language" value={customer.language?.name ?? '-'} />
          <InfoRow label="Birthday" value={customer.birthday ? formatDate(customer.birthday) : '-'} />
          <InfoRow label="Phone" value={customer.phone ?? '-'} />
        </InfoPanel>

        <InfoPanel title={translate('screens/compliance', 'KYC / Status')}>
          <InfoRow label="KYC Status" value={statusBadge(customer.kycStatus)} />
          <InfoRow label="KYC Level" value={customer.kycLevel ?? '-'} />
          <InfoRow label="KYC Type" value={customer.kycType ?? '-'} />
          <InfoRow label="High Risk" value={bool(customer.highRisk)} />
          <InfoRow label="PEP" value={bool(customer.pep)} />
          <InfoRow
            label={translate('screens/compliance', 'Balance (REALU)')}
            value={customer.balance != null ? customer.balance.toLocaleString('de-CH') : '-'}
          />
        </InfoPanel>

        <InfoPanel title={translate('screens/compliance', 'Checks')}>
          <InfoRow
            label={translate('screens/compliance', 'Ident Check (Sumsub)')}
            value={checkValue(customer.checks?.identCheck)}
          />
          <InfoRow
            label={translate('screens/compliance', 'Dilisense Check')}
            value={checkValue(customer.checks?.nameCheck)}
          />
        </InfoPanel>

        {org && (
          <InfoPanel title={translate('screens/compliance', 'Organization')}>
            <InfoRow label="Name" value={org.name ?? '-'} />
            <InfoRow label="Address" value={[org.street, org.houseNumber].filter(Boolean).join(' ') || '-'} />
            <InfoRow label="ZIP / City" value={[org.zip, org.location].filter(Boolean).join(' ') || '-'} />
            <InfoRow label="Country" value={org.country?.name ?? '-'} />
            <InfoRow label="Legal Entity" value={org.legalEntity ?? '-'} />
            <InfoRow label="Signatory Power" value={org.signatoryPower ?? '-'} />
            <InfoRow label="Complex Org Structure" value={bool(org.complexOrgStructure)} />
            <InfoRow label="Beneficial Owners" value={org.allBeneficialOwnersName ?? '-'} />
            <InfoRow label="Owners Domicile" value={org.allBeneficialOwnersDomicile ?? '-'} />
            <InfoRow label="Account Opener Authorization" value={org.accountOpenerAuthorization ?? '-'} />
          </InfoPanel>
        )}
      </div>

      {/* KYC Files */}
      <CollectionTable
        title={translate('screens/compliance', 'KYC Files')}
        rows={customer.kycFiles}
        emptyText={translate('screens/compliance', 'No files')}
        columns={[
          { header: translate('screens/kyc', 'Name'), render: (f) => f.name },
          { header: translate('screens/compliance', 'Type'), render: (f) => f.type },
          {
            header: translate('screens/compliance', 'Created'),
            render: (f) => (f.created ? formatDate(f.created) : '-'),
          },
          {
            header: '',
            render: (f) => (
              <button
                className="px-2 py-1 text-xs font-medium bg-white border border-dfxGray-400 text-dfxBlue-800 rounded hover:bg-dfxGray-300 transition-colors"
                onClick={() => handleDownload(f.uid, f.name)}
              >
                {translate('general/actions', 'Download')}
              </button>
            ),
          },
        ]}
      />

      {/* KYC Steps */}
      <CollectionTable
        title={translate('screens/compliance', 'KYC Steps')}
        rows={customer.kycSteps}
        emptyText={translate('screens/compliance', 'No steps')}
        columns={[
          { header: translate('screens/kyc', 'Name'), render: (s) => s.name },
          { header: translate('screens/compliance', 'Type'), render: (s) => s.type ?? '-' },
          { header: translate('screens/compliance', 'Status'), render: (s) => statusBadge(s.status) },
          { header: translate('screens/compliance', 'Seq'), render: (s) => s.sequenceNumber },
          { header: translate('screens/compliance', 'Created'), render: (s) => formatDate(s.created) },
        ]}
      />

      {/* Transactions */}
      <CollectionTable
        title={translate('screens/compliance', 'Transactions')}
        rows={customer.transactions}
        emptyText={translate('screens/compliance', 'No transactions')}
        columns={[
          { header: translate('screens/compliance', 'ID'), render: (t) => t.id },
          { header: translate('screens/compliance', 'Type'), render: (t) => t.type ?? '-' },
          { header: translate('screens/compliance', 'Source'), render: (t) => t.sourceType },
          {
            header: translate('screens/compliance', 'Input'),
            render: (t) => (t.inputAmount != null ? `${t.inputAmount} ${t.inputAsset ?? ''}` : '-'),
          },
          {
            header: translate('screens/compliance', 'Output'),
            render: (t) => (t.outputAmount != null ? `${t.outputAmount} ${t.outputAsset ?? ''}` : '-'),
          },
          { header: translate('screens/compliance', 'CHF'), render: (t) => t.amountInChf?.toLocaleString() ?? '-' },
          { header: translate('screens/compliance', 'Complete'), render: (t) => bool(t.isCompleted) },
          {
            header: translate('screens/compliance', 'Chargeback'),
            render: (t) => (t.chargebackDate ? formatDate(t.chargebackDate) : '-'),
          },
          { header: translate('screens/compliance', 'Created'), render: (t) => formatDate(t.created) },
        ]}
      />

      {/* Bank Data */}
      <CollectionTable
        title={translate('screens/compliance', 'Bank Data')}
        rows={customer.bankDatas}
        emptyText={translate('screens/compliance', 'No bank data')}
        columns={[
          {
            header: translate('screens/compliance', 'IBAN'),
            render: (b) => <span className="font-mono">{b.iban}</span>,
          },
          { header: translate('screens/kyc', 'Name'), render: (b) => b.name },
          { header: translate('screens/compliance', 'Type'), render: (b) => b.type ?? '-' },
          {
            header: translate('screens/compliance', 'Status'),
            render: (b) => (b.status ? statusBadge(b.status) : '-'),
          },
          { header: translate('screens/compliance', 'Approved'), render: (b) => bool(b.approved) },
          { header: translate('screens/compliance', 'Active'), render: (b) => bool(b.active) },
          { header: translate('screens/compliance', 'Created'), render: (b) => formatDate(b.created) },
        ]}
      />

      {/* Addresses (RealUnit-app wallet rows) */}
      <CollectionTable
        title={translate('screens/compliance', 'Addresses')}
        rows={customer.addresses ?? []}
        emptyText={translate('screens/compliance', 'No addresses')}
        columns={[
          { header: translate('screens/compliance', 'ID'), render: (a) => a.id },
          {
            header: translate('screens/compliance', 'Address'),
            render: (a) => <span className="font-mono break-all">{a.address}</span>,
          },
          { header: translate('screens/compliance', 'Status'), render: (a) => statusBadge(a.status) },
          { header: translate('screens/compliance', 'Created'), render: (a) => formatDate(a.created) },
        ]}
      />

      {/* Buy Routes */}
      <CollectionTable
        title={translate('screens/compliance', 'Buy Routes')}
        rows={customer.buyRoutes}
        emptyText={translate('screens/compliance', 'No buy routes')}
        columns={[
          { header: translate('screens/compliance', 'ID'), render: (r) => r.id },
          { header: translate('screens/compliance', 'Asset'), render: (r) => r.assetName },
          { header: translate('screens/compliance', 'Blockchain'), render: (r) => r.blockchain },
          {
            header: translate('screens/compliance', 'IBAN'),
            render: (r) => <span className="font-mono">{r.iban ?? '-'}</span>,
          },
          { header: translate('screens/compliance', 'Volume'), render: (r) => r.volume?.toLocaleString() ?? '-' },
          { header: translate('screens/compliance', 'Active'), render: (r) => bool(r.active) },
          { header: translate('screens/compliance', 'Created'), render: (r) => formatDate(r.created) },
        ]}
      />

      {/* Sell Routes */}
      <CollectionTable
        title={translate('screens/compliance', 'Sell Routes')}
        rows={customer.sellRoutes}
        emptyText={translate('screens/compliance', 'No sell routes')}
        columns={[
          { header: translate('screens/compliance', 'ID'), render: (r) => r.id },
          { header: translate('screens/compliance', 'Fiat'), render: (r) => r.fiatName ?? '-' },
          {
            header: translate('screens/compliance', 'IBAN'),
            render: (r) => <span className="font-mono">{r.iban}</span>,
          },
          {
            header: translate('screens/compliance', 'Deposit Address'),
            render: (r) => <span className="break-all">{r.depositAddress ?? '-'}</span>,
          },
          { header: translate('screens/compliance', 'Volume'), render: (r) => r.volume?.toLocaleString() ?? '-' },
          { header: translate('screens/compliance', 'Active'), render: (r) => bool(r.active) },
          { header: translate('screens/compliance', 'Created'), render: (r) => formatDate(r.created) },
        ]}
      />

      {/* Swap Routes */}
      <CollectionTable
        title={translate('screens/compliance', 'Swap Routes')}
        rows={customer.swapRoutes}
        emptyText={translate('screens/compliance', 'No swap routes')}
        columns={[
          { header: translate('screens/compliance', 'ID'), render: (r) => r.id },
          { header: translate('screens/compliance', 'Asset'), render: (r) => r.assetName ?? '-' },
          { header: translate('screens/compliance', 'Blockchain'), render: (r) => r.blockchain ?? '-' },
          {
            header: translate('screens/compliance', 'Deposit Address'),
            render: (r) => <span className="break-all">{r.depositAddress ?? '-'}</span>,
          },
          { header: translate('screens/compliance', 'Volume'), render: (r) => r.volume?.toLocaleString() ?? '-' },
          { header: translate('screens/compliance', 'Active'), render: (r) => bool(r.active) },
          { header: translate('screens/compliance', 'Created'), render: (r) => formatDate(r.created) },
        ]}
      />

      {/* Virtual IBANs */}
      <CollectionTable
        title={translate('screens/compliance', 'Virtual IBANs')}
        rows={customer.virtualIbans}
        emptyText={translate('screens/compliance', 'No virtual IBANs')}
        columns={[
          {
            header: translate('screens/compliance', 'IBAN'),
            render: (v) => <span className="font-mono">{v.iban}</span>,
          },
          { header: translate('screens/compliance', 'Currency'), render: (v) => v.currency ?? '-' },
          { header: translate('screens/compliance', 'Bank'), render: (v) => v.bank ?? '-' },
          {
            header: translate('screens/compliance', 'Status'),
            render: (v) => (v.status ? statusBadge(v.status) : '-'),
          },
          { header: translate('screens/compliance', 'Active'), render: (v) => bool(v.active) },
          { header: translate('screens/compliance', 'Label'), render: (v) => v.label ?? '-' },
          { header: translate('screens/compliance', 'Created'), render: (v) => formatDate(v.created) },
        ]}
      />

      {/* Support Issues (read-only, incl. message thread) */}
      <div>
        <h2 className="text-dfxGray-700 mb-2">
          {translate('screens/compliance', 'Support Issues')} ({customer.supportIssues.length})
        </h2>
        {customer.supportIssues.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-4 text-dfxGray-700 text-sm">
            {translate('screens/compliance', 'No support issues')}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {customer.supportIssues.map((issue) => (
              <div key={issue.id} className="bg-white rounded-lg shadow-sm p-4 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-dfxBlue-800">
                  <span className="font-semibold">{issue.type}</span>
                  <span>{issue.reason}</span>
                  {statusBadge(issue.state)}
                  {issue.clerk && <span>Clerk: {issue.clerk}</span>}
                  {issue.department && <span>Dept: {issue.department}</span>}
                  <span className="text-dfxGray-700">{formatDate(issue.created)}</span>
                </div>
                {issue.information && (
                  <div className="text-sm text-dfxBlue-800 whitespace-pre-wrap break-words">{issue.information}</div>
                )}
                {issue.messages.length > 0 && (
                  <div className="flex flex-col gap-2 max-h-[30vh] overflow-auto p-2 scroll-shadow">
                    <SupportMessageList messages={issue.messages} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
