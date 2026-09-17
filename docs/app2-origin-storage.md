# App 2.0 shares browser storage with the original app

App 2.0 (`/app2/`) and the original app (`/`) run on the same origin, so they share `localStorage`
and `sessionStorage`. That is deliberate: a session survives the move between `/` and `/app2/`.

## Copied keys, identical strings

App 2.0 does not import the original app's private modules. It keeps its own definitions in
`src/app2/lib/storage-keys.ts` (`StoreKey`, `SessionStoreKey`, `BANK_TX_CACHE_PREFIX`). The string
values must still match the originals in `src/hooks/store.hook.ts`, `src/hooks/session-store.hook.ts`
and `src/util/bank-tx-cache.ts`. `src/app2/__tests__/legacy-contract.test.ts` fails if a member or a
value is missing or different on either side.

A key that one app writes is visible to the other. Cleanup on session switch and on a credentialed
load is owned by `src/app2/wallets/session.tsx`. A key that one app sets and the other does not drop
will survive into the next session. Two cases that already did: `dfx.editMailReturn`
(`SessionStoreKey.EDIT_MAIL_RETURN`) kept a return path across a credential change;
`dfx.srv.queryParams` (`StoreKey.QUERY_PARAMS`) carried mail, name and address into the next
session.

A new key in either app belongs on that cleanup list.

## Other copied contracts

Job tickets, KYC error mapping, Sumsub review enums and hardware-wallet key paths are also copied
under `src/app2/lib/` and pinned by the same test. They are not storage, but they are the same kind
of lockstep copy.
