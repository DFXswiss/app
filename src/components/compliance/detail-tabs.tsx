import { ReactNode } from 'react';
import {
  BankDataInfo,
  BuyRouteInfo,
  KycLogInfo,
  KycStepInfo,
  NotificationInfo,
  RefRewardInfo,
  SellRouteInfo,
  SwapRouteInfo,
  UserInfo,
  VirtualIbanInfo,
} from 'src/hooks/compliance.hook';
import { boolBadge, formatDate, statusBadge } from 'src/util/compliance-helpers';

interface ColumnDef<T> {
  header: string;
  align?: 'left' | 'center' | 'right';
  render: (item: T) => ReactNode;
  className?: string;
}

function DataTable<T extends { id: number }>({
  data,
  columns,
  emptyLabel,
}: {
  data: T[];
  columns: ColumnDef<T>[];
  emptyLabel: string;
}): JSX.Element {
  return (
    <table className="w-full border-collapse">
      <thead className="sticky top-0 bg-dfxGray-300">
        <tr>
          {columns.map((col) => (
            <th
              key={col.header}
              className={`px-3 py-2 text-sm font-semibold text-dfxBlue-800 text-${col.align ?? 'center'}`}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data?.length > 0 ? (
          data.map((item) => (
            <tr key={item.id} className="border-b border-dfxGray-300 transition-colors hover:bg-dfxGray-300">
              {columns.map((col) => (
                <td
                  key={col.header}
                  className={`px-3 py-2 text-sm text-dfxBlue-800 text-${col.align ?? 'center'} ${col.className ?? ''}`}
                >
                  {col.render(item)}
                </td>
              ))}
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={columns.length} className="px-3 py-4 text-center text-dfxGray-700">
              {emptyLabel}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

const usersColumns: ColumnDef<UserInfo>[] = [
  { header: 'ID', render: (u) => u.id },
  { header: 'Address', align: 'left', render: (u) => u.address, className: 'font-mono' },
  { header: 'Wallet', align: 'left', render: (u) => u.walletName || '-' },
  { header: 'Ref', render: (u) => u.ref || '-' },
  { header: 'Role', render: (u) => u.role },
  { header: 'Status', render: (u) => u.status },
  { header: 'Created', render: (u) => formatDate(u.created) },
];

export function UsersTable({ users }: { users: UserInfo[] }): JSX.Element {
  return <DataTable data={users} columns={usersColumns} emptyLabel="No users" />;
}

function formatStepResult(stepName: string, result?: string): string {
  if (!result) return '-';

  switch (stepName) {
    case 'Recommendation': {
      try {
        const parsed = JSON.parse(result) as unknown;
        if (parsed && typeof parsed === 'object' && 'key' in parsed) {
          return String((parsed as { key: unknown }).key);
        }
      } catch {
        // not JSON
      }
      return result;
    }

    case 'NationalityData': {
      try {
        const parsed = JSON.parse(result) as { nationality?: { id: number; symbol: string } };
        if (parsed.nationality?.symbol) return parsed.nationality.symbol;
      } catch {
        // not JSON
      }
      return '-';
    }

    default:
      return '-';
  }
}

const kycStepsColumns: ColumnDef<KycStepInfo>[] = [
  { header: 'ID', render: (s) => s.id },
  { header: 'Name', align: 'left', render: (s) => s.name },
  { header: 'Type', align: 'left', render: (s) => s.type || '-' },
  { header: 'Status', render: (s) => statusBadge(s.status) },
  { header: 'Sequence', render: (s) => s.sequenceNumber },
  {
    header: 'Result',
    align: 'left',
    render: (s) => <span title={s.result}>{formatStepResult(s.name, s.result)}</span>,
    className: 'max-w-xs truncate',
  },
  {
    header: 'Comment',
    align: 'left',
    render: (s) => <span title={s.comment}>{s.comment || '-'}</span>,
    className: 'max-w-xs truncate',
  },
  { header: 'Created', render: (s) => formatDate(s.created) },
];

export function KycStepsTable({ kycSteps }: { kycSteps: KycStepInfo[] }): JSX.Element {
  return <DataTable data={kycSteps} columns={kycStepsColumns} emptyLabel="No KYC steps" />;
}

const kycLogsColumns: ColumnDef<KycLogInfo>[] = [
  { header: 'Date', render: (l) => formatDate(l.created) },
  { header: 'Type', align: 'left', render: (l) => l.type },
  {
    header: 'Result',
    align: 'left',
    render: (l) => <span title={l.result}>{l.result || '-'}</span>,
    className: 'max-w-xs truncate',
  },
  { header: 'Comment', align: 'left', render: (l) => l.comment || '-' },
];

export function KycLogsTable({ kycLogs }: { kycLogs: KycLogInfo[] }): JSX.Element {
  return <DataTable data={kycLogs} columns={kycLogsColumns} emptyLabel="No KYC logs" />;
}

const bankDatasColumns: ColumnDef<BankDataInfo>[] = [
  { header: 'ID', render: (b) => b.id },
  { header: 'IBAN', align: 'left', render: (b) => b.iban, className: 'font-mono' },
  { header: 'Name', align: 'left', render: (b) => b.name },
  { header: 'Type', render: (b) => b.type || '-' },
  { header: 'Status', render: (b) => (b.status ? statusBadge(b.status) : '-') },
  { header: 'Approved', render: (b) => boolBadge(b.approved) },
  { header: 'Manual', render: (b) => (b.manualApproved == null ? '-' : boolBadge(b.manualApproved)) },
  { header: 'Active', render: (b) => boolBadge(b.active) },
  {
    header: 'Comment',
    align: 'left',
    render: (b) => <span title={b.comment}>{b.comment || '-'}</span>,
    className: 'max-w-xs truncate',
  },
  { header: 'Created', render: (b) => formatDate(b.created) },
];

export function BankDatasTable({ bankDatas }: { bankDatas: BankDataInfo[] }): JSX.Element {
  return <DataTable data={bankDatas} columns={bankDatasColumns} emptyLabel="No bank data" />;
}

const buyRoutesColumns: ColumnDef<BuyRouteInfo>[] = [
  { header: 'ID', render: (b) => b.id },
  { header: 'IBAN', align: 'left', render: (b) => b.iban || '-', className: 'font-mono' },
  { header: 'Bank Usage', render: (b) => b.bankUsage, className: 'font-mono' },
  { header: 'Asset', render: (b) => b.assetName },
  { header: 'Blockchain', align: 'left', render: (b) => b.blockchain },
  {
    header: 'Address',
    align: 'left',
    render: (b) =>
      b.targetAddress ? (
        b.targetAddressExplorerUrl ? (
          <a
            href={b.targetAddressExplorerUrl}
            target="_blank"
            rel="noreferrer"
            title={b.targetAddress}
            className="text-dfxBlue-800 hover:underline"
          >
            {b.targetAddress}
          </a>
        ) : (
          <span title={b.targetAddress}>{b.targetAddress}</span>
        )
      ) : (
        '-'
      ),
    className: 'font-mono',
  },
  { header: 'Volume', align: 'right', render: (b) => b.volume?.toFixed(2) },
  { header: 'Active', render: (b) => boolBadge(b.active) },
  { header: 'Created', render: (b) => formatDate(b.created) },
];

export function BuyRoutesTable({ buyRoutes }: { buyRoutes: BuyRouteInfo[] }): JSX.Element {
  return <DataTable data={buyRoutes} columns={buyRoutesColumns} emptyLabel="No buy routes" />;
}

const sellRoutesColumns: ColumnDef<SellRouteInfo>[] = [
  { header: 'ID', render: (s) => s.id },
  { header: 'IBAN', align: 'left', render: (s) => s.iban, className: 'font-mono' },
  { header: 'Fiat', render: (s) => s.fiatName || '-' },
  {
    header: 'Deposit Address',
    align: 'left',
    render: (s) =>
      s.depositAddress ? (
        s.depositAddressExplorerUrl ? (
          <a
            href={s.depositAddressExplorerUrl}
            target="_blank"
            rel="noreferrer"
            title={s.depositAddress}
            className="text-dfxBlue-800 hover:underline"
          >
            {s.depositAddress}
          </a>
        ) : (
          <span title={s.depositAddress}>{s.depositAddress}</span>
        )
      ) : (
        '-'
      ),
    className: 'font-mono',
  },
  { header: 'Blockchain', align: 'left', render: (s) => s.depositBlockchains?.join(', ') || '-' },
  { header: 'Volume', align: 'right', render: (s) => s.volume?.toFixed(2) },
  { header: 'Active', render: (s) => boolBadge(s.active) },
  { header: 'Created', render: (s) => formatDate(s.created) },
];

export function SellRoutesTable({ sellRoutes }: { sellRoutes: SellRouteInfo[] }): JSX.Element {
  return <DataTable data={sellRoutes} columns={sellRoutesColumns} emptyLabel="No sell routes" />;
}

const swapRoutesColumns: ColumnDef<SwapRouteInfo>[] = [
  { header: 'ID', render: (s) => s.id },
  { header: 'Asset', render: (s) => s.assetName || '-' },
  { header: 'Blockchain', align: 'left', render: (s) => s.blockchain || '-' },
  {
    header: 'Deposit Address',
    align: 'left',
    render: (s) =>
      s.depositAddress ? (
        s.depositAddressExplorerUrl ? (
          <a
            href={s.depositAddressExplorerUrl}
            target="_blank"
            rel="noreferrer"
            title={s.depositAddress}
            className="text-dfxBlue-800 hover:underline"
          >
            {s.depositAddress}
          </a>
        ) : (
          <span title={s.depositAddress}>{s.depositAddress}</span>
        )
      ) : (
        '-'
      ),
    className: 'font-mono',
  },
  { header: 'Volume', align: 'right', render: (s) => s.volume?.toFixed(2) },
  { header: 'Annual Volume', align: 'right', render: (s) => s.annualVolume?.toFixed(2) },
  { header: 'Active', render: (s) => boolBadge(s.active) },
  { header: 'Created', render: (s) => formatDate(s.created) },
];

export function SwapRoutesTable({ swapRoutes }: { swapRoutes: SwapRouteInfo[] }): JSX.Element {
  return <DataTable data={swapRoutes} columns={swapRoutesColumns} emptyLabel="No swap routes" />;
}

const virtualIbansColumns: ColumnDef<VirtualIbanInfo>[] = [
  { header: 'ID', render: (v) => v.id },
  { header: 'IBAN', align: 'left', render: (v) => v.iban, className: 'font-mono' },
  { header: 'Currency', render: (v) => v.currency || '-' },
  { header: 'Bank', align: 'left', render: (v) => v.bank || '-' },
  { header: 'Status', render: (v) => (v.status ? statusBadge(v.status) : '-') },
  { header: 'Active', render: (v) => boolBadge(v.active) },
  {
    header: 'Label',
    align: 'left',
    render: (v) => <span title={v.label}>{v.label || '-'}</span>,
    className: 'max-w-xs truncate',
  },
  { header: 'Buy ID', render: (v) => v.buyId ?? '-' },
  { header: 'Activated', render: (v) => (v.activatedAt ? formatDate(v.activatedAt) : '-') },
  { header: 'Deactivated', render: (v) => (v.deactivatedAt ? formatDate(v.deactivatedAt) : '-') },
  { header: 'Created', render: (v) => formatDate(v.created) },
];

export function VirtualIbansTable({ virtualIbans }: { virtualIbans: VirtualIbanInfo[] }): JSX.Element {
  return <DataTable data={virtualIbans} columns={virtualIbansColumns} emptyLabel="No virtual IBANs" />;
}

const refRewardsColumns: ColumnDef<RefRewardInfo>[] = [
  { header: 'ID', render: (r) => r.id },
  { header: 'Status', render: (r) => (r.status ? statusBadge(r.status) : '-') },
  { header: 'Amount', align: 'right', render: (r) => r.outputAmount?.toFixed(8) ?? '-' },
  { header: 'Asset', render: (r) => r.outputAsset || '-' },
  { header: 'Blockchain', align: 'left', render: (r) => r.outputBlockchain || '-' },
  { header: 'CHF', align: 'right', render: (r) => r.amountInChf?.toFixed(2) ?? '-' },
  { header: 'EUR', align: 'right', render: (r) => r.amountInEur?.toFixed(2) ?? '-' },
  {
    header: 'Target Address',
    align: 'left',
    render: (r) =>
      r.targetAddress ? (
        r.targetAddressExplorerUrl ? (
          <a
            href={r.targetAddressExplorerUrl}
            target="_blank"
            rel="noreferrer"
            title={r.targetAddress}
            className="text-dfxBlue-800 hover:underline"
          >
            {r.targetAddress}
          </a>
        ) : (
          <span title={r.targetAddress}>{r.targetAddress}</span>
        )
      ) : (
        '-'
      ),
    className: 'font-mono max-w-xs truncate',
  },
  {
    header: 'TX ID',
    align: 'left',
    render: (r) =>
      r.txId ? (
        r.txExplorerUrl ? (
          <a
            href={r.txExplorerUrl}
            target="_blank"
            rel="noreferrer"
            title={r.txId}
            className="text-dfxBlue-800 hover:underline"
          >
            {r.txId}
          </a>
        ) : (
          <span title={r.txId}>{r.txId}</span>
        )
      ) : (
        '-'
      ),
    className: 'font-mono max-w-xs truncate',
  },
  { header: 'Output Date', render: (r) => (r.outputDate ? formatDate(r.outputDate) : '-') },
  { header: 'Mail Sent', render: (r) => (r.mailSendDate ? formatDate(r.mailSendDate) : '-') },
  { header: 'Created', render: (r) => formatDate(r.created) },
];

export function RefRewardsTable({ refRewards }: { refRewards: RefRewardInfo[] }): JSX.Element {
  return <DataTable data={refRewards} columns={refRewardsColumns} emptyLabel="No referral rewards" />;
}

const notificationsColumns: ColumnDef<NotificationInfo>[] = [
  { header: 'ID', render: (n) => n.id },
  { header: 'Type', align: 'left', render: (n) => n.type },
  { header: 'Context', align: 'left', render: (n) => n.context },
  {
    header: 'Correlation ID',
    align: 'left',
    render: (n) => <span title={n.correlationId}>{n.correlationId || '-'}</span>,
    className: 'font-mono max-w-xs truncate',
  },
  { header: 'Complete', render: (n) => boolBadge(n.isComplete) },
  { header: 'Suppress', render: (n) => boolBadge(n.suppressRecurring) },
  {
    header: 'Error',
    align: 'left',
    render: (n) => <span title={n.error}>{n.error || '-'}</span>,
    className: 'max-w-xs truncate',
  },
  { header: 'Last Try', render: (n) => formatDate(n.lastTryDate) },
  { header: 'Created', render: (n) => formatDate(n.created) },
];

export function NotificationsTable({ notifications }: { notifications: NotificationInfo[] }): JSX.Element {
  const sorted = [...notifications].sort((a, b) => b.id - a.id);
  return <DataTable data={sorted} columns={notificationsColumns} emptyLabel="No notifications" />;
}
