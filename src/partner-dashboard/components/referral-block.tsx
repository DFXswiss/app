import { PartnerReferral } from 'src/dto/partner-statistic.dto';
import { formatAmount } from 'src/partner-dashboard/util/format';
import { usePartnerTranslation } from 'src/partner-dashboard/util/i18n';

export interface ReferralBlockProps {
  referral: PartnerReferral;
}

/** Referral block — values are EUR while the rest of the dashboard is CHF. */
export function ReferralBlock({ referral }: ReferralBlockProps): JSX.Element {
  const { translate, locale } = usePartnerTranslation();
  const currency = referral.currency;
  const items: Array<{ key: string; label: string; value: number }> = [
    { key: 'volume', label: translate('Referral volume'), value: referral.volume },
    { key: 'credit-earned', label: translate('Credit earned'), value: referral.creditEarned },
    { key: 'credit-paid', label: translate('Credit paid out'), value: referral.creditPaid },
    { key: 'credit-open', label: translate('Credit open'), value: referral.creditOpen },
  ];

  return (
    <section className="partner-card" data-testid="referral-block">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          {translate('Referral')}
        </h2>
        <span className="text-2xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded partner-muted-fill partner-text-secondary">
          {currency}
        </span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((item) => (
          <div key={item.key} className="min-w-0">
            <div className="text-xs partner-text-tertiary">{item.label}</div>
            <div
              className="text-base font-bold mt-0.5 tabular-nums"
              style={{ color: 'var(--text)' }}
              data-testid={`referral-${item.key}`}
            >
              {formatAmount(item.value, currency, 2, locale)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
