import { SpinnerSize, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { useCallback, useEffect, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { PartnerUserInfo } from 'src/dto/partner.dto';
import { usePartnerGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { usePartner } from 'src/hooks/partner.hook';

export default function PartnerHistoryScreen(): JSX.Element {
  usePartnerGuard();

  const { navigate } = useNavigation();
  const { getMyReferees } = usePartner();

  const [referees, setReferees] = useState<PartnerUserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const onBack = useCallback(() => navigate('/partner'), [navigate]);
  useLayoutOptions({ title: 'My Referees', backButton: true, onBack });

  useEffect(() => {
    getMyReferees()
      .then(setReferees)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load referees'))
      .finally(() => setLoading(false));
  }, [getMyReferees]);

  if (loading) {
    return (
      <div className="p-4 flex justify-center">
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      </div>
    );
  }

  if (error) return <ErrorHint message={error} />;

  if (!referees.length) {
    return <p className="p-4 text-center text-dfxGray-700">No referees yet.</p>;
  }

  return (
    <div className="p-4 w-full" style={{ color: '#111827' }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dfxGray-300 text-left">
              <th className="py-2 pr-3">ID</th>
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Email</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Fees</th>
            </tr>
          </thead>
          <tbody>
            {referees.map((r) => (
              <tr key={r.id} className="border-b border-dfxGray-300">
                <td className="py-2 pr-3 font-mono">{r.id}</td>
                <td className="py-2 pr-3">{[r.firstname, r.surname].filter(Boolean).join(' ') || '—'}</td>
                <td className="py-2 pr-3">{r.mail || '—'}</td>
                <td className="py-2 pr-3">{r.status}</td>
                <td className="py-2 pr-3 font-mono">{r.feeIds.length ? r.feeIds.join(', ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
