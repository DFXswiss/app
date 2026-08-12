import { AmlReason, CallQueue, CheckStatus } from '@dfx.swiss/react';
import { useState } from 'react';
import type { ComplianceUserData, TransactionInfo } from 'src/hooks/compliance.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { canResetBuyCryptoAmlForReview, hasBuyCryptoReviewResetEligibleState } from 'src/util/buy-crypto-reset.util';
import { statusBadge } from 'src/util/compliance-helpers';
import { hasScorechainHighRisk, scorechainHighlightValue } from 'src/util/scorechain.util';
import { formatSwissDate } from 'src/util/utils';

function callQueueForReason(reason: string | undefined): CallQueue | undefined {
  return reason && (Object.values(CallQueue) as string[]).includes(reason) ? (reason as CallQueue) : undefined;
}

export interface AmlCheckUpdate {
  amlCheck?: string;
  amlReason?: string;
  comment?: string;
  priceDefinitionAllowedDate?: string;
}

interface AmlCheckPendingPanelProps {
  data: ComplianceUserData;
  clerks: string[];
  isSaving: boolean;
  onUpdate: (tx: TransactionInfo, update: AmlCheckUpdate, clerk: string) => Promise<void>;
  onReset: (tx: TransactionInfo, clerk: string) => Promise<void>;
  onReviewReset: (tx: TransactionInfo) => Promise<void>;
}

const AML_CHECK_OPTIONS = [CheckStatus.PASS, CheckStatus.FAIL, CheckStatus.PENDING, 'Reset'] as const;

const AML_REASON_OPTIONS: AmlReason[] = [
  AmlReason.NA,
  ...(Object.values(AmlReason) as AmlReason[]).filter((r) => r !== AmlReason.NA).sort((a, b) => a.localeCompare(b)),
];

