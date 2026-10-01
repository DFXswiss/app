import { ApiError, Country, Utils, Validations } from '@dfx.swiss/react';
import {
  DfxIcon,
  Form,
  IconSize,
  IconVariant,
  StyledButton,
  StyledButtonWidth,
  StyledDropdown,
  StyledHorizontalStack,
  StyledInput,
  StyledSearchDropdown,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ErrorHint } from 'src/components/error-hint';
import { useLayoutContext } from 'src/contexts/layout.context';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { buildCamt053Xml } from 'src/util/camt053-builder';
import { todayAsString } from 'src/util/compliance-helpers';
import { useSettingsContext } from '../contexts/settings.context';
import { useAdminGuard } from '../hooks/guard.hook';
import { useGuardedApi } from '../hooks/guarded-api.hook';

enum CreditDebitIndicator {
  CRDT = 'CRDT',
  DBIT = 'DBIT',
}

interface ManualBankTxForm {
  bookingDate: string;
  valueDate: string;
  amount: string;
  currency: string;
  direction: CreditDebitIndicator;
  accountIban: string;
  accountOwner: string;
  accountBank: string;
  name: string;
  street: string;
  houseNumber: string;
  zip: string;
  city: string;
  country: Country;
  iban: string;
  remittanceInfo: string;
}

const CURRENCIES = ['EUR', 'CHF', 'USD'];

