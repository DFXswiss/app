// Unit tests for RefUserKycClearRow: the confirm, the call, the summary, the guards and the error path.

const mockClear = jest.fn();

jest.mock('src/hooks/ref-user-kyc.hook', () => ({
  useRefUserKycClear: () => ({ clearRefUserKyc: mockClear }),
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
  REF_USER_KYC_CLEAR_CONFIRM,
  REF_USER_KYC_CLEAR_HINT,
  REF_USER_KYC_CLEAR_LABEL,
  REF_USER_KYC_CLEAR_TITLE,
  RefUserKycClearRow,
  refUserKycClearSummary,
} from 'src/components/compliance/ref-user-kyc-clear-row';
import { RefUserKycClearResult } from 'src/hooks/ref-user-kyc.hook';

const result: RefUserKycClearResult = {
  userDataId: 325674,
  refUserKycClearedDate: '2026-09-28T09:30:00.000Z',
  referrers: [{ userDataId: 321067, usedRef: '171-364', kycStatus: 'Check' }],
  resetBuyCryptoIds: [136775],
  resetBuyFiatIds: [],
};

function button(): HTMLButtonElement {
  return screen.getByRole('button', { name: REF_USER_KYC_CLEAR_LABEL }) as HTMLButtonElement;
}

describe('RefUserKycClearRow', () => {
  beforeEach(() => {
    mockClear.mockReset();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => jest.restoreAllMocks());

  it('renders the row label, the explanation and the button', () => {
    render(<RefUserKycClearRow userDataId={325674} disabled={false} />);

    expect(screen.getByText(REF_USER_KYC_CLEAR_TITLE)).toBeInTheDocument();
    expect(screen.getByText(REF_USER_KYC_CLEAR_HINT)).toBeInTheDocument();
    expect(button()).toBeEnabled();
  });

  it('asks for confirmation, calls the API, shows the summary and reloads the owner', async () => {
    mockClear.mockResolvedValue(result);
    const onCleared = jest.fn().mockResolvedValue(undefined);

    render(<RefUserKycClearRow userDataId={325674} disabled={false} onCleared={onCleared} />);
    fireEvent.click(button());

    expect(window.confirm).toHaveBeenCalledWith(REF_USER_KYC_CLEAR_CONFIRM);
    expect(screen.getByRole('button', { name: 'Wird aufgehoben...' })).toBeDisabled();
    await waitFor(() => expect(screen.getByText(refUserKycClearSummary(result))).toBeInTheDocument());

    expect(mockClear).toHaveBeenCalledWith(325674);
    expect(onCleared).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(REF_USER_KYC_CLEAR_HINT)).not.toBeInTheDocument();
  });

  it('works without an owner callback', async () => {
    mockClear.mockResolvedValue(result);

    render(<RefUserKycClearRow userDataId={325674} disabled={false} />);
    fireEvent.click(button());

    await waitFor(() => expect(screen.getByText(refUserKycClearSummary(result))).toBeInTheDocument());
    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the confirmation is rejected', () => {
    (window.confirm as jest.Mock).mockReturnValue(false);

    render(<RefUserKycClearRow userDataId={325674} disabled={false} />);
    fireEvent.click(button());

    expect(mockClear).not.toHaveBeenCalled();
    expect(button()).toBeEnabled();
  });

  it('is disabled while the parent is saving', () => {
    render(<RefUserKycClearRow userDataId={325674} disabled={true} />);

    expect(button()).toBeDisabled();
  });

  it('starts one call for two clicks in the same tick', async () => {
    let resolve: (value: RefUserKycClearResult) => void = () => undefined;
    mockClear.mockReturnValue(new Promise<RefUserKycClearResult>((r) => (resolve = r)));

    render(<RefUserKycClearRow userDataId={325674} disabled={false} />);
    const target = button();
    await act(async () => {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockClear).toHaveBeenCalledTimes(1);
    await act(async () => resolve(result));
    await waitFor(() => expect(screen.getByText(refUserKycClearSummary(result))).toBeInTheDocument());
  });

  it('shows the API error and offers the button again', async () => {
    mockClear.mockRejectedValue(new Error('Referrer check already cleared on 2026-09-28T07:44:51.623Z'));

    render(<RefUserKycClearRow userDataId={325674} disabled={false} />);
    fireEvent.click(button());

    await waitFor(() =>
      expect(screen.getByTestId('error-hint')).toHaveTextContent(
        'Referrer check already cleared on 2026-09-28T07:44:51.623Z',
      ),
    );
    expect(button()).toBeEnabled();
  });

  it('falls back to a generic message when the rejection is not an Error', async () => {
    mockClear.mockRejectedValue('boom');

    render(<RefUserKycClearRow userDataId={325674} disabled={false} />);
    fireEvent.click(button());

    await waitFor(() =>
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Failed to clear the referrer check'),
    );
  });

  it('ignores a late answer after the row was unmounted but still reloads the owner', async () => {
    let resolve: (value: RefUserKycClearResult) => void = () => undefined;
    mockClear.mockReturnValue(new Promise<RefUserKycClearResult>((r) => (resolve = r)));
    const onCleared = jest.fn().mockResolvedValue(undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { unmount } = render(<RefUserKycClearRow userDataId={325674} disabled={false} onCleared={onCleared} />);
    fireEvent.click(button());
    unmount();
    await act(async () => resolve(result));

    expect(onCleared).toHaveBeenCalledTimes(1);
    // No "state update on an unmounted component" warning: the guards held.
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('ignores a late answer and a late error for the previous account after the id switched', async () => {
    let reject: (reason: unknown) => void = () => undefined;
    mockClear.mockReturnValue(new Promise<RefUserKycClearResult>((_, r) => (reject = r)));
    const onCleared = jest.fn().mockResolvedValue(undefined);

    const { rerender } = render(<RefUserKycClearRow userDataId={325674} disabled={false} onCleared={onCleared} />);
    fireEvent.click(button());
    expect(screen.getByRole('button', { name: 'Wird aufgehoben...' })).toBeDisabled();

    rerender(<RefUserKycClearRow userDataId={999} disabled={false} onCleared={onCleared} />);
    // The switch resets the in-flight state: the new account gets a fresh, enabled button.
    expect(button()).toBeEnabled();

    await act(async () => reject(new Error('late')));
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(onCleared).not.toHaveBeenCalled();
    expect(button()).toBeEnabled();
  });

  it('reloads through the callback passed now, not the one captured at the click', async () => {
    let resolve: (value: RefUserKycClearResult) => void = () => undefined;
    mockClear.mockReturnValue(new Promise<RefUserKycClearResult>((r) => (resolve = r)));
    const first = jest.fn().mockResolvedValue(undefined);
    const second = jest.fn().mockResolvedValue(undefined);

    const { rerender } = render(<RefUserKycClearRow userDataId={325674} disabled={false} onCleared={first} />);
    fireEvent.click(button());
    rerender(<RefUserKycClearRow userDataId={325674} disabled={false} onCleared={second} />);

    await act(async () => resolve(result));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does not report a late success for the previous account after the id switched', async () => {
    let resolve: (value: RefUserKycClearResult) => void = () => undefined;
    mockClear.mockReturnValue(new Promise<RefUserKycClearResult>((r) => (resolve = r)));
    const onCleared = jest.fn().mockResolvedValue(undefined);

    const { rerender } = render(<RefUserKycClearRow userDataId={325674} disabled={false} onCleared={onCleared} />);
    fireEvent.click(button());
    rerender(<RefUserKycClearRow userDataId={999} disabled={false} onCleared={onCleared} />);

    await act(async () => resolve(result));
    expect(screen.queryByText(refUserKycClearSummary(result))).not.toBeInTheDocument();
    expect(onCleared).not.toHaveBeenCalled();
  });
});

describe('refUserKycClearSummary', () => {
  it('names every referrer and counts one payment in the singular', () => {
    expect(refUserKycClearSummary(result)).toBe(
      'Empfehler-Check aufgehoben (Empfehler #321067). 1 Zahlung wird neu geprüft.',
    );
  });

  it('counts BuyCrypto and BuyFiat resets together in the plural and shows a dash without referrers', () => {
    expect(refUserKycClearSummary({ ...result, referrers: [], resetBuyCryptoIds: [1, 2], resetBuyFiatIds: [3] })).toBe(
      'Empfehler-Check aufgehoben (Empfehler -). 3 Zahlungen werden neu geprüft.',
    );
  });

  it('uses the plural for zero resets', () => {
    expect(refUserKycClearSummary({ ...result, resetBuyCryptoIds: [], resetBuyFiatIds: [] })).toBe(
      'Empfehler-Check aufgehoben (Empfehler #321067). 0 Zahlungen werden neu geprüft.',
    );
  });
});
