import { useState } from 'react';
import {
  Form,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useSettingsContext } from '../../../contexts/settings.context';
import { ConnectProps } from '../connect-shared';

// The passkey login tile (MVP): a visible placeholder flow behind the ?feature=Passkey URL flag. The full
// ceremony (PRF seed derivation, seed proofs, backup screen) lands with the @dfx.swiss/wallet beta; this
// tile already wires the WalletType, the ConnectWrapper route and the session handling.
export function ConnectPasskey(props: ConnectProps): JSX.Element {
  const { onClose }: ConnectProps = props;
  const { translate } = useSettingsContext();
  const [error] = useState<string>('Passkey login arrives with the wallet beta');

  return (
    <StyledVerticalStack gap={2} center>
      <Form>{error && <p className="error">{error}</p>}</Form>

      <StyledButton
        width={StyledButtonWidth.full}
        color={StyledButtonColor.gray}
        label={translate('screens/home.seedTile')}
        onClick={() => undefined}
        disabled
      />
      <StyledButton
        width={StyledButtonWidth.full}
        color={StyledButtonColor.red}
        label={translate('generic/close')}
        onClick={onClose}
      />
    </StyledVerticalStack>
  );
}
