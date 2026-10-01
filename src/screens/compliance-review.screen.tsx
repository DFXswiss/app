import { AmlReason, CheckStatus, KycStatus, UserRole, useAuthContext, useSessionContext } from '@dfx.swiss/react';
import { SpinnerSize, StyledLoadingSpinner } from '@dfx.swiss/react-components';
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ComplianceReviewHeader } from 'src/components/compliance/compliance-review-header';
import {
  ComplianceReviewFreigabePanel,
  ComplianceReviewFreigabeSaveParams,
} from 'src/components/compliance/freigabe-panel';
import { ComplianceReviewPanel } from 'src/components/compliance/compliance-review-panel';
import { ReviewCheckTab, ReviewTabConfig, reviewTabs } from 'src/components/compliance/compliance-review-configs';
import { FilePreviewPanel } from 'src/components/compliance/file-preview-panel';
import { StammdatenPanel } from 'src/components/compliance/stammdaten-panel';
import { BankDataReviewPanel } from 'src/components/compliance/bank-data-panel';
import { AmlCheckPendingPanel, AmlCheckUpdate } from 'src/components/compliance/aml-check-panel';
import { IdentPanel } from 'src/components/compliance/ident-panel';
import { ErrorHint } from 'src/components/error-hint';
import { ComplianceUserData, KycFile, KycStepInfo, TransactionInfo, useCompliance } from 'src/hooks/compliance.hook';
import { useComplianceGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useSplitPane } from 'src/hooks/split-pane.hook';
import { buildKycLogMessage, KycLogResult } from 'src/util/compliance-helpers';
import { hasSameAuthSessionScope, isUnauthorizedApiError } from 'src/util/auth-scope';
import { saveBufferedFile } from 'src/util/utils';

function findLatestStep(kycSteps: KycStepInfo[], stepName: string): KycStepInfo | undefined {
  return kycSteps.filter((s) => s.name === stepName).sort((a, b) => b.sequenceNumber - a.sequenceNumber)[0];
}

function findFiles(kycFiles: KycFile[], fileTypes: string[]): KycFile[] {
  return kycFiles.filter((f) => fileTypes.includes(f.type));
}

interface ScopedReviewData {
  scopeKey: string;
  authToken: string;
  data: ComplianceUserData;
}

interface ScopedReviewPreview {
  scopeKey: string;
  authToken: string;
  url: string;
  contentType: string;
  name: string;
  uid?: string;
}

