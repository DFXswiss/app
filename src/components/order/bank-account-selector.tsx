import { BankAccount, useBankAccount, useBankAccountContext, Utils, Validations } from '@dfx.swiss/react';
import { StyledModalButton, StyledVerticalStack } from '@dfx.swiss/react-components';
import React, { useEffect, useRef, useState } from 'react';
import { AddBankAccount } from 'src/components/payment/add-bank-account';
import { BankAccountFailureKind, bankAccountFailureKind } from 'src/components/payment/bank-account-create-failure';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useWindowContext } from 'src/contexts/window.context';
import { useAppParams } from 'src/hooks/app-params.hook';
import { blankedAddress } from 'src/util/utils';
import ActionableList from '../actionable-list';
import { Modal } from '../modal';

interface BankAccountSelectorProps {
  value?: BankAccount;
  onChange: (account: BankAccount) => void;
  onError?: (message: string, kind: BankAccountFailureKind) => void;
  onCreateStart?: () => void;
  retryToken?: number;
  placeholder: string;
  isModalOpen: boolean;
  onModalToggle: (isOpen: boolean) => void;
  className?: string;
}

export const BankAccountSelector: React.FC<BankAccountSelectorProps> = ({
  value,
  onChange,
  onError,
  onCreateStart,
  retryToken,
  placeholder,
  isModalOpen = false,
  onModalToggle,
  className = '',
}) => {
  const { translate } = useSettingsContext();
  const { allowedCountries } = useSettingsContext();
  const { bankAccounts, createAccount } = useBankAccountContext();
  const { getAccount } = useBankAccount();
  const { bankAccount } = useAppParams();
  const { width } = useWindowContext();

  const [manualRetryToken, setManualRetryToken] = useState(0);
  const requestedCreateIbanRef = useRef<string>();
  const failedCreateIbanRef = useRef<string>();
  const requestGenerationRef = useRef(0);
  const previousRetryTokenRef = useRef(retryToken);
  const mountedRef = useRef(true);
  const liveBankAccountParamRef = useRef(bankAccount);
  const manuallySelectedParamRef = useRef<string>();
  liveBankAccountParamRef.current = bankAccount;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    requestGenerationRef.current += 1;
    requestedCreateIbanRef.current = undefined;
    failedCreateIbanRef.current = undefined;
    manuallySelectedParamRef.current = undefined;
  }, [bankAccount]);

  useEffect(() => {
    if (previousRetryTokenRef.current === retryToken) return;

    previousRetryTokenRef.current = retryToken;
    requestedCreateIbanRef.current = undefined;
    failedCreateIbanRef.current = undefined;
    manuallySelectedParamRef.current = undefined;
  }, [retryToken]);

  useEffect(() => {
    if (!bankAccounts) return;

    const fromParam = bankAccount ? getAccount(bankAccounts, bankAccount) : undefined;
    const fallback = bankAccounts.find((a) => a.default) ?? (bankAccounts.length === 1 ? bankAccounts[0] : undefined);
    const account = fromParam ?? (bankAccount ? undefined : fallback);

    if (account) {
      if (bankAccount) {
        if (manuallySelectedParamRef.current !== bankAccount && value?.id !== account.id) onChange(account);
      } else if (!value) {
        onChange(account);
      }
      return;
    }

    if (
      bankAccount &&
      requestedCreateIbanRef.current !== bankAccount &&
      failedCreateIbanRef.current !== bankAccount &&
      Validations.Iban(allowedCountries).validate(bankAccount) === true
    ) {
      const requestedIban = bankAccount;
      const requestGeneration = ++requestGenerationRef.current;
      requestedCreateIbanRef.current = requestedIban;
      onCreateStart?.();
      createAccount({ iban: requestedIban })
        .then((b) => {
          if (
            !mountedRef.current ||
            requestGenerationRef.current !== requestGeneration ||
            liveBankAccountParamRef.current !== requestedIban
          )
            return;
          onChange(b);
        })
        .catch((e: { statusCode?: number; message?: string }) => {
          if (
            !mountedRef.current ||
            requestGenerationRef.current !== requestGeneration ||
            liveBankAccountParamRef.current !== requestedIban
          )
            return;
          requestedCreateIbanRef.current = undefined;
          failedCreateIbanRef.current = requestedIban;
          onError?.(e.message ?? 'Unknown error', bankAccountFailureKind(e));
        });
    }
  }, [
    bankAccount,
    getAccount,
    bankAccounts,
    allowedCountries,
    value,
    onChange,
    onError,
    onCreateStart,
    retryToken,
    manualRetryToken,
    createAccount,
  ]);

  const handleManualChange = (account: BankAccount) => {
    requestGenerationRef.current += 1;
    manuallySelectedParamRef.current = bankAccount;
    onChange(account);
  };

  const handleOpen = () => {
    if (bankAccount && failedCreateIbanRef.current === bankAccount) {
      requestedCreateIbanRef.current = undefined;
      failedCreateIbanRef.current = undefined;
      manuallySelectedParamRef.current = undefined;
      setManualRetryToken((token) => token + 1);
    }
    onModalToggle(true);
  };

  return (
    <>
      <StyledModalButton
        onClick={handleOpen}
        onBlur={() => undefined}
        placeholder={translate('screens/sell', placeholder)}
        value={Utils.formatIban(value?.iban) ?? undefined}
        description={value?.label}
      />

      <Modal isOpen={isModalOpen} onClose={() => onModalToggle(false)} className={className}>
        <StyledVerticalStack gap={6} center marginX={9}>
          <ActionableList
            items={bankAccounts?.map((account) => {
              return {
                key: account.id,
                label: account.label ?? `${account.iban.slice(0, 2)} ${account.iban.slice(-4)}`,
                subLabel: blankedAddress(Utils.formatIban(account.iban) ?? account.iban, { width }),
                tag: account.default ? translate('screens/settings', 'Default').toUpperCase() : undefined,
                onClick: () => {
                  handleManualChange(account);
                  onModalToggle(false);
                },
              };
            })}
          />

          <AddBankAccount
            onSubmit={(account) => {
              handleManualChange(account);
              onModalToggle(false);
            }}
          />
        </StyledVerticalStack>
      </Modal>
    </>
  );
};
