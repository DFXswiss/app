import { RealunitPromoPanel } from 'src/components/realunit/promo-panel';
import { RealunitReferralRelations } from 'src/components/realunit/referral-relations';
import { useSettingsContext } from 'src/contexts/settings.context';
import { RealUnitCodeKind } from 'src/dto/realunit-referral.dto';
import { useRealunitGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';

export default function RealunitPromoScreen(): JSX.Element {
  useRealunitGuard();

  const { translate } = useSettingsContext();

  useLayoutOptions({
    title: translate('screens/referral', 'Promo codes'),
    backButton: true,
    noMaxWidth: true,
  });

  return (
    <div className="w-full flex flex-col gap-3 text-left">
      <RealunitPromoPanel translate={translate} />
      <h3 className="text-dfxGray-700 text-sm font-semibold mt-2">
        {translate('screens/referral', 'Redeemed promo codes')}
      </h3>
      <RealunitReferralRelations
        kind={RealUnitCodeKind.PROMO}
        title={translate('screens/referral', 'Redemptions')}
        withReview={false}
        translate={translate}
      />
    </div>
  );
}
