# App 2.0 imports from the original app tree

App 2.0 (`/app2/`) and the original app (`/`) run on the same origin. Some App 2.0
modules import from the original app's private source, not from `@dfx.swiss/react`.

## Shared browser storage

`StoreKey` (`src/hooks/store.hook.ts`) and `SessionStoreKey`
(`src/hooks/session-store.hook.ts`) name the `localStorage` and `sessionStorage`
entries both apps read and write. A key set under `/` is visible under `/app2/`,
and the other way around. `BANK_TX_CACHE_PREFIX` (`src/util/bank-tx-cache.ts`) is
the same for the bank-tx cache in `sessionStorage`.

Cleanup on session switch and on a credentialed load is owned by
`src/app2/wallets/session.tsx`. A key that one app sets and the other does not
drop will survive into the next session. Two cases that already did:
`dfx.editMailReturn` (`SessionStoreKey.EDIT_MAIL_RETURN`) kept a return path
across a credential change; `dfx.srv.queryParams` (`StoreKey.QUERY_PARAMS`)
carried mail, name and address into the next session.

A new key in either app belongs on that cleanup list.

## Other private-tree imports

These are code, not storage, but they are the same kind of coupling:

- `src/util/job.ts` — account-merge job polling (`src/app2/screens/return-route.tsx`)
- `src/util/api-error.ts` — KYC error mapping (`src/app2/screens/trade/errors.ts`)
- `src/dto/sumsub.dto.ts` — Sumsub review enums (`src/app2/screens/kyc-steps.tsx`)
- `src/config/key-path.ts` — hardware-wallet key paths (`src/app2/wallets/hardware-providers.ts`)
