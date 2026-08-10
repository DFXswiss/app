import { SpinnerSize, StyledLoadingSpinner, StyledVerticalStack } from '@dfx.swiss/react-components';
import { useSettingsContext } from 'src/contexts/settings.context';
import { JobTicket } from 'src/dto/job.dto';

interface JobProgressProps {
  ticket: JobTicket | undefined;
  isOverdue: boolean;
  message: string;
}

export function JobProgress({ ticket, isOverdue, message }: JobProgressProps): JSX.Element {
  const { translate } = useSettingsContext();

  return (
    <StyledVerticalStack center gap={5}>
      <StyledLoadingSpinner size={SpinnerSize.LG} />
      <p className="text-dfxGray-700">{message}</p>
      {ticket && (
        // Visible so support can look up this exact job by its reference number.
        <p className="text-xs text-dfxGray-700">
          {translate('screens/kyc', 'Reference')}: {ticket.uid}
        </p>
      )}
      {isOverdue && (
        <p className="text-dfxGray-700">
          {translate(
            'screens/kyc',
            'This is taking longer than usual. You can safely close this page — we will keep working in the background.',
          )}
        </p>
      )}
    </StyledVerticalStack>
  );
}
