// DFX App 2.0 — OpenCryptoPay state + actions hook.
//
// Ported from the static preview's OCP module (public/app2/index.html,
// ~lines 2190-2620): the `OCP` state object, `ocpProbe`/`ocpLoad*` loaders,
// DEMO mode (`buildDemo`/`enableDemo`/`disableDemo`), and every create/toggle
// action the routes/invoice/links/pos/config sub-views drive. State lives here
// (mounted once by OcpScreen) and is passed down to each sub-view via props, so
// switching sub-views never loses loaded data — mirroring the static app's
// single global `OCP` object.
//
// Endpoints reuse the @dfx.swiss/react SDK (`usePaymentRoutes`) wherever a
// method matches the static app 1:1; the two cases the SDK has no method for
// (the GET /paymentLink/payment invoice lookup and GET /paymentLink/history)
// and the two cases where the SDK's typed body diverges from the static app's
// wire shape (route toggle PUT /<type>/<id>, create-link POST /paymentLink with
// only `routeId`, POS poll GET /paymentLink?id=) go through the raw `useApi`
// call to preserve functional truth.

import {
  ApiException,
  Blockchain,
  type PaymentLink,
  PaymentLinkPaymentStatus,
  PaymentLinkStatus,
  type PaymentLinkConfig,
  type PaymentRoutes,
  type PaymentRouteType,
  type SellRoute,
  type UpdatePaymentLinkConfig,
  useApi,
  usePaymentRoutes,
} from '@dfx.swiss/react';
import { useCallback, useMemo, useState } from 'react';
import { useToast } from '../../components/ui';
import { useT } from '../../i18n';
import { useWalletSession } from '../../wallets/session';
import { formatDateTime } from '../parts/format';
import { lnurlEncode } from './lnurl';

// The sub-views OcpScreen routes between. `home` and `apply` live in OcpScreen;
// the other six are the stub files filled in by the sub-view agents.
export type OcpSub = 'home' | 'apply' | 'routes' | 'invoice' | 'links' | 'pos' | 'history' | 'config';

// GET /paymentLink/config additionally returns a merchant `accessKey` the static
// app surfaces on the hub; the SDK's PaymentLinkConfig doesn't declare it.
export type OcpConfig = PaymentLinkConfig & { accessKey?: string };

export interface OcpHistoryItem {
  id: string | number;
  note: string;
  amount: number;
  currency: string;
  status: string;
  when: string;
}

export interface OcpHistory {
  items: OcpHistoryItem[];
  total: number;
}

/** Input for `createRoute` (adds a Lightning sell route — POST /sell). */
export interface CreateRouteInput {
  iban: string;
  /** Fiat id (stringified `<option value>`); omitted → API default currency. */
  currencyId?: string;
  /** Blockchain name; defaults to `Bitcoin` when empty, mirroring the static app. */
  blockchain: string;
}

/** Input for `createInvoice` (recipient route + amount + id → real OCP LNURL). */
export interface CreateInvoiceInput {
  routeId: string;
  amount: number;
  currency: string;
  /** The merchant-facing invoice id / message. */
  message: string;
}

/** The value `useOcp()` returns — the exact surface every OCP sub-view consumes. */
export interface OcpApi {
  // --- demo mode -----------------------------------------------------------
  demo: boolean;
  enableDemo: () => void;
  disableDemo: () => void;

  // --- state ---------------------------------------------------------------
  /** Activation gate: `true` active, `false` not applied, `null` unknown (probe first). */
  active: boolean | null;
  config: OcpConfig | null;
  routes: PaymentRoutes | null;
  routesError: boolean;
  links: PaymentLink[] | null;
  history: OcpHistory | null;

  // --- loaders (fetch + set state) ----------------------------------------
  /** GET /paymentLink/config → activation + config (403 ⇒ not active). */
  probe: () => Promise<void>;
  /** GET /route. */
  loadRoutes: () => Promise<void>;
  /** GET /paymentLink. */
  loadLinks: () => Promise<void>;
  /** GET /paymentLink/history. */
  loadHistory: () => Promise<void>;

  // --- derived -------------------------------------------------------------
  lightningReady: boolean;
  sellRoutes: SellRoute[];
  /** Sell routes usable for OCP (Lightning deposit or active) — gates invoice/link create. */
  lnSellRoutes: SellRoute[];

  // --- route actions -------------------------------------------------------
  /** POST /sell, then reload routes. Throws `ApiException` on failure. */
  createRoute: (input: CreateRouteInput) => Promise<void>;
  /** PUT /<type>/<id> { active }, then reload routes. Throws on failure. */
  toggleRoute: (type: PaymentRouteType, id: string | number, active: boolean) => Promise<void>;

