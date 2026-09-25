import { Blockchain } from '@dfx.swiss/react';
import {
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledLoadingSpinner,
} from '@dfx.swiss/react-components';
import { isMobile } from 'react-device-detect';
import { useSettingsContext } from '../../../contexts/settings.context';
import { WalletType } from '../../../contexts/wallet.context';
import { useMetaMask } from '../../../hooks/wallets/metamask.hook';
import { ConnectBase } from '../connect-base';
import { Account, ConnectContentProps, ConnectError, ConnectProps } from '../connect-shared';

export default function ConnectMetaMask(props: ConnectProps): JSX.Element {
  const { isInstalled, requestAccount, requestBlockchain, requestChangeToBlockchain, sign } = useMetaMask();

  async function getAccount(_w: WalletType, blockchain: Blockchain): Promise<Account> {
    const address = await requestAccount();
    if (!address) throw new Error('Permission denied or account not verified');

    const currentBlockchain = await requestBlockchain();
    if (blockchain !== currentBlockchain) await requestChangeToBlockchain(blockchain);

    return { address };
  }

  return (
    <ConnectBase
      isSupported={isInstalled}
      fallback={isMobile ? WalletType.WALLET_CONNECT : undefined}
      getAccount={getAccount}
      signMessage={(msg, addr) => sign(addr, msg)}
      renderContent={Content}
      autoConnect
      {...props}
    />
  );
}

function Content({ back, error }: ConnectContentProps): JSX.Element {
  const { translate } = useSettingsContext();

  return error ? (
    <>
      <ConnectError error={error} />

      <StyledButton
        className="mt-4"
        label={translate('general/actions', 'Back')}
        onClick={back}
        color={StyledButtonColor.GRAY_OUTLINE}
        width={StyledButtonWidth.MIN}
      />
    </>
  ) : (
    <>
      <div className="mb-4">
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      </div>
      <p className="text-dfxGray-700">{translate('screens/home', 'Please confirm the connection in your MetaMask.')}</p>
    </>
  );
}
