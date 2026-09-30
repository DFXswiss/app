import { Utils, Validations } from '@dfx.swiss/react';
import {
  DfxIcon,
  Form,
  IconSize,
  IconVariant,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledInput,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ErrorHint } from 'src/components/error-hint';
import { ConfirmationOverlay } from 'src/components/overlay/confirmation-overlay';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useAdminGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useGuardedApi } from '../hooks/guarded-api.hook';

interface IdFormData {
  id: string;
}

interface RangeFormData {
  from: string;
  to: string;
  min: string;
  max: string;
  reference: string;
}

interface LogValidityResponse {
  id: number;
  valid: boolean;
}

interface FinancialValidityRequest {
  from?: string;
  to?: string;
  min?: number;
  max?: number;
  valid: boolean;
  reference: string;
  auditAll?: boolean;
}

interface FinancialValidityResponse {
  affected: number;
  audited: number;
}

interface PendingConfirmation {
  content: JSX.Element;
  run: () => Promise<void>;
}

export default function DashboardFinancialLogValidityScreen(): JSX.Element {
  useAdminGuard();

  const { translateError } = useSettingsContext();
  const { call } = useGuardedApi();

  const [confirmation, setConfirmation] = useState<PendingConfirmation>();

  // --- Section A: by log ID -------------------------------------------------
  const {
    control: idControl,
    handleSubmit: handleIdSubmit,
    formState: { errors: idErrors },
    reset: resetId,
  } = useForm<IdFormData>({ mode: 'onTouched', defaultValues: { id: '' } });

  const [idLoading, setIdLoading] = useState(false);
  const [idError, setIdError] = useState<string>();
  const [idSuccess, setIdSuccess] = useState<string>();

  const idRules = Utils.createRules({
    id: [Validations.Required, Validations.Custom((value) => (/^\d+$/.test(String(value)) ? true : 'pattern'))],
  });

  async function executeId(data: IdFormData, valid: boolean) {
    setIdLoading(true);
    setIdError(undefined);
    setIdSuccess(undefined);

    try {
      const response = await call<LogValidityResponse>({
        url: `log/${data.id}`,
        method: 'PUT',
        data: { valid },
      });
      setIdSuccess(`Saved: log #${response.id} set to valid = ${valid}`);
      setTimeout(() => setIdSuccess(undefined), 4000);
      resetId();
    } catch (e) {
      setIdError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIdLoading(false);
    }
  }

  function requestIdConfirmation(data: IdFormData, valid: boolean) {
    setIdError(undefined);
    setIdSuccess(undefined);
    setConfirmation({
      content: (
        <p className="text-dfxBlue-800 mb-2 text-center">
          Set validity of log <strong>#{data.id}</strong> to <strong>{String(valid)}</strong>?
        </p>
      ),
      run: () => executeId(data, valid),
    });
  }

  // --- Section B: by financial range / threshold ----------------------------
  const {
    control: rangeControl,
    handleSubmit: handleRangeSubmit,
    formState: { errors: rangeErrors },
    reset: resetRange,
  } = useForm<RangeFormData>({
    mode: 'onTouched',
    defaultValues: { from: '', to: '', min: '', max: '', reference: '' },
  });

  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState<string>();
  const [rangeSuccess, setRangeSuccess] = useState<string>();

  // Validate the range form against the backend rules and build the request payload.
  // Returns undefined (and sets an error) when the input is invalid.
  function buildRangePayload(
    data: RangeFormData,
    valid: boolean,
    auditAll: boolean,
  ): FinancialValidityRequest | undefined {
    const minStr = data.min.trim();
    const maxStr = data.max.trim();

    const hasFrom = data.from !== '';
    const hasTo = data.to !== '';
    const hasMin = minStr !== '';
    const hasMax = maxStr !== '';

    if (!hasFrom && !hasTo && !hasMin && !hasMax) {
      setRangeError('At least one filter is required (from, to, min or max).');
      return undefined;
    }

    // The datetime-local field holds local wall-clock time; new Date() reads it as local,
    // toISOString() then sends the unambiguous UTC instant the backend expects.
    const fromDate = hasFrom ? new Date(data.from) : undefined;
    const toDate = hasTo ? new Date(data.to) : undefined;

    if (fromDate && isNaN(fromDate.getTime())) {
      setRangeError("Invalid 'from' date.");
      return undefined;
    }
    if (toDate && isNaN(toDate.getTime())) {
      setRangeError("Invalid 'to' date.");
      return undefined;
    }
    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      setRangeError("'from' must be earlier than or equal to 'to'.");
      return undefined;
    }

    const min = hasMin ? Number(minStr) : undefined;
    const max = hasMax ? Number(maxStr) : undefined;

    if (min !== undefined && isNaN(min)) {
      setRangeError("'min' must be a number.");
      return undefined;
    }
    if (max !== undefined && isNaN(max)) {
      setRangeError("'max' must be a number.");
      return undefined;
    }
    if (min !== undefined && max !== undefined && min >= max) {
      setRangeError("'min' must be less than 'max'.");
      return undefined;
    }

    const reference = data.reference.trim();
    if (!reference) {
      setRangeError('A reason is required.');
      return undefined;
    }
    if (reference.length > 1024) {
      setRangeError('The reason must be at most 1024 characters.');
      return undefined;
    }

    const payload: FinancialValidityRequest = { valid, reference };
    if (fromDate) payload.from = fromDate.toISOString();
    if (toDate) payload.to = toDate.toISOString();
    if (min !== undefined) payload.min = min;
    if (max !== undefined) payload.max = max;
    if (auditAll) payload.auditAll = true;
    return payload;
  }

  async function executeRange(payload: FinancialValidityRequest) {
    setRangeLoading(true);
    try {
      const response = await call<FinancialValidityResponse>({
        url: 'log/financial/validity',
        method: 'PUT',
        data: payload,
      });
      setRangeSuccess(
        payload.auditAll
          ? `Recorded an info point for ${response.audited} ${response.audited === 1 ? 'entry' : 'entries'} (${response.affected} changed to valid = true).`
          : `Updated ${response.affected} ${response.affected === 1 ? 'entry' : 'entries'} to valid = ${payload.valid}.`,
      );
      setTimeout(() => setRangeSuccess(undefined), 4000);
      resetRange();
    } catch (e) {
      setRangeError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setRangeLoading(false);
    }
  }

  function requestRangeConfirmation(data: RangeFormData, valid: boolean, auditAll: boolean) {
    setRangeError(undefined);
    setRangeSuccess(undefined);

    const payload = buildRangePayload(data, valid, auditAll);
    if (!payload) return;

    const filters: string[] = [];
    if (payload.from) filters.push(`from ${payload.from}`);
    if (payload.to) filters.push(`to ${payload.to}`);
    if (payload.min !== undefined) filters.push(`min ${payload.min}`);
    if (payload.max !== undefined) filters.push(`max ${payload.max}`);

    setConfirmation({
      content: (
        <p className="text-dfxBlue-800 mb-2 text-center">
          {auditAll ? (
            <>
              Record an info point for all financial data logs matching <strong>{filters.join(', ')}</strong>? They stay
              valid = <strong>true</strong>.
            </>
          ) : (
            <>
              Update all financial data logs matching <strong>{filters.join(', ')}</strong> to valid ={' '}
              <strong>{String(valid)}</strong>?
            </>
          )}
        </p>
      ),
      run: () => executeRange(payload),
    });
  }

  useLayoutOptions({ title: 'Log Validity', noMaxWidth: true });

  if (confirmation) {
    return (
      <div className="space-y-6 p-4 w-full self-stretch" style={{ color: '#111827' }}>
        <div className="bg-white rounded-lg shadow p-6 max-w-xl">
          <ConfirmationOverlay
            messageContent={confirmation.content}
            cancelLabel="Cancel"
            confirmLabel="Confirm"
            onCancel={() => setConfirmation(undefined)}
            onConfirm={async () => {
              await confirmation.run();
              setConfirmation(undefined);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 w-full self-stretch" style={{ color: '#111827' }}>
      {/* Section A: by log ID */}
      <div className="bg-white rounded-lg shadow p-6 max-w-xl">
        <h2 className="text-lg font-semibold mb-1">By log ID</h2>
        <p className="text-sm text-gray-500 mb-4">Set the validity of any single log entry by its ID.</p>

        <Form control={idControl} rules={idRules} errors={idErrors} translate={translateError} hasFormElement={false}>
          <StyledVerticalStack gap={4} full>
            <StyledInput name="id" type="number" label="Log ID" placeholder="1234" full smallLabel />

            {idError && <ErrorHint message={idError} />}

            <StyledButton
              label="Set valid = true"
              color={StyledButtonColor.GREEN}
              onClick={handleIdSubmit((data) => requestIdConfirmation(data, true))}
              width={StyledButtonWidth.FULL}
              isLoading={idLoading}
              disabled={idLoading}
            />
            <StyledButton
              label="Set valid = false"
              color={StyledButtonColor.RED}
              onClick={handleIdSubmit((data) => requestIdConfirmation(data, false))}
              width={StyledButtonWidth.FULL}
              isLoading={idLoading}
              disabled={idLoading}
            />

            {idSuccess && (
              <p className="flex flex-row gap-1 items-center font-medium" style={{ color: '#16a34a' }}>
                <DfxIcon icon={IconVariant.CHECK} size={IconSize.SM} />
                {idSuccess}
              </p>
            )}
          </StyledVerticalStack>
        </Form>
      </div>

      {/* Section B: by financial range / threshold */}
      <div className="bg-white rounded-lg shadow p-6 max-w-xl">
        <h2 className="text-lg font-semibold mb-1">By financial range / threshold</h2>
        <p className="text-sm text-gray-500 mb-4">
          Bulk-update the validity of financial data logs. At least one filter is required. Dates are picked in your
          local time and sent as UTC; from is inclusive, to is exclusive. min/max apply exclusively to totalBalanceChf.
          A reason is required and is shown on the treasury chart. 'Add info point' records the matched entries without
          changing them.
        </p>

        <Form control={rangeControl} errors={rangeErrors} translate={translateError} hasFormElement={false}>
          <StyledVerticalStack gap={4} full>
            <StyledInput name="from" type="datetime-local" label="From (created >=)" full smallLabel />
            <StyledInput name="to" type="datetime-local" label="To (created <)" full smallLabel />
            <StyledInput
              name="min"
              type="number"
              label="Min totalBalanceChf (exclusive)"
              placeholder="0"
              full
              smallLabel
            />
            <StyledInput
              name="max"
              type="number"
              label="Max totalBalanceChf (exclusive)"
              placeholder="0"
              full
              smallLabel
            />
            <StyledInput name="reference" label="Reason (shown on the chart)" placeholder="Reason" full smallLabel />

            {rangeError && <ErrorHint message={rangeError} />}

            <StyledButton
              label="Set valid = true"
              color={StyledButtonColor.GREEN}
              onClick={handleRangeSubmit((data) => requestRangeConfirmation(data, true, false))}
              width={StyledButtonWidth.FULL}
              isLoading={rangeLoading}
              disabled={rangeLoading}
            />
            <StyledButton
              label="Set valid = false"
              color={StyledButtonColor.RED}
              onClick={handleRangeSubmit((data) => requestRangeConfirmation(data, false, false))}
              width={StyledButtonWidth.FULL}
              isLoading={rangeLoading}
              disabled={rangeLoading}
            />
            <StyledButton
              label="Add info point (keep valid)"
              color={StyledButtonColor.BLUE}
              onClick={handleRangeSubmit((data) => requestRangeConfirmation(data, true, true))}
              width={StyledButtonWidth.FULL}
              isLoading={rangeLoading}
              disabled={rangeLoading}
            />

            {rangeSuccess && (
              <p className="flex flex-row gap-1 items-center font-medium" style={{ color: '#16a34a' }}>
                <DfxIcon icon={IconVariant.CHECK} size={IconSize.SM} />
                {rangeSuccess}
              </p>
            )}
          </StyledVerticalStack>
        </Form>
      </div>
    </div>
  );
}
