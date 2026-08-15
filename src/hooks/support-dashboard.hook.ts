import { Department } from '@dfx.swiss/react';
import { useMemo } from 'react';
import { useGuardedApi } from './guarded-api.hook';

// re-exported for existing call sites; canonical definition lives in the pure stats module
export { CustomerAuthor } from 'src/util/support-stats';

export const ASSIGNABLE_DEPARTMENTS: Department[] = [Department.SUPPORT, Department.COMPLIANCE];

export interface SupportIssueListItem {
  id: number;
  uid: string;
  type: string;
  reason: string;
  state: string;
  name: string;
  clerk?: string;
  department?: string;
  created: string;
  updated?: string;
  messageCount: number;
  lastMessageDate?: string;
  lastMessageAuthor?: string;
}

export interface SupportIssueInternalAccountData {
  id: number;
  status: string;
  verifiedName?: string;
  completeName?: string;
  accountType?: string;
  kycLevel: string;
  depositLimit?: number;
  annualVolume: number;
  kycHash: string;
  country?: { name: string };
  language?: { name?: string; symbol?: string };
}

export interface SupportIssueInternalTransactionData {
  id: number;
  sourceType: string;
  type: string;
  amlCheck?: string;
  amlReason?: string;
  comment?: string;
  inputAmount?: number;
  inputAsset?: string;
  inputBlockchain?: string;
  outputAmount?: number;
  outputAsset?: string;
  outputBlockchain?: string;
  wallet?: { name: string; amlRules: string; isKycClient: boolean };
  isComplete?: boolean;
}

export interface SupportIssueInternalLimitRequestData {
  id: number;
  limit: number;
  acceptedLimit?: number;
  investmentDate: string;
  fundOrigin: string;
  decision?: string;
}

export interface SupportIssueInternalTransactionMissingData {
  senderIban?: string;
  receiverIban?: string;
  date?: string;
}

export interface SupportIssueInternalData {
  id: number;
  created: string;
  uid: string;
  type: string;
  department?: string;
  reason: string;
  state: string;
  name: string;
  clerk?: string;
  account: SupportIssueInternalAccountData;
  transaction?: SupportIssueInternalTransactionData;
  limitRequest?: SupportIssueInternalLimitRequestData;
  transactionMissing?: SupportIssueInternalTransactionMissingData;
}

export interface SupportMessageInfo {
  id: number;
  author: string;
  message?: string;
  fileName?: string;
  created: string;
}

export interface UserSearchResult {
  id: number;
  kycStatus: string;
  accountType?: string;
  mail?: string;
  name?: string;
}

export interface SupportStatBucket {
  key: string; // "YYYY-MM-DD" (daily) or "YYYY-MM" (monthly)
  count: number;
}

export interface SupportResolutionBucket {
  key: string; // issue type
  avgHours: number;
  count: number;
}

export interface SupportStatisticsDto {
  periodDays: number;
  total: number;
  avgMessages: number;
  perDay: number;
  granularity: 'day' | 'month';
  trend: SupportStatBucket[]; // oldest first
  avgResolutionHours: number;
  resolutionByType: SupportResolutionBucket[];
}

export function useSupportDashboard() {
  // staff endpoints answer with HTTP 403 { code: 'TFA_REQUIRED' } when the session still needs 2FA;
  // useGuardedApi routes that into the bearer-based 2FA flow instead of surfacing a raw error
  const { call: guardedCall } = useGuardedApi();

  async function getIssueList(params?: {
    department?: string;
    states?: string;
    type?: string;
    take?: number;
    skip?: number;
    query?: string;
  }): Promise<{ data: SupportIssueListItem[]; total: number }> {
    const queryParts = Object.entries(params ?? {})
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
    const queryString = queryParts.length ? `?${queryParts.join('&')}` : '';

    return guardedCall<{ data: SupportIssueListItem[]; total: number }>({
      url: `support/issue/list${queryString}`,
      method: 'GET',
    });
  }

  async function getIssueCounts(): Promise<Record<string, number>> {
    return guardedCall<Record<string, number>>({
      url: 'support/issue/counts',
      method: 'GET',
    });
  }

  async function getIssueActivity(since?: Date): Promise<{ count: number; latestAt?: string }> {
    const query = since ? `?since=${encodeURIComponent(since.toISOString())}` : '';
    return guardedCall<{ count: number; latestAt?: string }>({
      url: `support/issue/activity${query}`,
      method: 'GET',
    });
  }

  async function getIssueStatistics(periodDays: number): Promise<SupportStatisticsDto> {
    return guardedCall<SupportStatisticsDto>({
      url: `support/issue/statistics?days=${periodDays}`,
      method: 'GET',
    });
  }

  async function getClerks(): Promise<string[]> {
    return guardedCall<string[]>({
      url: 'support/issue/clerks',
      method: 'GET',
    });
  }

  // the clerk name mapped to the logged-in support account (null if unmapped)
  async function getMyClerk(): Promise<string | undefined> {
    const result = await guardedCall<{ clerk: string | null }>({
      url: 'support/issue/clerk',
      method: 'GET',
    });
    return result.clerk ?? undefined;
  }

  async function getIssueData(issueId: number): Promise<SupportIssueInternalData> {
    return guardedCall<SupportIssueInternalData>({
      url: `support/issue/${issueId}/data`,
      method: 'GET',
    });
  }

  async function updateIssue(
    issueId: number,
    data: { state?: string; clerk?: string; department?: string },
  ): Promise<void> {
    return guardedCall<void>({
      url: `support/issue/${issueId}`,
      method: 'PUT',
      data,
    });
  }

  async function sendMessage(
    issueId: number,
    data: { author: string; message?: string; file?: string; fileName?: string },
  ): Promise<SupportMessageInfo> {
    return guardedCall<SupportMessageInfo>({
      url: `support/issue/${issueId}/message`,
      method: 'POST',
      data,
    });
  }

  async function createIssue(
    userDataId: number,
    data: {
      type: string;
      reason: string;
      name: string;
      department?: string;
      author: string;
      message?: string;
      file?: string;
      fileName?: string;
    },
  ): Promise<void> {
    return guardedCall<void>({
      url: `support/issue/support?userDataId=${userDataId}`,
      method: 'POST',
      data,
    });
  }

  async function searchUsers(key: string): Promise<UserSearchResult[]> {
    const result = await guardedCall<{ userDatas: UserSearchResult[] }>({
      url: `support?key=${encodeURIComponent(key)}`,
      method: 'GET',
    });
    return result.userDatas ?? [];
  }

  async function getIssueMessages(issueUid: string, fromMessageId?: number): Promise<SupportMessageInfo[]> {
    const query = fromMessageId ? `?fromMessageId=${fromMessageId}` : '';
    const result = await guardedCall<{ messages: SupportMessageInfo[] }>({
      url: `support/issue/${issueUid}${query}`,
      method: 'GET',
    });
    return result.messages;
  }

  async function getMessageFile(
    issueId: string,
    messageId: number,
  ): Promise<{ data: { type: string; data: number[] }; contentType: string }> {
    return guardedCall<{ data: { type: string; data: number[] }; contentType: string }>({
      url: `support/issue/${issueId}/message/${messageId}/file`,
      method: 'GET',
    });
  }

  return useMemo(
    () => ({
      getIssueList,
      getIssueCounts,
      getIssueActivity,
      getIssueStatistics,
      getClerks,
      getMyClerk,
      getIssueData,
      updateIssue,
      sendMessage,
      createIssue,
      getIssueMessages,
      getMessageFile,
      searchUsers,
    }),
    [guardedCall],
  );
}