export default function ComplianceReviewScreen(): JSX.Element {
  useComplianceGuard();

  const { id: userDataId } = useParams();
  const { session, getAuthToken, getAuthTokenSession } = useAuthContext();
  const { isInitialized, isLoggedIn } = useSessionContext();
  const authToken = getAuthToken();
  const requestSession = session;
  const sessionReady =
    isInitialized &&
    isLoggedIn &&
    !!authToken &&
    (session?.role === UserRole.ADMIN || session?.role === UserRole.COMPLIANCE) &&
    Number.isSafeInteger(session?.account) &&
    Number(session?.account) > 0 &&
    Number.isSafeInteger(session?.user) &&
    Number(session?.user) > 0;
  const scopeKey = JSON.stringify([userDataId, session?.account, session?.user, session?.address, session?.role]);
  const scopeGeneration = useRef(0);
  const currentScopeKey = useRef(scopeKey);
  const navigateTo = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTabParam = searchParams.get('tab') as ReviewCheckTab | null;
  const onBack = useCallback(() => navigateTo('/compliance'), [navigateTo]);

  useLayoutOptions({ title: 'KYC Management', backButton: true, noMaxWidth: true, textStart: true, onBack });
  const {
    getUserData,
    setKycStatusCheck,
    updateKycStep,
    updateUserData,
    updateBankData,
    updateBuyCrypto,
    updateBuyFiat,
    resetBuyCryptoReviewAml,
    resetBuyFiatAml,
    generateOnboardingPdf,
    createKycLog,
    getKycFile,
  } = useCompliance();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [loadedData, setLoadedData] = useState<ScopedReviewData>();
  const [activeTab, setActiveTab] = useState<ReviewCheckTab | undefined>(initialTabParam ?? undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [preview, setPreview] = useState<ScopedReviewPreview>();
  const activePreview = preview?.scopeKey === scopeKey && preview.authToken === authToken ? preview : undefined;
  const previewRef = useRef(activePreview);
  previewRef.current = activePreview;
  const data = loadedData?.scopeKey === scopeKey && loadedData.authToken === authToken ? loadedData.data : undefined;
  const getAuthTokenRef = useRef(getAuthToken);
  getAuthTokenRef.current = getAuthToken;
  const getAuthTokenSessionRef = useRef(getAuthTokenSession);
  getAuthTokenSessionRef.current = getAuthTokenSession;
  const requestGeneration = useRef(0);

  useLayoutEffect(() => {
    currentScopeKey.current = scopeKey;
    scopeGeneration.current += 1;
    setIsLoading(true);
    setIsSaving(false);
    setError(undefined);
    setPreview(undefined);
  }, [authToken, scopeKey]);

  const isCurrentAuthScope = useCallback(
    (
      requestScopeKey: string,
      scopedSession: typeof requestSession,
      requestToken: string | undefined,
      requestScopeGeneration: number,
    ): boolean =>
      !!requestToken &&
      scopeGeneration.current === requestScopeGeneration &&
      currentScopeKey.current === requestScopeKey &&
      getAuthTokenRef.current() === requestToken &&
      hasSameAuthSessionScope(getAuthTokenSessionRef.current(), scopedSession),
    [],
  );
  const captureScopeCheck = useCallback(() => {
    const requestScopeKey = scopeKey;
    const scopedSession = requestSession;
    const requestToken = authToken;
    const requestScopeGeneration = scopeGeneration.current;
    return () => isCurrentAuthScope(requestScopeKey, scopedSession, requestToken, requestScopeGeneration);
  }, [authToken, isCurrentAuthScope, requestSession, scopeKey]);
  const captureAuthCheck = useCallback(() => {
    const scopedSession = requestSession;
    const requestToken = authToken;
    // The initial scope check requires a token before any write starts.
    return () =>
      getAuthTokenRef.current() === requestToken &&
      hasSameAuthSessionScope(getAuthTokenSessionRef.current(), scopedSession);
  }, [authToken, requestSession]);

  function reportWriteError(
    message: string,
    scopedUserDataId: number,
    isScopeCurrent: () => boolean,
    isAuthCurrent: () => boolean,
  ): void {
    if (isScopeCurrent()) setError(message);
    else if (isAuthCurrent()) setError(`Customer ${scopedUserDataId}: ${message}`);
  }

  const { containerRef, splitPercent, handleSplitDrag } = useSplitPane();

  const loadData = useCallback(
    async (options?: { throwOnError?: boolean }): Promise<void> => {
      const generation = ++requestGeneration.current;
      const requestScopeKey = scopeKey;
      const scopedSession = requestSession;
      const requestToken = authToken;
      const requestScopeGeneration = scopeGeneration.current;
      const isRequestCurrent = () =>
        requestGeneration.current === generation &&
        isCurrentAuthScope(requestScopeKey, scopedSession, requestToken, requestScopeGeneration);

      if (!userDataId) {
        setError('No ID provided');
        setIsLoading(false);
        return;
      }
      if (!requestToken || !sessionReady || !isRequestCurrent()) return;

      setIsLoading(true);
      setError(undefined);
      try {
        const result = await getUserData(+userDataId);
        if (isRequestCurrent()) setLoadedData({ scopeKey: requestScopeKey, authToken: requestToken, data: result });
      } catch (e: unknown) {
        if (isRequestCurrent()) {
          setLoadedData(undefined);
          setError(e instanceof Error ? e.message : 'Unknown error');
          if (options?.throwOnError) throw e;
        } else if (
          isUnauthorizedApiError(e) &&
          requestGeneration.current === generation &&
          !getAuthTokenRef.current()
        ) {
          setLoadedData(undefined);
        }
      } finally {
        if (isRequestCurrent()) setIsLoading(false);
      }
    },
    [authToken, getUserData, isCurrentAuthScope, requestSession, scopeKey, sessionReady, userDataId],
  );

  useEffect(() => {
    loadData();
  }, [loadData, userDataId]);

  useEffect(() => {
    return () => {
      requestGeneration.current += 1;
    };
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  useEffect(() => {
    return () => {
      requestGeneration.current += 1;
      scopeGeneration.current += 1;
    };
  }, []);

  async function openFile(file: KycFile): Promise<void> {
    const isRequestCurrent = captureScopeCheck();
    if (!authToken || !sessionReady || !isRequestCurrent()) return;
    const requestScopeKey = scopeKey;
    const requestToken = authToken;
    setError(undefined);
    setPreview(undefined);
    try {
      const { content, contentType } = await getKycFile(file.uid, 'View');
      if (!isRequestCurrent()) return;
      if (!content || content.type !== 'Buffer' || !Array.isArray(content.data)) {
        setError('Invalid file type');
        return;
      }
      const blob = new Blob([new Uint8Array(content.data)], { type: contentType });
      const url = URL.createObjectURL(blob);
      setPreview({
        scopeKey: requestScopeKey,
        authToken: requestToken,
        url,
        contentType,
        name: file.name,
        uid: file.uid,
      });
    } catch (e: unknown) {
      if (isRequestCurrent()) setError(e instanceof Error ? e.message : 'Error loading file');
    }
  }

  async function downloadPreview(): Promise<void> {
    const requestPreview = activePreview;
    if (!requestPreview?.uid) return;
    const isRequestCurrent = captureScopeCheck();
    if (!authToken || !sessionReady || requestPreview.authToken !== authToken || !isRequestCurrent()) return;
    const previewAtRequest = requestPreview;
    const isPreviewCurrent = () => isRequestCurrent() && previewAtRequest === previewRef.current;
    setError(undefined);
    try {
      const { content, contentType } = await getKycFile(requestPreview.uid, 'Download');
      if (!isPreviewCurrent()) return;
      if (!content || content.type !== 'Buffer' || !Array.isArray(content.data)) {
        setError('Invalid file type');
        return;
      }
      saveBufferedFile(content, contentType, requestPreview.name);
    } catch (e: unknown) {
      if (isPreviewCurrent()) setError(e instanceof Error ? e.message : 'Error downloading file');
    }
  }

  function deriveAmlAccountType(step: KycStepInfo | undefined): string | undefined {
    if (!step?.result) return undefined;
    try {
      const parsed = JSON.parse(step.result) as Record<string, unknown>;
      if (parsed.isOperational === true) return 'operativ tätige Gesellschaft';
    } catch {
      // ignore parse errors
    }
    return undefined;
  }

  // Route changes only gate UI updates; writes for the captured customer continue under the same authentication.
  async function handleFreigabeSave(params: ComplianceReviewFreigabeSaveParams): Promise<void> {
    const isScopeCurrent = captureScopeCheck();
    const isAuthCurrent = captureAuthCheck();
    const scopedUserDataId = Number(userDataId);
    const requestToken = authToken;
    const requestScopeKey = scopeKey;
    if (!requestToken || !isScopeCurrent()) return;
    setIsSaving(true);
    setError(undefined);
    try {
      // 1. Save KycStep
      await updateKycStep(params.stepId, {
        status: params.status,
        result: params.result,
        comment: params.comment,
      });
      if (!isAuthCurrent()) return;

      const results: KycLogResult[] = [{ table: 'kycStep', column: 'status', value: params.status }];

      // 2. Update UserData if needed
      if (params.userDataUpdate && userDataId) {
        await updateUserData(scopedUserDataId, params.userDataUpdate);
        if (!isAuthCurrent()) return;
        for (const [col, val] of Object.entries(params.userDataUpdate)) {
          if (val == null) continue;
          results.push({ table: 'userData', column: col, value: String(val) });
        }
      }

      // 3. KycLog (Editor = processedBy aus den params, single source of truth)
      const clerk = params.pdfData?.processedBy;
      if (userDataId && clerk) {
        await createKycLog(scopedUserDataId, buildKycLogMessage({ description: 'DfxApproval', clerk, results }));
        if (!isAuthCurrent()) return;
      }

      // 4. Generate PDF if data provided
      if (params.pdfData && userDataId) {
        try {
          const { pdfData, fileName } = await generateOnboardingPdf(scopedUserDataId, params.pdfData);
          if (!isScopeCurrent()) return;

          // Show PDF in preview
          const byteCharacters = atob(pdfData);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          setPreview({
            scopeKey: requestScopeKey,
            authToken: requestToken,
            url,
            contentType: 'application/pdf',
            name: fileName,
          });
        } catch (e) {
          console.error('Failed to generate PDF:', e);
          if (!isScopeCurrent()) {
            reportWriteError(
              e instanceof Error ? e.message : 'Error generating PDF',
              scopedUserDataId,
              isScopeCurrent,
              isAuthCurrent,
            );
          }
        }
      }

      // 5. Reload data (now includes the new PDF)
      if (isScopeCurrent()) await loadData();
    } catch (e: unknown) {
      reportWriteError(e instanceof Error ? e.message : 'Error saving', scopedUserDataId, isScopeCurrent, isAuthCurrent);
    } finally {
      if (isScopeCurrent()) setIsSaving(false);
    }
  }

  async function handleSave(
    stepId: number,
    status: string,
    clerk: string,
    description: string,
    reviewData: ComplianceUserData,
    comment?: string,
    result?: string,
  ): Promise<void> {
    const isScopeCurrent = captureScopeCheck();
    const isAuthCurrent = captureAuthCheck();
    const scopedUserDataId = Number(userDataId);
    if (!isScopeCurrent()) return;
    setIsSaving(true);
    setError(undefined);
    try {
      await updateKycStep(stepId, { status, comment, result });
      if (!isAuthCurrent()) return;

      const results: KycLogResult[] = [{ table: 'kycStep', column: 'status', value: status }];

      if (effectiveTab === 'operationalActivity' && userDataId) {
        const step = findLatestStep(reviewData.kycSteps, 'OperationalActivity');
        const amlAccountType = deriveAmlAccountType(step);
        if (amlAccountType) {
          await updateUserData(scopedUserDataId, { amlAccountType });
          if (!isAuthCurrent()) return;
          results.push({ table: 'userData', column: 'amlAccountType', value: amlAccountType });
        }
      }

      await createKycLog(scopedUserDataId, buildKycLogMessage({ description, clerk, results }));
      if (!isScopeCurrent()) return;

      await loadData();
    } catch (e: unknown) {
      reportWriteError(e instanceof Error ? e.message : 'Error saving', scopedUserDataId, isScopeCurrent, isAuthCurrent);
    } finally {
      if (isScopeCurrent()) setIsSaving(false);
    }
  }

  async function handleBankDataApprove(bankDataId: number, clerk: string): Promise<void> {
    const isScopeCurrent = captureScopeCheck();
    const isAuthCurrent = captureAuthCheck();
    const scopedUserDataId = Number(userDataId);
    if (!isScopeCurrent()) return;
    setIsSaving(true);
    setError(undefined);
    try {
      await updateBankData(bankDataId, { manualApproved: true, approved: true, status: 'Completed' });
      if (!isAuthCurrent()) return;
      await createKycLog(
        scopedUserDataId,
        buildKycLogMessage({
          description: 'BankData',
          clerk,
          results: [
            { table: 'bankData', column: 'approved', value: 'true' },
            { table: 'bankData', column: 'manualApproved', value: 'true' },
            { table: 'bankData', column: 'status', value: 'Completed' },
          ],
        }),
      );
      if (!isScopeCurrent()) return;
      await loadData();
    } catch (e: unknown) {
      reportWriteError(
        e instanceof Error ? e.message : 'Error approving',
        scopedUserDataId,
        isScopeCurrent,
        isAuthCurrent,
      );
    } finally {
      if (isScopeCurrent()) setIsSaving(false);
    }
  }

  async function handleBankDataReject(bankDataId: number, clerk: string): Promise<void> {
    const isScopeCurrent = captureScopeCheck();
    const isAuthCurrent = captureAuthCheck();
    const scopedUserDataId = Number(userDataId);
    if (!isScopeCurrent()) return;
    setIsSaving(true);
    setError(undefined);
    try {
      await updateBankData(bankDataId, { manualApproved: false, approved: false, status: 'Failed' });
      if (!isAuthCurrent()) return;
      await createKycLog(
        scopedUserDataId,
        buildKycLogMessage({
          description: 'BankData',
          clerk,
          results: [
            { table: 'bankData', column: 'approved', value: 'false' },
            { table: 'bankData', column: 'manualApproved', value: 'false' },
            { table: 'bankData', column: 'status', value: 'Failed' },
          ],
        }),
      );
      if (!isScopeCurrent()) return;
      await loadData();
    } catch (e: unknown) {
      reportWriteError(
        e instanceof Error ? e.message : 'Error rejecting',
        scopedUserDataId,
        isScopeCurrent,
        isAuthCurrent,
      );
    } finally {
      if (isScopeCurrent()) setIsSaving(false);
    }
  }

  async function handleSetKycStatusCheck(): Promise<void> {
    const isScopeCurrent = captureScopeCheck();
    const currentKycStatus = data?.userData.kycStatus;
    if (!isScopeCurrent() || !userDataId || !currentKycStatus || currentKycStatus === KycStatus.CHECK) return;

    setIsSaving(true);
    setError(undefined);
    try {
      try {
        await setKycStatusCheck(+userDataId, currentKycStatus as KycStatus);
        if (!isScopeCurrent()) return;
      } catch (e: unknown) {
        if (!isScopeCurrent()) return;
        const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
        setError(`KYC status could not be changed to Check: ${message}`);
        try {
          await loadData({ throwOnError: true });
        } catch (reloadError: unknown) {
          const reloadMessage = reloadError instanceof Error ? reloadError.message : 'Unknown error';
          if (isScopeCurrent()) {
            setError(`KYC status could not be changed to Check: ${message}. Reload failed: ${reloadMessage}`);
          }
        }
        return;
      }

      try {
        await loadData({ throwOnError: true });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        if (isScopeCurrent()) setError(`KYC status was changed to Check, but the data refresh failed: ${message}`);
      }
    } finally {
      if (isScopeCurrent()) setIsSaving(false);
    }
  }

  async function handleAmlUpdate(tx: TransactionInfo, update: AmlCheckUpdate, clerk: string): Promise<void> {
    const isScopeCurrent = captureScopeCheck();
    const isAuthCurrent = captureAuthCheck();
    const scopedUserDataId = Number(userDataId);
    if (!isScopeCurrent()) return;
    setIsSaving(true);
    setError(undefined);
    try {
      const isBc = tx.buyCryptoId != null;
      const table = isBc ? 'buyCrypto' : 'buyFiat';
      if (isBc) await updateBuyCrypto(tx.buyCryptoId as number, update);
      // ManualCheck rows are projected only from a BuyCrypto or BuyFiat relation.
      else await updateBuyFiat(tx.buyFiatId as number, update);
      if (!isAuthCurrent()) return;
      const results: KycLogResult[] = [];
      // The panel disables Save until a status is selected; Reset uses the separate reset callback.
      results.push({ table, column: 'amlCheck', value: update.amlCheck as string });
      if (update.amlReason) results.push({ table, column: 'amlReason', value: update.amlReason });
      if (update.priceDefinitionAllowedDate)
        results.push({ table, column: 'priceDefinitionAllowedDate', value: update.priceDefinitionAllowedDate });
      await createKycLog(scopedUserDataId, buildKycLogMessage({ description: 'AmlCheck', clerk, results }));
      if (!isScopeCurrent()) return;
      await loadData();
    } catch (e: unknown) {
      reportWriteError(e instanceof Error ? e.message : 'Error saving', scopedUserDataId, isScopeCurrent, isAuthCurrent);
    } finally {
      if (isScopeCurrent()) setIsSaving(false);
    }
  }

  async function handleAmlReset(tx: TransactionInfo, clerk: string): Promise<void> {
    const isScopeCurrent = captureScopeCheck();
    const isAuthCurrent = captureAuthCheck();
    const scopedUserDataId = Number(userDataId);
    if (!isScopeCurrent()) return;
    setIsSaving(true);
    setError(undefined);
    const isBc = tx.buyCryptoId != null;
    const table = isBc ? 'buyCrypto' : 'buyFiat';
    try {
      try {
        if (isBc) {
          if (!tx.amlCheck) throw new Error('Current BuyCrypto AML status is missing; reload the transaction');
          await resetBuyCryptoReviewAml(tx.buyCryptoId as number, {
            expectedAmlCheck: tx.amlCheck as CheckStatus,
            expectedAmlReason: (tx.amlReason as AmlReason | undefined) ?? null,
          });
        } else {
          // ManualCheck rows are projected only from a BuyCrypto or BuyFiat relation.
          await resetBuyFiatAml(tx.buyFiatId as number);
        }
        if (!isAuthCurrent()) return;
      } catch (e: unknown) {
        if (!isScopeCurrent()) return;
        const message = e instanceof Error ? e.message : 'Error resetting';
        try {
          await loadData({ throwOnError: true });
          if (isScopeCurrent()) setError(message);
        } catch (reloadError: unknown) {
          const reloadMessage = reloadError instanceof Error ? reloadError.message : 'Unknown error';
          if (isScopeCurrent()) setError(`${message}. Reload failed: ${reloadMessage}`);
        }
        return;
      }

      let logWarning: string | undefined;
      try {
        await createKycLog(
          scopedUserDataId,
          buildKycLogMessage({
            description: 'AmlCheck',
            clerk,
            results: [{ table, column: 'amlCheck', value: 'Reset' }],
          }),
        );
        if (!isScopeCurrent()) return;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        logWarning = `AML check was reset, but the additional KYC log failed: ${message}`;
        if (!isScopeCurrent()) {
          reportWriteError(logWarning, scopedUserDataId, isScopeCurrent, isAuthCurrent);
          return;
        }
      }

      try {
        await loadData({ throwOnError: true });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        if (isScopeCurrent()) {
          setError(`${logWarning ? `${logWarning}. ` : 'AML check was reset, but '}Data refresh failed: ${message}`);
          return;
        }
      }
      if (logWarning) reportWriteError(logWarning, scopedUserDataId, isScopeCurrent, isAuthCurrent);
    } finally {
      if (isScopeCurrent()) setIsSaving(false);
    }
  }

  async function handleAmlReviewReset(tx: TransactionInfo): Promise<void> {
    const isScopeCurrent = captureScopeCheck();
    if (!isScopeCurrent() || tx.buyCryptoId == null || !tx.amlCheck) return;

    setIsSaving(true);
    setError(undefined);
    try {
      try {
        await resetBuyCryptoReviewAml(tx.buyCryptoId, {
          expectedAmlCheck: tx.amlCheck as CheckStatus,
          expectedAmlReason: (tx.amlReason as AmlReason | undefined) ?? null,
        });
        if (!isScopeCurrent()) return;
      } catch (e: unknown) {
        if (!isScopeCurrent()) return;
        const message = e instanceof Error ? e.message : 'Error resetting';
        try {
          await loadData({ throwOnError: true });
          if (isScopeCurrent()) setError(message);
        } catch (reloadError: unknown) {
          const reloadMessage = reloadError instanceof Error ? reloadError.message : 'Unknown error';
          if (isScopeCurrent()) setError(`${message}. Reload failed: ${reloadMessage}`);
        }
        return;
      }

      try {
        await loadData({ throwOnError: true });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        if (isScopeCurrent()) setError(`AML check was reset, but the data refresh failed: ${message}`);
      }
    } finally {
      if (isScopeCurrent()) setIsSaving(false);
    }
  }

  function getTabBadge(tab: ReviewTabConfig, reviewData: ComplianceUserData): JSX.Element | null | undefined {
    if (tab.key === 'bankDataReview') {
      const count = reviewData.bankDatas.filter((b) => b.status === 'ManualReview').length;
      return count > 0 ? (
        <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-dfxBlue-800 text-white">{count}</span>
      ) : null;
    }
    if (tab.key === 'amlPending') {
      const count =
        reviewData.transactions.filter(
          (tx) => tx.type != null && tx.amlCheck === 'Pending' && tx.amlReason === 'ManualCheck',
        ).length;
      return count > 0 ? (
        <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-dfxBlue-800 text-white">{count}</span>
      ) : null;
    }
    if (tab.key === 'stammdaten') {
      const changeSteps = ['NameChange', 'AddressChange'];
      const hasChanges = reviewData.kycSteps.some(
        (s) => changeSteps.includes(s.name) && !['Completed', 'Failed'].includes(s.status),
      );
      return hasChanges ? <span className="ml-1 inline-block w-2 h-2 rounded-full bg-dfxYellow-500" /> : null;
    }
    // KYC step-based tabs
    if (tab.stepName) {
      const step = findLatestStep(reviewData.kycSteps, tab.stepName);
      return step ? (
        <span
          className={`ml-1 inline-block w-2 h-2 rounded-full ${
            step.status === 'Completed'
              ? 'bg-dfxGreen-100'
              : step.status === 'Failed'
                ? 'bg-dfxRed-100'
                : 'bg-dfxYellow-500'
          }`}
        />
      ) : null;
    }
  }

  function getTabColor(tab: ReviewTabConfig, reviewData: ComplianceUserData): string {
    const green = 'bg-dfxGreen-100/20 text-dfxGreen-100 hover:bg-dfxGreen-100/30';
    const red = 'bg-dfxRed-100/20 text-dfxRed-100 hover:bg-dfxRed-100/30';
    const gray = 'bg-dfxGray-300 text-dfxGray-700 hover:bg-dfxGray-400';

    if (tab.key === 'stammdaten') {
      const changeSteps = ['NameChange', 'AddressChange'];
      const steps = reviewData.kycSteps.filter((s) => changeSteps.includes(s.name));
      if (steps.length === 0) return gray;
      if (steps.some((s) => s.status === 'Failed')) return red;
      if (steps.every((s) => s.status === 'Completed')) return green;
      return gray;
    }

    if (tab.key === 'bankDataReview') {
      const entries = reviewData.bankDatas;
      if (entries.some((b) => b.status === 'Failed')) return red;
      const pending = entries.filter((b) => b.status === 'ManualReview');
      if (entries.length > 0 && pending.length === 0) return green;
      return gray;
    }

    if (tab.key === 'amlPending') {
      const txs = reviewData.transactions.filter((tx) => tx.type != null && tx.amlReason === 'ManualCheck');
      if (txs.some((tx) => tx.amlCheck === 'Fail')) return red;
      const hasPending = txs.some((tx) => tx.amlCheck === 'Pending');
      if (txs.length > 0 && !hasPending) return green;
      return gray;
    }

    if (tab.stepName) {
      const step = findLatestStep(reviewData.kycSteps, tab.stepName);
      if (step?.status === 'Completed') return green;
      if (step?.status === 'Failed') return red;
    }

    return gray;
  }

  if (isLoading && !data) return <StyledLoadingSpinner size={SpinnerSize.LG} />;
  if (error && !data) return <ErrorHint message={error} />;
  if (!data) return <ErrorHint message="No data" />;

  const accountType = String(data.userData.accountType ?? '');
  const visibleTabs = reviewTabs.filter((t) => !t.accountTypes || t.accountTypes.includes(accountType));

  const effectiveTab = activeTab && visibleTabs.some((t) => t.key === activeTab) ? activeTab : visibleTabs[0]?.key;
  if (effectiveTab && effectiveTab !== activeTab) setActiveTab(effectiveTab);

  // The universal review tabs guarantee that the selected tab resolves in visibleTabs.
  const activeConfig = visibleTabs.find((t) => t.key === effectiveTab) as ReviewTabConfig;
  const handleCurrentDataSave = (
    stepId: number,
    status: string,
    clerk: string,
    description: string,
    comment?: string,
    result?: string,
  ): Promise<void> => handleSave(stepId, status, clerk, description, data, comment, result);

  return (
    <div className="w-full flex flex-col gap-4">
      {error && <ErrorHint message={error} />}

      <div ref={containerRef} className="flex">
        {/* Left: Header + Tabs */}
        <div style={{ width: `${splitPercent}%` }} className="flex flex-col gap-4 min-w-0 pr-2">
          <ComplianceReviewHeader
            userData={data.userData}
            kycSteps={data.kycSteps}
            isSaving={isSaving}
            onSetKycStatusCheck={handleSetKycStatusCheck}
          />

          {/* Tab Bar */}
          <div className="flex flex-wrap gap-1">
            {visibleTabs.map((tab, index) => {
              const prevTab = index > 0 ? visibleTabs[index - 1] : null;
              // Strong break between the Tx review/admin tabs and the KYC onboarding tabs.
              const showSeparator = prevTab && prevTab.group !== tab.group;

              return (
                <Fragment key={tab.key}>
                  {showSeparator && <div className="w-0.5 bg-dfxBlue-400 mx-4 h-8 self-center" />}
                  <button
                    className={`px-3 py-2 text-xs font-medium rounded-t-lg whitespace-nowrap transition-colors ${
                      effectiveTab === tab.key
                        ? 'bg-white text-dfxBlue-800 border-b-2 border-dfxBlue-800'
                        : getTabColor(tab, data)
                    }`}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                    {getTabBadge(tab, data)}
                  </button>
                </Fragment>
              );
            })}
          </div>

          {/* Active Panel */}
          {effectiveTab === 'freigabe' ? (
            <ComplianceReviewFreigabePanel
              step={findLatestStep(data.kycSteps, 'DfxApproval')}
              userData={data.userData}
              kycSteps={data.kycSteps}
              kycFiles={data.kycFiles ?? []}
              onOpenFile={openFile}
              onSave={handleFreigabeSave}
              isSaving={isSaving}
            />
          ) : effectiveTab === 'stammdaten' ? (
            <StammdatenPanel
              data={data}
              onOpenFile={openFile}
              onSave={handleCurrentDataSave}
              isSaving={isSaving}
            />
          ) : effectiveTab === 'ident' ? (
            <IdentPanel data={data} onOpenFile={openFile} onSave={handleCurrentDataSave} isSaving={isSaving} />
          ) : effectiveTab === 'bankDataReview' ? (
            <BankDataReviewPanel
              bankDatas={data.bankDatas}
              userData={data.userData}
              onApprove={handleBankDataApprove}
              onReject={handleBankDataReject}
              isSaving={isSaving}
            />
          ) : effectiveTab === 'amlPending' ? (
            <AmlCheckPendingPanel
              data={data}
              isSaving={isSaving}
              onUpdate={handleAmlUpdate}
              onReset={handleAmlReset}
              onReviewReset={handleAmlReviewReset}
              onRefUserKycCleared={loadData}
            />
          ) : (
            <ComplianceReviewPanel
              step={findLatestStep(data.kycSteps, activeConfig.stepName)}
              files={findFiles(data.kycFiles ?? [], activeConfig.fileTypes)}
              allFiles={data.kycFiles ?? []}
              checkItems={activeConfig.checkItems}
              showResult={activeConfig.showResult}
              decisionLabel={activeConfig.decisionLabel}
              rejectionReasons={activeConfig.rejectionReasons}
              userData={data.userData}
              kycSteps={data.kycSteps}
              onOpenFile={openFile}
              onSave={handleCurrentDataSave}
              isSaving={isSaving}
            />
          )}
        </div>

        {/* Draggable Splitter */}
        <div className="w-1.5 cursor-col-resize flex-shrink-0 group flex items-stretch" onMouseDown={handleSplitDrag}>
          <div className="w-0.5 mx-auto bg-dfxGray-400 group-hover:bg-dfxBlue-400 transition-colors rounded-full" />
        </div>

        {/* Right: File Preview */}
        <div style={{ width: `${100 - splitPercent}%` }} className="min-w-0 sticky top-4 self-start pl-2">
          <FilePreviewPanel
            preview={activePreview}
            label="File Preview"
            onClose={() => setPreview(undefined)}
            onDownload={downloadPreview}
          />
        </div>
      </div>
    </div>
  );
}
