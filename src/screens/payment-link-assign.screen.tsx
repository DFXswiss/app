import { ApiError, Utils, Validations, hasPaymentQuote } from '@dfx.swiss/react';
import { Form, StyledButton, StyledButtonWidth, StyledInput, StyledVerticalStack } from '@dfx.swiss/react-components';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ErrorHint } from 'src/components/error-hint';
import { usePaymentLinkContext } from 'src/contexts/payment-link.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';

interface FormData {
  publicName: string;
}

export default function PaymentLinkAssignScreen(): JSX.Element {
  const { translate, translateError } = useSettingsContext();
  const { payRequest, assignLink } = usePaymentLinkContext();
  const { navigate } = useNavigation();

  useLayoutOptions({ backButton: false, smallMenu: true });

  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!payRequest) {
      navigate('/');
    } else if (hasPaymentQuote(payRequest) || payRequest.statusCode !== 400) {
      navigate('/pl');
    }
  }, [payRequest]);

  function handleAssign(data: FormData): void {
    if (!payRequest?.externalId || !data.publicName) return;

    setIsAssigning(true);
    assignLink(payRequest.externalId, data.publicName)
      .catch((error: ApiError) => setError(error.message ?? 'Unknown error'))
      .finally(() => setIsAssigning(false));
  }

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormData>({
    mode: 'onTouched',
  });

  const rules = Utils.createRules({
    publicName: [Validations.Required],
  });

  return (
    <>
      <h2 className="ml-1.5 mt-2 mb-1.5 text-dfxGray-700 align-left flex">
        {translate('screens/payment', "Assign payment link '{{id}}'", { id: payRequest?.externalId ?? 'undefined' })}
      </h2>

      <Form
        control={control}
        rules={rules}
        onSubmit={handleSubmit(handleAssign)}
        errors={errors}
        translate={translateError}
      >
        <StyledVerticalStack gap={6} full>
          <StyledInput
            name="publicName"
            label={translate('screens/kyc', 'Public name')}
            smallLabel
            placeholder={translate('screens/kyc', 'My organization')}
            full
          />
          <StyledButton
            type="submit"
            label={translate('screens/payment', 'Assign')}
            onClick={handleSubmit(handleAssign)}
            width={StyledButtonWidth.FULL}
            isLoading={isAssigning}
            disabled={!isValid}
          />
          {error && <ErrorHint message={error} />}
        </StyledVerticalStack>
      </Form>
    </>
  );
}
