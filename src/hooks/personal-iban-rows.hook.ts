import { VirtualIban, useBuy } from '@dfx.swiss/react';
import { useEffect, useRef, useState } from 'react';

interface PersonalIbanRowsResult {
  activePersonalIbans?: VirtualIban[];
  personalIbanRowsSettled: boolean;
  userLoadTimedOut: boolean;
}

/** Loads the current customer's provider rows and caps provider-selection waits at ten seconds. */
export function usePersonalIbanRows(
  customerIdentity: number | undefined,
  hasAuthenticatedCustomer: boolean,
  isActiveUserLoading: boolean,
): PersonalIbanRowsResult {
  const { getPersonalIbans } = useBuy();
  const [personalIbans, setPersonalIbans] = useState<{
    identity: number;
    rows: VirtualIban[];
  }>();
  const [userLoadTimeout, setUserLoadTimeout] = useState<{
    identity: number | undefined;
    timedOut: true;
  }>();
  const customerIdentityRef = useRef(customerIdentity);
  customerIdentityRef.current = customerIdentity;

  const activePersonalIbans =
    personalIbans !== undefined && personalIbans.identity === customerIdentity
      ? personalIbans.rows
      : undefined;
  const personalIbanRowsSettled =
    !hasAuthenticatedCustomer ||
    customerIdentity === undefined ||
    activePersonalIbans !== undefined;
  const userLoadTimedOut =
    userLoadTimeout !== undefined &&
    userLoadTimeout.identity === customerIdentity &&
    userLoadTimeout.timedOut;

  useEffect(() => {
    setPersonalIbans(undefined);
    if (!hasAuthenticatedCustomer || customerIdentity === undefined) return;

    let isRunning = true;
    let settled = false;
    const loadingCustomerIdentity = customerIdentity;
    const settle = (rows: VirtualIban[]) => {
      if (
        !isRunning ||
        settled ||
        customerIdentityRef.current !== loadingCustomerIdentity
      ) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      setPersonalIbans({ identity: loadingCustomerIdentity, rows });
    };
    const timeoutId = window.setTimeout(() => settle([]), 10000);

    getPersonalIbans().then(settle).catch(() => settle([]));

    return () => {
      isRunning = false;
      window.clearTimeout(timeoutId);
    };
  }, [hasAuthenticatedCustomer, customerIdentity, getPersonalIbans]);

  useEffect(() => {
    setUserLoadTimeout(undefined);
    if (!isActiveUserLoading) return;

    let isRunning = true;
    const loadingCustomerIdentity = customerIdentity;
    const timeoutId = window.setTimeout(() => {
      if (isRunning && customerIdentityRef.current === loadingCustomerIdentity) {
        setUserLoadTimeout({ identity: loadingCustomerIdentity, timedOut: true });
      }
    }, 10000);

    return () => {
      isRunning = false;
      window.clearTimeout(timeoutId);
    };
  }, [isActiveUserLoading, customerIdentity]);

  return { activePersonalIbans, personalIbanRowsSettled, userLoadTimedOut };
}
