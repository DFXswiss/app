// Unit tests for the compliance dashboard's Pending Reviews table: the fixed row order (no row for
// the retired AdditionalDocuments step), the manual-review total, expanding a row into its items and
// navigating from an item to the matching review tab.

const mockNavigate = jest.fn();
const mockGetPendingReviewItems = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  PendingReviewType: { KYC_STEP: 'KycStep', BANK_DATA: 'BankData' },
  PendingReviewStatus: { MANUAL_REVIEW: 'ManualReview', INTERNAL_REVIEW: 'InternalReview' },
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => ({ getPendingReviewItems: mockGetPendingReviewItems }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('src/components/compliance/collapsible-section', () => ({
  CollapsibleSection: ({ title, count, children }: { title: string; count: number; children: React.ReactNode }) => (
    <section>
      <h2>
        {title} ({count})
      </h2>
      {children}
    </section>
  ),
}));

import { PendingReviewSummaryEntry, PendingReviewType } from '@dfx.swiss/react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PendingReviewsSection } from 'src/components/compliance/pending-reviews-section';

function entry(
  type: PendingReviewType,
  name: string,
  manualReview: number,
  internalReview = 0,
): PendingReviewSummaryEntry {
  return { type, name, manualReview, internalReview };
}

function rowOf(name: string): HTMLElement {
  const row = screen.getAllByRole('row').find((r) => within(r).queryAllByRole('cell')[1]?.textContent === name);
  if (!row) throw new Error(`No row named ${name}`);
  return row;
}

describe('PendingReviewsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPendingReviewItems.mockResolvedValue([]);
  });

  it('renders every review row in the fixed order, BankData first, DfxApproval last, without AdditionalDocuments', () => {
    render(<PendingReviewsSection entries={[]} />);

    const names = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[1].textContent);
    expect(names[0]).toBe('BankData');
    expect(names[names.length - 1]).toBe('DfxApproval');
    expect(names.slice(-3)).toEqual(['NameChange', 'AddressChange', 'DfxApproval']);
    expect(names).toContain('Ident');
    expect(names).not.toContain('AdditionalDocuments');
    expect(screen.getByRole('heading')).toHaveTextContent('Pending Reviews (0)');
  });

  it('sums the manual reviews into the section count and marks only non-empty rows as expandable', () => {
    render(
      <PendingReviewsSection
        entries={[entry(PendingReviewType.BANK_DATA, 'BankData', 2, 4), entry(PendingReviewType.KYC_STEP, 'Ident', 1)]}
      />,
    );

    expect(screen.getByRole('heading')).toHaveTextContent('Pending Reviews (3)');
    expect(rowOf('BankData').className).toContain('cursor-pointer');
    expect(
      within(rowOf('BankData'))
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['BankData', 'BankData', '4', '2']);
    expect(rowOf('Recommendation').className).not.toContain('cursor-pointer');

    fireEvent.click(rowOf('Recommendation'));
    expect(mockGetPendingReviewItems).not.toHaveBeenCalled();
  });

  it('expands a KYC row into its items, links each item to the review tab, and collapses again', async () => {
    mockGetPendingReviewItems.mockResolvedValue([
      { id: 1, userDataId: 305938, userName: 'SAMY AMBES', accountType: 'Personal', kycLevel: 51, date: '2026-09-11' },
      { id: 2, userDataId: 423889, date: '2026-09-12' },
    ]);
    render(<PendingReviewsSection entries={[entry(PendingReviewType.KYC_STEP, 'Ident', 2)]} />);

    fireEvent.click(rowOf('Ident'));
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(mockGetPendingReviewItems).toHaveBeenCalledWith('KycStep', 'ManualReview', 'Ident');

    const item = await screen.findByText('SAMY AMBES');
    expect(
      within(item.closest('tr') as HTMLElement)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['305938', 'Personal', 'SAMY AMBES', '51', expect.stringContaining('11')]);
    expect(within(screen.getByText('423889').closest('tr') as HTMLElement).getAllByText('-')).toHaveLength(3);

    fireEvent.click(item);
    expect(mockNavigate).toHaveBeenCalledWith('compliance/user/305938/kyc?tab=ident');

    fireEvent.click(rowOf('Ident'));
    expect(screen.queryByText('SAMY AMBES')).not.toBeInTheDocument();
    expect(mockGetPendingReviewItems).toHaveBeenCalledTimes(1);
  });

  it.each([
    [PendingReviewType.BANK_DATA, 'BankData', undefined, 'bankDataReview'],
    [PendingReviewType.KYC_STEP, 'NameChange', 'NameChange', 'stammdaten'],
    [PendingReviewType.KYC_STEP, 'AddressChange', 'AddressChange', 'stammdaten'],
    [PendingReviewType.KYC_STEP, 'DfxApproval', 'DfxApproval', 'freigabe'],
  ])('routes %s/%s items (query name %p) to the %s tab', async (type, name, queryName, tab) => {
    mockGetPendingReviewItems.mockResolvedValue([{ id: 1, userDataId: 7, date: '2026-09-12' }]);
    render(<PendingReviewsSection entries={[entry(type, name, 1)]} />);

    fireEvent.click(rowOf(name));
    fireEvent.click(await screen.findByText('7'));

    expect(mockGetPendingReviewItems).toHaveBeenCalledWith(type, 'ManualReview', queryName);
    expect(mockNavigate).toHaveBeenCalledWith(`compliance/user/7/kyc?tab=${tab}`);
  });

  it('ignores an entry the ordered row list does not know', () => {
    render(<PendingReviewsSection entries={[entry(PendingReviewType.KYC_STEP, 'Unknown', 1)]} />);

    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
    expect(screen.getByRole('heading')).toHaveTextContent('Pending Reviews (0)');
  });

  it('shows the empty hint when a row expands to no items, and drops the expansion when loading fails', async () => {
    render(<PendingReviewsSection entries={[entry(PendingReviewType.KYC_STEP, 'Ident', 1)]} />);

    fireEvent.click(rowOf('Ident'));
    expect(await screen.findByText('No entries found')).toBeInTheDocument();
    fireEvent.click(rowOf('Ident'));

    mockGetPendingReviewItems.mockRejectedValue(new Error('down'));
    await act(async () => {
      fireEvent.click(rowOf('Ident'));
    });
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
    expect(screen.queryByText('No entries found')).not.toBeInTheDocument();
  });
});
