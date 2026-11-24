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
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ErrorHint } from 'src/components/error-hint';
import { useLayoutContext } from 'src/contexts/layout.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { usePartnerGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useOnboardingFee } from 'src/hooks/onboarding-fee.hook';
import { ONBOARDING_FEE_API_OFF, formatChf, onboardingFeeFailureMessage } from 'src/util/onboarding-fee.util';

interface AssignFormData {
  address: string;
  amount: number;
}

interface RemoveFormData {
  address: string;
}

// Partner key-account managers assign one of the fixed onboarding fees to a customer wallet and can
// remove it again. The API attributes the customer to the caller's ref as part of the assignment,
// so the screen only asks for the address and the fee; both actions are audited server-side.
export default function PartnerOnboardingFeeScreen(): JSX.Element {
  usePartnerGuard();

  const { translate, translateError } = useSettingsContext();
  const { rootRef } = useLayoutContext();
  const { getOnboardingFeeAmounts, setPartnerOnboardingFee, removePartnerOnboardingFee } = useOnboardingFee();

  const [amounts, setAmounts] = useState<number[]>();
  const [isLoadingAmounts, setIsLoadingAmounts] = useState(true);
  const [amountsError, setAmountsError] = useState<string>();

  const [isSaving, setIsSaving] = useState(false);
  const [assignError, setAssignError] = useState<string>();
  const [assignNotice, setAssignNotice] = useState<string>();
  const [removeError, setRemoveError] = useState<string>();
  const [removeNotice, setRemoveNotice] = useState<string>();
  const [pendingRemove, setPendingRemove] = useState<string>();

  // Sync guard: isSaving only disables the button after re-render; a second click in the same tick
  // must not start another update. mountedRef keeps a late answer from touching a gone screen.
  const savingRef = useRef(false);
  const mountedRef = useRef(true);

  const {
    control: assignControl,
    handleSubmit: handleAssignSubmit,
    watch: watchAssign,
    reset: resetAssign,
    formState: { errors: assignErrors },
  } = useForm<AssignFormData>({
    mode: 'onTouched',
    defaultValues: { address: '' },
  });

  const {
    control: removeControl,
    handleSubmit: handleRemoveSubmit,
    watch: watchRemove,
    reset: resetRemove,
    formState: { errors: removeErrors },
  } = useForm<RemoveFormData>({
    mode: 'onTouched',
    defaultValues: { address: '' },
  });

  // The pickable fees are global; load them once. Assign stays disabled until the list arrived.
  useEffect(() => {
    mountedRef.current = true;
    getOnboardingFeeAmounts()
      .then((loaded) => {
        if (mountedRef.current) setAmounts(loaded);
      })
      .catch((e: unknown) => {
        if (mountedRef.current)
          setAmountsError(failureMessage(e, translate('screens/partner', 'Failed to load the onboarding fee amounts')));
      })
      .finally(() => {
        if (mountedRef.current) setIsLoadingAmounts(false);
      });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Both forms carry default values, so watch returns the string even before the fields mount. The
  // amount starts unset: only a value picked from the loaded list enables Assign.
  const assignAddress = watchAssign('address');
  const assignAmount: number | undefined = watchAssign('amount');
  const removeAddress = watchRemove('address');

  const canAssign = !!assignAddress.trim() && !!amounts && assignAmount !== undefined && !isSaving;
  const canRemove = !!removeAddress.trim();

  // Blank input is rejected here as well as by the disabled button, so a stray submit cannot reach
  // the API with an empty address.
  const addressRule = Validations.Custom((value) => (value && value.trim() ? true : 'required'));

  const assignRules = Utils.createRules({
    address: addressRule,
    amount: Validations.Required,
  });

  const removeRules = Utils.createRules({
    address: addressRule,
  });

  useLayoutOptions({ title: translate('screens/partner', 'Onboarding fee') });

  // The shared helper returns the API-off constant as-is. That text is ours, so it is translated
  // here; real API messages stay verbatim.
  function failureMessage(e: unknown, fallback: string): string {
    const message = onboardingFeeFailureMessage(e, fallback);
    return message === ONBOARDING_FEE_API_OFF ? translate('screens/partner', ONBOARDING_FEE_API_OFF) : message;
  }

  async function handleAssign(data: AssignFormData): Promise<void> {
    if (savingRef.current) return;
    savingRef.current = true;

    setIsSaving(true);
    setAssignError(undefined);
    setAssignNotice(undefined);
    const address = data.address.trim();
    try {
      await setPartnerOnboardingFee({ address, amount: data.amount });
      if (!mountedRef.current) return;
      setAssignNotice(
        translate('screens/partner', 'Onboarding fee of {{amount}} assigned to {{address}}.', {
          amount: formatChf(data.amount),
          address,
        }),
      );
      resetAssign();
    } catch (e: unknown) {
      if (mountedRef.current)
        setAssignError(failureMessage(e, translate('screens/partner', 'Failed to assign the onboarding fee')));
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setIsSaving(false);
    }
  }

  // Ask for confirmation first: removing takes the fee off the customer's account, so it is not a
  // single-click action. The customer stays attributed to the partner's ref.
  function requestRemove(data: RemoveFormData): void {
    setRemoveError(undefined);
    setRemoveNotice(undefined);
    setPendingRemove(data.address.trim());
  }

  function cancelRemove(): void {
    setPendingRemove(undefined);
    setRemoveError(undefined);
  }

  // Only reachable through the Remove button in the inline confirmation.
  async function handleRemove(address: string): Promise<void> {
    if (savingRef.current) return;
    savingRef.current = true;

    setIsSaving(true);
    setRemoveError(undefined);
    setRemoveNotice(undefined);
    try {
      await removePartnerOnboardingFee(address);
      if (!mountedRef.current) return;
      setPendingRemove(undefined);
      setRemoveNotice(translate('screens/partner', 'Onboarding fee of {{address}} removed.', { address }));
      resetRemove();
    } catch (e: unknown) {
      if (mountedRef.current)
        setRemoveError(failureMessage(e, translate('screens/partner', 'Failed to remove the onboarding fee')));
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setIsSaving(false);
    }
  }

  const addressToRemove = pendingRemove;

  return (
    <StyledVerticalStack gap={6} full>
      <p className="text-dfxGray-700">
        {translate(
          'screens/partner',
          'Enter the wallet address of your customer and choose the onboarding fee. The customer is attributed to your referral code.',
        )}
      </p>

      <section className="w-full flex flex-col gap-4">
        <h2 className="text-dfxBlue-800 font-semibold text-base">
          {translate('screens/partner', 'Assign onboarding fee')}
        </h2>
        <Form
          control={assignControl}
          rules={assignRules}
          errors={assignErrors}
          onSubmit={handleAssignSubmit(handleAssign)}
          translate={translateError}
        >
          <StyledVerticalStack gap={4} full>
            <StyledInput name="address" label={translate('screens/partner', 'Customer address')} full smallLabel />

            <StyledDropdown<number>
              rootRef={rootRef}
              name="amount"
              label={translate('screens/partner', 'Onboarding fee')}
              placeholder={translate('screens/partner', 'Select amount')}
              items={amounts ?? []}
              labelFunc={formatChf}
              full
              smallLabel
              disabled={isLoadingAmounts || !!amountsError}
              forceEnable={!!amounts?.length}
            />

            {amountsError && <ErrorHint message={amountsError} />}

            <StyledButton
              type="submit"
              label={translate('screens/partner', 'Assign')}
              onClick={handleAssignSubmit(handleAssign)}
              width={StyledButtonWidth.FULL}
              disabled={!canAssign}
              isLoading={isSaving}
            />

            {assignError && <ErrorHint message={assignError} />}
            {assignNotice && <p className="text-dfxGreen-100">{assignNotice}</p>}
          </StyledVerticalStack>
        </Form>
      </section>

      <section className="w-full flex flex-col gap-4">
        <h2 className="text-dfxBlue-800 font-semibold text-base">
          {translate('screens/partner', 'Remove onboarding fee')}
        </h2>

        {addressToRemove ? (
          <StyledVerticalStack gap={4} full>
            <p className="text-dfxGray-700">
              {translate('screens/partner', 'Remove the onboarding fee of {{address}}?', {
                address: addressToRemove,
              })}
            </p>

            {removeError && <ErrorHint message={removeError} />}

            <StyledButton
              label={translate('general/actions', 'Cancel')}
              onClick={cancelRemove}
              width={StyledButtonWidth.FULL}
              color={StyledButtonColor.WHITE}
              disabled={isSaving}
            />

            <StyledButton
              label={isSaving ? translate('screens/partner', 'Removing…') : translate('screens/partner', 'Remove')}
              onClick={() => handleRemove(addressToRemove)}
              width={StyledButtonWidth.FULL}
              disabled={isSaving}
              isLoading={isSaving}
            />
          </StyledVerticalStack>
        ) : (
          <Form
            control={removeControl}
            rules={removeRules}
            errors={removeErrors}
            onSubmit={handleRemoveSubmit(requestRemove)}
            translate={translateError}
          >
            <StyledVerticalStack gap={4} full>
              <StyledInput name="address" label={translate('screens/partner', 'Customer address')} full smallLabel />

              <StyledButton
                type="submit"
                label={translate('screens/partner', 'Remove')}
                onClick={handleRemoveSubmit(requestRemove)}
                width={StyledButtonWidth.FULL}
                disabled={!canRemove || isSaving}
              />
            </StyledVerticalStack>
          </Form>
        )}

        {removeNotice && <p className="text-dfxGreen-100">{removeNotice}</p>}
      </section>
    </StyledVerticalStack>
  );
}
