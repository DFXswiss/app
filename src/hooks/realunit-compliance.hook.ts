import { ResponseType } from '@dfx.swiss/react';
import { useMemo } from 'react';
import {
  RealUnitCustomerDetailDto,
  RealUnitCustomerListDto,
  RealUnitKycFileDownloadDto,
  RealUnitNameCheckBatchDto,
  RealUnitNameCheckResultDto,
} from 'src/dto/realunit-compliance.dto';
import { downloadFile as saveFile, filenameDateFormat } from 'src/util/utils';
import { useGuardedApi } from './guarded-api.hook';

// RealUnit tenant compliance hook. Customer-scoped `/v1/realunit/compliance/*` endpoints over ONLY the tenant's own
// customers. Returns the REDUCED dossier (no DFX AML work products). Manual Dilisense name-check (single + batch) is
// the write exception. `call` MUST come from useGuardedApi so the staff 2FA (TFA_REQUIRED) redirect works.
export function useRealunitCompliance() {
  const { call } = useGuardedApi();

  // Without a key the api returns the complete tenant scope (all RealUnit customers).
  async function searchCustomers(key?: string): Promise<RealUnitCustomerListDto[]> {
    return call<RealUnitCustomerListDto[]>({
      url: `realunit/compliance/customers${key ? `?key=${encodeURIComponent(key)}` : ''}`,
      method: 'GET',
    });
  }

  async function getCustomer(id: number): Promise<RealUnitCustomerDetailDto> {
    return call<RealUnitCustomerDetailDto>({
      url: `realunit/compliance/customers/${id}`,
      method: 'GET',
    });
  }

  async function downloadFile(id: number, uid: string): Promise<RealUnitKycFileDownloadDto> {
    return call<RealUnitKycFileDownloadDto>({
      url: `realunit/compliance/customers/${id}/files/${uid}`,
      method: 'GET',
    });
  }

  // Full dossier as ZIP (all allowlisted files, bundled and audit-logged api-side).
  async function downloadDossier(id: number): Promise<void> {
    const { data, headers } = await call<{ data: Blob; headers: Record<string, string> }>({
      url: `realunit/compliance/customers/${id}/dossier`,
      method: 'GET',
      responseType: ResponseType.BLOB,
    });

    saveFile(data, headers, `RealUnit_dossier_${id}_${filenameDateFormat()}.zip`);
  }

  async function screenCustomer(id: number): Promise<RealUnitNameCheckResultDto> {
    return call<RealUnitNameCheckResultDto>({
      url: `realunit/compliance/customers/${id}/name-check`,
      method: 'POST',
    });
  }

  async function startNameCheckBatch(): Promise<RealUnitNameCheckBatchDto> {
    return call<RealUnitNameCheckBatchDto>({
      url: 'realunit/compliance/name-check',
      method: 'POST',
    });
  }

  async function getNameCheckBatch(): Promise<RealUnitNameCheckBatchDto> {
    return call<RealUnitNameCheckBatchDto>({
      url: 'realunit/compliance/name-check',
      method: 'GET',
    });
  }

  return useMemo(
    () => ({
      searchCustomers,
      getCustomer,
      downloadFile,
      downloadDossier,
      screenCustomer,
      startNameCheckBatch,
      getNameCheckBatch,
    }),
    [call],
  );
}
