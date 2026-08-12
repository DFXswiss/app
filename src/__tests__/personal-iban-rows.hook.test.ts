const mockGetPersonalIbans = jest.fn();

jest.mock('@dfx.swiss/react', () => {
  const buyInterface = {
    getPersonalIbans: (...args: unknown[]) => mockGetPersonalIbans(...args),
  };
  return {
    useBuy: () => buyInterface,
  };
});

import type { VirtualIban } from '@dfx.swiss/react';
import { act, renderHook } from '@testing-library/react';
import { usePersonalIbanRows } from '../hooks/personal-iban-rows.hook';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('usePersonalIbanRows', () => {
  it('loads fresh rows after an A-to-B-to-A identity switch and discards the first A response', async () => {
    const firstARows = createDeferred<VirtualIban[]>();
    const bRows = createDeferred<VirtualIban[]>();
    const freshARows = createDeferred<VirtualIban[]>();
    const staleRows = [{ id: 1, iban: 'STALE-A-IBAN' }] as VirtualIban[];
    const currentRows = [{ id: 2, iban: 'CURRENT-A-IBAN' }] as VirtualIban[];
    const responses = [firstARows.promise, bRows.promise, freshARows.promise];
    let responseIndex = 0;
    mockGetPersonalIbans.mockImplementation(() => {
      const response = responses[responseIndex];
      responseIndex += 1;
      if (!response) {
        throw new Error(
          `Unexpected getPersonalIbans call #${responseIndex}; only ${responses.length} responses configured`,
        );
      }
      return response;
    });

    const { result, rerender } = renderHook(
      ({ customerIdentity }) =>
        usePersonalIbanRows(customerIdentity, true, false),
      { initialProps: { customerIdentity: 1 } },
    );

    expect(mockGetPersonalIbans).toHaveBeenCalledTimes(1);

    rerender({ customerIdentity: 2 });
    rerender({ customerIdentity: 1 });

    expect(mockGetPersonalIbans).toHaveBeenCalledTimes(3);
    expect(result.current.activePersonalIbans).toBeUndefined();

    await act(async () => {
      firstARows.resolve(staleRows);
      await Promise.resolve();
    });

    expect(result.current.activePersonalIbans).toBeUndefined();
    expect(result.current.personalIbanRowsSettled).toBe(false);

    await act(async () => {
      freshARows.resolve(currentRows);
      await Promise.resolve();
    });

    expect(result.current.activePersonalIbans).toEqual(currentRows);
    expect(result.current.personalIbanRowsSettled).toBe(true);
  });
});
