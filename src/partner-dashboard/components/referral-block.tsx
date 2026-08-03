import { PartnerReferral } from 'src/dto/partner-statistic.dto';
import { formatAmount } from 'src/partner-dashboard/util/format';
import { usePartnerTranslation } from 'src/partner-dashboard/util/i18n';

export interface ReferralBlockProps {
  referral: PartnerReferral;
}

/**
 * Referral block — values are EUR while the rest of the dashboard is CHF (unmissable badge,
 * repeated next to the hero figure since misreading the currency here is a real error).
 *
 * `creditOpen` (money still owed to the partner) is the hero — the number that matters.
 * `creditEarned` and `creditPaid` are shown as one split bar (paid share vs. open share)
 * instead of three equal-weight numbers, so the relationship reads at a glance.
 * `volume` is context, not a credit figure — visually separated below a divider.
 *
 * Colours are grayscale-neutral (`var(--text)` / `var(--surface-2)`) on purpose: paid vs.
 * open is not a good/bad state, so no status (green/red) or brand-accent colour is used.
 */
export function ReferralBlock({ referral }: ReferralBlockProps): JSX.Element {
  const { translate, locale } = usePartnerTranslation();
  const currency = referral.currency;

  // Share of `creditEarned` already paid out, as a fraction of the bar (not of `creditOpen`
  // directly — `creditOpen` also folds in the account's separate `refCredit`, so it does not
  // always equal `creditEarned - creditPaid` exactly). Segments always sum to the full bar.
  const earned = referral.creditEarned;
  const paidShare = earned > 0 ? Math.min(Math.max(referral.creditPaid / earned, 0), 1) : 0;
  const openShare = earned > 0 ? Math.max(1 - paidShare, 0) : 0;
  const paidPct = paidShare * 100;
  const openPct = openShare * 100;

  const openText = formatAmount(referral.creditOpen, currency, 2, locale);
  const paidText = formatAmount(referral.creditPaid, currency, 2, locale);
  const earnedText = formatAmount(referral.creditEarned, currency, 2, locale);
  const volumeText = formatAmount(referral.volume, currency, 2, locale);

  return (
    <section className="partner-card" data-testid="referral-block">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          {translate('Referral')}
        </h2>
        <span
          className="text-2xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded partner-muted-fill partner-text-secondary"
          data-testid="referral-currency-badge"
        >
          {currency}
        </span>
      </div>

      {/* Hero: credit open — the figure that matters to a partner */}
      <div className="mb-4">
        <div className="text-xs partner-text-tertiary">{translate('Credit open')}</div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span
            className="text-2xl sm:text-3xl font-bold tabular-nums"
            style={{ color: 'var(--text)' }}
            data-testid="referral-credit-open"
          >
            {openText}
          </span>
          {/* Currency repeated right at the hero number — the one figure most likely to be misread as CHF. */}
          <span className="text-xs font-semibold uppercase tracking-wide partner-text-tertiary">{currency}</span>
        </div>
      </div>

      {/* earned = paid + open, shown as one picture instead of three equal numbers */}
      <div className="mb-4" data-testid="referral-credit-split">
        <div className="flex justify-between text-2xs partner-text-tertiary mb-1">
          <span>{translate('Credit earned')}</span>
          <span className="tabular-nums" data-testid="referral-credit-earned">
            {earnedText}
          </span>
        </div>
        <div
          className="flex h-3 rounded overflow-hidden partner-track"
          role="img"
          aria-label={`${translate('Credit paid out')}: ${paidText}, ${translate('Credit open')}: ${openText}`}
        >
          {paidPct > 0 && (
            <div
              className="h-full"
              style={{ width: `${paidPct}%`, backgroundColor: 'var(--surface-2)' }}
              data-testid="referral-split-paid"
              data-fill-token="var(--surface-2)"
            />
          )}
          {openPct > 0 && (
            <div
              className="h-full"
              style={{ width: `${openPct}%`, backgroundColor: 'var(--text)' }}
              data-testid="referral-split-open"
              data-fill-token="var(--text)"
            />
          )}
        </div>
        <div className="flex justify-between text-2xs partner-text-tertiary mt-1.5">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-sm inline-block shrink-0"
              style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)' }}
              aria-hidden="true"
            />
            {translate('Credit paid out')}:{' '}
            <span className="tabular-nums partner-text-secondary" data-testid="referral-credit-paid">
              {paidText}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-sm inline-block shrink-0"
              style={{ backgroundColor: 'var(--text)' }}
              aria-hidden="true"
            />
            {translate('Credit open')}:{' '}
            <span className="tabular-nums" style={{ color: 'var(--text)' }}>
              {openText}
            </span>
          </span>
        </div>
      </div>

      {/* Context, not a credit figure — separated below a divider, not a fourth equal number */}
      <div
        className="pt-3 flex items-baseline justify-between gap-2"
        style={{ borderTop: '1px solid var(--border)' }}
        data-testid="referral-volume-row"
      >
        <span className="text-xs partner-text-tertiary">{translate('Referral volume')}</span>
        <span
          className="text-sm font-medium tabular-nums partner-text-secondary"
          data-testid="referral-volume"
        >
          {volumeText}
        </span>
      </div>
    </section>
  );
}
