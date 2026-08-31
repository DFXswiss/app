import { SupportIssueInternalState, SupportIssueType, useAuthContext } from '@dfx.swiss/react';
import { SpinnerSize, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TemplatePickerModal } from 'src/components/support-templates/template-picker-modal';
import { ErrorHint } from 'src/components/error-hint';
import { FilterSelect, GroupedIssueTable, IssueTable, TabButton } from 'src/components/support/issue-table';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useClipboard } from 'src/hooks/clipboard.hook';
import { TransactionInfo, UserDataDetail, UserSearchResult, useCompliance } from 'src/hooks/compliance.hook';
import { SUPPORT_STAFF_ROLES, useSupportDashboardGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { SupportIssueListItem, useSupportDashboard } from 'src/hooks/support-dashboard.hook';
import { typeLabel, visibleDepartmentsForRole } from 'src/util/support-helpers';
import { countOpenIssueGroups, groupOpenIssues } from 'src/util/support-stats';

type PagedTab = 'OnHold' | 'Canceled' | 'Completed';
// 'limit' is a dedicated view of the open limit-increase requests (same open states, same
// grouping as 'open'), so compliance can work them without scrolling the full ticket list.
type Tab = 'open' | 'limit' | PagedTab;

const OPEN_STATES = [SupportIssueInternalState.CREATED, SupportIssueInternalState.PENDING];
const PAGED_TABS: PagedTab[] = ['OnHold', 'Canceled', 'Completed'];
const PAGE_SIZE = 20;

interface TabData {
  issues: SupportIssueListItem[];
  total: number;
  loaded: boolean;
  loading: boolean;
}

const emptyTabData: TabData = { issues: [], total: 0, loaded: false, loading: false };

export default function SupportDashboardScreen(): JSX.Element {
  useSupportDashboardGuard();

  const { translate } = useSettingsContext();
  const { session } = useAuthContext();
  const { getIssueList, getIssueCounts, getIssueActivity } = useSupportDashboard();
  const { search: searchCustomers, getUserData } = useCompliance();
  const { navigate } = useNavigation();
  const { copy } = useClipboard();

  const [customerSearchKey, setCustomerSearchKey] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState<UserSearchResult[]>();
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [customerSearchError, setCustomerSearchError] = useState<string>();
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);

  // Template picker (copy-mode) state
  const [templateUser, setTemplateUser] = useState<UserSearchResult>();
  const [templateUserData, setTemplateUserData] = useState<UserDataDetail>();
  const [templateTransactions, setTemplateTransactions] = useState<TransactionInfo[]>([]);
  const [templateLoadingUserId, setTemplateLoadingUserId] = useState<number>();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [openIssues, setOpenIssues] = useState<SupportIssueListItem[]>([]);
  const [limitIssues, setLimitIssues] = useState<SupportIssueListItem[]>([]);
  const [isLimitLoading, setIsLimitLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('open');

  const [typeFilter, setTypeFilter] = useState<string>('');
  const [stateFilter, setStateFilter] = useState<string>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('');

  const [tabs, setTabs] = useState<Record<PagedTab, TabData>>({
    OnHold: { ...emptyTabData },
    Canceled: { ...emptyTabData },
    Completed: { ...emptyTabData },
  });

  const [searchQuery, setSearchQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const openLoadGen = useRef(0);
  const limitLoadGen = useRef(0);

  const [newMessageCount, setNewMessageCount] = useState(0);
  const baselineRef = useRef<Date>(new Date());

  // A role that may see more than one department gets the department filter and column, so it can
  // tell apart and narrow the mixed list (e.g. compliance now sees support + compliance tickets).
  const visibleDepartments = useMemo(() => visibleDepartmentsForRole(session?.role), [session?.role]);
  const canFilterDepartment = visibleDepartments.length > 1;

  const loadOpenIssues = useCallback(
    (query: string): void => {
      const gen = ++openLoadGen.current;
      setIsLoading(true);
      setError(undefined);

      const params: Record<string, string> = { states: OPEN_STATES.join(',') };
      if (typeFilter) params.type = typeFilter;
      if (departmentFilter) params.department = departmentFilter;
      if (query) params.query = query;

      getIssueList(params)
        .then((res) => {
          if (gen !== openLoadGen.current) return;
          setOpenIssues(res.data);
        })
        .catch((e: Error) => {
          if (gen !== openLoadGen.current) return;
          setError(e.message || 'Unknown error');
        })
        .finally(() => {
          if (gen !== openLoadGen.current) return;
          setIsLoading(false);
        });
    },
    [typeFilter, departmentFilter, getIssueList],
  );

  // Loaded independently of the open list so the tab count is right even while the open tab is
  // narrowed by type/department, and independent of the open tab's search query.
  const loadLimitIssues = useCallback(
    (query: string): void => {
      const gen = ++limitLoadGen.current;
      setIsLimitLoading(true);
      setError(undefined);

      const params: Record<string, string> = { states: OPEN_STATES.join(','), type: SupportIssueType.LIMIT_REQUEST };
      if (query) params.query = query;

      getIssueList(params)
        .then((res) => {
          if (gen !== limitLoadGen.current) return;
          setLimitIssues(res.data);
        })
        .catch((e: Error) => {
          if (gen !== limitLoadGen.current) return;
          setError(e.message || 'Unknown error');
        })
        .finally(() => {
          if (gen !== limitLoadGen.current) return;
          setIsLimitLoading(false);
        });
    },
    [getIssueList],
  );

  useEffect(() => {
    loadLimitIssues('');
  }, [loadLimitIssues]);

  useEffect(() => {
    getIssueCounts()
      .then((counts) =>
        setTabs((prev) => ({
          OnHold: { ...prev.OnHold, total: counts[SupportIssueInternalState.ON_HOLD] ?? 0 },
          Canceled: { ...prev.Canceled, total: counts[SupportIssueInternalState.CANCELED] ?? 0 },
          Completed: { ...prev.Completed, total: counts[SupportIssueInternalState.COMPLETED] ?? 0 },
        })),
      )
      .catch(() => undefined);
  }, [getIssueCounts]);

  const loadPaged = useCallback(
    (state: PagedTab, skip: number, query: string, append: boolean): void => {
      setTabs((prev) => ({ ...prev, [state]: { ...prev[state], loading: true } }));
      setError(undefined);

      getIssueList({ states: state, take: PAGE_SIZE, skip, query: query || undefined })
        .then((res) => {
          setTabs((prev) => ({
            ...prev,
            [state]: {
              issues: append ? [...prev[state].issues, ...res.data] : res.data,
              total: res.total,
              loaded: true,
              loading: false,
            },
          }));
        })
        .catch((e: Error) => {
          setError(e.message || 'Unknown error');
          setTabs((prev) => ({ ...prev, [state]: { ...prev[state], loading: false } }));
        });
    },
    [getIssueList],
  );

  useEffect(() => {
    if (activeTab !== 'open' && activeTab !== 'limit' && !tabs[activeTab].loaded) loadPaged(activeTab, 0, '', false);
  }, [activeTab, loadPaged]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (activeTab === 'open') loadOpenIssues(searchQuery);
      else if (activeTab === 'limit') loadLimitIssues(searchQuery);
      else loadPaged(activeTab, 0, searchQuery, false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, activeTab, loadPaged, loadOpenIssues, loadLimitIssues]);

  useEffect(() => {
    const tick = (): void => {
      getIssueActivity(baselineRef.current)
        .then((res) => setNewMessageCount(res.count))
        .catch(() => undefined);
    };
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [getIssueActivity]);

  // Only reachable from the activity badge on grouped tabs (open / limit).
  const reloadAfterActivity = useCallback((): void => {
    baselineRef.current = new Date();
    setNewMessageCount(0);
    if (activeTab === 'open') {
      loadOpenIssues(searchQuery);
    } else {
      loadLimitIssues(searchQuery);
    }
  }, [activeTab, searchQuery, loadOpenIssues, loadLimitIssues]);

  useLayoutOptions({
    title: translate('screens/support', 'All Tickets'),
    backButton: true,
    noMaxWidth: true,
    noPadding: true,
  });

  const openIssueGroups = useMemo(() => groupOpenIssues(openIssues, stateFilter), [openIssues, stateFilter]);
  const limitIssueGroups = useMemo(() => groupOpenIssues(limitIssues, stateFilter), [limitIssues, stateFilter]);

  const openIssueCount = countOpenIssueGroups(openIssueGroups);
  const limitIssueCount = countOpenIssueGroups(limitIssueGroups);

  function handleCustomerSearch(): void {
    if (!customerSearchKey.trim()) return;
    setCustomerSearchLoading(true);
    setCustomerSearchError(undefined);
    setCustomerSearchResults(undefined);
    searchCustomers(customerSearchKey.trim())
      .then((result) => setCustomerSearchResults(result.userDatas))
      .catch((e: Error) => setCustomerSearchError(e.message || 'Unknown error'))
      .finally(() => setCustomerSearchLoading(false));
  }

  async function openTemplateForUser(user: UserSearchResult): Promise<void> {
    if (templateLoadingUserId != null || templateUser != null) return;
    setTemplateLoadingUserId(user.id);
    setCustomerSearchError(undefined);
    try {
      const data = await getUserData(user.id);
      setTemplateUserData(data.userData);
      setTemplateTransactions(data.transactions ?? []);
      setTemplateUser(user);
    } catch (e: unknown) {
      setCustomerSearchError(e instanceof Error ? e.message : 'Failed to load user data for templates');
    } finally {
      setTemplateLoadingUserId(undefined);
    }
  }

  function closeTemplatePicker(): void {
    setTemplateUser(undefined);
    setTemplateUserData(undefined);
    setTemplateTransactions([]);
  }

  function handleTemplateInsert(text: string): void {
    copy(text);
    closeTemplatePicker();
  }

  const isGroupedTab = activeTab === 'open' || activeTab === 'limit';
  const currentTab = isGroupedTab ? null : tabs[activeTab];
  const displayedIssues = currentTab?.issues ?? [];
  const displayedTotal = currentTab?.total ?? 0;
  const hasMore = currentTab != null && displayedIssues.length < displayedTotal;

  let isTabLoading = false;
  if (activeTab === 'open') {
    isTabLoading = isLoading;
  } else if (activeTab === 'limit') {
    isTabLoading = isLimitLoading;
  } else {
    isTabLoading = tabs[activeTab].loading;
  }

  const hasZeroGroupedIssues = activeTab === 'open' ? openIssueCount === 0 : limitIssueCount === 0;
  const showLoadingSpinner = isTabLoading && (isGroupedTab ? hasZeroGroupedIssues : displayedIssues.length === 0);

  return (
    <div className="w-full max-w-screen-xl mx-auto flex flex-col gap-3 flex-1 min-h-0 p-4 md:p-6 text-left">
      {/* Stats & Actions */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="bg-white rounded-lg shadow-sm p-3 flex-1 min-w-[150px]">
          <div className="text-xs text-dfxGray-700">Open Issues</div>
          <div className="text-2xl font-bold text-dfxBlue-800">{openIssueCount}</div>
        </div>
        <div className="flex gap-2 ml-auto">
          <button
            className="px-3 py-2 bg-white border border-dfxGray-400 text-dfxBlue-800 rounded-lg text-sm hover:bg-dfxGray-300 transition-colors"
            onClick={() => setShowCustomerSearch((v) => !v)}
          >
            {showCustomerSearch ? '−' : '+'} {translate('screens/support', 'Customer Search')}
          </button>
          <button
            className="px-3 py-2 bg-white border border-dfxGray-400 text-dfxBlue-800 rounded-lg text-sm hover:bg-dfxGray-300 transition-colors"
            onClick={() => navigate('/notes')}
          >
            {translate('screens/compliance', 'Notes')}
          </button>
          {/* This dashboard admits Marketing, the target route does not - showing the link to a role
              that gets redirected straight back would be a dead end. */}
          {session && SUPPORT_STAFF_ROLES.includes(session.role) && (
            <button
              className="px-3 py-2 bg-white border border-dfxGray-400 text-dfxBlue-800 rounded-lg text-sm hover:bg-dfxGray-300 transition-colors"
              onClick={() => navigate('/compliance/bank-tx/unassigned')}
            >
              {translate('screens/compliance', 'Unassigned Bank Transactions')}
            </button>
          )}
          <button
            className="px-3 py-2 bg-white border border-dfxGray-400 text-dfxBlue-800 rounded-lg text-sm hover:bg-dfxGray-300 transition-colors"
            onClick={() => navigate('/templates')}
          >
            {translate('screens/templates', 'Templates')}
          </button>
          <button
            className="px-4 py-2 bg-dfxBlue-400 text-white rounded-lg text-sm hover:bg-dfxBlue-800 transition-colors"
            onClick={() => navigate('/support/dashboard/create')}
          >
            + {translate('screens/support', 'Create Issue')}
          </button>
        </div>
      </div>

      {/* Customer Search */}
      {showCustomerSearch && (
        <div className="bg-white rounded-lg shadow-sm p-3 flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              className="px-3 py-1.5 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800 flex-1"
              value={customerSearchKey}
              onChange={(e) => setCustomerSearchKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCustomerSearch();
              }}
              placeholder={translate(
                'screens/support',
                'Search by ID, email, phone, name, KYC hash, blockchain address...',
              )}
            />
            <button
              className="px-4 py-1.5 bg-dfxBlue-400 text-white rounded text-sm hover:bg-dfxBlue-800 transition-colors disabled:opacity-50"
              onClick={handleCustomerSearch}
              disabled={customerSearchLoading || !customerSearchKey.trim()}
            >
              {customerSearchLoading ? '…' : translate('general/actions', 'Search')}
            </button>
          </div>
          {customerSearchError && <ErrorHint message={customerSearchError} />}
          {customerSearchResults && (
            <>
              {customerSearchResults.length === 0 ? (
                <p className="text-sm text-dfxGray-700">{translate('screens/compliance', 'No entries found')}</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-dfxGray-300">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">ID</th>
                      <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                        {translate('screens/kyc', 'Account Type')}
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800">
                        {translate('screens/kyc', 'Name')}
                      </th>
                      <th className="px-3 py-2 text-left font-semibold text-dfxBlue-800 break-all">
                        {translate('screens/compliance', 'Email')}
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-dfxBlue-800 w-0 whitespace-nowrap">
                        Aktion
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerSearchResults.map((u) => (
                      <tr
                        key={u.id}
                        className="border-b border-dfxGray-300 transition-colors hover:bg-dfxBlue-400 cursor-pointer group"
                        onClick={() => navigate(`/support/user/${u.id}`)}
                      >
                        <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">{u.id}</td>
                        <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">{u.accountType ?? '-'}</td>
                        <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white">{u.name ?? '-'}</td>
                        <td className="px-3 py-2 text-dfxBlue-800 group-hover:text-white break-all">{u.mail ?? '-'}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            className="px-2 py-1 text-xs font-medium bg-white border border-dfxGray-400 text-dfxBlue-800 rounded hover:bg-dfxGray-300 transition-colors disabled:opacity-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              void openTemplateForUser(u);
                            }}
                            disabled={templateLoadingUserId != null}
                            title="Template ausfüllen und in Zwischenablage kopieren"
                          >
                            {templateLoadingUserId === u.id ? '…' : 'Template'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-dfxGray-400">
        <TabButton
          label={`Open (${openIssueCount})`}
          active={activeTab === 'open'}
          onClick={() => setActiveTab('open')}
        />
        <TabButton
          label={`Limit Requests (${limitIssueCount})`}
          active={activeTab === 'limit'}
          onClick={() => setActiveTab('limit')}
        />
        {PAGED_TABS.map((tab) => (
          <TabButton
            key={tab}
            label={`${tab} (${tabs[tab].total})`}
            active={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          />
        ))}
      </div>

      {/* Filters - only for the grouped tabs; the limit tab is already narrowed to one type */}
      {isGroupedTab && (
        <div className="flex gap-3 flex-wrap items-end">
          {activeTab === 'open' && (
            <FilterSelect
              label="Type"
              value={typeFilter}
              onChange={setTypeFilter}
              options={Object.values(SupportIssueType).map((t) => ({
                value: t,
                label: translate('screens/support', typeLabel(t)),
              }))}
            />
          )}
          <FilterSelect
            label="State"
            value={stateFilter}
            onChange={setStateFilter}
            options={OPEN_STATES.map((s) => ({ value: s, label: s }))}
          />
          {activeTab === 'open' && canFilterDepartment && (
            <FilterSelect
              label="Department"
              value={departmentFilter}
              onChange={setDepartmentFilter}
              options={visibleDepartments.map((d) => ({ value: d, label: d }))}
            />
          )}
          <button
            className="px-3 py-1.5 text-xs text-dfxGray-700 hover:text-dfxBlue-800 transition-colors"
            onClick={() => {
              setTypeFilter('');
              setStateFilter('');
              setDepartmentFilter('');
            }}
          >
            Reset
          </button>
          {newMessageCount > 0 && (
            <button
              className="ml-auto px-3 py-1 text-xs text-white bg-dfxRed-100 rounded-full hover:bg-dfxRed-150 transition-colors"
              onClick={reloadAfterActivity}
            >
              {newMessageCount} new {newMessageCount === 1 ? 'message' : 'messages'} — load
            </button>
          )}
        </div>
      )}

      {/* Search - all tabs (server-side) */}
      <div className="flex flex-col gap-1">
        <input
          className="px-3 py-1.5 text-sm border border-dfxGray-400 rounded bg-white text-dfxBlue-800"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by ID, UID, name, clerk, message..."
        />
      </div>

      {/* Content */}
      {error && <ErrorHint message={error} />}
      {showLoadingSpinner ? (
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      ) : isGroupedTab ? (
        <GroupedIssueTable
          groups={activeTab === 'open' ? openIssueGroups : limitIssueGroups}
          showDepartment={canFilterDepartment}
          onRowClick={(issue) => navigate(`/support/dashboard/issue/${issue.id}`)}
        />
      ) : (
        <>
          <IssueTable
            issues={displayedIssues}
            showDepartment={canFilterDepartment}
            onRowClick={(issue) => navigate(`/support/dashboard/issue/${issue.id}`)}
          />
          {hasMore && (
            <button
              className="px-4 py-2 text-sm text-dfxBlue-400 hover:text-dfxBlue-800 transition-colors self-center disabled:opacity-50"
              onClick={() => loadPaged(activeTab as PagedTab, displayedIssues.length, searchQuery, true)}
              disabled={isTabLoading}
            >
              {isTabLoading ? 'Loading...' : `Load more (${displayedIssues.length} / ${displayedTotal})`}
            </button>
          )}
        </>
      )}

      <TemplatePickerModal
        isOpen={templateUser != null}
        context={{ userData: templateUserData, transactions: templateTransactions }}
        copyMode
        onClose={closeTemplatePicker}
        onInsert={handleTemplateInsert}
      />
    </div>
  );
}
