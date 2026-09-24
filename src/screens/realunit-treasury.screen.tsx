import { useEffect, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { QrCopy } from 'src/components/payment/qr-code';
import { RealunitBuyLimitPanel } from 'src/components/realunit/buy-limit-panel';
import { CopyableAddress } from 'src/components/realunit/copyable-address';
import { PayoutsPanel } from 'src/components/realunit/payouts-panel';
import { RealunitPrizeWalletAlertPanel } from 'src/components/realunit/prize-wallet-alert-panel';
import { useSettingsContext } from 'src/contexts/settings.context';
import { RealUnitPrizeWallet } from 'src/dto/realunit-referral.dto';
import { useRealunitGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useRealunitReferral } from 'src/hooks/realunit-referral.hook';

export default function RealunitTreasuryScreen(): JSX.Element {
  useRealunitGuard();

  const { translate } = useSettingsContext();
  const { getPrizeWallet } = useRealunitReferral();
  const [prizeWallet, setPrizeWallet] = useState<RealUnitPrizeWallet>();
  const [prizeWalletError, setPrizeWalletError] = useState<string>();
  const [prizeWalletLoading, setPrizeWalletLoading] = useState(true);

  useLayoutOptions({ title: translate('screens/realunit', 'Treasury'), backButton: true });

  const didLoadPrizeWallet = useRef(false);
  useEffect(() => {
    if (didLoadPrizeWallet.current) return;
    didLoadPrizeWallet.current = true;
    setPrizeWalletLoading(true);
    getPrizeWallet()
      .then((wallet) => {
        setPrizeWallet(wallet);
        setPrizeWalletError(undefined);
      })
      .catch((e: Error) => {
        setPrizeWallet(undefined);
        setPrizeWalletError(e.message ?? 'Unknown error');
      })
      .finally(() => setPrizeWalletLoading(false));
  }, [getPrizeWallet]);

  return (
    <div className="flex flex-col gap-6">
      <RealunitBuyLimitPanel translate={translate} />
      <div>
        <h2 className="text-base font-semibold text-dfxBlue-800 mb-3">
          {translate('screens/referral', 'Bonus and Referral')}
        </h2>
        {prizeWalletLoading ? null : prizeWallet ? (
          <div className="flex flex-col xl:flex-row gap-4 items-start">
            <div className="bg-white rounded-lg shadow-sm p-4 flex flex-row gap-4 items-start shrink-0">
              <QrCopy data={prizeWallet.address} />
              <div className="flex flex-col gap-2 text-left text-sm text-dfxBlue-800">
                <div>
                  <div className="text-dfxGray-700 mb-1">{translate('screens/realunit', 'Address')}</div>
                  <CopyableAddress address={prizeWallet.address} displayLength={20} />
                </div>
                <div>
                  {translate('screens/referral', 'ETH')}:{' '}
                  {prizeWallet.eth.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                </div>
                <div>
                  {translate('screens/referral', 'REALU')}:{' '}
                  {prizeWallet.realu.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
            <RealunitPrizeWalletAlertPanel translate={translate} />
          </div>
        ) : prizeWalletError?.includes('not configured') ? (
          <p className="text-sm text-dfxGray-700">
            {translate('screens/referral', 'Prize wallet is not configured')}
          </p>
        ) : (
          <ErrorHint message={prizeWalletError ?? 'Unknown error'} />
        )}
      </div>
      <PayoutsPanel />
    </div>
  );
}
