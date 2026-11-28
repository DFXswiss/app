// Paste and QR scan of the passkey send form. Moved from connect-passkey.test.tsx: the send panel
// now runs on its own props, so these cases render it in a small open/close harness instead of the desk.
jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_namespace: string, text: string) => text }),
}));
jest.mock('../hooks/clipboard.hook', () => ({ useClipboard: () => ({ copy: jest.fn(), isCopying: false }) }));
jest.mock('../components/payment/qr-code', () => ({ QrBasic: () => null }));
// passkey-transfer imports passkey-host, which reads RP_IDS at runtime; mock the package like the
// other passkey specs so this panel spec does not load the ESM wallet bundle.
jest.mock(
  '@dfx.swiss/wallet',
  () => ({
    RP_IDS: { prd: 'app.dfx.swiss', dev: 'dev.app.dfx.swiss', stg: 'stg.app.dfx.swiss', loc: 'localhost' },
  }),
  { virtual: true },
);

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { PasskeySendPanel } from '../components/home/wallet/passkey-transfer';

const loadFees = () => Promise.resolve({ rates: { fast: 3, normal: 2, slow: 1 } });

function SendHarness(): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Send
      </button>
      {open && (
        <div>
          <button type="button" onClick={() => setOpen(false)}>
            Close
          </button>
          <PasskeySendPanel loadFees={loadFees} send={jest.fn()} />
        </div>
      )}
    </>
  );
}

function openSend() {
  const view = render(<SendHarness />);
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  return view;
}