function TransactionEntry({
  tx,
  clerks,
  onUpdate,
  onReset,
  isSaving,
  userDataId,
  canResetBuyCrypto,
}: {
  tx: TransactionInfo;
  clerks: string[];
  onUpdate: (data: AmlCheckUpdate, clerk: string) => Promise<void>;
  onReset: (clerk: string) => Promise<void>;
  isSaving: boolean;
  userDataId?: number;
  canResetBuyCrypto: boolean;
}): JSX.Element {
  const { navigate } = useNavigation();
  const [amlCheck, setAmlCheck] = useState(tx.amlCheck ?? '');
  const [amlReason, setAmlReason] = useState<AmlReason>((tx.amlReason as AmlReason) ?? AmlReason.NA);
  const [setPriceDate, setSetPriceDate] = useState(false);
  const [clerk, setClerk] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  async function handleSave(): Promise<void> {
    if (!amlCheck || !clerk) return;
    setIsProcessing(true);
    try {
      if (amlCheck === 'Reset') {
        await onReset(clerk);
      } else {
        await onUpdate(
          {
            amlCheck,
            amlReason,
            priceDefinitionAllowedDate: setPriceDate ? new Date().toISOString() : undefined,
          },
          clerk,
        );
      }
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Status */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-dfxGray-700 font-medium">Status:</span>
        {statusBadge(tx.amlCheck ?? '-')}
        <span className="text-xs text-dfxGray-700">Eingangsdatum: {formatSwissDate(tx.created)}</span>
      </div>

      {/* Checks / Info */}
      <div>
        <h3 className="text-dfxGray-700 mb-2 font-semibold text-sm">Transaction Details</h3>
        <div className="bg-white rounded-lg shadow-sm">
          <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
            <span className="text-sm text-dfxBlue-800">ID</span>
            <span className="text-sm text-dfxBlue-800">{tx.id}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
            <span className="text-sm text-dfxBlue-800">UID</span>
            <span className="text-sm text-dfxBlue-800 font-mono">{tx.uid}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
            <span className="text-sm text-dfxBlue-800">Type</span>
            <span className="text-sm text-dfxBlue-800">{tx.type ?? '-'}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
            <span className="text-sm text-dfxBlue-800">Source</span>
            <span className="text-sm text-dfxBlue-800">{tx.sourceType}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
            <span className="text-sm text-dfxBlue-800">Input</span>
            <span className="text-sm text-dfxBlue-800">
              {tx.inputAmount != null ? `${tx.inputAmount} ${tx.inputAsset ?? ''}` : '-'}
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
            <span className="text-sm text-dfxBlue-800">Input Tx Id</span>
            <span className="text-sm text-dfxBlue-800 font-mono break-all">{tx.inputTxId ?? '-'}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
            <span className="text-sm text-dfxBlue-800">CHF</span>
            <span className="text-sm text-dfxBlue-800">
              {tx.amountInChf != null ? `${tx.amountInChf.toFixed(2)}` : '-'}
            </span>
          </div>
          <div className="flex items-start justify-between px-3 py-2 border-b border-dfxGray-300">
            <span className="text-sm text-dfxBlue-800">Comment</span>
            <span className="text-sm text-dfxBlue-800 text-right max-w-[60%] whitespace-pre-wrap">
              {userDataId != null && hasScorechainHighRisk(tx.comment) ? (
                <button
                  className="text-dfxBlue-300 underline hover:text-dfxBlue-800 text-right"
                  onClick={() => {
                    const value = scorechainHighlightValue({ buyCryptoId: tx.buyCryptoId, buyFiatId: tx.buyFiatId });
                    navigate(
                      {
                        pathname: `/compliance/scorechain/user/${userDataId}`,
                        search: value ? `?highlight=${value}` : '',
                      },
                      { clearParams: ['status', 'search'] },
                    );
                  }}
                >
                  {tx.comment}
                </button>
              ) : (
                (tx.comment ?? '-')
              )}
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
            <span className="text-sm text-dfxBlue-800">AML Reason</span>
            <span className="text-sm text-dfxBlue-800">{tx.amlReason ?? '-'}</span>
          </div>
        </div>
      </div>

      {/* AML Decision */}
      <div>
        <h3 className="text-dfxGray-700 mb-2 font-semibold text-sm">Entscheid</h3>
        <div className="bg-white rounded-lg shadow-sm">
          <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
            <span className="text-sm text-dfxBlue-800">AmlCheck</span>
            <select
              className="ml-4 shrink-0 px-2 py-1 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800"
              value={amlCheck}
              onChange={(e) => setAmlCheck(e.target.value)}
            >
              <option value="">—</option>
              {AML_CHECK_OPTIONS.filter((opt) => opt !== 'Reset' || tx.buyCryptoId == null || canResetBuyCrypto).map(
                (opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ),
              )}
            </select>
          </div>
          {tx.buyCryptoId != null && !canResetBuyCrypto && (
            <p className="px-3 py-2 text-xs text-dfxGray-700 border-b border-dfxGray-300">
              Reset ist erst verfügbar, wenn der BuyCrypto noch unvollständig ist und kein Payout/Refund/Batch läuft.
            </p>
          )}
          <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
            <span className="text-sm text-dfxBlue-800">AmlReason</span>
            <select
              className="ml-4 shrink-0 px-2 py-1 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800 max-w-[250px]"
              value={amlReason}
              onChange={(e) => setAmlReason(e.target.value as AmlReason)}
            >
              {AML_REASON_OPTIONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300 last:border-0">
            <span className="text-sm text-dfxBlue-800">priceDefinitionAllowedDate setzen</span>
            <input
              type="checkbox"
              checked={setPriceDate}
              onChange={(e) => setSetPriceDate(e.target.checked)}
              className="rounded"
            />
          </div>
        </div>
      </div>

      {/* Clerk */}
      <div className="bg-white rounded-lg shadow-sm px-3 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-dfxBlue-800 font-medium">Editor:</span>
          <select
            className="ml-4 shrink-0 px-2 py-1 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800"
            value={clerk}
            onChange={(e) => setClerk(e.target.value)}
          >
            <option value="">—</option>
            {clerks.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <button
          className="px-4 py-2 text-sm text-white bg-dfxBlue-800 hover:bg-dfxBlue-800/80 rounded-lg transition-colors disabled:opacity-50"
          onClick={handleSave}
          disabled={isSaving || isProcessing || !amlCheck || !clerk}
        >
          {isProcessing ? 'Speichern...' : 'Speichern'}
        </button>
      </div>
    </div>
  );
}

function ResettableTransactionEntry({
  tx,
  isSaving,
  canReset,
  onReset,
}: {
  tx: TransactionInfo;
  isSaving: boolean;
  canReset: boolean;
  onReset: () => Promise<void>;
}): JSX.Element {
  const [isProcessing, setIsProcessing] = useState(false);
  const sourceLabel = `BuyCrypto ${tx.buyCryptoId}`;

  async function handleReset(): Promise<void> {
    if (!canReset || isSaving || isProcessing) return;
    if (
      !window.confirm(
        `AML-Check für ${sourceLabel} wirklich zurücksetzen?\n\nDer Status ${tx.amlCheck} wird entfernt und die Transaktion erneut durch den AML-Check verarbeitet.`,
      )
    )
      return;

    setIsProcessing(true);
    try {
      await onReset();
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 text-left flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-dfxBlue-800 font-semibold">{sourceLabel}</h3>
          <p className="text-xs text-dfxGray-700">
            Transaction {tx.id} · AML {tx.amlCheck}
            {tx.amlReason ? ` · ${tx.amlReason}` : ''}
            {tx.buyCryptoStatus ? ` · Status ${tx.buyCryptoStatus}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="px-3 py-1.5 text-sm text-white bg-dfxRed-100 hover:bg-dfxRed-150 rounded transition-colors disabled:opacity-50"
            disabled={!canReset || isSaving || isProcessing}
            onClick={handleReset}
          >
            {isProcessing ? 'Wird zurückgesetzt...' : 'AML-Check zurücksetzen'}
          </button>
        </div>
      </div>
      {!canReset && (
        <p className="text-sm text-dfxRed-100">
          Reset nicht möglich: BuyCrypto ist abgeschlossen, gestoppt, in Batch/Chargeback oder Refund/Payout läuft.
        </p>
      )}
    </div>
  );
}

export function AmlCheckPendingPanel({
  data,
  clerks,
  isSaving,
  onUpdate,
  onReset,
  onReviewReset,
}: AmlCheckPendingPanelProps): JSX.Element {
  const { navigate } = useNavigation();

  const pendingTxs = data.transactions.filter(
    (tx) => tx.type != null && tx.amlCheck === CheckStatus.PENDING && tx.amlReason === AmlReason.MANUAL_CHECK,
  );
  const callQueueTxs = data.transactions.filter(
    (tx) => tx.type != null && tx.amlCheck === CheckStatus.PENDING && callQueueForReason(tx.amlReason),
  );
  const handledTransactionIds = new Set([...pendingTxs, ...callQueueTxs].map((tx) => tx.id));
  const resettableTxs = data.transactions.filter(
    (tx) =>
      tx.type != null &&
      tx.amlCheck != null &&
      hasBuyCryptoReviewResetEligibleState(tx) &&
      !handledTransactionIds.has(tx.id),
  );
  const ud = data.userData;

  const walletNames = Array.from(new Set(data.users.map((u) => u.walletName).filter((n): n is string => !!n)));
  const latestManualLogComment = (data.kycLogs ?? [])
    .filter((l) => l.type === 'ManualLog' && l.comment)
    .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())[0]?.comment;

  // User context info
  const userInfo = (
    <div>
      <h3 className="text-dfxGray-700 mb-2 font-semibold text-sm">User Kontext</h3>
      <div className="bg-white rounded-lg shadow-sm">
        <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
          <span className="text-sm text-dfxBlue-800">Wallet</span>
          <span className="text-sm text-dfxBlue-800">{walletNames.length ? walletNames.join(', ') : '-'}</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
          <span className="text-sm text-dfxBlue-800">UserDataId</span>
          <span className="text-sm text-dfxBlue-800">{String(ud.id ?? '-')}</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
          <span className="text-sm text-dfxBlue-800">KycLevel</span>
          <span className="text-sm text-dfxBlue-800">{String(ud.kycLevel ?? '-')}</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
          <span className="text-sm text-dfxBlue-800">KycStatus</span>
          <span className="text-sm text-dfxBlue-800">{String(ud.kycStatus ?? '-')}</span>
        </div>
        <div className="flex items-start justify-between px-3 py-2 border-b border-dfxGray-300">
          <span className="text-sm text-dfxBlue-800">KycLog Manual Comment</span>
          <span className="text-sm text-dfxBlue-800 text-right max-w-[60%] whitespace-pre-wrap">
            {latestManualLogComment ?? '-'}
          </span>
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
          <span className="text-sm text-dfxBlue-800">Status</span>
          <span className="text-sm text-dfxBlue-800">{String(ud.status ?? '-')}</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
          <span className="text-sm text-dfxBlue-800">RiskStatus</span>
          <span className="text-sm text-dfxBlue-800">{String(ud.riskStatus ?? '-')}</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
          <span className="text-sm text-dfxBlue-800">VerifiedName</span>
          <span className="text-sm text-dfxBlue-800">{String(ud.verifiedName ?? '-')}</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300">
          <span className="text-sm text-dfxBlue-800">Mail</span>
          <span className="text-sm text-dfxBlue-800">{String(ud.mail ?? '-')}</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-b border-dfxGray-300 last:border-0">
          <span className="text-sm text-dfxBlue-800">Nationality</span>
          <span className="text-sm text-dfxBlue-800">
            {String(
              typeof ud.nationality === 'object' && ud.nationality
                ? ((ud.nationality as Record<string, unknown>).name ?? '-')
                : (ud.nationality ?? '-'),
            )}
          </span>
        </div>
      </div>
    </div>
  );

  const callQueueInfo =
    callQueueTxs.length > 0 ? (
      <div className="bg-white rounded-lg shadow-sm p-4 text-left">
        <h3 className="text-dfxGray-700 mb-2 font-semibold text-sm">Weitere AML-Prüfungen über Call-Queue</h3>
        <p className="text-xs text-dfxGray-700 mb-3">
          Diese pendenten Transaktionen werden über die Call-Queue bearbeitet.
        </p>
        <ul className="divide-y divide-dfxGray-300 border-t border-dfxGray-300">
          {callQueueTxs.map((tx) => {
            const queue = callQueueForReason(tx.amlReason);
            const canNavigate = queue != null && ud.id != null;
            return (
              <li key={tx.id} className="py-2 flex items-start justify-between gap-3">
                <div className="text-sm text-dfxBlue-800 flex flex-col items-start flex-1 min-w-0 text-left">
                  <span>
                    <span className="font-mono">{tx.id}</span> · {tx.type ?? '-'}
                  </span>
                  <span className="text-xs text-dfxGray-700 break-all">{tx.amlReason}</span>
                </div>
                {canNavigate && (
                  <button
                    className="px-2 py-1 text-xs font-medium text-white rounded transition-colors bg-dfxBlue-800 hover:bg-dfxBlue-800/80 shrink-0"
                    onClick={() =>
                      navigate(
                        {
                          pathname: `/compliance/call-queues/${queue}/${ud.id}`,
                          search: `?txId=${tx.id}`,
                        },
                        { clearParams: ['status', 'search'] },
                      )
                    }
                  >
                    Zur Call-Queue
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

  if (pendingTxs.length === 0 && resettableTxs.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {userInfo}
        <div className="bg-white rounded-lg shadow-sm p-6 text-center text-dfxGray-700">
          Keine pendenten AML-Prüfungen vorhanden.
        </div>
        {callQueueInfo}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {userInfo}
      {callQueueInfo}
      {resettableTxs.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-dfxGray-700 font-semibold text-sm">Bestehenden AML-Check zurücksetzen</h3>
          {resettableTxs.map((tx) => (
            <ResettableTransactionEntry
              key={tx.id}
              tx={tx}
              isSaving={isSaving}
              canReset={canResetBuyCryptoAmlForReview(tx)}
              onReset={() => onReviewReset(tx)}
            />
          ))}
        </div>
      )}
      {pendingTxs.map((tx) => (
        <div key={tx.id} className="border-b border-dfxGray-300 pb-6 last:border-0">
          <TransactionEntry
            tx={tx}
            clerks={clerks}
            onUpdate={(updateData, clerk) => onUpdate(tx, updateData, clerk)}
            onReset={(clerk) => onReset(tx, clerk)}
            isSaving={isSaving}
            userDataId={ud.id}
            canResetBuyCrypto={canResetBuyCryptoAmlForReview(tx)}
          />
        </div>
      ))}
    </div>
  );
}
