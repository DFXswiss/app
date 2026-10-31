import { StyledButton, StyledButtonColor, StyledButtonWidth, StyledVerticalStack } from '@dfx.swiss/react-components';
import { useSettingsContext } from '../../../contexts/settings.context';
import { ConnectProps } from '../connect-shared';

// The passkey login tile (MVP): a visible placeholder flow behind the ?feature=Passkey URL flag. The full
// ceremony (PRF seed derivation, seed proofs, backup screen) lands with the @dfx.swiss/wallet beta; this
// tile already wires the WalletType, the ConnectWrapper route and the session handling.
export default function ConnectPasskey(props: ConnectProps): JSX.Element {
  const { onCancel }: ConnectProps = props;
  const { translate } = useSettingsContext();

  return (
    <StyledVerticalStack gap={2} center>
      <p className="error">Passkey login arrives with the wallet beta</p>

      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.GRAY}
        label={translate('screens/home', 'Passkey')}
        onClick={() => undefined}
        disabled
      />
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.RED}
        label={translate('general/actions', 'Close')}
        onClick={onCancel}
      />
    </StyledVerticalStack>
  );
}
