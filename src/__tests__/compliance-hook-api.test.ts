// Unit tests for the API wrappers of useCompliance: every wrapper issues exactly the request the API
// expects (url, method, body), the search key is IBAN-normalised, downloads hand the response to the
// file helpers, and saveCallOutcome reports the failing step for each of its branches.

const mockCall = jest.fn();
const mockDownloadFile = jest.fn();
const mockDownloadPdfFromString = jest.fn();

jest.mock('src/hooks/guarded-api.hook', () => ({ useGuardedApi: () => ({ call: mockCall }) }));

jest.mock('@dfx.swiss/react', () => ({
  AmlReason: { MANUAL_CHECK_PHONE_FAILED: 'ManualCheckPhoneFailed' },
  CheckStatus: { PASS: 'Pass', FAIL: 'Fail' },
  ResponseType: { BLOB: 'blob' },
  PhoneCallStatus: {
    COMPLETED: 'Completed',
    UNAVAILABLE: 'Unavailable',
    SUSPICIOUS: 'Suspicious',
    FAILED: 'Failed',
    REPEAT: 'Repeat',
    USER_REJECTED: 'UserRejected',
  },
  CallQueue: {
    MANUAL_CHECK_PHONE: 'ManualCheckPhone',
    MANUAL_CHECK_IP_PHONE: 'ManualCheckIpPhone',
    MANUAL_CHECK_IP_COUNTRY_PHONE: 'ManualCheckIpCountryPhone',
    MANUAL_CHECK_EXTERNAL_ACCOUNT_PHONE: 'ManualCheckExternalAccountPhone',
    UNAVAILABLE_SUSPICIOUS: 'UnavailableSuspicious',
  },
}));

jest.mock('src/util/utils', () => ({
  ...jest.requireActual('src/util/utils'),
  downloadFile: (...args: unknown[]) => mockDownloadFile(...args),
  downloadPdfFromString: (...args: unknown[]) => mockDownloadPdfFromString(...args),
  filenameDateFormat: () => '20260907',
}));

import { renderHook } from '@testing-library/react';
import { CallOutcome, LimitRequestDecision, useCompliance } from 'src/hooks/compliance.hook';

type Api = ReturnType<typeof useCompliance>;

function api(): Api {
  return renderHook(() => useCompliance()).result.current;
}

function lastCall(): { url: string; method: string; data?: unknown } {
  const [cfg] = mockCall.mock.calls[mockCall.mock.calls.length - 1];
  return cfg;
}

