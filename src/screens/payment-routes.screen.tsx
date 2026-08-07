import {
  ApiError,
  Blockchain,
  Country,
  Fiat,
  MinCompletionStatus,
  PaymentLink,
  PaymentLinkMode,
  PaymentLinkPaymentMode,
  PaymentLinkPaymentStatus,
  PaymentLinkStatus,
  PaymentRouteType,
  PaymentStandardType,
  SellRoute,
  usePaymentRoutes,
  usePaymentRoutesContext,
  useUserContext,
  Utils,
  Validations,
} from '@dfx.swiss/react';
import {
  AlignContent,
  CopyButton,
  DfxIcon,
  Form,
  IconSize,
  IconVariant,
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledCollapsible,
  StyledDataTable,
  StyledDataTableExpandableRow,
  StyledDataTableRow,
  StyledDateAndTimePicker,
  StyledDropdown,
  StyledDropdownMultiChoice,
  StyledHorizontalStack,
  StyledIconButton,
  StyledInput,
  StyledLoadingSpinner,
  StyledSearchDropdown,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import copy from 'copy-to-clipboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Trans } from 'react-i18next';
import { ConfirmationOverlay } from 'src/components/overlay/confirmation-overlay';
import { EditOverlay } from 'src/components/overlay/edit-overlay';
import { QrBasic } from 'src/components/payment/qr-code';
import { PaymentQuoteStatusLabels } from 'src/config/labels';
import { useLayoutContext } from 'src/contexts/layout.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { useWalletContext } from 'src/contexts/wallet.context';
import { useWindowContext } from 'src/contexts/window.context';
import { useBlockchain } from 'src/hooks/blockchain.hook';
import { useAddressGuard } from 'src/hooks/guard.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { useNavigation } from 'src/hooks/navigation.hook';
import { Lnurl } from 'src/util/lnurl';
import { blankedAddress, formatLocationAddress, isEmpty, removeNullFields, url } from 'src/util/utils';
import { ErrorHint } from '../components/error-hint';
import { StyledLinkButton } from '../components/styled-link-button';

interface FormData {
  routeId: RouteIdSelectData;
  externalId: string;
  label: string;
  recipientName: string;
  recipientStreet: string;
  recipientHouseNumber: string;
  recipientZip: string;
  recipientCity: string;
  recipientCountry: Country;
  recipientPhone: string;
  recipientEmail: string;
  recipientWebsite: string;
  configStandards: PaymentStandardType[];
  configMinCompletionStatus: MinCompletionStatus;
  configDisplayQr: boolean;
  configPaymentTimeout: number;
  configCancellable: boolean;
  paymentMode: PaymentLinkPaymentMode;
  paymentAmount: string;
  paymentExternalId: string;
  paymentExpiryDate: Date;
}

interface RouteIdSelectData {
  id: string;
  description: string;
}

interface DeletePaymentRoute {
  id: number;
  type: PaymentRouteType;
}

export default function PaymentRoutesScreen(): JSX.Element {
  const { navigate } = useNavigation();
  const { translate } = useSettingsContext();
  const { toString } = useBlockchain();
  const { width } = useWindowContext();
  const { isInitialized } = useWalletContext();
  const { user, isUserLoading } = useUserContext();
  const {
    paymentRoutes,
    paymentLinks,
    paymentRoutesLoading,
    paymentLinksLoading,
    userPaymentLinksConfig,
    userPaymentLinksConfigLoading,
    updatePaymentLink,
    updateUserPaymentLinksConfig,
    cancelPaymentLinkPayment,
    deletePaymentRoute,
    error: apiError,
  } = usePaymentRoutesContext();
  const { createPosLink } = usePaymentRoutes();
  const paymentLinkRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [error, setError] = useState<string>();
  const [deleteRoute, setDeleteRoute] = useState<DeletePaymentRoute>();
  const [isDeletingRoute, setIsDeletingRoute] = useState<string[]>([]);
  const [isUpdatingPaymentLink, setIsUpdatingPaymentLink] = useState<string[]>([]);
  const [expandedPaymentLinkId, setExpandedPaymentLinkId] = useState<string>();
  const [showPaymentLinkForm, setShowPaymentLinkForm] = useState<PaymentLinkFormState>();
  const [updateGlobalConfig, setUpdateGlobalConfig] = useState<boolean>(false);
  const [updatePaymentLinkLabel, setUpdatePaymentLinkLabel] = useState<string>();
  const [isLoadingPos, setIsLoadingPos] = useState<string>();
  const [posUrls, setPosUrls] = useState<Record<string, string>>({});

  useAddressGuard('/login');

  async function togglePaymentLinkStatus(id: string, status: PaymentLinkStatus) {
    setIsUpdatingPaymentLink((prev) => [...prev, id]);
    updatePaymentLink({ status }, id).finally(() => {
      setIsUpdatingPaymentLink((prev) => prev.filter((i) => i !== id));
    });
  }

  async function togglePaymentLinkMode(id: string, mode: PaymentLinkMode) {
    setIsUpdatingPaymentLink((prev) => [...prev, id]);
    updatePaymentLink({ mode }, id).finally(() => {
      setIsUpdatingPaymentLink((prev) => prev.filter((i) => i !== id));
    });
  }

  async function onDeleteRoute(result: boolean) {
    if (result && deleteRoute) {
      const { id, type } = deleteRoute;
      setIsDeletingRoute((prev) => [...prev, routeKey(id, type)]);
      deletePaymentRoute(id, type).finally(() => {
        setIsDeletingRoute((prev) => prev.filter((i) => i !== routeKey(id, type)));
      });
    }

    setDeleteRoute(undefined);
  }

  async function cancelPayment(id: string) {
    setIsUpdatingPaymentLink((prev) => [...prev, id]);
    cancelPaymentLinkPayment(id).finally(() => {
      setIsUpdatingPaymentLink((prev) => prev.filter((i) => i !== id));
    });
  }

  async function updatePaymentLinksConfig(data: any) {
    await updateUserPaymentLinksConfig(data.config).catch((e: ApiError) => setError(e.message ?? 'Unknown error'));
  }

  async function renamePaymentLink(id: string, label: string) {
    await updatePaymentLink({ label }, id);
    setUpdatePaymentLinkLabel(undefined);
    scrollIntoView(id);
  }

  function onCloseForm(id?: string) {
    setShowPaymentLinkForm(undefined);
    scrollIntoView(id);
  }

  function scrollIntoView(id?: string) {
    const scrollToId = id ?? paymentLinks?.at(-1)?.id;
    if (!scrollToId) return;

    setTimeout(() => {
      const element = paymentLinkRefs.current[scrollToId];
      if (element) element.scrollIntoView({ behavior: 'smooth' });
    }, 100);

    setExpandedPaymentLinkId(scrollToId);
  }

  function routeKey(id: number, type: PaymentRouteType): string {
    return `${type}/${id}`;
  }

  function downloadQrCode(link: PaymentLink) {
    const qrCodeContainer = document.getElementById(`qr-code-${link.id}`);
    const qrCodeSvg = qrCodeContainer?.querySelector('svg');
    if (!qrCodeSvg) return;

    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1000;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    img.onload = () => {
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      const filename = `${user?.accountId}_${link.externalId || link.id}`.replace(' ', '_').toLowerCase();
      a.download = filename;
      a.href = dataUrl;
      a.click();
    };

    let svgData = new XMLSerializer().serializeToString(qrCodeSvg);
    svgData = svgData.replace(/#072440/g, '#000000');
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  }

  function downloadSticker({ routeId, externalId }: PaymentLink) {
    const params = new URLSearchParams();
    params.append('route', routeId);
    if (externalId) params.append('externalIds', externalId);
    window.open(url({ path: '/stickers', params }), '_blank');
  }

  async function fetchPosUrl(linkId: string) {
    if (posUrls[linkId] || isLoadingPos === linkId) return; // Already fetched

    setIsLoadingPos(linkId);
    try {
      const { url } = await createPosLink(linkId);
      setPosUrls((prev) => ({ ...prev, [linkId]: url }));
    } catch (error) {
      console.error('Failed to fetch POS URL:', error);
    } finally {
      setIsLoadingPos(undefined);
    }
  }

  const hasRoutes =
    paymentRoutes && Boolean(paymentRoutes?.buy.length || paymentRoutes?.sell.length || paymentRoutes?.swap.length);

  const title = updateGlobalConfig
    ? 'Default configuration'
    : showPaymentLinkForm
    ? `Payment Link: ${translate('screens/payment', PaymentLinkFormStepToTitle[showPaymentLinkForm.step])}`
    : deleteRoute
    ? 'Delete payment route?'
    : 'Payment routes';

  const onBack = updateGlobalConfig
    ? () => setUpdateGlobalConfig(false)
    : showPaymentLinkForm
    ? () =>
        setShowPaymentLinkForm((prev) =>
          prev && prev.step > 0 && !prev.paymentLinkId ? { ...prev, step: prev.step - 1 } : undefined,
        )
    : deleteRoute
    ? () => setDeleteRoute(undefined)
    : undefined;

  useLayoutOptions({ title: translate('screens/payment', title), onBack, textStart: true });

  return (
    <>
      {(apiError && apiError !== 'permission denied') || error ? (
        <ErrorHint message={apiError ?? error ?? ''} />
      ) : userPaymentLinksConfigLoading || isUserLoading || !isInitialized ? (
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      ) : updateGlobalConfig ? (
        <PaymentLinkForm
          state={{
            step: PaymentLinkFormStep.CONFIG,
            paymentLinkId: undefined,
          }}
          onClose={() => setUpdateGlobalConfig(false)}
          onSubmit={async (data) => {
            await updatePaymentLinksConfig(data);
            setUpdateGlobalConfig(false);
          }}
        />
      ) : showPaymentLinkForm ? (
        <PaymentLinkForm
          state={showPaymentLinkForm}
          setStep={(step) => setShowPaymentLinkForm((prev) => ({ ...prev, step }))}
          onClose={onCloseForm}
        />
      ) : updatePaymentLinkLabel ? (
        <EditOverlay
          label={translate('screens/settings', 'Label')}
          autocomplete="label"
          prefill={paymentLinks?.find((link) => link.id === updatePaymentLinkLabel)?.label}
          placeholder={translate('screens/settings', 'Label')}
          onCancel={() => {
            setUpdatePaymentLinkLabel(undefined);
            scrollIntoView(updatePaymentLinkLabel);
          }}
          onEdit={async (result) => await renamePaymentLink(updatePaymentLinkLabel, result)}
        />
      ) : deleteRoute ? (
        <ConfirmationOverlay
          messageContent={
            <p className="text-dfxBlue-800 mb-2 text-center">
              <Trans
                i18nKey="screens/payment.delete"
                values={{ type: deleteRoute.type.toUpperCase(), id: deleteRoute.id }}
              >
                Are you sure you want to delete your <strong>{deleteRoute.type.toUpperCase()} route</strong> with{' '}
                <strong>ID {deleteRoute.id.toString()}</strong>?
              </Trans>
            </p>
          }
          cancelLabel={translate('general/actions', 'Cancel')}
          confirmLabel={translate('general/actions', 'Delete')}
          onCancel={() => onDeleteRoute(false)}
          onConfirm={() => onDeleteRoute(true)}
        />
      ) : (paymentRoutesLoading || paymentLinksLoading) && !(isUpdatingPaymentLink.length || isDeletingRoute.length) ? (
        <StyledLoadingSpinner size={SpinnerSize.LG} />
      ) : hasRoutes === false ? (
        <p className="text-dfxGray-700">{translate('screens/payment', 'You have no payment routes yet')}</p>
      ) : (
        <StyledVerticalStack full gap={5}>
          {paymentRoutes?.buy.length ? (
            <StyledVerticalStack gap={2} full>
              <h2 className="ml-3.5 mb-1.5 text-dfxGray-700">{translate('screens/payment', 'Buy')}</h2>
              {paymentRoutes?.buy.map<JSX.Element>((route) => (
                <div key={route.id}>
                  <RouteComponent
                    title={`${translate('screens/payment', 'Route')} ${route.id}`}
                    subTitle={`${route.asset.blockchain} / ${route.asset.name}`}
                    adjacentText={translate('screens/payment', route.bankUsage)}
                    items={[
                      { label: translate('screens/payment', 'ID'), text: route.id.toString() },
                      { label: translate('screens/payment', 'Asset'), text: route.asset.name },
                      { label: translate('screens/home', 'Blockchain'), text: route.asset.blockchain },
                      { label: translate('screens/payment', 'Purpose of payment'), text: route.bankUsage, copy: true },
                      { label: translate('screens/home', 'Volume'), text: `${route.volume} CHF` },
                      { label: translate('screens/payment', 'Annual volume'), text: `${route.annualVolume} CHF` },
                    ]}
                    deleteRoute={() => setDeleteRoute({ id: route.id, type: 'buy' })}
                    isDeletingRoute={isDeletingRoute.includes(routeKey(route.id, 'buy'))}
                  />
                </div>
              ))}
            </StyledVerticalStack>
          ) : (
            <></>
          )}
          {paymentRoutes?.sell.length ? (
            <StyledVerticalStack gap={2} full>
              <h2 className="ml-3.5 mb-1.5 text-dfxGray-700">{translate('screens/payment', 'Sell')}</h2>
              {paymentRoutes?.sell.map<JSX.Element>((route) => (
                <div key={route.id}>
                  <RouteComponent
                    title={`${translate('screens/payment', 'Route')} ${route.id}`}
                    subTitle={`${route.currency.name} / ${route.iban}`}
                    adjacentText={route.deposit.blockchains.map(toString).join(', ')}
                    items={[
                      { label: translate('screens/payment', 'ID'), text: route.id.toString() },
                      { label: translate('screens/payment', 'Currency'), text: route.currency.name },
                      { label: translate('screens/payment', 'IBAN'), text: route.iban },
                      {
                        label: translate('screens/payment', 'Deposit address'),
                        text: blankedAddress(route.deposit.address, { width: width && width * 0.8 }),
                      },
                      {
                        label: translate('screens/payment', 'Deposit blockchains'),
                        text: route.deposit.blockchains.map(toString).join(', '),
                      },
                      { label: translate('screens/home', 'Volume'), text: `${route.volume} CHF` },
                      { label: translate('screens/payment', 'Annual volume'), text: `${route.annualVolume} CHF` },
                    ]}
                    deleteRoute={() => setDeleteRoute({ id: route.id, type: 'sell' })}
                    isDeletingRoute={isDeletingRoute.includes(routeKey(route.id, 'sell'))}
                  />
                </div>
              ))}
            </StyledVerticalStack>
          ) : (
            <></>
          )}
          {paymentRoutes?.swap.length ? (
            <StyledVerticalStack gap={2} full>
              <h2 className="ml-3.5 mb-1.5 text-dfxGray-700">{translate('screens/payment', 'Swap')}</h2>
              {paymentRoutes?.swap.map<JSX.Element>((route) => (
                <div key={route.id}>
                  <RouteComponent
                    title={`${translate('screens/payment', 'Route')} ${route.id}`}
                    subTitle={`${route.asset.blockchain} / ${route.asset.name}`}
                    adjacentText={route.deposit.blockchains.map(toString).join(', ')}
                    items={[
                      { label: translate('screens/payment', 'ID'), text: route.id.toString() },
                      { label: translate('screens/payment', 'Asset'), text: route.asset.name },
                      { label: translate('screens/home', 'Blockchain'), text: route.asset.blockchain },
                      {
                        label: translate('screens/payment', 'Deposit address'),
                        text: blankedAddress(route.deposit.address, { width: width && width * 0.8 }),
                      },
                      {
                        label: translate('screens/payment', 'Deposit blockchains'),
                        text: route.deposit.blockchains.map(toString).join(', '),
                      },
                      { label: translate('screens/home', 'Volume'), text: `${route.volume} CHF` },
                      { label: translate('screens/payment', 'Annual volume'), text: `${route.annualVolume} CHF` },
                    ]}
                    deleteRoute={() => setDeleteRoute({ id: route.id, type: 'swap' })}
                    isDeletingRoute={isDeletingRoute.includes(routeKey(route.id, 'swap'))}
                  />
                </div>
              ))}
            </StyledVerticalStack>
          ) : (
            <></>
          )}
          {paymentLinks?.length ? (
            <StyledVerticalStack gap={2} full>
              <h2 className="ml-3.5 mb-1.5 text-dfxGray-700">{translate('screens/payment', 'Payment Links')}</h2>
              <StyledDataTable alignContent={AlignContent.RIGHT}>
                <StyledDataTableExpandableRow
                  label={translate('screens/payment', 'Default configuration')}
                  expansionItems={
                    [
                      {
                        label: translate('screens/payment', 'Payment standards'),
                        text: userPaymentLinksConfig?.standards?.join(', '),
                      },
                      {
                        label: translate('screens/payment', 'Min. completion status'),
                        text:
                          userPaymentLinksConfig?.minCompletionStatus &&
                          translate(
                            'screens/payment',
                            PaymentQuoteStatusLabels[userPaymentLinksConfig.minCompletionStatus],
                          ),
                      },
                      {
                        label: translate('screens/payment', 'Always show QR code'),
                        text: translate('general/actions', userPaymentLinksConfig?.displayQr ? 'Yes' : 'No'),
                      },
                      {
                        label: translate('screens/payment', 'Fee'),
                        text: userPaymentLinksConfig?.fee?.toString(),
                      },
                      {
                        label: translate('screens/payment', 'Payment timeout (seconds)'),
                        text: userPaymentLinksConfig?.paymentTimeout?.toString(),
                      },
                      {
                        label: translate('screens/payment', 'Payment cancellable'),
                        text: translate('general/actions', userPaymentLinksConfig?.cancellable ? 'Yes' : 'No'),
                      },
                    ].filter((item) => item.text) as any
                  }
                  expansionContent={
                    <StyledButton
                      label={translate('screens/payment', 'Edit configuration')}
                      onClick={() => setUpdateGlobalConfig(true)}
                      color={StyledButtonColor.STURDY_WHITE}
                      width={StyledButtonWidth.FULL}
                    />
                  }
                  isLoading={userPaymentLinksConfigLoading}
                />
              </StyledDataTable>
              {paymentLinks.map((link) => {
                const linkConfig = { ...userPaymentLinksConfig, ...removeNullFields(link.config) };

                return (
                  <div key={link.id} ref={(el) => paymentLinkRefs.current && (paymentLinkRefs.current[link.id] = el)}>
                    <StyledCollapsible
                      full
                      isExpanded={expandedPaymentLinkId ? expandedPaymentLinkId === link.id : undefined}
                      titleContent={
                        <div className="flex flex-row justify-between gap-2 items-center">
                          <div className="flex flex-col items-start text-left">
                            <div className="font-bold leading-none">
                              {link.label ??
                                link.externalId ??
                                `${translate('screens/payment', 'Payment Link')} ${link.id}`}
                            </div>
                            <div className="leading-none mt-1 text-dfxGray-700">
                              {`${translate('screens/payment', 'Payment route')} ${link.routeId}`}
                            </div>
                          </div>
                          <div>{translate('screens/payment', link.status)}</div>
                        </div>
                      }
                    >
                      <StyledVerticalStack full gap={4}>
                        <StyledDataTable alignContent={AlignContent.RIGHT} showBorder minWidth={false}>
                          <StyledDataTableRow label={translate('screens/payment', 'ID')}>
                            <p>{link.id}</p>
                          </StyledDataTableRow>
                          {link.externalId && (
                            <StyledDataTableRow label={translate('screens/payment', 'External ID')}>
                              <p>{link.externalId}</p>
                            </StyledDataTableRow>
                          )}
                          <StyledDataTableRow label={translate('screens/settings', 'Label')}>
                            <button
                              className="flex flex-row gap-2.5"
                              onClick={() => setUpdatePaymentLinkLabel(link.id)}
                            >
                              <p>{link.label ?? translate('screens/payment', 'N/A')}</p>
                              <DfxIcon icon={IconVariant.EDIT} size={IconSize.SM} />
                            </button>
                          </StyledDataTableRow>
                          <StyledDataTableRow label={translate('screens/payment', 'Payment route')}>
                            <p>{link.routeId}</p>
                          </StyledDataTableRow>
                          <StyledDataTableRow label={translate('screens/payment', 'State')}>
                            <p>{translate('screens/payment', link.status)}</p>
                          </StyledDataTableRow>
                          <StyledDataTableRow label={translate('screens/payment', 'Public')}>
                            <p>{translate('general/actions', link.mode === PaymentLinkMode.PUBLIC ? 'Yes' : 'No')}</p>
                            <StyledIconButton
                              onClick={() =>
                                togglePaymentLinkMode(
                                  link.id,
                                  link.mode === PaymentLinkMode.PUBLIC
                                    ? PaymentLinkMode.MULTIPLE
                                    : PaymentLinkMode.PUBLIC,
                                )
                              }
                              icon={IconVariant.SWAP}
                              isLoading={isUpdatingPaymentLink.includes(link.id)}
                            />
                          </StyledDataTableRow>
                          <StyledDataTableExpandableRow
                            label="LNURL"
                            expansionItems={[
                              {
                                label: translate('screens/payment', 'Link'),
                                text: blankedAddress(Lnurl.prependLnurl(link.lnurl), { width }),
                                onClick: () => copy(Lnurl.prependLnurl(link.lnurl)),
                                isCopy: true,
                              },
                              {
                                label: 'LNURL',
                                text: blankedAddress(link.lnurl, { width, scale: 0.8 }),
                                onClick: () => copy(link.lnurl),
                                isCopy: true,
                              },
                              {
                                label: translate('screens/payment', 'LNURL decoded'),
                                text: blankedAddress(link.url, { width }),
                                onClick: () => copy(link.url),
                                isCopy: true,
                              },
                            ]}
                          >
                            <p className="text-right overflow-ellipsis">
                              {blankedAddress(link.lnurl, { width, scale: 0.8 })}
                            </p>
                          </StyledDataTableExpandableRow>
                          {link.recipient && (
                            <StyledDataTableExpandableRow
                              label={translate('screens/payment', 'Recipient')}
                              expansionItems={
                                [
                                  { label: translate('screens/support', 'Name'), text: link.recipient.name },
                                  {
                                    label: translate('screens/home', 'Address'),
                                    text: formatLocationAddress({ ...link.recipient.address }),
                                  },
                                  {
                                    label: translate('screens/kyc', 'Phone number'),
                                    text: link.recipient.phone,
                                  },
                                  {
                                    label: translate('screens/kyc', 'Email address'),
                                    text: link.recipient.mail,
                                  },
                                  {
                                    label: translate('screens/kyc', 'Website'),
                                    text: link.recipient.website,
                                    // open absolute URL in new tab
                                    onClick: () => {
                                      if (!link.recipient?.website) return;

                                      const url =
                                        link.recipient?.website?.startsWith('http://') ||
                                        link.recipient?.website?.startsWith('https://')
                                          ? link.recipient?.website
                                          : `https://${link.recipient?.website}`;

                                      window.open(url, '_blank');
                                    },
                                  },
                                ].filter((item) => item.text) as any
                              }
                              expansionContent={
                                <StyledButton
                                  label={translate('screens/payment', 'Edit recipient')}
                                  onClick={() =>
                                    setShowPaymentLinkForm({
                                      step: PaymentLinkFormStep.RECIPIENT,
                                      paymentLinkId: link.id,
                                    })
                                  }
                                  color={StyledButtonColor.STURDY_WHITE}
                                  width={StyledButtonWidth.FULL}
                                />
                              }
                            >
                              {link.recipient.name && <p>{link.recipient.name}</p>}
                            </StyledDataTableExpandableRow>
                          )}
                          {link.payment != null && (
                            <StyledDataTableExpandableRow
                              label={translate('screens/payment', 'Payment')}
                              isExpanded={expandedPaymentLinkId ? expandedPaymentLinkId === link.id : undefined}
                              expansionItems={[
                                {
                                  label: translate('screens/payment', 'ID'),
                                  text: link.payment.id.toString(),
                                },
                                {
                                  label: translate('screens/payment', 'External ID'),
                                  text: (link.payment.externalId ?? '-').toString(),
                                },
                                {
                                  label: translate('screens/payment', 'Mode'),
                                  text: translate('screens/payment', link.payment.mode),
                                },
                                {
                                  label: translate('screens/payment', 'Amount'),
                                  text: `${link.payment.amount.toString()} ${link.payment.currency}`,
                                },
                                {
                                  label: translate('screens/payment', 'State'),
                                  text: translate('screens/payment', link.payment.status),
                                },
                                {
                                  label: translate('screens/payment', 'Expiry date'),
                                  text: new Date(link.payment.expiryDate).toLocaleString(),
                                },
                              ]}
                            >
                              <p>{translate('screens/payment', link.payment.status)}</p>
                            </StyledDataTableExpandableRow>
                          )}
                          {linkConfig && (
                            <StyledDataTableExpandableRow
                              label={translate('screens/payment', 'Configuration')}
                              expansionItems={
                                [
                                  {
                                    label: translate('screens/payment', 'Payment standards'),
                                    text: linkConfig.standards?.join(', '),
                                  },
                                  {
                                    label: translate('screens/payment', 'Min. completion status'),
                                    text:
                                      linkConfig.minCompletionStatus &&
                                      translate(
                                        'screens/payment',
                                        PaymentQuoteStatusLabels[linkConfig.minCompletionStatus],
                                      ),
                                  },
                                  {
                                    label: translate('screens/payment', 'Always show QR code'),
                                    text: translate('general/actions', linkConfig.displayQr ? 'Yes' : 'No'),
                                  },
                                  {
                                    label: translate('screens/payment', 'Fee'),
                                    text: linkConfig.fee?.toString(),
                                  },
                                  {
                                    label: translate('screens/payment', 'Payment timeout (seconds)'),
                                    text: linkConfig.paymentTimeout?.toString(),
                                  },
                                  {
                                    label: translate('screens/payment', 'Payment cancellable'),
                                    text: translate('general/actions', linkConfig.cancellable ? 'Yes' : 'No'),
                                  },
                                ].filter((item) => item.text) as any
                              }
                              expansionContent={
                                <StyledButton
                                  label={translate('screens/payment', 'Edit configuration')}
                                  onClick={() =>
                                    setShowPaymentLinkForm({
                                      step: PaymentLinkFormStep.CONFIG,
                                      paymentLinkId: link.id,
                                    })
                                  }
                                  color={StyledButtonColor.STURDY_WHITE}
                                  width={StyledButtonWidth.FULL}
                                />
                              }
                            />
                          )}
                        </StyledDataTable>
                        <div className="flex w-full items-center justify-center">
                          <div id={`qr-code-${link.id}`} className="w-48 py-3">
                            <QrBasic data={Lnurl.prependLnurl(link.lnurl)} />
                          </div>
                        </div>
                        <StyledButton
                          label={translate('general/actions', 'Download QR code')}
                          onClick={() => downloadQrCode(link)}
                          color={StyledButtonColor.STURDY_WHITE}
                        />
                        <StyledButton
                          label={translate('general/actions', 'Download sticker')}
                          onClick={() => downloadSticker(link)}
                          color={StyledButtonColor.STURDY_WHITE}
                        />
                        <PosLinkButton
                          link={link}
                          posUrl={posUrls[link.id]}
                          isLoading={isLoadingPos === link.id}
                          onMount={fetchPosUrl}
                          translate={translate}
                        />
                        {link.status === PaymentLinkStatus.ACTIVE &&
                          (!link.payment || link.payment.status !== PaymentLinkPaymentStatus.PENDING) && (
                            <StyledButton
                              label={translate('screens/payment', 'Create payment')}
                              onClick={() =>
                                setShowPaymentLinkForm({ step: PaymentLinkFormStep.PAYMENT, paymentLinkId: link.id })
                              }
                              color={StyledButtonColor.STURDY_WHITE}
                            />
                          )}
                        {link.status === PaymentLinkStatus.ACTIVE &&
                          link.payment?.status === PaymentLinkPaymentStatus.PENDING && (
                            <StyledButton
                              label={translate('screens/payment', 'Cancel payment')}
                              onClick={() => cancelPayment(link.id)}
                              color={StyledButtonColor.STURDY_WHITE}
                              isLoading={isUpdatingPaymentLink.includes(link.id)}
                            />
                          )}
                        {link.payment?.status !== PaymentLinkPaymentStatus.PENDING &&
                          link.status === PaymentLinkStatus.ACTIVE && (
                            <StyledButton
                              label={translate('screens/payment', 'Deactivate')}
                              onClick={() => togglePaymentLinkStatus(link.id, PaymentLinkStatus.INACTIVE)}
                              color={StyledButtonColor.STURDY_WHITE}
                              isLoading={isUpdatingPaymentLink.includes(link.id)}
                            />
                          )}

                        {link.status === PaymentLinkStatus.INACTIVE && (
                          <StyledButton
                            label={translate('screens/payment', 'Activate')}
                            onClick={() => togglePaymentLinkStatus(link.id, PaymentLinkStatus.ACTIVE)}
                            color={StyledButtonColor.STURDY_WHITE}
                            isLoading={isUpdatingPaymentLink.includes(link.id)}
                          />
                        )}
                      </StyledVerticalStack>
                    </StyledCollapsible>
                  </div>
                );
              })}
            </StyledVerticalStack>
          ) : (
            <></>
          )}
          <StyledVerticalStack gap={2.5} full>
            <StyledButton
              label={translate('screens/payment', 'Create Payment Link')}
              width={StyledButtonWidth.FULL}
              onClick={() => setShowPaymentLinkForm({ step: PaymentLinkFormStep.ROUTE })}
              hidden={
                !paymentRoutes?.sell.length ||
                !user?.paymentLink.active ||
                !user?.activeAddress?.blockchains.includes(Blockchain.LIGHTNING)
              }
            />
            <StyledButton
              label={translate('screens/payment', 'Create Invoice')}
              width={StyledButtonWidth.FULL}
              color={StyledButtonColor.STURDY_WHITE}
              onClick={() => navigate('/invoice')}
              hidden={paymentRoutesLoading}
            />
          </StyledVerticalStack>
        </StyledVerticalStack>
      )}
    </>
  );
}

interface PosLinkButtonProps {
  link: PaymentLink;
  posUrl?: string;
  isLoading: boolean;
  onMount: (linkId: string) => void;
  translate: (namespace: string, key: string) => string;
}

function PosLinkButton({ link, posUrl, isLoading, onMount, translate }: PosLinkButtonProps) {
  useEffect(() => {
    onMount(link.id);
  }, [link.id, onMount]);

  return (
    <StyledLinkButton
      label={translate('screens/payment', 'Open POS')}
      href={posUrl || `${window.location.origin}/pos/payment-link/${link.id}`}
      isLoading={isLoading}
    />
  );
}

interface RouteComponentProps {
  title: string;
  subTitle: string;
  adjacentText: string;
  items: {
    label: string;
    text: string;
    copy?: boolean;
  }[];
  deleteRoute: () => void;
  isDeletingRoute: boolean;
}

function RouteComponent({
  title,
  subTitle,
  adjacentText,
  items,
  deleteRoute,
  isDeletingRoute,
}: RouteComponentProps): JSX.Element {
  const { translate } = useSettingsContext();
  const { width } = useWindowContext();

  return (
    <StyledCollapsible
      full
      titleContent={
        <div className="flex flex-row justify-between gap-2 items-center">
          <div className="flex flex-col items-start text-left">
            <div className="font-bold leading-none">{title}</div>
            <div className="leading-none mt-1 text-dfxGray-700">{subTitle}</div>
          </div>
          <p className="overflow-ellipsis">{blankedAddress(adjacentText, { width })}</p>
        </div>
      }
    >
      <StyledVerticalStack full gap={4}>
        <StyledDataTable alignContent={AlignContent.RIGHT} showBorder minWidth={false}>
          {items.map((item) => (
            <StyledDataTableRow key={item.label} label={item.label}>
              <p>{item.text}</p>
              {item.copy && <CopyButton onCopy={() => copy(item.text)} />}
            </StyledDataTableRow>
          ))}
        </StyledDataTable>
        <StyledButton
          label={translate('general/actions', 'Delete')}
          onClick={deleteRoute}
          color={StyledButtonColor.STURDY_WHITE}
          isLoading={isDeletingRoute}
        />
      </StyledVerticalStack>
    </StyledCollapsible>
  );
}

enum PaymentLinkFormStep {
  ROUTE,
  RECIPIENT,
  PAYMENT,
  CONFIG,
  DONE,
}

interface PaymentLinkFormState {
  step: PaymentLinkFormStep;
  paymentLinkId?: string;
}

interface PaymentLinkFormProps {
  state: PaymentLinkFormState;
  setStep?: (title: PaymentLinkFormStep) => void;
  onClose: (id?: string) => void;
  onSubmit?: (data: any) => Promise<void>;
}

const PaymentLinkFormStepToTitle = {
  [PaymentLinkFormStep.ROUTE]: 'Route',
  [PaymentLinkFormStep.RECIPIENT]: 'Recipient',
  [PaymentLinkFormStep.PAYMENT]: 'Payment',
  [PaymentLinkFormStep.CONFIG]: 'Configuration',
  [PaymentLinkFormStep.DONE]: 'Summary',
};

function PaymentLinkForm({
  state: { step, paymentLinkId },
  setStep,
  onClose,
  onSubmit: onSubmitForm,
}: PaymentLinkFormProps): JSX.Element {
  const { rootRef } = useLayoutContext();
  const { paymentRoutes, paymentLinks } = usePaymentRoutesContext();
  const { allowedCountries, translate, translateError } = useSettingsContext();
  const { createPaymentLink, createPaymentLinkPayment, updatePaymentLink, userPaymentLinksConfig } =
    usePaymentRoutesContext();

  const [paymentCurrency, setPaymentCurrency] = useState<Fiat>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

  const configData = useMemo(
    () =>
      userPaymentLinksConfig
        ? {
            configStandards: userPaymentLinksConfig.standards,
            configMinCompletionStatus: userPaymentLinksConfig.minCompletionStatus,
            configDisplayQr: userPaymentLinksConfig.displayQr,
            configPaymentTimeout: userPaymentLinksConfig.paymentTimeout,
            configCancellable: userPaymentLinksConfig.cancellable,
          }
        : undefined,
    [userPaymentLinksConfig],
  );

  const {
    watch,
    control,
    handleSubmit,
    reset,
    getValues,
    setValue,
    formState: { errors, isValid },
  } = useForm<FormData>({
    mode: 'all',
    defaultValues: {
      paymentExpiryDate: new Date(Date.now() + 60 * 60 * 1000),
      ...configData,
    },
  });

  const data = watch();

  useEffect(() => {
    if (paymentLinkId) {
      const prefilledRecipientData = paymentLinks?.find((link) => link.id === paymentLinkId)?.recipient;
      if (prefilledRecipientData && allowedCountries) {
        const prefilledCountry = allowedCountries.find(
          (country) => country.symbol === prefilledRecipientData.address?.country,
        );
        reset({
          ...getValues(),
          recipientName: prefilledRecipientData.name,
          recipientStreet: prefilledRecipientData.address?.street,
          recipientHouseNumber: prefilledRecipientData.address?.houseNumber,
          recipientZip: prefilledRecipientData.address?.zip,
          recipientCity: prefilledRecipientData.address?.city,
          recipientCountry: prefilledCountry,
          recipientPhone: prefilledRecipientData.phone,
          recipientEmail: prefilledRecipientData.mail,
          recipientWebsite: prefilledRecipientData.website,
        });
      }

      let prefilledPaymentConfig = paymentLinks?.find((link) => link.id === paymentLinkId)?.config;
      prefilledPaymentConfig = { ...userPaymentLinksConfig, ...removeNullFields(prefilledPaymentConfig) };
      if (prefilledPaymentConfig) {
        reset({
          ...getValues(),
          configStandards: prefilledPaymentConfig.standards,
          configMinCompletionStatus: prefilledPaymentConfig.minCompletionStatus,
          configDisplayQr: prefilledPaymentConfig.displayQr,
          configPaymentTimeout: prefilledPaymentConfig.paymentTimeout,
          configCancellable: prefilledPaymentConfig.cancellable,
        });
      }
    } else if (configData) {
      const currentValues = getValues();
      const mergedData = { ...currentValues };
      Object.entries(configData).forEach(([key, value]) => {
        if (value !== undefined && isEmpty(currentValues[key as keyof FormData])) {
          (mergedData as any)[key] = value;
        }
      });

      reset(mergedData);
    }
  }, [paymentLinks, allowedCountries, paymentLinkId, step, configData]);

  useEffect(() => {
    const maxIdRoute = paymentRoutes?.sell.reduce(
      (prev, current) => (prev.id < current.id ? prev : current),
      paymentRoutes.sell[0],
    );
    if (maxIdRoute) setValue('routeId', routeToRouteIdSelectData(maxIdRoute));
  }, [paymentRoutes]);

  useEffect(() => {
    const routeId = data.routeId?.id ?? paymentLinks?.find((link) => link.id === paymentLinkId)?.routeId;
    const currency = paymentRoutes?.sell.find((route) => route.id.toString() === routeId?.toString())?.currency;
    if (currency) setPaymentCurrency(currency);
  }, [data.routeId, paymentLinkId, paymentLinks, paymentRoutes]);

  useEffect(() => {
    setError(undefined);
  }, [step]);

  async function onSubmit(data: FormData) {
    setIsLoading(true);

    try {
      const request: any = {};

      if (data.routeId || data.externalId || data.label) {
        request.routeId = data.routeId ? +data.routeId.id : undefined;
        request.externalId = data.externalId ? data.externalId : undefined;
        request.label = data.label ? data.label : undefined;
      }

      if (hasRecipientData) {
        request.config = {};
        request.config.recipient = {
          name: data.recipientName,
          address: {
            street: data.recipientStreet,
            houseNumber: data.recipientHouseNumber,
            zip: data.recipientZip,
            city: data.recipientCity,
            country: data.recipientCountry?.symbol,
          },
          phone: data.recipientPhone,
          mail: data.recipientEmail,
          website: data.recipientWebsite,
        };
      }

      if (hasPaymentData) {
        request.payment = {
          mode: data.paymentMode,
          amount: +data.paymentAmount,
          externalId: data.paymentExternalId,
          currency: paymentCurrency?.name,
          expiryDate: data.paymentExpiryDate,
        };
      }

      request.config = {
        ...request.config,
        standards: data.configStandards,
        minCompletionStatus: data.configMinCompletionStatus,
        displayQr: data.configDisplayQr,
        paymentTimeout: Number(data.configPaymentTimeout),
        cancellable: data.configCancellable,
      };

      if (onSubmitForm) {
        await onSubmitForm(request);
        setIsLoading(false);
        onClose();
        reset();
        return;
      }

      switch (step) {
        case PaymentLinkFormStep.RECIPIENT:
        case PaymentLinkFormStep.CONFIG:
          if (!paymentLinkId) break;
          await updatePaymentLink(request, paymentLinkId);
          break;
        case PaymentLinkFormStep.PAYMENT:
          if (!paymentLinkId) break;
          await createPaymentLinkPayment(request.payment, paymentLinkId);
          break;
        default:
          const newPaymentLink = await createPaymentLink(request);
          paymentLinkId = newPaymentLink?.id;
          break;
      }

      onClose(paymentLinkId);
      reset();
    } catch (e) {
      setError((e as ApiError).message ?? 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }

  function routeToRouteIdSelectData(route: SellRoute): RouteIdSelectData {
    return {
      id: route.id.toString(),
      description: `${route.currency.name} / ${route.iban}`,
    };
  }

  const rules = Utils.createRules({
    paymentMode: Validations.Required,
    paymentAmount: Validations.Required,
    paymentExternalId: Validations.Required,
    paymentExpiryDate: Validations.Required,
    configStandards: Validations.Required,
    configMinCompletionStatus: Validations.Required,
    configPaymentTimeout: Validations.Required,
    configDisplayQr: Validations.Custom((value) => [true, false].includes(value) || 'invalid configDisplayQr'),
    configCancellable: Validations.Custom((value) => [true, false].includes(value) || 'invalid configCancellable'),
  });

  const availablePaymentRoutes: RouteIdSelectData[] = paymentRoutes?.sell?.map(routeToRouteIdSelectData) ?? [];

  const naString = translate('screens/payment', 'N/A');
  const hasRecipientData = Boolean(
    data.recipientName ||
      data.recipientStreet ||
      data.recipientHouseNumber ||
      data.recipientZip ||
      data.recipientCity ||
      data.recipientCountry ||
      data.recipientPhone ||
      data.recipientEmail ||
      data.recipientWebsite,
  );
  const hasPaymentData = Boolean(
    data.paymentMode &&
      data.paymentAmount !== undefined &&
      data.paymentExternalId !== undefined &&
      data.paymentExpiryDate,
  );

  const skipRecipientData = Boolean(!hasRecipientData && step === PaymentLinkFormStep.RECIPIENT);
  const skipPaymentData = Boolean(!hasPaymentData && step === PaymentLinkFormStep.PAYMENT);

  return (
    <>
      <Form
        control={control}
        rules={rules}
        errors={errors}
        onSubmit={handleSubmit(onSubmit)}
        translate={translateError}
      >
        <StyledVerticalStack gap={6} full center>
          {step === PaymentLinkFormStep.ROUTE && (
            <StyledVerticalStack gap={6} full center>
              <StyledDropdown<RouteIdSelectData>
                rootRef={rootRef}
                name="routeId"
                label={translate('screens/payment', 'Route ID')}
                placeholder={translate('screens/payment', 'Route ID')}
                items={availablePaymentRoutes}
                labelFunc={(item) => item.id}
                descriptionFunc={(item) => item.description}
                full
                smallLabel
              />

              <StyledInput
                name="externalId"
                autocomplete="route-id"
                label={translate('screens/payment', 'External ID')}
                placeholder={translate('screens/payment', 'External ID')}
                full
                smallLabel
              />

              <StyledInput
                name="label"
                autocomplete="label"
                label={translate('screens/settings', 'Label')}
                placeholder={translate('screens/settings', 'Label')}
                full
                smallLabel
              />
            </StyledVerticalStack>
          )}
          {step === PaymentLinkFormStep.RECIPIENT && (
            <StyledVerticalStack gap={2} full>
              <StyledInput
                name="recipientName"
                autocomplete="name"
                label={translate('screens/kyc', 'Name')}
                placeholder={translate('screens/kyc', 'John Doe')}
                full
                smallLabel
              />
              <StyledHorizontalStack gap={2}>
                <StyledInput
                  name="recipientStreet"
                  autocomplete="street"
                  label={translate('screens/kyc', 'Street')}
                  placeholder={translate('screens/kyc', 'Street')}
                  full
                  smallLabel
                />
                <StyledInput
                  name="recipientHouseNumber"
                  autocomplete="house-number"
                  label={translate('screens/kyc', 'House nr.')}
                  placeholder="xx"
                  small
                  smallLabel
                />
              </StyledHorizontalStack>
              <StyledHorizontalStack gap={2}>
                <StyledInput
                  name="recipientZip"
                  autocomplete="zip"
                  label={translate('screens/kyc', 'ZIP code')}
                  placeholder="12345"
                  small
                  smallLabel
                />
                <StyledInput
                  name="recipientCity"
                  autocomplete="city"
                  label={translate('screens/kyc', 'City')}
                  placeholder="Berlin"
                  full
                  smallLabel
                />
              </StyledHorizontalStack>
              <StyledSearchDropdown
                rootRef={rootRef}
                name="recipientCountry"
                autocomplete="country"
                label={translate('screens/kyc', 'Country')}
                placeholder={translate('general/actions', 'Select') + '...'}
                items={allowedCountries ?? []}
                labelFunc={(item) => item.name}
                filterFunc={(i, s) => !s || [i.name, i.symbol].some((w) => w.toLowerCase().includes(s.toLowerCase()))}
                matchFunc={(i, s) => i.name.toLowerCase() === s?.toLowerCase()}
                smallLabel
              />
              <StyledInput
                name="recipientPhone"
                autocomplete="phone"
                type="tel"
                label={translate('screens/kyc', 'Phone number')}
                placeholder="+49 12345678"
                smallLabel
              />
              <StyledInput
                name="recipientEmail"
                autocomplete="email"
                type="email"
                label={translate('screens/kyc', 'Email address')}
                placeholder={translate('screens/kyc', 'example@mail.com')}
                smallLabel
                full
              />
              <StyledInput
                name="recipientWebsite"
                autocomplete="website"
                type="url"
                label={translate('screens/kyc', 'Website')}
                placeholder={translate('screens/kyc', 'https://example.com')}
                smallLabel
                full
              />
            </StyledVerticalStack>
          )}
          {step === PaymentLinkFormStep.PAYMENT && (
            <>
              <StyledDropdown
                rootRef={rootRef}
                name="paymentMode"
                label={translate('screens/payment', 'Mode')}
                smallLabel
                full
                placeholder={translate('general/actions', 'Select') + '...'}
                items={Object.values(PaymentLinkPaymentMode)}
                labelFunc={(item) => translate('screens/payment', item)}
              />

              <StyledInput
                name="paymentAmount"
                label={translate('screens/payment', 'Amount')}
                smallLabel
                placeholder={'0.00'}
                prefix={paymentCurrency?.name}
                full
              />

              <StyledInput
                name="paymentExternalId"
                autocomplete="payment-id"
                label={translate('screens/payment', 'Payment ID')}
                placeholder={translate('screens/payment', 'Payment ID')}
                full
                smallLabel
              />

              <StyledDateAndTimePicker
                name="paymentExpiryDate"
                label={translate('screens/payment', 'Expires at')}
                smallLabel
              />
            </>
          )}
          {step === PaymentLinkFormStep.CONFIG && (
            <>
              <StyledDropdownMultiChoice<PaymentStandardType>
                rootRef={rootRef}
                name="configStandards"
                label={translate('screens/payment', 'Payment standards')}
                smallLabel
                full
                placeholder={translate('general/actions', 'Select...')}
                items={Object.values(PaymentStandardType)}
                labelFunc={(item) => item}
              />

              <StyledDropdown
                rootRef={rootRef}
                name="configMinCompletionStatus"
                label={translate('screens/payment', 'Min. completion status')}
                smallLabel
                full
                placeholder={translate('general/actions', 'Select...')}
                items={Object.values(MinCompletionStatus)}
                labelFunc={(item) => translate('screens/payment', PaymentQuoteStatusLabels[item])}
              />

              <StyledInput
                type="number"
                name="configPaymentTimeout"
                label={translate('screens/payment', 'Payment timeout (seconds)')}
                smallLabel
                placeholder={'60'}
                full
              />

              <StyledDropdown
                rootRef={rootRef}
                name="configDisplayQr"
                label={translate('screens/payment', 'Always show QR code')}
                smallLabel
                full
                placeholder={translate('general/actions', 'Select...')}
                items={[true, false]}
                labelFunc={(item) => translate('general/actions', item ? 'Yes' : 'No')}
              />

              <StyledDropdown
                rootRef={rootRef}
                name="configCancellable"
                label={translate('screens/payment', 'Payment cancellable')}
                smallLabel
                full
                placeholder={translate('general/actions', 'Select...')}
                items={[true, false]}
                labelFunc={(item) => translate('general/actions', item ? 'Yes' : 'No')}
              />
            </>
          )}
          {step === PaymentLinkFormStep.DONE && (
            <StyledVerticalStack center full gap={2}>
              <StyledDataTable alignContent={AlignContent.RIGHT} showBorder minWidth={false}>
                <StyledDataTableRow label={translate('screens/payment', 'Route ID')}>
                  <p className="font-semibold">{data.routeId?.id ?? naString}</p>
                </StyledDataTableRow>
                <StyledDataTableRow label={translate('screens/payment', 'External ID')}>
                  <p className="text-dfxBlue-600">{data.externalId ?? naString}</p>
                </StyledDataTableRow>
                <StyledDataTableRow label={translate('screens/settings', 'Label')}>
                  <p className="text-dfxBlue-600">{data.label ?? naString}</p>
                </StyledDataTableRow>
                <StyledDataTableExpandableRow
                  label={translate('screens/payment', 'Recipient')}
                  isExpanded={hasRecipientData}
                  discreet={!hasRecipientData}
                  expansionItems={[
                    { label: translate('screens/support', 'Name'), text: data.recipientName ?? naString },
                    {
                      label: translate('screens/home', 'Address'),
                      text:
                        formatLocationAddress({
                          street: data.recipientStreet,
                          houseNumber: data.recipientHouseNumber,
                          zip: data.recipientZip,
                          city: data.recipientCity,
                          country: data.recipientCountry?.name,
                        }) ?? naString,
                    },
                    { label: translate('screens/kyc', 'Phone number'), text: data.recipientPhone ?? naString },
                    { label: translate('screens/kyc', 'Email address'), text: data.recipientEmail ?? naString },
                    { label: translate('screens/kyc', 'Website'), text: data.recipientWebsite ?? naString },
                  ]}
                />
                <StyledDataTableExpandableRow
                  label={translate('screens/payment', 'Configuration')}
                  isExpanded={true}
                  discreet={false}
                  expansionItems={[
                    {
                      label: translate('screens/payment', 'Payment standards'),
                      text: data.configStandards?.toString() ?? naString,
                    },
                    {
                      label: translate('screens/payment', 'Min. completion status'),
                      text: data.configMinCompletionStatus
                        ? translate('screens/payment', PaymentQuoteStatusLabels[data.configMinCompletionStatus])
                        : naString,
                    },
                    {
                      label: translate('screens/payment', 'Always show QR code'),
                      text:
                        data.configDisplayQr !== undefined
                          ? translate('general/actions', data.configDisplayQr ? 'Yes' : 'No')
                          : naString,
                    },
                    {
                      label: translate('screens/payment', 'Payment timeout (seconds)'),
                      text: data.configPaymentTimeout?.toString() ?? naString,
                    },
                    {
                      label: translate('screens/payment', 'Payment cancellable'),
                      text:
                        data.configCancellable !== undefined
                          ? translate('general/actions', data.configCancellable ? 'Yes' : 'No')
                          : naString,
                    },
                  ]}
                />
                <StyledDataTableExpandableRow
                  label={translate('screens/payment', 'Payment')}
                  isExpanded={data.paymentMode ? true : false}
                  discreet={!data.paymentMode}
                  expansionItems={[
                    { label: translate('screens/payment', 'Mode'), text: data.paymentMode ?? naString },
                    { label: translate('screens/payment', 'External ID'), text: data.paymentExternalId ?? naString },
                    {
                      label: translate('screens/payment', 'Amount'),
                      text:
                        data.paymentAmount && paymentCurrency?.name
                          ? `${data.paymentAmount} ${paymentCurrency.name}`
                          : naString,
                    },
                    {
                      label: translate('screens/payment', 'Expiry date'),
                      text: data.paymentExpiryDate?.toLocaleString() ?? naString,
                    },
                  ]}
                />
              </StyledDataTable>
            </StyledVerticalStack>
          )}

          {error && (
            <div>
              <ErrorHint message={error} />
            </div>
          )}

          {step === PaymentLinkFormStep.DONE || paymentLinkId || !setStep ? (
            <div className="flex flex-col w-full gap-4">
              <StyledButton
                type="submit"
                label={translate('general/actions', 'Cancel')}
                onClick={() => onClose()}
                width={StyledButtonWidth.FULL}
                color={StyledButtonColor.STURDY_WHITE}
              />
              <StyledButton
                label={translate('general/actions', paymentLinkId || !setStep ? 'Save' : 'Create')}
                onClick={handleSubmit(onSubmit)}
                width={StyledButtonWidth.FULL}
                isLoading={isLoading}
                disabled={!isValid}
              />
            </div>
          ) : (
            <div className="flex flex-col w-full gap-4">
              {(skipPaymentData || skipRecipientData) && (
                <StyledButton
                  label={translate('general/actions', 'Skip')}
                  onClick={() => {
                    reset({
                      ...getValues(),
                      ...(!hasPaymentData && {
                        paymentMode: undefined,
                        paymentAmount: undefined,
                        paymentExternalId: undefined,
                        paymentExpiryDate: undefined,
                      }),
                      ...(!hasRecipientData && {
                        recipientName: undefined,
                        recipientStreet: undefined,
                        recipientHouseNumber: undefined,
                        recipientZip: undefined,
                        recipientCity: undefined,
                        recipientCountry: undefined,
                        recipientPhone: undefined,
                        recipientEmail: undefined,
                        recipientWebsite: undefined,
                      }),
                    });
                    setStep && setStep(step + 1);
                  }}
                  width={StyledButtonWidth.FULL}
                  color={StyledButtonColor.STURDY_WHITE}
                />
              )}
              <StyledButton
                label={translate('general/actions', 'Next')}
                onClick={() => setStep && setStep(step + 1)}
                width={StyledButtonWidth.FULL}
                disabled={!isValid || skipPaymentData || skipRecipientData}
              />
            </div>
          )}
        </StyledVerticalStack>
      </Form>
    </>
  );
}
