import { createKeyedSerial } from '../single-flight';

describe('createKeyedSerial', () => {
  it('joins overlapping calls with the same key and invokes fn once', async () => {
    const run = createKeyedSerial();
    let calls = 0;
    let resolveFirst: (value: string) => void = () => undefined;
    const fn = () => {
      calls += 1;
      return new Promise<string>((resolve) => {
        resolveFirst = resolve;
      });
    };

    const first = run('continue', fn);
    const second = run('continue', fn);
    expect(calls).toBe(1);

    resolveFirst('ok');
    await expect(first).resolves.toBe('ok');
    await expect(second).resolves.toBe('ok');
    expect(calls).toBe(1);
  });

  it('queues a different key behind the in-flight one', async () => {
    const run = createKeyedSerial();
    let continueCalls = 0;
    let infoCalls = 0;
    let resolveContinue: (value: string) => void = () => undefined;

    const continueP = run('continue', () => {
      continueCalls += 1;
      return new Promise<string>((resolve) => {
        resolveContinue = resolve;
      });
    });
    const infoP = run('info', () => {
      infoCalls += 1;
      return Promise.resolve('info');
    });

    expect(continueCalls).toBe(1);
    expect(infoCalls).toBe(0);

    resolveContinue('put');
    await expect(continueP).resolves.toBe('put');
    await expect(infoP).resolves.toBe('info');
    expect(infoCalls).toBe(1);
  });

  it('joins a second continue while an info load is queued', async () => {
    const run = createKeyedSerial();
    let continueCalls = 0;
    let resolveContinue: (value: string) => void = () => undefined;

    const first = run('continue', () => {
      continueCalls += 1;
      return new Promise<string>((resolve) => {
        resolveContinue = resolve;
      });
    });
    const infoP = run('info', () => Promise.resolve('info'));
    const second = run('continue', () => {
      continueCalls += 1;
      return Promise.resolve('second');
    });

    expect(continueCalls).toBe(1);
    resolveContinue('put');
    await expect(first).resolves.toBe('put');
    await expect(second).resolves.toBe('put');
    await expect(infoP).resolves.toBe('info');
    expect(continueCalls).toBe(1);
  });

  it('invokes fn again after the previous call with the same key resolves', async () => {
    const run = createKeyedSerial();
    let calls = 0;
    const fn = () => {
      calls += 1;
      return Promise.resolve(calls);
    };

    await expect(run('continue', fn)).resolves.toBe(1);
    await expect(run('continue', fn)).resolves.toBe(2);
    expect(calls).toBe(2);
  });

  it('invokes fn again after the previous call rejects', async () => {
    const run = createKeyedSerial();
    let calls = 0;
    const fn = () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('boom')) : Promise.resolve('recovered');
    };

    await expect(run('continue', fn)).rejects.toThrow('boom');
    await expect(run('continue', fn)).resolves.toBe('recovered');
    expect(calls).toBe(2);
  });

  it('does not share in-flight state between instances', async () => {
    const a = createKeyedSerial();
    const b = createKeyedSerial();
    let aCalls = 0;
    let bCalls = 0;
    let resolveA: (value: string) => void = () => undefined;
    let resolveB: (value: string) => void = () => undefined;

    const pA = a('continue', () => {
      aCalls += 1;
      return new Promise<string>((resolve) => {
        resolveA = resolve;
      });
    });
    const pB = b('continue', () => {
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
