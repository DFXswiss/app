// Component tests for the shared RealUnit redemption table: loading, error and empty states, the kind
// filter, the held-for-review filter and column, the credited filter, the incomplete rows hidden by
// default, row navigation per kind, and the search over guest name, guest account and remittance info
// with its "x of y shown" counter.

jest.mock('@dfx.swiss/react', () => ({}));
jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: () => <div data-testid="spinner" />,
  StyledSearchInput: ({ placeholder, onChange }: { placeholder: string; onChange: (value: string) => void }) => (
    <input aria-label={placeholder} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  ),
}));
jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

const mockNavigate = jest.fn();
jest.mock('src/hooks/navigation.hook', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

const mockGetRelations = jest.fn();
jest.mock('src/hooks/realunit-referral.hook', () => ({
  useRealunitReferral: () => ({ getRelations: mockGetRelations }),
}));

jest.mock('src/util/utils', () => ({ formatSwissDateTimeWithSeconds: (v: string) => `at ${v}` }));

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  RealunitReferralRelations,
  isIncompleteRelation,
  matchesRelationSearch,
} from 'src/components/realunit/referral-relations';
import { RealUnitCodeKind, RealUnitManualReviewStatus, RealUnitReferralRelation } from 'src/dto/realunit-referral.dto';

const translate = (_ns: string, key: string) => key;

const PROMO_NAMED: RealUnitReferralRelation = {
  id: 5,
  kind: RealUnitCodeKind.PROMO,
  userId: 14,
  guestAccountId: 434248,
  guestName: 'Axel Mueller',
  code: 'WEWO',
  credited: true,
  qualifyingBuyReference: 'REALU-160704',
  created: '2026-10-01T10:00:00Z',
};
const PROMO_ANONYMOUS: RealUnitReferralRelation = {
  id: 6,
  kind: RealUnitCodeKind.PROMO,
  userId: 15,
  guestAccountId: 434352,
  code: 'TICHY',
  credited: false,
  created: '2026-10-02T10:00:00Z',
};
const PROMO_BARE: RealUnitReferralRelation = {
  id: 7,
  kind: RealUnitCodeKind.PROMO,
  userId: 16,
  code: 'WOV',
  credited: false,
  created: '2026-10-03T10:00:00Z',
};
const INVITE_PENDING: RealUnitReferralRelation = {
  id: 1,
  kind: RealUnitCodeKind.INVITE,
  userId: 10,
  guestAccountId: 434001,
  guestName: 'Pending Guest',
  code: 'AB12CD',
  credited: false,
  created: '2026-09-01T10:00:00Z',
  reviewStatus: RealUnitManualReviewStatus.PENDING,
};
const INVITE_UNREVIEWED: RealUnitReferralRelation = {
  id: 2,
  kind: RealUnitCodeKind.INVITE,
  userId: 11,
  guestAccountId: 434002,
  guestName: 'Credited Guest',
  code: 'ZZ99YY',
  credited: true,
  created: '2026-09-02T10:00:00Z',
};

function renderPromo(): void {
  render(
    <RealunitReferralRelations
      kind={RealUnitCodeKind.PROMO}
      title="Redemptions"
      withReview={false}
      translate={translate}
    />,
  );
}

function renderInvites(): void {
  render(<RealunitReferralRelations kind={RealUnitCodeKind.INVITE} title="Invites" withReview translate={translate} />);
}

function showIncomplete(count: number): void {
  fireEvent.click(screen.getByLabelText(`Show incomplete (${count})`));
}

function rows(): HTMLElement[] {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1);
}

describe('matchesRelationSearch', () => {
  it('matches every row on a blank query', () => {
    expect(matchesRelationSearch(PROMO_BARE, '')).toBe(true);
    expect(matchesRelationSearch(PROMO_BARE, '   ')).toBe(true);
  });

  it('matches guest name, guest account and remittance info case-insensitively', () => {
    expect(matchesRelationSearch(PROMO_NAMED, 'mueller')).toBe(true);
    expect(matchesRelationSearch(PROMO_NAMED, ' AXEL ')).toBe(true);
    expect(matchesRelationSearch(PROMO_NAMED, '4342')).toBe(true);
    expect(matchesRelationSearch(PROMO_NAMED, 'realu-160704')).toBe(true);
  });

  it('does not match the code, the id or a row without the searched fields', () => {
    expect(matchesRelationSearch(PROMO_NAMED, 'WEWO')).toBe(false);
    expect(matchesRelationSearch(PROMO_NAMED, '5')).toBe(false);
    expect(matchesRelationSearch(PROMO_BARE, 'a')).toBe(false);
  });
});

