import {
  ApiError,
  Asset,
  AssetCategory,
  Blockchain,
  Session,
  Swap,
  SwapPaymentInfo,
  TransactionError,
  TransactionType,
  UserAddress,
  Utils,
  Validations,
  useAsset,
  useAssetContext,
  useAuthContext,
  useSessionContext,
  useSwap,
  useUserContext,
} from '@dfx.swiss/react';
import {
  AssetIconVariant,
  Form,
  SpinnerSize,
  StyledButton,
  StyledButtonColor,
  StyledButtonWidth,
  StyledDropdown,
  StyledHorizontalStack,
  StyledInput,
  StyledLink,
  StyledLoadingSpinner,
  StyledSearchDropdown,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FieldPath, FieldPathValue, useForm, useWatch } from 'react-hook-form';
import { PaymentInformationContent } from 'src/components/payment/payment-info-sell';
import { PrivateAssetHint } from 'src/components/private-asset-hint';
import { addressLabel } from 'src/config/labels';
import { Urls } from 'src/config/urls';
import { useLayoutContext } from 'src/contexts/layout.context';
import { useWindowContext } from 'src/contexts/window.context';
import useDebounce from 'src/hooks/debounce.hook';
import { useLayoutOptions } from 'src/hooks/layout-config.hook';
import { getKycErrorFromMessage } from 'src/util/api-error';
import { displayWalletAddress } from 'src/util/lnurl';
import { ExchangeRate } from '../components/exchange-rate';
import { AddressSwitch } from '../components/payment/address-switch';
import { SwapCompletion } from '../components/payment/swap-completion';
import { QuoteErrorHint } from '../components/quote-error-hint';
import { QuoteRequestError, SESSION_EXPIRED_ERROR } from '../components/quote-request-error';
import { SanctionHint } from '../components/sanction-hint';
import { CloseType, useAppHandlingContext } from '../contexts/app-handling.context';
import { AssetBalance } from '../contexts/balance.context';
import { useSettingsContext } from '../contexts/settings.context';
import { useWalletContext } from '../contexts/wallet.context';
import { useAppParams } from '../hooks/app-params.hook';
import { useBlockchain } from '../hooks/blockchain.hook';
import { useAddressGuard } from '../hooks/guard.hook';
import { useNavigation } from '../hooks/navigation.hook';
import { useTxHelper } from '../hooks/tx-helper.hook';

enum Side {
  SPEND = 'SPEND',
  GET = 'GET',
}

interface Receiver {
  address: string;
  addressLabel: string;
  label: string;
  chain: Blockchain;
}

interface FormData {
  sourceAsset?: Asset;
  targetAsset?: Asset;
  amount: string;
  targetAmount: string;
  address?: Receiver;
  receiveNetwork?: Blockchain;
}

interface CustomAmountError {
  key: string;
  defaultValue: string;
  interpolation?: Record<string, string | number> | undefined;
  hideInfos: boolean;
}

interface ValidatedData extends SwapPaymentInfo {
  sideToUpdate?: Side;
}

interface WalletEntry {
  address: string;
  addressLabel: string;
  blockchains: Blockchain[];
}

function chainFromAssetRef(ref?: string): string | undefined {
  if (!ref) return undefined;
  const slash = ref.indexOf('/');
  if (slash <= 0) return undefined;
  return ref.slice(0, slash);
}

function uniqueChains(chains: readonly Blockchain[]): Blockchain[] {
  const unique: Blockchain[] = [];
  for (const chain of chains) {
    if (!unique.includes(chain)) unique.push(chain);
  }
  return unique;
}

function lowestIdAsset(list: readonly Asset[]): Asset | undefined {
  let best: Asset | undefined;
  for (const asset of list) {
    if (!best || asset.id < best.id) best = asset;
  }
  return best;
}

function sameAsset(left?: Asset, right?: Asset): boolean {
  return !!left && !!right && left.id === right.id && left.blockchain === right.blockchain;
}

function asEligibleChain(chain: string | undefined, eligible: readonly Blockchain[]): Blockchain | undefined {
  if (!chain) return undefined;
  const lowered = chain.toLowerCase();
  return eligible.find((item) => item.toLowerCase() === lowered);
}

function embedAllows(chain: Blockchain, embed?: string): boolean {
  if (!embed) return true;
  return embed
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0)
    .includes(chain.toLowerCase());
}

