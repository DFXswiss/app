import { Map, Marker, NavigationControl, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { useSettingsContext } from 'src/contexts/settings.context';

const FILTERS_URL = 'https://api.opencryptopay.io/map/filters';
const PLACES_URL = 'https://api.opencryptopay.io/map/places';
const SHOP_SPAR = 'SPAR';
const SHOP_OTHERS = 'others';

type ShopName = typeof SHOP_SPAR | typeof SHOP_OTHERS;

interface MapFilters {
  shops: [ShopName, ShopName];
  countries: string[];
}

interface KeptPlace {
  lat: number;
  lon: number;
  name: unknown;
  category: unknown;
}

type SparPlaceMapState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; places: KeptPlace[] };

function isShopName(value: string): value is ShopName {
  return value === SHOP_SPAR || value === SHOP_OTHERS;
}

function placesUrl(shopName: ShopName, country: string | undefined): string {
  const url = `${PLACES_URL}?shopName=${encodeURIComponent(shopName)}`;
  if (country === undefined) return url;
  return `${url}&country=${encodeURIComponent(country)}`;
}

function parseCountries(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const countries: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return undefined;
    countries.push(item);
  }
  return countries;
}

function parseShopNames(shopNames: unknown): [ShopName, ShopName] {
  if (Array.isArray(shopNames)) {
    const spar = shopNames.find((item): item is typeof SHOP_SPAR => item === SHOP_SPAR);
    const others = shopNames.find((item): item is typeof SHOP_OTHERS => item === SHOP_OTHERS);
    if (spar !== undefined && others !== undefined) {
      return [spar, others];
    }
  }
  return [SHOP_SPAR, SHOP_OTHERS];
}

function parseFilters(value: unknown): MapFilters | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const body = value as { countries?: unknown; shopNames?: unknown };
  const countries = parseCountries(body.countries);
  if (countries === undefined) return undefined;
  return { countries, shops: parseShopNames(body.shopNames) };
}

function isPlacesResponse(value: unknown): value is { places: unknown[] } {
  if (typeof value !== 'object' || value === null) return false;
  const places = (value as { places?: unknown }).places;
  return Array.isArray(places);
}

function shopNameMatches(placeShopName: string, selected: ShopName): boolean {
  if (selected === SHOP_SPAR) return placeShopName === SHOP_SPAR;
  return placeShopName.length > 0 && placeShopName !== SHOP_SPAR;
}

