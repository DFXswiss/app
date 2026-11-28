import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PasskeyPaySheet from '../components/home/wallet/passkey-pay-sheet';

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_: string, text: string) => text }),
}));

const DENIED = 'No camera access. Allow it in your browser settings or paste the payment link.';

describe('Passkey payment camera', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  afterEach(() => {
    if (original) Object.defineProperty(navigator, 'mediaDevices', original);
    else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
  });

  it('does not open the camera while closed', () => {
    const getUserMedia = jest.fn();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    render(<PasskeyPaySheet open={false} onClose={() => undefined} onToast={() => undefined} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('requests the rear camera, calls the paste handler, and stops every track on close', async () => {
    const stop = jest.fn();
    const getUserMedia = jest.fn(async () => ({ getTracks: () => [{ stop }] }));
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    const close = jest.fn();
    const paste = jest.fn();
    const toast = jest.fn();
    const { rerender, unmount } = render(
      <PasskeyPaySheet open onClose={close} onPastePaymentLink={paste} onToast={toast} />,
    );
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'environment' } }));
    await act(async () => undefined);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Paste payment link' }));
    expect(paste).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(close).toHaveBeenCalledTimes(1);
    rerender(<PasskeyPaySheet open={false} onClose={close} onPastePaymentLink={paste} onToast={toast} />);
    expect(stop).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('toasts Coming soon when no paste handler is given', () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    const toast = jest.fn();
    render(<PasskeyPaySheet open onClose={() => undefined} onToast={toast} />);
    fireEvent.click(screen.getByRole('button', { name: 'Paste payment link' }));
    expect(toast).toHaveBeenCalledWith('Coming soon');
  });

  it('explains a rejected camera request', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new Error('denied')) },
    });
    render(<PasskeyPaySheet open onClose={() => undefined} onToast={() => undefined} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(DENIED);
  });

  it('explains when the camera API is unavailable', () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {} });
    render(<PasskeyPaySheet open onClose={() => undefined} onToast={() => undefined} />);
    expect(screen.getByRole('alert')).toHaveTextContent('No camera access.');
  });

  it('stops a stream that arrives after the dialog closes', async () => {
    const stop = jest.fn();
    let resolve: ((stream: { getTracks: () => { stop: () => void }[] }) => void) | undefined;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () =>
          new Promise<{ getTracks: () => { stop: () => void }[] }>((done) => {
            resolve = done;
          }),
      },
    });
    const view = render(<PasskeyPaySheet open onClose={() => undefined} onToast={() => undefined} />);
    await waitFor(() => expect(resolve).toEqual(expect.any(Function)));
    view.unmount();
    await act(async () => resolve?.({ getTracks: () => [{ stop }] }));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores a rejection that arrives after the dialog closes', async () => {
    let reject: ((error: Error) => void) | undefined;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () =>
          new Promise((_resolve, fail) => {
            reject = fail;
          }),
      },
    });
    const { unmount } = render(<PasskeyPaySheet open onClose={() => undefined} onToast={() => undefined} />);
    await waitFor(() => expect(reject).toEqual(expect.any(Function)));
    unmount();
    await act(async () => reject?.(new Error('denied')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
