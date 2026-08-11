import { CustodyOrderHistory, CustodyOrderHistoryStatus, CustodyOrderType, Utils } from '@dfx.swiss/react';
import {
  AlignContent,
  DfxAssetIcon,
  SpinnerSize,
  StyledDataTable,
  StyledDataTableRow,
  StyledLoadingSpinner,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useSettingsContext } from 'src/contexts/settings.context';
import { assetIconVariant } from 'src/util/asset-icon';
import { formatSwissDateTime } from 'src/util/utils';

interface TransactionHistoryProps {
  transactions: CustodyOrderHistory[];
  isLoading: boolean;
}

const ORDER_TYPE_LABELS: Record<CustodyOrderType, string> = {
  [CustodyOrderType.DEPOSIT]: 'Deposit',
  [CustodyOrderType.WITHDRAWAL]: 'Withdrawal',
  [CustodyOrderType.RECEIVE]: 'Deposit',
  [CustodyOrderType.SEND]: 'Withdrawal',
  [CustodyOrderType.SWAP]: 'Swap',
  [CustodyOrderType.EQUITY_MINT]: 'Mint',
  [CustodyOrderType.EQUITY_REDEEM]: 'Redeem',
  [CustodyOrderType.SAVING_DEPOSIT]: 'Deposit',
  [CustodyOrderType.SAVING_WITHDRAWAL]: 'Withdrawal',
};

const STATUS_LABELS: Record<CustodyOrderHistoryStatus, string> = {
  [CustodyOrderHistoryStatus.WAITING_FOR_PAYMENT]: 'Waiting for payment',
  [CustodyOrderHistoryStatus.CHECK_PENDING]: 'Check pending',
  [CustodyOrderHistoryStatus.PROCESSING]: 'Processing',
  [CustodyOrderHistoryStatus.COMPLETED]: 'Completed',
  [CustodyOrderHistoryStatus.FAILED]: 'Failed',
};

function formatAmount(amount?: number, asset?: string): string | undefined {
  if (amount === undefined || !asset) return undefined;
  return `${Utils.formatAmountCrypto(amount)} ${asset}`;
}

function formatTransfer(tx: CustodyOrderHistory): string {
  const input = formatAmount(tx.inputAmount, tx.inputAsset);
  const output = formatAmount(tx.outputAmount, tx.outputAsset);

  if (input && output) return `${output} → ${input}`;
  return input ?? output ?? '-';
}

function formatTimestamp(tx: CustodyOrderHistory): string | undefined {
  // completedAt is the valuta timestamp, and it only means anything while the order actually is
  // completed: the backend sets it once and never clears it, so an order moved back out of
  // Completed would otherwise keep showing a valuta it no longer has. Every other state has its
  // creation date and nothing else. A completed order without a valuta is an anomaly, and the
  // fallback in that branch does not repair it — it hides it behind a less precise date. That is
  // the right trade here and only here: the backend raises the same anomaly where interest depends
  // on it, whereas a row losing its date buys nobody anything. Production has no such order today
  // (the migration adding the column backfilled every completed row), so this covers a future
  // write path rather than a known gap. When talking to an API that predates both fields, the row
  // shows no date at all rather than "Invalid Date".
  const timestamp = tx.status === CustodyOrderHistoryStatus.COMPLETED ? (tx.completedAt ?? tx.created) : tx.created;
  if (!timestamp) return undefined;

  return formatSwissDateTime(timestamp);
}

export const TransactionHistory = ({ transactions, isLoading }: TransactionHistoryProps) => {
  const { translate } = useSettingsContext();

  return isLoading ? (
    <div className="w-full flex flex-col items-center justify-center gap-2 p-4">
      <StyledLoadingSpinner size={SpinnerSize.LG} />
    </div>
  ) : transactions?.length ? (
    <StyledVerticalStack full gap={2}>
      <h2 className="text-dfxBlue-800">{translate('screens/safe', 'Recent Activity')}</h2>
      <StyledDataTable alignContent={AlignContent.BETWEEN}>
        {transactions.map((tx, index) => (
          <StyledDataTableRow key={index}>
            <div className="w-full flex flex-row justify-between items-center gap-2 text-dfxBlue-800 p-2">
              <div className="flex flex-row items-center gap-3">
                {(tx.inputAsset ?? tx.outputAsset) && (
                  <DfxAssetIcon asset={assetIconVariant((tx.inputAsset ?? tx.outputAsset) as string)} />
                )}
                <div className="text-base flex flex-col font-semibold text-left leading-none gap-1">
                  {translate('screens/safe', ORDER_TYPE_LABELS[tx.type])}
                  <div className="text-sm text-dfxGray-700">
                    {[translate('screens/safe', STATUS_LABELS[tx.status]), formatTimestamp(tx)]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
              </div>
              <div className="text-base text-right font-semibold pr-1">{formatTransfer(tx)}</div>
            </div>
          </StyledDataTableRow>
        ))}
      </StyledDataTable>
    </StyledVerticalStack>
  ) : null;
};
