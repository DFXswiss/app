import { Country, Utils, Validations } from '@dfx.swiss/react';
import {
  Form,
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledLoadingSpinner,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useParams } from 'react-router-dom';
import { ErrorHint } from 'src/components/error-hint';
import { RefundCreditorFields } from 'src/components/refund/refund-creditor-fields';
import { RefundDataTable } from 'src/components/refund/refund-data-table';
import { useLayoutContext } from 'src/contexts/layout.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { ChargebackBlockReason } from 'src/dto/chargeback.dto';
import { TransactionRefundData, useCompliance } from 'src/hooks/compliance.hook';
import { useComplianceGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { isPendingChargebackNavState, mapRefundApiError, PendingChargebackNavState } from 'src/util/refund-error';
import { ZipValidation } from 'src/util/validation-rules';

interface FormData {
  iban: string;
  creditorName: string;
  creditorStreet: string;
  creditorHouseNumber: string;
  creditorZip: string;
  creditorCity: string;
  creditorCountry: Country;
}

function formatError(e: unknown, translate: (ns: string, key: string) => string): string {
  const raw = e instanceof Error ? e.message : 'Unknown error';
  const mapped = mapRefundApiError(raw);
  // Prefer translated compliance copy when we rewrote the message; fall back to raw API text.
  if (mapped !== raw.trim()) {
    return translate('screens/compliance', mapped);
  }
  return raw;
}

export default function ComplianceBankTxReturnScreen(): JSX.Element {
  useComplianceGuard();

  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { translate, translateError, allowedCountries } = useSettingsContext();
  const { getTransactionRefundData, chargebackTransaction } = useCompliance();
  const { goBack } = useNavigation();
  const { rootRef } = useLayoutContext();

  const pendingContext = useMemo((): PendingChargebackNavState | undefined => {
    const state = location.state as { pendingChargeback?: unknown } | null;
    if (state?.pendingChargeback && isPendingChargebackNavState(state.pendingChargeback)) {
      return state.pendingChargeback;
    }
    return undefined;
  }, [location.state]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [refundData, setRefundData] = useState<TransactionRefundData>();
  const [success, setSuccess] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { isValid, errors },
    setValue,
  } = useForm<FormData>({ mode: 'onTouched' });

  useEffect(() => {
    if (id) {
      loadRefundData(+id);
    }
  }, [id]);

  async function loadRefundData(transactionId: number) {
    setIsLoading(true);
    setError(undefined);

    try {
      const data = await getTransactionRefundData(transactionId);
      setRefundData(data);

      if (data.refundTarget) setValue('iban', data.refundTarget);
      if (data.bankDetails) {
        if (data.bankDetails.name) setValue('creditorName', data.bankDetails.name);
        if (data.bankDetails.address) setValue('creditorStreet', data.bankDetails.address);
        if (data.bankDetails.houseNumber) setValue('creditorHouseNumber', data.bankDetails.houseNumber);
        if (data.bankDetails.zip) setValue('creditorZip', data.bankDetails.zip);
        if (data.bankDetails.city) setValue('creditorCity', data.bankDetails.city);
        if (data.bankDetails.country) {
          const country = allowedCountries.find((c) => c.symbol === data.bankDetails?.country);
          if (country) setValue('creditorCountry', country);
        }
      }
    } catch (e: unknown) {
      setError(formatError(e, translate));
    } finally {
      setIsLoading(false);
    }
  }

  async function onSubmit(formData: FormData) {
    if (!id) return;

    setIsSubmitting(true);
    setError(undefined);

    try {
      await chargebackTransaction(+id, {
        refundTarget: formData.iban,
        creditorData: {
          name: formData.creditorName,
          address: formData.creditorStreet,
          houseNumber: formData.creditorHouseNumber || undefined,
          zip: formData.creditorZip,
          city: formData.creditorCity,
          country: formData.creditorCountry.symbol,
        },
      });
      setSuccess(true);
    } catch (e: unknown) {
      setError(formatError(e, translate));
    } finally {
      setIsSubmitting(false);
    }
  }

  const rules = Utils.createRules({
    iban: Validations.Required,
    creditorName: Validations.Required,
    creditorStreet: Validations.Required,
    creditorZip: ZipValidation,
    creditorCity: Validations.Required,
    creditorCountry: Validations.Required,
  });

  useLayoutOptions({ title: translate('screens/compliance', 'Bank Transaction Return') });

  const hasNameMismatch = pendingContext?.blockReasons.includes(ChargebackBlockReason.NAME_MISMATCH);
  // Prefill already happened from API bankDetails; show context when we came from the pending list
  // or when the API returned creditor-style bank details after a user refund request.
  const showPendingBanner =
    pendingContext != null || (refundData?.bankDetails?.name != null && refundData.bankDetails.name.trim() !== '');

  if (success) {
    return (
      <StyledVerticalStack gap={6} full center>
        <div className="text-center">
          <h2 className="text-dfxBlue-800 text-xl font-semibold mb-4">
            {translate('screens/compliance', 'Return initiated successfully')}
          </h2>
          <p className="text-dfxGray-700 mb-6">
            {translate('screens/compliance', 'The bank transaction return has been initiated.')}
          </p>
          <StyledButton label={translate('general/actions', 'Back')} onClick={goBack} width={StyledButtonWidth.MD} />
        </div>
      </StyledVerticalStack>
    );
  }

  if (isLoading) {
    return <StyledLoadingSpinner size={SpinnerSize.LG} />;
  }

  if (!refundData) {
    return (
      <StyledVerticalStack gap={6} full center>
        {error && <ErrorHint message={error} />}
        <StyledButton label={translate('general/actions', 'Back')} onClick={goBack} width={StyledButtonWidth.MD} />
      </StyledVerticalStack>
    );
  }

  return (
    <StyledVerticalStack gap={6} full>
      {showPendingBanner && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            hasNameMismatch
              ? 'border-dfxYellow-500 bg-dfxYellow-500/10 text-dfxBlue-800'
              : 'border-dfxGray-400 bg-dfxGray-300/40 text-dfxBlue-800'
          }`}
          data-testid="pending-refund-banner"
        >
          <p className="font-semibold mb-1">{translate('screens/compliance', 'Waiting for manual approval')}</p>
          <p className="mb-2">
            {translate(
              'screens/compliance',
              'Customer refund request — review the details and approve to release the payout.',
            )}
          </p>
          {hasNameMismatch && (
            <p className="mb-2 text-primary-red font-medium">
              {translate(
                'screens/compliance',
                'Name mismatch: the creditor name differs from the KYC name. Confirm the recipient before approving.',
              )}
            </p>
          )}
          {(pendingContext?.verifiedName ||
            pendingContext?.completeName ||
            pendingContext?.creditorName ||
            refundData.bankDetails?.name) && (
            <div className="flex flex-col gap-1 text-xs mt-2">
              {pendingContext?.verifiedName != null && (
                <span>
                  <span className="text-dfxGray-700">{translate('screens/compliance', 'KYC verified name')}: </span>
                  {pendingContext.verifiedName}
                </span>
              )}
              {pendingContext?.completeName != null && (
                <span>
                  <span className="text-dfxGray-700">{translate('screens/compliance', 'Complete name')}: </span>
                  {pendingContext.completeName}
                </span>
              )}
              <span>
                <span className="text-dfxGray-700">{translate('screens/compliance', 'Creditor name')}: </span>
                {pendingContext?.creditorName ?? refundData.bankDetails?.name ?? '-'}
              </span>
              {(pendingContext?.chargebackAmount != null || refundData.refundAmount != null) && (
                <span>
                  <span className="text-dfxGray-700">
                    {translate('screens/compliance', 'Requested chargeback amount')}:{' '}
                  </span>
                  {pendingContext?.chargebackAmount ?? refundData.refundAmount}{' '}
                  {pendingContext?.chargebackAsset ?? refundData.refundAsset?.name ?? ''}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <RefundDataTable refundData={refundData} />

      <Form
        control={control}
        rules={rules}
        errors={errors}
        onSubmit={handleSubmit(onSubmit)}
        translate={translateError}
      >
        <StyledVerticalStack gap={6} full>
          <RefundCreditorFields rootRef={rootRef} control={control} rules={rules} errors={errors} />

          {error && (
            <div>
              <ErrorHint message={error} />
            </div>
          )}

          <StyledButton
            type="submit"
            label={translate('general/actions', 'Confirm refund')}
            onClick={handleSubmit(onSubmit)}
            width={StyledButtonWidth.FULL}
            disabled={!isValid}
            isLoading={isSubmitting}
          />

          <StyledButton
            label={translate('general/actions', 'Cancel')}
            onClick={goBack}
            width={StyledButtonWidth.FULL}
            color={StyledButtonColor.WHITE}
          />
        </StyledVerticalStack>
      </Form>
    </StyledVerticalStack>
  );
}
