import { useAuthContext, UserRole } from '@dfx.swiss/react';
import {
  Form,
  SpinnerSize,
  StyledButton,
  StyledButtonWidth,
  StyledDropdown,
  StyledInput,
  StyledLoadingSpinner,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ErrorHint } from 'src/components/error-hint';
import { useLayoutContext } from 'src/contexts/layout.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import {
  AssignableBankTxTypes,
  AssignBankTxDto,
  UnassignedBankTx,
  useBankTxAssignment,
} from 'src/hooks/bank-tx-assignment.hook';
import { useSupportStaffGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { formatSwissDate } from 'src/util/utils';

interface AssignFormData {
  type: string;
  buyId: string;
}

export default function ComplianceBankTxUnassignedScreen(): JSX.Element {
  useSupportStaffGuard();

  const { translate } = useSettingsContext();
  const { session } = useAuthContext();
  const canAssign = session?.role === UserRole.ADMIN;
  const { getUnassignedBankTx, assignBankTx } = useBankTxAssignment();
  const { rootRef } = useLayoutContext();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [data, setData] = useState<UnassignedBankTx[]>([]);
  const [expandedId, setExpandedId] = useState<number>();
  const [isSaving, setIsSaving] = useState(false);
  const [assignError, setAssignError] = useState<string>();

  const {
    control: assignControl,
    formState: { errors: assignErrors },
    watch: watchAssign,
    reset: resetAssignForm,
  } = useForm<AssignFormData>();

  const selectedType = watchAssign('type');
  const selectedBuyId = watchAssign('buyId');

  useLayoutOptions({
    title: translate('screens/compliance', 'Unassigned Bank Transactions'),
    backButton: true,
  });

  const loadData = useCallback((): void => {
    setIsLoading(true);
    setError(undefined);

    getUnassignedBankTx()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setIsLoading(false));
  }, [getUnassignedBankTx]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openAssignForm(entry: UnassignedBankTx): void {
    setExpandedId(entry.id);
    setAssignError(undefined);
    resetAssignForm({
      type: '',
      buyId: entry.buyCandidateId != null ? String(entry.buyCandidateId) : '',
    });
  }

  function canSubmitAssign(): boolean {
    if (!selectedType) return false;
    if (selectedType === 'BuyCrypto') {
      const buyIdTrimmed = selectedBuyId != null ? selectedBuyId.trim() : '';
      return buyIdTrimmed !== '';
    }
    return true;
  }

  async function handleAssign(id: number): Promise<void> {
    if (!selectedType) return;

    const dto: AssignBankTxDto = { type: selectedType };
    const buyIdTrimmed = selectedBuyId != null ? selectedBuyId.trim() : '';
    if (buyIdTrimmed !== '') {
      const parsedBuyId = Number(buyIdTrimmed);
      // Reject non-integer input here rather than sending NaN and letting the API answer 400 -
      // the caller would get a validation error without knowing which field caused it.
      if (!Number.isInteger(parsedBuyId)) {
        setAssignError(translate('screens/compliance', 'Buy ID must be a whole number'));
        return;
      }

      dto.buyId = parsedBuyId;
    }

    setIsSaving(true);
    setAssignError(undefined);

    try {
      await assignBankTx(id, dto);
      setExpandedId(undefined);
      loadData();
    } catch (e: unknown) {
      setAssignError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading && data.length === 0) {
    return (
      <StyledVerticalStack gap={6} full center>
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      </StyledVerticalStack>
    );
  }

  if (error) {
    return (
      <StyledVerticalStack gap={6} full>
        <ErrorHint message={error} />
      </StyledVerticalStack>
    );
  }

  // The assign column only exists when `canAssign`, and the editing row below is rendered under the
  // same condition - so the span always covers the ten-column layout.
  const assignRowColSpan = 10;

  return (
    <StyledVerticalStack gap={6} full>
      {data.length === 0 ? (
        <div className="text-center text-dfxGray-700 py-8">
          {translate('screens/compliance', 'No unassigned bank transactions')}
        </div>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse bg-white rounded-lg shadow-sm">
            <thead>
              <tr className="bg-dfxGray-300">
                <th className="px-4 py-3 text-right text-sm font-semibold text-dfxBlue-800">
                  {translate('screens/compliance', 'Id')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                  {translate('screens/compliance', 'Booking date')}
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-dfxBlue-800">
                  {translate('screens/compliance', 'Amount')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                  {translate('screens/compliance', 'Direction')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                  {translate('screens/compliance', 'Name')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                  {translate('screens/compliance', 'IBAN')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                  {translate('screens/compliance', 'Remittance info')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                  {translate('screens/compliance', 'Type')}
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-dfxBlue-800">
                  {translate('screens/compliance', 'Buy candidate')}
                </th>
                {canAssign && (
                  <th className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                    {translate('screens/compliance', 'Assign')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((entry) => {
                const isExpanded = expandedId === entry.id;
                const isDebit = entry.creditDebitIndicator === 'DBIT';

                return (
                  <Fragment key={entry.id}>
                    <tr className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300">
                      <td className="px-4 py-3 text-right text-sm text-dfxBlue-800">{entry.id}</td>
                      <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                        {entry.bookingDate ? formatSwissDate(entry.bookingDate) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-dfxBlue-800">
                        {entry.amount} {entry.currency}
                      </td>
                      <td
                        className={
                          isDebit
                            ? 'px-4 py-3 text-left text-sm font-semibold text-dfxRed-100'
                            : 'px-4 py-3 text-left text-sm text-dfxBlue-800'
                        }
                      >
                        {entry.creditDebitIndicator ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{entry.name ?? '-'}</td>
                      <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{entry.iban ?? '-'}</td>
                      <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                        {entry.remittanceInfo ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-left text-sm text-dfxBlue-800">{entry.type}</td>
                      <td className="px-4 py-3 text-right text-sm text-dfxBlue-800">
                        {entry.buyCandidateId != null ? entry.buyCandidateId : '-'}
                      </td>
                      {canAssign && (
                        <td className="px-4 py-3 text-left text-sm">
                          <button
                            className="px-3 py-1.5 bg-white border border-dfxGray-400 text-dfxBlue-800 rounded-lg text-sm hover:bg-dfxGray-300 transition-colors"
                            onClick={() => {
                              if (isExpanded) {
                                setExpandedId(undefined);
                                setAssignError(undefined);
                              } else {
                                openAssignForm(entry);
                              }
                            }}
                          >
                            {isExpanded
                              ? translate('general/actions', 'Cancel')
                              : translate('screens/compliance', 'Assign')}
                          </button>
                        </td>
                      )}
                    </tr>
                    {canAssign && isExpanded && (
                      <tr className="border-b border-dfxGray-300 bg-dfxGray-300/40">
                        <td colSpan={assignRowColSpan} className="px-4 py-4">
                          <Form control={assignControl} errors={assignErrors}>
                            <div className="flex flex-col gap-3 max-w-md">
                              <StyledDropdown<string>
                                rootRef={rootRef}
                                name="type"
                                label={translate('screens/compliance', 'Type')}
                                placeholder={translate('general/actions', 'Select') + '...'}
                                items={AssignableBankTxTypes}
                                labelFunc={(item) => item}
                                full
                                smallLabel
                              />
                              <StyledInput
                                name="buyId"
                                type="number"
                                label={translate('screens/compliance', 'Buy ID')}
                                placeholder={translate('screens/compliance', 'Buy ID')}
                                full
                                smallLabel
                              />
                              {assignError && <ErrorHint message={assignError} />}
                              <StyledButton
                                label={translate('general/actions', 'Save')}
                                onClick={() => handleAssign(entry.id)}
                                width={StyledButtonWidth.FULL}
                                disabled={!canSubmitAssign() || isSaving}
                                isLoading={isSaving}
                              />
                            </div>
                          </Form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </StyledVerticalStack>
  );
}
