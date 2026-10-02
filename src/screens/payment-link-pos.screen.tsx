import { ApiError, PaymentLinkPaymentStatus, Utils, Validations } from '@dfx.swiss/react';
import {
  AlignContent,
  Form,
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledDataTable,
  StyledDataTableRow,
  StyledInput,
  StyledLoadingSpinner,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { GoCheckCircleFill, GoClockFill, GoXCircleFill } from 'react-icons/go';
import { CircularCountdown } from 'src/components/circular-countdown';
import { ErrorHint } from 'src/components/error-hint';
import { Modal } from 'src/components/modal';
import { QrBasic } from 'src/components/payment/qr-code';
import { usePaymentPosContext } from 'src/contexts/payment-link-pos.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { PaymentLinkHistory } from '@dfx.swiss/react';
import { useClipboard } from 'src/hooks/clipboard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { Lnurl } from 'src/util/lnurl';
import { delay, formatAmountForDisplay } from 'src/util/utils';

export default function PaymentLinkPosScreen(): JSX.Element {
  const { error, isLoading, isAuthenticated, payRequest, paymentLinkApiUrl, posUrl, paymentStatus } =
    usePaymentPosContext();
  const { translate } = useSettingsContext();
  const { copy } = useClipboard();

  const [isCopying, setIsCopying] = useState(false);

  function copyPosLink() {
    setIsCopying(true);
    copy(posUrl);
    delay(0.2).then(() => setIsCopying(false));
  }

  useLayoutOptions({ backButton: false, smallMenu: true });

  return (
    <>
      {error ? (
        <p className="text-dfxGray-800 text-sm mt-4">{error}</p>
      ) : !payRequest || isLoading ? (
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      ) : (
        <StyledVerticalStack full gap={4} center className="pt-2">
          <div className="flex flex-col w-full gap-4 justify-center">
            <p className="text-dfxBlue-800 font-bold text-base">{payRequest?.displayName}</p>
            <div className="w-full h-[1px] bg-gradient-to-r bg-dfxGray-500 from-white via-dfxGray-500 to-white" />
          </div>
          <div className="flex justify-center items-center w-full">
            <QrBasic data={Lnurl.prependLnurl(Lnurl.encode(paymentLinkApiUrl ?? ''))} />
          </div>
          {isAuthenticated ? (
            <>
              <div className="flex flex-col w-full gap-4">
                {PaymentLinkPaymentStatus.PENDING === paymentStatus ? <PendingPaymentForm /> : <CreatePaymentForm />}
              </div>

              {posUrl && (
                <StyledButton
                  label={translate('screens/payment', 'Copy POS link')}
                  onClick={copyPosLink}
                  width={StyledButtonWidth.FULL}
                  isLoading={isCopying}
                  color={StyledButtonColor.STURDY_WHITE}
                />
              )}

              <div className="flex flex-col w-full mt-4">
                <TransactionHistory />
              </div>
            </>
          ) : (
            <div className="flex flex-col w-full mt-4">
              <Authenticate />
            </div>
          )}
        </StyledVerticalStack>
      )}
    </>
  );
}

function CreatePaymentForm(): JSX.Element | null {
  const { translate, translateError } = useSettingsContext();
  const { paymentStatus, isAuthenticated, createPayment } = usePaymentPosContext();

  const [isSuccessAnimation, setIsSuccessAnimation] = useState(paymentStatus === PaymentLinkPaymentStatus.COMPLETED);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [error, setError] = useState<string>();

  const rules = Utils.createRules({
    amount: [Validations.Required, Validations.Custom((value) => !isNaN(Number(value)) || 'pattern')],
  });

  useEffect(() => {
    if (paymentStatus === PaymentLinkPaymentStatus.COMPLETED) setTimeout(() => setIsSuccessAnimation(false), 2000);
  }, [paymentStatus]);

  const handleCreatePayment = useCallback(
    (data: { amount: number }) => {
      setIsCreatingPayment(true);
      setError(undefined);
      createPayment(data).catch((error: ApiError) => {
        setError(error.message ?? 'Unknown error');
        setIsCreatingPayment(false);
      });
    },
    [createPayment],
  );

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<{ amount: number }>({
    mode: 'onTouched',
  });

  if (isSuccessAnimation) {
    return (
      <div className="flex justify-center items-center w-full gap-4">
        <GoCheckCircleFill className="text-[#4BB543]" size={80} />
      </div>
    );
  }

  return isAuthenticated ? (
    <Form
      control={control}
      rules={rules}
      onSubmit={handleSubmit(handleCreatePayment)}
      errors={errors}
      translate={translateError}
    >
      <StyledVerticalStack gap={6} full>
        <StyledInput
          type="number"
          name="amount"
          label={translate('screens/payment', 'Amount')}
          smallLabel
          placeholder={'0.00'}
          full
        />
        <StyledButton
          type="submit"
          label={translate('screens/payment', 'Create Payment')}
          onClick={handleSubmit(handleCreatePayment)}
          width={StyledButtonWidth.FULL}
          isLoading={isCreatingPayment}
          disabled={!isValid}
        />
        {error && <ErrorHint message={error} />}
      </StyledVerticalStack>
    </Form>
  ) : null;
}

const PendingPaymentForm = (): JSX.Element => {
  const { translate } = useSettingsContext();
  const { isAuthenticated, cancelPayment, payRequest } = usePaymentPosContext();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

  const remainingTime = useMemo(() => {
    const now = new Date();
    const paymentTime = new Date(payRequest?.quote.expiration ?? 0);
    const diff = paymentTime.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / 1000));
  }, []);

  const handleCancelPayment = useCallback(() => {
    setIsLoading(true);
    setError(undefined);
    cancelPayment()
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsLoading(false));
  }, [cancelPayment]);

  return (
    <>
      <div className="flex justify-center items-center w-full gap-4">
        <CircularCountdown duration={remainingTime} size={80} strokeWidth={6} color="#a7f3d0" textColor="#1e293b" />
      </div>
      <StyledDataTable alignContent={AlignContent.RIGHT} showBorder minWidth={false}>
        <StyledDataTableRow label={translate('screens/payment', 'Amount')}>
          {payRequest?.requestedAmount.asset ?? ''} {formatAmountForDisplay(payRequest?.requestedAmount.amount)}
        </StyledDataTableRow>
      </StyledDataTable>
      {isAuthenticated && (
        <>
          <StyledButton
            label={translate('general/actions', 'Cancel')}
            onClick={handleCancelPayment}
            width={StyledButtonWidth.FULL}
            isLoading={isLoading}
          />
          {error && <ErrorHint message={error} />}
        </>
      )}
    </>
  );
};

