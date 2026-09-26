import { ApiError, BankAccount, CreateBankAccount, Utils, Validations, useBankAccountContext } from '@dfx.swiss/react';
import {
  Form,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledInput,
  StyledSpacer,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSettingsContext } from '../../contexts/settings.context';
import { ErrorHint } from '../error-hint';
import { BankAccountFailureKind, bankAccountFailureKind } from './bank-account-create-failure';
import { BankAccountCreateHint } from './bank-account-create-hint';

interface AddBankAccountProps {
  onSubmit: (bankAccount: BankAccount) => void;
  confirmationText?: string;
}

export function AddBankAccount({ onSubmit, confirmationText }: AddBankAccountProps): JSX.Element {
  const { translate, translateError } = useSettingsContext();

  const [error, setError] = useState<string>();
  const [failureKind, setFailureKind] = useState<Exclude<BankAccountFailureKind, 'other'>>();
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
    setFailureKind(undefined);
    setConfirmBankAccount(undefined);

    setIsLoading(true);
    createAccount(newAccount)
      .then(!confirmationText ? onSubmit : setConfirmBankAccount)
      .catch((e: ApiError) => {
        const kind = bankAccountFailureKind(e);
        if (kind === 'other') {
          setError(e.message ?? 'Unknown error');
          return;
        }
        setFailureKind(kind);
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

        {failureKind && (
          <div className="text-left">
            <BankAccountCreateHint kind={failureKind} />
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
