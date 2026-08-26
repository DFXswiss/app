import { useApi, Utils, Validations } from '@dfx.swiss/react';
import {
  DfxIcon,
  Form,
  IconSize,
  IconVariant,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledInput,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ErrorHint } from 'src/components/error-hint';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useAdminGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';

interface FormData {
  buyCryptoId: string;
}

export default function BuyCryptoResetAmlScreen(): JSX.Element {
  useAdminGuard();

  const { translate, translateError } = useSettingsContext();
  const { call } = useApi();

  const [isLoading, setIsLoading] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [awaitConfirm, setAwaitConfirm] = useState(false);
  const [error, setError] = useState<string>();

  const {
    control,
    handleSubmit,
    formState: { isValid, errors },
    reset,
    getValues,
  } = useForm<FormData>({ mode: 'onChange' });

  function onSubmit() {
    setError(undefined);
    setAwaitConfirm(true);
  }

  function onConfirm() {
    const { buyCryptoId } = getValues();
    setIsLoading(true);
    setError(undefined);

    call({
      url: `buyCrypto/${buyCryptoId}/amlCheck`,
      method: 'DELETE',
    })
      .then(() => {
        setAwaitConfirm(false);
        toggleNotification();
        reset();
      })
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }

  function onCancel() {
    setAwaitConfirm(false);
    setError(undefined);
  }

  const toggleNotification = () => {
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 2000);
  };

  const rules = Utils.createRules({
    buyCryptoId: [Validations.Required, Validations.Custom((id) => (!isNaN(Number(id)) ? true : 'pattern'))],
  });

  useLayoutOptions({ title: translate('screens/buy-crypto', 'Reset AML Check') });

  return (
    <Form control={control} rules={rules} errors={errors} onSubmit={handleSubmit(onSubmit)} translate={translateError}>
      <StyledVerticalStack gap={6} full center>
        <StyledInput
          name="buyCryptoId"
          type="text"
          label={translate('screens/buy-crypto', 'BuyCrypto ID')}
          placeholder={translate('screens/buy-crypto', 'Transaction ID')}
          full
          disabled={awaitConfirm}
        />

        {error && (
          <div>
            <ErrorHint message={error} />
          </div>
        )}

        {showNotification ? (
          <p className="flex flex-row gap-1 items-center text-dfxRed-100 font-normal transition-opacity duration-200">
            <DfxIcon icon={IconVariant.CHECK} size={IconSize.SM} />
            {translate('screens/buy-crypto', 'AML check reset successfully')}
          </p>
        ) : awaitConfirm ? (
          <StyledVerticalStack gap={4} full center>
            <p className="text-dfxGray-800 text-sm text-center">
              {translate(
                'screens/buy-crypto',
                'This will delete the FiatOutput and reset the AML check. Are you sure?',
              )}
            </p>
            <StyledButton
              label={translate('general/actions', 'Confirm')}
              onClick={onConfirm}
              width={StyledButtonWidth.FULL}
              color={StyledButtonColor.RED}
              isLoading={isLoading}
            />
            <StyledButton
              label={translate('general/actions', 'Cancel')}
              onClick={onCancel}
              width={StyledButtonWidth.FULL}
              color={StyledButtonColor.STURDY_WHITE}
            />
          </StyledVerticalStack>
        ) : (
          <StyledButton
            type="submit"
            label={translate('screens/buy-crypto', 'Reset AML Check')}
            onClick={handleSubmit(onSubmit)}
            width={StyledButtonWidth.FULL}
            disabled={!isValid}
            isLoading={isLoading}
          />
        )}
      </StyledVerticalStack>
    </Form>
  );
}
