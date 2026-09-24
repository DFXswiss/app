import { SpinnerSize, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { useEffect, useRef } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { BuyVolumeChart } from 'src/components/realunit/buy-volume-chart';
import { HolderCountChart } from 'src/components/realunit/holder-count-chart';
import { PriceHistoryChart } from 'src/components/realunit/price-history-chart';
import { RegistrationFunnel } from 'src/components/realunit/registration-funnel';
import { useRealunitContext } from 'src/contexts/realunit.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useRealunitGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { Timeframe } from 'src/util/chart';

export default function RealunitInsightsScreen(): JSX.Element {
  useRealunitGuard();

  const { translate } = useSettingsContext();
  const {
    priceHistory,
    priceHistoryError,
    timeframe,
    fetchPriceHistory,
    buyVolume,
    buyVolumeLoading,
    buyVolumeError,
    holderCount,
    holderCountLoading,
    holderCountError,
    registrationStats,
    registrationLoading,
    registrationError,
    fetchBuyVolume,
    fetchHolderCount,
    fetchRegistrationStats,
    buyVolumeTimeframe,
    holderCountTimeframe,
  } = useRealunitContext();

  useLayoutOptions({ title: translate('screens/realunit', 'Insights'), backButton: true });

  const didBootstrapPriceHistory = useRef(false);
  useEffect(() => {
    if (didBootstrapPriceHistory.current) return;
    didBootstrapPriceHistory.current = true;
    if (!priceHistory.length) fetchPriceHistory();
  }, [fetchPriceHistory]);

  const didBootstrapStats = useRef(false);
  useEffect(() => {
    if (didBootstrapStats.current) return;
    didBootstrapStats.current = true;
    fetchBuyVolume(Timeframe.ALL);
    fetchHolderCount(Timeframe.ALL);
    fetchRegistrationStats(Timeframe.ALL);
  }, [fetchBuyVolume, fetchHolderCount, fetchRegistrationStats]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="bg-white rounded-lg shadow-sm p-4">
        <h2 className="text-base font-semibold text-dfxBlue-800 text-left mb-3">
          {translate('screens/realunit', 'Price History')}
        </h2>
        <PriceHistoryChart timeframe={timeframe} priceHistory={priceHistory} onTimeframeChange={fetchPriceHistory} />
        {priceHistoryError && <ErrorHint message={translate('screens/realunit', 'Failed to load price history.')} />}
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4">
        <h2 className="text-base font-semibold text-dfxBlue-800 text-left mb-3">
          {translate('screens/realunit', 'Buy Volume')}
        </h2>
        {buyVolumeLoading && !buyVolume.length ? (
          <StyledLoadingSpinner size={SpinnerSize.MD} />
        ) : (
          <BuyVolumeChart timeframe={buyVolumeTimeframe} series={buyVolume} onTimeframeChange={fetchBuyVolume} />
        )}
        {buyVolumeError && <ErrorHint message={translate('screens/realunit', 'Failed to load buy volume.')} />}
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4">
        <h2 className="text-base font-semibold text-dfxBlue-800 text-left mb-3">
          {translate('screens/realunit', 'Holders over time')}
        </h2>
        {holderCountLoading && !holderCount.length ? (
          <StyledLoadingSpinner size={SpinnerSize.MD} />
        ) : (
          <HolderCountChart
            timeframe={holderCountTimeframe}
            series={holderCount}
            onTimeframeChange={fetchHolderCount}
          />
        )}
        {holderCountError && <ErrorHint message={translate('screens/realunit', 'Failed to load holder count.')} />}
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4">
        <h2 className="text-base font-semibold text-dfxBlue-800 text-left mb-3">
          {translate('screens/realunit', 'Registration')}
        </h2>
        {registrationLoading && !registrationStats ? (
          <StyledLoadingSpinner size={SpinnerSize.MD} />
        ) : (
          registrationStats && <RegistrationFunnel stats={registrationStats} />
        )}
        {registrationError && <ErrorHint message={translate('screens/realunit', 'Failed to load registration stats.')} />}
      </div>
    </div>
  );
}
