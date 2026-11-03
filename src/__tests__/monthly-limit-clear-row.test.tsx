// Unit tests for MonthlyLimitClearRow: the texts, the confirm, the call, the summary, the guards and the
// error path.

const mockClear = jest.fn();

jest.mock('src/hooks/monthly-limit-clear.hook', () => ({
  useMonthlyLimitClear: () => ({ clearMonthlyLimit: mockClear }),
}));

jest.mock('src/components/error-hint', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  return {
    ErrorHint: ({ message }: { message: string }) =>
      React.createElement('div', { 'data-testid': 'error-hint' }, message),
  };
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  MONTHLY_LIMIT_CLEAR_CONFIRM,
  MONTHLY_LIMIT_CLEAR_HINT,
  MONTHLY_LIMIT_CLEAR_LABEL,
  MONTHLY_LIMIT_CLEAR_SUMMARY,
  MONTHLY_LIMIT_CLEAR_TITLE,
  MonthlyLimitClearRow,
} from 'src/components/compliance/monthly-limit-clear-row';
import { MonthlyLimitClearTarget } from 'src/hooks/monthly-limit-clear.hook';

const target: MonthlyLimitClearTarget = { kind: 'buyCrypto', id: 136855 };
const otherTarget: MonthlyLimitClearTarget = { kind: 'buyCrypto', id: 999 };

function button(): HTMLButtonElement {
  return screen.getByRole('button', { name: MONTHLY_LIMIT_CLEAR_LABEL }) as HTMLButtonElement;
}

