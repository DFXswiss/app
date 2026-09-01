export function createKeyedSerial(): <T>(key: string, fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<void> = Promise.resolve();
  let currentKey: string | undefined;
  let current: Promise<unknown> | undefined;

  return function run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (current && currentKey === key) return current as Promise<T>;

    const next = tail.then(fn, fn);
    currentKey = key;
    current = next;
    tail = next.then(
      () => undefined,
      () => undefined,
    );
    next.finally(() => {
      if (current === next) {
        current = undefined;
        currentKey = undefined;
      }
    });
    return next;
  };
}
