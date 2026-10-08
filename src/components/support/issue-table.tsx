import { useState } from 'react';
import { useSettingsContext } from 'src/contexts/settings.context';
import { SupportIssueListItem } from 'src/hooks/support-dashboard.hook';
import { formatDateTime, formatDateTimeShort, statusBadge } from 'src/util/compliance-helpers';
import {
  customerWaitingHours,
  formatElapsed,
  isUnassigned,
  listReasonLabel,
  typeLabel,
  waitTier,
  waitTierBadgeClasses,
} from 'src/util/support-helpers';

// Presentational support-issue table components, extracted verbatim from support-dashboard.screen.tsx so both the
// DFX support dashboard and the RealUnit-scoped support screen can share them. All are pure/prop-driven; only
// IssueRow reads `translate` from context. `onRowClick` and `showDepartment` are props, so each screen controls
// routing target and department visibility itself (RealUnit passes showDepartment={false} + a /realunit/... route).

export function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      className={`px-4 py-2 text-sm font-medium transition-colors ${
        active ? 'text-dfxBlue-800 border-b-2 border-dfxBlue-800' : 'text-dfxGray-700 hover:text-dfxBlue-800'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-dfxGray-700">{label}</label>
      <select
        className="px-2 py-1.5 text-xs border border-dfxGray-400 rounded bg-white text-dfxBlue-800 min-w-[130px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export interface IssueGroups {
  needsReply: SupportIssueListItem[];
  answered: SupportIssueListItem[];
}

const COLUMN_COUNT = 7;

// Height of the sticky table header (text-xs line + py-1.5); section headers stick right below it.
const SECTION_HEADER_TOP = 'top-7';

function IssueTableHeader({ showDepartment }: { showDepartment: boolean }): JSX.Element {
  return (
    <thead className="sticky top-0 z-20 bg-dfxGray-300">
      <tr>
        <th className="px-2 py-1.5 text-left text-xs font-semibold text-dfxBlue-800">Type</th>
        <th className="px-2 py-1.5 text-left text-xs font-semibold text-dfxBlue-800">Name</th>
        <th className="px-2 py-1.5 text-left text-xs font-semibold text-dfxBlue-800">Clerk</th>
        {showDepartment && <th className="px-2 py-1.5 text-left text-xs font-semibold text-dfxBlue-800">Dept</th>}
        <th className="px-2 py-1.5 text-center text-xs font-semibold text-dfxBlue-800">State</th>
        <th className="px-2 py-1.5 text-center text-xs font-semibold text-dfxBlue-800">Msgs</th>
        <th className="px-2 py-1.5 text-center text-xs font-semibold text-dfxBlue-800">Last Msg</th>
      </tr>
    </thead>
  );
}

function IssueRow({
  issue,
  showDepartment,
  showWaiting,
  onRowClick,
}: {
  issue: SupportIssueListItem;
  showDepartment: boolean;
  showWaiting: boolean;
  onRowClick: (issue: SupportIssueListItem) => void;
}): JSX.Element {
  const { translate } = useSettingsContext();
  // Waiting badges only make sense for open tickets; on paged tabs (OnHold/Canceled/Completed)
  // a customer message that closed the ticket must not read as "still waiting".
  const waiting = showWaiting ? customerWaitingHours(issue) : null;
  const reason = listReasonLabel(issue.reason);
  // Full timestamps live in the tooltip: the column itself only shows the last activity, and the
  // creation date moved out of the table to keep one time column (the list is sorted by it).
  const activityTitle = [
    issue.lastMessageDate && `Last message: ${formatDateTime(issue.lastMessageDate)}`,
    `Created: ${formatDateTime(issue.created)}`,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <tr
      className="border-b border-dfxGray-300 transition-colors hover:bg-dfxBlue-400 cursor-pointer group"
      onClick={() => onRowClick(issue)}
    >
      <td className="px-2 py-1.5 text-xs text-dfxBlue-800 text-left group-hover:text-white">
        {translate('screens/support', typeLabel(issue.type))}
        {reason && (
          <span className="block text-2xs text-dfxGray-700 group-hover:text-white/80">
            {translate('screens/support', reason)}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 text-xs text-dfxBlue-800 text-left group-hover:text-white max-w-[280px] truncate">
        {issue.name}
      </td>
      <td className="px-2 py-1.5 text-xs text-dfxBlue-800 text-left group-hover:text-white">
        {isUnassigned(issue) ? (
          <span className="italic text-dfxGray-700 group-hover:text-white">Unassigned</span>
        ) : (
          issue.clerk || (issue.clerkUserDataId != null ? `#${issue.clerkUserDataId}` : '')
        )}
      </td>
      {showDepartment && (
        <td className="px-2 py-1.5 text-xs text-dfxBlue-800 text-left group-hover:text-white">
          {issue.department || '-'}
        </td>
      )}
      <td className="px-2 py-1.5 text-xs text-center">{statusBadge(issue.state)}</td>
      <td className="px-2 py-1.5 text-xs text-dfxBlue-800 text-center group-hover:text-white">{issue.messageCount}</td>
      <td className="px-2 py-1.5 text-xs text-dfxBlue-800 text-center whitespace-nowrap" title={activityTitle}>
        {waiting != null ? (
          <span
            className={`px-2 py-0.5 rounded-full text-2xs font-semibold ${waitTierBadgeClasses(waitTier(waiting))}`}
          >
            {translate('screens/support', 'Waiting')} {formatElapsed(waiting)}
          </span>
        ) : (
          <span className="group-hover:text-white">
            {issue.lastMessageDate ? formatDateTimeShort(issue.lastMessageDate) : '-'}
          </span>
        )}
      </td>
    </tr>
  );
}

