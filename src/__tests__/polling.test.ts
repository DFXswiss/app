// Mock @dfx.swiss/react to avoid ES module issues
jest.mock('@dfx.swiss/react', () => ({}));
jest.mock('src/dto/safe.dto', () => ({}));

import { renderHook, act } from '@testing-library/react';
import { usePolling } from '../hooks/polling';

// Mock fetchJson
jest.mock('src/util/utils', () => ({
  ...jest.requireActual('src/util/utils'),
  fetchJson: jest.fn(),
}));

import { fetchJson } from 'src/util/utils';

const mockFetchJson = fetchJson as jest.Mock;

describe('usePolling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockFetchJson.mockReset();
    mockFetchJson.mockResolvedValue({ data: 'test' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should initialize with isPolling false', () => {
    const { result } = renderHook(() => usePolling());
    expect(result.current.isPolling).toBe(false);
  });

  it('should start polling when init is called', async () => {
    const { result } = renderHook(() => usePolling());
    const callback = jest.fn();
    
    await act(async () => {
      result.current.init('https://api.example.com', callback);
      await Promise.resolve(); // Wait for initial fetch
    });
    
    expect(result.current.isPolling).toBe(true);
    expect(mockFetchJson).toHaveBeenCalledWith('https://api.example.com');
  });

  it('should call callback with response', async () => {
    const { result } = renderHook(() => usePolling());
    const callback = jest.fn();
    const mockResponse = { status: 'ok' };
    mockFetchJson.mockResolvedValue(mockResponse);
    
    await act(async () => {
      result.current.init('https://api.example.com', callback);
      await Promise.resolve();
    });
    
    expect(callback).toHaveBeenCalledWith(mockResponse);
  });

  it('should stop polling when stop is called', async () => {
    const { result } = renderHook(() => usePolling());
    const callback = jest.fn();
    
    await act(async () => {
      result.current.init('https://api.example.com', callback);
      await Promise.resolve();
    });
    
    expect(result.current.isPolling).toBe(true);
    
    act(() => {
      result.current.stop();
    });
    
    expect(result.current.isPolling).toBe(false);
  });

  it('should use custom time interval', async () => {
    const { result } = renderHook(() => usePolling({ timeInterval: 5000 }));
    const callback = jest.fn();
    
    await act(async () => {
      result.current.init('https://api.example.com', callback);
      await Promise.resolve();
    });
    
    // Initial call
    expect(mockFetchJson).toHaveBeenCalledTimes(1);
    
    // Advance time by less than interval
    await act(async () => {
      jest.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    
    expect(mockFetchJson).toHaveBeenCalledTimes(1);
    
    // Advance time past interval
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    
    expect(mockFetchJson).toHaveBeenCalledTimes(2);
  });

  it('should call error callback on fetch error', async () => {
    const { result } = renderHook(() => usePolling());
    const callback = jest.fn();
    const errorCallback = jest.fn();
    const error = new Error('Network error');
    mockFetchJson.mockRejectedValue(error);
    
    await act(async () => {
      result.current.init('https://api.example.com', callback, errorCallback);
      await Promise.resolve();
    });
    
    expect(errorCallback).toHaveBeenCalledWith(error);
  });

  it('should not start new polling if already polling same URL', async () => {
    const { result } = renderHook(() => usePolling());
    const callback = jest.fn();
    
    await act(async () => {
      result.current.init('https://api.example.com', callback);
      await Promise.resolve();
    });
    
    await act(async () => {
      result.current.init('https://api.example.com', callback);
      await Promise.resolve();
    });
    
    // Should only have called once
    expect(mockFetchJson).toHaveBeenCalledTimes(1);
  });

  it('should poll again for the same URL after being stopped', async () => {
    // a wait poll keeps the same URL for as long as the payment is pending, so a restart
    // after stop() has to work — otherwise the payment is never picked up again
    const { result } = renderHook(() => usePolling());
    const callback = jest.fn();

    await act(async () => {
      result.current.init('https://api.example.com', callback);
      await Promise.resolve();
    });

    act(() => {
      result.current.stop();
    });

    await act(async () => {
      result.current.init('https://api.example.com', callback);
      await Promise.resolve();
    });

    expect(mockFetchJson).toHaveBeenCalledTimes(2);
  });

  it('should clean up interval on unmount', async () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    
    const { result, unmount } = renderHook(() => usePolling());
    const callback = jest.fn();
    
    await act(async () => {
      result.current.init('https://api.example.com', callback);
      await Promise.resolve();
    });
    
    unmount();
    
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});
