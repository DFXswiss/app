import { StyledButton, StyledButtonColor } from '@dfx.swiss/react-components';
import { useSettingsContext } from '../contexts/settings.context';
import { useReportDisplayedError } from '../hooks/report-displayed-error.hook';
import { findKnownRejection, KnownRejectionType } from '../util/known-rejections';

export function ErrorHint({ message, onBack }: { message: string; onBack?: () => void }): JSX.Element {
  const knownRejection = findKnownRejection(message);
  useReportDisplayedError(message, knownRejection && KnownRejectionType);
  const { translate } = useSettingsContext();

  return (
    <div>
      {knownRejection ? (
        <p className="text-dfxRed-100">{translate('general/errors', knownRejection.hint)}</p>
      ) : (
        <>
          <p className="text-dfxRed-100">
            {translate(
              'general/errors',
              'Something went wrong. Please try again. If the issue persists please reach out to our support.',
            )}
          </p>
          <p className="text-dfxGray-800 text-sm">{message}</p>
        </>
      )}
      {onBack && (
        <div className="flex justify-center">
          <StyledButton
            className="mt-4"
            label={translate('general/actions', 'Back')}
            color={StyledButtonColor.GRAY_OUTLINE}
            onClick={onBack}
          />
        </div>
      )}
    </div>
  );
}
