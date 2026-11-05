import { useSettingsContext } from '../../../contexts/settings.context';
import { QrCopy } from '../../payment/qr-code';

export default function PasskeyReceive({ address }: { address: string }): JSX.Element {
  const { translate } = useSettingsContext();

  return (
    <>
      <p className="text-dfxBlue-800">{translate('screens/home', 'Receive on EVM')}</p>
      <QrCopy data={address} />
      <p data-testid="passkey-receive-address" className="break-all text-dfxBlue-800">
        {address}
      </p>
      <p className="text-dfxGray-700">{translate('screens/home', 'This address is the same on every EVM network.')}</p>
    </>
  );
}
