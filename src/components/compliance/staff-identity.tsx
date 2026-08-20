import { ErrorHint } from 'src/components/error-hint';
import { useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';

export const STAFF_NAME_MISSING = 'Staff identification requires a verified name on this account.';

export function staffNameLoadError(error: string): string {
  return `Could not load your verified name: ${error}`;
}

export function StaffIdentityBlock({ label }: { label: string }): JSX.Element {
  const { name, isLoading, error } = useStaffVerifiedName();
  const hint = !isLoading && !name ? (error ? staffNameLoadError(error) : STAFF_NAME_MISSING) : undefined;

  return (
    <div className="flex flex-col gap-2">
      {hint && <ErrorHint message={hint} />}
      <div className="flex items-center justify-between">
        <span className="text-sm text-dfxBlue-800 font-medium">{label}</span>
        <span className="ml-4 text-sm text-dfxBlue-800">{isLoading ? '…' : (name ?? '—')}</span>
      </div>
    </div>
  );
}
