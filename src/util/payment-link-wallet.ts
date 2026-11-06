import { Amount, TransferInfo, WalletInfo } from 'src/dto/payment-link.dto';

// the part of a transfer entry that wallet compatibility depends on; payment requests and merchant info both have it
export type TransferMethodInfo = { method: string; assets: Amount[]; available?: boolean };

export class Wallet {
  static filterTransferInfoByWallet<T extends TransferMethodInfo>(wallet: WalletInfo, transferInfoList: T[]): T[] {
    return transferInfoList.map((ta) => this.filterCompatible(wallet, ta)).filter(Boolean) as T[];
  }

  static qualifiesForPayment(wallet: WalletInfo, transferInfoList: TransferInfo[]): boolean {
    return transferInfoList.some((ta) => this.filterCompatible(wallet, ta));
  }

  private static filterCompatible<T extends TransferMethodInfo>(wallet: WalletInfo, transferInfo: T): T | undefined {
    const { method, assets, available } = transferInfo;
    if (available === false) return undefined;

    if (!(wallet.supportedMethods as string[]).includes(method)) {
      return undefined;
    }

    if (wallet.supportedAssets) {
      const filteredAssets = assets.filter(({ asset }) =>
        wallet.supportedAssets?.some(
          (supportedAsset) => supportedAsset.name === asset || supportedAsset.uniqueName === `${method}:${asset}`,
        ),
      );
      return filteredAssets.length > 0 ? { ...transferInfo, assets: filteredAssets } : undefined;
    }

    return transferInfo;
  }
}
