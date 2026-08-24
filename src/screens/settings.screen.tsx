import {
  BankAccount,
  Fiat,
  Language,
  PhoneCallStatus,
  PhoneCallTime,
  useBankAccountContext,
  useFiatContext,
  UserAddress,
  useUserContext,
  Utils,
} from '@dfx.swiss/react';
import {
  Form,
  SpinnerSize,
  StyledButton,
  StyledButtonWidth,
  StyledDropdown,
  StyledDropdownMultiChoice,
  StyledLoadingSpinner,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import copy from 'copy-to-clipboard';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Trans } from 'react-i18next';
import ActionableList from 'src/components/actionable-list';
import { ConfirmationOverlay } from 'src/components/overlay/confirmation-overlay';
import { EditBankAccount } from 'src/components/overlay/edit-bank-overlay';
import { EditOverlay } from 'src/components/overlay/edit-overlay';
import { AddBankAccount } from 'src/components/payment/add-bank-account';
import { addressLabel, PhoneCallTimeLabels } from 'src/config/labels';
import { useLayoutContext } from 'src/contexts/layout.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useWalletContext } from 'src/contexts/wallet.context';
import { useWindowContext } from 'src/contexts/window.context';
import { useAnchor } from 'src/hooks/anchor.hook';
import { useUserGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { blankedAddress, sortAddressesByBlockchain } from 'src/util/utils';

interface FormData {
  language: Language;
  currency: Fiat;
  preferredPhoneTimes: PhoneCallTime[];
  acceptCall: boolean;
}

enum OverlayType {
  NONE,
  DELETE_ADDRESS,
  DELETE_ACCOUNT,
  RENAME_ADDRESS,
  EDIT_BANK_ACCOUNT,
  ADD_BANK_ACCOUNT,
  DELETE_BANK_ACCOUNT,
}

const OverlayHeader: { [key in OverlayType]: string } = {
  [OverlayType.NONE]: '',
  [OverlayType.DELETE_ADDRESS]: 'Delete address',
  [OverlayType.DELETE_ACCOUNT]: 'Delete account',
  [OverlayType.RENAME_ADDRESS]: 'Rename address',
  [OverlayType.EDIT_BANK_ACCOUNT]: 'Edit bank account',
  [OverlayType.ADD_BANK_ACCOUNT]: 'Add bank account',
  [OverlayType.DELETE_BANK_ACCOUNT]: 'Delete bank account',
};

export default function SettingsScreen(): JSX.Element {
  const { translate, language, currency, availableLanguages, changeLanguage, changeCurrency } = useSettingsContext();
  const { currencies } = useFiatContext();
  const { user, isUserLoading, userAddresses, updateCallSettings } = useUserContext();
  const { width } = useWindowContext();
  const { navigate } = useNavigation();
  const { rootRef } = useLayoutContext();
  const { bankAccounts, updateAccount, isLoading: isLoadingBankAccounts } = useBankAccountContext();

  const verificationCallRef = useRef<HTMLHeadingElement>(null);
  useAnchor('call', verificationCallRef, !isUserLoading);

  const [overlayData, setOverlayData] = useState<UserAddress | BankAccount>();
  const [overlayType, setOverlayType] = useState<OverlayType>(OverlayType.NONE);

  useUserGuard('/login');

  const {
    control,
    setValue,
    formState: { errors },
  } = useForm<FormData>();
  const selectedLanguage = useWatch({ control, name: 'language' });
  const selectedCurrency = useWatch({ control, name: 'currency' });
  const selectedPreferredPhoneTimes = useWatch({ control, name: 'preferredPhoneTimes' });
  const acceptCall = useWatch({ control, name: 'acceptCall' });

  useEffect(() => {
    if (language && !selectedLanguage) setValue('language', language);
  }, [language]);

  useEffect(() => {
    if (currency && !selectedCurrency) setValue('currency', currency);
  }, [currency]);

  useEffect(() => {
    if (user?.kyc.preferredPhoneTimes && !selectedPreferredPhoneTimes) {
      setValue('preferredPhoneTimes', user.kyc.preferredPhoneTimes);
    }
  }, [user?.kyc.preferredPhoneTimes]);

  useEffect(() => {
    const value = user?.kyc.phoneCallAccepted;
    if (value != null && acceptCall == null) {
      setValue('acceptCall', value);
    }
  }, [user?.kyc.phoneCallAccepted]);

  useEffect(() => {
    if (selectedLanguage && selectedLanguage?.id !== language?.id) {
      changeLanguage(selectedLanguage);
    }
  }, [selectedLanguage]);

  useEffect(() => {
    if (selectedCurrency && selectedCurrency?.id !== currency?.id) {
      changeCurrency(selectedCurrency);
    }
  }, [selectedCurrency]);

  useEffect(() => {
    if (
      selectedPreferredPhoneTimes &&
      JSON.stringify(selectedPreferredPhoneTimes) !== JSON.stringify(user?.kyc.preferredPhoneTimes)
    ) {
      updateCallSettings(selectedPreferredPhoneTimes);
    }
  }, [selectedPreferredPhoneTimes]);

  useEffect(() => {
    if (acceptCall !== undefined && acceptCall !== user?.kyc.phoneCallAccepted) {
      updateCallSettings(undefined, acceptCall);
    }
  }, [acceptCall]);

  function onCloseOverlay(): void {
    setOverlayType(OverlayType.NONE);
    setOverlayData(undefined);
  }

  const title = OverlayHeader[overlayType]
    ? `${translate('general/actions', OverlayHeader[overlayType])}?`
    : translate('screens/settings', 'Settings');

  const activeAddresses = userAddresses.sort(sortAddressesByBlockchain);
  const disabledAddresses = user?.disabledAddresses.filter((a) => !a.isCustody).sort(sortAddressesByBlockchain);
  const addressesList = activeAddresses.concat(disabledAddresses ?? []);

  useLayoutOptions({ title, onBack: overlayType ? () => onCloseOverlay() : undefined });

  return (
    <>
      {overlayType ? (
        <SettingsOverlay type={overlayType} data={overlayData} onClose={onCloseOverlay} />
      ) : (
        <StyledVerticalStack full gap={8}>
          <StyledVerticalStack full gap={4}>
            <Form control={control} errors={errors}>
              <StyledDropdown<Language>
                rootRef={rootRef}
                name="language"
                label={translate('screens/settings', 'Language')}
                smallLabel={true}
                placeholder={translate('general/actions', 'Select') + '...'}
                items={availableLanguages}
                labelFunc={(item) => item.name}
                descriptionFunc={(item) => item.foreignName}
              />
            </Form>

            <Form control={control} errors={errors}>
              <StyledDropdown
                rootRef={rootRef}
                name="currency"
                label={translate('screens/settings', 'Currency')}
                smallLabel={true}
                placeholder={translate('general/actions', 'Select') + '...'}
                items={currencies ?? []}
                labelFunc={(item) => item.name}
              />
            </Form>
          </StyledVerticalStack>

          {isLoadingBankAccounts ? (
            <div className="flex mt-4 w-full justify-center items-center">
              <StyledLoadingSpinner size={SpinnerSize.LG} />
            </div>
          ) : (
            bankAccounts && (
              <StyledVerticalStack full gap={2}>
                <ActionableList
                  label={translate('screens/iban', 'Your Bank Accounts')}
                  addButtonOnClick={() => setOverlayType(OverlayType.ADD_BANK_ACCOUNT)}
                  noItemsHint={true}
                  items={bankAccounts.map((account) => {
                    return {
                      key: account.id,
                      label: account.label ?? `${account.iban.slice(0, 2)} ${account.iban.slice(-4)}`,
                      subLabel: blankedAddress(Utils.formatIban(account.iban) ?? account.iban, { width }),
                      tag: account.default ? translate('screens/settings', 'Default').toUpperCase() : undefined,
                      menuItems: [
                        {
                          label: translate('general/actions', 'Copy'),
                          onClick: () => copy(account.iban),
                          closeOnClick: true,
                        },
                        {
                          label: translate('general/actions', 'Edit'),
                          onClick: () => {
                            setOverlayData(account);
                            setOverlayType(OverlayType.EDIT_BANK_ACCOUNT);
                          },
                        },
                        {
                          label: translate('general/actions', 'Delete'),
                          // onClick: () => updateAccount(account.id, { active: false }),
                          onClick: () => {
                            setOverlayData(account);
                            setOverlayType(OverlayType.DELETE_BANK_ACCOUNT);
                          },
                          closeOnClick: true,
                        },
                      ].concat(
                        !account.default
                          ? {
                              label: translate('general/actions', 'Set default'),
                              onClick: () => updateAccount(account.id, { default: true }),
                              closeOnClick: true,
                            }
                          : [],
                      ),
                    };
                  })}
                />
              </StyledVerticalStack>
            )
          )}

          {!isUserLoading && (
            <ActionableList
              label={translate('screens/settings', 'Your Addresses')}
              addButtonOnClick={() => navigate('/connect')}
              hideItemsText={translate('screens/settings', 'Hide deleted addresses')}
              showItemsText={translate('screens/settings', 'Show deleted addresses')}
              noItemsHint={true}
              items={addressesList.map((address) => {
                const isDisabled = user?.disabledAddresses.some((d) => d.address === address.address) ?? false;

                return {
                  key: address.address,
                  label: address.label ?? address.wallet,
                  subLabel: blankedAddress(address.address, { width }),
                  isDisabled,
                  tag:
                    address.address === user?.activeAddress?.address
                      ? translate('screens/settings', 'Active').toUpperCase()
                      : undefined,
                  menuItems: [
                    {
                      label: translate('general/actions', 'Copy'),
                      onClick: () => copy(address.address),
                      closeOnClick: true,
                    },
                    {
                      label: translate('general/actions', 'Open Explorer'),
                      onClick: () => window.open(address.explorerUrl, '_blank'),
                      closeOnClick: true,
                    },
                    {
                      label: translate('general/actions', 'Rename'),
                      onClick: () => {
                        setOverlayData(address);
                        setOverlayType(OverlayType.RENAME_ADDRESS);
                      },
                      hidden: isDisabled,
                    },
                    {
                      label: translate('general/actions', 'Delete'),
                      onClick: () => {
                        setOverlayData(address);
                        setOverlayType(OverlayType.DELETE_ADDRESS);
                      },
                      hidden: isDisabled,
                    },
                  ],
                };
              })}
            />
          )}

          {!isUserLoading && (
            <StyledVerticalStack full gap={2}>
              <h1
                ref={verificationCallRef}
                className="text-dfxGray-800 font-semibold text-base flex justify-center items-center"
              >
                {translate('screens/settings', 'Verification Call')}
              </h1>

              {user?.kyc.phoneCallStatus === PhoneCallStatus.COMPLETED ? (
                <p className="text-dfxGray-700 text-sm text-center">
                  {translate(
                    'screens/settings',
                    'Your verification call has already been completed. There is nothing left to do.',
                  )}
                </p>
              ) : user?.kyc.phoneCallStatus === PhoneCallStatus.FAILED ? (
                <StyledVerticalStack full gap={4}>
                  <p className="text-dfxGray-700 text-sm text-center">
                    {translate(
                      'screens/settings',
                      'We were unable to reach you by phone. You can request a new call here.',
                    )}
                  </p>
                  <StyledButton
                    width={StyledButtonWidth.FULL}
                    label={translate('screens/settings', 'Request a new call')}
                    onClick={() => navigate('/support/issue?issue-type=VerificationCall&reason=RepeatCall')}
                  />
                </StyledVerticalStack>
              ) : (
                <StyledVerticalStack full gap={4}>
                  <p className="text-dfxGray-700 text-sm text-center">
                    {translate('screens/settings', 'Verification may require a phone call. Should we call you?')}
                  </p>

                  <Form control={control} errors={errors}>
                    <StyledDropdown<boolean>
                      rootRef={rootRef}
                      name="acceptCall"
                      label={translate('screens/settings', 'Phone verification')}
                      smallLabel={true}
                      placeholder={translate('general/actions', 'Select') + '...'}
                      items={[true, false]}
                      labelFunc={(item) =>
                        item
                          ? translate('screens/settings', 'Yes, call me')
                          : translate('screens/settings', "No, don't call me")
                      }
                    />
                  </Form>

                  {acceptCall && (
                    <Form control={control} errors={errors}>
                      <StyledDropdownMultiChoice<PhoneCallTime>
                        rootRef={rootRef}
                        name="preferredPhoneTimes"
                        label={translate('screens/settings', 'Preferred call time')}
                        smallLabel={true}
                        placeholder={translate('general/actions', 'Select') + '...'}
                        items={Object.values(PhoneCallTime)}
                        labelFunc={(item) => translate('screens/settings', PhoneCallTimeLabels[item])}
                      />
                    </Form>
                  )}
                </StyledVerticalStack>
              )}
            </StyledVerticalStack>
          )}

          <StyledVerticalStack full gap={2}>
            <h1 className="text-dfxGray-800 font-semibold text-base flex justify-center items-center">
              {translate('screens/settings', 'Danger Zone')}
            </h1>
            <StyledButton
              width={StyledButtonWidth.FULL}
              label={translate('general/actions', 'Delete account')}
              onClick={() => setOverlayType(OverlayType.DELETE_ACCOUNT)}
            />
          </StyledVerticalStack>
        </StyledVerticalStack>
      )}
    </>
  );
}

interface SettingsOverlayProps {
  type: OverlayType;
  data?: UserAddress | BankAccount;
  onClose: () => void;
}

function SettingsOverlay({ type, data, onClose }: SettingsOverlayProps): JSX.Element {
  const { user } = useUserContext();
  const { width } = useWindowContext();
  const { translate } = useSettingsContext();
  const { setWallet } = useWalletContext();
  const { deleteAddress, deleteAccount, renameAddress } = useUserContext();
  const { updateAccount } = useBankAccountContext();

  switch (type) {
    case OverlayType.DELETE_ADDRESS:
      const formattedAddress = blankedAddress(data ? addressLabel(data as UserAddress) : '', { width });

      return (
        <ConfirmationOverlay
          messageContent={
            <p className="text-dfxBlue-800 mb-2">
              <Trans i18nKey="screens/settings.delete" values={{ address: formattedAddress }}>
                Are you sure you want to delete the address <strong>{formattedAddress}</strong> from your DFX account?
                This action is irreversible.
              </Trans>
            </p>
          }
          cancelLabel={translate('general/actions', 'Cancel')}
          confirmLabel={translate('general/actions', 'Delete')}
          onCancel={onClose}
          onConfirm={async () => {
            if (data) {
              const userAddress = data as UserAddress;
              await deleteAddress(userAddress.address);
              userAddress.address === user?.activeAddress?.address && setWallet();
            }
            onClose();
          }}
        />
      );
    case OverlayType.DELETE_ACCOUNT:
      return (
        <ConfirmationOverlay
          message={translate(
            'screens/settings',
            'Your data will remain on our servers temporarily before permanent deletion. If you have any questions, please contact our support team.',
          )}
          cancelLabel={translate('general/actions', 'Cancel')}
          confirmLabel={translate('general/actions', 'Delete')}
          onCancel={onClose}
          onConfirm={async () => {
            await deleteAccount();
            setWallet();
            onClose();
          }}
        />
      );
    case OverlayType.RENAME_ADDRESS:
      const userAddress = data as UserAddress;
      return (
        <EditOverlay
          label={translate('screens/settings', 'Address name')}
          autocomplete="address-label"
          prefill={userAddress?.label ?? userAddress?.wallet}
          placeholder={translate('screens/settings', 'Address name')}
          onCancel={onClose}
          onEdit={async (result) => {
            if (userAddress) await renameAddress(userAddress.address, result);
            onClose();
          }}
        />
      );
    case OverlayType.EDIT_BANK_ACCOUNT:
      return <EditBankAccount bankAccount={data as BankAccount} onClose={onClose} />;
    case OverlayType.ADD_BANK_ACCOUNT:
      return (
        <AddBankAccount
          onSubmit={(_) => onClose()}
          confirmationText={translate(
            'screens/iban',
            'The bank account has been added, all transactions from this IBAN will now be associated with your account.',
          )}
        />
      );
    case OverlayType.DELETE_BANK_ACCOUNT:
      const bankAccount = data as BankAccount;
      const formattedBankAccount = blankedAddress(Utils.formatIban(bankAccount.iban) ?? bankAccount.iban, { width });

      return (
        <ConfirmationOverlay
          messageContent={
            <p className="text-dfxBlue-800 mb-2">
              <Trans i18nKey="screens/settings.delete_iban" values={{ address: formattedBankAccount }}>
                Are you sure you want to delete the bank account <strong>{formattedBankAccount}</strong> from your DFX
                account?
              </Trans>
            </p>
          }
          cancelLabel={translate('general/actions', 'Cancel')}
          confirmLabel={translate('general/actions', 'Delete')}
          onCancel={onClose}
          onConfirm={async () => {
            await updateAccount(bankAccount.id, { active: false });
            onClose();
          }}
        />
      );
    default:
      return <></>;
  }
}
