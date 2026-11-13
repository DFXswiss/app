import { Asset, Blockchain, useBlockchain } from '@dfx.swiss/react';
import * as Solana from '@solana/web3.js';
import { useMemo } from 'react';

export interface BlockchainTransactionInterface {
  createSolanaTransaction: (
    fromAddress: string,
    toAddress: string,
    amount: number,
    asset?: Asset,
  ) => Promise<Solana.Transaction>;
  createTronTransaction: (
    fromAddress: string,
    toAddress: string,
    amount: number,
    asset?: Asset,
  ) => Promise<object>;
  broadcastTransaction: (blockchain: Blockchain, signedTransaction: string) => Promise<string>;
}

export function useBlockchainTransaction(): BlockchainTransactionInterface {
  const { createTransaction, broadcastTransaction: broadcast } = useBlockchain();

  async function createSolanaTransaction(
    fromAddress: string,
    toAddress: string,
    amount: number,
    asset?: Asset,
  ): Promise<Solana.Transaction> {
    const response = await createTransaction({
      blockchain: Blockchain.SOLANA,
      fromAddress,
      toAddress,
      amount,
      assetId: asset?.id,
    });

    // Deserialize the transaction from base64
    const transactionBuffer = Buffer.from(response.rawTransaction, 'base64');
    return Solana.Transaction.from(transactionBuffer);
  }

  async function createTronTransaction(
    fromAddress: string,
    toAddress: string,
    amount: number,
    asset?: Asset,
  ): Promise<object> {
    const response = await createTransaction({
      blockchain: Blockchain.TRON,
      fromAddress,
      toAddress,
      amount,
      assetId: asset?.id,
    });

    // Parse the transaction JSON
    return JSON.parse(response.rawTransaction);
  }

  async function broadcastTransaction(blockchain: Blockchain, signedTransaction: string): Promise<string> {
    const { txHash } = await broadcast({ blockchain, signedTransaction });
    return txHash;
  }

  return useMemo(
    () => ({ createSolanaTransaction, createTronTransaction, broadcastTransaction }),
    [createTransaction, broadcast],
  );
}
