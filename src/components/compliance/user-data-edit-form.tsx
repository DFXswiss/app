import type { ApiError, Country } from '@dfx.swiss/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ErrorHint } from 'src/components/error-hint';
import { useSettingsContext } from 'src/contexts/settings.context';
import type { UserDataDetail } from 'src/hooks/compliance.hook';
import { useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';
import { useUserDataOperatorMutation } from 'src/hooks/user-data-operator-mutation.hook';
import {
  EDITABLE_KYC_STATUSES,
  EditableTextField,
  initialEditValues,
  planUserDataEdit,
  UserDataEditValues,
} from 'src/util/user-data-edit.util';
import { STAFF_NAME_MISSING, staffNameLoadError } from './staff-identity';

// The API answers 404 while its switch userDataOperatorMutation is off.
const OPERATOR_MUTATION_DISABLED = 'Editing personal data is not enabled on this environment yet.';

interface Props {
  userDataId: number;
  userData: UserDataDetail;
  fields: readonly EditableTextField[];
  onSaved: () => void;
  onCancel: () => void;
}

interface FieldsProps extends Props {
  countries: Country[];
}

const inputClass =
  'w-full px-3 py-2 text-sm text-dfxBlue-800 border border-dfxGray-300 rounded bg-white focus:outline-none focus:border-dfxBlue-800';
const labelClass = 'text-sm font-medium text-dfxBlue-800';
const buttonClass =
  'px-3 py-1 text-xs text-white bg-dfxBlue-800 hover:bg-dfxBlue-800/80 rounded transition-colors whitespace-nowrap';
const secondaryButtonClass =
  'px-3 py-1 text-xs bg-white text-dfxBlue-800 border border-dfxBlue-800 rounded hover:bg-dfxGray-300 transition-colors whitespace-nowrap';

export function UserDataEditForm({ userDataId, userData, fields, onSaved, onCancel }: Readonly<Props>): JSX.Element {
  const { countries } = useSettingsContext();

  // The country list is fetched after the panel mounts. Editing before it arrives would lock the
  // preselected country as "none", so an account with a country waits for the list.
  if (countries.length === 0 && userData.country?.symbol) {
    return (
      <>
        <div className="px-3 py-2 text-sm text-dfxGray-700">Loading countries…</div>
        <div className="px-3 py-2">
          <button type="button" className={secondaryButtonClass} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </>
    );
  }

  return (
    <UserDataEditFields
      userDataId={userDataId}
      userData={userData}
      fields={fields}
      countries={countries}
      onSaved={onSaved}
      onCancel={onCancel}
    />
  );
}

function saveErrorMessage(e: unknown): string {
  const apiError = e as Partial<ApiError> | null | undefined;
  if (apiError?.statusCode === 404) return OPERATOR_MUTATION_DISABLED;
  if (apiError?.message) return apiError.message;
  return 'Failed to save the customer data';
}

function UserDataEditFields({
  userDataId,
  userData,
  fields,
  countries,
  onSaved,
  onCancel,
}: Readonly<FieldsProps>): JSX.Element {
  const { mutateUserData } = useUserDataOperatorMutation();
  const { name: clerk, isLoading: isLoadingClerk, error: clerkError } = useStaffVerifiedName();

  // Captured once, with the countries already loaded: the initial values must not drift apart from
  // the edited ones while the user is typing.
  const [initial] = useState(() => initialEditValues(userData, countries));
  const [values, setValues] = useState<UserDataEditValues>(initial);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  const userDataIdRef = useRef(userDataId);
  userDataIdRef.current = userDataId;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    savingRef.current = false;
    setSaving(false);
    setError(undefined);
  }, [userDataId]);

  const plan = useMemo(() => planUserDataEdit(initial, values, fields), [initial, values, fields]);
  const hasChanges = Object.keys(plan.payload).length > 0;
  const hasErrors = plan.errors.length > 0;
  const hasReason = reason.trim().length > 0;
  const requiredInputsPresent = hasChanges && !hasErrors && hasReason;
  const canSave = !!clerk && !isLoadingClerk && !saving && requiredInputsPresent;
  const currentKycStatusNotEditable = !(EDITABLE_KYC_STATUSES as readonly string[]).includes(initial.kycStatus);

  function updateText(field: EditableTextField, value: string): void {
    setValues((current) => ({ ...current, text: { ...current.text, [field]: value } }));
  }

  async function save(): Promise<void> {
    if (savingRef.current || !clerk || isLoadingClerk || !requiredInputsPresent) return;

    savingRef.current = true;
    setSaving(true);
    setError(undefined);
    const requestedId = userDataId;
    const editPlan = plan;
    const comment = reason.trim();

    try {
      await mutateUserData(requestedId, editPlan.payload, comment);
    } catch (e: unknown) {
      if (mountedRef.current && userDataIdRef.current === requestedId) setError(saveErrorMessage(e));
      if (userDataIdRef.current === requestedId) {
        savingRef.current = false;
        if (mountedRef.current) setSaving(false);
      }
      return;
    }

    if (mountedRef.current && userDataIdRef.current === requestedId) onSaved();
    if (userDataIdRef.current === requestedId) {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }

  return (
    <form
      className="px-3 py-2 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {fields.map((field) => (
        <div key={field} className="flex flex-col gap-1">
          <label htmlFor={`user-data-edit-${field}`} className={labelClass}>
            {field}
          </label>
          <input
            id={`user-data-edit-${field}`}
            className={inputClass}
            value={values.text[field]}
            onChange={(e) => updateText(field, e.target.value)}
          />
        </div>
      ))}

      <div className="flex flex-col gap-1">
        <label htmlFor="user-data-edit-country" className={labelClass}>
          country
        </label>
        <select
          id="user-data-edit-country"
          className={inputClass}
          value={values.countryId ?? ''}
          onChange={(e) =>
            setValues({ ...values, countryId: e.target.value === '' ? undefined : Number(e.target.value) })
          }
        >
          {initial.countryId === undefined && <option value="">No country</option>}
          {countries.map((country) => (
            <option key={country.id} value={country.id}>
              {country.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="user-data-edit-kycStatus" className={labelClass}>
          kycStatus
        </label>
        <select
          id="user-data-edit-kycStatus"
          className={inputClass}
          value={values.kycStatus}
          onChange={(e) => setValues({ ...values, kycStatus: e.target.value })}
        >
          {currentKycStatusNotEditable && (
            <option value={initial.kycStatus}>{`${initial.kycStatus || '-'} (current)`}</option>
          )}
          {EDITABLE_KYC_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <p className="text-xs text-dfxGray-700">Check is set on the compliance review screen (KYC Status Check).</p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="user-data-edit-reason" className={labelClass}>
          Reason
        </label>
        <textarea
          id="user-data-edit-reason"
          className={inputClass}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      {hasErrors &&
        plan.errors.map((message) => (
          <p key={message} data-testid="user-data-edit-validation" className="text-sm text-dfxRed-100">
            {message}
          </p>
        ))}
      {!isLoadingClerk && !clerk && (
        <ErrorHint message={clerkError ? staffNameLoadError(clerkError) : STAFF_NAME_MISSING} />
      )}
      {error && <ErrorHint message={error} />}

      <div className="flex gap-2">
        <button type="submit" className={buttonClass} disabled={!canSave}>
          Save
        </button>
        <button type="button" className={secondaryButtonClass} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
