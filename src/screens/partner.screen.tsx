import { usePartnerGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';

export default function PartnerScreen(): JSX.Element {
  usePartnerGuard();
  useLayoutOptions({ title: 'Partner' });

  const { navigate } = useNavigation();

  return (
    <div className="space-y-4 p-4 w-full" style={{ color: '#111827' }}>
      <div
        className="bg-white rounded-lg shadow p-6 cursor-pointer hover:bg-gray-50"
        onClick={() => navigate('/partner/onboarding')}
      >
        <div className="text-lg font-semibold">Set Onboarding Fee</div>
        <div className="text-sm mt-1" style={{ color: '#6b7280' }}>
          Look up a referee by address, assign or remove their individual fee
        </div>
      </div>
      <div
        className="bg-white rounded-lg shadow p-6 cursor-pointer hover:bg-gray-50"
        onClick={() => navigate('/partner/history')}
      >
        <div className="text-lg font-semibold">My Referees</div>
        <div className="text-sm mt-1" style={{ color: '#6b7280' }}>
          List of all users currently linked to your referral code
        </div>
      </div>
    </div>
  );
}
