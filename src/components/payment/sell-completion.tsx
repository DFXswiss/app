import { Sell } from '@dfx.swiss/react';
import {
  CopyButton,
  DfxIcon,
  IconColor,
  IconSize,
  IconVariant,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledHorizontalStack,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useState } from 'react';
import { useWindowContext } from 'src/contexts/window.context';
import { CloseType, useAppHandlingContext } from '../../contexts/app-handling.context';
import { useSettingsContext } from '../../contexts/settings.context';
import { useClipboard } from '../../hooks/clipboard.hook';
import { blankedAddress } from '../../util/utils';
import { SimulatePayout } from './test-simulation';

interface SellCompletionProps {
  paymentInfo: Sell;
  navigateOnClose: boolean;
  txId?: string;
}

export function SellCompletion({ paymentInfo, navigateOnClose, txId }: SellCompletionProps): JSX.Element {
  const { copy } = useClipboard();
  const { translate } = useSettingsContext();
  const { closeServices } = useAppHandlingContext();
  const { width } = useWindowContext();

  const [isClosed, setIsClosed] = useState(false);

  function close() {
    closeServices({ type: CloseType.SELL, isComplete: true, sell: paymentInfo }, navigateOnClose);
    setIsClosed(true);
  }

  return isClosed ? (
    <></>
  ) : (
    <StyledVerticalStack gap={4}>
      <div className="mx-auto">
        <DfxIcon size={IconSize.XXL} icon={IconVariant.PROCESS_DONE} color={IconColor.BLUE} />
      </div>

      <p className="text-base font-bold text-center text-dfxBlue-800">
        {translate('screens/payment', 'Nice! You are all set! Give us a minute to handle your transaction.')}
      </p>

      {txId && (
        <StyledHorizontalStack gap={2} center>
          <p className="text-dfxBlue-800">{translate('screens/sell', 'Transaction hash')}:</p>
          <span className="text-dfxBlue-800 font-bold">{blankedAddress(txId, { width })}</span>
          <CopyButton onCopy={() => copy(txId)} />
        </StyledHorizontalStack>
      )}

      <p className="text-center text-dfxBlue-800">
        {!txId &&
          translate(
            'screens/sell',
            'As soon as the transaction arrives in our wallet, we will transfer your money to your bank account.',
          )}{' '}
        {translate('screens/payment', 'We will inform you by email about the progress of your transactions.')}
      </p>

      <SimulatePayout sell={paymentInfo} />

      <StyledButton
        label={translate('general/actions', 'Close')}
        onClick={close}
        color={StyledButtonColor.STURDY_WHITE}
        width={StyledButtonWidth.FULL}
      />
    </StyledVerticalStack>
  );
}
