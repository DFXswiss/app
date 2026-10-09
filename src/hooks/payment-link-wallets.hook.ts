import { Blockchain, C2BPaymentMethod, PaymentLinkMode, TransferMethod } from '@dfx.swiss/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Api } from 'src/config/api';
import { usePaymentLinkContext } from 'src/contexts/payment-link.context';
import { WalletInfo } from 'src/dto/payment-link.dto';
import { Wallet } from 'src/util/payment-link-wallet';
import { fetchJson, url } from 'src/util/utils';

async function fetchWalletApps(): Promise<WalletInfo[]> {
  const apiUrl = url({
    base: Api.url,
    path: `/${Api.version}/paymentLink/walletApp`,
  });

  const response = await fetch(apiUrl);
  if (!response.ok) throw new Error(`Failed to fetch wallet apps: HTTP ${response.status}`);

  return response.json();
}

interface PaymentLinkWalletsProps {
  recommendedWallets: WalletInfo[];
  otherWallets: WalletInfo[];
  semiCompatibleWallets: WalletInfo[];
  getWalletById: (id: number) => WalletInfo | undefined;
  getDeeplinkByWalletId: (id: number) => Promise<string | undefined>;
  isLoading: boolean;
  error: string | undefined;
}

export const usePaymentLinkWallets = (): PaymentLinkWalletsProps => {
  const { paymentIdentifier, payRequest, paymentHasQuote } = usePaymentLinkContext();

  const [walletApps, setWalletApps] = useState<WalletInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    setIsLoading(true);
    fetchWalletApps()
      .then((apps) => setWalletApps(apps))
      .catch((err: Error) => setError(err.message ?? 'Failed to load wallet apps'))
      .finally(() => setIsLoading(false));
  }, []);

  const getDeeplinkByCategory = async (wallet: WalletInfo) => {
    if (!paymentIdentifier) return undefined;

    if (wallet.hasActionDeepLink) {
      const lightning = new URL(paymentIdentifier).searchParams.get('lightning');
      const suffix = 'lightning:';
      const prefix = wallet.deepLink && wallet.deepLink !== suffix ? wallet.deepLink : '';
      return `${prefix}${suffix}${lightning}`;
    }

    return wallet.deepLink;
  };

  const hasActionDeepLink = (wallet: WalletInfo): boolean => {
    return (wallet.supportedMethods?.includes(Blockchain.LIGHTNING) ?? false) || wallet.hasActionDeepLink === true;
  };

  const filteredPaymentLinkWallets = useMemo(() => {
    const hasQuote = paymentHasQuote(payRequest);
    const isPublicPayment = payRequest?.mode === PaymentLinkMode.PUBLIC;

    return walletApps
      .map((wallet) => ({
        ...wallet,
        active: wallet.active && (!hasQuote || Wallet.qualifiesForPayment(wallet, payRequest.transferAmounts)),
        hasActionDeepLink: hasActionDeepLink(wallet),
      }))
      .filter((wallet) => (isPublicPayment ? wallet.deepLink : true));
  }, [payRequest, walletApps]);

  const recommendedWallets = useMemo(() => {
    return filteredPaymentLinkWallets.filter((wallet) => wallet.recommended === true);
  }, [filteredPaymentLinkWallets]);

  const otherWallets = useMemo(() => {
    return filteredPaymentLinkWallets.filter((wallet) => !wallet.recommended && !wallet.semiCompatible);
  }, [filteredPaymentLinkWallets]);

  const semiCompatibleWallets = useMemo(() => {
    return filteredPaymentLinkWallets.filter((wallet) => wallet.semiCompatible);
  }, [filteredPaymentLinkWallets]);

  const getWalletById = useCallback(
    (id: number): WalletInfo | undefined => {
      return [...recommendedWallets, ...otherWallets, ...semiCompatibleWallets].find((wallet) => wallet.id === id);
    },
    [recommendedWallets, otherWallets, semiCompatibleWallets],
  );

  const fetchCallbackUrlForTransferMethod = async <T = any>(method: TransferMethod): Promise<T | undefined> => {
    if (!paymentHasQuote(payRequest)) return undefined;
    const transferAmount = payRequest.transferAmounts.find((ta) => ta.method === method);
    const asset = transferAmount?.assets[0].asset ?? '';
    const callbackUrl = url({
      base: payRequest.callback,
      params: new URLSearchParams({ quote: payRequest.quote.id, method: method.toString(), asset }),
    });
    return await fetchJson<T>(callbackUrl);
  };

  const getDeeplinkByWalletId = async (id: number): Promise<string | undefined> => {
    const wallet = getWalletById(id);
    if (!wallet || !paymentIdentifier) return undefined;

    switch (wallet.name) {
      case 'Muun':
        const { pr } = (await fetchCallbackUrlForTransferMethod<{ pr: string }>(Blockchain.LIGHTNING)) ?? {};
        return `${wallet.deepLink}${pr}`;

      case 'Binance':
        const { uri } = (await fetchCallbackUrlForTransferMethod<{ uri: string }>(C2BPaymentMethod.BINANCE_PAY)) ?? {};
        return uri;

      case 'KuCoin Pay':
        const { uri: kucoinUri } =
          (await fetchCallbackUrlForTransferMethod<{ uri: string }>(C2BPaymentMethod.KUCOIN_PAY)) ?? {};
        return kucoinUri;

      default:
        return getDeeplinkByCategory(wallet);
    }
  };

  return {
    recommendedWallets,
    otherWallets,
    semiCompatibleWallets,
    getWalletById,
    getDeeplinkByWalletId,
    isLoading,
    error,
  };
};
