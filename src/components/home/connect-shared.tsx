import { Blockchain } from '@dfx.swiss/react';
import { RefObject } from 'react';
import { BitcoinAddressType } from '../../config/key-path';
import { useSettingsContext } from '../../contexts/settings.context';
import { WalletType } from '../../contexts/wallet.context';
import { useReportDisplayedError } from '../../hooks/report-displayed-error.hook';
import { mapWalletErrorMessage } from '../../util/pending-wallet-request';

export type Account =
  | {
      address: string;
      signature?: string;
      key?: string;
      accountIndex?: number;
      index?: number;
      type?: BitcoinAddressType;
    }
  | { session: string };

export interface Address {
  address: string;
  index: number;
}

export interface ConnectProps {
  rootRef: RefObject<HTMLDivElement>;
  wallet: WalletType;
  blockchain?: Blockchain;
  isConnect: boolean;
  onLogin: () => void;
  onCancel: () => void;
  onSwitch: (wallet: WalletType) => void;
}

export interface ConnectContentProps {
  rootRef: RefObject<HTMLDivElement>;
  back: () => void;
  connect: (chain?: Blockchain) => Promise<void>;
  isConnecting: boolean;
  error?: string;
  onSwitch: (wallet: WalletType) => void;
}

export function ConnectError({ error: rawError }: { error: string }): JSX.Element {
  const error = mapWalletErrorMessage(rawError);
  useReportDisplayedError(error);
  const { translate } = useSettingsContext();

  return (
    <div>
      <h2 className="text-dfxGray-700">{translate('screens/home', 'Connection failed!')}</h2>
      <p className="text-dfxRed-150">{translate('screens/home', error)}</p>
    </div>
  );
}

export function ConnectInstructions({
  steps,
  params,
  img,
}: {
  steps: string[];
  params: Record<string, string>;
  img?: string;
}): JSX.Element {
  const { translate } = useSettingsContext();

  return (
    <>
      <ol className="text-dfxBlue-800 text-left font-bold list-decimal ml-6 max-w-sm">
        {steps.map((s, i) => (
          <li key={i}>{translate('screens/home', s, params)}</li>
        ))}
      </ol>

      {img && <img src={img} className="w-full max-w-sm" />}
    </>
  );
}
