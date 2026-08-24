import { CopyButton, IconColor } from '@dfx.swiss/react-components';
import { useEffect, useRef, useState } from 'react';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useClipboard } from 'src/hooks/clipboard.hook';
import { blankedAddress } from 'src/util/utils';

interface CopyableAddressProps {
  address?: string;
  displayLength?: number;
}

export const CopyableAddress = ({ address, displayLength = 12 }: CopyableAddressProps) => {
  const { copy } = useClipboard();
  const { translate } = useSettingsContext();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number>();

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  if (!address) return <>-</>;

  const copyNow = () => {
    copy(address);
    setCopied(true);
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), 1000);
  };

  return (
    <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="text-left text-sm text-dfxBlue-800 cursor-pointer hover:text-dfxBlue-600 hover:underline break-all bg-transparent border-0 p-0"
        onClick={copyNow}
      >
        {blankedAddress(address, { displayLength })}
      </button>
      <CopyButton color={IconColor.GRAY} onCopy={copyNow} />
      {copied && <span className="text-xs text-dfxGray-800">{translate('general/actions', 'Copied')}</span>}
    </div>
  );
};