// [description, invoke, expected request]
const REQUESTS: [string, (a: Api) => Promise<unknown>, { url: string; method: string; data?: unknown }][] = [
  ['getUserData', (a) => a.getUserData(7), { url: 'support/7', method: 'GET' }],
  [
    'setKycStatusCheck',
    (a) => a.setKycStatusCheck(7, 'Completed' as never),
    { url: 'userData/7/kycStatus/check', method: 'PUT', data: { expectedKycStatus: 'Completed' } },
  ],
  [
    'getTransactionRefundData',
    (a) => a.getTransactionRefundData(3),
    { url: 'support/transaction/3/refund', method: 'GET' },
  ],
  ['getKycFileList', (a) => a.getKycFileList(), { url: 'support/kycFileList', method: 'GET' }],
  ['getKycFileStats', (a) => a.getKycFileStats(), { url: 'support/kycFileStats', method: 'GET' }],
  [
    'getTransactionList without params',
    (a) => a.getTransactionList(),
    { url: 'support/transactionList', method: 'GET' },
  ],
  [
    'getTransactionList with params (empty ones dropped)',
    (a) => a.getTransactionList({ createdFrom: '2026-01-01', createdTo: '', outputTo: '2026-02-01' }),
    { url: 'support/transactionList?createdFrom=2026-01-01&outputTo=2026-02-01', method: 'GET' },
  ],
  ['getCustodyOrders', (a) => a.getCustodyOrders(), { url: 'custody/admin/orders', method: 'GET' }],
  ['approveCustodyOrder', (a) => a.approveCustodyOrder(5), { url: 'custody/admin/order/5/approve', method: 'POST' }],
  [
    'generateOnboardingPdf',
    (a) => a.generateOnboardingPdf(7, { finalDecision: 'Accepted', processedBy: 'JR' }),
    { url: 'support/7/onboarding-pdf', method: 'POST', data: { finalDecision: 'Accepted', processedBy: 'JR' } },
  ],
  [
    'generateLimitRequestPdf',
    (a) => a.generateLimitRequestPdf(7, { decision: 'Accepted' as never, clerk: 'JR', requestedLimit: 100 }),
    {
      url: 'support/7/limit-request-pdf',
      method: 'POST',
      data: { decision: 'Accepted', clerk: 'JR', requestedLimit: 100 },
    },
  ],
  ['getPendingTransactions', (a) => a.getPendingTransactions(), { url: 'support/pending-transactions', method: 'GET' }],
  ['getPendingReviews', (a) => a.getPendingReviews(), { url: 'support/pending-reviews', method: 'GET' }],
  [
    'getPendingReviewItems without name',
    (a) => a.getPendingReviewItems('Ident' as never, 'Open' as never),
    { url: 'support/pending-reviews/items?type=Ident&status=Open', method: 'GET' },
  ],
  [
    'getPendingReviewItems with name',
    (a) => a.getPendingReviewItems('Ident' as never, 'Open' as never, 'Max'),
    { url: 'support/pending-reviews/items?type=Ident&status=Open&name=Max', method: 'GET' },
  ],
  ['getMrosList', (a) => a.getMrosList(), { url: 'mros', method: 'GET' }],
  ['getMrosById', (a) => a.getMrosById(4), { url: 'mros/4', method: 'GET' }],
  ['createMros', (a) => a.createMros({ x: 1 } as never), { url: 'mros', method: 'POST', data: { x: 1 } }],
  ['updateMros', (a) => a.updateMros(4, { x: 2 } as never), { url: 'mros/4', method: 'PUT', data: { x: 2 } }],
  ['getRecalls', (a) => a.getRecalls(), { url: 'recall', method: 'GET' }],
  ['getPendingChargebacks', (a) => a.getPendingChargebacks(), { url: 'support/pending-chargebacks', method: 'GET' }],
  ['createRecall', (a) => a.createRecall({ y: 1 } as never), { url: 'recall', method: 'POST', data: { y: 1 } }],
  ['getCallQueues', (a) => a.getCallQueues(), { url: 'support/call-queues', method: 'GET' }],
  [
    'getCallQueueItems',
    (a) => a.getCallQueueItems('ManualCheckPhone' as never),
    { url: 'support/call-queues/ManualCheckPhone/items', method: 'GET' },
  ],
  [
    'createKycLog without attachment',
    (a) => a.createKycLog(7, 'note'),
    { url: 'kyc/admin/log', method: 'POST', data: { type: 'ManualLog', userData: { id: 7 }, comment: 'note' } },
  ],
  [
    'createKycLog with attachment',
    (a) => a.createKycLog(7, 'note', { data: 'data:application/pdf;base64,AA==', name: 'proof.pdf' }),
    {
      url: 'kyc/admin/log',
      method: 'POST',
      data: {
        type: 'ManualLog',
        userData: { id: 7 },
        comment: 'note',
        file: 'data:application/pdf;base64,AA==',
        fileName: 'proof.pdf',
      },
    },
  ],
  [
    'updateKycStep',
    (a) => a.updateKycStep(9, { status: 'Completed' }),
    { url: 'kyc/admin/step/9', method: 'PUT', data: { status: 'Completed' } },
  ],
  [
    'updateUserData',
    (a) => a.updateUserData(7, { phoneCallStatus: 'Completed' }),
    { url: 'userData/7', method: 'PUT', data: { phoneCallStatus: 'Completed' } },
  ],
  [
    'createLimitRequest',
    (a) =>
      a.createLimitRequest(7, {
        author: 'JR',
        name: 'Max',
        message: 'Erbschaft',
        limit: 50000,
        investmentDate: 'Past' as never,
        fundOrigin: 'Inheritance' as never,
        file: 'data:x',
        fileName: 'f.pdf',
      }),
    {
      url: 'support/issue/support?userDataId=7',
      method: 'POST',
      data: {
        type: 'LimitRequest',
        reason: 'Other',
        author: 'JR',
        name: 'Max',
        message: 'Erbschaft',
        file: 'data:x',
        fileName: 'f.pdf',
        limitRequest: { limit: 50000, investmentDate: 'Past', fundOrigin: 'Inheritance', fundOriginText: 'Erbschaft' },
      },
    },
  ],
  [
    'chargebackTransaction',
    (a) => a.chargebackTransaction(3, { z: 1 } as never),
    { url: 'support/transaction/3/refund', method: 'PUT', data: { z: 1 } },
  ],
  [
    'updateBankData',
    (a) => a.updateBankData(8, { approved: true }),
    { url: 'bankData/8', method: 'PUT', data: { approved: true } },
  ],
  ['stopTransaction', (a) => a.stopTransaction(3), { url: 'transaction/admin/3/stop', method: 'POST' }],
  ['resumeTransaction', (a) => a.resumeTransaction(3), { url: 'transaction/admin/3/resume', method: 'POST' }],
  [
    'updateBuyCrypto',
    (a) => a.updateBuyCrypto(3, { comment: 'c' }),
    { url: 'buyCrypto/3', method: 'PUT', data: { comment: 'c' } },
  ],
  [
    'updateBuyFiat',
    (a) => a.updateBuyFiat(3, { comment: 'c' }),
    { url: 'buyFiat/3', method: 'PUT', data: { comment: 'c' } },
  ],
  [
    'resetBuyCryptoReviewAml',
    (a) => a.resetBuyCryptoReviewAml(3, { expectedAmlCheck: 'Pass' as never, expectedAmlReason: null }),
    {
      url: 'buyCrypto/3/amlCheck/reviewReset',
      method: 'PUT',
      data: { expectedAmlCheck: 'Pass', expectedAmlReason: null },
    },
  ],
  ['resetBuyFiatAml', (a) => a.resetBuyFiatAml(3), { url: 'buyFiat/3/amlCheck', method: 'DELETE' }],
  ['listSupportNotes without params', (a) => a.listSupportNotes({}), { url: 'support/note', method: 'GET' }],
  [
    'listSupportNotes with all params',
    (a) => a.listSupportNotes({ search: 'abc', scope: 'Own' as never, userDataId: 7 }),
    { url: 'support/note?search=abc&scope=Own&userDataId=7', method: 'GET' },
  ],
  ['listSupportNoteUsers', (a) => a.listSupportNoteUsers(), { url: 'support/note/users', method: 'GET' }],
  [
    'createSupportNote without options',
    (a) => a.createSupportNote('text'),
    {
      url: 'support/note',
      method: 'POST',
      data: { userDataId: undefined, subject: undefined, content: 'text', department: undefined },
    },
  ],
  [
    'createSupportNote with options',
    (a) => a.createSupportNote('text', { userDataId: 7, subject: 's', department: 'Support' as never }),
    {
      url: 'support/note',
      method: 'POST',
      data: { userDataId: 7, subject: 's', content: 'text', department: 'Support' },
    },
  ],
  [
    'updateSupportNote without options',
    (a) => a.updateSupportNote(2, 'text'),
    { url: 'support/note/2', method: 'PUT', data: { content: 'text', subject: undefined } },
  ],
  [
    'updateSupportNote with subject',
    (a) => a.updateSupportNote(2, 'text', { subject: 's' }),
    { url: 'support/note/2', method: 'PUT', data: { content: 'text', subject: 's' } },
  ],
  ['deleteSupportNote', (a) => a.deleteSupportNote(2), { url: 'support/note/2', method: 'DELETE' }],
];

