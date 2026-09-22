import { CallQueue, CallQueueSourceType, CheckStatus, useSessionContext } from '@dfx.swiss/react';
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
import { CallOutcome, ComplianceUserData, useCompliance } from 'src/hooks/compliance.hook';
import { useComplianceGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { canResetBuyCryptoAmlForReview } from 'src/util/buy-crypto-reset.util';
import { callQueueLabel, DecisionQueue, effectiveCallQueue } from 'src/util/call-queue.util';

type CheckDateField =
  'phoneCallCheckDate' | 'phoneCallIpCheckDate' | 'phoneCallIpCountryCheckDate' | 'phoneCallExternalAccountCheckDate';

type QueueConfig = {
  highlightCheckDateField: CheckDateField;
  showAddressInfo?: boolean;
  showBankTxInfo?: boolean;
};

const OUTCOMES: CallOutcome[] = [
  CallOutcome.COMPLETED,
  CallOutcome.UNAVAILABLE,
  CallOutcome.FAILED,
  CallOutcome.REPEAT,
];

// Keyed by the reason queue a transaction is decided in. A Callback item resolves to one of these
// through its AML reason (effectiveCallQueue).
const QUEUE_CONFIG: Record<DecisionQueue, QueueConfig> = {
  [CallQueue.MANUAL_CHECK_PHONE]: {
    highlightCheckDateField: 'phoneCallCheckDate',
  },
  [CallQueue.MANUAL_CHECK_IP_PHONE]: {
    highlightCheckDateField: 'phoneCallIpCheckDate',
  },
  [CallQueue.MANUAL_CHECK_IP_COUNTRY_PHONE]: {
    highlightCheckDateField: 'phoneCallIpCountryCheckDate',
    showAddressInfo: true,
  },
  [CallQueue.MANUAL_CHECK_EXTERNAL_ACCOUNT_PHONE]: {
    highlightCheckDateField: 'phoneCallExternalAccountCheckDate',
    showBankTxInfo: true,
  },
};

// Repeat releases a pending transaction from its queue; a failed one (the customer refused the call
// and allowed calls again) has nothing to release, it is revived by a completed call or failed for good.
function outcomesFor(amlCheck: string | undefined): CallOutcome[] {
  return amlCheck === CheckStatus.FAIL ? OUTCOMES.filter((o) => o !== CallOutcome.REPEAT) : OUTCOMES;
}

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
  const query = new URLSearchParams(search);
  const txIdParam = query.get('txId');
  const txId = txIdParam ? Number(txIdParam) : undefined;

  const queue = isCallQueue(queueParam) ? queueParam : undefined;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [data, setData] = useState<ComplianceUserData>();

  useEffect(() => {
    if (!isLoggedIn || !userDataId || !queue) return;
    // The route can move to another account while a load is in flight (list → item → next item on the
    // same screen instance); a response for the account shown before must not land on the one shown now.
    let current = true;
    setIsLoading(true);
    setError(undefined);
    setData(undefined);
    getUserData(+userDataId)
      .then((loaded) => {
        if (current) setData(loaded);
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setIsLoading(false);
      });
    return () => {
      current = false;
    };
  }, [isLoggedIn, userDataId, queue]);

  useLayoutOptions({
    title: queue ? `${callQueueLabel(queue)} – ${userDataId ?? ''}` : translate('screens/compliance', 'Call Queue'),
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

  if (!queue) return <ErrorHint message={`Unknown call queue: ${queueParam}`} />;
  if (isLoading) return <StyledLoadingSpinner size={SpinnerSize.LG} />;
  if (error) return <ErrorHint message={error} />;
  if (!data || !userDataId) return <ErrorHint message="No data" />;

  // Which check date, which extra panels and which questions: the reason queue the transaction is
  // decided in (for a Callback item the one it was parked from).
  const decisionQueue = effectiveCallQueue(queue, transaction?.amlReason);
  const config = QUEUE_CONFIG[decisionQueue];

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
      <CallQueueQuestions
        questions={callQueueQuestions[decisionQueue]}
        title={translate('screens/compliance', 'Questions')}
      />
      <CallQueueOutcomeForm
        key={`${userDataId}-${txId ?? ''}`}
        context={context}
        availableOutcomes={outcomesFor(transaction?.amlCheck)}
        onSaved={() =>
          navigate({ pathname: `/compliance/call-queues/${queue}` }, { replace: true, clearParams: ['txId'] })
        }
        title={translate('screens/compliance', 'Save Outcome')}
      />
    </StyledVerticalStack>
  );
}