function isKeptPlace(value: unknown, shopName: ShopName, country: string | undefined): value is KeptPlace {
  if (typeof value !== 'object' || value === null) return false;
  const place = value as { shopName?: unknown; country?: unknown; lat?: unknown; lon?: unknown };
  if (typeof place.shopName !== 'string' || !shopNameMatches(place.shopName, shopName)) return false;
  if (country !== undefined && place.country !== country) return false;
  if (typeof place.lat !== 'number' || !Number.isFinite(place.lat) || place.lat < -90 || place.lat > 90) return false;
  if (typeof place.lon !== 'number' || !Number.isFinite(place.lon) || place.lon < -180 || place.lon > 180) {
    return false;
  }
  return true;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function markerElement(): HTMLDivElement {
  const element = document.createElement('div');
  element.style.width = '14px';
  element.style.height = '14px';
  element.style.borderRadius = '50%';
  element.style.border = '2px solid white';
  element.style.background = '#d23b3b';
  element.style.boxShadow = '0 0 0 1px rgba(0, 0, 0, 0.25)';
  return element;
}

export function SparPlaceMap(): JSX.Element {
  const { translate } = useSettingsContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const [filters, setFilters] = useState<MapFilters | undefined>(undefined);
  const [shopName, setShopName] = useState<ShopName>(SHOP_SPAR);
  const [country, setCountry] = useState<string | undefined>(undefined);
  const [state, setState] = useState<SparPlaceMapState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    const loadFilters = async (): Promise<void> => {
      try {
        const response = await fetch(FILTERS_URL, { credentials: 'omit', signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setState({ kind: 'error' });
          return;
        }
        const body: unknown = await response.json();
        if (controller.signal.aborted) return;
        const parsed = parseFilters(body);
        if (parsed === undefined) {
          setState({ kind: 'error' });
          return;
        }
        setFilters(parsed);
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return;
        setState({ kind: 'error' });
      }
    };

    void loadFilters();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (filters === undefined) return;
    const controller = new AbortController();
    setState({ kind: 'loading' });

    const loadPlaces = async (): Promise<void> => {
      try {
        const response = await fetch(placesUrl(shopName, country), {
          credentials: 'omit',
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setState({ kind: 'error' });
          return;
        }
        const body: unknown = await response.json();
        if (controller.signal.aborted) return;
        if (!isPlacesResponse(body)) {
          setState({ kind: 'error' });
          return;
        }
        const places: KeptPlace[] = [];
        for (const place of body.places) {
          if (isKeptPlace(place, shopName, country)) places.push(place);
        }
        setState({ kind: 'ready', places });
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return;
        setState({ kind: 'error' });
      }
    };

    void loadPlaces();

    return () => {
      controller.abort();
    };
  }, [filters, shopName, country]);

  useEffect(() => {
    if (state.kind !== 'ready') return;
    const container = containerRef.current;
    if (!container) return;

    const map = new Map({
      container,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [8.23, 46.8],
      zoom: 7,
    });

    map.addControl(new NavigationControl(), 'top-right');

    for (const place of state.places) {
      const popup = new Popup({ offset: 16 });
      const content = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent =
        typeof place.name === 'string' && place.name.length > 0 ? place.name : translate('screens/payment', 'Location');
      content.appendChild(title);
      if (typeof place.category === 'string' && place.category.length > 0) {
        const category = document.createElement('div');
        category.textContent = place.category;
        content.appendChild(category);
      }
      popup.setDOMContent(content);

      new Marker({ element: markerElement() }).setLngLat([place.lon, place.lat]).setPopup(popup).addTo(map);
    }

    if (state.places.length > 1) {
      let west = state.places[0].lon;
      let east = west;
      let south = state.places[0].lat;
      let north = south;
      for (const place of state.places) {
        west = Math.min(west, place.lon);
        east = Math.max(east, place.lon);
        south = Math.min(south, place.lat);
        north = Math.max(north, place.lat);
      }
      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding: 48, maxZoom: 12 },
      );
    } else {
      for (const place of state.places) {
        map.setCenter([place.lon, place.lat]);
        map.setZoom(12);
      }
    }

    return () => {
      map.remove();
    };
  }, [state, translate]);

  if (state.kind === 'error') {
    return (
      <p className="text-dfxGray-800 text-sm p-4">
        {translate('screens/payment', 'The location list could not be loaded.')}
      </p>
    );
  }

  return (
    <div className="relative w-full h-full">
      {filters !== undefined && (
        <div className="absolute left-0 top-0 z-20 flex flex-wrap gap-2 p-2 text-sm text-dfxGray-800">
          <label className="flex items-center gap-1.5">
            {translate('screens/payment', 'Country')}
            <select
              className="text-sm"
              value={country === undefined ? '' : country}
              onChange={(event) => {
                const value = event.target.value;
                if (value === '') {
                  setCountry(undefined);
                  return;
                }
                if (filters.countries.includes(value)) {
                  setCountry(value);
                }
              }}
            >
              <option value="">{translate('screens/payment', 'All countries')}</option>
              {filters.countries.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            {translate('screens/payment', 'Shop')}
            <select
              className="text-sm"
              value={shopName}
              onChange={(event) => {
                const value = event.target.value;
                if (isShopName(value)) {
                  setShopName(value);
                }
              }}
            >
              {filters.shops.map((shop) => (
                <option key={shop} value={shop}>
                  {shop === SHOP_OTHERS ? translate('screens/payment', 'Others') : shop}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
      {state.kind === 'ready' && state.places.length === 0 && (
        <p className="absolute inset-x-0 top-12 z-10 text-center text-dfxGray-800 text-sm p-3">
          {translate('screens/payment', 'No locations published yet.')}
        </p>
      )}
    </div>
  );
}
