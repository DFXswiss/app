import { SupportIssueType } from '@dfx.swiss/react';
import { StyledInfoText, StyledLink } from '@dfx.swiss/react-components';
import { Trans } from 'react-i18next';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useNavigation } from 'src/hooks/navigation.hook';
import { BankAccountFailureKind } from './bank-account-create-failure';

export function BankAccountCreateHint({ kind }: { kind: Exclude<BankAccountFailureKind, 'other'> }): JSX.Element {
  const { translate } = useSettingsContext();
  const { navigate } = useNavigation();

  if (kind === 'kyc-only') {
    return (
      <StyledInfoText invertedIcon>
        <Trans i18nKey="general/errors.ibanKycOnly">
          {`A bank account can only be added once a wallet is linked to this account. `}
          <StyledLink
            label={translate('screens/home', 'Connect your wallet')}
            onClick={() => navigate('/connect', { setRedirect: true })}
            dark
          />
        </Trans>
      </StyledInfoText>
    );
  }

  return (
    <StyledInfoText invertedIcon>
      <Trans i18nKey="general/errors.iban">
        {`This is a multi-account IBAN and cannot be added as a personal account. Please open a support ticket at `}
        <StyledLink
          label={new URL('support', process.env.REACT_APP_PUBLIC_URL).href}
          onClick={() => navigate(`/support/issue?issue-type=${SupportIssueType.GENERIC_ISSUE}`)}
          dark
        />
        {` and attach the bank transaction confirmation as a PDF.`}
      </Trans>
    </StyledInfoText>
  );
}
