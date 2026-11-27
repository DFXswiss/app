import { Buy, User } from '@dfx.swiss/react';
import {
  DfxIcon,
  IconColor,
  IconSize,
  IconVariant,
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledLoadingSpinner,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useState } from 'react';
import { CloseType, useAppHandlingContext } from '../../contexts/app-handling.context';
import { useSettingsContext } from '../../contexts/settings.context';
import { useNavigation } from '../../hooks/navigation.hook';
import { isTestEnvironment } from '../../util/test-network';
import { MailEdit } from '../edit/mail.edit';
import { SimulatePayment } from './simulate-payment';

interface BuyCompletionProps {
  user?: User;
  paymentInfo?: Buy;
  navigateOnClose: boolean;
}

export function BuyCompletion({ user, paymentInfo, navigateOnClose }: BuyCompletionProps): JSX.Element {
  const { translate } = useSettingsContext();
  const { closeServices } = useAppHandlingContext();
  const { navigate } = useNavigation();

  const [isClosed, setIsClosed] = useState(false);

  const isLoading = !user;
  const hasMail = user?.mail != null;

  function getHeader(): string {
    return hasMail
      ? translate('screens/payment', 'Nice! You are all set! Give us a minute to handle your transaction.')
      : translate(
          'screens/buy',
          'As soon as the transfer arrives in our bank account, we will transfer your asset to your wallet.',
        );
  }

  function close() {
    const closed = closeServices({ type: CloseType.BUY, isComplete: true, buy: paymentInfo }, navigateOnClose);

    // Blanking the screen would strand the user — the completion suppresses the back button — so fall
    // back to the account screen whenever no close channel actually fired.
    if (!closed) return navigate('/account');

    setIsClosed(true);
  }

  return isClosed ? (
    <></>
  ) : isLoading ? (
    <div className="mt-4">
      <StyledLoadingSpinner size={SpinnerSize.LG} />
    </div>
  ) : (
    <StyledVerticalStack gap={4}>
      <div className="mx-auto">
        <DfxIcon size={IconSize.XXL} icon={IconVariant.PROCESS_DONE} color={IconColor.BLUE} />
      </div>
      <p className="text-base font-bold text-center text-dfxBlue-800">{getHeader()}</p>

      {paymentInfo && isTestEnvironment() ? <SimulatePayment buy={paymentInfo} /> : null}

      {hasMail ? (
        <>
          <p className="text-center text-dfxBlue-800">
            {translate(
              'screens/buy',
              'As soon as the transfer arrives in our bank account, we will transfer your asset to your wallet.',
            )}{' '}
            {translate('screens/payment', 'We will inform you by email about the progress of your transactions.')}
          </p>
          <StyledButton
            label={translate('general/actions', 'Close')}
            onClick={close}
            color={StyledButtonColor.STURDY_WHITE}
            width={StyledButtonWidth.FULL}
          />
        </>
      ) : (
        <MailEdit
          onSubmit={() => close()}
          infoText={translate(
            'screens/payment',
            'Enter your email address if you want to be informed about the progress of any purchase or sale',
          )}
          hideLabels
          isOptional
        />
      )}
    </StyledVerticalStack>
  );
}