describe('passkey send paste and scan', () => {
  it('clears the send state when the panel closes', () => {
    const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    try {
      openSend();
      fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'bc1qdest' } });
      fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
      expect(screen.getByText('Paste is not available in this browser.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      expect(screen.getByLabelText('Destination')).toHaveValue('');
      expect(screen.queryByText('Paste is not available in this browser.')).not.toBeInTheDocument();
    } finally {
      if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard);
      else delete (navigator as { clipboard?: Clipboard }).clipboard;
    }
  });

  it('ignores a camera rejection from an older scan', async () => {
    const previousDetectorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'BarcodeDetector');
    const previousMediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    let rejectFirst: (reason?: unknown) => void = () => undefined;
    const firstRequest = new Promise<MediaStream>((_, reject) => {
      rejectFirst = reject;
    });
    const getUserMedia = jest.fn().mockReturnValueOnce(firstRequest).mockRejectedValue(new Error('denied'));

    class MockBarcodeDetector {
      detect = jest.fn().mockResolvedValue([]);
    }

    Object.defineProperty(globalThis, 'BarcodeDetector', { configurable: true, value: MockBarcodeDetector });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });

    try {
      openSend();
      fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
      await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
      fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
      const unavailable = 'QR scanning is not available in this browser.';
      expect(await screen.findByText(unavailable)).toBeInTheDocument();
      await act(async () => {
        rejectFirst(new Error('older scan failed'));
        await firstRequest.catch(() => undefined);
      });
      expect(screen.getAllByText(unavailable)).toHaveLength(1);
      expect(screen.getByLabelText('Destination')).toHaveValue('');
    } finally {
      if (previousDetectorDescriptor) Object.defineProperty(globalThis, 'BarcodeDetector', previousDetectorDescriptor);
      else Reflect.deleteProperty(globalThis, 'BarcodeDetector');
      if (previousMediaDevicesDescriptor) {
        Object.defineProperty(navigator, 'mediaDevices', previousMediaDevicesDescriptor);
      } else {
        Reflect.deleteProperty(navigator, 'mediaDevices');
      }
    }
  });

  test.each(['resolved play', 'rejected play'])('scans after a %s promise', async (playCase) => {
    const stop = jest.fn();
    const getUserMedia = jest.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
    const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
    const previousDetector = globalWithDetector.BarcodeDetector;
    const play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
      if (playCase === 'resolved play') return Promise.resolve();
      const rejected = Promise.reject(new Error('no play'));
      rejected.catch(() => undefined);
      return rejected;
    });

    class MockBarcodeDetector {
      detect(): Promise<{ rawValue: string }[]> {
        return Promise.resolve([{ rawValue: 'bc1qplayed' }]);
      }
    }
    globalWithDetector.BarcodeDetector = MockBarcodeDetector;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });

    try {
      openSend();
      fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
      await waitFor(() => expect(screen.getByLabelText('Destination')).toHaveValue('bc1qplayed'));
      expect(play).toHaveBeenCalled();
    } finally {
      play.mockRestore();
      if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
      else globalWithDetector.BarcodeDetector = previousDetector;
      if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
      else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
    }
  });

  test('ignores a detection result from an earlier scan', async () => {
    const firstStop = jest.fn();
    const secondStop = jest.fn();
    const getUserMedia = jest
      .fn()
      .mockResolvedValueOnce({ getTracks: () => [{ stop: firstStop }] })
      .mockResolvedValueOnce({ getTracks: () => [{ stop: secondStop }] });
    const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    const previousRaf = window.requestAnimationFrame;
    const previousCancelRaf = window.cancelAnimationFrame;
    const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
    const previousDetector = globalWithDetector.BarcodeDetector;
    const requestAnimationFrame = jest.fn((_callback: FrameRequestCallback) => 7);
    const cancelAnimationFrame = jest.fn();
    let resolveFirst: (codes: { rawValue: string }[]) => void = () => undefined;
    const firstDetect = new Promise<{ rawValue: string }[]>((resolve) => {
      resolveFirst = resolve;
    });
    const detect = jest
      .fn()
      .mockImplementationOnce(() => firstDetect)
      .mockResolvedValueOnce([]);

    class MockBarcodeDetector {
      detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> {
        return detect(source);
      }
    }
    globalWithDetector.BarcodeDetector = MockBarcodeDetector;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    window.requestAnimationFrame = requestAnimationFrame;
    window.cancelAnimationFrame = cancelAnimationFrame;

    const view = openSend();
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
      await waitFor(() => expect(screen.getByTestId('passkey-send-scan')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
      await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
      await act(async () => {
        resolveFirst([{ rawValue: 'bc1qignored' }]);
        await firstDetect;
      });
      await waitFor(() => expect(requestAnimationFrame).toHaveBeenCalled());
      expect(screen.getByTestId('passkey-send-scan')).toBeInTheDocument();
      expect(screen.getByLabelText('Destination')).toHaveValue('');
      expect(firstStop).toHaveBeenCalled();
    } finally {
      view.unmount();
      window.requestAnimationFrame = previousRaf;
      window.cancelAnimationFrame = previousCancelRaf;
      if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
      else globalWithDetector.BarcodeDetector = previousDetector;
      if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
      else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
    }
  });

  it('pastes into the destination and leaves a typed value when paste is rejected', async () => {
    const readText = jest.fn();
    const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
    try {
      openSend();
      readText.mockResolvedValueOnce('bc1qpasted');
      fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
      await waitFor(() => expect(screen.getByLabelText('Destination')).toHaveValue('bc1qpasted'));
      fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'keep-typed' } });
      readText.mockRejectedValueOnce(new Error('denied'));
      fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
      await waitFor(() => expect(screen.getByText('Paste is not available in this browser.')).toBeInTheDocument());
      expect(screen.getByLabelText('Destination')).toHaveValue('keep-typed');
    } finally {
      if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard);
      else delete (navigator as { clipboard?: Clipboard }).clipboard;
    }
  });

  it('explains when paste has no clipboard', () => {
    const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    try {
      openSend();
      fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'keep-typed' } });
      fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
      expect(screen.getByText('Paste is not available in this browser.')).toBeInTheDocument();
      expect(screen.getByLabelText('Destination')).toHaveValue('keep-typed');
    } finally {
      if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard);
      else delete (navigator as { clipboard?: Clipboard }).clipboard;
    }
  });

  it('fills the destination from a scanned qr and stops the camera', async () => {
    const stop = jest.fn();
    const getUserMedia = jest.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
    const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    const previousRaf = window.requestAnimationFrame;
    const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
    const previousDetector = globalWithDetector.BarcodeDetector;

    class MockBarcodeDetector {
      detect(): Promise<{ rawValue: string }[]> {
        return Promise.resolve([{ rawValue: 'bc1qfromqr' }]);
      }
    }
    globalWithDetector.BarcodeDetector = MockBarcodeDetector;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame;

    try {
      openSend();
      fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
      await waitFor(() => expect(screen.getByLabelText('Destination')).toHaveValue('bc1qfromqr'));
      expect(stop).toHaveBeenCalled();
    } finally {
      window.requestAnimationFrame = previousRaf;
      if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
      else globalWithDetector.BarcodeDetector = previousDetector;
      if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
      else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
    }
  });

  it('ignores a late QR detection after the send panel closes', async () => {
    const react = jest.requireActual<typeof import('react')>('react');
    const originalUseState = react.useState;
    const destinationWrite = jest.fn();
    const spy = jest.spyOn(react, 'useState').mockImplementation(((initial: unknown) => {
      const [value, setValue] = originalUseState<unknown>(initial);
      return [
        value,
        (next: unknown) => {
          if (next === 'bc1qlate') destinationWrite(next);
          setValue(next);
        },
      ];
    }) as typeof react.useState);
    const stop = jest.fn();
    let finish: (codes: { rawValue: string }[]) => void = () => undefined;
    const detect = jest.fn(
      () =>
        new Promise<{ rawValue: string }[]>((resolve) => {
          finish = resolve;
        }),
    );
    const schedule = jest.fn(() => 42);
    const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    const previousRaf = window.requestAnimationFrame;
    const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
    const previousDetector = globalWithDetector.BarcodeDetector;
    globalWithDetector.BarcodeDetector = class {
      detect = detect;
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop }] }) },
    });
    window.requestAnimationFrame = schedule;
    try {
      openSend();
      fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
      await waitFor(() => expect(detect).toHaveBeenCalledTimes(1));
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(stop).toHaveBeenCalledTimes(1);
      await act(async () => finish([{ rawValue: 'bc1qlate' }]));
      expect(destinationWrite).not.toHaveBeenCalled();
      expect(schedule).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      window.requestAnimationFrame = previousRaf;
      if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
      else globalWithDetector.BarcodeDetector = previousDetector;
      if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
      else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
    }
  });

  it('retries a failed detect on the next frame and uses a later result', async () => {
    const stop = jest.fn();
    const detect = jest
      .fn()
      .mockRejectedValueOnce(new Error('frame failed'))
      .mockResolvedValueOnce([{ rawValue: 'bc1qretry' }]);
    let nextFrame: FrameRequestCallback | undefined;
    const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    const previousRaf = window.requestAnimationFrame;
    const previousCancel = window.cancelAnimationFrame;
    const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
    const previousDetector = globalWithDetector.BarcodeDetector;
    globalWithDetector.BarcodeDetector = class {
      detect = detect;
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop }] }) },
    });
    window.requestAnimationFrame = (callback) => {
      nextFrame = callback;
      return 17;
    };
    window.cancelAnimationFrame = jest.fn();
    try {
      openSend();
      fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
      await waitFor(() => expect(nextFrame).toBeDefined());
      expect(screen.getByTestId('passkey-send-scan')).toBeInTheDocument();
      const callback = nextFrame;
      if (!callback) throw new Error('Expected a retry frame');
      await act(async () => callback(0));
      expect(detect).toHaveBeenCalledTimes(2);
      expect(screen.getByLabelText('Destination')).toHaveValue('bc1qretry');
      expect(stop).toHaveBeenCalledTimes(1);
    } finally {
      window.requestAnimationFrame = previousRaf;
      window.cancelAnimationFrame = previousCancel;
      if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
      else globalWithDetector.BarcodeDetector = previousDetector;
      if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
      else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
    }
  });

  it.each(['missing', 'undefined', 'throws', 'rejects'] as const)(
    'continues scanning when video play is %s and stream assignment throws',
    async (mode) => {
      const stop = jest.fn();
      const detect = jest.fn().mockResolvedValue([{ rawValue: 'bc1qvideo' }]);
      const assign = jest.fn((value: unknown) => {
        if (value !== null) throw new Error('stream rejected');
      });
      const play = jest.fn(() => {
        if (mode === 'throws') throw new Error('play failed');
        if (mode === 'rejects') return Promise.reject(new Error('play rejected'));
        return undefined;
      });
      const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
      const previousSource = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject');
      const previousPlay = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'play');
      const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
      const previousDetector = globalWithDetector.BarcodeDetector;
      globalWithDetector.BarcodeDetector = class {
        detect = detect;
      };
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop }] }) },
      });
      Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, set: assign });
      Object.defineProperty(HTMLMediaElement.prototype, 'play', {
        configurable: true,
        value: mode === 'missing' ? undefined : play,
      });
      try {
        openSend();
        fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
        await waitFor(() => expect(screen.getByLabelText('Destination')).toHaveValue('bc1qvideo'));
        expect(assign).toHaveBeenCalled();
        expect(detect).toHaveBeenCalledTimes(1);
        expect(stop).toHaveBeenCalledTimes(1);
        expect(play).toHaveBeenCalledTimes(mode === 'missing' ? 0 : 1);
      } finally {
        if (previousSource) Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', previousSource);
        else delete (HTMLMediaElement.prototype as { srcObject?: unknown }).srcObject;
        if (previousPlay) Object.defineProperty(HTMLMediaElement.prototype, 'play', previousPlay);
        else delete (HTMLMediaElement.prototype as { play?: unknown }).play;
        if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
        else globalWithDetector.BarcodeDetector = previousDetector;
        if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
        else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
      }
    },
  );

  it('stops the acquired stream if BarcodeDetector disappears before the camera effect', async () => {
    const stop = jest.fn();
    const stopSecond = jest.fn();
    const detect = jest.fn();
    const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
    const previousDetector = globalWithDetector.BarcodeDetector;
    globalWithDetector.BarcodeDetector = class {
      detect = detect;
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          delete globalWithDetector.BarcodeDetector;
          return Promise.resolve({ getTracks: () => [{ stop }, { stop: stopSecond }] });
        },
      },
    });
    try {
      openSend();
      fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
      await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
      expect(stopSecond).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('passkey-send-scan')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Destination')).toHaveValue('');
      expect(detect).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(stop).toHaveBeenCalledTimes(1);
    } finally {
      if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
      else globalWithDetector.BarcodeDetector = previousDetector;
      if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
      else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
    }
  });

  it.each(['next frame', 'scan again', 'close'] as const)('handles a scheduled scan frame on %s', async (action) => {
    const stop = jest.fn();
    const detect = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(action === 'close' ? [] : [{ rawValue: 'bc1qsecond' }]);
    const getUserMedia = jest
      .fn()
      .mockResolvedValueOnce({ getTracks: () => [{ stop }] })
      .mockImplementationOnce(() => new Promise(() => undefined));
    const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    const previousRaf = window.requestAnimationFrame;
    const previousCancel = window.cancelAnimationFrame;
    const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
    const previousDetector = globalWithDetector.BarcodeDetector;
    let frame: FrameRequestCallback | undefined;
    const cancel = jest.fn();
    globalWithDetector.BarcodeDetector = class {
      detect = detect;
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    const schedule = jest.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 42;
    });
    window.requestAnimationFrame = schedule;
    window.cancelAnimationFrame = cancel;
    try {
      openSend();
      fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
      await waitFor(() => expect(frame).toBeDefined());
      expect(detect).toHaveBeenCalledTimes(1);
      if (action === 'next frame') {
        const callback = frame;
        if (!callback) throw new Error('Expected a scheduled frame');
        await act(async () => callback(0));
        expect(detect).toHaveBeenCalledTimes(2);
        expect(screen.getByLabelText('Destination')).toHaveValue('bc1qsecond');
      } else if (action === 'scan again') {
        fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
        expect(getUserMedia).toHaveBeenCalledTimes(2);
      } else {
        const firstFrame = frame;
        if (!firstFrame) throw new Error('Expected a scheduled frame');
        await act(async () => firstFrame(0));
        expect(detect).toHaveBeenCalledTimes(2);
        expect(schedule).toHaveBeenCalledTimes(2);
        expect(screen.getByLabelText('Destination')).toHaveValue('');
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(screen.queryByLabelText('Destination')).not.toBeInTheDocument();
        const callback = frame;
        if (!callback) throw new Error('Expected a scheduled frame');
        act(() => callback(0));
        expect(detect).toHaveBeenCalledTimes(2);
      }
      expect(cancel).toHaveBeenCalledWith(42);
      expect(stop).toHaveBeenCalledTimes(1);
    } finally {
      window.requestAnimationFrame = previousRaf;
      window.cancelAnimationFrame = previousCancel;
      if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
      else globalWithDetector.BarcodeDetector = previousDetector;
      if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
      else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
    }
  });

  it('stops the first camera when scan is pressed again', async () => {
    const firstStop = jest.fn();
    const secondStop = jest.fn();
    let resolveFirst: (stream: { getTracks: () => { stop: () => void }[] }) => void = () => undefined;
    const getUserMedia = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ getTracks: () => [{ stop: secondStop }] });
    const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    const previousRaf = window.requestAnimationFrame;
    const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
    const previousDetector = globalWithDetector.BarcodeDetector;

    class MockBarcodeDetector {
      detect(): Promise<{ rawValue: string }[]> {
        return Promise.resolve([]);
      }
    }
    globalWithDetector.BarcodeDetector = MockBarcodeDetector;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    window.requestAnimationFrame = ((_callback: FrameRequestCallback) => 1) as typeof requestAnimationFrame;

    try {
      openSend();
      fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
      fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
      resolveFirst({ getTracks: () => [{ stop: firstStop }] });
      await waitFor(() => expect(firstStop).toHaveBeenCalled());
      expect(getUserMedia).toHaveBeenCalledTimes(2);
      expect(secondStop).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Destination')).toHaveValue('');
    } finally {
      window.requestAnimationFrame = previousRaf;
      if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
      else globalWithDetector.BarcodeDetector = previousDetector;
      if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
      else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
    }
  });

  it.each(['running', 'pending'] as const)('stops a %s camera when the send panel closes', async (state) => {
    const stop = jest.fn();
    let finish: (stream: unknown) => void = () => undefined;
    const stream = { getTracks: () => [{ stop }] };
    const getUserMedia = jest.fn(() =>
      state === 'pending'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(stream),
    );
    const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    const previousRaf = window.requestAnimationFrame;
    const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
    const previousDetector = globalWithDetector.BarcodeDetector;
    globalWithDetector.BarcodeDetector = class {
      detect() {
        return Promise.resolve([]);
      }
    };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    window.requestAnimationFrame = ((_callback: FrameRequestCallback) => 1) as typeof requestAnimationFrame;
    try {
      openSend();
      fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
      if (state === 'running') await screen.findByTestId('passkey-send-scan');
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      if (state === 'pending') await act(async () => finish(stream));
      await waitFor(() => expect(stop).toHaveBeenCalledTimes(1));
      expect(screen.queryByLabelText('Destination')).not.toBeInTheDocument();
    } finally {
      window.requestAnimationFrame = previousRaf;
      if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
      else globalWithDetector.BarcodeDetector = previousDetector;
      if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
      else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
    }
  });

  it('ignores a camera rejection after the send panel closes', async () => {
    const react = jest.requireActual<typeof import('react')>('react');
    const originalUseState = react.useState;
    const staleWrite = jest.fn();
    const spy = jest.spyOn(react, 'useState').mockImplementation(((initial: unknown) => {
      const [value, setValue] = originalUseState<unknown>(initial);
      return [
        value,
        (next: unknown) => {
          if (next === 'QR scanning is not available in this browser.') staleWrite(next);
          setValue(next);
        },
      ];
    }) as typeof react.useState);
    let fail: (error: Error) => void = () => undefined;
    const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
    const previousDetector = globalWithDetector.BarcodeDetector;
    globalWithDetector.BarcodeDetector = class {
      detect() {
        return Promise.resolve([]);
      }
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () =>
          new Promise((_resolve, reject) => {
            fail = reject;
          }),
      },
    });
    try {
      openSend();
      fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await act(async () => fail(new Error('camera denied')));
      expect(staleWrite).not.toHaveBeenCalled();
      expect(screen.queryByText('QR scanning is not available in this browser.')).not.toBeInTheDocument();
    } finally {
      spy.mockRestore();
      if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
      else globalWithDetector.BarcodeDetector = previousDetector;
      if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
      else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
    }
  });

  it('explains when qr scanning is not available', () => {
    const getUserMedia = jest.fn();
    const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
    const previousDetector = globalWithDetector.BarcodeDetector;
    delete globalWithDetector.BarcodeDetector;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    try {
      openSend();
      fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
      expect(screen.getByText('QR scanning is not available in this browser.')).toBeInTheDocument();
      expect(getUserMedia).not.toHaveBeenCalled();
    } finally {
      if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
      else globalWithDetector.BarcodeDetector = previousDetector;
      if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
      else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
    }
  });

  it('explains when the camera rejects the scan', async () => {
    const getUserMedia = jest.fn().mockRejectedValue(new Error('denied'));
    const previousDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    const globalWithDetector = globalThis as { BarcodeDetector?: unknown };
    const previousDetector = globalWithDetector.BarcodeDetector;

    class MockBarcodeDetector {
      detect(): Promise<{ rawValue: string }[]> {
        return Promise.resolve([]);
      }
    }
    globalWithDetector.BarcodeDetector = MockBarcodeDetector;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    try {
      openSend();
      fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
      await waitFor(() =>
        expect(screen.getByText('QR scanning is not available in this browser.')).toBeInTheDocument(),
      );
      expect(getUserMedia).toHaveBeenCalledTimes(1);
    } finally {
      if (previousDetector === undefined) delete globalWithDetector.BarcodeDetector;
      else globalWithDetector.BarcodeDetector = previousDetector;
      if (previousDevices) Object.defineProperty(navigator, 'mediaDevices', previousDevices);
      else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
    }
  });
});
