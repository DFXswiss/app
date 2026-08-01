import { PartnerReferral } from 'src/dto/partner-statistic.dto';
import { formatAmount } from 'src/partner-dashboard/util/format';

export interface ReferralBlockProps {
  referral: PartnerReferral;
}

/** Referral block — values are EUR while the rest of the dashboard is CHF. */
export function ReferralBlock({ referral }: ReferralBlockProps): JSX.Element {
  const currency = referral.currency;
  const items: Array<{ label: string; value: number }> = [
    { label: 'Referral-Volumen', value: referral.volume },
    { label: 'Gutschrift verdient', value: referral.creditEarned },
    { label: 'Gutschrift ausgezahlt', value: referral.creditPaid },
    { label: 'Gutschrift offen', value: referral.creditOpen },
  ];

  return (
    <section className="bg-dfxBlue-700 rounded-lg shadow p-4" data-testid="referral-block">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-white">Referral</h2>
        <span className="text-2xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-dfxBlue-500 text-dfxGray-600">
          {currency}
        </span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((item) => (
          <div key={item.label} className="min-w-0">
            <div className="text-xs text-dfxGray-700">{item.label}</div>
            <div className="text-base font-bold text-white mt-0.5 tabular-nums" data-testid={`referral-${item.label}`}>
              {formatAmount(item.value, currency)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
