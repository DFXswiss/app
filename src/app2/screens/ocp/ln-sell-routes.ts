import { Blockchain, type SellRoute } from '@dfx.swiss/react';

/** Active sell routes whose deposit accepts Lightning — used for OCP link/invoice create. */
export function selectLightningSellRoutes(routes: SellRoute[]): SellRoute[] {
  return routes.filter((r) => (r.deposit?.blockchains ?? []).includes(Blockchain.LIGHTNING) && r.active);
}
