import { ApiError, usePaymentRoutes, Utils, Validations } from '@dfx.swiss/react';
import {
  DfxIcon,
  Form,
  IconColor,
  IconSize,
  IconVariant,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  SpinnerSize,
  StyledInput,
  StyledLink,
  StyledLoadingSpinner,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import copy from 'copy-to-clipboard';
import { addYears } from 'date-fns';
import { useEffect, useId, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Trans } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Api } from 'src/config/api';
import { ErrorHint } from 'src/components/error-hint';
import { QrBasic } from 'src/components/payment/qr-code';
import { useSettingsContext } from 'src/contexts/settings.context';
import useDebounce from 'src/hooks/debounce.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { fetchJson, relativeUrl, url } from 'src/util/utils';

interface FormData {
  recipient: string;
  invoiceId: string;
  amount: number;
}

function paymentFormKey(recipient?: string, invoiceId?: string, amount?: string | number): string {
  return `${recipient}\0${invoiceId}\0${amount}`;
}

type PaymentResult =
  | { key: string; kind: 'link'; callback: string; callbackSearch: string }
  | { key: string; kind: 'error'; message: string };

// The answer belongs to the values that were asked. Show it only while those values are on screen.
function paymentView(
  result: PaymentResult | null,
  liveKey: string,
): { callback?: string; callbackSearch?: string; error?: string } {
  if (result !== null && result.key === liveKey) {
    if (result.kind === 'error') return { error: result.message };
    return { callback: result.callback, callbackSearch: result.callbackSearch };
  }
  return {};
}

const baseUrl = url({ base: Api.url, path: `/${Api.version}/paymentLink/payment` });
const relativeBaseUrl = '/pl';

const PAYER_PAY_VALUES = ['1', 'true', 'yes'];

