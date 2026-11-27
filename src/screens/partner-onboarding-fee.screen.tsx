import { Utils, Validations } from '@dfx.swiss/react';
import {
  Form,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledInput,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ErrorHint } from 'src/components/error-hint';
import { useSettingsContext } from 'src/contexts/settings.context';
import { usePartnerGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useOnboardingFee } from 'src/hooks/onboarding-fee.hook';
import {
  ONBOARDING_FEE_API_OFF,
  ONBOARDING_FEE_MAX_AMOUNT,
  ONBOARDING_FEE_MIN_AMOUNT,
  formatChf,
  onboardingFeeFailureMessage,
  parseOnboardingFeeAmount,
} from 'src/util/onboarding-fee.util';
import { formatChf as formatSwissNumber } from 'src/util/utils';

interface AssignFormData {
  address: string;
  // The raw input; parseOnboardingFeeAmount turns it into the number the API receives.
  amount: string;
}

interface RemoveFormData {
  address: string;
}

// Validation key of an amount outside the whole-CHF range. The shared error translator only knows
// the generic keys, so the assign form maps this one to its own sentence that names the range.
const AMOUNT_INVALID = 'onboarding_fee_amount_invalid';

// Partner key-account managers assign an onboarding fee of any whole CHF amount within the API's
// range to a customer wallet and can remove it again. The API attributes the customer to the
// caller's ref as part of the assignment, so the screen only asks for the address and the fee; both
// actions are audited server-side.
export default function PartnerOnboardingFeeScreen(): JSX.Element {
  usePartnerGuard();

  const { translate, translateError } = useSettingsContext();
  const { getOnboardingFeeAmounts, setPartnerOnboardingFee, removePartnerOnboardingFee } = useOnboardingFee();

  const [amounts, setAmounts] = useState<number[]>();
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
    setValue: setAssignValue,
    formState: { errors: assignErrors },
  } = useForm<AssignFormData>({
    mode: 'onTouched',
    defaultValues: { address: '', amount: '' },
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

  // The suggested fees are global; load them once. They only offer quick picks for the input, so
  // Assign does not wait for them and a failed load does not block typing an amount.
  useEffect(() => {
    mountedRef.current = true;
    getOnboardingFeeAmounts()
      .then((loaded) => {
        if (mountedRef.current) setAmounts(loaded);
      })
      .catch((e: unknown) => {
        if (mountedRef.current)
          setAmountsError(failureMessage(e, translate('screens/partner', 'Failed to load the onboarding fee amounts')));
      });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Both forms carry default values, so watch returns the string even before the fields mount. Any
  // whole CHF amount within the API's range enables Assign, whether typed or picked from a suggestion.
  const assignAddress = watchAssign('address');
  const assignAmount = parseOnboardingFeeAmount(watchAssign('amount'));
  const removeAddress = watchRemove('address');

  const canAssign = !!assignAddress.trim() && assignAmount !== undefined && !isSaving;
  const canRemove = !!removeAddress.trim();

  // Blank input is rejected here as well as by the disabled button, so a stray submit cannot reach
  // the API with an empty address.
  const addressRule = Validations.Custom((value) => (value && value.trim() ? true : 'required'));

  const assignRules = Utils.createRules({
    address: addressRule,
    amount: [
      Validations.Required,
      Validations.Custom((value) => (parseOnboardingFeeAmount(value) !== undefined ? true : AMOUNT_INVALID)),
    ],
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

  // The range sentence is ours and carries the bounds, so it is translated here; every other key goes
  // through the shared translator like on the remove form. Both bounds come from the shared constants
  // so the sentence cannot drift from the rule that enforces them.
  function translateAssignError(key: string): string {
    if (key !== AMOUNT_INVALID) return translateError(key);
    const min = formatSwissNumber(ONBOARDING_FEE_MIN_AMOUNT);
    const max = formatSwissNumber(ONBOARDING_FEE_MAX_AMOUNT);
    return translate('screens/partner', 'Enter a whole CHF amount between {{min}} and {{max}}.', { min, max });
  }

  // A suggestion fills the input like typing would, including the validation that clears an error.
  function pickAmount(value: number): void {
    setAssignValue('amount', String(value), { shouldValidate: true, shouldDirty: true, shouldTouch: true });
  }

  async function handleAssign(data: AssignFormData): Promise<void> {
    // The submit only runs after the amount rule passed; the check keeps an unparsed amount from
    // ever reaching the API without asserting the type away.
    const amount = parseOnboardingFeeAmount(data.amount);
    if (savingRef.current || amount === undefined) return;
    savingRef.current = true;

    setIsSaving(true);
    setAssignError(undefined);
    setAssignNotice(undefined);
    const address = data.address.trim();
    try {
      await setPartnerOnboardingFee({ address, amount });
      if (!mountedRef.current) return;
      setAssignNotice(
        translate('screens/partner', 'Onboarding fee of {{amount}} assigned to {{address}}.', {
          amount: formatChf(amount),
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
          'Enter the wallet address of your customer and the onboarding fee. The customer is attributed to your referral code.',
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
          translate={translateAssignError}
        >
          <StyledVerticalStack gap={4} full>
            <StyledInput name="address" label={translate('screens/partner', 'Customer address')} full smallLabel />

            {/* A text field, not type="number": the browser reports a partly typed number such as "1."
                as an empty value, which would show "required" instead of the range sentence. */}
            <StyledInput
              name="amount"
              type="text"
              label={translate('screens/partner', 'Onboarding fee (CHF)')}
              full
              smallLabel
            />

            {!!amounts?.length && (
              <div
                role="group"
                aria-label={translate('screens/partner', 'Suggested amounts')}
                className="w-full flex flex-wrap gap-2"
              >
                {amounts.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="px-3 py-1 text-sm text-dfxBlue-800 border border-dfxGray-400 rounded-md bg-white hover:bg-dfxGray-300 transition-colors disabled:opacity-50"
                    onClick={() => pickAmount(value)}
                    disabled={isSaving}
                  >
                    {formatChf(value)}
                  </button>
                ))}
              </div>
            )}

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
