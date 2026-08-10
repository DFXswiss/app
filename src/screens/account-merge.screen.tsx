import { ApiError, useApi, useAuthContext } from '@dfx.swiss/react';
import { StyledButton, StyledVerticalStack } from '@dfx.swiss/react-components';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { JobProgress } from 'src/components/job/job-progress';
import { useSettingsContext } from 'src/contexts/settings.context';
import { JOB_TRACKER_TIMEOUT_ERROR, useJobTracker } from 'src/hooks/job.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';

interface MergeRedirect {
  kycHash: string;
  accessToken?: string;
}

export default function AccountMerge() {
  const { translate } = useSettingsContext();
  const { setAuthToken } = useAuthContext();
  const { navigate } = useNavigation();
  const { call } = useApi();

  const [urlParams, setUrlParams] = useSearchParams();
  const [kycHash, setKycHash] = useState<string>();

  const otp = urlParams.get('otp');
  // Capture once: deleting otp from the URL below re-renders and would rebuild the
  // fetch closure with code=null, so every subsequent poll would send a null code.
  const otpRef = useRef(otp);

  const { result, ticket, isOverdue, error, start } = useJobTracker<MergeRedirect>(() =>
    call<MergeRedirect>({ url: `auth/mail/confirm?code=${otpRef.current}`, method: 'GET' }).catch((e: ApiError) => {
      // Pre-translate the two known, non-retryable outcomes so the job hook (which stays
      // translation-agnostic) can just forward `message` verbatim as the terminal error.
      if (e.statusCode === 400) e.message = translate('screens/error', 'Invalid link');
      else if (e.statusCode === 409) e.message = translate('screens/error', 'Merge is already completed');
      throw e;
    }),
  );

  useEffect(() => {
    if (otp) {
      urlParams.delete('otp');
      setUrlParams(urlParams);
      start();
    } else {
      navigate('/kyc');
    }
  }, []);

  useEffect(() => {
    if (result) {
      setAuthToken(result.accessToken);
      setKycHash(result.kycHash);
    }
  }, [result]);

  useEffect(() => {
    if (!error) return;

    const errorMessage =
      error === JOB_TRACKER_TIMEOUT_ERROR
        ? ticket
          ? translate(
              'screens/kyc',
              'This is taking longer than expected. Please contact support and reference {{reference}}.',
              { reference: ticket.uid },
            )
          : error
        : error;

    navigate({ pathname: '/error', search: `msg=${errorMessage}` });
  }, [error]);

  useLayoutOptions({});

  return (
    <StyledVerticalStack center gap={5} marginY={5}>
      {kycHash ? (
        <>
          <div>
            <h2 className="text-dfxBlue-800">{translate('screens/kyc', 'Account merged successfully!')}</h2>
            <p className="text-dfxGray-700">{translate('screens/kyc', 'You can now access your account.')}</p>
          </div>

          <StyledButton
            label={translate('screens/kyc', 'My account')}
            onClick={() => navigate(`/account?code=${kycHash}`)}
          />
        </>
      ) : (
        <JobProgress
          ticket={ticket}
          isOverdue={isOverdue}
          message={translate('screens/kyc', 'Merging your accounts...')}
        />
      )}
    </StyledVerticalStack>
  );
}
