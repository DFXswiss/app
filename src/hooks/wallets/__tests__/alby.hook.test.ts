// useAlby: WebLN detection (including late extension injection via isAvailable), enable,
// signMessage, sendPayment, and AbortError mapping for user-rejection paths.

const mockDelay = jest.fn();
jest.mock('../../../util/utils', () => ({ delay: (...args: unknown[]) => mockDelay(...args) }));

import { act, renderHook } from '@testing-library/react';
import { AbortError } from '../../../util/abort-error';
import { useAlby } from '../alby.hook';

function setWebln(webln: unknown) {
  (window as any).webln = webln;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDelay.mockImplementation(() => Promise.resolve());
});

afterEach(() => {
  delete (window as any).webln;
});

describe('useAlby isInstalled', () => {
  it('returns true when window.webln is present', () => {
    setWebln({});
    const { result } = renderHook(() => useAlby());
    expect(result.current.isInstalled()).toBe(true);
  });

  it('returns false when window.webln is absent', () => {
    const { result } = renderHook(() => useAlby());
    expect(result.current.isInstalled()).toBe(false);
  });
});

describe('useAlby isAvailable', () => {
  it('resolves true immediately when window.webln is already present', async () => {
    setWebln({});
    const { result } = renderHook(() => useAlby());

    await expect(result.current.isAvailable()).resolves.toBe(true);
  });

  it('resolves true when window.webln appears after a couple of delay attempts', async () => {
    let calls = 0;
    mockDelay.mockImplementation(async () => {
      calls += 1;
      if (calls === 2) {
        setWebln({});
      }
    });

    const { result } = renderHook(() => useAlby());

    await expect(result.current.isAvailable()).resolves.toBe(true);
    expect(mockDelay).toHaveBeenCalled();
  });

  it('resolves false after 10 attempts when window.webln never appears', async () => {
    const { result } = renderHook(() => useAlby());

    await expect(result.current.isAvailable()).resolves.toBe(false);
    expect(mockDelay).toHaveBeenCalledTimes(10);
    expect(mockDelay.mock.calls.every((call) => call[0] === 0.01)).toBe(true);
  });

  it('resolves true when window.webln appears during the last delay', async () => {
    let calls = 0;
    mockDelay.mockImplementation(async () => {
      calls += 1;
      if (calls === 10) {
        setWebln({});
      }
    });

    const { result } = renderHook(() => useAlby());

    await expect(result.current.isAvailable()).resolves.toBe(true);
    expect(mockDelay).toHaveBeenCalledTimes(10);
  });
});

