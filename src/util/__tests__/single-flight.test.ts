import { createSingleFlight } from '../single-flight';

describe('createSingleFlight', () => {
  it('joins overlapping calls and invokes fn once', async () => {
    const run = createSingleFlight();
    let calls = 0;
    let resolveFirst: (value: string) => void = () => undefined;
    const fn = () => {
      calls += 1;
      return new Promise<string>((resolve) => {
        resolveFirst = resolve;
      });
    };

    const first = run(fn);
    const second = run(fn);
    expect(calls).toBe(1);

    resolveFirst('ok');
    await expect(first).resolves.toBe('ok');
    await expect(second).resolves.toBe('ok');
    expect(calls).toBe(1);
  });

  it('invokes fn again after the previous call resolves', async () => {
    const run = createSingleFlight();
    let calls = 0;
    const fn = () => {
      calls += 1;
      return Promise.resolve(calls);
    };

    await expect(run(fn)).resolves.toBe(1);
    await expect(run(fn)).resolves.toBe(2);
    expect(calls).toBe(2);
  });

  it('invokes fn again after the previous call rejects', async () => {
    const run = createSingleFlight();
    let calls = 0;
    const fn = () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('boom')) : Promise.resolve('recovered');
    };

    await expect(run(fn)).rejects.toThrow('boom');
    await expect(run(fn)).resolves.toBe('recovered');
    expect(calls).toBe(2);
  });

  it('does not share in-flight state between instances', async () => {
    const a = createSingleFlight();
    const b = createSingleFlight();
    let aCalls = 0;
    let bCalls = 0;
    let resolveA: (value: string) => void = () => undefined;
    let resolveB: (value: string) => void = () => undefined;

    const pA = a(() => {
      aCalls += 1;
      return new Promise<string>((resolve) => {
        resolveA = resolve;
      });
    });
    const pB = b(() => {
      bCalls += 1;
      return new Promise<string>((resolve) => {
        resolveB = resolve;
      });
    });

    expect(aCalls).toBe(1);
    expect(bCalls).toBe(1);

    resolveA('a');
    resolveB('b');
    await expect(pA).resolves.toBe('a');
    await expect(pB).resolves.toBe('b');
  });
});
