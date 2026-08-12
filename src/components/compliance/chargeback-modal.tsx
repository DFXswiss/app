import { Country, Utils, Validations } from '@dfx.swiss/react';
import {
  Form,
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledHorizontalStack,
  StyledInput,
  StyledLoadingSpinner,
  StyledSearchDropdown,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ErrorHint } from 'src/components/error-hint';
import { Modal } from 'src/components/modal';
import { RefundDataTable } from 'src/components/refund/refund-data-table';
import { useLayoutContext } from 'src/contexts/layout.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { TransactionRefundData, useCompliance } from 'src/hooks/compliance.hook';
import { mapRefundApiError } from 'src/util/refund-error';
import { ZipValidation } from 'src/util/validation-rules';

interface ChargebackModalProps {
  readonly isOpen: boolean;
  readonly transactionId: number | undefined;
  readonly transactionType?: string;
  readonly sourceType?: string;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
}

interface ChargebackFormData {
  iban: string;
  refundAddress: string;
  creditorName: string;
  creditorAddress: string;
  creditorZip: string;
  creditorCity: string;
  creditorCountry: Country;
}

type RefundMode = 'bank' | 'crypto' | 'card';

function getRefundMode(transactionType?: string, sourceType?: string): RefundMode {
  if (transactionType === 'BuyFiat') return 'crypto';
  if (sourceType === 'CryptoInput') return 'crypto';
  if (sourceType === 'CheckoutTx') return 'card';
  return 'bank';
}

