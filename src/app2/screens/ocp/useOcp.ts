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
// API requests go through the @dfx.swiss/react SDK; useApi is used only for its
// versioned base URL when constructing an LNURL.
// Deactivating a route uses `deletePaymentRoute` (PUT { active: false }).

import {
  ApiException,
  Blockchain,
  type CreatePaymentLink,
  type CreatePaymentLinkPayment,
  type PaymentLink,
  PaymentLinkPaymentStatus,
  PaymentLinkStatus,
  type PaymentLinkConfig,
  type PaymentRoutes,
  type PaymentRouteType,
  type SellRoute,
  type UpdatePaymentLinkConfig,
  useApi,
  useApiSession,
  usePaymentRoutes,
} from '@dfx.swiss/react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../components/ui';
import { useT } from '../../i18n';
import { useWalletSession } from '../../wallets/session';
import { formatDateTime } from '../parts/format';
import { extractChargeLnurl } from './charge-lnurl';
import { selectLightningSellRoutes } from './ln-sell-routes';
import { lnurlEncode } from './lnurl';
import { probeFailureKind } from './probe-status';

export { extractChargeLnurl } from './charge-lnurl';
export { probeFailureKind } from './probe-status';

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
  /** Current wallet identity; used to prevent reusing another account's cached till state. */
  sessionAddress: string | undefined;
  /** API account plus wallet identity; wallet addresses can survive an account merge. */
  sessionIdentity: string;
  /** Non-403 probe failure (network/5xx) — keep previous config; show retry. */
  probeError: boolean;
  config: OcpConfig | null;
  routes: PaymentRoutes | null;
  routesError: boolean;
  links: PaymentLink[] | null;
  /** API account + wallet identity that produced `links`; null means stale. */
  linksIdentity: string | undefined;
  linksError: boolean;
  history: OcpHistory | null;
  historyError: boolean;

  // --- loaders (fetch + set state) ----------------------------------------
  /** GET /paymentLink/config → activation + config (403 ⇒ not active; other errors ⇒ probeError). */
  probe: () => Promise<void>;
  /** GET /route. */
  loadRoutes: () => Promise<void>;
  /** GET /paymentLink. */
  /** Returns the authoritative current-account list, or null if the refresh failed/staled. */
  loadLinks: () => Promise<PaymentLink[] | null>;
  /** GET /paymentLink/history. */
  loadHistory: () => Promise<void>;

  // --- derived -------------------------------------------------------------
  lightningReady: boolean;
  sellRoutes: SellRoute[];
  /** Active sell routes with a Lightning deposit — gates invoice/link create. */
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
  /** POST /paymentLink/payment?linkId { amount, externalId } → LNURL + poll identifier. */
  charge: (
    linkId: string | number,
    amount: number,
    externalId?: string,
  ) => Promise<{ lnurl: string; externalId: string }>;
  /** GET /paymentLink filtered by linkId + externalPaymentId → that POS charge's status. */
  pollPayment: (linkId: string | number, externalPaymentId: string) => Promise<PaymentLinkPaymentStatus | undefined>;

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

