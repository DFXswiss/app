// Unit tests for the shared support-issue table components: tab and filter controls, the row
// (reason subtitle, Unassigned marker, waiting badge vs. last-message date) and the grouped table
// with its folding Answered section.

jest.mock('@dfx.swiss/react', () => ({
  SupportIssueReason: { OTHER: 'Other' },
  SupportIssueType: {},
  Department: {},
  UserRole: {},
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, key: string) => key,
  }),
}));

jest.mock('src/config/labels', () => ({
  IssueReasonLabels: { Other: 'Other', TransactionMissing: 'Transaction missing' },
  IssueTypeLabels: { GenericIssue: 'General request' },
}));

jest.mock('src/util/compliance-helpers', () => ({
  formatDateTime: (value: string) => `dt:${value}`,
  formatDateTimeShort: (value: string) => `short:${value}`,
  statusBadge: (status: string) => <span data-testid={`status-${status}`}>{status}</span>,
}));

import { fireEvent, render, screen, within } from '@testing-library/react';
import { FilterSelect, GroupedIssueTable, IssueTable, TabButton } from 'src/components/support/issue-table';
import type { SupportIssueListItem } from 'src/hooks/support-dashboard.hook';

const HOUR_MS = 60 * 60 * 1000;

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * HOUR_MS).toISOString();
}

function issue(partial: Partial<SupportIssueListItem> = {}): SupportIssueListItem {
  return {
    id: 1,
    uid: 'u1',
    type: 'GenericIssue',
    reason: 'Other',
    state: 'Created',
    name: 'Ticket',
    clerk: 'Jana',
    created: '2026-08-30T10:00:00Z',
    messageCount: 1,
    ...partial,
  };
}

function rowOf(name: string): HTMLElement {
  const row = screen.getByText(name).closest('tr');
  if (!row) throw new Error(`row "${name}" not found`);
  return row;
}

describe('TabButton', () => {
  it('renders the label, marks the active tab and forwards clicks', () => {
    const onClick = jest.fn();
    const { rerender } = render(<TabButton label="Open (3)" active onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Open (3)' });
    expect(button.className).toContain('border-b-2');

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<TabButton label="Open (3)" active={false} onClick={onClick} />);
    expect(screen.getByRole('button', { name: 'Open (3)' }).className).not.toContain('border-b-2');
  });
});

describe('FilterSelect', () => {
  it('offers All plus the options and reports a change', () => {
    const onChange = jest.fn();
    render(
      <FilterSelect
        label="State"
        value=""
        onChange={onChange}
        options={[
          { value: 'Created', label: 'Created' },
          { value: 'Pending', label: 'Pending' },
        ]}
      />,
    );

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['All', 'Created', 'Pending']);

    fireEvent.change(select, { target: { value: 'Pending' } });
    expect(onChange).toHaveBeenCalledWith('Pending');
  });
});