function TransactionHistory(): JSX.Element {
  const { payRequest, paymentStatus, fetchTransactionHistory } = usePaymentPosContext();
  const [transactionHistory, setTransactionHistory] = useState<PaymentLinkHistory>();
  const [isLoading, setIsLoading] = useState(true);
  const { translate } = useSettingsContext();

  const [error, setError] = useState<string>();

  const statusIcon = {
    [PaymentLinkPaymentStatus.COMPLETED]: <GoCheckCircleFill className="text-[#4BB543]" />,
    [PaymentLinkPaymentStatus.CANCELLED]: <GoXCircleFill className="text-[#FF4444]" />,
    [PaymentLinkPaymentStatus.EXPIRED]: <GoXCircleFill className="text-[#65728A]" />,
    [PaymentLinkPaymentStatus.PENDING]: <GoClockFill className="text-[#65728A]" />,
  };

  useEffect(() => {
    fetchTransactionHistory()
      .then((history) => setTransactionHistory(history))
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsLoading(false));
  }, [fetchTransactionHistory, paymentStatus]);

  return isLoading ? (
    <div className="flex justify-center items-center w-full h-32">
      <StyledLoadingSpinner size={SpinnerSize.LG} />
    </div>
  ) : error ? (
    <ErrorHint message={error} />
  ) : (
    <StyledVerticalStack full gap={2} className="pb-8">
      <h2 className="ml-1.5 mt-2 mb-1.5 text-dfxGray-700 align-left flex">
        {translate('screens/payment', 'Latest transactions')}
      </h2>
      <StyledDataTable alignContent={AlignContent.RIGHT} showBorder minWidth={false}>
        {transactionHistory?.payments.length ? (
          transactionHistory.payments.map((payment) => (
            <StyledDataTableRow key={payment.id}>
              <div className="flex flex-1 justify-between items-start">
                <div className="flex items-center justify-center gap-2 text-dfxGray-800">
                  {statusIcon[payment.status as keyof typeof statusIcon]}
                  {translate('screens/payment', `${payment.status}`)}
                </div>
                <div className="flex flex-col items-end justify-start">
                  {payment.currency.toUpperCase()} {formatAmountForDisplay(payment.amount)}
                  <span className="text-dfxGray-800 text-xs">
                    {new Date(payment.date).toDateString() === new Date().toDateString()
                      ? new Date(payment.date).toLocaleTimeString()
                      : new Date(payment.date).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </StyledDataTableRow>
          ))
        ) : (
          <StyledDataTableRow label={translate('screens/payment', 'No transactions yet')} />
        )}
      </StyledDataTable>
      {transactionHistory && payRequest && (
        <>
          <div className="w-full h-[1px] bg-dfxGray-500 my-3" />
          <StyledDataTable alignContent={AlignContent.RIGHT} showBorder minWidth={false}>
            <StyledDataTableRow label={translate('screens/payment', 'Total amount')}>
              <div className="font-bold text-dfxBlue-800">
                {payRequest.currency?.toUpperCase() ?? payRequest.requestedAmount?.asset ?? ''}{' '}
                {formatAmountForDisplay(transactionHistory.totalCompletedAmount)}
              </div>
            </StyledDataTableRow>
          </StyledDataTable>
        </>
      )}
    </StyledVerticalStack>
  );
}

