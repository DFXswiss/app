import { render, screen } from '@testing-library/react';
import { KpiTile } from 'src/partner-dashboard/components/kpi-tile';
import { formatAmount, formatAmountWhole, formatCount } from 'src/partner-dashboard/util/format';

describe('KpiTile null vs zero', () => {
  it('renders a suppressed gap for null — never as 0', () => {
    render(
      <KpiTile
        label="Neue Nutzer"
        value={null}
        format={(n) => formatCount(n)}
        testId="kpi-new"
      />,
    );

    expect(screen.getByTestId('kpi-suppressed')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-suppressed')).toHaveTextContent('–');
    expect(screen.queryByTestId('kpi-value')).not.toBeInTheDocument();
    expect(screen.getByTestId('kpi-new')).toHaveAttribute('data-kind', 'suppressed');
    // Must not claim the value is zero
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('renders a real zero as 0', () => {
    render(
      <KpiTile
        label="Neue Nutzer"
        value={0}
        format={(n) => formatCount(n)}
        testId="kpi-new-zero"
      />,
    );

    expect(screen.getByTestId('kpi-value')).toHaveTextContent('0');
    expect(screen.queryByTestId('kpi-suppressed')).not.toBeInTheDocument();
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
          label="Gesamtvolumen"
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
          label="Ø-Vorgangsgröße"
          value={109.25}
          format={(n) => formatAmount(n, 'CHF')}
          testId="kpi-avg-narrow"
        />
      </div>,
    );
    expect(screen.getByTestId('kpi-value').textContent).toBe(full);
  });
});
