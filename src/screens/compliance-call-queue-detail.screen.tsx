import { CallQueue, CallQueueSourceType, useSessionContext } from '@dfx.swiss/react';
import { SpinnerSize, StyledLoadingSpinner, StyledVerticalStack } from '@dfx.swiss/react-components';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { CallQueueAddressInfo } from 'src/components/compliance/call-queue/call-queue-address-info';
import { CallQueueBankTxInfo } from 'src/components/compliance/call-queue/call-queue-bank-tx-info';
import { CallQueueIpCountries } from 'src/components/compliance/call-queue/call-queue-ip-countries';
import { buildCallOutcomeContext } from 'src/components/compliance/call-queue/call-queue-item-builder';
import { CallQueueKycComments } from 'src/components/compliance/call-queue/call-queue-kyc-comments';
import { CallQueueOutcomeForm } from 'src/components/compliance/call-queue/call-queue-outcome-form';
import { CallQueueQuestions } from 'src/components/compliance/call-queue/call-queue-questions';
import { callQueueQuestions } from 'src/components/compliance/call-queue/call-queue-questions.data';
import { CallQueueTransactionsList } from 'src/components/compliance/call-queue/call-queue-transactions-list';
import { CallQueueTxInfo } from 'src/components/compliance/call-queue/call-queue-tx-info';
import { CallQueueUserInfo } from 'src/components/compliance/call-queue/call-queue-user-info';
import { ErrorHint } from 'src/components/error-hint';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useCallQueueClerks } from 'src/hooks/call-queue-clerks.hook';
import { CallOutcome, ComplianceUserData, useCompliance } from 'src/hooks/compliance.hook';
import { useComplianceGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { canResetBuyCryptoAmlForReview } from 'src/util/buy-crypto-reset.util';

type CheckDateField =
  | 'phoneCallCheckDate'
  | 'phoneCallIpCheckDate'
  | 'phoneCallIpCountryCheckDate'
  | 'phoneCallExternalAccountCheckDate';

type QueueConfig = {
  highlightCheckDateField: CheckDateField;
  showAddressInfo?: boolean;
  showBankTxInfo?: boolean;
  outcomes: CallOutcome[];
};

const TX_OUTCOMES: CallOutcome[] = [
  CallOutcome.COMPLETED,
  CallOutcome.UNAVAILABLE,
  CallOutcome.SUSPICIOUS,
  CallOutcome.FAILED,
  CallOutcome.REPEAT,
];

const USER_OUTCOMES: CallOutcome[] = [
  CallOutcome.COMPLETED,
  CallOutcome.UNAVAILABLE,
  CallOutcome.SUSPICIOUS,
  CallOutcome.FAILED,
  CallOutcome.REPEAT,
];

const QUEUE_CONFIG: Record<CallQueue, QueueConfig> = {
  [CallQueue.MANUAL_CHECK_PHONE]: {
    highlightCheckDateField: 'phoneCallCheckDate',
    outcomes: TX_OUTCOMES,
  },
  [CallQueue.MANUAL_CHECK_IP_PHONE]: {
    highlightCheckDateField: 'phoneCallIpCheckDate',
    outcomes: TX_OUTCOMES,
  },
  [CallQueue.MANUAL_CHECK_IP_COUNTRY_PHONE]: {
    highlightCheckDateField: 'phoneCallIpCountryCheckDate',
    showAddressInfo: true,
    outcomes: TX_OUTCOMES,
  },
  [CallQueue.MANUAL_CHECK_EXTERNAL_ACCOUNT_PHONE]: {
    highlightCheckDateField: 'phoneCallExternalAccountCheckDate',
    showBankTxInfo: true,
    outcomes: TX_OUTCOMES,
  },
  [CallQueue.UNAVAILABLE_SUSPICIOUS]: {
    highlightCheckDateField: 'phoneCallCheckDate',
    outcomes: USER_OUTCOMES,
  },
};

function isCallQueue(value: string | undefined): value is CallQueue {
  return value != null && (Object.values(CallQueue) as string[]).includes(value);
}

export default function ComplianceCallQueueDetailScreen(): JSX.Element {
  useComplianceGuard();

  const { translate } = useSettingsContext();
  const { getUserData } = useCompliance();
  const { navigate } = useNavigation();
  const { isLoggedIn } = useSessionContext();
  const { queue: queueParam, userDataId } = useParams<{ queue: string; userDataId: string }>();
  const { search } = useLocation();
  const { clerks, error: clerksError, isLoading: clerksLoading } = useCallQueueClerks();

  const query = new URLSearchParams(search);
  const txIdParam = query.get('txId');
  const txId = txIdParam ? Number(txIdParam) : undefined;

  const queue = isCallQueue(queueParam) ? queueParam : undefined;
  const config = queue ? QUEUE_CONFIG[queue] : undefined;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [data, setData] = useState<ComplianceUserData>();

  useEffect(() => {
    if (!isLoggedIn || !userDataId || !queue) return;
    setIsLoading(true);
    getUserData(+userDataId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [isLoggedIn, userDataId, queue]);

  useLayoutOptions({
    title: queue ? `${queue} – ${userDataId ?? ''}` : translate('screens/compliance', 'Call Queue'),
    noMaxWidth: true,
    backButton: true,
    textStart: true,
    onBack: () => navigate(-1),
  });

  const transaction = useMemo(() => {
    if (!data || txId == null) return undefined;
    return data.transactions.find((t) => t.id === txId);
  }, [data, txId]);

  const sourceType: CallQueueSourceType | undefined =
    transaction?.buyCryptoId != null ? 'BuyCrypto' : transaction?.buyFiatId != null ? 'BuyFiat' : undefined;
  const sourceTxId = transaction?.buyCryptoId ?? transaction?.buyFiatId;

  const bankData = useMemo(() => {
    if (!transaction || !data?.bankDatas.length) return undefined;
    return data.bankDatas.find((b) => b.approved && b.active) ?? data.bankDatas[0];
  }, [transaction, data]);

  if (!queue || !config) return <ErrorHint message={`Unknown call queue: ${queueParam}`} />;
  if (isLoading) return <StyledLoadingSpinner size={SpinnerSize.LG} />;
  if (error) return <ErrorHint message={error} />;
  if (!data || !userDataId) return <ErrorHint message="No data" />;

  const context = buildCallOutcomeContext({
    queue,
    userDataId: +userDataId,
    txId: sourceTxId,
    sourceType,
    amlCheck: transaction?.amlCheck,
    amlReason: transaction?.amlReason,
    buyCryptoResetEligible: transaction != null && canResetBuyCryptoAmlForReview(transaction),
  });

  return (
    <StyledVerticalStack gap={4} full>
      <CallQueueUserInfo
        userData={data.userData}
        users={data.users}
        kycSteps={data.kycSteps}
        highlightCheckDateField={config.highlightCheckDateField}
        title={translate('screens/compliance', 'User Info')}
      />
      {transaction && (
        <CallQueueTxInfo
          transaction={transaction}
          bankData={bankData}
          title={translate('screens/compliance', 'Transaction Info')}
        />
      )}
      {config.showAddressInfo && (
        <CallQueueAddressInfo userData={data.userData} title={translate('screens/compliance', 'Address')} />
      )}
      <CallQueueTransactionsList
        transactions={data.transactions}
        title={translate('screens/compliance', 'Transactions')}
      />
      {config.showBankTxInfo && (
        <CallQueueBankTxInfo
          bankTxs={data.bankTxs}
          highlightTransactionId={transaction?.id}
          title={translate('screens/compliance', 'Bank Transactions')}
        />
      )}
      <CallQueueIpCountries ipLogs={data.ipLogs ?? []} title={translate('screens/compliance', 'IP Countries')} />
      <CallQueueKycComments
        kycLogs={data.kycLogs ?? []}
        filterTypes={['ManualLog']}
        title={translate('screens/compliance', 'Recent KYC Comments')}
      />
      <CallQueueQuestions questions={callQueueQuestions[queue]} title={translate('screens/compliance', 'Questions')} />
      <CallQueueOutcomeForm
        context={context}
        availableOutcomes={config.outcomes}
        clerks={clerks}
        clerksError={clerksError}
        clerksLoading={clerksLoading}
        onSaved={() =>
          navigate({ pathname: `/compliance/call-queues/${queue}` }, { replace: true, clearParams: ['txId'] })
        }
        title={translate('screens/compliance', 'Save Outcome')}
      />
    </StyledVerticalStack>
  );
}
