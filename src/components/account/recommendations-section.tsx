import { ApiError, Utils, Validations } from '@dfx.swiss/react';
import {
  AlignContent,
  Form,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledDataTable,
  StyledDataTableExpandableRow,
  StyledDataTableRow,
  StyledInput,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import copy from 'copy-to-clipboard';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ErrorHint } from 'src/components/error-hint';
import { Modal } from 'src/components/modal';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useWindowContext } from 'src/contexts/window.context';
import {
  CreateRecommendation,
  Recommendation,
  RecommendationStatus,
  RecommendationType,
  useRecommendation,
} from '@dfx.swiss/react';
import { blankedAddress, formatSwissDate, partition, url } from 'src/util/utils';

interface RecommendationFormData {
  recommendedAlias: string;
  recommendedMail: string;
}

interface RecommendationsSectionProps {
  showRecommendationModal: boolean;
  setShowRecommendationModal: (show: boolean) => void;
}

export function RecommendationsSection({
  showRecommendationModal,
  setShowRecommendationModal,
}: RecommendationsSectionProps): JSX.Element {
  const { getRecommendations, createRecommendation, confirmRecommendation, rejectRecommendation } = useRecommendation();
  const { width } = useWindowContext();
  const { translate, translateError } = useSettingsContext();

  const [recommendations, setRecommendations] = useState<Recommendation[]>();
  const [isCreatingRecommendation, setIsCreatingRecommendation] = useState(false);
  const [recommendationError, setRecommendationError] = useState<string>();
  const [processingRecommendationId, setProcessingRecommendationId] = useState<number>();
  const [isConfirmingRecommendation, setIsConfirmingRecommendation] = useState(false);

  const [pendingRequests, invitations] = useMemo(
    () =>
      partition(
        recommendations,
        (r) => r.type === RecommendationType.REQUEST && r.status === RecommendationStatus.PENDING,
      ),
    [recommendations],
  );

  const {
    control: recommendationControl,
    formState: { errors: recommendationErrors, isValid: isRecommendationFormValid },
    handleSubmit: handleRecommendationSubmit,
    reset: resetRecommendationForm,
  } = useForm<RecommendationFormData>({ mode: 'onTouched' });

  const recommendationRules = Utils.createRules({
    recommendedAlias: Validations.Required,
    recommendedMail: Validations.Mail,
  });

  useEffect(() => {
    loadRecommendations();
  }, []);

  async function loadRecommendations(): Promise<void> {
    return getRecommendations()
      .then((r) => setRecommendations(r.sort((a, b) => b.id - a.id)))
      .catch(() => {
        // ignore errors
      });
  }

  function openRecommendationModal(): void {
    setRecommendationError(undefined);
    setShowRecommendationModal(true);
  }

  function closeRecommendationModal(): void {
    setShowRecommendationModal(false);
    resetRecommendationForm();
    setRecommendationError(undefined);
  }

  function onRecommendationSubmit(data: CreateRecommendation): void {
    setIsCreatingRecommendation(true);
    setRecommendationError(undefined);

    createRecommendation(data)
      .then(() => {
        resetRecommendationForm();
        closeRecommendationModal();
        return loadRecommendations();
      })
      .catch((error: ApiError) => setRecommendationError(error.message ?? 'Unknown error'))
      .finally(() => setIsCreatingRecommendation(false));
  }

  function handleRecommendationAction(recommendation: Recommendation, confirm: boolean): void {
    setRecommendationError(undefined);
    setProcessingRecommendationId(recommendation.id);
    setIsConfirmingRecommendation(confirm);

    const action = confirm ? confirmRecommendation : rejectRecommendation;

    action(recommendation.id)
      .then(() => loadRecommendations())
      .catch((error: ApiError) => setRecommendationError(error.message ?? 'Unknown error'))
      .finally(() => {
        setProcessingRecommendationId(undefined);
        setIsConfirmingRecommendation(false);
      });
  }

  return (
    <>
      {/* Pending Recommendation Requests */}
      {pendingRequests.length > 0 && (
        <StyledDataTable
          label={translate('screens/recommendation', 'Pending Requests')}
          alignContent={AlignContent.RIGHT}
          showBorder
          minWidth={false}
        >
          {pendingRequests.map((recommendation) => (
            <StyledDataTableRow key={recommendation.id} label={`${recommendation.name} (${recommendation.mail})`}>
              <div className="flex justify-end gap-2">
                <StyledButton
                  width={StyledButtonWidth.MIN}
                  color={StyledButtonColor.WHITE}
                  label={translate('general/actions', 'Confirm')}
                  onClick={() => handleRecommendationAction(recommendation, true)}
                  disabled={processingRecommendationId === recommendation.id}
                  isLoading={processingRecommendationId === recommendation.id && isConfirmingRecommendation}
                  deactivateMargin
                />
                <StyledButton
                  width={StyledButtonWidth.MIN}
                  color={StyledButtonColor.GRAY_OUTLINE}
                  label={translate('general/actions', 'Reject')}
                  onClick={() => handleRecommendationAction(recommendation, false)}
                  disabled={processingRecommendationId === recommendation.id}
                  isLoading={processingRecommendationId === recommendation.id && !isConfirmingRecommendation}
                  deactivateMargin
                />
              </div>
            </StyledDataTableRow>
          ))}
        </StyledDataTable>
      )}

      {/* Invitations List */}
      {invitations.length > 0 && (
        <StyledDataTable
          label={translate('screens/recommendation', 'Your Invitations')}
          alignContent={AlignContent.RIGHT}
          showBorder
          minWidth={false}
        >
          {invitations.map((recommendation) => {
            const items = [];

            if (recommendation.mail)
              items.push({
                label: translate('screens/kyc', 'Email'),
                text: recommendation.mail ?? '',
              });

            if (recommendation.code) {
              const link = url({
                path: 'login',
                params: new URLSearchParams({ 'recommendation-code': recommendation.code }),
              });

              items.push(
                ...[
                  {
                    label: translate('screens/recommendation', 'Code'),
                    text: recommendation.code,
                    onClick: () => copy(recommendation.code ?? ''),
                    isCopy: true,
                  },
                  {
                    label: translate('screens/payment', 'Link'),
                    text: blankedAddress(link, { width }),
                    onClick: () => copy(link),
                    isCopy: true,
                  },
                ],
              );
            }

            if (recommendation.expirationDate) {
              items.push({
                label: translate('screens/payment', 'Expiry date'),
                text: formatSwissDate(recommendation.expirationDate),
              });
            }

            return (
              <StyledDataTableExpandableRow
                key={recommendation.id}
                label={recommendation.name ?? ''}
                expansionItems={items}
              >
                <p>{translate('screens/recommendation', recommendation.status)}</p>
              </StyledDataTableExpandableRow>
            );
          })}
        </StyledDataTable>
      )}

      {recommendationError && <ErrorHint message={recommendationError} />}

      {/* Create Invitation Button */}
      <StyledButton
        width={StyledButtonWidth.FULL}
        color={StyledButtonColor.RED}
        label={translate('screens/recommendation', 'Create Invitation')}
        onClick={openRecommendationModal}
      />

      {/* Create Recommendation Modal */}
      <Modal isOpen={showRecommendationModal} onClose={closeRecommendationModal}>
        <StyledVerticalStack gap={6} full>
          <p className="text-dfxGray-700">{translate('screens/recommendation', 'Who would you like to invite?')}</p>

          <Form
            control={recommendationControl}
            rules={recommendationRules}
            errors={recommendationErrors}
            onSubmit={handleRecommendationSubmit(onRecommendationSubmit)}
            translate={translateError}
          >
            <StyledVerticalStack gap={4} full>
              <StyledInput
                name="recommendedAlias"
                label={translate('screens/kyc', 'Name')}
                placeholder={translate('screens/kyc', 'John Doe')}
                full
              />
              <StyledInput
                name="recommendedMail"
                label={translate('screens/kyc', 'Email')}
                placeholder={translate('screens/kyc', 'example@mail.com')}
                full
              />

              {recommendationError && <ErrorHint message={recommendationError} />}

              <StyledButton
                type="submit"
                width={StyledButtonWidth.FULL}
                color={StyledButtonColor.BLUE}
                label={translate('screens/recommendation', 'Create Invitation')}
                onClick={handleRecommendationSubmit(onRecommendationSubmit)}
                disabled={!isRecommendationFormValid}
                isLoading={isCreatingRecommendation}
              />

              <StyledButton
                label={translate('general/actions', 'Cancel')}
                onClick={closeRecommendationModal}
                width={StyledButtonWidth.FULL}
                color={StyledButtonColor.STURDY_WHITE}
              />
            </StyledVerticalStack>
          </Form>
        </StyledVerticalStack>
      </Modal>
    </>
  );
}