describe('useCompliance API wrappers', () => {
  beforeEach(() => {
    mockCall.mockReset().mockResolvedValue({});
    mockDownloadFile.mockReset();
    mockDownloadPdfFromString.mockReset();
  });

  it.each(REQUESTS)('%s issues the expected request', async (_name, invoke, expected) => {
    await invoke(api());
    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(lastCall()).toEqual(expected);
  });

  it('search encodes the key and normalises a formatted IBAN', async () => {
    const a = api();
    await a.search('max müller');
    expect(lastCall()).toEqual({ url: 'support?key=max%20m%C3%BCller', method: 'GET' });

    await a.search('CH93 0076 2011 6238 5295 7');
    expect(lastCall()).toEqual({ url: 'support?key=CH9300762011623852957', method: 'GET' });
  });

  it('getTaggedUsers encodes the tag in the URL', async () => {
    await api().getTaggedUsers('a b');
    expect(lastCall()).toEqual({ url: 'support/tag/a%20b', method: 'GET' });
  });

  it('downloads the user files as zip and the check-only variant under a different name', async () => {
    const headers = { 'content-type': 'application/zip' };
    mockCall.mockResolvedValue({ data: 'blob', headers });
    const a = api();

    await a.downloadUserFiles([7, 8]);
    expect(lastCall()).toEqual({
      url: 'userData/download',
      method: 'POST',
      data: { userDataIds: [7, 8] },
      responseType: 'blob',
    });
    expect(mockDownloadFile).toHaveBeenCalledWith('blob', headers, 'DFX_export_20260907.zip');

    await a.checkUserFiles([7]);
    expect(lastCall()).toEqual({
      url: 'userData/download',
      method: 'POST',
      data: { userDataIds: [7], checkOnly: true },
      responseType: 'blob',
    });
    expect(mockDownloadFile).toHaveBeenCalledWith('blob', headers, 'DFX_check_20260907.zip');
  });

  it('downloads the IP-log and transaction PDFs from the returned data', async () => {
    mockCall.mockResolvedValue({ pdfData: 'AA==' });
    const a = api();

    await a.downloadIpLogPdf(7);
    expect(lastCall()).toEqual({ url: 'support/7/ip-log-pdf', method: 'GET' });
    expect(mockDownloadPdfFromString).toHaveBeenCalledWith('AA==', 'DFX_IP_Logs_7_20260907.pdf');

    await a.downloadTransactionPdf(7);
    expect(lastCall()).toEqual({ url: 'support/7/transaction-pdf', method: 'GET' });
    expect(mockDownloadPdfFromString).toHaveBeenCalledWith('AA==', 'DFX_Transactions_7_20260907.pdf');
  });

  it('getKycFile requests the v2 file endpoint with access=View', async () => {
    await api().getKycFile('uid-1', 'View');
    expect(mockCall).toHaveBeenCalledWith({
      url: 'kyc/file/uid-1?access=View',
      method: 'GET',
      version: 'v2',
    });
  });

  it('getKycFile requests the v2 file endpoint with access=Download and encodes the uid', async () => {
    await api().getKycFile('uid/with space', 'Download');
    expect(mockCall).toHaveBeenCalledWith({
      url: `kyc/file/${encodeURIComponent('uid/with space')}?access=Download`,
      method: 'GET',
      version: 'v2',
    });
  });
});

