import {
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledLoadingSpinner,
} from '@dfx.swiss/react-components';
import { GetInfoResponse } from 'webln';
import { Api } from '../../../config/api';
import { useAppHandlingContext } from '../../../contexts/app-handling.context';
import { useSettingsContext } from '../../../contexts/settings.context';
import { WalletType } from '../../../contexts/wallet.context';
import { useAlby } from '../../../hooks/wallets/alby.hook';
import { AbortError } from '../../../util/abort-error';
import { personalIbanOnlyParams } from '../../../util/personal-iban';
import { delay, relativeUrl, url } from '../../../util/utils';
import { ConnectBase } from '../connect-base';
import { Account, ConnectContentProps, ConnectError, ConnectProps } from '../connect-shared';

export default function ConnectAlby(props: ConnectProps): JSX.Element {
  const { redirectPath, params: appParams } = useAppHandlingContext();
  const { isAvailable, enable, signMessage } = useAlby();

  async function getAccount(): Promise<Account> {
    const account = await enable();
    if (!account) throw new Error('Permission denied or account not verified');

    return { address: await getAlbyAddress(account) };
  }

  async function getAlbyAddress(account: GetInfoResponse): Promise<string> {
    if (account.node?.pubkey) {
      // log in with pub key
      return `LNNID${account.node.pubkey.toUpperCase()}`;
    } else if (account.node?.alias === 'getalby.com' || account.node?.alias?.endsWith('.getalby.com')) {
      // log in with Alby
      const win: Window = window;
      const redirectUrl = new URL(win.location.href);
      redirectUrl.searchParams.set('type', WalletType.ALBY);
      // Merge redirectPath with an allowlisted callback param set (only personal-iban when present).
      // Do not copy the entire live search into the Alby redirect.
      redirectPath &&
        redirectUrl.searchParams.set(
          'redirect',
          relativeUrl({ path: redirectPath, params: personalIbanOnlyParams(win.location.search) }),
        );

      const params = new URLSearchParams({ redirectUri: redirectUrl.toString() });
      appParams.wallet && params.set('wallet', appParams.wallet);
      appParams.refcode && params.set('usedRef', appParams.refcode);

      win.location = url({
        base: Api.url,
        path: `${Api.version}/auth/alby`,
        params,
      });

      await delay(5);
      throw new AbortError('Forwarded to Alby page');
    }

    throw new Error('No login method found');
  }

  return (
    <ConnectBase
      isSupported={isAvailable}
      getAccount={getAccount}
      signMessage={(msg) => signMessage(msg)}
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
      <p className="text-dfxGray-700">
        {translate('screens/home', 'Please confirm the connection in the Alby browser extension.')}
      </p>
    </>
  );
}
