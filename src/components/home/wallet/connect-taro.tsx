import { ApiException, Blockchain, LnurlAuth, useAuth, useAuthContext } from '@dfx.swiss/react';
import {
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledLoadingSpinner,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useEffect, useState } from 'react';
import { WalletType } from 'src/contexts/wallet.context';
import { useSettingsContext } from '../../../contexts/settings.context';
import { useDeferredPromise } from '../../../hooks/deferred-promise.hook';
import { QrCopy } from '../../payment/qr-code';
import { ConnectBase } from '../connect-base';
import { Account, ConnectContentProps, ConnectError, ConnectProps } from '../connect-shared';

export default function ConnectTaro(props: ConnectProps): JSX.Element {
  const { session } = useAuthContext();
  const { createLnurlAuth, getLnurlAuth } = useAuth();

  const [auth, setAuth] = useState<LnurlAuth>();
  const [createTokenPromise, tokenPromise] = useDeferredPromise<string>();

  const link = auth && `dfxtaro:lightning:${auth.lnurl}`;

  async function getAccount(_w: WalletType, _b: Blockchain, isReconnect: boolean): Promise<Account> {
    if (isReconnect && session?.address) return { address: session.address };

    await createLnurlAuth().then(setAuth);

    return createTokenPromise().then((session) => ({ session }));
  }

  async function getSignature(): Promise<never> {
    throw new Error('Invalid signature call');
  }

  useEffect(() => {
    if (auth?.k1) {
      // requests still in flight when polling stops (settled, restarted or unmounted) must not touch a newer login
      let isPolling = true;

      // start polling
      const poller = setInterval(
        () =>
          getLnurlAuth(auth.k1)
            .then((r) => {
              if (isPolling && r.isComplete) {
                stopPolling();
                tokenPromise?.resolve(r.accessToken);
              }
            })
            .catch((error: unknown) => {
              if (!isPolling) return;

              stopPolling();
              setAuth(undefined);
              const isExpiredChallenge = error instanceof ApiException && error.statusCode === 404;
              tokenPromise?.reject(new Error(isExpiredChallenge ? 'LNURL login expired' : 'Authentication failed'));
            }),
        1000,
      );

      const stopPolling = (): void => {
        isPolling = false;
        clearInterval(poller);
      };

      return stopPolling;
    }
  }, [auth?.k1]);

  return (
    <ConnectBase
      isSupported={() => true}
      getAccount={getAccount}
      signMessage={getSignature}
      renderContent={(p) => <Content link={link} {...p} />}
      autoConnect
      {...props}
    />
  );
}

interface ContentProps extends ConnectContentProps {
  link?: string;
}

function Content({ connect, link, error }: ContentProps): JSX.Element {
  const { translate } = useSettingsContext();

  if (error)
    return (
      <>
        <ConnectError error={error} />
        <StyledButton
          className="mt-4"
          label={translate('general/actions', 'Connect')}
          onClick={() => connect()}
          width={StyledButtonWidth.MIN}
        />
      </>
    );

  if (link)
    return (
      <>
        <StyledVerticalStack gap={4} full center>
          <h2 className="text-dfxGray-700">{translate('screens/home', 'Login with your BTC Taro Wallet')}</h2>
          <QrCopy data={link} />
          <StyledButton
            label={translate('screens/home', 'Open app')}
            color={StyledButtonColor.STURDY_WHITE}
            onClick={() => window.open(link, '_self')}
          />
        </StyledVerticalStack>

        <h2 className="text-dfxGray-700 mt-8">{translate('screens/home', 'Install BTC Taro')}</h2>
        <a href="https://dfx.swiss/app/btc" target="_blank">
          <img src="https://dfx.swiss/images/app/btc-app.jpg" className="w-full max-w-sm" />
        </a>
      </>
    );

  return (
    <div className="mb-4">
      <StyledLoadingSpinner size={SpinnerSize.LG} />
    </div>
  );
}
