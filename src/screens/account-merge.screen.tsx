import { ApiError, useApi, useAuthContext } from '@dfx.swiss/react';
import { SpinnerSize, StyledButton, StyledLoadingSpinner, StyledVerticalStack } from '@dfx.swiss/react-components';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { JobResponse, JobStatus, isJobResponse, isJobTerminal, pollJobUntilTerminal } from 'src/util/job';

interface MergeRedirect {
  kycHash: string;
  accessToken?: string;
}

// The merge ran as a job and did not end in a usable result. Carries an already user-facing message,
// which is what tells it apart from an ApiError in the catch below.
class MergeJobError extends Error {}

export default function AccountMerge() {
  const { translate } = useSettingsContext();
  const { setAuthToken } = useAuthContext();
  const { navigate } = useNavigation();
  const { call } = useApi();

  const [urlParams, setUrlParams] = useSearchParams();
  const [kycHash, setKycHash] = useState<string>();
  const isCancelled = useRef(false);

  const otp = urlParams.get('otp');

  useEffect(() => {
    // The cleanup below cancels the run; re-arm here so a second invocation on the same instance
    // (StrictMode double-invokes effects) starts a live run instead of one that discards its result.
    isCancelled.current = false;

    if (!otp) {
      navigate('/kyc');
      return;
    }

    urlParams.delete('otp');
    setUrlParams(urlParams);

    mergeAccounts(otp)
      .then(({ kycHash, accessToken }: MergeRedirect) => {
        if (isCancelled.current) return;

        setAuthToken(accessToken);
        setKycHash(kycHash);
      })
      .catch((error: ApiError | MergeJobError) => {
        if (isCancelled.current) return;

        const errorMessage =
          error instanceof MergeJobError
            ? error.message
            : error.statusCode === 400
            ? translate('screens/error', 'Invalid link')
            : error.statusCode === 409
            ? translate('screens/error', 'This address has already been added')
            : error.message;

        navigate({ pathname: '/error', search: `msg=${errorMessage}` });
      });

    return () => {
      isCancelled.current = true;
    };
  }, []);

  function confirmMerge(otp: string): Promise<MergeRedirect | JobResponse> {
    return call<MergeRedirect | JobResponse>({ url: `auth/mail/confirm?code=${otp}`, method: 'GET' });
  }

  async function mergeAccounts(otp: string): Promise<MergeRedirect> {
    const response = await confirmMerge(otp);
    if (!isJobResponse(response)) return response;

    // 202: the merge outran the endpoint's wait window and continues as a job. A ticket that already
    // carries a terminal status is returned unpolled, so this covers that case too.
    //
    // Polled with `token: false`, i.e. deliberately unauthenticated. The job belongs to the merge's
    // master account, while whoever follows the confirmation link is still signed in as the slave —
    // sending that session token makes the API's ownership check reject its own caller with a 404.
    // The uid is the proof of ownership here, the same trust level as the link that created the job.
    const job = await pollJobUntilTerminal(
      response,
      (uid) => call<JobResponse>({ url: `job/${uid}`, method: 'GET', token: false }),
      { isCancelled: () => isCancelled.current },
    );

    if (job.status !== JobStatus.COMPLETE) throw mergeJobError(job);

    // The access token is issued in the HTTP context and never stored in the job, so the result has to
    // come from the merge endpoint itself. The same otp maps to the same job, so this returns the
    // finished merge instead of starting a second one.
    const result = await confirmMerge(otp);
    if (isJobResponse(result)) throw mergeJobError(result);

    return result;
  }

  function mergeJobError(job: JobResponse): MergeJobError {
    // Still running: the job may yet succeed, so this is a "come back later", not a failure.
    if (!isJobTerminal(job.status))
      return new MergeJobError(
        translate('screens/error', 'Adding the address is taking longer than expected. Please try again later.'),
      );

    // Failed carries a generic support hint from the API, DeadLetter a domain reason — both are meant
    // for the user, so they are shown as-is instead of being mapped to a status code.
    return new MergeJobError(job.error ?? translate('screens/error', 'The address could not be added'));
  }

  useLayoutOptions({});

  return (
    <StyledVerticalStack center gap={5} marginY={5}>
      {kycHash ? (
        <>
          <div>
            <h2 className="text-dfxBlue-800">{translate('screens/kyc', 'Wallet address added')}</h2>
            <p className="text-dfxGray-700">{translate('screens/kyc', 'You can now access your account.')}</p>
          </div>

          <StyledButton
            label={translate('screens/kyc', 'My account')}
            onClick={() => navigate(`/account?code=${kycHash}`)}
          />
        </>
      ) : (
        <>
          <StyledLoadingSpinner size={SpinnerSize.LG} />
          <p className="text-dfxGray-700">{translate('screens/kyc', 'Adding the wallet address...')} </p>
        </>
      )}
    </StyledVerticalStack>
  );
}
