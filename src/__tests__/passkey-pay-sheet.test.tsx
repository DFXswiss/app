import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PasskeyPaySheet from '../components/home/wallet/passkey-pay-sheet';

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_: string, text: string) => text }),
}));

describe('Passkey payment camera', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  afterEach(() => {
    if (original) Object.defineProperty(navigator, 'mediaDevices', original);
    else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
  });
  it('requests the rear camera and stops every track on close', async () => {
    const stop = jest.fn();
    const getUserMedia = jest.fn(async () => ({ getTracks: () => [{ stop }] }));
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    const close = jest.fn();
    const paste = jest.fn();
    const { unmount } = render(<PasskeyPaySheet onClose={close} onPasteLink={paste} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'environment' } }));
    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Paste payment link' }));
    expect(paste).toHaveBeenCalledTimes(1);
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it('explains a rejected camera request', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.reject(new Error('denied')) },
    });
    render(<PasskeyPaySheet onClose={() => undefined} onPasteLink={() => undefined} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No camera access.');
  });
  it('explains when the camera API is unavailable', () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    render(<PasskeyPaySheet onClose={() => undefined} onPasteLink={() => undefined} />);
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
    const { unmount } = render(<PasskeyPaySheet onClose={() => undefined} onPasteLink={() => undefined} />);
    unmount();
    await act(async () => resolve?.({ getTracks: () => [{ stop }] }));
    expect(stop).toHaveBeenCalledTimes(1);
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
    const { unmount } = render(<PasskeyPaySheet onClose={() => undefined} onPasteLink={() => undefined} />);
    unmount();
    await act(async () => reject?.(new Error('denied')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
