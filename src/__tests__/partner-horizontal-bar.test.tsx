import { render, screen } from '@testing-library/react';
import { HorizontalBarList } from 'src/partner-dashboard/components/horizontal-bar-list';

describe('HorizontalBarList suppression', () => {
  it('renders a privacy gap for null volume rows, not a zero-length bar', () => {
    render(
      <HorizontalBarList
        title="Volume by cryptocurrency"
        currency="CHF"
        rows={[
          { name: 'BTC', volume: 1000, transactions: 20 },
          { name: 'ZEC', volume: null, transactions: null },
          { name: 'EmptyZero', volume: 0, transactions: 0 },
        ]}
      />,
    );

    const suppressed = screen.getByTestId('bar-suppressed');
    expect(suppressed).toHaveAttribute('data-name', 'ZEC');
    // Placeholder dash, never a numeric zero for the suppressed row value
    expect(suppressed).toHaveTextContent('–');
    expect(suppressed).not.toHaveTextContent(/^0$|0\.00/);

    const zeroRow = screen.getAllByTestId('bar-row').find((el) => el.getAttribute('data-name') === 'EmptyZero');
    expect(zeroRow).toBeTruthy();
  });
});
