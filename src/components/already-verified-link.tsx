import { useUserContext } from '@dfx.swiss/react';
import { StyledLink } from '@dfx.swiss/react-components';
import { useSettingsContext } from '../contexts/settings.context';
import { useNavigation } from '../hooks/navigation.hook';

export function AlreadyVerifiedLink(): JSX.Element {
  const { translate } = useSettingsContext();
  const { navigate } = useNavigation();
  const { user } = useUserContext();

  return user?.kyc.level === 0 ? (
    <StyledLink
      label={translate('screens/kyc', 'I am already verified with DFX')}
      onClick={() => navigate('/link', { setRedirect: true })}
      dark
    />
  ) : (
    <></>
  );
}
