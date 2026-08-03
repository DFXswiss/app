import { PartnerJwt, shortAddress } from './auth';

/**
 * Runtime brand entry — maintained in public/partner-brands/brands.json
 * (copied into the deploy artifact; no rebuild needed for name/logo/accent).
 *
 * Matching keys (any one hits):
 * - walletIds: JWT `user` (wallet id from company token)
 * - names: wallet name as known in ops (fixture / manual key)
 * - addresses: wallet address (case-insensitive)
 */
export interface PartnerBrandEntry {
  walletIds?: number[];
  names?: string[];
  addresses?: string[];
  displayName: string;
  title: string;
  accent: string;
  /** Relative to public/partner-brands/ (e.g. logos/cake.svg). */
  logo?: string | null;
}

export interface PartnerBrandRegistry {
  defaultAccent: string;
  partners: PartnerBrandEntry[];
}

/** Resolved brand for the UI. logoUrl is absolute to the app origin (or null = no partner mark). */
export interface ResolvedPartnerBrand {
  key: string;
  displayName: string;
  title: string;
  accent: string;
  logoUrl: string | null;
  /** True when no registry entry matched — DFX-only fallback. */
  isFallback: boolean;
}

/**
 * Baked-in copy of public/partner-brands/brands.json so fixture mode and tests
 * work without a network fetch. Production prefers the public file (see loadBrandRegistry).
 */
export const DEFAULT_BRAND_REGISTRY: PartnerBrandRegistry = {
  defaultAccent: '#5B6B7C',
  partners: [
    {
      walletIds: [],
      names: ['cake'],
      addresses: [],
      displayName: 'Cake',
      title: 'DFX × Cake',
      accent: '#E91E8C',
      logo: 'logos/cake.svg',
    },
  ],
};

const NEUTRAL_ACCENT = '#5B6B7C';

export function brandAssetUrl(relative: string | null | undefined): string | null {
  if (!relative) return null;
  const path = relative.replace(/^\/+/, '');
  const base = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
  return `${base}/partner-brands/${path}`;
}

export function brandRegistryUrl(): string {
  const base = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
  return `${base}/partner-brands/brands.json`;
}

export function findBrandEntry(
  registry: PartnerBrandRegistry,
  identity: { walletId?: number | null; address?: string | null; name?: string | null },
): PartnerBrandEntry | null {
  const { walletId, address, name } = identity;
  const addr = address?.trim().toLowerCase();
  const nameKey = name?.trim().toLowerCase();

  for (const entry of registry.partners) {
    if (walletId != null && entry.walletIds?.includes(walletId)) return entry;
    if (addr && entry.addresses?.some((a) => a.trim().toLowerCase() === addr)) return entry;
    if (nameKey && entry.names?.some((n) => n.trim().toLowerCase() === nameKey)) return entry;
  }
  return null;
}

/**
 * Resolve UI brand from a JWT (or fixture identity) and a registry.
 * Unknown partners get DFX-neutral fallback: no partner logo, display name from token.
 */
export function resolvePartnerBrand(
  registry: PartnerBrandRegistry,
  identity: { walletId?: number | null; address?: string | null; name?: string | null },
): ResolvedPartnerBrand {
  const entry = findBrandEntry(registry, identity);
  if (entry) {
    const key =
      identity.name?.trim().toLowerCase() ||
      (identity.walletId != null ? String(identity.walletId) : identity.address?.trim() || entry.displayName);
    return {
      key,
      displayName: entry.displayName,
      title: entry.title || `DFX × ${entry.displayName}`,
      accent: entry.accent || registry.defaultAccent || NEUTRAL_ACCENT,
      logoUrl: brandAssetUrl(entry.logo),
      isFallback: false,
    };
  }

  const label = identity.name?.trim() || shortAddress(identity.address) || 'Partner';
  return {
    key: identity.walletId != null ? String(identity.walletId) : label,
    displayName: label,
    title: `DFX × ${label}`,
    accent: registry.defaultAccent || NEUTRAL_ACCENT,
    logoUrl: null,
    isFallback: true,
  };
}

/** Fixture mode: Cake entry if present, else first partner, else fallback. */
export function resolveFixtureBrand(registry: PartnerBrandRegistry): ResolvedPartnerBrand {
  const cake = findBrandEntry(registry, { name: 'cake' });
  if (cake) return resolvePartnerBrand(registry, { name: 'cake' });
  const first = registry.partners[0];
  if (first) {
    return resolvePartnerBrand(registry, {
      name: first.names?.[0],
      walletId: first.walletIds?.[0],
      address: first.addresses?.[0],
    });
  }
  return resolvePartnerBrand(registry, { name: 'Demo' });
}

export function resolveBrandFromToken(
  registry: PartnerBrandRegistry,
  jwt: PartnerJwt | null,
): ResolvedPartnerBrand {
  if (!jwt) {
    return resolvePartnerBrand(registry, {});
  }
  return resolvePartnerBrand(registry, {
    walletId: typeof jwt.user === 'number' ? jwt.user : null,
    address: jwt.address ?? null,
  });
}

let cachedRegistry: PartnerBrandRegistry | null = null;

export function setBrandRegistryForTests(registry: PartnerBrandRegistry | null): void {
  cachedRegistry = registry;
}

/**
 * Load brand registry from public/partner-brands/brands.json.
 * Falls back to DEFAULT_BRAND_REGISTRY if the file is missing or invalid.
 */
export async function loadBrandRegistry(force = false): Promise<PartnerBrandRegistry> {
  if (!force && cachedRegistry) return cachedRegistry;

  try {
    const response = await fetch(brandRegistryUrl(), { method: 'GET', cache: 'no-cache' });
    if (!response.ok) {
      cachedRegistry = DEFAULT_BRAND_REGISTRY;
      return cachedRegistry;
    }
    const data = (await response.json()) as Partial<PartnerBrandRegistry>;
    if (!Array.isArray(data.partners)) {
      cachedRegistry = DEFAULT_BRAND_REGISTRY;
      return cachedRegistry;
    }
    cachedRegistry = {
      defaultAccent: typeof data.defaultAccent === 'string' ? data.defaultAccent : NEUTRAL_ACCENT,
      partners: data.partners,
    };
    return cachedRegistry;
  } catch {
    cachedRegistry = DEFAULT_BRAND_REGISTRY;
    return cachedRegistry;
  }
}