function Authenticate(): JSX.Element {
  const { paymentLinkApiUrl, checkAuthentication } = usePaymentPosContext();
  const { translate, translateError } = useSettingsContext();
  const { navigate } = useNavigation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

  const handleAuthenticate = useCallback(
    (data: { key: string }) => {
      setIsLoading(true);
      setError(undefined);
      checkAuthentication(data.key)
        .catch((error: ApiError) => {
          setError(error.message ?? 'Unknown error');
        })
        .finally(() => {
          setIsLoading(false);
        });
    },
    [checkAuthentication, navigate, paymentLinkApiUrl],
  );

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<{ key: string }>({
    mode: 'onTouched',
  });

  const rules = Utils.createRules({
    key: [Validations.Required],
  });

  return (
    <>
      <StyledButton
        label={translate('general/actions', 'Authenticate')}
        onClick={() => setIsModalOpen(true)}
        width={StyledButtonWidth.FULL}
      />
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <Form
          control={control}
          rules={rules}
          errors={errors}
          onSubmit={handleSubmit(handleAuthenticate)}
          translate={translateError}
        >
          <StyledVerticalStack gap={6} full>
            <p className="text-dfxGray-800 text-sm">
              {translate('screens/payment', 'Please enter your access key to manage this checkout')}
            </p>
            <StyledInput
              type="text"
              name="key"
              label={translate('screens/payment', 'Access key')}
              placeholder={translate('screens/payment', 'Access key')}
              full
            />
            <StyledButton
              type="submit"
              label={translate('general/actions', 'Authenticate')}
              onClick={handleSubmit(handleAuthenticate)}
              isLoading={isLoading}
            />
            <StyledButton
              label={translate('general/actions', 'Cancel')}
              onClick={() => setIsModalOpen(false)}
              width={StyledButtonWidth.FULL}
              color={StyledButtonColor.STURDY_WHITE}
            />
            {error && <ErrorHint message={error} />}
          </StyledVerticalStack>
        </Form>
      </Modal>
    </>
  );
}
