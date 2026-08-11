import { useAuthContext, UserRole, useKyc } from '@dfx.swiss/react';
import {
  IconColor,
  IconSize,
  IconVariant,
  SpinnerSize,
  StyledIconButton,
  StyledLoadingSpinner,
} from '@dfx.swiss/react-components';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  BankDatasTable,
  BuyRoutesTable,
  KycLogsTable,
  KycStepsTable,
  NotificationsTable,
  RefRewardsTable,
  SellRoutesTable,
  SwapRoutesTable,
  UsersTable,
  VirtualIbansTable,
} from 'src/components/compliance/detail-tabs';
import { FilePreviewPanel } from 'src/components/compliance/file-preview-panel';
import { IpLogsPanel } from 'src/components/compliance/ip-logs-panel';
import { KycFilesPanel } from 'src/components/compliance/kyc-files-panel';
import { NotesTab } from 'src/components/compliance/notes-tab';
import { RecommendationPanel } from 'src/components/compliance/recommendation-panel';
import { SupportIssuesPanel } from 'src/components/compliance/support-issues-panel';
import { SupportUserOverviewPanel } from 'src/components/compliance/support-user-overview-panel';
import { TransactionsTable } from 'src/components/compliance/transactions-tab';
import { UserDataPanel } from 'src/components/compliance/user-data-panel';
import { ErrorHint } from 'src/components/error-hint';
import { useSettingsContext } from 'src/contexts/settings.context';
import { ComplianceUserData, KycFile, useCompliance } from 'src/hooks/compliance.hook';
import { useSupportDashboardGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useSplitPane } from 'src/hooks/split-pane.hook';

type TabType =
  | 'transactions'
  | 'users'
  | 'kycSteps'
  | 'kycLogs'
  | 'bankDatas'
  | 'buyRoutes'
  | 'sellRoutes'
  | 'swapRoutes'
  | 'virtualIbans'
  | 'refRewards'
  | 'notifications'
  | 'notes';

interface TabConfig {
  id: TabType;
  label: string;
  count: number;
}

