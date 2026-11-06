import { useSettingsContext } from '../../../contexts/settings.context';
import { QrCopy } from '../../payment/qr-code';

export default function PasskeyReceive({ address, onCopy }: { address: string; onCopy?: () => void }): JSX.Element {
  const { translate } = useSettingsContext();

  return (
    <>
      <p className="sr-only">{translate('screens/home', 'Receive on EVM')}</p>
      <div className="mx-auto mt-5 flex h-[216px] w-[216px] items-center justify-center rounded-[16px] border border-dfxGray-400 p-3 [&>div>div:first-child]:hidden [&>div>div:last-child]:border-0 [&>div>div:last-child]:p-0">
        <QrCopy data={address} />
      </div>
      <p
        data-testid="passkey-receive-address"
        className="mt-4 break-all text-center font-mono text-sm leading-[22px] text-dfxBlue-800"
      >
        {address}
      </p>
      {onCopy && (
        <button
          className="mt-4 min-h-[52px] w-full rounded-md bg-dfxBlue-800 px-4 font-semibold text-white focus-visible:outline focus-visible:outline-2"
          onClick={onCopy}
        >
          {translate('screens/home', 'Copy address')}
        </button>
      )}
      <p className="mt-3 text-sm leading-5 text-dfxGray-800">
        {translate(
          'screens/home',
          'This address is the same on every EVM network, for example Ethereum, Arbitrum or Base. Only send coins from EVM networks to it.',
        )}
      </p>
    </>
  );
}
