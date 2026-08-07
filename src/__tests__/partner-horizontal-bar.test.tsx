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
        ]}
      />,
    );

    const rows = screen.getAllByTestId('bar-row');
    expect(rows).toHaveLength(2);

    const zecRow = rows.find((el) => el.getAttribute('data-name') === 'ZEC');
    expect(zecRow).toBeTruthy();
    // Exact pinned amount — never rounded away, never withheld as a gap
    expect(zecRow).toHaveTextContent('3 CHF');
    expect(zecRow).not.toHaveTextContent('–');
  });
});

describe('HorizontalBarList — a category with no activity at all disappears', () => {
  it('drops a row with zero volume AND zero transactions (genuinely unused)', () => {
    render(
      <HorizontalBarList
        title="Payment methods"
        currency="CHF"
        rows={[
          { name: 'Bank', volume: 156_400, transactions: 1_380 },
          // No card payments this period — must not render at all, not as a 0 row.
          { name: 'Card', volume: 0, transactions: 0 },
        ]}
      />,
    );

    const rows = screen.getAllByTestId('bar-row');
    expect(rows).toHaveLength(1);
    expect(rows.find((el) => el.getAttribute('data-name') === 'Card')).toBeUndefined();
    expect(screen.queryByText('Card')).not.toBeInTheDocument();
  });

  it('keeps a row with zero volume but real transactions (not unused)', () => {
    render(
      <HorizontalBarList
        title="Fiat currencies"
        currency="CHF"
        rows={[
          { name: 'CHF', volume: 142_000, transactions: 1_120 },
          // Real activity (free transactions), zero CHF value — must still render.
          { name: 'FreeFiat', volume: 0, transactions: 5 },
        ]}
      />,
    );

    const rows = screen.getAllByTestId('bar-row');
    expect(rows).toHaveLength(2);
    expect(rows.find((el) => el.getAttribute('data-name') === 'FreeFiat')).toBeTruthy();
  });

  it('keeps a row with volume but zero counted transactions (not unused)', () => {
    render(
      <HorizontalBarList
        title="Blockchains"
        currency="CHF"
        rows={[
          { name: 'Bitcoin', volume: 111_220.9, transactions: 765 },
          { name: 'Oddity', volume: 42, transactions: 0 },
        ]}
      />,
    );

    const rows = screen.getAllByTestId('bar-row');
    expect(rows).toHaveLength(2);
    expect(rows.find((el) => el.getAttribute('data-name') === 'Oddity')).toBeTruthy();
  });

  it('shows the empty state when every row in the period is unused', () => {
    render(
      <HorizontalBarList
        title="Payment methods"
        currency="CHF"
        rows={[{ name: 'Card', volume: 0, transactions: 0 }]}
      />,
    );

    expect(screen.queryAllByTestId('bar-row')).toHaveLength(0);
    expect(screen.getByText('No data.')).toBeInTheDocument();
  });
});

describe('HorizontalBarList — zero max volume branch', () => {
  it('renders zero-width bars when every active row has volume 0 (maxVolume === 0)', () => {
    render(
      <HorizontalBarList
        title="Fiat currencies"
        currency="CHF"
        compact
        rows={[
          // Real transactions, zero CHF volume → stays (hasActivity), but maxVolume is 0
          { name: 'FreeFiat', volume: 0, transactions: 5 },
          { name: 'AlsoFree', volume: 0, transactions: 2 },
        ]}
      />,
    );

    const rows = screen.getAllByTestId('bar-row');
    expect(rows).toHaveLength(2);
    // Width formula: maxVolume > 0 ? … : 0 — bars must not claim 100%
    const fills = rows.map((row) => row.querySelector('[role="presentation"] > div') as HTMLElement);
    for (const fill of fills) {
      expect(fill.style.width).toBe('0%');
    }
  });
});