describe('useCompliance().saveCallOutcome branches', () => {
  const buyCrypto = {
    queue: 'ManualCheckPhone',
    userDataId: 7,
    txId: 42,
    sourceType: 'BuyCrypto',
    amlCheck: 'Pass',
    amlReason: 'ManualCheckPhoneFailed',
    buyCryptoResetEligible: true,
  } as never;
  const buyFiat = { ...(buyCrypto as object), sourceType: 'BuyFiat' } as never;

  let urls: string[];

  beforeEach(() => {
    urls = [];
    mockCall.mockReset().mockImplementation(async (cfg: { url: string }) => {
      urls.push(cfg.url);
      return {};
    });
  });

  it('reports the userData step when the account update fails', async () => {
    mockCall.mockImplementationOnce(async () => {
      throw new Error('userData down');
    });
    const res = await api().saveCallOutcome(buyCrypto, CallOutcome.COMPLETED, { signature: 'JR' });
    expect(res).toEqual({ success: false, failedStep: 'userData', completedSteps: [], message: 'userData down' });
  });

  it('sets Pass on the transaction for BuyCrypto and BuyFiat', async () => {
    const a = api();
    await a.saveCallOutcome(buyCrypto, CallOutcome.COMPLETED, { signature: 'JR', amlAction: 'Pass' });
    expect(urls).toContain('buyCrypto/42/amlCheck');

    urls = [];
    await a.saveCallOutcome(buyFiat, CallOutcome.COMPLETED, { signature: 'JR', amlAction: 'Pass' });
    expect(urls).toContain('buyFiat/42/amlCheck');
    expect(mockCall).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'kyc/admin/log' }));
  });

  it('sets Fail with the phone-failed reason for BuyCrypto and BuyFiat', async () => {
    const a = api();
    await a.saveCallOutcome(buyCrypto, CallOutcome.FAILED, { signature: 'JR', amlAction: 'Fail' });
    expect(mockCall).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'buyCrypto/42/amlCheck',
        data: { amlCheck: 'Fail', amlReason: 'ManualCheckPhoneFailed', responsible: 'JR' },
      }),
    );

    await a.saveCallOutcome(buyFiat, CallOutcome.FAILED, { signature: 'JR', amlAction: 'Fail' });
    expect(urls).toContain('buyFiat/42/amlCheck');
  });

  it('resets BuyFiat through the AML delete and refuses an ineligible BuyCrypto reset', async () => {
    const a = api();
    await a.saveCallOutcome(buyFiat, CallOutcome.COMPLETED, { signature: 'JR', amlAction: 'Reset' });
    expect(urls).toContain('buyFiat/42/amlCheck');

    const ineligible = { ...(buyCrypto as object), buyCryptoResetEligible: false } as never;
    const res = await a.saveCallOutcome(ineligible, CallOutcome.COMPLETED, { signature: 'JR', amlAction: 'Reset' });
    expect(res.success).toBe(false);
    expect(res.failedStep).toBe('transaction');
    expect(res.message).toContain('BuyCrypto AML reset is unavailable');

    const noStatus = { ...(buyCrypto as object), amlCheck: undefined } as never;
    const res2 = await a.saveCallOutcome(noStatus, CallOutcome.COMPLETED, { signature: 'JR', amlAction: 'Reset' });
    expect(res2.failedStep).toBe('transaction');
    expect(res2.message).toContain('AML status is missing');
  });

  it('reports the log step when writing the KYC log fails', async () => {
    mockCall.mockImplementation(async (cfg: { url: string }) => {
      if (cfg.url === 'kyc/admin/log') throw 'log down';
      return {};
    });
    const res = await api().saveCallOutcome(buyCrypto, CallOutcome.UNAVAILABLE, { signature: 'JR' });
    expect(res).toEqual({ success: false, failedStep: 'log', completedSteps: ['userData'], message: 'log down' });
  });

  it('resets BuyCrypto with a null expected reason when the transaction carries none', async () => {
    const noReason = { ...(buyCrypto as object), amlReason: undefined } as never;
    await api().saveCallOutcome(noReason, CallOutcome.COMPLETED, { signature: 'JR', amlAction: 'Reset' });
    expect(mockCall).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'buyCrypto/42/amlCheck/reviewReset',
        data: { expectedAmlCheck: 'Pass', expectedAmlReason: null },
      }),
    );
  });
});

