export function createSingleFlight(): <T>(fn: () => Promise<T>) => Promise<T> {
  let inflight: Promise<unknown> | undefined;

  return function run<T>(fn: () => Promise<T>): Promise<T> {
    if (inflight) return inflight as Promise<T>;

    const next = fn().finally(() => {
      inflight = undefined;
    });
    inflight = next;
    return next;
  };
}
