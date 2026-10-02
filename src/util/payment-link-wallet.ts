import { TransferAmount } from '@dfx.swiss/react';
import { WalletInfo } from 'src/dto/payment-link.dto';

export class Wallet {
  static filterTransferInfoByWallet(wallet: WalletInfo, transferInfoList: TransferAmount[]): TransferAmount[] {
    return transferInfoList.map((ta) => this.filterCompatible(wallet, ta)).filter(Boolean) as TransferAmount[];
  }

  static qualifiesForPayment(wallet: WalletInfo, transferInfoList: TransferAmount[]): boolean {
    return transferInfoList.some((ta) => this.filterCompatible(wallet, ta));
  }

  private static filterCompatible(
    wallet: WalletInfo,
    transferInfo: TransferAmount,
    isAvailable = true,
  ): TransferAmount | undefined {
    const { method, assets, available } = transferInfo;
    if (isAvailable && available === false) return undefined;

    if (!wallet.supportedMethods.includes(method)) {
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