function SectionHeader({
  label,
  count,
  colSpan,
  collapsed,
  onToggle,
}: {
  label: string;
  count: number;
  colSpan: number;
  collapsed?: boolean;
  onToggle?: () => void;
}): JSX.Element {
  const collapsible = onToggle != null;
  return (
    <tr>
      <td
        colSpan={colSpan}
        className={`sticky ${SECTION_HEADER_TOP} z-10 px-2 py-1.5 bg-dfxGray-400 text-xs font-semibold text-dfxBlue-800 ${
          collapsible ? 'cursor-pointer select-none hover:bg-dfxGray-500' : ''
        }`}
        onClick={onToggle}
        role={collapsible ? 'button' : undefined}
        aria-expanded={collapsible ? !collapsed : undefined}
      >
        {collapsible && <span className="inline-block w-3 mr-1">{collapsed ? '▸' : '▾'}</span>}
        {label} ({count})
      </td>
    </tr>
  );
}

export function GroupedIssueTable({
  groups,
  showDepartment,
  onRowClick,
}: {
  groups: IssueGroups;
  showDepartment: boolean;
  onRowClick: (issue: SupportIssueListItem) => void;
}): JSX.Element {
  // "Answered" starts folded so the tickets that need a reply own the screen; it unfolds on click
  // or on its own while there is nothing awaiting a reply (an empty table would be confusing).
  const [answeredExpanded, setAnsweredExpanded] = useState(false);
  const answeredCollapsed = !answeredExpanded && groups.needsReply.length > 0;

  const total = groups.needsReply.length + groups.answered.length;
  if (total === 0) return <div className="p-4 text-dfxGray-700 text-sm">No issues found</div>;

  const colSpan = showDepartment ? COLUMN_COUNT + 1 : COLUMN_COUNT;
  const renderRows = (issues: SupportIssueListItem[]): JSX.Element[] =>
    issues.map((issue) => (
      <IssueRow key={issue.id} issue={issue} showDepartment={showDepartment} showWaiting onRowClick={onRowClick} />
    ));

  return (
    <div className="bg-white shadow-sm flex-1 min-h-0 overflow-auto scroll-shadow">
      <table className="w-full border-collapse">
        <IssueTableHeader showDepartment={showDepartment} />
        <tbody>
          {groups.needsReply.length > 0 && (
            <>
              <SectionHeader label="Awaiting reply" count={groups.needsReply.length} colSpan={colSpan} />
              {renderRows(groups.needsReply)}
            </>
          )}
          {groups.answered.length > 0 && (
            <>
              <SectionHeader
                label="Answered"
                count={groups.answered.length}
                colSpan={colSpan}
                collapsed={answeredCollapsed}
                onToggle={() => setAnsweredExpanded(answeredCollapsed)}
              />
              {!answeredCollapsed && renderRows(groups.answered)}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function IssueTable({
  issues,
  showDepartment,
  onRowClick,
}: {
  issues: SupportIssueListItem[];
  showDepartment: boolean;
  onRowClick: (issue: SupportIssueListItem) => void;
}): JSX.Element {
  if (issues.length === 0) {
    return <div className="p-4 text-dfxGray-700 text-sm">No issues found</div>;
  }

  return (
    <div className="bg-white shadow-sm flex-1 min-h-0 overflow-auto scroll-shadow">
      <table className="w-full border-collapse">
        <IssueTableHeader showDepartment={showDepartment} />
        <tbody>
          {issues.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              showDepartment={showDepartment}
              showWaiting={false}
              onRowClick={onRowClick}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