  // --- link actions --------------------------------------------------------
  /** POST /paymentLink { routeId }, then reload links. Throws on failure. */
  createLink: (routeId: string | number) => Promise<void>;
  /** PUT /paymentLink?linkId { status }, then reload links. Throws on failure. */
  toggleLink: (id: string | number, active: boolean) => Promise<void>;
  /** PUT /paymentLink/pos?linkId → a safe (https, *.dfx.swiss) POS URL, or `undefined`. */
  createPosLink: (id: string | number) => Promise<string | undefined>;

  // --- invoice / pos -------------------------------------------------------
  /** GET /paymentLink/payment → { lnurl } for the invoice QR. Throws on failure. */
  createInvoice: (input: CreateInvoiceInput) => Promise<{ lnurl: string }>;
  /** POST /paymentLink/payment?linkId { amount } → { lnurl } for the POS QR. Throws on failure. */
  charge: (linkId: string | number, amount: number) => Promise<{ lnurl: string }>;
  /** GET /paymentLink?id → the current payment status (for POS polling). */
  pollPayment: (id: string | number) => Promise<PaymentLinkPaymentStatus | undefined>;

  // --- config --------------------------------------------------------------
  /** PUT /paymentLink/config. Throws on failure. */
  saveConfig: (body: UpdatePaymentLinkConfig) => Promise<void>;

  // --- helpers -------------------------------------------------------------
  /** Copy to clipboard with a `copied` / `copyFail` toast (mirrors the static app's `cpy`). */
  copy: (value: string | undefined) => void;
  /** The versioned API base (`useApi().defaultUrl`), e.g. for building `/lnurlp/<id>` URLs. */
  apiBaseUrl: string;
}

/** The props every OCP sub-view (routes/invoice/links/pos/history/config) receives. */
export interface OcpSubViewProps {
  ocp: OcpApi;
  go: (sub: OcpSub) => void;
}

// Only https + *.dfx.swiss POS URLs are followed (mirrors the static app's
// `safeDfxUrl`) — an API-returned link is never opened blindly.
function safeDfxUrl(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && (url.hostname === 'dfx.swiss' || url.hostname.endsWith('.dfx.swiss'))) {
      return url.href;
    }
  } catch {
    /* not a URL */
  }
  return undefined;
}

// Shape of one entry in the GET /paymentLink/history response (a link with its
// payments); only the fields the static app reads are typed.
interface HistoryLink {
  payments?: Array<{
    id: string | number;
    note?: string;
    externalId?: string;
    amount: number;
    currency: string;
    status: string;
    date?: string;
  }>;
  totalCompletedAmount?: number;
}

