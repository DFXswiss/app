// Unit tests for ScorechainClearRow: the texts per hold, the confirm, the call, the summary, the guards and the
// error path.

const mockClear = jest.fn();

jest.mock('src/hooks/scorechain-clear.hook', () => ({
  useScorechainClear: () => ({ clearScorechain: mockClear }),
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
  SCORECHAIN_CLEAR_CONFIRM,
  SCORECHAIN_CLEAR_HINT,
  SCORECHAIN_CLEAR_LABEL,
  SCORECHAIN_CLEAR_SUMMARY,
  SCORECHAIN_CLEAR_TITLE,
  ScorechainClearRow,
} from 'src/components/compliance/scorechain-clear-row';
import { ScorechainClearTarget } from 'src/hooks/scorechain-clear.hook';

const target: ScorechainClearTarget = { kind: 'buyCrypto', id: 136855 };
const otherTarget: ScorechainClearTarget = { kind: 'buyCrypto', id: 999 };

function button(): HTMLButtonElement {
  return screen.getByRole('button', { name: SCORECHAIN_CLEAR_LABEL }) as HTMLButtonElement;
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

describe('ScorechainClearRow', () => {
  beforeEach(() => {
    mockClear.mockReset();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => jest.restoreAllMocks());

  it('renders the high-risk title, the explanation and the button', () => {
    render(<ScorechainClearRow target={target} hold="HighRisk" disabled={false} />);

    expect(screen.getByText(SCORECHAIN_CLEAR_TITLE.HighRisk)).toBeInTheDocument();
    expect(screen.getByText(SCORECHAIN_CLEAR_HINT.HighRisk)).toBeInTheDocument();
    expect(button()).toBeEnabled();
  });

  it('renders the unavailable title and explanation', () => {
    render(<ScorechainClearRow target={target} hold="Unavailable" disabled={false} />);

    expect(screen.getByText(SCORECHAIN_CLEAR_TITLE.Unavailable)).toBeInTheDocument();
    expect(screen.getByText(SCORECHAIN_CLEAR_HINT.Unavailable)).toBeInTheDocument();
  });

  it('asks for confirmation, calls the API, shows the summary and reloads the owner', async () => {
    const call = pending();
    mockClear.mockReturnValue(call.promise);
    const onCleared = jest.fn().mockResolvedValue(undefined);

    render(<ScorechainClearRow target={target} hold="HighRisk" disabled={false} onCleared={onCleared} />);
    fireEvent.click(button());

    expect(window.confirm).toHaveBeenCalledWith(SCORECHAIN_CLEAR_CONFIRM);
    expect(screen.getByRole('button', { name: 'Wird quittiert...' })).toBeDisabled();

    await act(async () => call.resolve());
    await waitFor(() => expect(screen.getByText(SCORECHAIN_CLEAR_SUMMARY)).toBeInTheDocument());

    expect(mockClear).toHaveBeenCalledWith(target);
    expect(onCleared).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(SCORECHAIN_CLEAR_HINT.HighRisk)).not.toBeInTheDocument();
  });

  it('works without an owner callback', async () => {
    mockClear.mockResolvedValue(undefined);

    render(<ScorechainClearRow target={target} hold="HighRisk" disabled={false} />);
    fireEvent.click(button());

    await waitFor(() => expect(screen.getByText(SCORECHAIN_CLEAR_SUMMARY)).toBeInTheDocument());
    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the confirmation is rejected', () => {
    (window.confirm as jest.Mock).mockReturnValue(false);

    render(<ScorechainClearRow target={target} hold="HighRisk" disabled={false} />);
    fireEvent.click(button());

    expect(mockClear).not.toHaveBeenCalled();
    expect(button()).toBeEnabled();
  });

  it('is disabled while the parent is saving', () => {
    render(<ScorechainClearRow target={target} hold="HighRisk" disabled={true} />);

    expect(button()).toBeDisabled();
  });

  it('starts one call for two clicks in the same tick', async () => {
    const call = pending();
    mockClear.mockReturnValue(call.promise);

    render(<ScorechainClearRow target={target} hold="HighRisk" disabled={false} />);
    const element = button();
    await act(async () => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockClear).toHaveBeenCalledTimes(1);
    await act(async () => call.resolve());
    await waitFor(() => expect(screen.getByText(SCORECHAIN_CLEAR_SUMMARY)).toBeInTheDocument());
  });

  it('shows the API error and offers the button again', async () => {
    mockClear.mockRejectedValue(new Error('BuyCrypto is not held for a Scorechain screening'));

    render(<ScorechainClearRow target={target} hold="HighRisk" disabled={false} />);
    fireEvent.click(button());

    await waitFor(() =>
      expect(screen.getByTestId('error-hint')).toHaveTextContent('BuyCrypto is not held for a Scorechain screening'),
    );
    expect(button()).toBeEnabled();
  });

  it('falls back to a generic message when the rejection is not an Error', async () => {
    mockClear.mockRejectedValue('boom');

    render(<ScorechainClearRow target={target} hold="HighRisk" disabled={false} />);
    fireEvent.click(button());

    await waitFor(() =>
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Failed to clear the Scorechain hold'),
    );
  });

  it('ignores a late answer after the row was unmounted but still reloads the owner', async () => {
    const call = pending();
    mockClear.mockReturnValue(call.promise);
    const onCleared = jest.fn().mockResolvedValue(undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { unmount } = render(
      <ScorechainClearRow target={target} hold="HighRisk" disabled={false} onCleared={onCleared} />,
    );
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

    const { unmount } = render(<ScorechainClearRow target={target} hold="HighRisk" disabled={false} />);
    fireEvent.click(button());
    unmount();
    await act(async () => call.reject(new Error('late')));

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('ignores a late answer and a late error for the previous transaction after the target switched', async () => {
    const call = pending();
    mockClear.mockReturnValue(call.promise);
    const onCleared = jest.fn().mockResolvedValue(undefined);

    const { rerender } = render(
      <ScorechainClearRow target={target} hold="HighRisk" disabled={false} onCleared={onCleared} />,
    );
    fireEvent.click(button());
    expect(screen.getByRole('button', { name: 'Wird quittiert...' })).toBeDisabled();

    rerender(<ScorechainClearRow target={otherTarget} hold="HighRisk" disabled={false} onCleared={onCleared} />);
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

    const { rerender } = render(
      <ScorechainClearRow target={target} hold="HighRisk" disabled={false} onCleared={onCleared} />,
    );
    fireEvent.click(button());
    rerender(<ScorechainClearRow target={otherTarget} hold="HighRisk" disabled={false} onCleared={onCleared} />);

    await act(async () => call.resolve());
    expect(screen.queryByText(SCORECHAIN_CLEAR_SUMMARY)).not.toBeInTheDocument();
    expect(onCleared).not.toHaveBeenCalled();
  });

  it('keeps the in-flight state when the parent passes an equal target object', () => {
    const call = pending();
    mockClear.mockReturnValue(call.promise);

    const { rerender } = render(<ScorechainClearRow target={target} hold="HighRisk" disabled={false} />);
    fireEvent.click(button());
    rerender(<ScorechainClearRow target={{ ...target }} hold="HighRisk" disabled={false} />);

    expect(screen.getByRole('button', { name: 'Wird quittiert...' })).toBeDisabled();
  });

  it('reloads through the callback passed now, not the one captured at the click', async () => {
    const call = pending();
    mockClear.mockReturnValue(call.promise);
    const first = jest.fn().mockResolvedValue(undefined);
    const second = jest.fn().mockResolvedValue(undefined);

    const { rerender } = render(
      <ScorechainClearRow target={target} hold="HighRisk" disabled={false} onCleared={first} />,
    );
    fireEvent.click(button());
    rerender(<ScorechainClearRow target={target} hold="HighRisk" disabled={false} onCleared={second} />);

    await act(async () => call.resolve());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