export function useOcp(): OcpApi {
  const { defaultUrl: apiBaseUrl } = useApi();
  const {
    getPaymentLinks,
    getPaymentRoutes,
    getUserPaymentLinksConfig,
    createPaymentLink,
    createPaymentLinkPayment,
    updatePaymentLink,
    updateUserPaymentLinksConfig,
    createPosLink,
    deletePaymentRoute,
    getPaymentLinkHistory,
    createPaymentLinkInvoice,
    createSellPaymentRoute,
    activatePaymentRoute,
  } = usePaymentRoutes();
  const { blockchains, address } = useWalletSession();
  const { session: apiSession } = useApiSession();
  const sessionIdentity = JSON.stringify([
    apiSession?.account == null ? null : String(apiSession.account),
    address ?? null,
  ]);
  const { showToast } = useToast();
  const { t, language } = useT();

  const [demo, setDemo] = useState(false);
  const [active, setActive] = useState<boolean | null>(null);
  const [probeError, setProbeError] = useState(false);
  const [config, setConfig] = useState<OcpConfig | null>(null);
  const [routes, setRoutes] = useState<PaymentRoutes | null>(null);
  const [routesError, setRoutesError] = useState(false);
  const [links, setLinks] = useState<PaymentLink[] | null>(null);
  const [linksIdentity, setLinksIdentity] = useState<string | undefined>();
  const [linksError, setLinksError] = useState(false);
  const [history, setHistory] = useState<OcpHistory | null>(null);
  const [historyError, setHistoryError] = useState(false);
  // Bumped on every demo on/off and on every API-account or wallet-identity change so a response
  // that started under the other mode or account cannot write after the switch.
  const demoEpochRef = useRef(0);
  const sessionIdentityRef = useRef(sessionIdentity);
  const sessionIdentityReady = sessionIdentityRef.current === sessionIdentity;
  useLayoutEffect(() => {
    if (sessionIdentityRef.current === sessionIdentity) return;
    sessionIdentityRef.current = sessionIdentity;
    demoEpochRef.current += 1;
    setDemo(false);
    setActive(null);
    setProbeError(false);
    setConfig(null);
    setRoutes(null);
    setRoutesError(false);
    setLinks(null);
    setLinksIdentity(undefined);
    setLinksError(false);
    setHistory(null);
    setHistoryError(false);
  }, [sessionIdentity]);

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
    demoEpochRef.current += 1;
    setDemo(true);
    setActive(true);
    setProbeError(false);
    setConfig(buildDemoConfig());
    setRoutes(buildDemoRoutes());
    setLinks(buildDemoLinks());
    setLinksIdentity(sessionIdentity);
    setHistory(null);
    showToast(t('demoOn'));
  }, [address, sessionIdentity, buildDemoConfig, buildDemoRoutes, buildDemoLinks, showToast, t]);

  const disableDemo = useCallback(() => {
    demoEpochRef.current += 1;
    setDemo(false);
    setActive(null);
    setProbeError(false);
    setConfig(null);
    setRoutes(null);
    setLinks(null);
    setLinksIdentity(undefined);
    setHistory(null);
    showToast(t('demoOff'));
  }, [showToast, t]);

  // ---- loaders --------------------------------------------------------------
  const probe = useCallback(async () => {
    if (demo) {
      setActive(true);
      setProbeError(false);
      return;
    }
    const epoch = demoEpochRef.current;
    try {
      const cfg = (await getUserPaymentLinksConfig()) as OcpConfig;
      if (epoch !== demoEpochRef.current) return;
      setActive(true);
      setProbeError(false);
      setConfig(cfg);
    } catch (error) {
      if (epoch !== demoEpochRef.current) return;
      const status = error instanceof ApiException ? error.statusCode : undefined;
      // Only 403 means "not activated". Network/5xx/401 must not drop an active
      // merchant into the apply/demo view or discard a previously good config.
      if (probeFailureKind(status) === 'not-activated') {
        setActive(false);
        setConfig(null);
        setProbeError(false);
      } else {
        setProbeError(true);
      }
    }
  }, [demo, getUserPaymentLinksConfig]);

  const loadRoutes = useCallback(async () => {
    if (demo) {
      setRoutesError(false);
      return;
    }
    const epoch = demoEpochRef.current;
    try {
      const data = await getPaymentRoutes();
      if (epoch !== demoEpochRef.current) return;
      setRoutes(data ?? { buy: [], sell: [], swap: [] });
      setRoutesError(false);
    } catch {
      if (epoch !== demoEpochRef.current) return;
      setRoutes({ buy: [], sell: [], swap: [] });
      setRoutesError(true);
    }
  }, [demo, getPaymentRoutes]);

  const loadLinks = useCallback(async () => {
    if (demo) {
      setLinksError(false);
      return [];
    }
    const epoch = demoEpochRef.current;
    try {
      const data = await getPaymentLinks();
      if (epoch !== demoEpochRef.current) return null;
      const list = (Array.isArray(data) ? data : [data]).filter(Boolean) as PaymentLink[];
      setLinks(list);
      setLinksIdentity(sessionIdentity);
      setLinksError(false);
      return list;
    } catch {
      if (epoch !== demoEpochRef.current) return null;
      setLinks([]);
      setLinksIdentity(sessionIdentity);
      setLinksError(true);
      return null;
    }
  }, [demo, getPaymentLinks, sessionIdentity]);

  const loadHistory = useCallback(async () => {
    if (demo) {
      setHistoryError(false);
      setHistory(buildDemoHistory());
      return;
    }
    const epoch = demoEpochRef.current;
    try {
      const data = await getPaymentLinkHistory();
      if (epoch !== demoEpochRef.current) return;
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
      setHistoryError(false);
    } catch {
      if (epoch !== demoEpochRef.current) return;
      setHistory({ items: [], total: 0 });
      setHistoryError(true);
    }
  }, [demo, getPaymentLinkHistory, language, buildDemoHistory]);

  // ---- derived --------------------------------------------------------------
  const lightningReady = (blockchains ?? []).includes(Blockchain.LIGHTNING);
  const sellRoutes = useMemo(() => routes?.sell ?? [], [routes]);
  const lnSellRoutes = useMemo(() => selectLightningSellRoutes(sellRoutes), [sellRoutes]);

  // ---- route actions --------------------------------------------------------
  const createRoute = useCallback(
    async ({ iban, currencyId, blockchain }: CreateRouteInput) => {
      if (demo) {
        const nid = 200 + (routes as NonNullable<typeof routes>).sell.length + Math.floor(Math.random() * 40) + 1;
        setRoutes((prev) => {
          const base = prev as NonNullable<typeof prev>;
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
      const epoch = demoEpochRef.current;
      await createSellPaymentRoute(body);
      if (epoch !== demoEpochRef.current) return;
      setRoutes(null);
      await loadRoutes();
    },
    [demo, routes, createSellPaymentRoute, loadRoutes],
  );

  const toggleRoute = useCallback(
    async (type: PaymentRouteType, id: string | number, activeTo: boolean) => {
      if (demo) {
        setRoutes((prev) => {
          const current = prev as NonNullable<typeof prev>;
          const next = current[type].map((r) => (String(r.id) === String(id) ? { ...r, active: activeTo } : r));
          return { ...current, [type]: next };
        });
        return;
      }
      const epoch = demoEpochRef.current;
      if (activeTo) {
        await activatePaymentRoute(Number(id), type);
      } else {
        await deletePaymentRoute(Number(id), type);
      }
      if (epoch !== demoEpochRef.current) return;
      setRoutes(null);
      await loadRoutes();
    },
    [demo, activatePaymentRoute, deletePaymentRoute, loadRoutes],
  );

  // ---- link actions ---------------------------------------------------------
  const createLink = useCallback(
    async (routeId: string | number) => {
      if (demo) {
        const nid = 300 + (links as NonNullable<typeof links>).length + Math.floor(Math.random() * 60) + 1;
        setLinks((prev) => {
          const demoLink = {
            id: nid,
            label: `${t('ocpLink')} ${nid}`,
            routeId,
            status: 'Active',
            mode: 'Multiple',
            lnurl: demoLnurl(`pl_demo_${nid}`),
          } as unknown as PaymentLink;
          return [demoLink, ...(prev as NonNullable<typeof prev>)];
        });
        return;
      }
      // Wire body is routeId-only (merchant create-link); SDK types also require
      // recipient for full forms — cast keeps the same payload the API accepts.
      const epoch = demoEpochRef.current;
      await createPaymentLink({ routeId: +routeId } as CreatePaymentLink);
      if (epoch !== demoEpochRef.current) return;
      setLinks(null);
      await loadLinks();
    },
    [demo, links, t, demoLnurl, createPaymentLink, loadLinks],
  );

  const toggleLink = useCallback(
    async (id: string | number, activeTo: boolean) => {
      if (demo) {
        setLinks((prev) =>
          (prev as NonNullable<typeof prev>).map((l) =>
            String(l.id) === String(id) ? { ...l, status: (activeTo ? 'Active' : 'Inactive') as PaymentLinkStatus } : l,
          ),
        );
        return;
      }
      const epoch = demoEpochRef.current;
      await updatePaymentLink({ status: activeTo ? PaymentLinkStatus.ACTIVE : PaymentLinkStatus.INACTIVE }, String(id));
      if (epoch !== demoEpochRef.current) return;
      setLinks(null);
      await loadLinks();
    },
    [demo, updatePaymentLink, loadLinks],
  );

  const createPosLinkUrl = useCallback(
    async (id: string | number): Promise<string | undefined> => {
      if (demo) return undefined; // demo terminal lives on the POS sub-view, no external URL
      const epoch = demoEpochRef.current;
      const pos = await createPosLink(String(id));
      if (epoch !== demoEpochRef.current) return undefined;
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
      const epoch = demoEpochRef.current;
      const expiryDate = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
      const data = await createPaymentLinkInvoice({ routeId, amount, currency, message, expiryDate });
      if (epoch !== demoEpochRef.current) throw new ApiException(0, t('genErr'));
      if (!data?.id) throw new ApiException(0, t('genErr'));
      const lnurl = lnurlEncode(`${apiBaseUrl}/lnurlp/${data.id}`);
      return { lnurl };
    },
    [demo, demoLnurl, createPaymentLinkInvoice, apiBaseUrl, t],
  );

  const charge = useCallback(
    async (
      linkId: string | number,
      amount: number,
      requestedExternalId?: string,
    ): Promise<{ lnurl: string; externalId: string }> => {
      const link = (links ?? []).find((l) => String(l.id) === String(linkId));
      const externalId = requestedExternalId ?? (
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `pos_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      );
      if (demo) {
        const lnurl = link?.lnurl || demoLnurl(`pos_${linkId}_${Math.round(amount * 100)}`);
        return { lnurl, externalId };
      }
      // Production POS posts amount + externalId; SDK type also lists mode/currency/expiry for
      // the full merchant form — cast keeps the wire body the API accepts for a POS charge.
      const epoch = demoEpochRef.current;
      const data = await createPaymentLinkPayment({ amount, externalId } as CreatePaymentLinkPayment, String(linkId));
      if (epoch !== demoEpochRef.current) throw new ApiException(0, t('genErr'));
      const payment = data.payment;
      const lnurl = extractChargeLnurl(data);
      if (!payment || !lnurl) throw new ApiException(0, t('genErr'));
      // Keep the shared list aligned with the server before another POS mount
      // can offer a second charge for the same link. extractChargeLnurl only
      // accepts a nested, amount-bound payment LNURL.
      setLinks((prev) =>
        prev?.map((item) =>
          String(item.id) === String(linkId) ? { ...item, payment } : item,
        ) ?? prev,
      );
      setLinksIdentity(sessionIdentity);
      return { lnurl, externalId };
    },
    [sessionIdentity, demo, links, createPaymentLinkPayment, demoLnurl, t],
  );

  const pollPayment = useCallback(
    async (linkId: string | number, externalPaymentId: string): Promise<PaymentLinkPaymentStatus | undefined> => {
      const epoch = demoEpochRef.current;
      try {
        const data = await getPaymentLinks(String(linkId), undefined, externalPaymentId);
        if (epoch !== demoEpochRef.current) return undefined;
        const paymentLink = Array.isArray(data)
          ? data.find((candidate) => candidate.payment?.externalId === externalPaymentId)
          : data;
        const payment = paymentLink?.payment;
        return payment?.externalId === externalPaymentId ? payment.status : undefined;
      } catch {
        return undefined;
      }
    },
    [getPaymentLinks],
  );

  // ---- config ---------------------------------------------------------------
  const saveConfig = useCallback(
    async (body: UpdatePaymentLinkConfig) => {
      if (demo) {
        setConfig((prev) => ({ ...(prev as NonNullable<typeof prev>), ...body }));
        return;
      }
      const epoch = demoEpochRef.current;
      await updateUserPaymentLinksConfig(body);
      if (epoch !== demoEpochRef.current) return;
      setConfig((prev) => (prev ? { ...prev, ...body } : prev));
    },
    [demo, updateUserPaymentLinksConfig],
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
      demo: sessionIdentityReady && demo,
      enableDemo,
      disableDemo,
      active: sessionIdentityReady ? active : null,
      sessionAddress: address,
      sessionIdentity,
      probeError: sessionIdentityReady && probeError,
      config: sessionIdentityReady ? config : null,
      routes: sessionIdentityReady ? routes : null,
      routesError: sessionIdentityReady && routesError,
      links: sessionIdentityReady && (demo || linksIdentity === sessionIdentity) ? links : null,
      linksIdentity: sessionIdentityReady ? linksIdentity : undefined,
      linksError: sessionIdentityReady && linksError,
      history: sessionIdentityReady ? history : null,
      historyError: sessionIdentityReady && historyError,
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
      sessionIdentityReady,
      enableDemo,
      disableDemo,
      active,
      address,
      sessionIdentity,
      probeError,
      config,
      routes,
      routesError,
      links,
      linksIdentity,
      linksError,
      history,
      historyError,
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