describe('IssueTable', () => {
  it('shows the empty hint without issues', () => {
    render(<IssueTable issues={[]} showDepartment onRowClick={jest.fn()} />);
    expect(screen.getByText('No issues found')).toBeInTheDocument();
  });

  it('renders the header with and without the department column', () => {
    const { rerender } = render(<IssueTable issues={[issue()]} showDepartment onRowClick={jest.fn()} />);
    expect(screen.getByRole('columnheader', { name: 'Dept' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Reason' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Created' })).not.toBeInTheDocument();

    rerender(<IssueTable issues={[issue()]} showDepartment={false} onRowClick={jest.fn()} />);
    expect(screen.queryByRole('columnheader', { name: 'Dept' })).not.toBeInTheDocument();
  });

  it('shows the type label, hides the Other reason and keeps specific reasons as subtitle', () => {
    render(
      <IssueTable
        issues={[
          issue({ id: 1, name: 'Other reason', reason: 'Other' }),
          issue({ id: 2, name: 'Specific reason', reason: 'TransactionMissing' }),
        ]}
        showDepartment={false}
        onRowClick={jest.fn()}
      />,
    );

    expect(within(rowOf('Other reason')).getByText('General request')).toBeInTheDocument();
    expect(within(rowOf('Other reason')).queryByText('Other')).not.toBeInTheDocument();
    expect(within(rowOf('Specific reason')).getByText('Transaction missing')).toBeInTheDocument();
  });

  it('marks tickets without a clerk (or with only the bot) as Unassigned', () => {
    render(
      <IssueTable
        issues={[
          issue({ id: 1, name: 'No clerk', clerk: undefined }),
          issue({ id: 2, name: 'Bot clerk', clerk: 'AutoResponder' }),
          issue({ id: 3, name: 'Has clerk', clerk: 'Jana' }),
        ]}
        showDepartment={false}
        onRowClick={jest.fn()}
      />,
    );

    expect(within(rowOf('No clerk')).getByText('Unassigned')).toBeInTheDocument();
    expect(within(rowOf('Bot clerk')).getByText('Unassigned')).toBeInTheDocument();
    expect(within(rowOf('Has clerk')).getByText('Jana')).toBeInTheDocument();
    expect(within(rowOf('Has clerk')).queryByText('Unassigned')).not.toBeInTheDocument();
  });

  it('renders the department or a dash, the state badge and the message count', () => {
    render(
      <IssueTable
        issues={[
          issue({ id: 1, name: 'With dept', department: 'Compliance', state: 'Pending', messageCount: 7 }),
          issue({ id: 2, name: 'Without dept', department: undefined, lastMessageDate: '2026-09-01T10:00:00Z' }),
        ]}
        showDepartment
        onRowClick={jest.fn()}
      />,
    );

    const withDept = rowOf('With dept');
    expect(within(withDept).getByText('Compliance')).toBeInTheDocument();
    expect(within(withDept).getByTestId('status-Pending')).toBeInTheDocument();
    expect(within(withDept).getByText('7')).toBeInTheDocument();
    expect(within(rowOf('Without dept')).getByText('-')).toBeInTheDocument();
  });

  it('never shows a waiting badge on paged tabs, only the short last-message date or a dash', () => {
    render(
      <IssueTable
        issues={[
          issue({ id: 1, name: 'Customer last', lastMessageAuthor: 'Customer', lastMessageDate: hoursAgo(30) }),
          issue({ id: 2, name: 'No message', lastMessageDate: undefined, messageCount: 0 }),
        ]}
        showDepartment={false}
        onRowClick={jest.fn()}
      />,
    );

    expect(within(rowOf('Customer last')).queryByText(/^Waiting/)).not.toBeInTheDocument();
    expect(within(rowOf('Customer last')).getByText(/^short:/)).toBeInTheDocument();
    expect(within(rowOf('No message')).getByText('-')).toBeInTheDocument();
  });

  it('puts both timestamps into the row tooltip, the creation date alone without a message', () => {
    render(
      <IssueTable
        issues={[
          issue({ id: 1, name: 'With message', lastMessageDate: '2026-09-01T10:00:00Z' }),
          issue({ id: 2, name: 'Without message', lastMessageDate: undefined }),
        ]}
        showDepartment={false}
        onRowClick={jest.fn()}
      />,
    );

    expect(within(rowOf('With message')).getByTitle(/Last message: dt:2026-09-01T10:00:00Z/)).toBeInTheDocument();
    expect(within(rowOf('With message')).getByTitle(/Created: dt:2026-08-30T10:00:00Z/)).toBeInTheDocument();
    const withoutTitle = within(rowOf('Without message'))
      .getByTitle(/Created:/)
      .getAttribute('title');
    expect(withoutTitle).toBe('Created: dt:2026-08-30T10:00:00Z');
  });

  it('forwards a row click with the issue', () => {
    const onRowClick = jest.fn();
    const clicked = issue({ id: 42, name: 'Click me' });
    render(<IssueTable issues={[clicked]} showDepartment={false} onRowClick={onRowClick} />);

    fireEvent.click(screen.getByText('Click me'));
    expect(onRowClick).toHaveBeenCalledWith(clicked);
  });
});

