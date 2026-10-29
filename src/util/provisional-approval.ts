import type { Buy } from '@dfx.swiss/react';

export function isProvisionalApproval(buy: Buy | undefined): boolean {
  return (buy as (Buy & { provisionalApproval?: boolean }) | undefined)?.provisionalApproval === true;
}
