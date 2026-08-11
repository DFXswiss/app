import { useApi } from '@dfx.swiss/react';
import { useMemo } from 'react';
import { CreateVirtualIban, VirtualIban } from 'src/dto/virtual-iban.dto';

interface VirtualIbanInterface {
  createPersonalIban: (data: CreateVirtualIban) => Promise<VirtualIban>;
  getPersonalIbans: () => Promise<VirtualIban[]>;
}

export default function useVirtualIban(): VirtualIbanInterface {
  const { call } = useApi();

  async function createPersonalIban(data: CreateVirtualIban): Promise<VirtualIban> {
    return call<VirtualIban>({
      url: 'buy/personalIban',
      method: 'POST',
      data,
    });
  }

  async function getPersonalIbans(): Promise<VirtualIban[]> {
    return call<VirtualIban[]>({
      url: 'buy/personalIban',
      method: 'GET',
    });
  }

  return useMemo(() => ({ createPersonalIban, getPersonalIbans }), [call]);
}