describe('GroupedIssueTable', () => {
  it('shows the empty hint when both groups are empty', () => {
    render(<GroupedIssueTable groups={{ needsReply: [], answered: [] }} showDepartment onRowClick={jest.fn()} />);
    expect(screen.getByText('No issues found')).toBeInTheDocument();
  });

  it('shows tiered waiting badges for tickets awaiting a reply', () => {
    render(
      <GroupedIssueTable
        groups={{
          needsReply: [
            issue({ id: 1, name: 'Fresh', lastMessageAuthor: 'Customer', lastMessageDate: hoursAgo(0.5) }),
            issue({ id: 2, name: 'Half day', lastMessageAuthor: 'Customer', lastMessageDate: hoursAgo(13) }),
            issue({ id: 3, name: 'Escalated', lastMessageAuthor: 'Customer', lastMessageDate: hoursAgo(30) }),
            issue({ id: 4, name: 'No message yet', lastMessageAuthor: undefined, lastMessageDate: undefined }),
          ],
          answered: [],
        }}
        showDepartment={false}
        onRowClick={jest.fn()}
      />,
    );

    expect(screen.getByText('Awaiting reply (4)')).toBeInTheDocument();
    expect(within(rowOf('Fresh')).getByText('Waiting 30m').className).toContain('bg-dfxGray-300');
    expect(within(rowOf('Half day')).getByText('Waiting 13h').className).toContain('dfxYellow');
    expect(within(rowOf('Escalated')).getByText('Waiting 1d 6h').className).toContain('bg-dfxRed-100');
    expect(within(rowOf('No message yet')).getByText('-')).toBeInTheDocument();
  });

  it('folds Answered while tickets await a reply and unfolds it on click', () => {
    render(
      <GroupedIssueTable
        groups={{
          needsReply: [issue({ id: 1, name: 'Needs reply', lastMessageAuthor: 'Customer' })],
          answered: [issue({ id: 2, name: 'Answered ticket', lastMessageAuthor: 'Jana' })],
        }}
        showDepartment={false}
        onRowClick={jest.fn()}
      />,
    );

    const header = screen.getByRole('button', { name: /Answered \(1\)/ });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Answered ticket')).not.toBeInTheDocument();

    fireEvent.click(header);
    expect(screen.getByRole('button', { name: /Answered \(1\)/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Answered ticket')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Answered \(1\)/ }));
    expect(screen.queryByText('Answered ticket')).not.toBeInTheDocument();
  });

  it('keeps Answered open while nothing awaits a reply and the Awaiting header is not a button', () => {
    const onRowClick = jest.fn();
    const answered = issue({ id: 2, name: 'Answered ticket', lastMessageAuthor: 'Jana' });
    render(
      <GroupedIssueTable groups={{ needsReply: [], answered: [answered] }} showDepartment onRowClick={onRowClick} />,
    );

    expect(screen.queryByText(/Awaiting reply/)).not.toBeInTheDocument();
    expect(screen.getByText('Answered ticket')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Answered ticket'));
    expect(onRowClick).toHaveBeenCalledWith(answered);
  });

  it('renders the Awaiting header without toggle semantics', () => {
    render(
      <GroupedIssueTable
        groups={{ needsReply: [issue({ id: 1, name: 'Needs reply', lastMessageAuthor: 'Customer' })], answered: [] }}
        showDepartment={false}
        onRowClick={jest.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /Awaiting reply/ })).not.toBeInTheDocument();
    expect(screen.getByText('Awaiting reply (1)')).toBeInTheDocument();
  });
});
