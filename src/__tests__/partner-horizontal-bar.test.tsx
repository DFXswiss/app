import { render, screen } from '@testing-library/react';
import { HorizontalBarList } from 'src/partner-dashboard/components/horizontal-bar-list';

describe('HorizontalBarList — every row is real, none dropped by magnitude', () => {
  it('renders a thin (small non-zero) row alongside a large one, with its exact value', () => {
    render(
      <HorizontalBarList
        title="Volume by cryptocurrency"
        currency="CHF"
        rows={[
          { name: 'BTC', volume: 1200, transactions: 20 },
          // Deliberately thin — the exact shape a k-anonymity threshold used to drop.
          { name: 'ZEC', volume: 3, transactions: 1 },
          { name: 'EmptyZero', volume: 0, transactions: 0 },
        ]}
      />,
    );

    const rows = screen.getAllByTestId('bar-row');
    expect(rows).toHaveLength(3);

    const zecRow = rows.find((el) => el.getAttribute('data-name') === 'ZEC');
    expect(zecRow).toBeTruthy();
    // Exact pinned amount — never rounded away, never withheld as a gap
    expect(zecRow).toHaveTextContent('3 CHF');
    expect(zecRow).not.toHaveTextContent('–');

    const zeroRow = rows.find((el) => el.getAttribute('data-name') === 'EmptyZero');
    expect(zeroRow).toBeTruthy();
  });
});