describe('useAlby enable', () => {
  it('enables WebLN, returns getInfo, and flips isEnabled after rerender', async () => {
    const info = { node: { alias: 'getalby.com' } };
    const enable = jest.fn().mockResolvedValue(undefined);
    const getInfo = jest.fn().mockResolvedValue(info);
    setWebln({ enable, getInfo });

    const { result, rerender } = renderHook(() => useAlby());

    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.enable();
    });

    expect(resolved).toEqual(info);
    expect(enable).toHaveBeenCalled();
    expect(getInfo).toHaveBeenCalled();

    rerender();
    expect(result.current.isEnabled).toBe(true);
  });

  it('rejects with Timeout when window.webln never appears and leaves isEnabled false', async () => {
    const { result, rerender } = renderHook(() => useAlby());

    await expect(result.current.enable()).rejects.toMatchObject({ message: 'Timeout' });
    rerender();
    expect(result.current.isEnabled).toBe(false);
  });

  it('succeeds when window.webln appears during the last delay', async () => {
    const info = { node: { alias: 'getalby.com' } };
    const enable = jest.fn().mockResolvedValue(undefined);
    const getInfo = jest.fn().mockResolvedValue(info);

    let calls = 0;
    mockDelay.mockImplementation(async () => {
      calls += 1;
      if (calls === 10) {
        setWebln({ enable, getInfo });
      }
    });

    const { result, rerender } = renderHook(() => useAlby());

    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.enable();
    });

    expect(resolved).toEqual(info);
    expect(mockDelay).toHaveBeenCalledTimes(10);

    rerender();
    expect(result.current.isEnabled).toBe(true);
  });

  it('maps User rejected to AbortError', async () => {
    setWebln({
      enable: jest.fn().mockRejectedValue(new Error('User rejected')),
      getInfo: jest.fn(),
    });

    const { result } = renderHook(() => useAlby());

    await expect(result.current.enable()).rejects.toEqual(expect.any(AbortError));
    await expect(result.current.enable()).rejects.toMatchObject({ message: 'User cancelled' });
  });

  it('maps Permission denied to AbortError', async () => {
    setWebln({
      enable: jest.fn().mockRejectedValue(new Error('Permission denied by user')),
      getInfo: jest.fn(),
    });

    const { result } = renderHook(() => useAlby());

    await expect(result.current.enable()).rejects.toEqual(expect.any(AbortError));
    await expect(result.current.enable()).rejects.toMatchObject({ message: 'User cancelled' });
  });

  it('rethrows other errors as-is', async () => {
    setWebln({
      enable: jest.fn().mockRejectedValue(new Error('Something else broke')),
      getInfo: jest.fn(),
    });

    const { result } = renderHook(() => useAlby());

    let caught: unknown;
    try {
      await result.current.enable();
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(AbortError);
    expect((caught as Error).message).toBe('Something else broke');
  });
});

describe('useAlby signMessage', () => {
  it('returns the signature from webln.signMessage', async () => {
    setWebln({
      signMessage: jest.fn().mockResolvedValue({ signature: 'sig123' }),
    });

    const { result } = renderHook(() => useAlby());

    await expect(result.current.signMessage('msg')).resolves.toBe('sig123');
  });

  it('maps User rejected to AbortError', async () => {
    setWebln({
      signMessage: jest.fn().mockRejectedValue(new Error('User rejected')),
    });

    const { result } = renderHook(() => useAlby());

    await expect(result.current.signMessage('msg')).rejects.toEqual(expect.any(AbortError));
    await expect(result.current.signMessage('msg')).rejects.toMatchObject({ message: 'User cancelled' });
  });
});

describe('useAlby sendPayment', () => {
  it('calls enable first when not yet enabled, then sendPayment', async () => {
    const paymentResult = { preimage: 'pre' };
    const enable = jest.fn().mockResolvedValue(undefined);
    const getInfo = jest.fn().mockResolvedValue({ node: { alias: 'getalby.com' } });
    const sendPayment = jest.fn().mockResolvedValue(paymentResult);
    setWebln({ enable, getInfo, sendPayment });

    const { result } = renderHook(() => useAlby());
    expect(result.current.isEnabled).toBe(false);

    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.sendPayment('lnbcrequest');
    });

    expect(enable).toHaveBeenCalled();
    expect(sendPayment).toHaveBeenCalledWith('lnbcrequest');
    expect(resolved).toEqual(paymentResult);
  });

  it('skips enable when already enabled', async () => {
    const paymentResult = { preimage: 'pre2' };
    const enable = jest.fn().mockResolvedValue(undefined);
    const getInfo = jest.fn().mockResolvedValue({ node: { alias: 'getalby.com' } });
    const sendPayment = jest.fn().mockResolvedValue(paymentResult);
    setWebln({ enable, getInfo, sendPayment });

    const { result, rerender } = renderHook(() => useAlby());

    await act(async () => {
      await result.current.enable();
    });
    rerender();
    expect(result.current.isEnabled).toBe(true);

    enable.mockClear();
    getInfo.mockClear();

    let resolved: unknown;
    await act(async () => {
      resolved = await result.current.sendPayment('lnbcrequest2');
    });

    expect(enable).not.toHaveBeenCalled();
    expect(sendPayment).toHaveBeenCalledWith('lnbcrequest2');
    expect(resolved).toEqual(paymentResult);
  });
});
