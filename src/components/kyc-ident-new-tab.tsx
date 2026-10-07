import { StyledButton, StyledButtonColor, StyledButtonWidth, StyledVerticalStack } from '@dfx.swiss/react-components';
import { useSettingsContext } from '../contexts/settings.context';
import { appOrigin } from '../util/app-origin';

export function kycIdentUrl(code: string): string {
  return `${appOrigin()}/kyc?${new URLSearchParams({ code })}`;
}

interface KycIdentNewTabProps {
  code: string;
  onBack: () => void;
}

export function KycIdentNewTab({ code, onBack }: KycIdentNewTabProps): JSX.Element {
  const { translate } = useSettingsContext();

  return (
    <StyledVerticalStack gap={6} full center>
      <p className="text-dfxBlue-800 font-semibold">
        {translate('screens/kyc', 'Identification continues in a new tab')}
      </p>
      <p className="text-dfxGray-700 text-sm">
        {translate(
          'screens/kyc',
          'The identification cannot be started inside this page. Open it in a new tab and come back here once you have finished.',
        )}
      </p>
      <StyledButton
        width={StyledButtonWidth.MIN}
        label={translate('screens/kyc', 'Open identification')}
        onClick={() => window.open(kycIdentUrl(code), '_blank', 'noopener,noreferrer')}
      />
      <StyledButton
        width={StyledButtonWidth.MIN}
        label={translate('general/actions', 'Continue')}
        color={StyledButtonColor.GRAY_OUTLINE}
        onClick={onBack}
      />
    </StyledVerticalStack>
  );
}
