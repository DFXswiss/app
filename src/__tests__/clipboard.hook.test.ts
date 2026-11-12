import { renderHook, act } from '@testing-library/react';
import copyToClipboard from 'copy-to-clipboard';
import { useClipboard } from '../hooks/clipboard.hook';

jest.mock('copy-to-clipboard', () => jest.fn());

const copyToClipboardMock = copyToClipboard as jest.Mock;

describe('useClipboard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    copyToClipboardMock.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should initialize with isCopying false', () => {
    const { result } = renderHook(() => useClipboard());
    expect(result.current.isCopying).toBe(false);
  });

  it('should not copy if text is undefined', () => {
    const { result } = renderHook(() => useClipboard());

    act(() => {
      result.current.copy(undefined);
    });

    expect(result.current.isCopying).toBe(false);
    expect(copyToClipboardMock).not.toHaveBeenCalled();
  });

  it('should not copy if text is empty', () => {
    const { result } = renderHook(() => useClipboard());

    act(() => {
      result.current.copy('');
    });

    expect(result.current.isCopying).toBe(false);
    expect(copyToClipboardMock).not.toHaveBeenCalled();
  });

  describe('when navigator.clipboard.writeText is available', () => {
    const writeText = jest.fn();
    let originalClipboardDescriptor: PropertyDescriptor | undefined;

    beforeEach(() => {
      writeText.mockReset();
      originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    });

    afterEach(() => {
      if (originalClipboardDescriptor) {
        Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
      } else {
        delete (navigator as { clipboard?: unknown }).clipboard;
      }
    });

    it('should copy via navigator.clipboard.writeText instead of copy-to-clipboard', async () => {
      writeText.mockResolvedValue(undefined);
      const { result } = renderHook(() => useClipboard());

      await act(async () => {
        result.current.copy('test text');
      });

      expect(writeText).toHaveBeenCalledWith('test text');
      expect(copyToClipboardMock).not.toHaveBeenCalled();
      expect(result.current.isCopying).toBe(true);

      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(result.current.isCopying).toBe(false);
    });

    it('keeps isCopying true for 500 milliseconds after the latest successful copy', async () => {
      writeText.mockResolvedValue(undefined);
      const { result } = renderHook(() => useClipboard());

      await act(async () => {
        result.current.copy('first');
      });
      act(() => {
        jest.advanceTimersByTime(400);
      });

      await act(async () => {
        result.current.copy('second');
      });
      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(result.current.isCopying).toBe(true);

      act(() => {
        jest.advanceTimersByTime(400);
      });
      expect(result.current.isCopying).toBe(false);
    });

    it('ignores a successful write that settles after unmount', async () => {
      let resolveWrite!: () => void;
      writeText.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
      );
      const { result, unmount } = renderHook(() => useClipboard());

      act(() => {
        result.current.copy('test text');
      });
      unmount();
      await act(async () => {
        resolveWrite();
        await Promise.resolve();
      });

      expect(result.current.isCopying).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('clears the copied timer on unmount', async () => {
      writeText.mockResolvedValue(undefined);
      const { result, unmount } = renderHook(() => useClipboard());

      await act(async () => {
        result.current.copy('test text');
      });
      expect(result.current.isCopying).toBe(true);
      expect(jest.getTimerCount()).toBe(1);

      unmount();
      expect(jest.getTimerCount()).toBe(0);
    });

    it('calls writeText on the clipboard object and does not fall back when a detached call would throw', async () => {
      writeText.mockImplementation(function (this: unknown) {
        if (this !== navigator.clipboard) throw new TypeError('Illegal invocation');
        return Promise.resolve();
      });
      const { result } = renderHook(() => useClipboard());

      await act(async () => {
        result.current.copy('bound text');
      });

      expect(writeText).toHaveBeenCalledWith('bound text');
      expect(writeText.mock.instances[0]).toBe(navigator.clipboard);
      expect(copyToClipboardMock).not.toHaveBeenCalled();
      expect(result.current.isCopying).toBe(true);
    });

    it('does not call writeText for empty or missing text', () => {
      const { result } = renderHook(() => useClipboard());

      act(() => {
        result.current.copy(undefined);
        result.current.copy('');
      });

      expect(writeText).not.toHaveBeenCalled();
      expect(copyToClipboardMock).not.toHaveBeenCalled();
      expect(result.current.isCopying).toBe(false);
    });

    it('should not set isCopying until the write settles', async () => {
      let resolveWrite!: () => void;
      writeText.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
      );
      const { result } = renderHook(() => useClipboard());

      act(() => {
        result.current.copy('test text');
      });
      expect(result.current.isCopying).toBe(false);

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.isCopying).toBe(false);

      await act(async () => {
        resolveWrite();
        await Promise.resolve();
      });
      expect(result.current.isCopying).toBe(true);

      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(result.current.isCopying).toBe(false);
    });

    it('should fall back to copy-to-clipboard when writeText rejects and the fallback succeeds', async () => {
      let rejectWrite!: (reason: unknown) => void;
      writeText.mockReturnValue(
        new Promise<void>((_, reject) => {
          rejectWrite = reject;
        }),
      );
      copyToClipboardMock.mockReturnValue(true);
      const { result } = renderHook(() => useClipboard());

      act(() => {
        result.current.copy('test text');
      });

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.isCopying).toBe(false);

      await act(async () => {
        rejectWrite(new Error('denied'));
        await Promise.resolve();
      });
      expect(copyToClipboardMock).toHaveBeenCalledWith('test text');
      expect(result.current.isCopying).toBe(true);

      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(result.current.isCopying).toBe(false);
    });

    it('stays false when writeText rejects and the fallback returns false', async () => {
      writeText.mockRejectedValue(new Error('denied'));
      copyToClipboardMock.mockReturnValue(false);
      const { result } = renderHook(() => useClipboard());

      await act(async () => {
        result.current.copy('test text');
      });

      expect(copyToClipboardMock).toHaveBeenCalledWith('test text');
      expect(result.current.isCopying).toBe(false);
    });

    it('should swallow the rejection and stay false when the copy-to-clipboard fallback throws', async () => {
      writeText.mockRejectedValue(new Error('denied'));
      copyToClipboardMock.mockImplementationOnce(() => {
        throw new Error('copy failed');
      });
      const onUnhandledRejection = jest.fn();
      process.on('unhandledRejection', onUnhandledRejection);

      try {
        const { result } = renderHook(() => useClipboard());

        await act(async () => {
          result.current.copy('test text');
        });

        expect(copyToClipboardMock).toHaveBeenCalledWith('test text');
        expect(result.current.isCopying).toBe(false);

        jest.useRealTimers();
        await new Promise((resolve) => setTimeout(resolve, 0));
      } finally {
        process.off('unhandledRejection', onUnhandledRejection);
      }

      expect(onUnhandledRejection).not.toHaveBeenCalled();
    });
  });

  describe('when navigator.clipboard is unavailable', () => {
    let originalClipboardDescriptor: PropertyDescriptor | undefined;

    beforeEach(() => {
      originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    });

    afterEach(() => {
      if (originalClipboardDescriptor) {
        Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
      } else {
        delete (navigator as { clipboard?: unknown }).clipboard;
      }
    });

    it('should copy synchronously via copy-to-clipboard', () => {
      copyToClipboardMock.mockReturnValue(true);
      const { result } = renderHook(() => useClipboard());

      act(() => {
        result.current.copy('test text');
      });

      expect(copyToClipboardMock).toHaveBeenCalledWith('test text');
      expect(result.current.isCopying).toBe(true);

      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(result.current.isCopying).toBe(false);
    });

    it('stays false when copy-to-clipboard returns false', () => {
      copyToClipboardMock.mockReturnValue(false);
      const { result } = renderHook(() => useClipboard());

      act(() => {
        result.current.copy('test text');
      });

      expect(copyToClipboardMock).toHaveBeenCalledWith('test text');
      expect(result.current.isCopying).toBe(false);
    });

    it('stays false when copy-to-clipboard throws', () => {
      copyToClipboardMock.mockImplementationOnce(() => {
        throw new Error('copy failed');
      });
      const { result } = renderHook(() => useClipboard());

      expect(() => {
        act(() => {
          result.current.copy('test text');
        });
      }).not.toThrow();

      expect(copyToClipboardMock).toHaveBeenCalledWith('test text');
      expect(result.current.isCopying).toBe(false);
    });
  });

  describe('when navigator.clipboard has no writeText', () => {
    let originalClipboardDescriptor: PropertyDescriptor | undefined;

    beforeEach(() => {
      originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', { value: {}, configurable: true });
    });

    afterEach(() => {
      if (originalClipboardDescriptor) {
        Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
      } else {
        delete (navigator as { clipboard?: unknown }).clipboard;
      }
    });

    it('falls back when the clipboard object has no writeText', () => {
      copyToClipboardMock.mockReturnValue(true);
      const { result } = renderHook(() => useClipboard());

      act(() => {
        result.current.copy('test text');
      });

      expect(copyToClipboardMock).toHaveBeenCalledWith('test text');
      expect(result.current.isCopying).toBe(true);
    });

    it('stays false when that fallback returns false', () => {
      copyToClipboardMock.mockReturnValue(false);
      const { result } = renderHook(() => useClipboard());

      act(() => {
        result.current.copy('test text');
      });

      expect(copyToClipboardMock).toHaveBeenCalledWith('test text');
      expect(result.current.isCopying).toBe(false);
    });
  });
});
