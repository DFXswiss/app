import { useAuthContext, UserRole } from '@dfx.swiss/react';
import { useEffect, useState } from 'react';
import { useCompliance } from './compliance.hook';
import { useRealunitSupport } from './realunit-support.hook';
import { useSupportDashboard } from './support-dashboard.hook';

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
  const { getMyClerk: getSupportClerk } = useSupportDashboard();
  const { getMyClerk: getRealunitClerk } = useRealunitSupport();
  const account = session?.account;
  const role = session?.role;
  const [resolved, setResolved] = useState<{ account: number; name?: string; error?: string }>();

  useEffect(() => {
    if (account == null) {
      setResolved(undefined);
      return;
    }

    let cancelled = false;

    let pending = cache.get(account);
    if (!pending) {
      const loadClerk = role === UserRole.REALUNIT ? getRealunitClerk : getSupportClerk;
      pending = loadClerk()
        .then((clerk) => readVerifiedName(clerk))
        // 404/403 while the companion API clerk route is not deployed yet: fall through to userData.
        .catch(() => undefined)
        .then((fromClerk) => {
          if (fromClerk) return fromClerk;
          return getUserData(account).then((data) => readVerifiedName(data.userData.verifiedName));
        })
        .catch((e: unknown) => {
          cache.delete(account);
          throw e;
        });
      cache.set(account, pending);
    }

    pending
      .then((name) => {
        if (!cancelled) setResolved({ account, name });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setResolved({
            account,
            name: undefined,
            error: e instanceof Error && e.message ? e.message : 'Unknown error',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [account, role]);

  if (account == null) return { name: undefined, isLoading: false, error: undefined };
  if (!resolved || resolved.account !== account) return { name: undefined, isLoading: true, error: undefined };
  return { name: resolved.name, isLoading: false, error: resolved.error };
}
