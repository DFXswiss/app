export function createKeyedSerial(): <T>(key: string, fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<void> = Promise.resolve();
  const inflight = new Map<string, Promise<unknown>>();

  return function run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key);
    if (existing) return existing as Promise<T>;

    const next = tail.then(fn, fn);
    inflight.set(key, next);
    tail = next.then(
      () => undefined,
      () => undefined,
    );
    const cleanup = () => inflight.delete(key);
    void next.then(cleanup, cleanup);
    return next;
  };
}
