import { KycStepInfo, UserDataDetail, UserInfo } from 'src/hooks/compliance.hook';
import { formatBirthday, formatDateTime } from 'src/util/compliance-helpers';

type CheckDateField =
  | 'phoneCallCheckDate'
  | 'phoneCallIpCheckDate'
  | 'phoneCallIpCountryCheckDate'
  | 'phoneCallExternalAccountCheckDate';

interface Props {
  userData: UserDataDetail;
  users?: UserInfo[];
  kycSteps?: KycStepInfo[];
  highlightCheckDateField?: CheckDateField;
  title: string;
}

type Row = {
  label: string;
  value?: string;
  highlight?: boolean;
};

function pickPrimaryUser(users: UserInfo[] | undefined): UserInfo | undefined {
  if (!users || users.length === 0) return undefined;
  const active = users.find((u) => u.status === 'Active');
  return active ?? users[0];
}

function pickRecommenderName(kycSteps: KycStepInfo[] | undefined): string | undefined {
  if (!kycSteps) return undefined;
  const step = kycSteps.find((s) => s.name === 'Recommendation' && s.recommender);
  if (!step?.recommender) return undefined;
  const { firstname, surname } = step.recommender;
  return [firstname, surname].filter(Boolean).join(' ') || undefined;
}

function renderRow({ label, value, highlight }: Row): JSX.Element {
  return (
    <div
      key={label}
      className={`flex justify-between gap-4 py-1 border-b border-dfxGray-300 last:border-none ${
        highlight ? 'bg-dfxBlue-100 -mx-1 px-1 rounded' : ''
      }`}
    >
      <span className={`text-sm ${highlight ? 'text-dfxBlue-800 font-semibold' : 'text-dfxGray-700'}`}>{label}</span>
      <span className="text-sm text-dfxBlue-800 font-medium text-right break-all">{value || '-'}</span>
    </div>
  );
}

export function CallQueueUserInfo({ userData, users, kycSteps, highlightCheckDateField, title }: Props): JSX.Element {
  const primaryUser = pickPrimaryUser(users);
  const recommenderName = pickRecommenderName(kycSteps);
  const recommendationStepResult = kycSteps?.find((s) => s.name === 'Recommendation')?.result;
  const refUserName = primaryUser?.refUserName ?? recommenderName;

  const fullName = [userData.firstname, userData.surname, userData.organization?.name].filter(Boolean).join(' ');

  const leftRows: Row[] = [
    { label: 'User ID', value: userData.id == null ? undefined : String(userData.id) },
    { label: 'Account Type', value: userData.accountType },
    { label: 'Name', value: fullName || undefined },
    { label: 'Verified Name', value: userData.verifiedName },
    { label: 'Mail', value: userData.mail },
    { label: 'Phone', value: userData.phone },
    { label: 'Birthday', value: userData.birthday ? formatBirthday(userData.birthday) : undefined },
    { label: 'Nationality', value: userData.nationality?.name },
    { label: 'Language', value: userData.language?.symbol ?? userData.language?.name },
    { label: 'Country', value: userData.country?.name ?? userData.country?.symbol },
  ];

  const rightRows: Row[] = [
    { label: 'Status', value: userData.status },
    { label: 'KYC Level', value: userData.kycLevel == null ? undefined : String(userData.kycLevel) },
    { label: 'KYC Status', value: userData.kycStatus },
    { label: 'Wallet', value: primaryUser?.walletName },
    { label: 'User Ref', value: primaryUser?.ref },
    { label: 'Used Ref', value: primaryUser?.usedRef },
    { label: 'Referrer (Ref Werber)', value: refUserName },
    { label: 'Recommendation Step Result', value: recommendationStepResult },
    { label: 'Phone Call Status', value: userData.phoneCallStatus },
    {
      label: 'Phone Call Accepted',
      value: userData.phoneCallAccepted == null ? undefined : String(userData.phoneCallAccepted),
    },
    { label: 'Phone Call Times', value: userData.phoneCallTimes },
  ];

  const checkDateRows: [CheckDateField, string][] = [
    ['phoneCallCheckDate', 'Phone Call Check Date'],
    ['phoneCallIpCheckDate', 'Phone Call IP Check Date'],
    ['phoneCallIpCountryCheckDate', 'Phone Call IP Country Check Date'],
    ['phoneCallExternalAccountCheckDate', 'Phone Call External Account Check Date'],
  ];

  for (const [field, label] of checkDateRows) {
    const value = userData[field];
    const isHighlight = field === highlightCheckDateField;
    if (!isHighlight && !value) continue;
    rightRows.push({
      label,
      value: value ? formatDateTime(value) : '-',
      highlight: isHighlight,
    });
  }

  return (
    <div className="w-full bg-white rounded-lg shadow-sm p-4">
      <h3 className="text-base font-semibold text-dfxBlue-800 mb-3">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
        <div className="flex flex-col gap-y-1">{leftRows.map(renderRow)}</div>
        <div className="flex flex-col gap-y-1">{rightRows.map(renderRow)}</div>
      </div>
    </div>
  );
}
