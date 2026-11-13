import { useEffect, useRef, useState } from 'react';
import { fetchJson } from 'src/util/utils';

export function usePolling({ timeInterval = 3 * 1000 }: { timeInterval?: number } = {}) {
  const [isPolling, setIsPolling] = useState(false);
  const url = useRef<string | URL>();
  const internalId = useRef<ReturnType<typeof setInterval>>();
  const fetchPromise = useRef<Promise<void>>();

  const init = (
    newUrl: string | URL,
    callback: (response: any) => void,
    errorCallback: (error: any) => void = () => {
      /* default */
    },
  ) => {
    if (isPolling) return;
    if (url.current === newUrl) return;

    if (internalId.current) clearInterval(internalId.current);
    url.current = newUrl;
    setIsPolling(true);

    fetchPromise.current = fetchJson(newUrl)
      .then(callback)
      .catch(errorCallback)
      .finally(() => {
        fetchPromise.current = undefined;
      });

    internalId.current = setInterval(() => {
      if (fetchPromise.current) return;
      fetchPromise.current = fetchJson(newUrl)
        .then(callback)
        .catch(errorCallback)
        .finally(() => {
          fetchPromise.current = undefined;
        });
    }, timeInterval);
  };

  const stop = () => {
    if (internalId.current) clearInterval(internalId.current);
    // release the URL as well: init() skips a call for the URL it is already polling, so
    // keeping it would make a later restart on the same URL a silent no-op
    url.current = undefined;
    setIsPolling(false);
  };

  useEffect(() => {
    return () => {
      internalId.current && clearInterval(internalId.current);
    };
  }, []);

  return {
    init,
    stop,
    isPolling,
  };
}
