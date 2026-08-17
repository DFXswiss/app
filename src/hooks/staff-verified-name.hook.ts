import { useAuthContext } from '@dfx.swiss/react';
import { useEffect, useState } from 'react';
import { useCompliance } from './compliance.hook';

const cache = new Map<number, Promise<string | undefined>>();

function readVerifiedName(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function clearStaffVerifiedNameCache(): void {
  cache.clear();
}

export function useStaffVerifiedName(): { name?: string; isLoading: boolean; error?: string } {
  const { session } = useAuthContext();
  const { getUserData } = useCompliance();
  const account = session?.account;
  const [name, setName] = useState<string>();
  const [isLoading, setIsLoading] = useState(account != null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (account == null) {
      setName(undefined);
      setIsLoading(false);
      setError(undefined);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    let pending = cache.get(account);
    if (!pending) {
      pending = getUserData(account)
        .then((data) => readVerifiedName(data.userData.verifiedName))
        .catch((e: unknown) => {
          cache.delete(account);
          throw e;
        });
      cache.set(account, pending);
    }

    pending
      .then((resolved) => {
        if (!cancelled) {
          setName(resolved);
          setError(undefined);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setName(undefined);
          setError(e instanceof Error && e.message ? e.message : 'Unknown error');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [account]);

  return { name, isLoading, error };
}
