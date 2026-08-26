import { ApiError, PaymentLink, PaymentLinkPaymentStatus, useApi } from '@dfx.swiss/react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ExtendedPaymentLinkStatus,
  NoPaymentLinkPaymentStatus,
  PaymentLinkHistory,
  PaymentLinkPayRequest,
} from 'src/dto/payment-link.dto';
import { Lnurl } from 'src/util/lnurl';
import { fetchJson, url } from 'src/util/utils';

interface PaymentPosContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  paymentStatus: ExtendedPaymentLinkStatus | undefined;
  payRequest: PaymentLinkPayRequest | undefined;
  paymentLinkApiUrl: string | undefined;
  posUrl: string | undefined;
  error: string | undefined;
  fetchTransactionHistory: () => Promise<PaymentLinkHistory | undefined>;
  createPayment: (data: { amount: number }) => Promise<void>;
  cancelPayment: () => Promise<unknown>;
  checkAuthentication: (key: string) => Promise<any>;
}

export const PaymentPosContext = createContext<PaymentPosContextType>(undefined as any);

export function usePaymentPosContext() {
  return useContext(PaymentPosContext);
}

export default function PaymentLinkPosContext({ children }: { children: React.ReactNode }): JSX.Element {
  const { call } = useApi();

  const [payRequest, setPayRequest] = useState<PaymentLinkPayRequest>();
  const [paymentStatus, setPaymentStatus] = useState<ExtendedPaymentLinkStatus>();
  const [apiUrl, setApiUrl] = useState<string>();
  const [urlParams] = useSearchParams();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);

  const lightning = urlParams.get('lightning') ?? undefined;
  const key = urlParams.get('key') ?? '';

  // a set, not a single id: creating a payment starts a wait of its own, so more than one
  // retry can be pending at a time and a single slot would lose the older one
  const waitRetryTimers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timers = waitRetryTimers.current;

    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  const fetchPayRequest = async (url: string) => {
    const api = new URL(url);
    api.searchParams.set('timeout', '0');
    const response = await fetchJson(api.toString());
    setPayRequest(response);

    const newStatus = [400, 404].includes(response.statusCode)
      ? NoPaymentLinkPaymentStatus.NO_PAYMENT
      : PaymentLinkPaymentStatus.PENDING;
    setPaymentStatus(newStatus);
  };

  const unauthorizedResponse = (e: ApiError) => {
    if (e.statusCode === 401) setIsAuthenticated(false);
    throw e;
  };

  const checkIsPendingPayment = async () => {
    if (!key || !payRequest) return;

    const params = new URLSearchParams({
      externalLinkId: payRequest.externalId as string,
      status: PaymentLinkPaymentStatus.PENDING,
      key: key,
    });

    const history = await call<PaymentLinkHistory[]>({
      url: `paymentLink/history?${params.toString()}`,
      method: 'GET',
    }).catch(unauthorizedResponse);

    return history?.[0]?.payments[0] ? payRequest.externalId : undefined;
  };

  const fetchWait = async (): Promise<void> => {
    const externalLinkId = await checkIsPendingPayment();
    if (!externalLinkId) return setPaymentStatus(NoPaymentLinkPaymentStatus.NO_PAYMENT);

    const params = new URLSearchParams({
      externalLinkId,
      key,
    });

    return call<{ payment: { status: PaymentLinkPaymentStatus } }>({
      url: `paymentLink/payment/wait?${params.toString()}`,
      method: 'GET',
    })
      .then(({ payment }) => setPaymentStatus(payment.status))
      .catch(unauthorizedResponse)
      // The wait call answers 408 once its window closes, which lands here like any other
      // error. Ask again after a moment, so an error that comes back immediately cannot turn
      // this retry into a tight loop — but stop once the session is gone, since re-asking
      // without a valid key only repeats the same 401.
      .catch((e: ApiError) => {
        if (e.statusCode === 401) return;

        const timer = setTimeout(() => {
          waitRetryTimers.current.delete(timer);
          void fetchWait();
        }, 2 * 1000);

        waitRetryTimers.current.add(timer);
      });
  };

  const createPayment = useCallback(
    async (data: { amount: number }) => {
      if (!key || !payRequest) return;

      const params = new URLSearchParams({
        externalLinkId: payRequest.externalId as string,
        key: key,
      });

      return call<PaymentLink>({
        url: `paymentLink/payment?${params.toString()}`,
        method: 'POST',
        data: {
          amount: +data.amount,
          externalId: Math.random().toString(36).substring(2, 15),
        },
      })
        .then(() => {
          fetchPayRequest(apiUrl as string);
          fetchWait();
        })
        .catch(unauthorizedResponse);
    },
    [apiUrl, key, payRequest, call, fetchPayRequest, fetchWait],
  );

  const cancelPayment = async () => {
    if (!key || !payRequest) return;

    const params = new URLSearchParams({
      externalLinkId: payRequest.externalId as string,
      key: key,
    });

    return call({
      url: `paymentLink/payment?${params.toString()}`,
      method: 'DELETE',
    })
      .then(() => fetchPayRequest(apiUrl as string))
      .catch(unauthorizedResponse);
  };

  const fetchTransactionHistory = useCallback(async () => {
    if (!key || !payRequest) return;

    const params = new URLSearchParams({
      externalLinkId: payRequest.externalId as string,
      status: [
        PaymentLinkPaymentStatus.PENDING,
        PaymentLinkPaymentStatus.COMPLETED,
        PaymentLinkPaymentStatus.CANCELLED,
        PaymentLinkPaymentStatus.EXPIRED,
      ].join(','),
      key: key,
    });

    return call<PaymentLinkHistory[]>({
      url: `paymentLink/history?${params.toString()}`,
      method: 'GET',
    })
      .then((response) => {
        if (!response?.length) return undefined;

        return {
          ...response[0],
          payments: response[0].payments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        };
      })
      .catch(unauthorizedResponse);
  }, [key, payRequest, call]);

  const checkAuthentication = useCallback(
    async (key: string) => {
      const params = new URLSearchParams({
        externalLinkId: payRequest?.externalId as string,
        key: key,
      });

      return call<PaymentLinkHistory[]>({
        url: `paymentLink/history?${params.toString()}`,
        method: 'GET',
      }).then(() => {
        setIsAuthenticated(true);
      });
    },
    [payRequest],
  );

  // Initialization
  useEffect(() => {
    if (!lightning) return;
    const decodedUrl = Lnurl.decode(lightning) as string;

    fetchPayRequest(decodedUrl).catch((e) => setError(e.message ?? 'Unknown Error'));
    setApiUrl(decodedUrl);
  }, [lightning]);

  // To track authentication status
  useEffect(() => {
    if (isAuthenticated || !payRequest || !apiUrl) return;

    if (!key) {
      setIsLoading(false);
      return;
    }

    checkAuthentication(key)
      .then(() => setIsAuthenticated(true))
      .catch(() => setIsAuthenticated(false))
      .finally(() => setIsLoading(false));
  }, [checkAuthentication]);

  // To track payment status
  useEffect(() => {
    if (isAuthenticated) fetchWait();
  }, [isAuthenticated]);

  return (
    <PaymentPosContext.Provider
      value={{
        isLoading,
        isAuthenticated,
        paymentStatus,
        payRequest: payRequest as PaymentLinkPayRequest,
        paymentLinkApiUrl: apiUrl,
        posUrl: lightning && key ? url({ path: 'pl/pos', params: new URLSearchParams({ lightning, key }) }) : undefined,
        error,
        fetchTransactionHistory,
        createPayment,
        cancelPayment,
        checkAuthentication,
      }}
    >
      {children}
    </PaymentPosContext.Provider>
  );
}
