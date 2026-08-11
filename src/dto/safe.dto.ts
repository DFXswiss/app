export enum SafeOperationType {
  DEPOSIT = 'deposit',
  RECEIVE = 'receive',
  WITHDRAW = 'withdraw',
  SEND = 'send',
  SWAP = 'swap',
}

export enum TransactionMode {
  DEPOSIT = SafeOperationType.DEPOSIT,
  WITHDRAW = SafeOperationType.WITHDRAW,
  SWAP = SafeOperationType.SWAP,
}

export enum TransactionType {
  FIAT = 'fiat',
  CRYPTO = 'crypto',
}

export enum FiatCurrency {
  CHF = 'chf',
  EUR = 'eur',
  USD = 'usd',
}