export default function ComplianceUserScreen(): JSX.Element {
  useSupportDashboardGuard();
  const { session } = useAuthContext();
  const role = session?.role;

  const { translate } = useSettingsContext();
  const { id: userDataId } = useParams();
  const { getUserData, downloadUserFiles } = useCompliance();
  const { getFile } = useKyc();
  const navigate = useNavigate();

  const [error, setError] = useState<string>();
  const [data, setData] = useState<ComplianceUserData>();
  const [isDownloading, setIsDownloading] = useState(false);
  const [preview, setPreview] = useState<{ url: string; contentType: string; name: string }>();
  const [activeTab, setActiveTab] = useState<TabType>('transactions');
  const [expandedBankTxId, setExpandedBankTxId] = useState<number>();
  const [expandedCryptoInputId, setExpandedCryptoInputId] = useState<number>();
  const [expandedBankDataId, setExpandedBankDataId] = useState<number>();
  const [expandedTxUid, setExpandedTxUid] = useState<string>();
  const { containerRef, splitPercent, setSplitPercent, handleSplitDrag } = useSplitPane();

  function handleExpandBankTx(id: number | undefined): void {
    setExpandedBankTxId(id);
    setExpandedCryptoInputId(undefined);
    setExpandedBankDataId(undefined);
    setExpandedTxUid(undefined);
  }

  function handleExpandCryptoInput(id: number | undefined): void {
    setExpandedCryptoInputId(id);
    setExpandedBankTxId(undefined);
    setExpandedBankDataId(undefined);
    setExpandedTxUid(undefined);
  }

  function handleExpandBankData(id: number | undefined): void {
    setExpandedBankDataId(id);
    setExpandedBankTxId(undefined);
    setExpandedCryptoInputId(undefined);
    setExpandedTxUid(undefined);
  }

  function handleExpandTxUid(uid: string | undefined): void {
    setExpandedTxUid(uid);
    setExpandedBankTxId(undefined);
    setExpandedCryptoInputId(undefined);
    setExpandedBankDataId(undefined);
  }

  async function openFile(file: KycFile): Promise<void> {
    setError(undefined);
    try {
      const { content, contentType } = await getFile(file.uid);
      if (!content || content.type !== 'Buffer' || !Array.isArray(content.data)) {
        setError('Invalid file type');
        return;
      }

      const blob = new Blob([new Uint8Array(content.data)], { type: contentType });
      const url = URL.createObjectURL(blob);

      setPreview({ url, contentType, name: file.name });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error loading file');
    }
  }

  const loadData = useCallback(() => {
    if (!userDataId) {
      setError('No ID provided');
      return;
    }
    setError(undefined);
    getUserData(+userDataId)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'));
  }, [userDataId, getUserData]);

  function handleDownload(): void {
    if (!userDataId) return;
    setIsDownloading(true);
    setError(undefined);
    downloadUserFiles([+userDataId])
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setIsDownloading(false));
  }

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    return () => preview && URL.revokeObjectURL(preview.url);
  }, [preview]);

  useEffect(() => {
    if (role === UserRole.SUPPORT) setSplitPercent(50);
  }, [role]);

  useLayoutOptions({
    title: translate('screens/compliance', 'User Data'),
    backButton: true,
    noMaxWidth: true,
    textStart: true,
  });

  if (error && !data) return <ErrorHint message={error} />;
  if (!data || !userDataId) return <StyledLoadingSpinner size={SpinnerSize.LG} />;

  const numericUserDataId = +userDataId;
  const isSupport = role === UserRole.SUPPORT;
  const isComplianceRole = role === UserRole.ADMIN || role === UserRole.COMPLIANCE;
  const canCopyKycLinks = isComplianceRole;
  const showRightPanel = data.permissions.viewKycFiles || isSupport;

  const tabs: TabConfig[] = [
    { id: 'transactions', label: 'Transactions', count: data.transactions?.length || 0 },
    { id: 'users', label: 'Users', count: data.users?.length || 0 },
    { id: 'kycSteps', label: 'KYC Steps', count: data.kycSteps?.length || 0 },
    ...(data.permissions.viewKycLogs
      ? [{ id: 'kycLogs' as TabType, label: 'KYC Log', count: data.kycLogs?.length ?? 0 }]
      : []),
    { id: 'bankDatas', label: 'Bank Data', count: data.bankDatas?.length || 0 },
    { id: 'virtualIbans', label: 'Virtual IBANs', count: data.virtualIbans?.length || 0 },
    { id: 'buyRoutes', label: 'Buy Routes', count: data.buyRoutes?.length || 0 },
    { id: 'sellRoutes', label: 'Sell Routes', count: data.sellRoutes?.length || 0 },
    { id: 'swapRoutes', label: 'Swap Routes', count: data.swapRoutes?.length || 0 },
    { id: 'refRewards', label: 'Ref Rewards', count: data.refRewards?.length || 0 },
    { id: 'notifications', label: 'Notifications', count: data.notifications?.length || 0 },
    { id: 'notes', label: 'Notes', count: data.notes?.length ?? 0 },
  ];

  return (
    <div className="w-full flex flex-col gap-4">
      {isComplianceRole && (
        <div className="flex justify-end items-center gap-2">
          <button
            className="px-3 py-1.5 text-sm font-medium text-white rounded transition-colors bg-dfxBlue-800 hover:bg-dfxBlue-800/80"
            onClick={() => navigate(`/compliance/user/${numericUserDataId}/kyc`)}
          >
            {translate('screens/compliance', 'KYC')}
          </button>
          <StyledIconButton
            icon={IconVariant.FILE}
            color={IconColor.BLUE}
            size={IconSize.MD}
            onClick={handleDownload}
            isLoading={isDownloading}
          />
        </div>
      )}

      {error && <ErrorHint message={error} />}

      {/* Top Section: (User Data | Middle Panels) | Splitter | (File Preview | Support Overview) */}
      <div ref={containerRef} className="flex min-h-[400px]">
        <div style={{ width: `${showRightPanel ? splitPercent : 100}%` }} className="flex gap-4 min-w-0 pr-2">
          <UserDataPanel
            userData={data.userData}
            userDataId={numericUserDataId}
            canRequestLimit={data.permissions.canRequestLimit}
            canCopyKycLinks={canCopyKycLinks}
            wide={isSupport}
            onLimitRequestCreated={loadData}
            onCreateNote={() => navigate(`/notes?userDataId=${numericUserDataId}&compose=1`)}
          />

          {!isSupport && (
            <div className="flex-1 min-w-[300px] flex flex-col gap-4">
              {data.permissions.viewRecommendation && (
                <RecommendationPanel
                  kycSteps={data.kycSteps}
                  users={data.users}
                  userDataId={userDataId}
                  navigate={navigate}
                />
              )}
              {data.permissions.viewKycFiles && (
                <KycFilesPanel
                  kycFiles={data.kycFiles ?? []}
                  label={translate('screens/compliance', 'KYC Files')}
                  onOpenFile={openFile}
                />
              )}
              {data.permissions.viewIpLogs && <IpLogsPanel ipLogs={data.ipLogs ?? []} userDataId={numericUserDataId} />}
              {data.permissions.viewSupportIssues && (
                <SupportIssuesPanel
                  supportIssues={data.supportIssues ?? []}
                  userDataId={userDataId}
                  navigate={navigate}
                />
              )}
            </div>
          )}
        </div>

        {showRightPanel && (
          <>
            <div
              className="w-1.5 cursor-col-resize flex-shrink-0 group flex items-stretch"
              onMouseDown={handleSplitDrag}
            >
              <div className="w-0.5 mx-auto bg-dfxGray-400 group-hover:bg-dfxBlue-400 transition-colors rounded-full" />
            </div>
            <div style={{ width: `${100 - splitPercent}%` }} className="min-w-0 sticky top-4 self-start pl-2">
              {isSupport ? (
                <SupportUserOverviewPanel data={data} />
              ) : (
                <FilePreviewPanel
                  preview={preview}
                  label={translate('screens/compliance', 'File Preview')}
                  onClose={() => setPreview(undefined)}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* Bottom Section: Tabs */}
      <div className="w-full">
        <div className="flex border-b border-dfxGray-300">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-dfxBlue-800 border-b-2 border-dfxBlue-800 bg-white'
                  : 'text-dfxGray-700 hover:text-dfxBlue-800 hover:bg-dfxGray-300'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        <div className="bg-white rounded-b-lg shadow-sm p-4">
          {activeTab === 'transactions' && (
            <TransactionsTable
              transactions={data.transactions}
              bankTxs={data.bankTxs}
              cryptoInputs={data.cryptoInputs}
              bankDatas={data.bankDatas}
              userData={data.userData}
              userDataId={numericUserDataId}
              expandedBankTxId={expandedBankTxId}
              expandedCryptoInputId={expandedCryptoInputId}
              expandedBankDataId={expandedBankDataId}
              expandedTxUid={expandedTxUid}
              canPerformActions={data.permissions.canPerformTransactionActions}
              onExpandBankTx={handleExpandBankTx}
              onExpandCryptoInput={handleExpandCryptoInput}
              onExpandBankData={handleExpandBankData}
              onExpandTxUid={handleExpandTxUid}
              onStatusChanged={loadData}
            />
          )}

          {activeTab === 'users' && <UsersTable users={data.users} />}
          {activeTab === 'kycSteps' && <KycStepsTable kycSteps={data.kycSteps} />}
          {activeTab === 'kycLogs' && <KycLogsTable kycLogs={data.kycLogs ?? []} />}
          {activeTab === 'bankDatas' && <BankDatasTable bankDatas={data.bankDatas} />}
          {activeTab === 'buyRoutes' && <BuyRoutesTable buyRoutes={data.buyRoutes} />}
          {activeTab === 'sellRoutes' && <SellRoutesTable sellRoutes={data.sellRoutes} />}
          {activeTab === 'swapRoutes' && <SwapRoutesTable swapRoutes={data.swapRoutes} />}
          {activeTab === 'virtualIbans' && <VirtualIbansTable virtualIbans={data.virtualIbans} />}
          {activeTab === 'refRewards' && <RefRewardsTable refRewards={data.refRewards} />}
          {activeTab === 'notifications' && <NotificationsTable notifications={data.notifications} />}
          {activeTab === 'notes' && (
            <NotesTab notes={data.notes ?? []} userDataId={numericUserDataId} onChange={loadData} />
          )}
        </div>
      </div>
    </div>
  );
}
