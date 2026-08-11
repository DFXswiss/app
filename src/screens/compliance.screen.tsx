import { KycStatus, Utils, Validations } from '@dfx.swiss/react';
import {
  Form,
  IconColor,
  IconSize,
  IconVariant,
  StyledButton,
  StyledButtonWidth,
  StyledIconButton,
  StyledInfoText,
  StyledInput,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation } from 'react-router-dom';
import { CallQueuesSection } from 'src/components/compliance/call-queues-section';
import { PendingReviewsSection } from 'src/components/compliance/pending-reviews-section';
import { PendingTransactionsSection } from 'src/components/compliance/pending-transactions-section';
import { QuickLinksSection } from 'src/components/compliance/quick-links-section';
import { ErrorHint } from 'src/components/error-hint';
import { useSettingsContext } from 'src/contexts/settings.context';
import { CallQueueSummaryEntry, PendingReviewSummaryEntry } from '@dfx.swiss/react';
import {
  BankTxSearchResult,
  ComplianceSearchResult,
  PendingTransactionInfo,
  UserSearchResult,
  useCompliance,
} from 'src/hooks/compliance.hook';
import { useComplianceGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { cacheBankTx } from 'src/util/bank-tx-cache';

interface FormData {
  key: string;
}

export default function ComplianceScreen(): JSX.Element {
  useComplianceGuard();

  const { translate, translateError } = useSettingsContext();
  const { search, getPendingReviews, getPendingTransactions, getCallQueues } = useCompliance();
  const { navigate } = useNavigation();
  const { search: query } = useLocation();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [dashboardError, setDashboardError] = useState<string>();
  const [searchResult, setSearchResult] = useState<ComplianceSearchResult>();
  const [showInfo, setShowInfo] = useState(false);
  const [pendingReviews, setPendingReviews] = useState<PendingReviewSummaryEntry[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState<PendingTransactionInfo[]>([]);
  const [callQueues, setCallQueues] = useState<CallQueueSummaryEntry[]>([]);

  const paramSearch = new URLSearchParams(query).get('search') || undefined;

  useEffect(() => {
    Promise.all([getPendingReviews(), getPendingTransactions(), getCallQueues()])
      .then(([reviews, transactions, queues]) => {
        setPendingReviews(reviews);
        setPendingTransactions(transactions);
        setCallQueues(queues);
      })
      .catch((e) => setDashboardError(e.message));
  }, []);

  const {
    control,
    handleSubmit,
    formState: { isValid, errors },
  } = useForm<FormData>({ mode: 'onChange', defaultValues: { key: paramSearch } });

  const onSubmit = useCallback(
    (data: FormData) => {
      navigate({ search: `search=${data.key}` });

      setIsLoading(true);
      setError(undefined);
      setSearchResult(undefined);

      search(data.key)
        .then(setSearchResult)
        .catch((e) => setError(e.message))
        .finally(() => setIsLoading(false));
    },
    [navigate, search],
  );

  useEffect(() => {
    if (paramSearch) onSubmit({ key: paramSearch });
  }, [paramSearch, onSubmit]);

  const rules = Utils.createRules({ key: Validations.Required });

  const searchExamples = [
    { label: 'ID', example: '1' },
    { label: 'Email', example: 'user@example.com' },
    { label: 'Phone', example: '+xxxxxxxxxxx' },
    { label: 'IP address', example: '192.168.1.1' },
    { label: 'KYC hash', example: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
    { label: 'Bank reference', example: 'xxxx-xxxx-xxxx' },
    { label: 'Referral code', example: 'xxx-xxx' },
    { label: 'Blockchain address', example: '0x... or bc1... etc.' },
    { label: 'Transaction ID', example: 'Blockchain TX hash' },
    { label: 'Name', example: 'Min. 2 characters' },
  ];

  const userTableData = [
    {
      key: 'userId',
      label: translate('screens/compliance', 'ID'),
      render: (u: UserSearchResult) => u.id,
    },
    {
      key: 'accountType',
      label: translate('screens/kyc', 'Account Type'),
      render: (u: UserSearchResult) => u.accountType ?? '-',
    },
    {
      key: 'name',
      label: translate('screens/kyc', 'Name'),
      render: (u: UserSearchResult) => u.name ?? '-',
    },
    {
      key: 'email',
      label: translate('screens/compliance', 'Email'),
      cellClassName: 'break-all',
      render: (u: UserSearchResult) => u.mail ?? '-',
    },
    {
      key: 'kycLevel',
      label: translate('screens/compliance', 'KYC Level'),
      render: (u: UserSearchResult) => u.kycLevel ?? '-',
    },
    {
      key: 'actions',
      label: '',
      cellClassName: 'whitespace-nowrap',
      render: (u: UserSearchResult) => (
        <div className="flex gap-2 justify-end items-center">
          <StyledIconButton
            icon={IconVariant.FORWARD}
            color={IconColor.BLUE}
            size={IconSize.SM}
            onClick={() => navigate(`compliance/user/${u.id}`)}
          />
        </div>
      ),
    },
  ];

  const bankTxTableData = [
    {
      key: 'id',
      label: translate('screens/compliance', 'ID'),
      render: (b: BankTxSearchResult) => b.id,
    },
    {
      key: 'type',
      label: translate('screens/compliance', 'Type'),
      render: (b: BankTxSearchResult) => b.type,
    },
    {
      key: 'accountServiceRef',
      label: translate('screens/compliance', 'Account Service Ref'),
      render: (b: BankTxSearchResult) => b.accountServiceRef,
    },
    {
      key: 'amount',
      label: translate('screens/compliance', 'Amount'),
      render: (b: BankTxSearchResult) => `${b.amount} ${b.currency}`,
    },
    {
      key: 'name',
      label: translate('screens/compliance', 'User name'),
      render: (b: BankTxSearchResult) => b.name ?? '-',
    },
    {
      key: 'actions',
      label: '',
      render: (b: BankTxSearchResult) => (
        <div className="flex gap-2 justify-end items-center">
          <StyledIconButton
            icon={IconVariant.FORWARD}
            color={IconColor.BLUE}
            size={IconSize.SM}
            onClick={() => {
              cacheBankTx(b);
              navigate(`compliance/bank-tx/${b.id}`);
            }}
          />
        </div>
      ),
    },
  ];

  useLayoutOptions({ title: translate('screens/compliance', 'Compliance') });

  return (
    <Form control={control} rules={rules} errors={errors} onSubmit={handleSubmit(onSubmit)} translate={translateError}>
      <StyledVerticalStack gap={6} full center>
        <div className="w-full">
          <div className="flex items-center gap-2 mb-1 pl-3">
            <label className="text-base font-semibold text-dfxBlue-800">
              {translate('screens/compliance', 'Database search')}
            </label>
            <StyledIconButton
              icon={showInfo ? IconVariant.INFO : IconVariant.INFO_OUTLINE}
              color={IconColor.DARK_GRAY}
              size={IconSize.SM}
              onClick={() => setShowInfo(!showInfo)}
            />
          </div>
          {showInfo && (
            <div className="mb-2">
              <StyledInfoText iconColor={IconColor.BLUE}>
                <div className="text-left">
                  <strong>Search by:</strong>
                  <ul className="mt-1 ml-4 list-disc text-left text-sm">
                    {searchExamples.map((e) => (
                      <li key={e.label}>
                        <strong>{e.label}:</strong> {e.example}
                      </li>
                    ))}
                  </ul>
                </div>
              </StyledInfoText>
            </div>
          )}
          <StyledInput
            name="key"
            type="text"
            hideLabel
            placeholder={translate('screens/kyc', 'example@mail.com')}
            full
          />
        </div>

        {error && (
          <div>
            <ErrorHint message={error} />
          </div>
        )}

        <StyledButton
          type="submit"
          label={translate('general/actions', 'Search')}
          onClick={handleSubmit(onSubmit)}
          width={StyledButtonWidth.FULL}
          disabled={!isValid}
          isLoading={isLoading}
        />
        {searchResult &&
          (searchResult.userDatas.length + searchResult.bankTx.length > 0 ? (
            <>
              <div>
                <h1 className="text-dfxGray-700">{translate('screens/compliance', 'Matching Entries')}</h1>
                <p className="text-dfxGray-700">
                  ({translate('screens/compliance', 'found by {{type}}', { type: searchResult.type })})
                </p>
              </div>

              {searchResult.userDatas.length > 0 && (
                <div className="w-full">
                  <h2 className="text-dfxGray-700">{translate('screens/compliance', 'Customers')}</h2>
                  <div className="w-full overflow-x-auto">
                    <table className="w-full border-collapse bg-white rounded-lg shadow-sm">
                      <thead>
                        <tr className="bg-dfxGray-300">
                          {userTableData.map((column) => (
                            <th key={column.key} className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                              {column.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {searchResult.userDatas.map((u) => {
                          const isRedRow = [KycStatus.CHECK, KycStatus.REJECTED].includes(u.kycStatus);
                          return (
                            <tr
                              key={u.id}
                              className={`border-b border-dfxGray-300 transition-colors ${
                                isRedRow ? 'bg-dfxRed-100 hover:bg-dfxRed-150' : 'hover:bg-dfxGray-300'
                              }`}
                            >
                              {userTableData.map((column) => (
                                <td
                                  key={column.key}
                                  className={`px-4 py-3 text-left text-sm text-dfxBlue-800 ${
                                    'cellClassName' in column ? column.cellClassName : ''
                                  }`}
                                >
                                  {column.render(u)}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {searchResult.bankTx.length > 0 && (
                <div className="w-full">
                  <h2 className="text-dfxGray-700">{translate('screens/compliance', 'Bank Transactions')}</h2>
                  <div className="w-full overflow-x-auto">
                    <table className="w-full border-collapse bg-white rounded-lg shadow-sm">
                      <thead>
                        <tr className="bg-dfxGray-300">
                          {bankTxTableData.map((column) => (
                            <th key={column.key} className="px-4 py-3 text-left text-sm font-semibold text-dfxBlue-800">
                              {column.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {searchResult.bankTx.map((u) => (
                          <tr key={u.id} className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300">
                            {bankTxTableData.map((column) => (
                              <td key={column.key} className="px-4 py-3 text-left text-sm text-dfxBlue-800">
                                {column.render(u)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-dfxGray-700">{translate('screens/compliance', 'No entries found')}</p>
          ))}

        {dashboardError && <ErrorHint message={dashboardError} />}

        <PendingReviewsSection entries={pendingReviews} />
        <PendingTransactionsSection entries={pendingTransactions} />
        <CallQueuesSection entries={callQueues} />
        <QuickLinksSection />
      </StyledVerticalStack>
    </Form>
  );
}
