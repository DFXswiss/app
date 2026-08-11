import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PeriodControls } from 'src/partner-dashboard/components/period-controls';

describe('PeriodControls', () => {
  it('invokes onPeriodChange with the clicked day count', async () => {
    const onPeriodChange = jest.fn();
    const onGranularityChange = jest.fn();

    render(
      <PeriodControls
        periodDays={30}
        granularity="Day"
        onPeriodChange={onPeriodChange}
        onGranularityChange={onGranularityChange}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '90 days' }));
    expect(onPeriodChange).toHaveBeenCalledTimes(1);
    expect(onPeriodChange).toHaveBeenCalledWith(90);

    await userEvent.click(screen.getByRole('button', { name: '365 days' }));
    expect(onPeriodChange).toHaveBeenLastCalledWith(365);
  });

  it('invokes onGranularityChange with the clicked granularity', async () => {
    const onPeriodChange = jest.fn();
    const onGranularityChange = jest.fn();

    render(
      <PeriodControls
        periodDays={30}
        granularity="Day"
        onPeriodChange={onPeriodChange}
        onGranularityChange={onGranularityChange}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Week' }));
    expect(onGranularityChange).toHaveBeenCalledTimes(1);
    expect(onGranularityChange).toHaveBeenCalledWith('Week');

    await userEvent.click(screen.getByRole('button', { name: 'Month' }));
    expect(onGranularityChange).toHaveBeenLastCalledWith('Month');
  });

  it('marks the active period and granularity via aria-pressed', () => {
    render(
      <PeriodControls
        periodDays={90}
        granularity="Week"
        onPeriodChange={jest.fn()}
        onGranularityChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'false');
  });
});
