import {
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonSize,
  StyledButtonWidth,
  StyledLoadingSpinner,
} from '@dfx.swiss/react-components';
import { useEffect, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { CopyableAddress } from 'src/components/realunit/copyable-address';
import { useSettingsContext } from 'src/contexts/settings.context';
import { RealUnitAdminPayout, RealUnitLegalBasis } from 'src/dto/realunit-referral.dto';
import { useRealunitReferral } from 'src/hooks/realunit-referral.hook';
import { downloadCsv, toSemicolonCsv } from 'src/util/semicolon-csv';
import { formatSwissDateTimeWithSeconds } from 'src/util/utils';

const CSV_HEADERS = [
  'Datum',
  'Rechtsgrund',
  'Status',
  'Kunde-ID',
  'Wallet',
  'Anzahl',
  'Frankenwert',
  'Tx-Hash',
  'Empfehler-ID',
  'Empfehler-Wallet',
  'Eingeladene-ID',
  'Eingeladene-Wallet',
  'Code',
  'Erstkauf-ID',
  'Erstkauf-Datum',
  'Erstkauf-Anzahl',
];

function legalBasisCsvLabel(basis: string): string {
  switch (basis) {
    case RealUnitLegalBasis.REFERRAL_PREMIUM:
      return 'Empfehlungsprämie';
    case RealUnitLegalBasis.PROMO_GRANT:
      return 'Promo-Zugabe';
    default:
      return basis;
  }
}

function payoutToCsvRow(payout: RealUnitAdminPayout): Array<string | number | undefined | null> {
  const buy = payout.qualifyingBuy;
  return [
    payout.created,
    legalBasisCsvLabel(payout.legalBasis),
    payout.status,
    payout.customerId,
    payout.customerWallet,
    payout.amount,
    payout.chfValue,
    payout.txHash,
    payout.referrerAccountId,
    payout.referrerWallet,
    payout.guestAccountId,
    payout.guestWallet,
    payout.code,
    buy?.id,
    buy?.created,
    buy?.amount,
  ];
}

export function PayoutsPanel(): JSX.Element {
  const { translate } = useSettingsContext();
  const { getAdminPayouts } = useRealunitReferral();
  const [payouts, setPayouts] = useState<RealUnitAdminPayout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();

  const didLoad = useRef(false);
  useEffect(() => {
    if (didLoad.current) return;
    didLoad.current = true;
    setIsLoading(true);
    getAdminPayouts()
      .then((rows) => {
        setPayouts(rows);
        setError(undefined);
      })
      .catch((e: Error) => {
        setPayouts([]);
        setError(e.message ?? 'Unknown error');
      })
      .finally(() => setIsLoading(false));
  }, [getAdminPayouts]);

  const legalBasisLabel = (basis: string): string => {
    switch (basis) {
      case RealUnitLegalBasis.REFERRAL_PREMIUM:
        return translate('screens/referral', 'Referral premium');
      case RealUnitLegalBasis.PROMO_GRANT:
        return translate('screens/referral', 'Promo grant');
      default:
        return basis;
    }
  };

  const qualifyingBuyLabel = (payout: RealUnitAdminPayout): string => {
    const buy = payout.qualifyingBuy;
    if (!buy) return '-';
    return `${buy.id} (${buy.amount.toLocaleString()})`;
  };

  const handleExport = () => {
    const csvBody = toSemicolonCsv(CSV_HEADERS, payouts.map(payoutToCsvRow));
    const filename = `realunit-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsv(filename, csvBody);
  };

  return (
    <div data-testid="payouts-panel">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-base font-semibold text-dfxBlue-800">{translate('screens/referral', 'Prize payouts')}</h2>
        <StyledButton
          label={translate('screens/referral', 'Export CSV')}
          onClick={handleExport}
          size={StyledButtonSize.SMALL}
          width={StyledButtonWidth.MIN}
          color={StyledButtonColor.STURDY_WHITE}
          deactivateMargin
          caps={false}
          disabled={isLoading || payouts.length === 0}
        />
      </div>

      {isLoading ? (
        <StyledLoadingSpinner size={SpinnerSize.MD} />
      ) : error ? (
        <ErrorHint message={error} />
      ) : payouts.length === 0 ? (
        <p className="text-sm text-dfxGray-700">{translate('screens/referral', 'No prize payouts found')}</p>
      ) : (
        <div className="w-full overflow-x-auto rounded-lg bg-white shadow-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-dfxGray-300">
                <th className="px-3 py-2 text-left text-xs font-semibold text-dfxBlue-800 whitespace-nowrap">
                  {translate('screens/referral', 'Date')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-dfxBlue-800 whitespace-nowrap">
                  {translate('screens/referral', 'Legal basis')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-dfxBlue-800 whitespace-nowrap">
                  {translate('screens/referral', 'Status')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-dfxBlue-800 whitespace-nowrap">
                  {translate('screens/referral', 'Customer ID')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-dfxBlue-800 whitespace-nowrap">
                  {translate('screens/referral', 'Wallet')}
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-dfxBlue-800 whitespace-nowrap">
                  {translate('screens/referral', 'Amount')}
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-dfxBlue-800 whitespace-nowrap">
                  {translate('screens/referral', 'CHF')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-dfxBlue-800 whitespace-nowrap">
                  {translate('screens/referral', 'Tx hash')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-dfxBlue-800 whitespace-nowrap">
                  {translate('screens/referral', 'Code')}
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-dfxBlue-800 whitespace-nowrap">
                  {translate('screens/referral', 'Qualifying buy')}
                </th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => (
                <tr key={payout.id} className="border-b border-dfxGray-300">
                  <td className="px-3 py-2 text-left text-sm text-dfxBlue-800 whitespace-nowrap">
                    {formatSwissDateTimeWithSeconds(payout.created)}
                  </td>
                  <td className="px-3 py-2 text-left text-sm text-dfxBlue-800 whitespace-nowrap">
                    {legalBasisLabel(payout.legalBasis)}
                  </td>
                  <td className="px-3 py-2 text-left text-sm text-dfxBlue-800 whitespace-nowrap">{payout.status}</td>
                  <td className="px-3 py-2 text-left text-sm text-dfxBlue-800 whitespace-nowrap tabular-nums">
                    {payout.customerId}
                  </td>
                  <td className="px-3 py-2 text-left text-sm text-dfxBlue-800 whitespace-nowrap">
                    <CopyableAddress address={payout.customerWallet} />
                  </td>
                  <td className="px-3 py-2 text-right text-sm text-dfxBlue-800 whitespace-nowrap tabular-nums">
                    {payout.amount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right text-sm text-dfxBlue-800 whitespace-nowrap tabular-nums">
                    {payout.chfValue.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-left text-sm text-dfxBlue-800 whitespace-nowrap">
                    {payout.txHash ? <CopyableAddress address={payout.txHash} displayLength={12} /> : '-'}
                  </td>
                  <td className="px-3 py-2 text-left text-sm text-dfxBlue-800 whitespace-nowrap">{payout.code ?? '-'}</td>
                  <td className="px-3 py-2 text-left text-sm text-dfxBlue-800 whitespace-nowrap">
                    {qualifyingBuyLabel(payout)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
