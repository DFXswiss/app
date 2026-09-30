jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_namespace: string, value: string) => value }),
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('@dfx.swiss/react-components', () => ({
  StyledButtonWidth: { FULL: 'full' },
  StyledButton: ({ label, onClick, isLoading }: { label: string; onClick: () => void; isLoading: boolean }) => (
    <button type="button" onClick={onClick} disabled={isLoading}>
      {label}
    </button>
  ),
  StyledVerticalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DeactivatedAddress } from 'src/components/deactivated-address';

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (reason: unknown) => void } {
  let resolve = () => undefined;
  let reject = (_reason: unknown) => undefined;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('DeactivatedAddress', () => {
  it('shows the message and an enabled reactivation button', () => {
    render(<DeactivatedAddress address="0xabc" onReactivate={jest.fn()} />);

    expect(screen.getByText('This address is deactivated in DFX.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactivate address' })).toBeEnabled();
  });

  it('submits the address once and disables the button while the request is pending', () => {
    const request = deferred();
    const onReactivate = jest.fn(() => request.promise);
    render(<DeactivatedAddress address="0xabc" onReactivate={onReactivate} />);
    const button = screen.getByRole('button', { name: 'Reactivate address' });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(onReactivate).toHaveBeenCalledTimes(1);
    expect(onReactivate).toHaveBeenCalledWith('0xabc');
    expect(button).toBeDisabled();
  });

  it('enables the button after a successful request without showing an error', async () => {
    const request = deferred();
    const onReactivate = jest.fn(() => request.promise);
    render(<DeactivatedAddress address="0xabc" onReactivate={onReactivate} />);
    const button = screen.getByRole('button', { name: 'Reactivate address' });

    fireEvent.click(button);
    await act(async () => request.resolve());

    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('shows an API message, enables retry, and clears the error while retrying', async () => {
    const retry = deferred();
    const onReactivate = jest
      .fn<Promise<void>, [string]>()
      .mockRejectedValueOnce({ message: 'Address cannot be reactivated' })
      .mockImplementationOnce(() => retry.promise);
    render(<DeactivatedAddress address="0xabc" onReactivate={onReactivate} />);
    const button = screen.getByRole('button', { name: 'Reactivate address' });

    fireEvent.click(button);
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Address cannot be reactivated');
    await waitFor(() => expect(button).toBeEnabled());

    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(onReactivate).toHaveBeenCalledTimes(2);
  });

  it('falls back to an unknown error message', async () => {
    const onReactivate = jest.fn().mockRejectedValue({});
    render(<DeactivatedAddress address="0xabc" onReactivate={onReactivate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reactivate address' }));

    expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reactivate address' })).toBeEnabled());
  });
});