describe('useCompliance() limit-request notes', () => {
  const context = { limitRequestId: 11, userDataId: 7 };

  beforeEach(() => {
    mockCall.mockReset().mockResolvedValue({});
  });

  it('decideLimitRequest reports a non-Error failure of the report step as text', async () => {
    mockCall.mockImplementationOnce(async () => {
      throw 'pdf down';
    });
    const res = await api().decideLimitRequest(context, LimitRequestDecision.REJECTED, {
      clerk: 'JR',
      requestedLimit: 1000,
    });
    expect(res).toEqual({ success: false, failedStep: 'report', completedSteps: [], message: 'pdf down' });
  });

  it('fileLimitRequestNote anchors the note to a clerk decision, or to the request otherwise', async () => {
    const a = api();
    const withDecision = await a.fileLimitRequestNote(context, { clerk: ' JR ', decision: 'Rejected', comment: 'no' });
    expect(withDecision).toEqual({ success: true, completedSteps: ['log'] });
    expect(mockCall).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: 'kyc/admin/log',
        data: expect.objectContaining({ comment: expect.stringContaining('limitRequest-decision-Rejected') }),
      }),
    );

    await a.fileLimitRequestNote(context, {
      clerk: 'JR',
      decision: 'Expired',
      attachment: { data: 'd', name: 'n.pdf' },
    });
    expect(mockCall).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          comment: expect.stringContaining('limitRequest-note-11'),
          file: 'd',
          fileName: 'n.pdf',
        }),
      }),
    );
  });

  it('fileLimitRequestNote reports a failed log write, Error or not', async () => {
    const a = api();
    mockCall.mockRejectedValueOnce(new Error('log down'));
    expect(await a.fileLimitRequestNote(context, { clerk: 'JR', decision: 'Rejected' })).toEqual({
      success: false,
      failedStep: 'log',
      completedSteps: [],
      message: 'log down',
    });

    mockCall.mockImplementationOnce(async () => {
      throw 'plain';
    });
    expect((await a.fileLimitRequestNote(context, { clerk: 'JR', decision: 'Rejected' })).message).toBe('plain');
  });
});
