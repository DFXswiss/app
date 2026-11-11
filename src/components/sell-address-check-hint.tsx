import { Blockchain, SellAddressCheckResult, useAuthContext, useSell } from '@dfx.swiss/react';
import { IconColor, StyledInfoText } from '@dfx.swiss/react-components';
import { useEffect, useState } from 'react';
import { useSettingsContext } from '../contexts/settings.context';

interface SellAddressCheckHintProps {
  blockchain?: Blockchain;
}

// Shows a banner when deposits from the connected wallet will likely be returned. The check runs in parallel to
// the sell flow and never blocks it: a pending, failed or non-LikelyReturn answer renders nothing.
export function SellAddressCheckHint({ blockchain }: SellAddressCheckHintProps): JSX.Element {
  const { translate } = useSettingsContext();
  const { session } = useAuthContext();
  const { checkAddress } = useSell();
  const [likelyReturn, setLikelyReturn] = useState(false);

  const address = session?.address;
  const canCheck = Boolean(address && blockchain && session?.blockchains?.includes(blockchain));

  useEffect(() => {
    setLikelyReturn(false);
    if (!canCheck || !blockchain) return;

    let active = true;
    checkAddress(blockchain)
      .then(({ result }) => {
        if (active) setLikelyReturn(result === SellAddressCheckResult.LIKELY_RETURN);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [address, blockchain, canCheck, checkAddress]);

  return likelyReturn ? (
    <div className="w-full rounded-lg border-2 border-dfxRed-100 p-3" data-testid="sell-address-check-banner">
      <StyledInfoText iconColor={IconColor.RED}>
        {translate(
          'screens/sell',
          'Warning: According to our blockchain analysis, cryptocurrencies sent from this wallet address will most likely not be processed but returned to you.',
        )}
      </StyledInfoText>
    </div>
  ) : (
    <></>
  );
}
