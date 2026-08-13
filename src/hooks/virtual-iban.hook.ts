import { useApi, VirtualIban } from '@dfx.swiss/react';
import { useMemo } from 'react';
import { CreateVirtualIban } from 'src/dto/virtual-iban.dto';

interface VirtualIbanInterface {
  createPersonalIban: (data: CreateVirtualIban) => Promise<VirtualIban>;
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

  return useMemo(() => ({ createPersonalIban }), [call]);
}