export default function SwapScreen(): JSX.Element {
  useAddressGuard('/login');

  const { translate, translateError } = useSettingsContext();
  const { closeServices } = useAppHandlingContext();
  const { blockchain: walletBlockchain, activeWallet } = useWalletContext();
  const { getBalances, sendTransaction, canSendTransaction } = useTxHelper();
  const { logout } = useSessionContext();
  const { session } = useAuthContext();
  const { width } = useWindowContext();
  const { userAddresses } = useUserContext();
  const { assets, getAssets } = useAssetContext();
  const { getAsset, isSameAsset } = useAsset();
  const { navigate } = useNavigation();
  const {
    assets: assetFilter,
    assetIn,
    assetOut,
    amountIn,
    blockchain,
    blockchains: blockchainFilter,
    hideTargetSelection,
    externalTransactionId,
    flags,
    availableBlockchains,
  } = useAppParams();
  const { receiveFor } = useSwap();
  const { toString } = useBlockchain();
  const { rootRef } = useLayoutContext();

  const [customAmountError, setCustomAmountError] = useState<CustomAmountError>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [kycError, setKycError] = useState<TransactionError>();
  const [isLoading, setIsLoading] = useState<Side>();
  const [paymentInfo, setPaymentInfo] = useState<Swap>();
  const [isQuoteFinal, setIsQuoteFinal] = useState(false);
  const [balances, setBalances] = useState<AssetBalance[]>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTxDone, setTxDone] = useState<boolean>(false);
  const [swapTxId, setSwapTxId] = useState<string>();
  const [showsSwitchScreen, setShowsSwitchScreen] = useState(false);
  const [validatedData, setValidatedData] = useState<ValidatedData>();
  const [retryToken, setRetryToken] = useState(0);

  // form
  const { control, handleSubmit, setValue, getValues, watch } = useForm<FormData>({ mode: 'onTouched' });

  const enteredAmount = useWatch({ control, name: 'amount' });
  const selectedSourceAsset = useWatch({ control, name: 'sourceAsset' });
  const selectedTargetAmount = useWatch({ control, name: 'targetAmount' });
  const selectedTargetAsset = useWatch({ control, name: 'targetAsset' });
  const selectedAddress = useWatch({ control, name: 'address' });
  const selectedReceiveNetwork = useWatch({ control, name: 'receiveNetwork' });

  const previousAmountRef = useRef<string>();
  const previousTargetAmountRef = useRef<string>();
  const spendClearedByUserRef = useRef(false);
  const targetClearedByUserRef = useRef(false);
  const isExactPriceWriteRef = useRef(false);
  const quoteGeneration = useRef(0);
  const enteredAmountLiveRef = useRef(enteredAmount);
  const selectedTargetAmountLiveRef = useRef(selectedTargetAmount);
  const selectedSourceRef = useRef(selectedSourceAsset);
  const selectedTargetRef = useRef(selectedTargetAsset);
  const selectedAddressRef = useRef(selectedAddress);
  const selectedNetworkRef = useRef(selectedReceiveNetwork);
  const userReceiveNetworkRef = useRef<Blockchain | undefined>();
  const suppressSourceDefaultRef = useRef(false);
  const quoteNetworkRef = useRef<Blockchain | undefined>();
  const programmaticSourceRef = useRef<Asset | undefined>();
  const acknowledgedSourceRef = useRef<Asset | undefined>();
  const userSourceRef = useRef<Asset | undefined>();
  const staleSourceGuardRef = useRef<string | undefined>();
  const staleNetworkGuardRef = useRef<string | undefined>();
  const staleTargetGuardRef = useRef<string | undefined>();
  const staleReceiverGuardRef = useRef<string | undefined>();
  enteredAmountLiveRef.current = enteredAmount;
  selectedTargetAmountLiveRef.current = selectedTargetAmount;
  selectedSourceRef.current = selectedSourceAsset;
  selectedTargetRef.current = selectedTargetAsset;
  selectedAddressRef.current = selectedAddress;
  selectedNetworkRef.current = selectedReceiveNetwork;
  // A dropdown write is a manual source. setVal marks itself first, so the default asset is not treated as one.
  if (selectedSourceAsset !== acknowledgedSourceRef.current) {
    if (programmaticSourceRef.current && sameAsset(programmaticSourceRef.current, selectedSourceAsset)) {
      programmaticSourceRef.current = undefined;
      acknowledgedSourceRef.current = selectedSourceAsset;
    } else if (selectedSourceAsset) {
      userSourceRef.current = selectedSourceAsset;
      acknowledgedSourceRef.current = selectedSourceAsset;
    } else {
      acknowledgedSourceRef.current = undefined;
    }
  }
  if (!enteredAmount && previousAmountRef.current) spendClearedByUserRef.current = true;
  if (!selectedTargetAmount && previousTargetAmountRef.current) targetClearedByUserRef.current = true;

  function setVal(field: FieldPath<FormData>, value: FieldPathValue<FormData, FieldPath<FormData>>) {
    setValue(field, value, { shouldValidate: true });
  }

  // setValue writes the form value even when no Controller mounted. resetField does not.
  function clearVal(field: 'sourceAsset' | 'targetAsset' | 'address' | 'receiveNetwork'): void {
    if (field === 'sourceAsset') setValue('sourceAsset', undefined);
    else if (field === 'targetAsset') setValue('targetAsset', undefined);
    else if (field === 'address') setValue('address', undefined);
    else setValue('receiveNetwork', undefined);
  }

  function filterAssets(assetList: Asset[], filter?: string): Asset[] {
    if (!filter) return assetList;
    const allowedAssets = filter.split(',');
    return assetList.filter((asset) => allowedAssets.some((candidate) => isSameAsset(asset, candidate)));
  }

  function chainName(chain: Blockchain): string {
    return toString(chain) || chain;
  }

  const assetMapKey = assets
    ? Array.from(assets.values())
        .flat()
        .map(
          (asset) =>
            `${asset.id}:${asset.blockchain}:${String(asset.buyable)}:${String(asset.sellable)}:${String(asset.comingSoon)}`,
        )
        .join(',')
    : '';

  const userSessions = [session, ...userAddresses].filter(
    (entry, index, all) => entry && all.findIndex((other) => other?.address === entry.address) === index,
  ) as (Session | UserAddress)[];

  const userAddressItems: WalletEntry[] = userSessions.flatMap((entry) => {
    if (!entry.address) return [];
    return [
      {
        address: entry.address,
        addressLabel: addressLabel(entry),
        blockchains: entry.blockchains,
      },
    ];
  });

  const addressKey = userAddressItems
    .map((item) => `${item.address}:${[...item.blockchains].sort().join(',')}`)
    .join('|');

  // Session chains plus linked address chains (Lightning is often only on the linked address).
  const accountChains = uniqueChains([...(availableBlockchains ?? []), ...userAddressItems.flatMap((item) => item.blockchains)]).filter(
    (chain) => embedAllows(chain, blockchainFilter),
  );
  const accountChainKey = accountChains.join('|');

  const sourceAssets = useMemo(
    () => filterAssets(getAssets(accountChains, { sellable: true, comingSoon: false }), assetFilter),
    // accountChainKey, assetFilter, and assetMapKey stand in for getAssets and filterAssets.
    [accountChainKey, assetFilter, assetMapKey],
  );
  const sourceAssetKey = sourceAssets.map((asset) => `${asset.id}:${asset.blockchain}`).join(',');
  const sourceSelectionKey = selectedSourceAsset ? `${selectedSourceAsset.id}:${selectedSourceAsset.blockchain}` : '';

  const buyableAssets = useMemo(
    () => filterAssets(getAssets(accountChains, { buyable: true, comingSoon: false }), assetFilter),
    [accountChainKey, assetFilter, assetMapKey],
  );
  const eligibleNetworks = useMemo(
    () => accountChains.filter((chain) => buyableAssets.some((asset) => asset.blockchain === chain)),
    [accountChainKey, buyableAssets],
  );
  const eligibleKey = eligibleNetworks.join('|');

  const targetAssets = useMemo(() => {
    if (!selectedReceiveNetwork) return [];
    return filterAssets(getAssets([selectedReceiveNetwork], { buyable: true, comingSoon: false }), assetFilter);
  }, [selectedReceiveNetwork, assetFilter, assetMapKey]);

  function receiversFor(chain: Blockchain): Receiver[] {
    const receivers: Receiver[] = [];
    for (const item of userAddressItems) {
      if (!item.blockchains.includes(chain)) continue;
      receivers.push({
        address: item.address,
        addressLabel: item.addressLabel,
        label: chainName(chain),
        chain,
      });
    }
    return receivers;
  }

  const compatibleReceivers = useMemo(
    () => (selectedReceiveNetwork ? receiversFor(selectedReceiveNetwork) : []),
    // addressKey is the address set receiversFor reads.
    [selectedReceiveNetwork, addressKey],
  );

  const availableBalance = selectedSourceAsset && findBalance(selectedSourceAsset);

  useEffect(() => {
    if (sourceAssets.length && session?.address) {
      const assetMap = sourceAssets.reduce<Record<Blockchain, Asset[]>>(
        (acc, asset) => {
          if (!acc[asset.blockchain]) acc[asset.blockchain] = [];
          acc[asset.blockchain].push(asset);
          return acc;
        },
        {} as Record<Blockchain, Asset[]>,
      );

      Promise.all(
        Object.entries(assetMap).map(
          ([chain, chainAssets]) => session.address && getBalances(chainAssets, session.address, chain as Blockchain),
        ),
      ).then((results) => setBalances(results.flat().filter((item) => item) as AssetBalance[]));
    }
  }, [getBalances, sourceAssetKey, session?.address]);

  useEffect(() => {
    const current = selectedSourceRef.current;
    const manual = userSourceRef.current;
    const manualMatch = manual ? sourceAssets.find((asset) => sameAsset(asset, manual)) : undefined;
    let next: Asset | undefined;
    if (manualMatch) {
      next = manualMatch;
    } else {
      if (manual) userSourceRef.current = undefined;
      next =
        getAsset(sourceAssets, assetIn) ??
        (walletBlockchain ? sourceAssets.find((asset) => asset.blockchain === walletBlockchain) : undefined);
    }

    if (!next) {
      if (current) {
        programmaticSourceRef.current = undefined;
        clearVal('sourceAsset');
      }
      return;
    }
    if (sameAsset(current, next)) return;
    programmaticSourceRef.current = next;
    setVal('sourceAsset', next);
  }, [assetIn, walletBlockchain, sourceAssetKey, selectedSourceAsset]);

  // A Controller selection emits type "change", including when the value is already selected.
  // setValue does not, so a programmatic default is not recorded as a user choice.
  useEffect(() => {
    const subscription = watch((_formValues, info) => {
      if (info.name !== 'receiveNetwork' || info.type !== 'change') return;
      userReceiveNetworkRef.current = getValues('receiveNetwork');
    });
    return () => subscription.unsubscribe();
  }, [watch, getValues]);

  // URL chain and an explicit receive-network choice outrank the source chain.
  // The source chain is only the default while neither of those exists.
  useEffect(() => {
    if (userReceiveNetworkRef.current && !eligibleNetworks.includes(userReceiveNetworkRef.current)) {
      suppressSourceDefaultRef.current = true;
      userReceiveNetworkRef.current = undefined;
    }

    const watchedNow = selectedNetworkRef.current;
    if (watchedNow && !eligibleNetworks.includes(watchedNow)) {
      suppressSourceDefaultRef.current = true;
    }

    const requestedAssetChain = chainFromAssetRef(assetOut);
    const eligibleAssetChain = asEligibleChain(requestedAssetChain, eligibleNetworks);
    const eligibleParamChain = !requestedAssetChain ? asEligibleChain(blockchain, eligibleNetworks) : undefined;

    let nextNetwork: Blockchain | undefined;
    const choice = userReceiveNetworkRef.current;
    if (choice && eligibleNetworks.includes(choice)) {
      nextNetwork = choice;
    } else if (eligibleAssetChain) {
      nextNetwork = eligibleAssetChain;
    } else if (eligibleParamChain) {
      nextNetwork = eligibleParamChain;
    } else if (!requestedAssetChain && !blockchain && !suppressSourceDefaultRef.current) {
      const activeSource = sourceAssets.find((asset) => sameAsset(asset, selectedSourceRef.current));
      const fallbackSource =
        getAsset(sourceAssets, assetIn) ??
        (walletBlockchain ? sourceAssets.find((asset) => asset.blockchain === walletBlockchain) : undefined);
      const resolvedSource = activeSource ?? fallbackSource;
      if (resolvedSource && eligibleNetworks.includes(resolvedSource.blockchain)) {
        nextNetwork = resolvedSource.blockchain;
      }
    }

    if (!nextNetwork) {
      if (selectedNetworkRef.current) clearVal('receiveNetwork');
    } else if (selectedNetworkRef.current !== nextNetwork) {
      setVal('receiveNetwork', nextNetwork);
    }

    const userOwnsNetwork = !!nextNetwork && userReceiveNetworkRef.current === nextNetwork;
    const targets = nextNetwork
      ? filterAssets(getAssets([nextNetwork], { buyable: true, comingSoon: false }), assetFilter)
      : [];
    const currentTarget = selectedTargetRef.current;
    const targetOk =
      !!nextNetwork &&
      !!currentTarget &&
      currentTarget.blockchain === nextNetwork &&
      targets.some((asset) => asset.id === currentTarget.id);

    if (!targetOk) {
      const picked =
        nextNetwork && !userOwnsNetwork
          ? ((assetOut ? getAsset(targets, assetOut) : undefined) ?? lowestIdAsset(targets))
          : undefined;
      if (picked) {
        setVal('targetAsset', picked);
      } else if (currentTarget) {
        clearVal('targetAsset');
      }
    }

    const receivers = nextNetwork ? receiversFor(nextNetwork) : [];
    const currentAddress = selectedAddressRef.current;
    const reused = currentAddress?.address
      ? receivers.find((item) => item.address === currentAddress.address && item.chain === nextNetwork)
      : undefined;
    let nextAddress: Receiver | undefined;
    if (reused) {
      nextAddress = reused;
    } else if (receivers.length === 1) {
      nextAddress = receivers.find((item) => item.address);
    } else if (!userOwnsNetwork) {
      nextAddress = receivers.find((item) => item.address === session?.address);
    }

    if (!nextAddress) {
      if (currentAddress) clearVal('address');
    } else if (currentAddress?.address !== nextAddress.address || currentAddress.chain !== nextAddress.chain) {
      setVal('address', nextAddress);
    }
  }, [
    eligibleKey,
    addressKey,
    assetOut,
    blockchain,
    assetIn,
    walletBlockchain,
    selectedReceiveNetwork,
    sourceAssetKey,
    sourceSelectionKey,
    assetMapKey,
  ]);

  useEffect(() => {
    if (amountIn) {
      if (!spendClearedByUserRef.current) setVal('amount', amountIn);
    } else if (
      selectedSourceAsset &&
      !enteredAmount &&
      !selectedTargetAmount &&
      !spendClearedByUserRef.current &&
      !targetClearedByUserRef.current
    ) {
      const isStablecoin = ['USDT', 'USDC', 'DAI', 'ZCHF', 'dEURO', 'XCHF'].includes(selectedSourceAsset.name);
      setVal('amount', isStablecoin ? '100' : '0.1');
    }
  }, [amountIn, selectedSourceAsset]);

  useEffect(() => {
    if (!enteredAmount) {
      setCustomAmountError(undefined);
    }
  }, [enteredAmount]);

  // A field the user emptied stays an edit in progress until they type again.
  // SPEND data changed
  useEffect(() => {
    const exactPriceWrite = isExactPriceWriteRef.current;
    if (enteredAmount) {
      spendClearedByUserRef.current = false;
      if (enteredAmount !== previousAmountRef.current && !exactPriceWrite) {
        targetClearedByUserRef.current = false;
      }
    } else if (previousAmountRef.current) {
      spendClearedByUserRef.current = true;
    }
    if (enteredAmount !== previousAmountRef.current) isExactPriceWriteRef.current = false;
    previousAmountRef.current = enteredAmount;

    const requiresUpdate =
      enteredAmount !== paymentInfo?.amount?.toString() ||
      selectedSourceAsset?.uniqueName !== paymentInfo?.sourceAsset.uniqueName;

    const hasSpendData = enteredAmount && selectedSourceAsset;
    const hasGetData = selectedTargetAmount && selectedTargetAsset && selectedAddress;

    if (spendClearedByUserRef.current || targetClearedByUserRef.current) {
      quoteGeneration.current += 1;
      isExactPriceWriteRef.current = false;
      setIsQuoteFinal(false);
    } else if (requiresUpdate && !exactPriceWrite) {
      quoteGeneration.current += 1;
      setIsQuoteFinal(false);
      setPaymentInfo(undefined);
    }

    if (requiresUpdate) {
      if (hasSpendData && !targetClearedByUserRef.current) {
        updateData(Side.GET);
      } else if (spendClearedByUserRef.current || targetClearedByUserRef.current) {
        setValidatedData(undefined);
        setPaymentInfo(undefined);
        setKycError(undefined);
        setErrorMessage(undefined);
        setCustomAmountError(undefined);
        setIsLoading(undefined);
      } else if (hasGetData) {
        updateData(Side.SPEND);
      }
    }
  }, [enteredAmount, selectedSourceAsset]);

  // GET data changed
  useEffect(() => {
    const exactPriceWrite = isExactPriceWriteRef.current;
    if (selectedTargetAmount) {
      targetClearedByUserRef.current = false;
      if (selectedTargetAmount !== previousTargetAmountRef.current && !exactPriceWrite) {
        spendClearedByUserRef.current = false;
      }
    } else if (previousTargetAmountRef.current) {
      targetClearedByUserRef.current = true;
    }
    if (selectedTargetAmount !== previousTargetAmountRef.current) isExactPriceWriteRef.current = false;
    previousTargetAmountRef.current = selectedTargetAmount;

    const isSameTargetAmount = selectedTargetAmount === paymentInfo?.estimatedAmount?.toString();
    const chainAgrees = isEligibleQuote(
      selectedSourceAsset,
      selectedTargetAsset,
      selectedAddress,
      selectedReceiveNetwork,
    );
    const requiresUpdate =
      !isSameTargetAmount ||
      selectedTargetAsset?.uniqueName !== paymentInfo?.targetAsset?.uniqueName ||
      selectedAddress?.address !== validatedData?.receiverAddress ||
      !chainAgrees;

    const hasSpendData = enteredAmount && selectedSourceAsset;
    const hasGetData = selectedTargetAmount && selectedTargetAsset && selectedAddress;

    if (spendClearedByUserRef.current || targetClearedByUserRef.current) {
      quoteGeneration.current += 1;
      isExactPriceWriteRef.current = false;
      setIsQuoteFinal(false);
    } else if (requiresUpdate && !exactPriceWrite) {
      quoteGeneration.current += 1;
      setIsQuoteFinal(false);
      setPaymentInfo(undefined);
    }

    if (requiresUpdate) {
      if (hasGetData && !spendClearedByUserRef.current) {
        const addressOnlyChange =
          Boolean(enteredAmount) &&
          selectedAddress?.address !== validatedData?.receiverAddress &&
          selectedTargetAmount === paymentInfo?.estimatedAmount?.toString() &&
          selectedTargetAsset?.uniqueName === paymentInfo?.targetAsset?.uniqueName;
        updateData(addressOnlyChange ? Side.GET : Side.SPEND);
      } else if (targetClearedByUserRef.current || spendClearedByUserRef.current) {
        setValidatedData(undefined);
        setPaymentInfo(undefined);
        setKycError(undefined);
        setErrorMessage(undefined);
        setCustomAmountError(undefined);
        setIsLoading(undefined);
      } else if (hasSpendData) {
        updateData(Side.GET);
      }
    }
  }, [selectedTargetAmount, selectedTargetAsset, selectedAddress, selectedReceiveNetwork]);

  function updateData(sideToUpdate: Side) {
    const data = validateData({
      amount: sideToUpdate === Side.GET ? enteredAmount : undefined,
      sourceAsset: selectedSourceAsset,
      targetAsset: selectedTargetAsset,
      targetAmount: sideToUpdate === Side.SPEND || enteredAmount === undefined ? selectedTargetAmount : undefined,
      address: selectedAddress,
      receiveNetwork: selectedReceiveNetwork,
    });

    setValidatedData(data ? { ...data, sideToUpdate } : undefined);
  }

  useEffect(() => {
    let isRunning = true;

    setErrorMessage(undefined);
    setKycError(undefined);
    setPaymentInfo(undefined);
    setIsQuoteFinal(false);
    setIsLoading(undefined);

    if (!validatedData) return;

    const generation = quoteGeneration.current;
    const data: SwapPaymentInfo = { ...validatedData, externalTransactionId };

    setIsLoading(validatedData.sideToUpdate);
    receiveFor(data)
      .then((swap) => {
        if (!isRunning || !swap || generation !== quoteGeneration.current) return;
        validateSwap(swap);
        setPaymentInfo(swap);
        return receiveFor({ ...data, exactPrice: true });
      })
      .then((info) => {
        if (!isRunning || !info) return;
        if (spendClearedByUserRef.current || targetClearedByUserRef.current) return;
        if (generation !== quoteGeneration.current) return;
        if (validatedData.sideToUpdate === Side.SPEND) {
          const nextAmount = info.amount.toString();
          if (enteredAmountLiveRef.current !== nextAmount) {
            isExactPriceWriteRef.current = true;
            setVal('amount', nextAmount);
          } else {
            isExactPriceWriteRef.current = false;
          }
        } else {
          const nextTarget = info.estimatedAmount.toString();
          if (selectedTargetAmountLiveRef.current !== nextTarget) {
            isExactPriceWriteRef.current = true;
            setVal('targetAmount', nextTarget);
          } else {
            isExactPriceWriteRef.current = false;
          }
        }
        setPaymentInfo(info);
        setIsQuoteFinal(true);
      })
      .catch((error: ApiError) => {
        if (!isRunning || generation !== quoteGeneration.current) return;
        if (error.statusCode === 400 && error.message === 'Ident data incomplete') {
          navigate('/profile');
        } else {
          setPaymentInfo(undefined);
          setIsQuoteFinal(false);
          const kycErrorFromMessage = getKycErrorFromMessage(error.message);
          if (error.statusCode === 401) {
            // The login was rejected: a retry would resend the same request, so ask for a new sign-in.
            setErrorMessage(SESSION_EXPIRED_ERROR);
          } else if (kycErrorFromMessage) {
            setKycError(kycErrorFromMessage);
          } else {
            setErrorMessage(error.message ?? 'Unknown error');
          }
        }
      })
      .finally(() => {
        if (isRunning && generation === quoteGeneration.current) setIsLoading(undefined);
      });

    return () => {
      isRunning = false;
    };
  }, [useDebounce(validatedData, 500), retryToken]);

  // Bump the generation during render so an in-flight quote cannot land between this render and an effect.
  function discardStaleQuote() {
    quoteGeneration.current += 1;
    if (paymentInfo || validatedData || isQuoteFinal || kycError || errorMessage || customAmountError || isLoading) {
      setPaymentInfo(undefined);
      setValidatedData(undefined);
      setIsQuoteFinal(false);
      setKycError(undefined);
      setErrorMessage(undefined);
      setCustomAmountError(undefined);
      setIsLoading(undefined);
    }
  }

  const staleSourceId = selectedSourceAsset ? `${selectedSourceAsset.id}:${selectedSourceAsset.blockchain}` : undefined;
  const sourceIsStale =
    !!staleSourceId && !sourceAssets.some((asset) => `${asset.id}:${asset.blockchain}` === staleSourceId);
  if (!sourceIsStale) {
    staleSourceGuardRef.current = undefined;
  } else if (staleSourceGuardRef.current !== staleSourceId) {
    staleSourceGuardRef.current = staleSourceId;
    discardStaleQuote();
  }

  if (selectedReceiveNetwork !== quoteNetworkRef.current) {
    const previousNetwork = quoteNetworkRef.current;
    quoteNetworkRef.current = selectedReceiveNetwork;
    if (previousNetwork) discardStaleQuote();
  }

  const networkIsEligible = !!selectedReceiveNetwork && eligibleNetworks.includes(selectedReceiveNetwork);
  if (!selectedReceiveNetwork || networkIsEligible) {
    staleNetworkGuardRef.current = undefined;
  } else if (staleNetworkGuardRef.current !== selectedReceiveNetwork) {
    staleNetworkGuardRef.current = selectedReceiveNetwork;
    discardStaleQuote();
  }

  const targetKey = selectedTargetAsset ? `${selectedTargetAsset.id}:${selectedTargetAsset.blockchain}` : undefined;
  const targetIsEligible =
    !!targetKey &&
    networkIsEligible &&
    !!selectedTargetAsset &&
    targetAssets.some((asset) => asset.id === selectedTargetAsset.id && asset.blockchain === selectedReceiveNetwork);
  if (!selectedTargetAsset || targetIsEligible) {
    staleTargetGuardRef.current = undefined;
  } else if (staleTargetGuardRef.current !== targetKey) {
    staleTargetGuardRef.current = targetKey;
    discardStaleQuote();
  }

  const receiverKey =
    selectedAddress && selectedReceiveNetwork ? `${selectedReceiveNetwork}:${selectedAddress.address}` : undefined;
  const receiverIsEligible =
    !!receiverKey &&
    compatibleReceivers.some(
      (item) => item.address === selectedAddress?.address && item.chain === selectedReceiveNetwork,
    );
  if (!selectedAddress || receiverIsEligible) {
    staleReceiverGuardRef.current = undefined;
  } else if (staleReceiverGuardRef.current !== receiverKey) {
    staleReceiverGuardRef.current = receiverKey;
    discardStaleQuote();
  }

  function validateSwap(swap: Swap): void {
    setCustomAmountError(undefined);
    setKycError(undefined);

    // tx errors
    switch (swap.error) {
      case TransactionError.AMOUNT_TOO_LOW:
        setCustomAmountError({
          key: 'screens/payment',
          defaultValue: 'Entered amount is below minimum deposit of {{amount}} {{currency}}',
          interpolation: {
            amount: Utils.formatAmountCrypto(swap.minVolume),
            currency: swap.sourceAsset.name,
          },
          hideInfos: true,
        });
        return;

      case TransactionError.AMOUNT_TOO_HIGH:
        setCustomAmountError({
          key: 'screens/payment',
          defaultValue: 'Entered amount is above maximum deposit of {{amount}} {{currency}}',
          interpolation: {
            amount: Utils.formatAmountCrypto(swap.maxVolume),
            currency: swap.sourceAsset.name,
          },
          hideInfos: true,
        });
        return;

      case TransactionError.LIMIT_EXCEEDED:
      case TransactionError.KYC_REQUIRED:
      case TransactionError.KYC_DATA_REQUIRED:
      case TransactionError.KYC_REQUIRED_INSTANT:
      case TransactionError.BANK_TRANSACTION_MISSING:
      case TransactionError.BANK_TRANSACTION_OR_VIDEO_MISSING:
      case TransactionError.VIDEO_IDENT_REQUIRED:
      case TransactionError.NATIONALITY_NOT_ALLOWED:
      case TransactionError.IBAN_CURRENCY_MISMATCH:
      case TransactionError.PAYMENT_METHOD_NOT_ALLOWED:
      case TransactionError.TRADING_NOT_ALLOWED:
      case TransactionError.RECOMMENDATION_REQUIRED:
      case TransactionError.EMAIL_REQUIRED:
        setKycError(swap.error);
        return;
    }

    // balance check
    const balance = findBalance(swap.sourceAsset) ?? 0;
    if (balances && swap.amount > Number(balance)) {
      setCustomAmountError({
        key: 'screens/payment',
        defaultValue: 'Entered amount is higher than available balance of {{amount}} {{asset}}',
        interpolation: {
          amount: balance,
          asset: swap.sourceAsset.name,
        },
        hideInfos: false,
      });
      return;
    }
  }

  function isEligibleQuote(
    source: Asset | undefined,
    target: Asset | undefined,
    receiver: Receiver | undefined,
    network: Blockchain | undefined,
  ): boolean {
    if (!source || !target || !receiver || !network) return false;
    if (!eligibleNetworks.includes(network)) return false;
    if (target.blockchain !== network || receiver.chain !== network) return false;
    if (!sourceAssets.some((asset) => sameAsset(asset, source))) return false;
    if (!targetAssets.some((asset) => asset.id === target.id && asset.blockchain === network)) return false;
    return compatibleReceivers.some((item) => item.address === receiver.address && item.chain === network);
  }

  function validateData({
    amount: amountStr,
    sourceAsset,
    targetAsset,
    targetAmount: targetAmountStr,
    address,
    receiveNetwork,
  }: Partial<FormData>): SwapPaymentInfo | undefined {
    const amount = Number(amountStr);
    const targetAmount = Number(targetAmountStr);
    if (
      !sourceAsset ||
      !targetAsset ||
      !address ||
      !isEligibleQuote(sourceAsset, targetAsset, address, receiveNetwork)
    ) {
      return undefined;
    }
    if (amount > 0) {
      return { amount, sourceAsset, targetAsset, receiverAddress: address.address };
    }
    if (targetAmount > 0) {
      return { sourceAsset, targetAsset, targetAmount, receiverAddress: address.address };
    }
    return undefined;
  }

  function findBalance(asset: Asset): number | undefined {
    return balances?.find((item) => item.asset.id === asset.id)?.amount;
  }

  function findBalanceString(asset: Asset): string {
    const balance = findBalance(asset);
    return balance != null ? Utils.formatAmountCrypto(balance) : '';
  }

  function getPaymentInfoString(info: Swap): string {
    return translate(
      'screens/swap',
      'Send the selected amount to the address below. This address can be used multiple times, it is always the same for swaps from {{sourceChain}} to {{asset}} on {{targetChain}}.',
      {
        sourceChain: toString(info.sourceAsset.blockchain),
        targetChain: toString(info.targetAsset.blockchain),
        asset: info.targetAsset.name,
      },
    );
  }

  function onSubmit(_data?: FormData) {
    if (spendClearedByUserRef.current || targetClearedByUserRef.current) return;
    if (
      !isEligibleQuote(selectedSourceAsset, selectedTargetAsset, selectedAddress, selectedReceiveNetwork)
    ) {
      return;
    }
    if (!paymentInfo || !isQuoteFinal || kycError || errorMessage || customAmountError?.hideInfos || isProcessing)
      return;
    if (
      (selectedSourceAsset?.category === AssetCategory.PRIVATE ||
        selectedTargetAsset?.category === AssetCategory.PRIVATE) &&
      !flags?.includes('private')
    ) {
      return;
    }
    void handleNext(paymentInfo);
  }

  function onAddressSwitch() {
    logout();
    navigate('/connect', { setRedirect: true });
  }

  async function handleNext(paymentInfo: Swap): Promise<void> {
    setIsProcessing(true);
    setErrorMessage(undefined);

    try {
      if (canSendTransaction() && !activeWallet) {
        close(paymentInfo, false);
        return;
      }

      if (canSendTransaction()) {
        await sendTransaction(paymentInfo).then(setSwapTxId);
      }

      setTxDone(true);
    } catch (error: any) {
      if (error.code === 4001) return;
      setErrorMessage(
        translate(
          'screens/swap',
          'Transaction failed. Click Retry to see the deposit address for manual transfer.',
        ),
      );
    } finally {
      setIsProcessing(false);
    }
  }

  function close(swap: Swap, isComplete: boolean) {
    closeServices({ type: CloseType.SWAP, isComplete, swap }, isComplete);
  }

  const rules = Utils.createRules({
    bankAccount: Validations.Required,
    asset: Validations.Required,
    currency: Validations.Required,
    amount: Validations.Required,
  });

  useLayoutOptions({ title: translate('navigation/links', 'Swap'), textStart: true });

  const orderedSourceAssets = [...sourceAssets].sort((a, b) => (findBalance(b) || 0) - (findBalance(a) || 0));
  const requestedChainName = chainFromAssetRef(assetOut) ?? blockchain;
  const requestedUnavailable =
    !selectedReceiveNetwork &&
    !!requestedChainName &&
    !eligibleNetworks.some((chain) => chain.toLowerCase() === requestedChainName.toLowerCase());
  const missingTarget = (!!selectedReceiveNetwork && targetAssets.length === 0) || requestedUnavailable;
  const missingAddress = !!selectedReceiveNetwork && compatibleReceivers.length === 0;
  const explanationChain = (selectedReceiveNetwork ?? requestedChainName) as Blockchain | undefined;
  const showReceiveControls = !hideTargetSelection;
  const soleReceiver = compatibleReceivers.length === 1 ? compatibleReceivers.find((item) => item.address) : undefined;
  const privateAsset =
    selectedSourceAsset?.category === AssetCategory.PRIVATE
      ? selectedSourceAsset
      : selectedTargetAsset?.category === AssetCategory.PRIVATE
        ? selectedTargetAsset
        : undefined;
  const showSwitch = showReceiveControls || missingTarget || missingAddress;

  return (
    <>
      {paymentInfo && isTxDone ? (
        <SwapCompletion paymentInfo={paymentInfo} navigateOnClose={true} txId={swapTxId} />
      ) : showsSwitchScreen ? (
        <AddressSwitch onClose={(confirmed) => (confirmed ? onAddressSwitch() : setShowsSwitchScreen(false))} />
      ) : (
        <form
          className="w-full min-w-0"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <Form
            control={control}
            rules={rules}
            errors={{}}
            onSubmit={handleSubmit(onSubmit)}
            translate={translateError}
            hasFormElement={false}
          >
            <StyledVerticalStack gap={8} full center className="relative w-full min-w-0">
              <StyledVerticalStack gap={2} full>
                <h2 className="text-dfxGray-700">{translate('screens/buy', 'You spend')}</h2>
                <div className="w-full min-w-0">
                  <StyledHorizontalStack gap={1}>
                    <div className="flex-[3_1_9rem] min-w-0">
                      <StyledInput
                        type="number"
                        placeholder="0.00"
                        prefix={selectedSourceAsset && selectedSourceAsset.name}
                        name="amount"
                        buttonLabel={availableBalance ? 'MAX' : undefined}
                        buttonClick={() => availableBalance && setVal('amount', `${availableBalance}`)}
                        forceError={
                          (kycError &&
                            [
                              TransactionError.BANK_TRANSACTION_MISSING,
                              TransactionError.BANK_TRANSACTION_OR_VIDEO_MISSING,
                            ].includes(kycError)) ||
                          customAmountError != null
                        }
                        forceErrorMessage={
                          customAmountError &&
                          translate(customAmountError.key, customAmountError.defaultValue, customAmountError.interpolation)
                        }
                        loading={isLoading === Side.SPEND}
                        disabled={isLoading === Side.SPEND}
                        full
                      />
                    </div>

                    {orderedSourceAssets.length > 0 && (
                      <div className="flex-[1_1_9rem] min-w-0">
                        <StyledSearchDropdown<Asset>
                          rootRef={rootRef}
                          name="sourceAsset"
                          placeholder={translate('general/actions', 'Select') + '...'}
                          items={orderedSourceAssets}
                          labelFunc={(item) => item.name}
                          balanceFunc={findBalanceString}
                          assetIconFunc={(item) => item.name as AssetIconVariant}
                          descriptionFunc={(item) => chainName(item.blockchain)}
                          filterFunc={(item: Asset, search?: string | undefined) =>
                            !search || item.name.toLowerCase().includes(search.toLowerCase())
                          }
                          hideBalanceWhenClosed
                          full
                        />
                      </div>
                    )}
                  </StyledHorizontalStack>
                </div>
                {selectedSourceAsset && (
                  <p className="text-dfxGray-700 text-sm break-words">
                    {translate('screens/swap', 'Sending on {{chain}}', { chain: chainName(selectedSourceAsset.blockchain) })}
                  </p>
                )}
              </StyledVerticalStack>

              <StyledVerticalStack gap={2} full>
                <h2 className="text-dfxGray-700">
                  {translate('screens/buy', paymentInfo?.rate === 1 ? 'You get' : 'You get about')}
                </h2>

                <div className="w-full min-w-0">
                  <StyledHorizontalStack gap={1}>
                    <div className="flex-[3_1_9rem] min-w-0">
                      <StyledInput
                        type="number"
                        name="targetAmount"
                        loading={isLoading === Side.GET}
                        disabled={isLoading === Side.GET}
                        full
                      />
                    </div>
                    {targetAssets.length > 0 && (
                      <div className="flex-[1_1_9rem] min-w-0">
                        <StyledSearchDropdown<Asset>
                          rootRef={rootRef}
                          name="targetAsset"
                          placeholder={translate('general/actions', 'Select') + '...'}
                          items={targetAssets}
                          labelFunc={(item) => item.name}
                          balanceFunc={findBalanceString}
                          assetIconFunc={(item) => item.name as AssetIconVariant}
                          descriptionFunc={(item) => chainName(item.blockchain)}
                          filterFunc={(item: Asset, search?: string | undefined) =>
                            !search || item.name.toLowerCase().includes(search.toLowerCase())
                          }
                          hideBalanceWhenClosed
                          full
                        />
                      </div>
                    )}
                  </StyledHorizontalStack>
                </div>
              </StyledVerticalStack>

              {showReceiveControls && eligibleNetworks.length > 0 && (
                <div className="w-full min-w-0">
                  <StyledDropdown<Blockchain>
                    rootRef={rootRef}
                    name="receiveNetwork"
                    label={translate('screens/swap', 'Receiving network')}
                    aria-label={translate('screens/swap', 'Receiving network')}
                    placeholder={translate('general/actions', 'Select') + '...'}
                    items={eligibleNetworks}
                    labelFunc={(item) => chainName(item)}
                    full
                    forceEnable
                  />
                </div>
              )}

              {showReceiveControls && selectedReceiveNetwork && soleReceiver && (
                <div className="w-full min-w-0">
                  <p className="text-dfxBlue-800 text-base font-semibold ml-3.5 mb-2.5">
                    {translate('screens/swap', 'Receiving wallet')}
                  </p>
                  <p className="ml-3.5 break-all text-dfxGray-800">
                    {chainName(soleReceiver.chain)} · {soleReceiver.address}
                  </p>
                </div>
              )}

              {showReceiveControls && selectedReceiveNetwork && compatibleReceivers.length > 1 && (
                <div className="w-full min-w-0">
                  <StyledDropdown<Receiver>
                    rootRef={rootRef}
                    name="address"
                    label={translate('screens/swap', 'Receiving wallet')}
                    aria-label={translate('screens/swap', 'Receiving wallet')}
                    items={compatibleReceivers}
                    labelFunc={(item) => displayWalletAddress(item.addressLabel, { width })}
                    descriptionFunc={(item) => `${chainName(item.chain)} ${item.address}`}
                    full
                    forceEnable
                  />
                  {selectedAddress?.chain === selectedReceiveNetwork && (
                    <p className="mt-2 break-all text-sm text-dfxGray-700">{selectedAddress.address}</p>
                  )}
                </div>
              )}

              {missingTarget && explanationChain && (
                <p className="w-full break-words text-dfxGray-700">
                  {translate('screens/swap', 'No asset on {{chain}} can be received with this account.', {
                    chain: chainName(explanationChain),
                  })}
                </p>
              )}

              {missingAddress && selectedReceiveNetwork && (
                <p className="w-full break-words text-dfxGray-700">
                  {translate('screens/swap', 'No receiving address on {{chain}} is connected.', {
                    chain: chainName(selectedReceiveNetwork),
                  })}
                </p>
              )}

              {showSwitch && (
                <StyledButton
                  type="button"
                  width={StyledButtonWidth.FULL}
                  color={StyledButtonColor.STURDY_WHITE}
                  caps={false}
                  label={translate('screens/buy', 'Switch address')}
                  onClick={() => setShowsSwitchScreen(true)}
                />
              )}

              {isLoading ? (
                <StyledVerticalStack center>
                  <StyledLoadingSpinner size={SpinnerSize.LG} />
                </StyledVerticalStack>
              ) : (
                <>
                  {kycError && !customAmountError && <QuoteErrorHint type={TransactionType.SWAP} error={kycError} />}

                  {errorMessage && (
                    <QuoteRequestError message={errorMessage} onRetry={() => setRetryToken((token) => token + 1)} />
                  )}

                  {paymentInfo &&
                    !kycError &&
                    !errorMessage &&
                    !customAmountError?.hideInfos &&
                    (privateAsset && !flags?.includes('private') ? (
                      <PrivateAssetHint asset={privateAsset} />
                    ) : (
                      <>
                        <ExchangeRate
                          exchangeRate={paymentInfo.exchangeRate}
                          rate={paymentInfo.rate}
                          fees={paymentInfo.fees}
                          feeCurrency={paymentInfo.sourceAsset}
                          from={paymentInfo.sourceAsset}
                          to={paymentInfo.targetAsset}
                          steps={paymentInfo.priceSteps}
                          amountIn={paymentInfo.amount}
                          amountOut={paymentInfo.estimatedAmount}
                          type={TransactionType.SWAP}
                        />

                        <PaymentInformationContent info={paymentInfo} infoText={getPaymentInfoString(paymentInfo)} />

                        <SanctionHint />

                        <div className="w-full leading-none">
                          <StyledLink
                            label={translate(
                              'screens/payment',
                              'Please note that by using this service you automatically accept our terms and conditions. The effective exchange rate is fixed when the money is received and processed by DFX.',
                            )}
                            url={Urls.termsAndConditions}
                            small
                            dark
                          />
                          <StyledButton
                            width={StyledButtonWidth.FULL}
                            label={translate(
                              'screens/sell',
                              canSendTransaction()
                                ? 'Complete transaction in your wallet'
                                : 'Click here once you have issued the transaction',
                            )}
                            onClick={() => onSubmit()}
                            disabled={!isQuoteFinal}
                            caps={false}
                            className="mt-4"
                            isLoading={isProcessing}
                          />
                        </div>
                      </>
                    ))}
                </>
              )}
            </StyledVerticalStack>
          </Form>
        </form>
      )}
    </>
  );
}
