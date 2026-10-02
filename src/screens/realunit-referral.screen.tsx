import { RealunitReferralRelations } from 'src/components/realunit/referral-relations';
import { useSettingsContext } from 'src/contexts/settings.context';
import { RealUnitCodeKind } from 'src/dto/realunit-referral.dto';
import { useRealunitGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';

export default function RealunitReferralScreen(): JSX.Element {
  useRealunitGuard();

  const { translate } = useSettingsContext();

  useLayoutOptions({
    title: translate('screens/referral', 'Referrals'),
    backButton: true,
    noMaxWidth: true,
  });

  return (
    <RealunitReferralRelations
      kind={RealUnitCodeKind.INVITE}
      title={translate('screens/referral', 'Redemptions')}
      withReview={true}
      translate={translate}
    />
  );
}
