import { ReactNode, useState } from 'react';
import { CollapsibleSection } from 'src/components/compliance/collapsible-section';
import { LimitRequestModal } from 'src/components/compliance/limit-request-modal';
import { useClipboard } from 'src/hooks/clipboard.hook';
import { OrganizationDetail, UserDataDetail } from 'src/hooks/compliance.hook';
import { display, formatBirthday, formatDate, formatDateTime, Primitive, refName } from 'src/util/compliance-helpers';

interface UserDataPanelProps {
  userData: UserDataDetail;
  userDataId?: number;
  canRequestLimit?: boolean;
  canCopyKycLinks?: boolean;
  wide?: boolean;
  onLimitRequestCreated?: () => void;
  onCreateNote?: () => void;
}

function kycServicesBaseUrl(): string {
  return process.env.REACT_APP_PUBLIC_URL ?? window.location.origin;
}

function KycLinkButtons({ kycHash }: Readonly<{ kycHash: string }>): JSX.Element {
  const kycLink = useClipboard();
  const videoLink = useClipboard();
  const base = kycServicesBaseUrl();
  const buttonClass =
    'px-2 py-0.5 text-xs font-medium bg-dfxBlue-800 text-white rounded hover:bg-dfxBlue-800/80 transition-colors whitespace-nowrap';
  return (
    <div className="flex gap-2">
      <button
        type="button"
        className={buttonClass}
        onClick={() => kycLink.copy(`${base}/kyc?code=${kycHash}`)}
        title="Copy KYC link"
      >
        {kycLink.isCopying ? '✓ KYC' : 'KYC'}
      </button>
      <button
        type="button"
        className={buttonClass}
        onClick={() => videoLink.copy(`${base}/kyc?code=${kycHash}&step=ident/video`)}
        title="Copy Video Ident link"
      >
        {videoLink.isCopying ? '✓ Video' : 'Video'}
      </button>
    </div>
  );
}

interface Row {
  key: string;
  value: ReactNode;
}

function fmtDate(value: string | undefined): string {
  return value ? formatDate(value) : '-';
}

function fmtDateTime(value: string | undefined): string {
  return value ? formatDateTime(value) : '-';
}

function combinedRow(key: string, secondary: string, primaryVal: Primitive, secondaryVal: Primitive): Row {
  const combined = [primaryVal, secondaryVal].filter(Boolean).join(' ');
  return { key: `${key} / ${secondary}`, value: combined || '-' };
}

