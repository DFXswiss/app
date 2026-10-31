import { StyledButton, StyledButtonWidth, StyledLink, StyledVerticalStack } from '@dfx.swiss/react-components';
import { isMobile } from 'react-device-detect';
import { Trans } from 'react-i18next';
import { useSettingsContext } from '../../contexts/settings.context';
import { WalletType } from '../../contexts/wallet.context';

export function InstallHint({ type, onConfirm }: { type: WalletType; onConfirm: () => void }): JSX.Element {
  // passkey installs nothing: the platform sheet opens from the tile itself
  switch (type) {
    case WalletType.PASSKEY:
      return <></>;

    case WalletType.META_MASK:
      return <MetaMaskHint onConfirm={onConfirm} />;

    case WalletType.ALBY:
      return <AlbyHint onConfirm={onConfirm} />;

    case WalletType.LEDGER_BTC:
    case WalletType.LEDGER_ETH:
    case WalletType.BITBOX_BTC:
    case WalletType.BITBOX_ETH:
      return <WebHidHint onConfirm={onConfirm} />;

    case WalletType.TREZOR_BTC:
    case WalletType.TREZOR_ETH:
      return <TrezorHint onConfirm={onConfirm} />;

    case WalletType.PHANTOM_SOL:
      return <PhantomHint onConfirm={onConfirm} />;

    case WalletType.TRUST_SOL:
    case WalletType.TRUST_TRX:
      return <TrustHint onConfirm={onConfirm} />;

    case WalletType.TRONLINK_TRX:
      return <TronLinkHint onConfirm={onConfirm} />;

    case WalletType.CLI_BTC:
    case WalletType.CLI_LN:
    case WalletType.CLI_FIRO:
    case WalletType.CLI_XMR:
    case WalletType.CLI_ZANO:
    case WalletType.CLI_ICP:
    case WalletType.CLI_ETH:
    case WalletType.CLI_ADA:
    case WalletType.CLI_AR:
    case WalletType.CLI_SOL:
    case WalletType.CLI_TRX:
    case WalletType.CLI_SPARK:
    case WalletType.CLI_ARK:
    case WalletType.DFX_TARO:
    case WalletType.WALLET_CONNECT:
    case WalletType.CAKE:
    case WalletType.MONERO:
    case WalletType.MAIL:
    case WalletType.ADDRESS:
      return <></>;
  }
}

function MetaMaskHint({ onConfirm }: { onConfirm: () => void }): JSX.Element {
  const { translate } = useSettingsContext();

  return (
    <StyledVerticalStack gap={4}>
      <h1 className="text-dfxGray-700">{translate('screens/home', 'Please install MetaMask or Rabby!')}</h1>
      <p className="text-dfxGray-700">
        {translate(
          'screens/home',
          'You need to install the MetaMask or Rabby browser extension to be able to use this service.',
        )}{' '}
        <Trans i18nKey="screens/home.visit">
          Visit <MetaMaskLink /> for more details.
        </Trans>
      </p>

      <div className="mx-auto">
        <StyledButton width={StyledButtonWidth.SM} onClick={onConfirm} label={translate('general/actions', 'OK')} />
      </div>
    </StyledVerticalStack>
  );
}

function MetaMaskLink(): JSX.Element {
  return (
    <>
      <StyledLink label="metamask.io" url="https://metamask.io" dark /> /{' '}
      <StyledLink label="rabby.io" url="https://rabby.io/" dark />
    </>
  );
}

function AlbyHint({ onConfirm }: { onConfirm: () => void }): JSX.Element {
  const { translate } = useSettingsContext();

  return (
    <StyledVerticalStack gap={4}>
      <h1 className="text-dfxGray-700">{translate('screens/home', 'Please install Alby!')}</h1>
      <p className="text-dfxGray-700">
        {translate('screens/home', 'You need to install the Alby browser extension to be able to use this service.')}{' '}
        <Trans i18nKey="screens/home.visit">
          Visit <StyledLink label="getalby.com" url="https://getalby.com/" dark /> for more details.
        </Trans>
      </p>

      <div className="mx-auto">
        <StyledButton width={StyledButtonWidth.SM} onClick={onConfirm} label={translate('general/actions', 'OK')} />
      </div>
    </StyledVerticalStack>
  );
}

