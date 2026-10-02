// Mock payment-link dto
jest.mock('src/dto/payment-link.dto', () => ({}));

import { Wallet } from '../util/payment-link-wallet';
import { TransferAmount } from '@dfx.swiss/react';
import { WalletInfo } from 'src/dto/payment-link.dto';

describe('Wallet', () => {
  // Test data
  const createWallet = (methods: string[], assets?: { name: string; uniqueName: string }[]): WalletInfo => ({
    supportedMethods: methods,
    supportedAssets: assets,
  } as WalletInfo);

  const createTransferInfo = (method: string, assets: string[], available = true): TransferAmount => ({
    method,
    assets: assets.map(name => ({ asset: name })),
    available,
  } as TransferAmount);

  describe('filterTransferInfoByWallet', () => {
    it('should return empty array if no methods match', () => {
      const wallet = createWallet(['Card']);
      const transferInfoList = [createTransferInfo('Bank', ['EUR', 'CHF'])];
      
      const result = Wallet.filterTransferInfoByWallet(wallet, transferInfoList);
      expect(result).toEqual([]);
    });

    it('should filter transfer info by supported methods', () => {
      const wallet = createWallet(['Bank', 'Card']);
      const transferInfoList = [
        createTransferInfo('Bank', ['EUR']),
        createTransferInfo('Crypto', ['BTC']),
      ];
      
      const result = Wallet.filterTransferInfoByWallet(wallet, transferInfoList);
      expect(result).toHaveLength(1);
      expect(result[0].method).toBe('Bank');
    });

    it('should filter out unavailable transfer info', () => {
      const wallet = createWallet(['Bank']);
      const transferInfoList = [
        createTransferInfo('Bank', ['EUR'], true),
        createTransferInfo('Bank', ['CHF'], false),
      ];
      
      const result = Wallet.filterTransferInfoByWallet(wallet, transferInfoList);
      expect(result).toHaveLength(1);
    });

    it('should filter assets by wallet supported assets', () => {
      const wallet = createWallet(['Crypto'], [
        { name: 'BTC', uniqueName: 'Crypto:BTC' },
      ]);
      const transferInfoList = [
        createTransferInfo('Crypto', ['BTC', 'ETH', 'USDT']),
      ];
      
      const result = Wallet.filterTransferInfoByWallet(wallet, transferInfoList);
      expect(result).toHaveLength(1);
      expect(result[0].assets).toHaveLength(1);
      expect(result[0].assets[0].asset).toBe('BTC');
    });

    it('should return all assets if wallet has no asset restrictions', () => {
      const wallet = createWallet(['Crypto']);
      const transferInfoList = [
        createTransferInfo('Crypto', ['BTC', 'ETH', 'USDT']),
      ];
      
      const result = Wallet.filterTransferInfoByWallet(wallet, transferInfoList);
      expect(result).toHaveLength(1);
      expect(result[0].assets).toHaveLength(3);
    });

    it('should handle empty transfer info list', () => {
      const wallet = createWallet(['Bank']);
      const result = Wallet.filterTransferInfoByWallet(wallet, []);
      expect(result).toEqual([]);
    });

    it('should handle multiple matching transfer infos', () => {
      const wallet = createWallet(['Bank', 'Card', 'Crypto']);
      const transferInfoList = [
        createTransferInfo('Bank', ['EUR']),
        createTransferInfo('Card', ['EUR']),
        createTransferInfo('Crypto', ['BTC']),
      ];
      
      const result = Wallet.filterTransferInfoByWallet(wallet, transferInfoList);
      expect(result).toHaveLength(3);
    });
  });

  describe('qualifiesForPayment', () => {
    it('should return true if wallet qualifies for at least one transfer', () => {
      const wallet = createWallet(['Bank']);
      const transferInfoList = [
        createTransferInfo('Bank', ['EUR']),
        createTransferInfo('Crypto', ['BTC']),
      ];
      
      const result = Wallet.qualifiesForPayment(wallet, transferInfoList);
      expect(result).toBe(true);
    });

    it('should return false if wallet does not qualify for any transfer', () => {
      const wallet = createWallet(['Card']);
      const transferInfoList = [
        createTransferInfo('Bank', ['EUR']),
        createTransferInfo('Crypto', ['BTC']),
      ];
      
      const result = Wallet.qualifiesForPayment(wallet, transferInfoList);
      expect(result).toBe(false);
    });

    it('should return false for empty transfer info list', () => {
      const wallet = createWallet(['Bank']);
      const result = Wallet.qualifiesForPayment(wallet, []);
      expect(result).toBe(false);
    });

    it('should consider asset restrictions', () => {
      const wallet = createWallet(['Crypto'], [
        { name: 'DOGE', uniqueName: 'Crypto:DOGE' },
      ]);
      const transferInfoList = [
        createTransferInfo('Crypto', ['BTC', 'ETH']),
      ];
      
      const result = Wallet.qualifiesForPayment(wallet, transferInfoList);
      expect(result).toBe(false);
    });

    it('should return true when asset matches by uniqueName', () => {
      const wallet = createWallet(['Crypto'], [
        { name: 'Bitcoin', uniqueName: 'Crypto:BTC' },
      ]);
      const transferInfoList = [
        createTransferInfo('Crypto', ['BTC']),
      ];
      
      const result = Wallet.qualifiesForPayment(wallet, transferInfoList);
      expect(result).toBe(true);
    });

    it('should return true for RealUnit-like Ethereum/ZCHF wallet against Ethereum transfer', () => {
      const wallet = createWallet(['Ethereum'], [{ name: 'ZCHF', uniqueName: 'Ethereum:ZCHF' }]);
      const transferInfoList = [createTransferInfo('Ethereum', ['ZCHF'])];

      const result = Wallet.qualifiesForPayment(wallet, transferInfoList);
      expect(result).toBe(true);
    });

    it('should return false for RealUnit-like Ethereum/ZCHF wallet against Lightning-only transfer', () => {
      const wallet = createWallet(['Ethereum'], [{ name: 'ZCHF', uniqueName: 'Ethereum:ZCHF' }]);
      const transferInfoList = [createTransferInfo('Lightning', ['BTC'])];

      const result = Wallet.qualifiesForPayment(wallet, transferInfoList);
      expect(result).toBe(false);
    });
  });
});
