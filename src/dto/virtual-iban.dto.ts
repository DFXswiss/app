export enum VirtualIbanStatus {
  RESERVED = 'Reserved',
  ACTIVE = 'Active',
  EXPIRED = 'Expired',
  DEACTIVATED = 'Deactivated',
}

export interface VirtualIban {
  id: number;
  iban: string;
  bban?: string;
  currency: string;
  bank: string;
  active: boolean;
  acceptsPayments: boolean;
  status?: VirtualIbanStatus;
  label?: string;
  activatedAt?: Date;
}

export interface CreateVirtualIban {
  currency: string;
}
