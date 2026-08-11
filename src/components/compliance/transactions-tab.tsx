import { Transaction, TransactionState, useTransaction } from '@dfx.swiss/react';
import { SpinnerSize, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { Fragment, useState } from 'react';
import { ChargebackModal } from 'src/components/compliance/chargeback-modal';
import { RecallDetailsModal } from 'src/components/compliance/recall-details-modal';
import { RecallModal } from 'src/components/compliance/recall-modal';
import { ConfirmDialog } from 'src/components/confirm-dialog';
import {
  BankDataInfo,
  BankTxInfo,
  CryptoInputInfo,
  RecallInfo,
  TransactionInfo,
  UserDataDetail,
  useCompliance,
} from 'src/hooks/compliance.hook';
import { boolBadge, DetailRow, statusBadge, TransactionDetailRows, formatDate } from 'src/util/compliance-helpers';
import { PdfLang } from 'src/util/pdf/support-pdf-common';

interface TransactionsTableProps {
  transactions: TransactionInfo[];
  bankTxs: BankTxInfo[];
  cryptoInputs: CryptoInputInfo[];
  bankDatas: BankDataInfo[];
  userData: UserDataDetail;
  userDataId: number;
  expandedBankTxId?: number;
  expandedCryptoInputId?: number;
  expandedBankDataId?: number;
  expandedTxUid?: string;
  canPerformActions?: boolean;
  onExpandBankTx: (id: number | undefined) => void;
  onExpandCryptoInput: (id: number | undefined) => void;
  onExpandBankData: (id: number | undefined) => void;
  onExpandTxUid: (uid: string | undefined) => void;
  onStatusChanged?: () => void;
}

export function TransactionsTable({
  transactions,
  bankTxs,
  cryptoInputs,
  bankDatas,
  userData,
  userDataId,
  expandedBankTxId,
  expandedCryptoInputId,
  expandedBankDataId,
  expandedTxUid,
  canPerformActions = true,
  onExpandBankTx,
  onExpandCryptoInput,
  onExpandBankData,
  onExpandTxUid,
  onStatusChanged,
}: TransactionsTableProps): JSX.Element {
  const { getTransactionByUid } = useTransaction();
  const { downloadTransactionPdf, stopTransaction, resumeTransaction } = useCompliance();
  const [txDetailCache, setTxDetailCache] = useState<Map<string, Transaction>>(new Map());
  const [txDetailLoading, setTxDetailLoading] = useState<string>();
  const [txDetailErrors, setTxDetailErrors] = useState<Map<string, string>>(new Map());
  const [isPdfDownloading, setIsPdfDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string>();
  const [stoppingTxId, setStoppingTxId] = useState<number>();
  const [stopConfirmTxId, setStopConfirmTxId] = useState<number>();
  const [stopError, setStopError] = useState<string>();
  const [resumingTxId, setResumingTxId] = useState<number>();
  const [resumeConfirmTxId, setResumeConfirmTxId] = useState<number>();
  const [resumeError, setResumeError] = useState<string>();
  const [chargebackTxId, setChargebackTxId] = useState<number>();
  const [recallBankTxId, setRecallBankTxId] = useState<number>();
  const [viewingRecall, setViewingRecall] = useState<RecallInfo>();

  function setTxDetailError(uid: string, message: string): void {
    setTxDetailErrors((prev) => new Map(prev).set(uid, message));
  }

  function clearTxDetailError(uid: string): void {
    setTxDetailErrors((prev) => {
      const next = new Map(prev);
      next.delete(uid);
      return next;
    });
  }

  async function refreshTxDetail(uid: string): Promise<void> {
    try {
      const updatedDetail = await getTransactionByUid(uid);
      setTxDetailCache((prev) => new Map(prev).set(uid, updatedDetail));
      clearTxDetailError(uid);
    } catch (e) {
      setTxDetailCache((prev) => {
        const next = new Map(prev);
        next.delete(uid);
        return next;
      });
      setTxDetailError(uid, e instanceof Error ? e.message : 'Failed to refresh transaction details');
    }
  }

  async function confirmStop(): Promise<void> {
    const txId = stopConfirmTxId;
    if (!txId) return;
    const tx = transactions.find((t) => t.id === txId);
    setStoppingTxId(txId);
    setStopError(undefined);
    try {
      try {
        await stopTransaction(txId);
      } catch (e) {
        setStopError(e instanceof Error ? e.message : 'Stop failed');
        return;
      }

      setStopConfirmTxId(undefined);
      onStatusChanged?.();
      if (tx) await refreshTxDetail(tx.uid);
    } finally {
      setStoppingTxId((current) => (current === txId ? undefined : current));
    }
  }

  async function confirmResume(): Promise<void> {
    const txId = resumeConfirmTxId;
    if (!txId) return;
    const tx = transactions.find((t) => t.id === txId);
    setResumingTxId(txId);
    setResumeError(undefined);
    try {
      try {
        await resumeTransaction(txId);
      } catch (e) {
        setResumeError(e instanceof Error ? e.message : 'Resume failed');
        return;
      }

      setResumeConfirmTxId(undefined);
      onStatusChanged?.();
      if (tx) await refreshTxDetail(tx.uid);
    } finally {
      setResumingTxId((current) => (current === txId ? undefined : current));
    }
  }

  async function handleDownloadPdf(): Promise<void> {
    setIsPdfDownloading(true);
    setPdfError(undefined);
    try {
      await downloadTransactionPdf(userDataId);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'PDF download failed');
    } finally {
      setIsPdfDownloading(false);
    }
  }

  async function handleTxPdf(tx: TransactionInfo, ramp: 'onramp' | 'offramp', lang: PdfLang): Promise<void> {
    const bankTx = bankTxs?.find((b) => b.transactionId === tx.id);
    const cryptoInput = cryptoInputs?.find((c) => c.transactionId === tx.id);
    const { generateTransactionPdf } = await import('src/util/pdf/support-tx-pdf');
    generateTransactionPdf({
      transaction: tx,
      bankTx,
      cryptoInput,
      userData,
      ramp,
      lang,
    });
  }

  async function handleAccountInfoPdf(tx: TransactionInfo, lang: PdfLang): Promise<void> {
    const bankTx = bankTxs?.find((b) => b.transactionId === tx.id);
    const bankData = tx.bankDataId != null ? bankDatas?.find((b) => b.id === tx.bankDataId) : undefined;
    const { generateAccountInfoPdf } = await import('src/util/pdf/support-account-pdf');
    generateAccountInfoPdf({
      userData,
      transaction: tx,
      bankTx,
      bankData,
      lang,
    });
  }

  function handleUidClick(uid: string): void {
    if (expandedTxUid === uid) {
      onExpandTxUid(undefined);
      return;
    }

    onExpandTxUid(uid);
    clearTxDetailError(uid);

    if (txDetailCache.has(uid)) return;

    setTxDetailLoading(uid);
    getTransactionByUid(uid)
      .then((detail) => {
        setTxDetailCache((prev) => new Map(prev).set(uid, detail));
      })
      .catch((e: unknown) => {
        setTxDetailError(uid, e instanceof Error ? e.message : 'Failed to load transaction details');
      })
      .finally(() => setTxDetailLoading(undefined));
  }
  const bankTxByTxId = new Map(
    bankTxs
      ?.filter((b): b is BankTxInfo & { transactionId: number } => b.transactionId != null)
      .map((b) => [b.transactionId, b]),
  );
  const cryptoInputByTxId = new Map(
    cryptoInputs
      ?.filter((c): c is CryptoInputInfo & { transactionId: number } => c.transactionId != null)
      .map((c) => [c.transactionId, c]),
  );
  const bankDataById = new Map(bankDatas?.map((b) => [b.id, b]));

  return (
    <div>
      <div className="flex justify-end mb-1">
        {transactions?.length > 0 && (
          <button
            className="text-xs text-dfxBlue-300 underline hover:text-dfxBlue-800 disabled:opacity-50 disabled:no-underline"
            onClick={handleDownloadPdf}
            disabled={isPdfDownloading}
          >
            {isPdfDownloading ? 'Downloading...' : 'PDF'}
          </button>
        )}
      </div>
      {pdfError && <p className="text-xs text-primary-red mb-1">{pdfError}</p>}
      {stopError && <p className="text-xs text-primary-red mb-1">{stopError}</p>}
      {resumeError && <p className="text-xs text-primary-red mb-1">{resumeError}</p>}
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-dfxGray-300">
          <tr>
            <th className="px-3 py-2 text-center text-sm font-semibold text-dfxBlue-800">ID</th>
            <th className="px-3 py-2 text-center text-sm font-semibold text-dfxBlue-800">UID</th>
            <th className="px-3 py-2 text-left text-sm font-semibold text-dfxBlue-800">Type</th>
            <th className="px-3 py-2 text-left text-sm font-semibold text-dfxBlue-800">Source</th>
            <th className="px-3 py-2 text-right text-sm font-semibold text-dfxBlue-800">Input</th>
            <th className="px-3 py-2 text-right text-sm font-semibold text-dfxBlue-800">Amount (CHF)</th>
            <th className="px-3 py-2 text-right text-sm font-semibold text-dfxBlue-800">Amount (EUR)</th>
            <th className="px-3 py-2 text-right text-sm font-semibold text-dfxBlue-800">Output</th>
            <th className="px-3 py-2 text-center text-sm font-semibold text-dfxBlue-800">AML Check</th>
            <th className="px-3 py-2 text-center text-sm font-semibold text-dfxBlue-800">Chargeback</th>
            <th className="px-3 py-2 text-center text-sm font-semibold text-dfxBlue-800">Bank TX</th>
            <th className="px-3 py-2 text-center text-sm font-semibold text-dfxBlue-800">Bank Data</th>
            <th className="px-3 py-2 text-center text-sm font-semibold text-dfxBlue-800">Crypto In</th>
            <th className="px-3 py-2 text-center text-sm font-semibold text-dfxBlue-800">Created</th>
            <th className="px-3 py-2 text-center text-sm font-semibold text-dfxBlue-800">Completed</th>
          </tr>
        </thead>
        <tbody>
          {transactions?.length > 0 ? (
            transactions.map((tx) => {
              const bankTx = bankTxByTxId.get(tx.id);
              const cryptoInput = cryptoInputByTxId.get(tx.id);
              const bankData = tx.bankDataId != null ? bankDataById.get(tx.bankDataId) : undefined;
              const isBankTxExpanded = expandedBankTxId === bankTx?.id;
              const isCryptoExpanded = expandedCryptoInputId === cryptoInput?.id;
              const isBankDataExpanded = expandedBankDataId === bankData?.id;
              const detailError = txDetailErrors.get(tx.uid);

              return (
                <Fragment key={tx.id}>
                  <tr className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300">
                    <td className="px-3 py-2 text-sm text-dfxBlue-800">{tx.id}</td>
                    <td
                      className="px-3 py-2 text-sm text-dfxBlue-800 font-mono text-xs cursor-pointer text-dfxBlue-300 underline hover:text-dfxBlue-800"
                      onClick={() => handleUidClick(tx.uid)}
                    >
                      {tx.uid}
                    </td>
                    <td className="px-3 py-2 text-sm text-dfxBlue-800 text-left">{tx.type || '-'}</td>
                    <td className="px-3 py-2 text-sm text-dfxBlue-800 text-left">{tx.sourceType}</td>
                    <td className="px-3 py-2 text-sm text-dfxBlue-800 text-right">
                      {tx.inputAmount != null ? `${tx.inputAmount.toFixed(2)} ${tx.inputAsset ?? ''}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-sm text-dfxBlue-800 text-right">
                      {tx.amountInChf?.toFixed(2) || '-'}
                    </td>
                    <td className="px-3 py-2 text-sm text-dfxBlue-800 text-right">
                      {tx.amountInEur?.toFixed(2) || '-'}
                    </td>
                    <td className="px-3 py-2 text-sm text-dfxBlue-800 text-right">
                      {tx.outputAmount != null && tx.outputAsset
                        ? `${tx.outputAmount} ${tx.outputAsset}`
                        : (tx.outputAsset ?? '-')}
                    </td>
                    <td className="px-3 py-2 text-sm text-dfxBlue-800">
                      {tx.amlCheck ? statusBadge(tx.amlCheck) : '-'}
                    </td>
                    <td className="px-3 py-2 text-sm text-dfxBlue-800 text-center">
                      {tx.chargebackDate ? (
                        <span className="text-primary-red">
                          {formatDate(tx.chargebackDate)}
                          {tx.amlReason && (
                            <>
                              <br />
                              <span className="text-xs">{tx.amlReason}</span>
                            </>
                          )}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-dfxBlue-800 text-center">
                      {bankTx ? (
                        <button
                          className="text-dfxBlue-300 underline hover:text-dfxBlue-800"
                          onClick={() => onExpandBankTx(isBankTxExpanded ? undefined : bankTx.id)}
                        >
                          {bankTx.id}
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-dfxBlue-800 text-center">
                      {bankData ? (
                        <button
                          className="text-dfxBlue-300 underline hover:text-dfxBlue-800"
                          onClick={() => onExpandBankData(isBankDataExpanded ? undefined : bankData.id)}
                        >
                          {bankData.id}
                        </button>
                      ) : (
                        (tx.bankDataId ?? '-')
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-dfxBlue-800 text-center">
                      {cryptoInput ? (
                        <button
                          className="text-dfxBlue-300 underline hover:text-dfxBlue-800"
                          onClick={() => onExpandCryptoInput(isCryptoExpanded ? undefined : cryptoInput.id)}
                        >
                          {cryptoInput.id}
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-dfxBlue-800">{formatDate(tx.created)}</td>
                    <td className="px-3 py-2 text-sm text-dfxBlue-800 text-center">
                      {tx.isCompleted ? (
                        <span className="text-green-500">Yes</span>
                      ) : (
                        <span className="text-yellow-500">No</span>
                      )}
                    </td>
                  </tr>

                  {isBankTxExpanded && bankTx && (
                    <tr key={`bankTx-${bankTx.id}`} className="bg-dfxGray-300/50">
                      <td colSpan={15} className="px-6 py-3">
                        <table className="text-sm text-dfxBlue-800 text-left">
                          <tbody>
                            <DetailRow label="Account Service Ref" value={bankTx.accountServiceRef} />
                            <DetailRow label="Name" value={bankTx.name} />
                            <DetailRow label="IBAN" value={bankTx.iban} mono />
                            <DetailRow label="Remittance Info" value={bankTx.remittanceInfo} />
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}

                  {isBankDataExpanded && bankData && (
                    <tr key={`bankData-${bankData.id}`} className="bg-dfxGray-300/50">
                      <td colSpan={15} className="px-6 py-3">
                        <table className="text-sm text-dfxBlue-800 text-left">
                          <tbody>
                            <DetailRow label="IBAN" value={bankData.iban} mono />
                            <DetailRow label="Name" value={bankData.name} />
                            <DetailRow label="Type" value={bankData.type} />
                            {bankData.status && (
                              <tr>
                                <td className="pr-3 py-0.5 font-medium whitespace-nowrap">Status:</td>
                                <td className="py-0.5">{statusBadge(bankData.status)}</td>
                              </tr>
                            )}
                            <tr>
                              <td className="pr-3 py-0.5 font-medium whitespace-nowrap">Approved:</td>
                              <td className="py-0.5">{boolBadge(bankData.approved)}</td>
                            </tr>
                            {bankData.manualApproved != null && (
                              <tr>
                                <td className="pr-3 py-0.5 font-medium whitespace-nowrap">Manual Approved:</td>
                                <td className="py-0.5">{boolBadge(bankData.manualApproved)}</td>
                              </tr>
                            )}
                            <tr>
                              <td className="pr-3 py-0.5 font-medium whitespace-nowrap">Active:</td>
                              <td className="py-0.5">{boolBadge(bankData.active)}</td>
                            </tr>
                            <DetailRow label="Comment" value={bankData.comment} />
                            <DetailRow label="Created" value={formatDate(bankData.created)} />
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}

                  {isCryptoExpanded && cryptoInput && (
                    <tr key={`ci-${cryptoInput.id}`} className="bg-dfxGray-300/50">
                      <td colSpan={15} className="px-6 py-3">
                        <table className="text-sm text-dfxBlue-800 text-left">
                          <tbody>
                            <DetailRow
                              label="TX ID"
                              value={cryptoInput.inTxId}
                              url={cryptoInput.inTxExplorerUrl}
                              mono
                            />
                            <DetailRow
                              label="Asset"
                              value={
                                cryptoInput.assetName
                                  ? `${cryptoInput.assetName} (${cryptoInput.blockchain})`
                                  : cryptoInput.blockchain
                              }
                            />
                            <DetailRow label="Amount" value={cryptoInput.amount} />
                            <DetailRow label="Status" value={cryptoInput.status} />
                            <DetailRow label="Sender" value={cryptoInput.senderAddresses} mono />
                            <DetailRow
                              label="Return TX"
                              value={cryptoInput.returnTxId}
                              url={cryptoInput.returnTxExplorerUrl}
                              mono
                            />
                            <DetailRow label="Purpose" value={cryptoInput.purpose} />
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}

                  {expandedTxUid === tx.uid && (
                    <tr key={`txDetail-${tx.uid}`} className="bg-dfxGray-300/50">
                      <td colSpan={15} className="px-6 py-3">
                        {txDetailLoading === tx.uid ? (
                          <StyledLoadingSpinner size={SpinnerSize.SM} />
                        ) : detailError != null && !txDetailCache.has(tx.uid) ? (
                          <p className="text-primary-red text-sm">{detailError}</p>
                        ) : txDetailCache.has(tx.uid) ? (
                          (() => {
                            const detail = txDetailCache.get(tx.uid) as Transaction;
                            const isStopped = (detail.state as string) === 'Stopped';
                            return (
                              <>
                                <TransactionDetailRows
                                  tx={detail}
                                  amlCheck={tx.amlCheck}
                                  amlReason={tx.amlReason}
                                  comment={tx.comment}
                                  chargebackAllowedDate={tx.chargebackAllowedDate}
                                  chargebackAllowedDateUser={tx.chargebackAllowedDateUser}
                                  scorechainLink={{
                                    userDataId,
                                    buyCryptoId: tx.buyCryptoId,
                                    buyFiatId: tx.buyFiatId,
                                  }}
                                />
                                {(() => {
                                  const canStop = tx.type === 'BuyCrypto' && !tx.isCompleted;
                                  const canResume = tx.type === 'BuyCrypto' && !tx.isCompleted && isStopped;
                                  const canChargeback =
                                    [
                                      TransactionState.FAILED,
                                      TransactionState.CHECK_PENDING,
                                      TransactionState.KYC_REQUIRED,
                                      TransactionState.LIMIT_EXCEEDED,
                                      TransactionState.UNASSIGNED,
                                    ].includes(detail.state) && !detail.chargebackAmount;
                                  const existingRecall = bankTx?.recall;
                                  const canRecall = bankTx != null && !existingRecall;
                                  const showStop = canStop && canPerformActions;
                                  const showResume = canResume && canPerformActions;
                                  const showChargeback = canChargeback && canPerformActions;
                                  const showRecall = canRecall && canPerformActions;
                                  const ramp: 'onramp' | 'offramp' | undefined =
                                    tx.type === 'BuyCrypto' ? 'onramp' : tx.type === 'BuyFiat' ? 'offramp' : undefined;
                                  const showRampPdf = ramp != null;
                                  if (
                                    !showStop &&
                                    !showResume &&
                                    !showChargeback &&
                                    !showRecall &&
                                    !existingRecall &&
                                    !showRampPdf
                                  )
                                    return null;
                                  return (
                                    <div className="mt-3 pt-3 border-t border-dfxGray-400/50 flex gap-2 flex-wrap">
                                      {showRampPdf && (
                                        <>
                                          <button
                                            className="px-3 py-1 text-xs text-dfxBlue-800 bg-dfxGray-300 hover:bg-dfxGray-400/80 rounded transition-colors"
                                            onClick={() => handleTxPdf(tx, ramp, 'de')}
                                          >
                                            Transaction PDF (DE)
                                          </button>
                                          <button
                                            className="px-3 py-1 text-xs text-dfxBlue-800 bg-dfxGray-300 hover:bg-dfxGray-400/80 rounded transition-colors"
                                            onClick={() => handleTxPdf(tx, ramp, 'en')}
                                          >
                                            Transaction PDF (EN)
                                          </button>
                                          <button
                                            className="px-3 py-1 text-xs text-dfxBlue-800 bg-dfxGray-300 hover:bg-dfxGray-400/80 rounded transition-colors"
                                            onClick={() => handleAccountInfoPdf(tx, 'de')}
                                          >
                                            Account PDF (DE)
                                          </button>
                                          <button
                                            className="px-3 py-1 text-xs text-dfxBlue-800 bg-dfxGray-300 hover:bg-dfxGray-400/80 rounded transition-colors"
                                            onClick={() => handleAccountInfoPdf(tx, 'en')}
                                          >
                                            Account PDF (EN)
                                          </button>
                                        </>
                                      )}
                                      {showStop && (
                                        <button
                                          className="px-3 py-1 text-xs text-white bg-dfxRed-100 hover:bg-dfxRed-100/80 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                          onClick={() => setStopConfirmTxId(tx.id)}
                                          disabled={stoppingTxId === tx.id || isStopped}
                                        >
                                          {stoppingTxId === tx.id ? 'Stopping...' : isStopped ? 'Stopped' : 'Stop'}
                                        </button>
                                      )}
                                      {showResume && (
                                        <button
                                          className="px-3 py-1 text-xs text-white bg-dfxBlue-800 hover:bg-dfxBlue-800/80 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                          onClick={() => setResumeConfirmTxId(tx.id)}
                                          disabled={resumingTxId === tx.id}
                                        >
                                          {resumingTxId === tx.id ? 'Resuming...' : 'Resume'}
                                        </button>
                                      )}
                                      {showChargeback && (
                                        <button
                                          className="px-3 py-1 text-xs text-white bg-dfxRed-100 hover:bg-dfxRed-100/80 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                          onClick={() => setChargebackTxId(tx.id)}
                                        >
                                          Chargeback
                                        </button>
                                      )}
                                      {showRecall && (
                                        <button
                                          className="px-3 py-1 text-xs text-white bg-dfxRed-100 hover:bg-dfxRed-100/80 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                          onClick={() => setRecallBankTxId(bankTx.id)}
                                        >
                                          Recall
                                        </button>
                                      )}
                                      {existingRecall && (
                                        <button
                                          className="px-3 py-1 text-xs text-dfxBlue-800 bg-dfxGray-300 hover:bg-dfxGray-400/80 rounded transition-colors"
                                          onClick={() => setViewingRecall(existingRecall)}
                                        >
                                          Recall #{existingRecall.id}
                                        </button>
                                      )}
                                    </div>
                                  );
                                })()}
                              </>
                            );
                          })()
                        ) : null}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          ) : (
            <tr>
              <td colSpan={15} className="px-3 py-4 text-center text-dfxGray-700">
                No transactions
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <ConfirmDialog
        isOpen={stopConfirmTxId != null}
        title="Transaktion stoppen"
        message="Möchtest du diese Transaktion wirklich stoppen? Nach dem Stopp muss sie manuell weiterbearbeitet werden."
        confirmLabel="Stop"
        destructive
        isLoading={stoppingTxId != null && stoppingTxId === stopConfirmTxId}
        onConfirm={confirmStop}
        onCancel={() => setStopConfirmTxId(undefined)}
      />
      <ConfirmDialog
        isOpen={resumeConfirmTxId != null}
        title="Transaktion fortsetzen"
        message="Möchtest du diese Transaktion wirklich fortsetzen? Sie geht zurück in die automatische Verarbeitung."
        confirmLabel="Resume"
        isLoading={resumingTxId != null && resumingTxId === resumeConfirmTxId}
        onConfirm={confirmResume}
        onCancel={() => setResumeConfirmTxId(undefined)}
      />
      <ChargebackModal
        isOpen={chargebackTxId != null}
        transactionId={chargebackTxId}
        transactionType={transactions.find((t) => t.id === chargebackTxId)?.type}
        sourceType={transactions.find((t) => t.id === chargebackTxId)?.sourceType}
        onClose={() => setChargebackTxId(undefined)}
        onSuccess={() => {
          if (chargebackTxId) {
            const tx = transactions.find((t) => t.id === chargebackTxId);
            if (tx) {
              getTransactionByUid(tx.uid).then((detail) => {
                setTxDetailCache((prev) => new Map(prev).set(tx.uid, detail));
              });
            }
          }
          setChargebackTxId(undefined);
          onStatusChanged?.();
        }}
      />
      <RecallModal
        isOpen={recallBankTxId != null}
        bankTxId={recallBankTxId}
        onClose={() => setRecallBankTxId(undefined)}
        onSuccess={() => setRecallBankTxId(undefined)}
      />
      <RecallDetailsModal
        isOpen={viewingRecall != null}
        recall={viewingRecall}
        onClose={() => setViewingRecall(undefined)}
      />
    </div>
  );
}