function SectionTable({
  rows,
  kycHash,
  canCopyKycLinks,
}: Readonly<{ rows: Row[]; kycHash?: string; canCopyKycLinks?: boolean }>): JSX.Element {
  return (
    <table className="w-full border-collapse">
      <tbody>
        {rows.map((row, idx) => (
          <tr key={`${row.key}-${idx}`} className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300">
            <td className="px-3 py-2 text-left text-sm text-dfxBlue-800 font-medium align-top w-1/2">{row.key}</td>
            <td className="px-3 py-2 text-left text-sm text-dfxBlue-800 break-all">
              {row.key === 'kycHash' && kycHash ? (
                <div className="flex flex-col gap-2 items-start">
                  <a
                    href={`/kyc?code=${kycHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-dfxBlue-300 underline hover:text-dfxBlue-800"
                  >
                    {kycHash}
                  </a>
                  {canCopyKycLinks && <KycLinkButtons kycHash={kycHash} />}
                </div>
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

function userDataRows(d: UserDataDetail, depositLimitNode: ReactNode, idNode: ReactNode): Row[] {
  return [
    { key: 'id', value: idNode },
    { key: 'created', value: fmtDateTime(d.created) },
    { key: 'status', value: display(d.status) },
    { key: 'riskStatus', value: display(d.riskStatus) },
    { key: 'kycStatus', value: display(d.kycStatus) },
    { key: 'kycLevel', value: display(d.kycLevel) },
    { key: 'depositLimit', value: depositLimitNode },
  ];
}

function personalDataRows(d: UserDataDetail): Row[] {
  return [
    { key: 'accountType', value: display(d.accountType) },
    { key: 'mail', value: display(d.mail) },
    { key: 'verifiedName', value: display(d.verifiedName) },
    { key: 'verifiedCountry', value: refName(d.verifiedCountry) },
    combinedRow('firstname', 'surname', d.firstname, d.surname),
    combinedRow('street', 'houseNumber', d.street, d.houseNumber),
    combinedRow('zip', 'location', d.zip, d.location),
    { key: 'country', value: refName(d.country) },
    { key: 'nationality', value: refName(d.nationality) },
    { key: 'language', value: refName(d.language) },
    { key: 'birthday', value: d.birthday ? formatBirthday(d.birthday) : '-' },
    { key: 'phone', value: display(d.phone) },
  ];
}

function organizationRows(o: OrganizationDetail): Row[] {
  return [
    { key: 'name', value: display(o.name) },
    combinedRow('street', 'houseNumber', o.street, o.houseNumber),
    combinedRow('zip', 'location', o.zip, o.location),
    { key: 'country', value: refName(o.country) },
    { key: 'legalEntity', value: display(o.legalEntity) },
    { key: 'signatoryPower', value: display(o.signatoryPower) },
    { key: 'complexOrgStructure', value: display(o.complexOrgStructure) },
    { key: 'allBeneficialOwnersName', value: display(o.allBeneficialOwnersName) },
    { key: 'allBeneficialOwnersDomicile', value: display(o.allBeneficialOwnersDomicile) },
    { key: 'accountOpenerAuthorization', value: display(o.accountOpenerAuthorization) },
  ];
}

function kycAmlRows(d: UserDataDetail): Row[] {
  return [
    { key: 'kycType', value: display(d.kycType) },
    { key: 'kycStatus', value: display(d.kycStatus) },
    { key: 'kycLevel', value: display(d.kycLevel) },
    { key: 'kycHash', value: display(d.kycHash) },
    { key: 'kycFileId', value: display(d.kycFileId) },
    { key: 'identDocumentId', value: display(d.identDocumentId) },
    { key: 'identDocumentType', value: display(d.identDocumentType) },
    { key: 'highRisk', value: display(d.highRisk) },
    { key: 'pep', value: display(d.pep) },
    { key: 'bankTransactionVerification', value: display(d.bankTransactionVerification) },
    { key: 'olkypayAllowed', value: display(d.olkypayAllowed) },
  ];
}

function paymentLinkRows(d: UserDataDetail): Row[] {
  return [
    { key: 'paymentLinksAllowed', value: display(d.paymentLinksAllowed) },
    { key: 'paymentLinksConfig', value: display(d.paymentLinksConfig) },
    { key: 'paymentLinksName', value: display(d.paymentLinksName) },
  ];
}

function phoneCallRows(d: UserDataDetail): Row[] {
  return [
    { key: 'phoneCallStatus', value: display(d.phoneCallStatus) },
    { key: 'phoneCallAccepted', value: display(d.phoneCallAccepted) },
    { key: 'phoneCallCheckDate', value: fmtDateTime(d.phoneCallCheckDate) },
    { key: 'phoneCallExternalAccountCheckDate', value: fmtDateTime(d.phoneCallExternalAccountCheckDate) },
    { key: 'phoneCallExternalAccountCheckValues', value: display(d.phoneCallExternalAccountCheckValues) },
    { key: 'phoneCallIpCheckDate', value: fmtDateTime(d.phoneCallIpCheckDate) },
    { key: 'phoneCallIpCountryCheckDate', value: fmtDateTime(d.phoneCallIpCountryCheckDate) },
    { key: 'phoneCallTimes', value: display(d.phoneCallTimes) },
  ];
}

function volumeRows(d: UserDataDetail): Row[] {
  return [
    { key: 'buyVolume', value: display(d.buyVolume) },
    { key: 'annualBuyVolume', value: display(d.annualBuyVolume) },
    { key: 'sellVolume', value: display(d.sellVolume) },
    { key: 'annualSellVolume', value: display(d.annualSellVolume) },
    { key: 'cryptoVolume', value: display(d.cryptoVolume) },
    { key: 'annualCryptoVolume', value: display(d.annualCryptoVolume) },
  ];
}

function otherRows(d: UserDataDetail): Row[] {
  return [
    { key: 'isTrustedReferrer', value: display(d.isTrustedReferrer) },
    { key: 'tradeApprovalDate', value: fmtDate(d.tradeApprovalDate) },
    { key: 'deactivationDate', value: fmtDate(d.deactivationDate) },
    { key: 'lastNameCheckDate', value: fmtDate(d.lastNameCheckDate) },
    { key: 'letterSentDate', value: fmtDate(d.letterSentDate) },
    { key: 'moderator', value: display(d.moderator) },
  ];
}

export function UserDataPanel({
  userData,
  userDataId,
  canRequestLimit = true,
  canCopyKycLinks = false,
  wide = false,
  onLimitRequestCreated,
  onCreateNote,
}: Readonly<UserDataPanelProps>): JSX.Element {
  const [showLimitRequestModal, setShowLimitRequestModal] = useState(false);

  const depositLimitNode: ReactNode =
    userDataId && canRequestLimit ? (
      <div className="flex items-center justify-between gap-2">
        <span>{display(userData.depositLimit)}</span>
        <button
          className="px-3 py-1 text-xs text-white bg-dfxBlue-800 hover:bg-dfxBlue-800/80 rounded transition-colors whitespace-nowrap"
          onClick={() => setShowLimitRequestModal(true)}
        >
          Limit Request
        </button>
      </div>
    ) : (
      display(userData.depositLimit)
    );

  const idNode: ReactNode = onCreateNote ? (
    <div className="flex items-center justify-between gap-2">
      <span>{display(userData.id)}</span>
      <button
        className="px-3 py-1 text-xs text-white bg-dfxBlue-800 hover:bg-dfxBlue-800/80 rounded transition-colors whitespace-nowrap"
        onClick={onCreateNote}
      >
        Notiz erstellen
      </button>
    </div>
  ) : (
    display(userData.id)
  );

  return (
    <>
      <div className={`${wide ? 'w-full' : 'w-1/2'} min-w-0`}>
        <div className="bg-white rounded-lg shadow-sm divide-y divide-dfxGray-300">
          <CollapsibleSection title="UserData" initiallyOpen>
            <SectionTable rows={userDataRows(userData, depositLimitNode, idNode)} />
          </CollapsibleSection>

          <CollapsibleSection title="Personal Data" initiallyOpen>
            <SectionTable rows={personalDataRows(userData)} />
          </CollapsibleSection>

          <CollapsibleSection title="Organization Data" initiallyOpen={!!userData.organization}>
            {userData.organization ? (
              <SectionTable rows={organizationRows(userData.organization)} />
            ) : (
              <div className="px-3 py-2 text-sm text-dfxGray-700">No organization linked.</div>
            )}
          </CollapsibleSection>

          <CollapsibleSection title="KYC / AML">
            <SectionTable rows={kycAmlRows(userData)} kycHash={userData.kycHash} canCopyKycLinks={canCopyKycLinks} />
          </CollapsibleSection>

          <CollapsibleSection title="PaymentLink Data">
            <SectionTable rows={paymentLinkRows(userData)} />
          </CollapsibleSection>

          <CollapsibleSection title="PhoneCall">
            <SectionTable rows={phoneCallRows(userData)} />
          </CollapsibleSection>

          <CollapsibleSection title="Volumes">
            <SectionTable rows={volumeRows(userData)} />
          </CollapsibleSection>

          <CollapsibleSection title="Other">
            <SectionTable rows={otherRows(userData)} />
          </CollapsibleSection>
        </div>
      </div>
      {userDataId && canRequestLimit && (
        <LimitRequestModal
          isOpen={showLimitRequestModal}
          userDataId={userDataId}
          defaultName={[userData.firstname, userData.surname].filter(Boolean).join(' ') || undefined}
          onClose={() => setShowLimitRequestModal(false)}
          onCreated={onLimitRequestCreated}
        />
      )}
    </>
  );
}
