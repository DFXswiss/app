import { Utils, Validations } from '@dfx.swiss/react';
import {
  Form,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledDropdown,
  StyledInput,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ErrorHint } from 'src/components/error-hint';
import { PartnerUserCard } from 'src/components/partner/partner-user-card';
import { useLayoutContext } from 'src/contexts/layout.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { PartnerFee, PartnerUserInfo } from 'src/dto/partner.dto';
import { usePartnerGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { usePartner } from 'src/hooks/partner.hook';

interface FormData {
  address: string;
  feeId: string;
}

export default function PartnerOnboardingScreen(): JSX.Element {
  usePartnerGuard();

  const { translate, translateError } = useSettingsContext();
  const { rootRef } = useLayoutContext();
  const { navigate } = useNavigation();
  const { findUserByAddress, getAvailableFees, setOnboarding, removeFee } = usePartner();

  const [lookupLoading, setLookupLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [fees, setFees] = useState<PartnerFee[]>();
  const [feesError, setFeesError] = useState<string>();
  const [target, setTarget] = useState<PartnerUserInfo>();
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  const onBack = useCallback(() => navigate('/partner'), [navigate]);
  useLayoutOptions({ title: 'Set Onboarding Fee', backButton: true, onBack });

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isValid },
  } = useForm<FormData>({ mode: 'onChange', defaultValues: { address: '', feeId: '' } });

  const selectedFeeId = watch('feeId');

  const ensureFeesLoaded = useCallback(async () => {
    if (fees) return;
    try {
      const list = await getAvailableFees();
      setFees(list);
    } catch (e) {
      setFeesError(e instanceof Error ? e.message : 'Failed to load fees');
    }
  }, [fees, getAvailableFees]);

  const onLookup = useCallback(
    async (data: FormData) => {
      setLookupLoading(true);
      setError(undefined);
      setSuccess(undefined);
      setTarget(undefined);
      try {
        const user = await findUserByAddress(data.address);
        setTarget(user);
        await ensureFeesLoaded();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Lookup failed');
      } finally {
        setLookupLoading(false);
      }
    },
    [findUserByAddress, ensureFeesLoaded],
  );

  const onSetFee = useCallback(async () => {
    if (!target || !selectedFeeId) return;
    setSubmitLoading(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      await setOnboarding(target.id, +selectedFeeId);
      setSuccess('Fee assigned, user marked Active, ref updated.');
      const refreshed = await findUserByAddress(watch('address'));
      setTarget(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setSubmitLoading(false);
    }
  }, [target, selectedFeeId, setOnboarding, findUserByAddress, watch]);

  const onRemoveFee = useCallback(async () => {
    if (!target || !selectedFeeId) return;
    setSubmitLoading(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      await removeFee(target.id, +selectedFeeId);
      setSuccess('Fee removed.');
      const refreshed = await findUserByAddress(watch('address'));
      setTarget(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setSubmitLoading(false);
    }
  }, [target, selectedFeeId, removeFee, findUserByAddress, watch]);

  const onReset = useCallback(() => {
    reset();
    setTarget(undefined);
    setError(undefined);
    setSuccess(undefined);
  }, [reset]);

  const rules = Utils.createRules({
    address: Validations.Required,
  });

  const selectedFee = fees?.find((f) => f.id === +selectedFeeId);
  const isFeeAssigned = !!target && !!selectedFee && target.feeIds.includes(selectedFee.id);

  return (
    <Form control={control} rules={rules} errors={errors} translate={translateError}>
      <StyledVerticalStack gap={4} full>
        <StyledInput
          name="address"
          label={translate('screens/payment', 'Blockchain address')}
          placeholder="0x… / bc1… / …"
          full
        />

        <StyledButton
          onClick={handleSubmit(onLookup)}
          label={translate('general/actions', 'Lookup')}
          disabled={!isValid || lookupLoading}
          isLoading={lookupLoading}
          width={StyledButtonWidth.FULL}
        />

        {error && <ErrorHint message={error} />}
        {feesError && <ErrorHint message={feesError} />}

        {target && (
          <>
            <PartnerUserCard user={target} />

            {target.canModify ? (
              <>
                <StyledDropdown<PartnerFee>
                  name="feeId"
                  rootRef={rootRef}
                  label={translate('screens/payment', 'Fee')}
                  placeholder={translate('general/actions', 'Select') + '...'}
                  items={fees ?? []}
                  labelFunc={(f) => f.label}
                  descriptionFunc={(f) => `${f.fixed} CHF fixed · ${(f.rate * 100).toFixed(2)}%`}
                  full
                />

                <div className="flex gap-3">
                  <StyledButton
                    onClick={onSetFee}
                    label={isFeeAssigned ? 'Already assigned' : 'Set Fee + Activate'}
                    disabled={!selectedFeeId || submitLoading || isFeeAssigned}
                    isLoading={submitLoading}
                    width={StyledButtonWidth.FULL}
                  />
                  <StyledButton
                    onClick={onRemoveFee}
                    label="Remove Fee"
                    color={StyledButtonColor.STURDY_WHITE}
                    disabled={!selectedFeeId || submitLoading || !isFeeAssigned}
                    isLoading={submitLoading}
                    width={StyledButtonWidth.FULL}
                  />
                </div>
              </>
            ) : (
              <p className="text-dfxRed-100 text-center text-sm">
                This user is referred by another partner — read-only.
              </p>
            )}

            {success && <p className="text-dfxGray-700 text-center text-sm">{success}</p>}

            <StyledButton
              onClick={onReset}
              label={translate('general/actions', 'Reset')}
              color={StyledButtonColor.STURDY_WHITE}
              width={StyledButtonWidth.FULL}
            />
          </>
        )}
      </StyledVerticalStack>
    </Form>
  );
}
