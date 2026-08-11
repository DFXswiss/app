import { Asset, AssetCategory, CustodyOrderPaymentInfo, Fiat, FiatPaymentMethod, Sell, Swap, TransactionError, TransactionType, useBankAccountContext } from '@dfx.swiss/react';
import {
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledLink,
  StyledLoadingSpinner,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import React, { useEffect, useMemo, useState } from 'react';
import { Urls } from 'src/config/urls';
import { CloseType, useAppHandlingContext } from 'src/contexts/app-handling.context';
import { useOrderUIContext } from 'src/contexts/order-ui.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useWalletContext } from 'src/contexts/wallet.context';
import { useAppParams } from 'src/hooks/app-params.hook';
import { AmountError, OrderType } from 'src/hooks/order.hook';
import { useTxHelper } from 'src/hooks/tx-helper.hook';
import { isAsset } from 'src/util/utils';
import { ExchangeRate } from '../exchange-rate';
import { PrivateAssetHint } from '../private-asset-hint';
import { QuoteErrorHint } from '../quote-error-hint';
import { SanctionHint } from '../sanction-hint';
import { PaymentInfoContent } from './payment-info-content';

export interface PaymentInfoProps {
  className?: string;
  orderType: OrderType;
  isLoading: boolean;
  paymentInfo?: CustodyOrderPaymentInfo;
  paymentMethod?: FiatPaymentMethod;
  sourceAsset: Asset | Fiat;
  targetAsset: Asset | Fiat;
  errorMessage?: string;
  amountError?: AmountError;
  kycError?: TransactionError;
  confirmButtonLabel?: string;
  retry: () => void;
  confirmPayment: () => Promise<void>;
}

export const PaymentInfo = React.memo(function PaymentInfoComponent({
  className,
  orderType,
  isLoading,
  paymentInfo,
  paymentMethod,
  errorMessage,
  amountError,
  kycError,
  sourceAsset,
  targetAsset,
  confirmButtonLabel,
  retry,
  confirmPayment,
}: PaymentInfoProps): JSX.Element {
  const { closeServices } = useAppHandlingContext();
  const { bankAccounts } = useBankAccountContext();
  const { canSendTransaction } = useTxHelper();
  const { updateAccount } = useBankAccountContext();
  const { activeWallet } = useWalletContext();
  const { translate } = useSettingsContext();
  const { flags } = useAppParams();
  const { setPaymentNameForm } = useOrderUIContext();

  const localRef = React.useRef<HTMLDivElement>(null);

  const [isProcessingTransaction, setIsProcessingTransaction] = useState(false);
  const [isProcessingCardPayment, setIsProcessingCardPayment] = useState(false);

  useEffect(() => {
    if (paymentInfo && localRef.current) {
      localRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [paymentInfo]);

  const privateAssets = useMemo(
    () => [sourceAsset, targetAsset].filter((a) => a && isAsset(a) && a.category === AssetCategory.PRIVATE),
    [sourceAsset, targetAsset],
  );

  function onCardBuy(info: CustodyOrderPaymentInfo) {
    if (info.error === TransactionError.NAME_REQUIRED) {
      setPaymentNameForm(true);
    } else if (info?.buyInfos?.paymentLink && info.isValid) {
      setIsProcessingCardPayment(true);
      window.location.href = info.buyInfos.paymentLink;
    }
  }

  async function processTransaction(paymentInfo: Sell | Swap): Promise<void> {
    setIsProcessingTransaction(true);

    if (orderType === OrderType.SELL) {
      const bankAccountId = bankAccounts?.find((b) => b.iban === (paymentInfo as Sell).beneficiary.iban)?.id;
      bankAccountId && (await updateAccount(bankAccountId, { preferredCurrency: (paymentInfo as Sell).currency }));
    }

    if (canSendTransaction() && !activeWallet) {
      // TODO (later): Refactor CloseServicesParams
      if (orderType === OrderType.SELL) {
        closeServices({ type: CloseType.SELL, isComplete: false, sell: paymentInfo as Sell }, false);
      } else {
        closeServices({ type: CloseType.SWAP, isComplete: false, swap: paymentInfo as Swap }, false);
      }
      return;
    }

    try {
      if (canSendTransaction()) {
        if (orderType === OrderType.SELL) {
          await sendSellTransaction(paymentInfo as Sell);
        } else if (orderType === OrderType.SWAP) {
          await sendSwapTransaction(paymentInfo as Swap);
        }
      }
    } finally {
      setIsProcessingTransaction(false);
    }
  }

  async function sendSellTransaction(sell: Sell): Promise<void> {
    // DISABLED: EIP-7702 gasless transactions require Pimlico integration
    // The manual signing approach doesn't work because eth_sign is disabled in MetaMask
    // TODO: Re-enable once Pimlico integration is complete
    closeServices({ type: CloseType.SELL, isComplete: false, sell }, false);
  }

  async function sendSwapTransaction(swap: Swap): Promise<void> {
    // DISABLED: EIP-7702 gasless transactions require Pimlico integration
    // The manual signing approach doesn't work because eth_sign is disabled in MetaMask
    // TODO: Re-enable once Pimlico integration is complete
    closeServices({ type: CloseType.SWAP, isComplete: false, swap }, false);
  }

  const isBankWire = paymentMethod !== FiatPaymentMethod.CARD;
  const isCardPayment = paymentMethod === FiatPaymentMethod.CARD;

  return (
    <div ref={localRef}>
      <StyledVerticalStack center className={className}>
        {isLoading && !paymentInfo ? (
          <StyledLoadingSpinner size={SpinnerSize.LG} />
        ) : (
          <>
            {kycError && <QuoteErrorHint type={TransactionType.BUY} error={kycError} />}

            {errorMessage && (
              <StyledVerticalStack center className="text-center">
                <p className="text-dfxGray-800 text-sm">{errorMessage}</p>
                <StyledButton
                  width={StyledButtonWidth.MIN}
                  label={translate('general/actions', 'Retry')}
                  onClick={retry}
                  className="mt-4"
                  color={StyledButtonColor.STURDY_WHITE}
                />
              </StyledVerticalStack>
            )}

            {paymentInfo &&
              !kycError &&
              !errorMessage &&
              !amountError?.hideInfos &&
              targetAsset &&
              (privateAssets?.length && !flags?.includes('private') ? (
                <PrivateAssetHint asset={privateAssets[0] as Asset} />
              ) : (
                <StyledVerticalStack className="text-left" gap={4}>
                  <ExchangeRate
                    exchangeRate={paymentInfo.exchangeRate}
                    rate={paymentInfo.rate}
                    fees={paymentInfo.fees}
                    feeCurrency={sourceAsset}
                    from={sourceAsset}
                    to={targetAsset}
                    steps={paymentInfo.priceSteps}
                    amountIn={paymentInfo.amount}
                    amountOut={paymentInfo.estimatedAmount}
                    type={TransactionType.BUY}
                  />

                  <>
                    {isBankWire && orderType !== OrderType.SWAP && paymentInfo?.buyInfos && (
                      <PaymentInfoContent info={paymentInfo} />
                    )}
                    <SanctionHint />
                    <div className="w-full text-center leading-none">
                      <StyledLink
                        label={translate(
                          'screens/payment',
                          'Please note that by using this service you automatically accept our terms and conditions. The effective exchange rate is fixed when the money is received and processed by DFX.',
                        )}
                        url={Urls.termsAndConditions}
                        small
                        dark
                      />
                      {orderType === OrderType.SWAP ? (
                        <StyledButton
                          width={StyledButtonWidth.FULL}
                          label={translate('screens/swap', 'Confirm swap')}
                          onClick={confirmPayment}
                          className="mt-4"
                        />
                      ) : isBankWire ? (
                        <StyledButton
                          width={StyledButtonWidth.FULL}
                          label={
                            confirmButtonLabel ??
                            translate('screens/buy', 'Click here once you have issued the transfer')
                          }
                          onClick={confirmPayment}
                          className="mt-4"
                          caps={false}
                        />
                      ) : isCardPayment ? (
                        <StyledButton
                          width={StyledButtonWidth.FULL}
                          label={translate('general/actions', 'Next')}
                          onClick={() => onCardBuy(paymentInfo)}
                          isLoading={isProcessingCardPayment}
                          className="mt-4"
                        />
                      ) : (
                        <StyledButton
                          width={StyledButtonWidth.FULL}
                          label={translate(
                            'screens/sell',
                            canSendTransaction()
                              ? 'Complete transaction in your wallet'
                              : 'Click here once you have issued the transaction',
                          )}
                          onClick={() => processTransaction(paymentInfo as any)} // TODO (later): Fix type casting
                          isLoading={isProcessingTransaction}
                          className="mt-4"
                          caps={false}
                        />
                      )}
                    </div>
                  </>
                </StyledVerticalStack>
              ))}
          </>
        )}
      </StyledVerticalStack>
    </div>
  );
});
