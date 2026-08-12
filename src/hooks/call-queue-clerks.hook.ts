import { useEffect, useState } from 'react';
import { useCompliance } from './compliance.hook';

export function useCallQueueClerks(): { clerks: string[]; isLoading: boolean; error?: string } {
  const { getCallQueueClerks } = useCompliance();
  const [clerks, setClerks] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    getCallQueueClerks()
      .then((list) => {
        if (!cancelled) {
          setClerks(list);
          setError(undefined);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setClerks([]);
          setError(e instanceof Error ? e.message : 'Unknown error');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { clerks, isLoading, error };
}
