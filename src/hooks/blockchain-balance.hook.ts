import { Asset, Blockchain, useBlockchain } from '@dfx.swiss/react';
import { useMemo } from 'react';
import { AssetBalance } from 'src/contexts/balance.context';

export interface BlockchainBalanceInterface {
  getAddressBalances: (assets: Asset[], address: string, blockchain: Blockchain) => Promise<AssetBalance[]>;
}

export function useBlockchainBalance(): BlockchainBalanceInterface {
  const { getBalances } = useBlockchain();

  async function getAddressBalances(
    assets: Asset[],
    address: string,
    blockchain: Blockchain,
  ): Promise<AssetBalance[]> {
    const response = await getBalances({ address, blockchain, assetIds: assets.map((a) => a.id) });

    return response.balances
      .map((b) => {
        const asset = assets.find((a) => a.id === b.assetId);
        return asset ? { asset, amount: b.balance } : undefined;
      })
      .filter((b): b is AssetBalance => b !== undefined);
  }

  return useMemo(() => ({ getAddressBalances }), [getBalances]);
}