export default function SepaManualScreen(): JSX.Element {
  const { translate, translateError, allowedCountries } = useSettingsContext();
  const { call } = useGuardedApi();
  const { rootRef } = useLayoutContext();

  const [isUploading, setIsUploading] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [error, setError] = useState<string>();

  useAdminGuard();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isValid, errors },
  } = useForm<ManualBankTxForm>({
    mode: 'onChange',
    defaultValues: {
      currency: 'EUR',
      direction: CreditDebitIndicator.CRDT,
      bookingDate: todayAsString(),
      valueDate: todayAsString(),
    },
  });

  function onSubmit(data: ManualBankTxForm) {
    setShowNotification(false);
    setError(undefined);

    let xml: string;
    try {
      xml = buildCamt053Xml({ ...data, country: data.country?.symbol });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Secure random UUID generation is unavailable.');
      return;
    }

    const file = new File([xml], 'manual-bank-tx.xml', { type: 'text/xml' });

    const fileData = new FormData();
    fileData.append('files', file);

    setIsUploading(true);
    call({
      url: 'bankTx',
      method: 'POST',
      data: fileData,
      noJson: true,
    })
      .then(() => {
        setIsUploading(false);
        toggleNotification();
        reset();
      })
      .catch((e: ApiError) => {
        setIsUploading(false);
        setError(e.message);
      });
  }

  const toggleNotification = () => {
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 2000);
  };

  const rules = Utils.createRules({
    bookingDate: [Validations.Required],
    valueDate: [Validations.Required],
    amount: [Validations.Required],
    currency: [Validations.Required],
    direction: [Validations.Required],
    accountIban: [Validations.Required, Validations.Iban(allowedCountries)],
    accountOwner: [Validations.Required],
    accountBank: [Validations.Required],
    name: [Validations.Required],
    iban: [Validations.Required, Validations.Iban(allowedCountries)],
    remittanceInfo: [Validations.Required],
  });

  useLayoutOptions({ title: translate('screens/kyc', 'Manual bank transaction') });

  return (
    <Form control={control} rules={rules} errors={errors} onSubmit={handleSubmit(onSubmit)} translate={translateError}>
      <StyledVerticalStack gap={6} full center>
        <StyledVerticalStack gap={2} full>
          <p className="flex flex-row justify-between w-full text-dfxGray-700 text-xs font-semibold uppercase text-start px-3">
            <span>{translate('screens/kyc', 'Transaction details')}</span>
            <span
              className={`flex flex-row gap-1 items-center text-dfxRed-100 font-normal transition-opacity duration-200 ${
                showNotification ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <DfxIcon icon={IconVariant.CHECK} size={IconSize.SM} />
              {translate('screens/kyc', 'Uploaded')}
            </span>
          </p>

          <StyledInput name="bookingDate" type="date" label={translate('screens/kyc', 'Booking date')} full smallLabel />
          <StyledInput name="valueDate" type="date" label={translate('screens/kyc', 'Value date')} full smallLabel />
          <StyledInput name="amount" type="number" label={translate('screens/kyc', 'Amount')} placeholder="0.00" full smallLabel />
          <StyledDropdown
            name="currency"
            label={translate('screens/kyc', 'Currency')}
            items={CURRENCIES}
            labelFunc={(item) => item}
            full
            smallLabel
          />
          <StyledDropdown
            name="direction"
            label={translate('screens/kyc', 'Direction')}
            items={Object.values(CreditDebitIndicator)}
            labelFunc={(item) => (item === CreditDebitIndicator.CRDT ? 'Credit (incoming)' : 'Debit (outgoing)')}
            full
            smallLabel
          />
        </StyledVerticalStack>

        <StyledVerticalStack gap={2} full>
          <p className="w-full text-dfxGray-700 text-xs font-semibold uppercase text-start px-3">
            {translate('screens/kyc', 'Account')}
          </p>

          <StyledInput name="accountOwner" label={translate('screens/kyc', 'Account owner')} placeholder="DFX AG" full smallLabel />
          <StyledInput name="accountIban" label={translate('screens/kyc', 'Account IBAN')} placeholder="CH78 8080 8002 6086 1409 2" full smallLabel />
          <StyledInput name="accountBank" label={translate('screens/kyc', 'Bank name')} placeholder="Raiffeisenbank" full smallLabel />
        </StyledVerticalStack>

        <StyledVerticalStack gap={2} full>
          <p className="w-full text-dfxGray-700 text-xs font-semibold uppercase text-start px-3">
            {translate('screens/kyc', 'Counterparty')}
          </p>

          <StyledInput name="name" autocomplete="name" label={translate('screens/kyc', 'Name')} placeholder={translate('screens/kyc', 'John Doe')} full smallLabel />
          <StyledHorizontalStack gap={2}>
            <StyledInput
              name="street"
              autocomplete="street"
              label={translate('screens/kyc', 'Street')}
              placeholder={translate('screens/kyc', 'Street')}
              full
              smallLabel
            />
            <StyledInput
              name="houseNumber"
              autocomplete="house-number"
              label={translate('screens/kyc', 'House nr.')}
              placeholder="xx"
              small
              smallLabel
            />
          </StyledHorizontalStack>
          <StyledHorizontalStack gap={2}>
            <StyledInput
              name="zip"
              autocomplete="zip"
              label={translate('screens/kyc', 'ZIP code')}
              placeholder="12345"
              small
              smallLabel
            />
            <StyledInput
              name="city"
              autocomplete="city"
              label={translate('screens/kyc', 'City')}
              placeholder={translate('screens/kyc', 'City')}
              full
              smallLabel
            />
          </StyledHorizontalStack>
          <StyledSearchDropdown<Country>
            rootRef={rootRef}
            name="country"
            autocomplete="country"
            label={translate('screens/kyc', 'Country')}
            placeholder={translate('general/actions', 'Select') + '...'}
            items={allowedCountries}
            labelFunc={(item) => item.name}
            filterFunc={(i, s) => !s || [i.name, i.symbol].some((w) => w.toLowerCase().includes(s.toLowerCase()))}
            matchFunc={(i, s) => i.name.toLowerCase() === s?.toLowerCase()}
            full
            smallLabel
          />
          <StyledInput name="iban" label={translate('screens/kyc', 'IBAN')} placeholder="DE89 3704 0044 0532 0130 00" full smallLabel />
        </StyledVerticalStack>

        <StyledVerticalStack gap={2} full>
          <p className="w-full text-dfxGray-700 text-xs font-semibold uppercase text-start px-3">
            {translate('screens/kyc', 'Payment details')}
          </p>

          <StyledInput
            name="remittanceInfo"
            label={translate('screens/kyc', 'Remittance info')}
            placeholder="XXXX-XXXX-XXXX"
            full
            smallLabel
          />
        </StyledVerticalStack>

        {error && (
          <div>
            <ErrorHint message={error} />
          </div>
        )}

        <StyledButton
          label={translate('general/actions', 'Upload')}
          onClick={handleSubmit(onSubmit)}
          width={StyledButtonWidth.FULL}
          disabled={!isValid}
          isLoading={isUploading}
        />
      </StyledVerticalStack>
    </Form>
  );
}