function pending(): { promise: Promise<void>; resolve: () => void; reject: (reason: unknown) => void } {
  let resolve: () => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('MonthlyLimitClearRow', () => {
  beforeEach(() => {
    mockClear.mockReset();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => jest.restoreAllMocks());

  it('renders the title, the explanation and the button', () => {
    render(<MonthlyLimitClearRow target={target} disabled={false} />);

    expect(screen.getByText(MONTHLY_LIMIT_CLEAR_TITLE)).toBeInTheDocument();
    expect(screen.getByText(MONTHLY_LIMIT_CLEAR_HINT)).toBeInTheDocument();
    expect(button()).toBeEnabled();
  });

  it('exports the clerk-facing texts and keeps the yearly limit without a payout-address exemption', () => {
    expect(MONTHLY_LIMIT_CLEAR_LABEL).toBe('Monatslimit quittieren');
    expect(MONTHLY_LIMIT_CLEAR_TITLE).toBe('Monatslimit blockiert die Zahlung');
    expect(MONTHLY_LIMIT_CLEAR_CONFIRM).toBe(
      'Monatslimit für diese Zahlung wirklich quittieren?\n\nDie Zahlung wird danach automatisch neu geprüft.',
    );
    expect(MONTHLY_LIMIT_CLEAR_SUMMARY).toBe('Monatslimit quittiert. Die Zahlung wird neu geprüft.');
    expect(MONTHLY_LIMIT_CLEAR_HINT).toContain('500\u2019000');
    expect(MONTHLY_LIMIT_CLEAR_HINT).toContain('Jahreslimit');
    expect(MONTHLY_LIMIT_CLEAR_HINT).not.toContain('Auszahlungsadresse');
  });

  it('asks for confirmation, calls the API, shows the summary and reloads the owner', async () => {
    const call = pending();
    mockClear.mockReturnValue(call.promise);
    const onCleared = jest.fn().mockResolvedValue(undefined);

    render(<MonthlyLimitClearRow target={target} disabled={false} onCleared={onCleared} />);
    fireEvent.click(button());

    expect(window.confirm).toHaveBeenCalledWith(MONTHLY_LIMIT_CLEAR_CONFIRM);
    expect(screen.getByRole('button', { name: 'Wird quittiert...' })).toBeDisabled();

    await act(async () => call.resolve());
    await waitFor(() => expect(screen.getByText(MONTHLY_LIMIT_CLEAR_SUMMARY)).toBeInTheDocument());

    expect(mockClear).toHaveBeenCalledWith(target);
    expect(onCleared).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(MONTHLY_LIMIT_CLEAR_HINT)).not.toBeInTheDocument();
  });

  it('works without an owner callback', async () => {
    mockClear.mockResolvedValue(undefined);

    render(<MonthlyLimitClearRow target={target} disabled={false} />);
    fireEvent.click(button());

    await waitFor(() => expect(screen.getByText(MONTHLY_LIMIT_CLEAR_SUMMARY)).toBeInTheDocument());
    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the confirmation is rejected', () => {
    (window.confirm as jest.Mock).mockReturnValue(false);

    render(<MonthlyLimitClearRow target={target} disabled={false} />);
    fireEvent.click(button());

    expect(mockClear).not.toHaveBeenCalled();
    expect(button()).toBeEnabled();
  });

  it('is disabled while the parent is saving', () => {
    render(<MonthlyLimitClearRow target={target} disabled={true} />);

    expect(button()).toBeDisabled();
  });

  it('starts one call for two clicks in the same tick', async () => {
    const call = pending();
    mockClear.mockReturnValue(call.promise);

    render(<MonthlyLimitClearRow target={target} disabled={false} />);
    const element = button();
    await act(async () => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockClear).toHaveBeenCalledTimes(1);
    await act(async () => call.resolve());
    await waitFor(() => expect(screen.getByText(MONTHLY_LIMIT_CLEAR_SUMMARY)).toBeInTheDocument());
  });

  it('shows the API error and offers the button again', async () => {
    mockClear.mockRejectedValue(new Error('BuyCrypto is not held for a monthly limit'));

    render(<MonthlyLimitClearRow target={target} disabled={false} />);
    fireEvent.click(button());

    await waitFor(() =>
      expect(screen.getByTestId('error-hint')).toHaveTextContent('BuyCrypto is not held for a monthly limit'),
    );
    expect(button()).toBeEnabled();
  });

  it('falls back to a generic message when the rejection is not an Error', async () => {
    mockClear.mockRejectedValue('boom');

    render(<MonthlyLimitClearRow target={target} disabled={false} />);
    fireEvent.click(button());

    await waitFor(() =>
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Failed to clear the monthly limit hold'),
    );
  });

  it('ignores a late answer after the row was unmounted but still reloads the owner', async () => {
    const call = pending();
    mockClear.mockReturnValue(call.promise);
    const onCleared = jest.fn().mockResolvedValue(undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { unmount } = render(<MonthlyLimitClearRow target={target} disabled={false} onCleared={onCleared} />);
    fireEvent.click(button());
    unmount();
    await act(async () => call.resolve());

    expect(onCleared).toHaveBeenCalledTimes(1);
    // No "state update on an unmounted component" warning: the guards held.
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('ignores a late error after the row was unmounted', async () => {
    const call = pending();
    mockClear.mockReturnValue(call.promise);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { unmount } = render(<MonthlyLimitClearRow target={target} disabled={false} />);
    fireEvent.click(button());
    unmount();
    await act(async () => call.reject(new Error('late')));

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('ignores a late answer and a late error for the previous transaction after the target switched', async () => {
    const call = pending();
    mockClear.mockReturnValue(call.promise);
    const onCleared = jest.fn().mockResolvedValue(undefined);

    const { rerender } = render(<MonthlyLimitClearRow target={target} disabled={false} onCleared={onCleared} />);
    fireEvent.click(button());
    expect(screen.getByRole('button', { name: 'Wird quittiert...' })).toBeDisabled();

    rerender(<MonthlyLimitClearRow target={otherTarget} disabled={false} onCleared={onCleared} />);
    // The switch resets the in-flight state: the new transaction gets a fresh, enabled button.
    expect(button()).toBeEnabled();

    await act(async () => call.reject(new Error('late')));
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(onCleared).not.toHaveBeenCalled();
    expect(button()).toBeEnabled();
  });

  it('does not report a late success for the previous transaction after the target switched', async () => {
    const call = pending();
    mockClear.mockReturnValue(call.promise);
    const onCleared = jest.fn().mockResolvedValue(undefined);

    const { rerender } = render(<MonthlyLimitClearRow target={target} disabled={false} onCleared={onCleared} />);
    fireEvent.click(button());
    rerender(<MonthlyLimitClearRow target={otherTarget} disabled={false} onCleared={onCleared} />);

    await act(async () => call.resolve());
    expect(screen.queryByText(MONTHLY_LIMIT_CLEAR_SUMMARY)).not.toBeInTheDocument();
    expect(onCleared).not.toHaveBeenCalled();
  });

  it('keeps the in-flight state when the parent passes an equal target object', () => {
    const call = pending();
    mockClear.mockReturnValue(call.promise);

    const { rerender } = render(<MonthlyLimitClearRow target={target} disabled={false} />);
    fireEvent.click(button());
    rerender(<MonthlyLimitClearRow target={{ ...target }} disabled={false} />);

    expect(screen.getByRole('button', { name: 'Wird quittiert...' })).toBeDisabled();
  });

  it('reloads through the callback passed now, not the one captured at the click', async () => {
    const call = pending();
    mockClear.mockReturnValue(call.promise);
    const first = jest.fn().mockResolvedValue(undefined);
    const second = jest.fn().mockResolvedValue(undefined);

    const { rerender } = render(<MonthlyLimitClearRow target={target} disabled={false} onCleared={first} />);
    fireEvent.click(button());
    rerender(<MonthlyLimitClearRow target={target} disabled={false} onCleared={second} />);

    await act(async () => call.resolve());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