export function useOcp(): OcpApi {
  const { call, defaultUrl: apiBaseUrl } = useApi();
  const { getPaymentLinks, updatePaymentLink, updateUserPaymentLinksConfig, createPosLink } = usePaymentRoutes();
  const { blockchains } = useWalletSession();
  const { showToast } = useToast();
  const { t, language } = useT();

  const [demo, setDemo] = useState(false);
  const [active, setActive] = useState<boolean | null>(null);
  const [config, setConfig] = useState<OcpConfig | null>(null);
  const [routes, setRoutes] = useState<PaymentRoutes | null>(null);
  const [routesError, setRoutesError] = useState(false);
  const [links, setLinks] = useState<PaymentLink[] | null>(null);
  const [history, setHistory] = useState<OcpHistory | null>(null);

  const demoLnurl = useCallback((id: string) => lnurlEncode(`${apiBaseUrl}/lnurlp/${id}`), [apiBaseUrl]);

  // ---- DEMO builders (mirror buildDemo / DEMO_HISTORY) ----------------------
  const buildDemoConfig = useCallback(
    (): OcpConfig =>
      ({
        accessKey: 'ocp_demo_8f3a21c9b7',
        standards: ['OpenCryptoPay', 'LightningBolt11', 'PayToAddress'],
        minCompletionStatus: 'TxMempool',
        displayQr: true,
        paymentTimeout: 60,
        cancellable: true,
        fee: 0.4,
      }) as unknown as OcpConfig,
    [],
  );

  const buildDemoRoutes = useCallback(
    (): PaymentRoutes =>
      ({
        sell: [
          {
            id: 201,
            active: true,
            currency: { name: 'CHF' },
            iban: 'CH93 0076 2011 6238 5295 7',
            deposit: { address: 'LNURL1DP68GURN8GHJ7MR0VA5KU0MTNT9', blockchains: ['Lightning'] },
            volume: 12450,
            annualVolume: 48200,
            fee: 0.9,
          },
        ],
        buy: [
          {
            id: 188,
            active: true,
            asset: { name: 'BTC' },
            iban: 'CH93 0076 2011 6238 5295 7',
            bankUsage: 'DFX-9F3A-21C9',
            volume: 8800,
            annualVolume: 31000,
            fee: 0.99,
          },
        ],
        swap: [],
        // The static demo objects are partial vs. the SDK's route interfaces;
        // the UI only reads the fields present here.
      }) as unknown as PaymentRoutes,
    [],
  );

  const buildDemoLinks = useCallback(
    (): PaymentLink[] =>
      [
        {
          id: 301,
          label: 'Front counter',
          routeId: 201,
          externalId: 'till-1',
          status: 'Active',
          mode: 'Multiple',
          lnurl: demoLnurl('pl_demo_front'),
          payment: { amount: 24.9, currency: 'CHF', status: 'Completed', mode: 'Single' },
        },
        {
          id: 302,
          label: 'Online shop',
          routeId: 201,
          externalId: 'web',
          status: 'Inactive',
          mode: 'Public',
          lnurl: demoLnurl('pl_demo_web'),
        },
      ] as unknown as PaymentLink[],
    [demoLnurl],
  );

  const buildDemoHistory = useCallback((): OcpHistory => {
    const items: OcpHistoryItem[] = [
      {
        id: 9001,
        note: 'Coffee & croissant',
        amount: 8.5,
        currency: 'CHF',
        status: 'Completed',
        when: 'Today · 14:22',
      },
      { id: 9002, note: 'Lunch menu', amount: 24.9, currency: 'CHF', status: 'Completed', when: 'Today · 12:08' },
      { id: 9003, note: 'Gift card', amount: 50, currency: 'CHF', status: 'Pending', when: 'Today · 11:51' },
      { id: 9004, note: 'Refund', amount: 5, currency: 'CHF', status: 'Cancelled', when: 'Yesterday · 17:30' },
    ];
    const total = items.filter((p) => p.status === 'Completed').reduce((a, p) => a + p.amount, 0);
    return { items, total };
  }, []);

  const enableDemo = useCallback(() => {
    setDemo(true);
    setActive(true);
    setConfig(buildDemoConfig());
    setRoutes(buildDemoRoutes());
    setLinks(buildDemoLinks());
    setHistory(null);
    showToast(t('demoOn'));
  }, [buildDemoConfig, buildDemoRoutes, buildDemoLinks, showToast, t]);

  const disableDemo = useCallback(() => {
    setDemo(false);
    setActive(null);
    setConfig(null);
    setRoutes(null);
    setLinks(null);
    setHistory(null);
    showToast(t('demoOff'));
  }, [showToast, t]);

  // ---- loaders --------------------------------------------------------------
  const probe = useCallback(async () => {
    if (demo) {
      setActive(true);
      setConfig((prev) => prev ?? buildDemoConfig());
      return;
    }
    try {
      const cfg = await call<OcpConfig>({ url: '/paymentLink/config', method: 'GET' });
      setActive(true);
      setConfig(cfg);
    } catch (error) {
      // 403 ⇒ not applied/activated; anything else ⇒ surface honestly as "not active".
      const status = error instanceof ApiException ? error.statusCode : undefined;
      setActive(false);
      if (status === 403) setConfig(null);
    }
  }, [demo, call, buildDemoConfig]);

  const loadRoutes = useCallback(async () => {
    if (demo) {
      setRoutes((prev) => prev ?? buildDemoRoutes());
      setRoutesError(false);
      return;
    }
    try {
      const data = await call<PaymentRoutes>({ url: '/route', method: 'GET' });
      setRoutes(data ?? { buy: [], sell: [], swap: [] });
      setRoutesError(false);
    } catch {
      setRoutes({ buy: [], sell: [], swap: [] });
      setRoutesError(true);
    }
  }, [demo, call, buildDemoRoutes]);

  const loadLinks = useCallback(async () => {
    if (demo) {
      setLinks((prev) => prev ?? buildDemoLinks());
      return;
    }
    try {
      const data = await getPaymentLinks();
      const list = (Array.isArray(data) ? data : [data]).filter(Boolean) as PaymentLink[];
      setLinks(list);
    } catch {
      setLinks([]);
    }
  }, [demo, getPaymentLinks, buildDemoLinks]);

  const loadHistory = useCallback(async () => {
    if (demo) {
      setHistory(buildDemoHistory());
      return;
    }
    try {
      const data = await call<HistoryLink[]>({ url: '/paymentLink/history', method: 'GET' });
      const items: OcpHistoryItem[] = [];
      let total = 0;
      if (Array.isArray(data)) {
        for (const link of data) {
          for (const p of link.payments ?? []) {
            items.push({
              id: p.id,
              note: p.note || p.externalId || '',
              amount: p.amount,
              currency: p.currency,
              status: p.status,
              when: p.date ? formatDateTime(p.date, language) : '',
            });
          }
          total += link.totalCompletedAmount || 0;
        }
      }
      items.sort((a, b) => Number(b.id) - Number(a.id));
      setHistory({ items, total });
    } catch {
      setHistory({ items: [], total: 0 });
    }
  }, [demo, call, language, buildDemoHistory]);

  // ---- derived --------------------------------------------------------------
  const lightningReady = (blockchains ?? []).includes(Blockchain.LIGHTNING);
  const sellRoutes = useMemo(() => routes?.sell ?? [], [routes]);
  const lnSellRoutes = useMemo(
    () => sellRoutes.filter((r) => (r.deposit?.blockchains ?? []).includes(Blockchain.LIGHTNING) || r.active),
    [sellRoutes],
  );

  // ---- route actions --------------------------------------------------------
  const createRoute = useCallback(
    async ({ iban, currencyId, blockchain }: CreateRouteInput) => {
      if (demo) {
        const nid = 200 + (routes?.sell?.length ?? 0) + Math.floor(Math.random() * 40) + 1;
        setRoutes((prev) => {
          const base = prev ?? buildDemoRoutes();
          const demoRoute = {
            id: nid,
            active: true,
            currency: { name: 'CHF' },
            iban,
            deposit: { address: `LNURL1DP68GURN8GHJ7${nid}`, blockchains: [blockchain || 'Lightning'] },
            volume: 0,
            annualVolume: 0,
            fee: 0.9,
          } as unknown as SellRoute;
          return { ...base, sell: [demoRoute, ...base.sell] };
        });
        return;
      }
      const body = {
        iban,
        currency: currencyId ? { id: +currencyId } : undefined,
        blockchain: blockchain || 'Bitcoin',
      };
      await call({ url: '/sell', method: 'POST', data: body });
      setRoutes(null);
      await loadRoutes();
    },
    [demo, routes, buildDemoRoutes, call, loadRoutes],
  );

  const toggleRoute = useCallback(
    async (type: PaymentRouteType, id: string | number, activeTo: boolean) => {
      if (demo) {
        setRoutes((prev) => {
          if (!prev) return prev;
          const arr = prev[type];
          const next = arr.map((r) => (String(r.id) === String(id) ? { ...r, active: activeTo } : r));
          return { ...prev, [type]: next };
        });
        return;
      }
      await call({ url: `/${type}/${id}`, method: 'PUT', data: { active: activeTo } });
      setRoutes(null);
      await loadRoutes();
    },
    [demo, call, loadRoutes],
  );

  // ---- link actions ---------------------------------------------------------
  const createLink = useCallback(
    async (routeId: string | number) => {
      if (demo) {
        const nid = 300 + (links?.length ?? 0) + Math.floor(Math.random() * 60) + 1;
        setLinks((prev) => {
          const demoLink = {
            id: nid,
            label: `${t('ocpLink')} ${nid}`,
            routeId,
            status: 'Active',
            mode: 'Multiple',
            lnurl: demoLnurl(`pl_demo_${nid}`),
          } as unknown as PaymentLink;
          return [demoLink, ...(prev ?? [])];
        });
        return;
      }
      await call({ url: '/paymentLink', method: 'POST', data: { routeId: +routeId } });
      setLinks(null);
      await loadLinks();
    },
    [demo, links, t, demoLnurl, call, loadLinks],
  );

  const toggleLink = useCallback(
    async (id: string | number, activeTo: boolean) => {
      if (demo) {
        setLinks((prev) =>
          (prev ?? []).map((l) =>
            String(l.id) === String(id) ? { ...l, status: (activeTo ? 'Active' : 'Inactive') as PaymentLinkStatus } : l,
          ),
        );
        return;
      }
      await updatePaymentLink({ status: activeTo ? PaymentLinkStatus.ACTIVE : PaymentLinkStatus.INACTIVE }, String(id));
      setLinks(null);
      await loadLinks();
    },
    [demo, updatePaymentLink, loadLinks],
  );

  const createPosLinkUrl = useCallback(
    async (id: string | number): Promise<string | undefined> => {
      if (demo) return undefined; // demo terminal lives on the POS sub-view, no external URL
      const pos = await createPosLink(String(id));
      return safeDfxUrl(pos?.url);
    },
    [demo, createPosLink],
  );

  // ---- invoice / pos --------------------------------------------------------
  const createInvoice = useCallback(
    async ({ routeId, amount, currency, message }: CreateInvoiceInput): Promise<{ lnurl: string }> => {
      if (demo) {
        const lnurl = demoLnurl(`inv_${routeId}_${Math.round(amount * 100)}_${message.replace(/\W+/g, '')}`);
        return { lnurl };
      }
      const expiryDate = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
      const query = new URLSearchParams({
        routeId: String(routeId),
        amount: String(amount),
        currency,
        message,
        expiryDate,
      }).toString();
      const data = await call<{ id: string | number }>({ url: `/paymentLink/payment?${query}`, method: 'GET' });
      if (!data?.id) throw new ApiException(0, t('genErr'));
      const lnurl = lnurlEncode(`${apiBaseUrl}/lnurlp/${data.id}`);
      return { lnurl };
    },
    [demo, demoLnurl, call, apiBaseUrl, t],
  );

  const charge = useCallback(
    async (linkId: string | number, amount: number): Promise<{ lnurl: string }> => {
      const link = (links ?? []).find((l) => String(l.id) === String(linkId));
      if (demo) {
        const lnurl = link?.lnurl || demoLnurl(`pos_${linkId}_${Math.round(amount * 100)}`);
        return { lnurl };
      }
      const data = await call<{ payment?: { lnurl?: string }; lnurl?: string }>({
        url: `/paymentLink/payment?linkId=${encodeURIComponent(String(linkId))}`,
        method: 'POST',
        data: { amount },
      });
      const lnurl =
        data?.payment?.lnurl || data?.lnurl || link?.lnurl || demoLnurl(`pos_${linkId}_${Math.round(amount * 100)}`);
      return { lnurl };
    },
    [demo, links, call, demoLnurl],
  );

  const pollPayment = useCallback(
    async (id: string | number): Promise<PaymentLinkPaymentStatus | undefined> => {
      try {
        const data = await call<{ payment?: { status?: PaymentLinkPaymentStatus } }>({
          url: `/paymentLink?id=${encodeURIComponent(String(id))}`,
          method: 'GET',
        });
        return data?.payment?.status;
      } catch {
        return undefined;
      }
    },
    [call],
  );

  // ---- config ---------------------------------------------------------------
  const saveConfig = useCallback(
    async (body: UpdatePaymentLinkConfig) => {
      if (demo) {
        setConfig((prev) => ({ ...(prev ?? buildDemoConfig()), ...body }));
        return;
      }
      await updateUserPaymentLinksConfig(body);
      setConfig((prev) => (prev ? { ...prev, ...body } : prev));
    },
    [demo, buildDemoConfig, updateUserPaymentLinksConfig],
  );

  // ---- helpers --------------------------------------------------------------
  const copy = useCallback(
    (value: string | undefined) => {
      if (!value) return;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard
          .writeText(value)
          .then(() => showToast(t('copied')))
          .catch(() => showToast(t('copyFail')));
      } else {
        showToast(t('copyFail'));
      }
    },
    [showToast, t],
  );

  return useMemo(
    () => ({
      demo,
      enableDemo,
      disableDemo,
      active,
      config,
      routes,
      routesError,
      links,
      history,
      probe,
      loadRoutes,
      loadLinks,
      loadHistory,
      lightningReady,
      sellRoutes,
      lnSellRoutes,
      createRoute,
      toggleRoute,
      createLink,
      toggleLink,
      createPosLink: createPosLinkUrl,
      createInvoice,
      charge,
      pollPayment,
      saveConfig,
      copy,
      apiBaseUrl,
    }),
    [
      demo,
      enableDemo,
      disableDemo,
      active,
      config,
      routes,
      routesError,
      links,
      history,
      probe,
      loadRoutes,
      loadLinks,
      loadHistory,
      lightningReady,
      sellRoutes,
      lnSellRoutes,
      createRoute,
      toggleRoute,
      createLink,
      toggleLink,
      createPosLinkUrl,
      createInvoice,
      charge,
      pollPayment,
      saveConfig,
      copy,
      apiBaseUrl,
    ],
  );
}
