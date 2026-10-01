/**
 * Browser-storage keys App 2.0 shares with the main app on this origin.
 *
 * Same-origin `/` and `/app2/` stay one session. These strings must match
 * the main app's StoreKey / SessionStoreKey / BANK_TX_CACHE_PREFIX — pinned
 * by `legacy-contract.test.ts`. App 2.0 does not import those private modules.
 */

export enum StoreKey {
  AUTH_TOKEN = 'dfx.authenticationToken',
  REDIRECT_URI = 'dfx.srv.redirectUri',
  BALANCES = 'dfx.srv.balances',
  LANGUAGE = 'dfx.srv.language',
  ACTIVE_WALLET = 'dfx.srv.activeWallet',
  INFO_BANNER = 'dfx.srv.infoBanner',
  QUERY_PARAMS = 'dfx.srv.queryParams',
}

export enum SessionStoreKey {
  SUPPORT_ISSUE_UID = 'dfx.supportIssueUid',
  PAYMENT_LINK_API_URL = 'dfx.paymentLinkApiUrl',
  EDIT_MAIL_RETURN = 'dfx.editMailReturn',
}

export const BANK_TX_CACHE_PREFIX = 'dfx.bankTx.';