describe('isIncompleteRelation', () => {
  it('treats a redemption without a guest name as incomplete', () => {
    expect(isIncompleteRelation(PROMO_BARE)).toBe(true);
    expect(isIncompleteRelation({ ...PROMO_NAMED, guestName: '   ' })).toBe(true);
    expect(isIncompleteRelation(PROMO_NAMED)).toBe(false);
  });
});

describe('RealunitReferralRelations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the spinner and an open count while loading', () => {
    mockGetRelations.mockReturnValue(new Promise(() => undefined));
    renderPromo();

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.getByText('Redemptions: …')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the error message when loading fails', async () => {
    mockGetRelations.mockRejectedValue(new Error('boom'));
    renderPromo();

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('boom'));
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
  });

  it('falls back to a generic error message when the rejection has no message', async () => {
    mockGetRelations.mockRejectedValue({});
    renderPromo();

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error'));
  });

  it('lists only rows of its kind, with dashes for missing values and without the review column', async () => {
    mockGetRelations.mockResolvedValue([PROMO_NAMED, INVITE_PENDING, PROMO_BARE]);
    renderPromo();

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

    expect(screen.getByText('Redemptions: 2')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Held for review only/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Credited only (1)')).not.toBeChecked();
    expect(screen.getByLabelText('Show incomplete (1)')).not.toBeChecked();
    expect(screen.queryByRole('columnheader', { name: 'Review Status' })).not.toBeInTheDocument();
    expect(screen.queryByText('AB12CD')).not.toBeInTheDocument();

    showIncomplete(1);
    expect(screen.queryByText(/shown/)).not.toBeInTheDocument();

    const [named, bare] = rows();
    expect(
      within(named)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['5', 'WEWO', '434248', 'Axel Mueller', 'Yes', 'REALU-160704', 'at 2026-10-01T10:00:00Z']);
    expect(
      within(bare)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['7', 'WOV', '-', '-', 'No', '-', 'at 2026-10-03T10:00:00Z']);
  });

  it('shows the empty hint when no row of its kind exists', async () => {
    mockGetRelations.mockResolvedValue([INVITE_PENDING]);
    renderPromo();

    await waitFor(() => expect(screen.getByText('No entries found')).toBeInTheDocument());
    expect(screen.getByText('Redemptions: 0')).toBeInTheDocument();
  });

  it('opens the promo redemption detail on row click', async () => {
    mockGetRelations.mockResolvedValue([PROMO_NAMED]);
    renderPromo();
    await waitFor(() => expect(screen.getByText('WEWO')).toBeInTheDocument());

    fireEvent.click(screen.getByText('WEWO'));

    expect(mockNavigate).toHaveBeenCalledWith('/realunit/promo/5');
  });

  it('shows the review column and filter for invites and opens the referral detail', async () => {
    mockGetRelations.mockResolvedValue([INVITE_PENDING, INVITE_UNREVIEWED, PROMO_NAMED]);
    renderInvites();

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

    expect(screen.getByText('Invites: 2')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Review Status' })).toBeInTheDocument();
    expect(screen.getByText('Held for review only (1)')).toBeInTheDocument();
    const [pending, unreviewed] = rows();
    expect(within(pending).getAllByRole('cell')[4]).toHaveTextContent('Open');
    expect(within(unreviewed).getAllByRole('cell')[4]).toHaveTextContent('-');

    fireEvent.click(screen.getByLabelText('Held for review only (1)'));
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('1 of 2 shown')).toBeInTheDocument();
    expect(screen.queryByText('ZZ99YY')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('AB12CD'));
    expect(mockNavigate).toHaveBeenCalledWith('/realunit/referral/1');
  });

  it('narrows the list to credited redemptions and counts them', async () => {
    mockGetRelations.mockResolvedValue([PROMO_NAMED, PROMO_ANONYMOUS, PROMO_BARE]);
    renderPromo();
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    showIncomplete(2);

    const creditedOnly = screen.getByLabelText('Credited only (1)');
    expect(creditedOnly).not.toBeChecked();
    expect(rows()).toHaveLength(3);

    fireEvent.click(creditedOnly);
    expect(creditedOnly).toBeChecked();
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('1 of 3 shown')).toBeInTheDocument();
    expect(screen.getByText('WEWO')).toBeInTheDocument();
    expect(screen.queryByText('TICHY')).not.toBeInTheDocument();
    expect(screen.queryByText('WOV')).not.toBeInTheDocument();

    fireEvent.click(creditedOnly);
    expect(rows()).toHaveLength(3);
    expect(screen.queryByText(/shown/)).not.toBeInTheDocument();
  });

  it('combines the credited filter with the review filter and the search', async () => {
    mockGetRelations.mockResolvedValue([INVITE_PENDING, INVITE_UNREVIEWED]);
    renderInvites();
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Credited only (1)'));
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('ZZ99YY')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 shown')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Held for review only (1)'));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('No entries found')).toBeInTheDocument();
    expect(screen.getByText('0 of 2 shown')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Held for review only (1)'));
    fireEvent.change(screen.getByPlaceholderText('Search name, guest account or remittance info'), {
      target: { value: 'ab12' },
    });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('0 of 2 shown')).toBeInTheDocument();
  });

  it('filters by guest name, guest account or remittance info and counts the shown rows', async () => {
    mockGetRelations.mockResolvedValue([PROMO_NAMED, PROMO_ANONYMOUS, PROMO_BARE]);
    renderPromo();
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    showIncomplete(2);

    const search = screen.getByPlaceholderText('Search name, guest account or remittance info');

    fireEvent.change(search, { target: { value: 'MUELLER' } });
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('Axel Mueller')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 shown')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: '434352' } });
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('TICHY')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'realu-1607' } });
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('WEWO')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'nobody' } });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('No entries found')).toBeInTheDocument();
    expect(screen.getByText('0 of 3 shown')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: '   ' } });
    expect(rows()).toHaveLength(3);
    expect(screen.queryByText(/shown/)).not.toBeInTheDocument();
  });

  it('applies the search on top of the held-for-review filter', async () => {
    mockGetRelations.mockResolvedValue([INVITE_PENDING, INVITE_UNREVIEWED]);
    renderInvites();
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Held for review only (1)'));
    fireEvent.change(screen.getByPlaceholderText('Search name, guest account or remittance info'), {
      target: { value: 'pending' },
    });
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('AB12CD')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search name, guest account or remittance info'), {
      target: { value: '434001x' },
    });
    expect(screen.getByText('No entries found')).toBeInTheDocument();
    expect(screen.getByText('0 of 2 shown')).toBeInTheDocument();
  });
  it('hides the redemptions without a guest name by default and shows them on request', async () => {
    mockGetRelations.mockResolvedValue([PROMO_NAMED, PROMO_ANONYMOUS, PROMO_BARE]);
    renderPromo();
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

    const toggle = screen.getByLabelText('Show incomplete (2)');
    expect(toggle).not.toBeChecked();
    expect(screen.getByText('Redemptions: 3')).toBeInTheDocument();
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('WEWO')).toBeInTheDocument();
    expect(screen.queryByText('TICHY')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 3 shown')).toBeInTheDocument();

    // a search for a hidden row finds it only once the incomplete rows are shown
    fireEvent.change(screen.getByPlaceholderText('Search name, guest account or remittance info'), {
      target: { value: '434352' },
    });
    expect(screen.getByText('No entries found')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('TICHY')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 shown')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search name, guest account or remittance info'), {
      target: { value: '' },
    });
    expect(rows()).toHaveLength(3);
    expect(screen.queryByText(/shown/)).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(rows()).toHaveLength(1);
  });

  it('keeps the credited filter working with the incomplete rows hidden', async () => {
    mockGetRelations.mockResolvedValue([PROMO_NAMED, PROMO_ANONYMOUS, PROMO_BARE]);
    renderPromo();
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Credited only (1)'));
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('WEWO')).toBeInTheDocument();

    showIncomplete(2);
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('1 of 3 shown')).toBeInTheDocument();
  });
});
