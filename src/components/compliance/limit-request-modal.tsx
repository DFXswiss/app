import { ApiError, FundOrigin, InvestmentDate, Limit, Utils, Validations } from '@dfx.swiss/react';
import {
  Form,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { ErrorHint } from 'src/components/error-hint';
import { Modal } from 'src/components/modal';
import { LimitRequestFields } from 'src/components/support-issue/limit-request-fields';
import { DefaultFileTypes } from 'src/config/file-types';
import { useLayoutContext } from 'src/contexts/layout.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useCompliance } from 'src/hooks/compliance.hook';
import { useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';
import { toBase64 } from 'src/util/utils';
import { STAFF_NAME_MISSING, staffNameLoadError } from './staff-identity';

interface LimitRequestModalProps {
  isOpen: boolean;
  userDataId: number;
  defaultName?: string;
  onClose: () => void;
  onCreated?: () => void;
}

interface LimitRequestFormData {
  name: string;
  limit: Limit;
  investmentDate: InvestmentDate;
  fundOrigin: FundOrigin;
  message: string;
  file?: File;
}

export function LimitRequestModal({
  isOpen,
  userDataId,
  defaultName,
  onClose,
  onCreated,
}: LimitRequestModalProps): JSX.Element {
  const { translate, translateError } = useSettingsContext();
  const { rootRef } = useLayoutContext();
  const { createLimitRequest } = useCompliance();
  const { name: author, isLoading: isLoadingAuthor, error: authorError } = useStaffVerifiedName();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<LimitRequestFormData>({
    mode: 'all',
    defaultValues: { name: defaultName },
  });
  const investmentDate = useWatch({ control, name: 'investmentDate' });

  const rules = Utils.createRules({
    name: Validations.Required,
    limit: Validations.Required,
    investmentDate: Validations.Required,
    fundOrigin: Validations.Required,
    message: [Validations.Required, Validations.Custom((message) => message.length <= 4000 || 'message_length')],
    file: [Validations.Custom((file) => (!file || DefaultFileTypes.includes(file.type) ? true : 'file_type'))],
  });

  function handleClose(): void {
    reset({ name: defaultName });
    setError(undefined);
    onClose();
  }

  async function onSubmit(data: LimitRequestFormData): Promise<void> {
    setIsLoading(true);
    setError(undefined);

    if (!author) {
      setError('Signature is required');
      setIsLoading(false);
      return;
    }

    try {
      await createLimitRequest(userDataId, {
        author,
        name: data.name,
        message: data.message,
        limit: data.limit,
        investmentDate: data.investmentDate,
        fundOrigin: data.fundOrigin,
        file: data.file && (await toBase64(data.file)),
        fileName: data.file?.name,
      });
      onCreated?.();
      handleClose();
    } catch (e) {
      setError((e as ApiError).message ?? 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} variant="dialog">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold text-dfxBlue-800 mb-4 text-left">
          {translate('screens/support', 'Limit increase request')}
        </h2>

        <Form
          control={control}
          rules={rules}
          errors={errors}
          onSubmit={handleSubmit(onSubmit)}
          translate={translateError}
        >
          <StyledVerticalStack gap={6} full center>
            <LimitRequestFields
              rootRef={rootRef}
              control={control}
              rules={rules}
              errors={errors}
              investmentDate={investmentDate}
            />

            {error && (
              <div>
                <ErrorHint message={error} />
              </div>
            )}

            <div className="w-full text-left">
              <label className="block text-sm font-medium text-dfxBlue-800 mb-1">Signature</label>
              <p className="w-full px-3 py-2 text-sm text-dfxBlue-800">
                {isLoadingAuthor ? '…' : (author ?? '—')}
              </p>
              {!isLoadingAuthor && !author && (
                <ErrorHint message={authorError ? staffNameLoadError(authorError) : STAFF_NAME_MISSING} />
              )}
            </div>

            <div className="flex gap-2 w-full">
              <StyledButton
                label={translate('general/actions', 'Cancel')}
                onClick={handleClose}
                width={StyledButtonWidth.FULL}
                color={StyledButtonColor.STURDY_WHITE}
                disabled={isLoading}
              />
              <StyledButton
                type="submit"
                label={translate('general/actions', 'Save')}
                onClick={handleSubmit(onSubmit)}
                width={StyledButtonWidth.FULL}
                disabled={!isValid || !author || isLoadingAuthor}
                isLoading={isLoading}
              />
            </div>
          </StyledVerticalStack>
        </Form>
      </div>
    </Modal>
  );
}