function WebHidHint({ onConfirm }: { onConfirm: () => void }): JSX.Element {
  const { translate } = useSettingsContext();

  return (
    <StyledVerticalStack gap={4}>
      <h1 className="text-dfxGray-700">
        {translate('screens/home', isMobile ? 'Mobile not supported!' : 'Browser not supported!')}
      </h1>
      <p className="text-dfxGray-700">
        {translate(
          'screens/home',
          'Please use a desktop device with a compatible browser (e.g. Chrome) to be able to use this service.',
        )}{' '}
        <Trans i18nKey="screens/home.visit">
          Visit <StyledLink label="caniuse.com" url="https://caniuse.com/webhid" dark /> for more details.
        </Trans>
      </p>

      <div className="mx-auto">
        <StyledButton width={StyledButtonWidth.SM} onClick={onConfirm} label={translate('general/actions', 'OK')} />
      </div>
    </StyledVerticalStack>
  );
}

function TrezorHint({ onConfirm }: { onConfirm: () => void }): JSX.Element {
  const { translate } = useSettingsContext();

  return (
    <StyledVerticalStack gap={4}>
      <h1 className="text-dfxGray-700">{translate('screens/home', 'Trezor Bridge not installed!')}</h1>
      <p className="text-dfxGray-700">
        {translate('screens/home', 'Please install the Trezor Bridge to be able to use this service.')}{' '}
        <Trans i18nKey="screens/home.visit">
          Visit <StyledLink label="trezor.io" url="https://trezor.io/learn/a/what-is-trezor-bridge" dark /> for more
          details.
        </Trans>
      </p>

      <div className="mx-auto">
        <StyledButton width={StyledButtonWidth.SM} onClick={onConfirm} label={translate('general/actions', 'OK')} />
      </div>
    </StyledVerticalStack>
  );
}

function PhantomHint({ onConfirm }: { onConfirm: () => void }): JSX.Element {
  const { translate } = useSettingsContext();

  return (
    <StyledVerticalStack gap={4}>
      <h1 className="text-dfxGray-700">{translate('screens/home', 'Please install Phantom!')}</h1>
      <p className="text-dfxGray-700">
        {translate('screens/home', 'You need to install the Phantom browser extension to be able to use this service.')}{' '}
        <Trans i18nKey="screens/home.visit">
          Visit <StyledLink label="phantom.app" url="https://phantom.app/" dark /> for more details.
        </Trans>{' '}
      </p>

      <div className="mx-auto">
        <StyledButton width={StyledButtonWidth.SM} onClick={onConfirm} label={translate('general/actions', 'OK')} />
      </div>
    </StyledVerticalStack>
  );
}

function TrustHint({ onConfirm }: { onConfirm: () => void }): JSX.Element {
  const { translate } = useSettingsContext();

  return (
    <StyledVerticalStack gap={4}>
      <h1 className="text-dfxGray-700">{translate('screens/home', 'Please install Trust!')}</h1>
      <p className="text-dfxGray-700">
        {translate('screens/home', 'You need to install the Trust browser extension to be able to use this service.')}{' '}
        <Trans i18nKey="screens/home.visit">
          Visit <StyledLink label="trustwallet.com" url="https://trustwallet.com" dark /> for more details.
        </Trans>{' '}
      </p>

      <div className="mx-auto">
        <StyledButton width={StyledButtonWidth.SM} onClick={onConfirm} label={translate('general/actions', 'OK')} />
      </div>
    </StyledVerticalStack>
  );
}

function TronLinkHint({ onConfirm }: { onConfirm: () => void }): JSX.Element {
  const { translate } = useSettingsContext();

  return (
    <StyledVerticalStack gap={4}>
      <h1 className="text-dfxGray-700">{translate('screens/home', 'Please install TronLink!')}</h1>
      <p className="text-dfxGray-700">
        {translate(
          'screens/home',
          'You need to install the TronLink browser extension to be able to use this service.',
        )}{' '}
        <Trans i18nKey="screens/home.visit">
          Visit <StyledLink label="tronlink.org" url="https://www.tronlink.org" dark /> for more details.
        </Trans>{' '}
      </p>

      <div className="mx-auto">
        <StyledButton width={StyledButtonWidth.SM} onClick={onConfirm} label={translate('general/actions', 'OK')} />
      </div>
    </StyledVerticalStack>
  );
}
