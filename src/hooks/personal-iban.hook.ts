import { useAuthContext } from '@dfx.swiss/react';
import { useLocation } from 'react-router-dom';
import { useAppHandlingContext } from '../contexts/app-handling.context';
import {
  isExplicitPersonalIbanRequest,
  normalizePersonalIban,
} from '../util/personal-iban';

export interface PersonalIbanSelection {
  /** Selector requested by the URL or widget. */
  requestedPersonalIban?: string;
  /** Selector that may be added to the next quote request. */
  personalIban?: string;
  /** True only when quote ownership can be tied to a currently authenticated (non-expired) account. */
  hasAuthenticatedCustomer: boolean;
}

/**
 * Derives the personal-IBAN selector from the URL (standalone) or live widget property.
 * A recognized provider request - Frick or Yapeal - is applied directly; no intermediate
 * confirmation step.
 */
export function usePersonalIbanSelection(): PersonalIbanSelection {
  const { isWidget, widgetPersonalIban } = useAppHandlingContext();
  const location = useLocation();
  const urlPersonalIban =
    // lgtm[js/clear-text-storage-of-sensitive-data] - The public parameter carries a provider
    // identifier, never an IBAN; this hook reads the live URL and does not persist the value.
    new URLSearchParams(location.search).get('personal-iban') ?? undefined;
  const requestedPersonalIban = normalizePersonalIban(
    isWidget ? widgetPersonalIban : urlPersonalIban,
  );
  const { session, isLoggedIn } = useAuthContext();
  const customerIdentity =
    typeof session?.account === 'number' ? session.account : undefined;
  // session.account comes from decoded JWT state set via setAuthToken; isLoggedIn is independently
  // recomputed each render from the live token ref and expiry check. They can only diverge in the
  // expiry window (session.account still populated from the old jwt state, isLoggedIn already false).
  // Consulting isLoggedIn closes that gap and cannot spuriously block a legitimate non-expired session.
  const hasAuthenticatedCustomer = customerIdentity !== undefined && isLoggedIn;
  const personalIban = isExplicitPersonalIbanRequest(requestedPersonalIban)
    ? requestedPersonalIban
    : undefined;

  return {
    requestedPersonalIban,
    personalIban,
    hasAuthenticatedCustomer,
  };
}
