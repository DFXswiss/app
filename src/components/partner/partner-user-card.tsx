import { PartnerUserInfo } from 'src/dto/partner.dto';

interface PartnerUserCardProps {
  user: PartnerUserInfo;
}

export function PartnerUserCard({ user }: PartnerUserCardProps): JSX.Element {
  const fullName = [user.firstname, user.surname].filter(Boolean).join(' ') || '—';

  return (
    <div className="bg-white rounded-lg shadow p-4 text-sm space-y-1" style={{ color: '#111827' }}>
      <div className="flex justify-between">
        <span className="text-dfxGray-700">UserData ID</span>
        <span className="font-mono">{user.id}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-dfxGray-700">Name</span>
        <span>{fullName}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-dfxGray-700">Email</span>
        <span>{user.mail || '—'}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-dfxGray-700">Status</span>
        <span>{user.status}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-dfxGray-700">usedRef</span>
        <span className="font-mono">{user.usedRef}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-dfxGray-700">Current fees</span>
        <span className="font-mono">{user.feeIds.length ? user.feeIds.join(', ') : '—'}</span>
      </div>
    </div>
  );
}
