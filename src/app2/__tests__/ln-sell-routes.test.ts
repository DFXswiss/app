// OCP link/invoice create must only offer *active Lightning* sell routes.
// The previous predicate was `hasLightning || r.active`, so any active BTC/EVM
// sell route looked like an LN route and could be posted as routeId.

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {
    BITCOIN: 'Bitcoin',
    LIGHTNING: 'Lightning',
    ETHEREUM: 'Ethereum',
  },
}));

import { Blockchain, type SellRoute } from '@dfx.swiss/react';
import { selectLightningSellRoutes } from '../screens/ocp/ln-sell-routes';

function sellRoute(id: number, opts: { active: boolean; blockchains: Blockchain[] }): SellRoute {
  return {
    id,
    active: opts.active,
    deposit: { address: `dep-${id}`, blockchains: opts.blockchains },
  } as unknown as SellRoute;
}

describe('selectLightningSellRoutes', () => {
  it('keeps only active routes that list Lightning on the deposit', () => {
    const activeLn = sellRoute(1, { active: true, blockchains: [Blockchain.LIGHTNING] });
    const inactiveLn = sellRoute(2, { active: false, blockchains: [Blockchain.LIGHTNING] });
    const activeBtc = sellRoute(3, { active: true, blockchains: [Blockchain.BITCOIN] });
    const activeEth = sellRoute(4, { active: true, blockchains: [Blockchain.ETHEREUM] });
    const inactiveBtc = sellRoute(5, { active: false, blockchains: [Blockchain.BITCOIN] });
    const activeLnAndBtc = sellRoute(6, {
      active: true,
      blockchains: [Blockchain.LIGHTNING, Blockchain.BITCOIN],
    });

    expect(
      selectLightningSellRoutes([activeLn, inactiveLn, activeBtc, activeEth, inactiveBtc, activeLnAndBtc]).map(
        (r) => r.id,
      ),
    ).toEqual([1, 6]);
  });

  it('excludes a route with no deposit blockchains', () => {
    const emptyDeposit = {
      id: 9,
      active: true,
      deposit: { address: 'x', blockchains: [] },
    } as unknown as SellRoute;
    const missingDeposit = { id: 10, active: true } as unknown as SellRoute;

    expect(selectLightningSellRoutes([emptyDeposit, missingDeposit])).toEqual([]);
  });
});
