import { render, screen } from '@testing-library/react';
import { KpiTile } from 'src/partner-dashboard/components/kpi-tile';
import { formatAmount, formatAmountWhole, formatCount } from 'src/partner-dashboard/util/format';

describe('KpiTile null vs zero', () => {
  it('renders an absent gap for null — never as 0', () => {
    render(
      <KpiTile
        label="Average transaction size"
        value={null}
        format={(n) => formatCount(n)}
        testId="kpi-new"
      />,
    );

    expect(screen.getByTestId('kpi-absent')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-absent')).toHaveTextContent('–');
    expect(screen.queryByTestId('kpi-value')).not.toBeInTheDocument();
    expect(screen.getByTestId('kpi-new')).toHaveAttribute('data-kind', 'absent');
    // Must not claim the value is zero
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('renders a real zero as 0', () => {
    render(
      <KpiTile
        label="New users"
        value={0}
        format={(n) => formatCount(n)}
        testId="kpi-new-zero"
      />,
    );

    expect(screen.getByTestId('kpi-value')).toHaveTextContent('0');
    expect(screen.queryByTestId('kpi-absent')).not.toBeInTheDocument();
    expect(screen.getByTestId('kpi-new-zero')).toHaveAttribute('data-kind', 'value');
  });
});

describe('KpiTile full value on narrow widths (D2)', () => {
  it('keeps the full amount string including currency — no truncate/ellipsis class', () => {
    const full = formatAmountWhole(245801.35, 'CHF');
    expect(full).toMatch(/CHF/);

    render(
      <div style={{ width: 160 }}>
        <KpiTile
          label="Total volume"
          value={245801.35}
          format={(n) => formatAmountWhole(n, 'CHF')}
          testId="kpi-volume-narrow"
        />
      </div>,
    );

    const valueEl = screen.getByTestId('kpi-value');
    // Full string must be in the DOM (not ellipsised away)
    expect(valueEl).toHaveTextContent(full);
    expect(valueEl.textContent).toBe(full);
    // No CSS truncation classes that hide the currency
    expect(valueEl.className).not.toMatch(/\btruncate\b/);
    expect(valueEl.className).not.toMatch(/text-ellipsis/);
    expect(valueEl.className).not.toMatch(/overflow-hidden/);
  });

  it('keeps fractional amounts with currency fully present', () => {
    const full = formatAmount(109.25, 'CHF');
    render(
      <div style={{ width: 140 }}>
        <KpiTile
          label="Average transaction size"
          value={109.25}
          format={(n) => formatAmount(n, 'CHF')}
          testId="kpi-avg-narrow"
        />
      </div>,
    );
    expect(screen.getByTestId('kpi-value').textContent).toBe(full);
  });
});

describe('KpiTile caption', () => {
  it('renders the caption text with the ${testId}-caption data-testid', () => {
    render(
      <KpiTile
        label="Trading users (total)"
        value={24360}
        format={(n) => formatCount(n)}
        caption="19.2 % of registered users"
        testId="kpi-trading-users"
      />,
    );

    const caption = screen.getByTestId('kpi-trading-users-caption');
    expect(caption).toBeInTheDocument();
    expect(caption).toHaveTextContent('19.2 % of registered users');
  });

  it('defaults data-testid to kpi-tile (and caption suffix) when testId is omitted', () => {
    render(
      <KpiTile
        label="Active users"
        value={10}
        format={(n) => formatCount(n)}
        caption="secondary line"
      />,
    );

    expect(screen.getByTestId('kpi-tile')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-tile-caption')).toHaveTextContent('secondary line');
  });

  it('treats undefined value as empty kind (not the absent null path)', () => {
    render(
      <KpiTile
        label="Maybe"
        value={undefined}
        format={(n) => formatCount(n)}
        testId="kpi-maybe"
      />,
    );
    expect(screen.getByTestId('kpi-maybe')).toHaveAttribute('data-kind', 'empty');
    // empty still uses the value slot (not kpi-absent)
    expect(screen.getByTestId('kpi-value')).toHaveTextContent('–');
    expect(screen.queryByTestId('kpi-absent')).not.toBeInTheDocument();
  });

  /**
   * Guard: when registeredUsers is 0 the caption must never surface NaN, Infinity,
   * or a lone "0 %" — those would claim a conversion rate instead of the empty state.
   * Mutation target: registeredUsers <= 0 → registeredUsers < 0 (0/0 = NaN would slip through).
   */
  it('does not render NaN, Infinity, or a bare 0% for the no-registered-users caption', () => {
    render(
      <KpiTile
        label="Trading users (total)"
        value={0}
        format={(n) => formatCount(n)}
        caption="No registered users yet"
        testId="kpi-trading-users"
      />,
    );

    const caption = screen.getByTestId('kpi-trading-users-caption');
    const text = caption.textContent ?? '';
    expect(text).toBe('No registered users yet');
    expect(text).not.toMatch(/NaN/i);
    expect(text).not.toMatch(/Infinity/i);
    // Bare conversion zero must not appear; the empty-state prose must.
    expect(text).not.toMatch(/(^|[^0-9])0\s*%/);
    expect(text).not.toMatch(/(^|[^0-9])0%/);
    expect(text).toMatch(/No registered users yet/);
  });
});
