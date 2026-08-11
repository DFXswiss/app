import { renderHook, act } from '@testing-library/react';
import copyToClipboard from 'copy-to-clipboard';
import { useClipboard } from '../hooks/clipboard.hook';

// Mock copy-to-clipboard
jest.mock('copy-to-clipboard', () => jest.fn());

const copyToClipboardMock = copyToClipboard as jest.Mock;

describe('useClipboard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should initialize with isCopying false', () => {
    const { result } = renderHook(() => useClipboard());
    expect(result.current.isCopying).toBe(false);
  });

  it('should set isCopying to true when copying', () => {
    const { result } = renderHook(() => useClipboard());

    act(() => {
      result.current.copy('test text');
    });

    expect(result.current.isCopying).toBe(true);
  });

  it('should reset isCopying after 500ms', () => {
    const { result } = renderHook(() => useClipboard());

    act(() => {
      result.current.copy('test text');
    });

    expect(result.current.isCopying).toBe(true);

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current.isCopying).toBe(false);
  });

  it('should not copy if text is undefined', () => {
    const { result } = renderHook(() => useClipboard());

    act(() => {
      result.current.copy(undefined);
    });

    expect(result.current.isCopying).toBe(false);
  });

  it('should not copy if text is empty', () => {
    const { result } = renderHook(() => useClipboard());

    act(() => {
      result.current.copy('');
    });

    expect(result.current.isCopying).toBe(false);
  });

  describe('when navigator.clipboard.writeText is available', () => {
    const writeText = jest.fn();
    let originalClipboardDescriptor: PropertyDescriptor | undefined;

    beforeEach(() => {
      copyToClipboardMock.mockClear();
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
    });

    it('should fall back to copy-to-clipboard when writeText rejects', async () => {
      writeText.mockRejectedValue(new Error('denied'));
      const { result } = renderHook(() => useClipboard());

      await act(async () => {
        result.current.copy('test text');
      });

      expect(copyToClipboardMock).toHaveBeenCalledWith('test text');
    });

    it('should not reset isCopying until the write settles', async () => {
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

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.isCopying).toBe(true);

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

    it('should swallow the rejection and reset isCopying when the copy-to-clipboard fallback throws', async () => {
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

        act(() => {
          jest.advanceTimersByTime(500);
        });
        expect(result.current.isCopying).toBe(false);

        jest.useRealTimers();
        await new Promise((resolve) => setTimeout(resolve, 0));
      } finally {
        process.off('unhandledRejection', onUnhandledRejection);
      }

      expect(onUnhandledRejection).not.toHaveBeenCalled();
    });

    it('should not reset isCopying until the copy-to-clipboard fallback runs', async () => {
      let rejectWrite!: (reason: unknown) => void;
      writeText.mockReturnValue(
        new Promise<void>((_, reject) => {
          rejectWrite = reject;
        }),
      );
      const { result } = renderHook(() => useClipboard());

      act(() => {
        result.current.copy('test text');
      });

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.isCopying).toBe(true);

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
  });

  describe('when navigator.clipboard is unavailable', () => {
    let originalClipboardDescriptor: PropertyDescriptor | undefined;

    beforeEach(() => {
      copyToClipboardMock.mockClear();
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

    it('should still reset isCopying when copy-to-clipboard throws', () => {
      copyToClipboardMock.mockImplementationOnce(() => {
        throw new Error('copy failed');
      });
      const { result } = renderHook(() => useClipboard());

      expect(() => {
        act(() => {
          result.current.copy('test text');
        });
      }).toThrow('copy failed');

      expect(copyToClipboardMock).toHaveBeenCalledWith('test text');

      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(result.current.isCopying).toBe(false);
    });
  });
});
