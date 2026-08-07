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
  StyledInput,
  StyledLink,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import copy from 'copy-to-clipboard';
import { addYears } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
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

const baseUrl = url({ base: Api.url, path: `/${Api.version}/paymentLink/payment` });
const relativeBaseUrl = '/pl';

const PAYER_PAY_VALUES = ['1', 'true', 'yes'];

export default function InvoiceScreen(): JSX.Element {
  const { translate, translateError } = useSettingsContext();
  const { getPaymentRecipient } = usePaymentRoutes();
  const { navigate } = useNavigation();

  const recipientFieldRef = useRef<HTMLInputElement>(null);

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
      .catch((_) => setErrorRecipient(recipient))
      .finally(() => setIsLoadingRecipient(false));
  }

  async function validatePayment(data: FormData) {
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

    fetchJson(url({ base: baseUrl, params: searchParams }))
      .then((response) => {
        if (response.error) {
          setErrorPayment(response.message ?? 'Unknown Error');
        } else {
          setCallback(relativeUrl({ path: relativeBaseUrl, params: searchParams }));
          setCallbackSearch(searchParams.toString());
        }
      })
      .catch((error: ApiError) => setErrorPayment(error.message ?? 'Unknown Error'))
      .finally(() => setIsLoadingPayment(false));
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
          <QrBasic data={url({ path: callback })} isLoading={!callback} />
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
            <StyledInput
              name="recipient"
              autocomplete="name"
              label={translate('screens/payment', isPayerMode ? 'Payee' : 'Recipient')}
              placeholder={isPayerMode ? undefined : translate('screens/kyc', 'John Doe')}
              full
              smallLabel
              forceError={!!errorRecipient}
              loading={isLoadingRecipient}
              disabled={isPayerMode && !!recipientFromUrl}
              ref={recipientFieldRef}
            />
            {validatedRecipient && (
              <div className="absolute bottom-[19px] right-5">
                <DfxIcon icon={IconVariant.CHECK} size={IconSize.MD} color={IconColor.BLUE} />
              </div>
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
                { clearParams: ['recipient', 'pay'] },
              )
            }
            width={StyledButtonWidth.FULL}
            disabled={!isValid || !callback}
            isLoading={isLoadingPayment}
          />
          {errorRecipient && (
            <p className="text-dfxGray-800 text-sm">
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