export function ChargebackModal({
  isOpen,
  transactionId,
  transactionType,
  sourceType,
  onClose,
  onSuccess,
}: ChargebackModalProps): JSX.Element {
  const { translate, translateError, allowedCountries } = useSettingsContext();
  const { getTransactionRefundData, chargebackTransaction } = useCompliance();
  const { rootRef } = useLayoutContext();

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [refundData, setRefundData] = useState<TransactionRefundData>();
  const [manualAmount, setManualAmount] = useState<string>('');

  const refundMode = useMemo(() => getRefundMode(transactionType, sourceType), [transactionType, sourceType]);

  const {
    control,
    handleSubmit,
    formState: { isValid, errors },
    setValue,
    reset,
  } = useForm<ChargebackFormData>({ mode: 'onTouched' });

  useEffect(() => {
    if (isOpen && transactionId) {
      loadRefundData(transactionId);
    }
    if (!isOpen) {
      setRefundData(undefined);
      setError(undefined);
      setManualAmount('');
      reset();
    }
  }, [isOpen, transactionId]);

  async function loadRefundData(txId: number): Promise<void> {
    setIsLoading(true);
    setError(undefined);

    try {
      const data = await getTransactionRefundData(txId);
      setRefundData(data);

      if (refundMode === 'bank') {
        if (data.refundTarget) setValue('iban', data.refundTarget);
        if (data.bankDetails) {
          if (data.bankDetails.name) setValue('creditorName', data.bankDetails.name);
          const address = [data.bankDetails.address, data.bankDetails.houseNumber].filter(Boolean).join(' ');
          if (address) setValue('creditorAddress', address);
          if (data.bankDetails.zip) setValue('creditorZip', data.bankDetails.zip);
          if (data.bankDetails.city) setValue('creditorCity', data.bankDetails.city);
          if (data.bankDetails.country) {
            const country = allowedCountries.find((c) => c.symbol === data.bankDetails?.country);
            if (country) setValue('creditorCountry', country);
          }
        }
      } else if (refundMode === 'crypto') {
        if (data.refundTarget) setValue('refundAddress', data.refundTarget);
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Failed to load refund data';
      const mapped = mapRefundApiError(raw);
      setError(mapped !== raw.trim() ? translate('screens/compliance', mapped) : raw);
    } finally {
      setIsLoading(false);
    }
  }

  async function onSubmit(formData: ChargebackFormData): Promise<void> {
    if (!transactionId || !refundData) return;

    setIsSubmitting(true);
    setError(undefined);

    const parsedAmount = manualAmount ? parseFloat(manualAmount) : undefined;
    if (parsedAmount != null && (parsedAmount <= 0 || parsedAmount > refundData.inputAmount)) return;

    try {
      await chargebackTransaction(transactionId, {
        refundTarget:
          refundMode === 'bank' ? formData.iban : refundMode === 'crypto' ? formData.refundAddress : undefined,
        creditorData:
          refundMode === 'bank'
            ? {
                name: formData.creditorName,
                address: formData.creditorAddress,
                zip: formData.creditorZip,
                city: formData.creditorCity,
                country: formData.creditorCountry.symbol,
              }
            : undefined,
        chargebackAmount: parsedAmount,
      });
      onSuccess();
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Chargeback failed';
      const mapped = mapRefundApiError(raw);
      setError(mapped !== raw.trim() ? translate('screens/compliance', mapped) : raw);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClose(): void {
    reset();
    setError(undefined);
    setManualAmount('');
    onClose();
  }

  const bankRules = Utils.createRules({
    iban: Validations.Required,
    creditorName: Validations.Required,
    creditorAddress: Validations.Required,
    creditorZip: ZipValidation,
    creditorCity: Validations.Required,
    creditorCountry: Validations.Required,
  });

  const cryptoRules = Utils.createRules({
    refundAddress: Validations.Required,
  });

  const rules = refundMode === 'bank' ? bankRules : refundMode === 'crypto' ? cryptoRules : {};

  if (!isOpen) return <></>;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} variant="dialog">
      <div className="bg-white rounded-lg shadow-sm p-6 max-w-lg mx-auto w-full">
        <h2 className="text-lg font-semibold text-dfxBlue-800 mb-4 text-left">
          {translate('screens/payment', 'Transaction refund')}
        </h2>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <StyledLoadingSpinner size={SpinnerSize.LG} />
          </div>
        ) : !refundData ? (
          <StyledVerticalStack gap={4} full>
            {error && <ErrorHint message={error} />}
            <StyledButton
              label={translate('general/actions', 'Close')}
              onClick={handleClose}
              width={StyledButtonWidth.FULL}
              color={StyledButtonColor.STURDY_WHITE}
            />
          </StyledVerticalStack>
        ) : (
          <StyledVerticalStack gap={4} full>
            <RefundDataTable refundData={refundData} />

            <Form
              control={control}
              rules={rules}
              errors={errors}
              onSubmit={handleSubmit(onSubmit)}
              translate={translateError}
            >
              <StyledVerticalStack gap={4} full>
                {refundMode === 'bank' && (
                  <>
                    <StyledInput
                      control={control}
                      rules={bankRules?.iban}
                      name="iban"
                      label={translate('screens/payment', 'Chargeback IBAN')}
                      placeholder="CH..."
                      full
                      smallLabel
                    />
                    <StyledInput
                      control={control}
                      rules={bankRules?.creditorName}
                      name="creditorName"
                      label={translate('screens/kyc', 'Name')}
                      placeholder={translate('screens/kyc', 'John Doe')}
                      full
                      smallLabel
                    />
                    <StyledInput
                      control={control}
                      rules={bankRules?.creditorAddress}
                      name="creditorAddress"
                      label={translate('screens/kyc', 'Street') + ' / ' + translate('screens/kyc', 'House nr.')}
                      placeholder="Musterstrasse 1"
                      full
                      smallLabel
                    />
                    <StyledHorizontalStack gap={2}>
                      <StyledInput
                        control={control}
                        rules={bankRules?.creditorZip}
                        name="creditorZip"
                        label={translate('screens/kyc', 'ZIP code')}
                        placeholder="10115"
                        small
                        smallLabel
                      />
                      <StyledInput
                        control={control}
                        rules={bankRules?.creditorCity}
                        name="creditorCity"
                        label={translate('screens/kyc', 'City')}
                        placeholder={translate('screens/kyc', 'City')}
                        full
                        smallLabel
                      />
                    </StyledHorizontalStack>
                    <StyledSearchDropdown<Country>
                      control={control}
                      rules={bankRules?.creditorCountry}
                      rootRef={rootRef}
                      name="creditorCountry"
                      label={translate('screens/kyc', 'Country')}
                      placeholder={translate('general/actions', 'Select') + '...'}
                      items={allowedCountries ?? []}
                      labelFunc={(item) => item.name}
                      filterFunc={(i, s) =>
                        !s || [i.name, i.symbol].some((w) => w.toLowerCase().includes(s.toLowerCase()))
                      }
                      matchFunc={(i, s) => i.name.toLowerCase() === s?.toLowerCase()}
                      full
                      smallLabel
                    />
                  </>
                )}

                {refundMode === 'crypto' && (
                  <StyledInput
                    control={control}
                    rules={cryptoRules?.refundAddress}
                    name="refundAddress"
                    label="Refund address"
                    placeholder="0x..."
                    full
                    smallLabel
                  />
                )}

                {refundMode === 'card' && (
                  <p className="text-sm text-dfxBlue-800">Refund will be processed back to the original card.</p>
                )}

                <div>
                  <label className="block text-sm text-dfxBlue-800 mb-1">Manual refund amount (optional)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={manualAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || /^\d*\.?\d*$/.test(val)) setManualAmount(val);
                    }}
                    placeholder={`${refundData.refundAmount ?? ''} ${refundData.refundAsset?.name ?? ''}`}
                    className={`w-full px-3 py-2 text-sm text-dfxBlue-800 border rounded focus:outline-none ${
                      manualAmount !== '' &&
                      (parseFloat(manualAmount) <= 0 || parseFloat(manualAmount) > refundData.inputAmount)
                        ? 'border-primary-red focus:border-primary-red'
                        : 'border-dfxGray-400 focus:border-dfxBlue-800'
                    }`}
                  />
                  {manualAmount !== '' && parseFloat(manualAmount) <= 0 && (
                    <p className="text-xs text-primary-red mt-1">Amount must be greater than 0</p>
                  )}
                  {manualAmount !== '' &&
                    parseFloat(manualAmount) > 0 &&
                    parseFloat(manualAmount) > refundData.inputAmount && (
                      <p className="text-xs text-primary-red mt-1">
                        Amount must not exceed the transaction amount ({refundData.inputAmount}{' '}
                        {refundData.inputAsset?.name})
                      </p>
                    )}
                </div>

                {error && <ErrorHint message={error} />}

                <div className="flex gap-2 w-full">
                  <StyledButton
                    label={translate('general/actions', 'Cancel')}
                    onClick={handleClose}
                    width={StyledButtonWidth.FULL}
                    color={StyledButtonColor.STURDY_WHITE}
                    disabled={isSubmitting}
                  />
                  <StyledButton
                    type="submit"
                    label={translate('general/actions', 'Confirm refund')}
                    onClick={handleSubmit(onSubmit)}
                    width={StyledButtonWidth.FULL}
                    disabled={
                      !isValid ||
                      (manualAmount !== '' &&
                        (parseFloat(manualAmount) <= 0 || parseFloat(manualAmount) > refundData.inputAmount))
                    }
                    isLoading={isSubmitting}
                  />
                </div>
              </StyledVerticalStack>
            </Form>
          </StyledVerticalStack>
        )}
      </div>
    </Modal>
  );
}