export default function InvoiceScreen(): JSX.Element {
  const { translate, translateError } = useSettingsContext();
  const { getPaymentRecipient } = usePaymentRoutes();
  const { navigate } = useNavigation();

  const recipientFieldRef = useRef<HTMLInputElement>(null);
  const paymentGeneration = useRef(0);
  const paymentResult = useRef<PaymentResult | null>(null);
  const reactId = useId();
  const payeeLabelId = `invoice-payee-${reactId.replace(/[^A-Za-z0-9_-]/g, '')}`;
  const payeeErrorId = `${payeeLabelId}-error`;

  const [urlParams, setUrlParams] = useSearchParams();
  const [currency, setCurrency] = useState<string>();
  const [callback, setCallback] = useState<string>();
  const [callbackSearch, setCallbackSearch] = useState<string>();
  const [errorPayment, setErrorPayment] = useState<string>();
  const [errorRecipient, setErrorRecipient] = useState<string>();
  const [isLoadingPayment, setIsLoadingPayment] = useState(false);
  const [isLoadingRecipient, setIsLoadingRecipient] = useState(false);
  const [validatedRecipient, setValidatedRecipient] = useState<string>();

  const recipientFromUrl = urlParams.get('recipient');
  const payParam = urlParams.get('pay');
  const isPayerMode = payParam != null && PAYER_PAY_VALUES.includes(payParam.trim().toLowerCase());
  // Printed QR: payee is information, not an input — show text instead of a disabled field.
  const isPayeeFromUrl = isPayerMode && !!recipientFromUrl;
  const recipientLabel = translate('screens/payment', isPayerMode ? 'Payee' : 'Recipient');

  const {
    watch,
    control,
    setValue,
    resetField,
    formState: { errors, isValid },
  } = useForm<FormData>({
    mode: 'onTouched',
  });

  const data = useDebounce(watch(), 500);
  const liveRecipient = watch('recipient');
  const liveInvoiceId = watch('invoiceId');
  const liveAmount = watch('amount');
  const liveFormRef = useRef({ recipient: liveRecipient, invoiceId: liveInvoiceId, amount: liveAmount });
  liveFormRef.current = { recipient: liveRecipient, invoiceId: liveInvoiceId, amount: liveAmount };

  useEffect(() => {
    const recipient = urlParams.get('recipient');
    if (recipient) setValue('recipient', recipient);
    if (!isPayerMode) setUrlParams(new URLSearchParams());
    setTimeout(() => recipientFieldRef.current?.focus(), 200);
  }, []);

  useEffect(() => {
    setValidatedRecipient(undefined);
    setErrorRecipient(undefined);
    setErrorPayment(undefined);
    setCallback(undefined);
    setCallbackSearch(undefined);
    setCurrency(undefined);
    resetField('invoiceId');
    resetField('amount');
  }, [data?.recipient]);

  useEffect(() => {
    if (data?.recipient) validateRecipient(data.recipient);
  }, [data?.recipient]);

  useEffect(() => {
    if (validatedRecipient && validatedRecipient === data?.recipient && data.invoiceId && data.amount)
      validatePayment(data);
  }, [data?.recipient, data?.invoiceId, data?.amount, validatedRecipient]);

  useEffect(() => {
    // useDebounce does not emit when the form returns to the last emitted values,
    // so a detour back to them never re-runs payment validation. Put that result back.
    const view = paymentView(paymentResult.current, paymentFormKey(liveRecipient, liveInvoiceId, liveAmount));
    setCallback(view.callback);
    setCallbackSearch(view.callbackSearch);
    setErrorPayment(view.error);
    setIsLoadingPayment(false);
  }, [liveRecipient, liveInvoiceId, liveAmount]);

  async function validateRecipient(recipient: string) {
    setValidatedRecipient(undefined);
    setErrorRecipient(undefined);
    setErrorPayment(undefined);
    setCurrency(undefined);
    setIsLoadingRecipient(true);

    getPaymentRecipient(recipient)
      .then(({ currency }) => {
        setErrorRecipient(undefined);
        setCurrency(currency.name);
        setValidatedRecipient(recipient);
      })
      .catch((error: ApiError) => {
        if (error.statusCode === 404) {
          setErrorRecipient(recipient);
        } else {
          setErrorPayment(error.message ?? 'Unknown Error');
        }
      })
      .finally(() => setIsLoadingRecipient(false));
  }

  async function validatePayment(data: FormData) {
    const generation = ++paymentGeneration.current;
    const requestKey = paymentFormKey(data.recipient, data.invoiceId, data.amount);
    // These values are being checked again. Drop the remembered result first so a
    // rejection cannot be put back by the live restore of that same key.
    if (paymentResult.current !== null && paymentResult.current.key === requestKey) {
      paymentResult.current = null;
    }
    setErrorPayment(undefined);
    setErrorRecipient(undefined);
    setCallback(undefined);
    setCallbackSearch(undefined);
    setIsLoadingPayment(true);

    const searchParams = new URLSearchParams({
      [!isNaN(Number(data.recipient)) ? 'routeId' : 'route']: data.recipient,
      amount: data.amount?.toString(),
      message: data.invoiceId,
      expiryDate: addYears(new Date(), 1).toISOString(),
    });

    const remember = (result: PaymentResult) => {
      if (generation !== paymentGeneration.current) return;
      paymentResult.current = result;
      const live = liveFormRef.current;
      const liveKey = paymentFormKey(live.recipient, live.invoiceId, live.amount);
      if (liveKey !== result.key) return;
      const view = paymentView(result, liveKey);
      setCallback(view.callback);
      setCallbackSearch(view.callbackSearch);
      setErrorPayment(view.error);
    };

    fetchJson(url({ base: baseUrl, params: searchParams }))
      .then((response) => {
        if (response.error) {
          remember({ key: requestKey, kind: 'error', message: response.message ?? 'Unknown Error' });
        } else {
          remember({
            key: requestKey,
            kind: 'link',
            callback: relativeUrl({ path: relativeBaseUrl, params: searchParams }),
            callbackSearch: searchParams.toString(),
          });
        }
      })
      .catch((error: ApiError) => {
        remember({ key: requestKey, kind: 'error', message: error.message ?? 'Unknown Error' });
      })
      .finally(() => {
        if (generation !== paymentGeneration.current) return;
        setIsLoadingPayment(false);
      });
  }

  const rules = Utils.createRules({
    recipient: Validations.Required,
    invoiceId: Validations.Required,
    amount: Validations.Required,
  });

  useLayoutOptions({
    title: translate('screens/payment', isPayerMode ? 'Pay invoice' : 'Create Invoice'),
  });

  return (
    <StyledVerticalStack gap={6} full center>
      {!isPayerMode && (
        <div className="flex flex-col gap-2 w-48 my-3">
          <QrBasic data={url({ path: callback })} isLoading={!callback} showLoadingSkeleton />
          <StyledButton
            label={translate('general/actions', 'Copy Link')}
            onClick={() => copy(url({ path: callback }))}
            color={StyledButtonColor.STURDY_WHITE}
            width={StyledButtonWidth.FULL}
            disabled={!callback}
          />
        </div>
      )}
      <Form control={control} rules={rules} errors={errors} translate={translateError}>
        <StyledVerticalStack gap={6} full center>
          {isPayerMode && (
            <p className="text-dfxGray-800 text-sm">
              {translate(
                'screens/payment',
                'Enter the invoice number and invoice amount exactly as printed on your invoice.',
              )}
            </p>
          )}
          <div className="relative w-full">
            {isPayeeFromUrl ? (
              <Controller
                name="recipient"
                control={control}
                render={({ field }) => (
                  <div
                    role="group"
                    aria-labelledby={payeeLabelId}
                    aria-invalid={!!errorRecipient}
                    aria-describedby={errorRecipient ? payeeErrorId : undefined}
                    aria-busy={isLoadingRecipient}
                    className="w-full text-start"
                  >
                    <p id={payeeLabelId} className="text-sm font-semibold pl-3 text-dfxGray-800">
                      {translate('screens/payment', 'Payee')}
                    </p>
                    <div className="flex flex-row items-center gap-2 pl-3">
                      <p className={`text-base ${errorRecipient ? 'text-dfxRed-100' : 'text-dfxBlue-800'}`}>
                        {field.value ?? recipientFromUrl}
                      </p>
                      {isLoadingRecipient && (
                        <span className="inline-flex" aria-hidden="true">
                          <StyledLoadingSpinner size={SpinnerSize.SM} />
                        </span>
                      )}
                      {validatedRecipient && !isLoadingRecipient && (
                        <span
                          role="img"
                          aria-label={translate('screens/payment', 'Recipient verified')}
                          className="inline-flex"
                        >
                          <DfxIcon icon={IconVariant.CHECK} size={IconSize.MD} color={IconColor.BLUE} />
                        </span>
                      )}
                    </div>
                  </div>
                )}
              />
            ) : (
              <>
                <StyledInput
                  name="recipient"
                  autocomplete="name"
                  label={recipientLabel}
                  placeholder={isPayerMode ? undefined : translate('screens/kyc', 'John Doe')}
                  aria-label={recipientLabel}
                  full
                  smallLabel
                  forceError={!!errorRecipient}
                  loading={isLoadingRecipient}
                  ref={recipientFieldRef}
                />
                {validatedRecipient && (
                  <div className="absolute bottom-[19px] right-5">
                    <span
                      role="img"
                      aria-label={translate('screens/payment', 'Recipient verified')}
                      className="inline-flex"
                    >
                      <DfxIcon icon={IconVariant.CHECK} size={IconSize.MD} color={IconColor.BLUE} />
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
          <StyledInput
            name="invoiceId"
            autocomplete="invoice-id"
            label={translate('screens/payment', isPayerMode ? 'Invoice number' : 'Invoice ID')}
            placeholder={translate('screens/payment', isPayerMode ? 'Invoice number' : 'Invoice ID')}
            full
            smallLabel
            disabled={!validatedRecipient}
          />
          <StyledInput
            type="number"
            name="amount"
            label={translate('screens/payment', isPayerMode ? 'Invoice amount' : 'Amount')}
            placeholder={translate('screens/payment', isPayerMode ? 'Invoice amount' : 'Amount')}
            full
            smallLabel
            prefix={currency}
            disabled={!validatedRecipient}
          />
          <StyledButton
            label={translate('general/actions', isPayerMode ? 'Continue to payment' : 'Open invoice')}
            onClick={() =>
              callback &&
              navigate(
                { pathname: relativeBaseUrl, search: callbackSearch },
                // Allowlist only: never inherit unrelated query (e.g. lightning/merchant hijack).
                { replaceParams: true },
              )
            }
            width={StyledButtonWidth.FULL}
            disabled={!isValid || !callback}
            isLoading={isLoadingPayment}
          />
          {errorRecipient && (
            <p id={payeeErrorId} role="alert" className="text-dfxGray-800 text-sm">
              <Trans
                i18nKey="general/errors.invoice"
                defaults="DFX does not recognize a recipient with the name <strong>{{recipient}}</strong>. This service can only be used for recipients who have an active account with DFX and are activated for the invoicing service. If you wish to register as a recipient with DFX, please contact support at <link>{{supportLink}}</link>."
                values={{ recipient: errorRecipient, supportLink: '' }}
                components={{
                  strong: <strong />,
                  link: <StyledLink label={`app.dfx.swiss/support`} url={url({ path: '/support' })} dark />,
                }}
              />
            </p>
          )}
          {errorPayment && <ErrorHint message={errorPayment} />}
        </StyledVerticalStack>
      </Form>
    </StyledVerticalStack>
  );
}
