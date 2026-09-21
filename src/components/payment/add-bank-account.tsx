import {
  ApiError,
  BankAccount,
  CreateBankAccount,
  SupportIssueType,
  Utils,
  Validations,
  useBankAccountContext,
} from '@dfx.swiss/react';
import {
  Form,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledInfoText,
  StyledInput,
  StyledLink,
  StyledSpacer,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Trans } from 'react-i18next';
import { useSettingsContext } from '../../contexts/settings.context';
import { useNavigation } from '../../hooks/navigation.hook';
import { ErrorHint } from '../error-hint';

interface AddBankAccountProps {
  onSubmit: (bankAccount: BankAccount) => void;
  confirmationText?: string;
}

export function AddBankAccount({ onSubmit, confirmationText }: AddBankAccountProps): JSX.Element {
  const { translate, translateError } = useSettingsContext();
  const { navigate } = useNavigation();

  const [error, setError] = useState<string>();
  const [customError, setCustomError] = useState<React.ReactNode>();
  const [confirmBankAccount, setConfirmBankAccount] = useState<BankAccount>();
  const [isLoading, setIsLoading] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<CreateBankAccount>({ mode: 'onTouched' });
  const { createAccount } = useBankAccountContext();
  const { allowedCountries } = useSettingsContext();

  async function createBankAccount(newAccount: CreateBankAccount): Promise<void> {
    setError(undefined);
    setCustomError(undefined);
    setConfirmBankAccount(undefined);

    setIsLoading(true);
    createAccount(newAccount)
      .then(!confirmationText ? onSubmit : setConfirmBankAccount)
      .catch((e: ApiError) => {
        if (e.statusCode === 400 && e.message?.includes('Multi-account IBAN')) {
          setCustomError(
            <Trans i18nKey="general/errors.iban">
              {`This is a multi-account IBAN and cannot be added as a personal account. Please open a support ticket at `}
              <StyledLink
                label={new URL('support', process.env.REACT_APP_PUBLIC_URL).href}
                onClick={() => navigate(`/support/issue?issue-type=${SupportIssueType.GENERIC_ISSUE}`)}
                dark
              />
              {` and attach the bank transaction confirmation as a PDF.`}
            </Trans>,
          );
        } else if (e.statusCode === 400 && e.message?.includes('KYC only account')) {
          setCustomError(
            <Trans i18nKey="general/errors.ibanKycOnly">
              {`A bank account can only be added once a wallet is linked to this account. `}
              <StyledLink
                label={translate('screens/home', 'Connect your wallet')}
                onClick={() => navigate('/connect', { setRedirect: true })}
                dark
              />
            </Trans>,
          );
        } else {
          setError(e.message ?? 'Unknown error');
        }
      })
      .finally(() => setIsLoading(false));
  }

  const rules = Utils.createRules({
    iban: [Validations.Required, Validations.Iban(allowedCountries)],
  });

  return confirmBankAccount ? (
    <>
      <p className="text-dfxGray-700">{confirmationText}</p>

      <StyledButton
        color={StyledButtonColor.RED}
        label={translate('general/actions', 'OK')}
        onClick={() => onSubmit(confirmBankAccount)}
      />
    </>
  ) : (
    <Form
      control={control}
      rules={rules}
      errors={errors}
      onSubmit={handleSubmit(createBankAccount)}
      translate={translateError}
    >
      <StyledVerticalStack gap={4}>
        <StyledInput
          name="iban"
          autocomplete="iban"
          label={translate('screens/payment', 'IBAN')}
          placeholder="XX XXXX XXXX XXXX XXXX X"
        />
        <StyledInput
          name="label"
          autocomplete="iban-label"
          label={translate('screens/sell', 'Optional - Account Designation')}
          placeholder={translate('screens/sell', 'e.g. Deutsche Bank')}
        />
        <StyledSpacer spacing={-1} />

        {error && (
          <div className="text-center">
            <ErrorHint message={error} />
          </div>
        )}

        {customError && (
          <div className="text-left">
            <StyledInfoText invertedIcon>{customError}</StyledInfoText>
          </div>
        )}

        <StyledButton
          type="submit"
          disabled={!isValid}
          color={StyledButtonColor.RED}
          label={translate('general/actions', 'Add bank account')}
          onClick={handleSubmit(createBankAccount)}
          isLoading={isLoading}
          caps
          width={StyledButtonWidth.FULL}
          className="mb-4"
        />
      </StyledVerticalStack>
    </Form>
  );
}
