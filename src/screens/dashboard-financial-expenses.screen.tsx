import { useSessionContext } from '@dfx.swiss/react';
import { SpinnerSize, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { ApexOptions } from 'apexcharts';
import { useEffect, useMemo, useState } from 'react';
import Chart from 'react-apexcharts';
import { FinancialChangesEntry, RefRewardRecipient } from 'src/dto/dashboard.dto';
import { useDashboard } from 'src/hooks/dashboard.hook';
import { useAdminGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';

const baseOptions: ApexOptions = {
  chart: { type: 'area', toolbar: { show: true, offsetY: -5 }, zoom: { enabled: true }, background: '0' },
  stroke: { width: 2, curve: 'smooth' },
  dataLabels: { enabled: false },
  fill: { type: 'gradient', gradient: { opacityFrom: 0.3, opacityTo: 0.05 } },
  grid: { borderColor: '#e5e7eb' },
  xaxis: { type: 'datetime', labels: { datetimeUTC: false, format: 'dd MMM yy' } },
  yaxis: {
    title: { text: 'CHF (cumulative)' },
    labels: { formatter: (val: number) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0)) },
  },
  tooltip: {
    x: { format: 'dd MMM yyyy HH:mm' },
    y: { formatter: (val: number) => `${val.toLocaleString('de-CH', { maximumFractionDigits: 0 })} CHF` },
  },
  legend: { position: 'bottom' },
};

function RefDetailChart({ entries }: { entries: FinancialChangesEntry[] }) {
  const options = useMemo((): ApexOptions => ({ ...baseOptions, colors: ['#ef4444', '#f97316'] }), []);
  const series = useMemo(
    () => [
      {
        name: 'Ref Amount',
        data: entries.map((e) => [new Date(e.timestamp).getTime(), Math.round(e.minus.ref.amount)]),
      },
      { name: 'Ref Fee', data: entries.map((e) => [new Date(e.timestamp).getTime(), Math.round(e.minus.ref.fee)]) },
    ],
    [entries],
  );

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">Referral Expenses (cumulative)</h3>
      <Chart type="area" height={250} options={options} series={series} />
    </div>
  );
}

function BinanceDetailChart({ entries }: { entries: FinancialChangesEntry[] }) {
  const options = useMemo((): ApexOptions => ({ ...baseOptions, colors: ['#f97316', '#8b5cf6'] }), []);
  const series = useMemo(
    () => [
      {
        name: 'Trading',
        data: entries.map((e) => [new Date(e.timestamp).getTime(), Math.round(e.minus.binance.trading)]),
      },
      {
        name: 'Withdraw',
        data: entries.map((e) => [new Date(e.timestamp).getTime(), Math.round(e.minus.binance.withdraw)]),
      },
    ],
    [entries],
  );

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">Binance Expenses (cumulative)</h3>
      <Chart type="area" height={250} options={options} series={series} />
    </div>
  );
}

function BlockchainDetailChart({ entries }: { entries: FinancialChangesEntry[] }) {
  const options = useMemo((): ApexOptions => ({ ...baseOptions, colors: ['#3b82f6', '#ef4444', '#64748b'] }), []);
  const series = useMemo(
    () => [
      {
        name: 'TX Out',
        data: entries.map((e) => [new Date(e.timestamp).getTime(), Math.round(e.minus.blockchain.txOut)]),
      },
      {
        name: 'TX In',
        data: entries.map((e) => [new Date(e.timestamp).getTime(), Math.round(e.minus.blockchain.txIn)]),
      },
      {
        name: 'Trading',
        data: entries.map((e) => [new Date(e.timestamp).getTime(), Math.round(e.minus.blockchain.trading)]),
      },
    ],
    [entries],
  );

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">Blockchain Expenses (cumulative)</h3>
      <Chart type="area" height={250} options={options} series={series} />
    </div>
  );
}

export default function DashboardFinancialExpensesScreen(): JSX.Element {
  useAdminGuard();
  useLayoutOptions({ title: 'Expenses Detail', noMaxWidth: true });

  const { isLoggedIn } = useSessionContext();
  const { getFinancialChanges, getRefRecipients } = useDashboard();

  const [entries, setEntries] = useState<FinancialChangesEntry[]>([]);
  const [recipients, setRecipients] = useState<RefRewardRecipient[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn) return;

    Promise.all([getFinancialChanges(undefined, true), getRefRecipients()])
      .then(([changesData, recipientsData]) => {
        setEntries(changesData.entries);
        setRecipients(recipientsData);
      })
      .finally(() => setIsLoading(false));
  }, [isLoggedIn]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center w-full h-96">
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 w-full self-stretch" style={{ color: '#111827' }}>
      <div className="bg-white rounded-lg shadow p-4">
        <RefDetailChart entries={entries} />
      </div>
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-semibold mb-2">Referral Recipients</h3>
        <div className="overflow-auto max-h-[400px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-semibold">UserData ID</th>
                <th className="text-right py-2 px-3 font-semibold">Payouts</th>
                <th className="text-right py-2 px-3 font-semibold">Total (CHF)</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((r) => (
                <tr key={r.userDataId} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-1.5 px-3">{r.userDataId}</td>
                  <td className="py-1.5 px-3 text-right">{r.count}</td>
                  <td className="py-1.5 px-3 text-right font-medium">
                    {Number(r.totalChf).toLocaleString('de-CH')} CHF
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="bg-white rounded-lg shadow p-4">
        <BinanceDetailChart entries={entries} />
      </div>
      <div className="bg-white rounded-lg shadow p-4">
        <BlockchainDetailChart entries={entries} />
      </div>
    </div>
  );
}
