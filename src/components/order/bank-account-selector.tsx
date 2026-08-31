import { BankAccount, useBankAccount, useBankAccountContext, Utils, Validations } from '@dfx.swiss/react';
import { StyledModalButton, StyledVerticalStack } from '@dfx.swiss/react-components';
import React, { useEffect, useRef, useState } from 'react';
import { AddBankAccount } from 'src/components/payment/add-bank-account';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useWindowContext } from 'src/contexts/window.context';
import { useAppParams } from 'src/hooks/app-params.hook';
import { blankedAddress } from 'src/util/utils';
import ActionableList from '../actionable-list';
import { Modal } from '../modal';

interface BankAccountSelectorProps {
  value?: BankAccount;
  onChange: (account: BankAccount) => void;
  placeholder: string;
  isModalOpen: boolean;
  onModalToggle: (isOpen: boolean) => void;
  className?: string;
}

export const BankAccountSelector: React.FC<BankAccountSelectorProps> = ({
  value,
  onChange,
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

  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const requestedCreateIbanRef = useRef<string>();
  const bankAccountLiveRef = useRef(bankAccount);
  const mountedRef = useRef(true);
  bankAccountLiveRef.current = bankAccount;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!bankAccounts) return;

    const fromParam = bankAccount ? getAccount(bankAccounts, bankAccount) : undefined;
    const fallback =
      bankAccounts.find((a) => a.default) ?? (bankAccounts.length === 1 ? bankAccounts[0] : undefined);
    const account = fromParam ?? (bankAccount ? undefined : fallback);

    if (account) {
      if (bankAccount) {
        if (value?.id !== account.id) onChange(account);
      } else if (!value) {
        onChange(account);
      }
      return;
    }

    if (
      bankAccount &&
      !isCreatingAccount &&
      requestedCreateIbanRef.current !== bankAccount &&
      Validations.Iban(allowedCountries).validate(bankAccount) === true
    ) {
      const requestedIban = bankAccount;
      requestedCreateIbanRef.current = requestedIban;
      setIsCreatingAccount(true);
      createAccount({ iban: requestedIban })
        .then((b) => {
          if (!mountedRef.current || bankAccountLiveRef.current !== requestedIban) return;
          onChange(b);
        })
        .catch(() => undefined)
        .finally(() => {
          if (mountedRef.current) setIsCreatingAccount(false);
        });
    }
  }, [bankAccount, getAccount, bankAccounts, allowedCountries, value, onChange, isCreatingAccount, createAccount]);

  return (
    <>
      <StyledModalButton
        onClick={() => onModalToggle(true)}
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
                  onChange(account);
                  onModalToggle(false);
                },
              };
            })}
          />

          <AddBankAccount
            onSubmit={(account) => {
              onChange(account);
              onModalToggle(false);
            }}
          />
        </StyledVerticalStack>
      </Modal>
    </>
  );
};
