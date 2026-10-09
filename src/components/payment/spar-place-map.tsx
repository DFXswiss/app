import { Map, Marker, NavigationControl, Popup, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { useSettingsContext } from 'src/contexts/settings.context';

// Webpack rewrites MapLibre's default worker URL to a chunk that never loads,
// so vector tiles never arrive. The file is copied into public/ at startup.
export function publishMapLibreWorker(
  setWorker: ((url: string) => void) | undefined,
  publicUrl: string | undefined,
): void {
  if (typeof setWorker !== 'function') return;
  setWorker(`${publicUrl ?? ''}/maplibre-gl-worker.mjs`);
}

publishMapLibreWorker(setWorkerUrl, process.env.PUBLIC_URL);

// OpenCryptoPay's place list. @dfx.swiss/react does not encapsulate this call.
const PLACES_URL = 'https://api.opencryptopay.io/map/places?shopName=SPAR&country=CH';
const SHOP_SPAR = 'SPAR';
const COUNTRY_CH = 'CH';

interface KeptPlace {
  lat: number;
  lon: number;
  name: unknown;
  category: unknown;
}

type SparPlaceMapState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; places: KeptPlace[] };

function isPlacesResponse(value: unknown): value is { places: unknown[] } {
  if (typeof value !== 'object' || value === null) return false;
  const places = (value as { places?: unknown }).places;
  return Array.isArray(places);
}

function isKeptPlace(value: unknown): value is KeptPlace {
  if (typeof value !== 'object' || value === null) return false;
  const place = value as { shopName?: unknown; country?: unknown; lat?: unknown; lon?: unknown };
  if (place.shopName !== SHOP_SPAR) return false;
  if (place.country !== COUNTRY_CH) return false;
  if (typeof place.lat !== 'number' || !Number.isFinite(place.lat) || place.lat < -90 || place.lat > 90) return false;
  if (typeof place.lon !== 'number' || !Number.isFinite(place.lon) || place.lon < -180 || place.lon > 180) {
    return false;
  }
  return true;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function markerElement(label: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'spar-place-marker';
  element.setAttribute('aria-label', label);
  element.style.cssText =
    'width:28px;height:36px;padding:0;border:0;background:transparent;cursor:pointer;display:block;line-height:0;';
  element.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36" ' +
    'aria-hidden="true" focusable="false">' +
    '<path fill="#C8102E" d="M14 34.5S26 23.2 26 14.2C26 7.4 20.6 2 14 2S2 7.4 2 14.2C2 23.2 14 34.5 14 34.5z"/>' +
    '<circle cx="14" cy="14" r="4.2" fill="#fff"/></svg>';
  return element;
}

function placeLabel(name: unknown, fallback: string): string {
  return typeof name === 'string' && name.length > 0 ? name : fallback;
}

export function SparPlaceMap(): JSX.Element {
  const { translate } = useSettingsContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapEpoch = useRef(0);
  const [state, setState] = useState<SparPlaceMapState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });

    const loadPlaces = async (): Promise<void> => {
      try {
        const response = await fetch(PLACES_URL, {
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
          if (isKeptPlace(place)) places.push(place);
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
  }, []);

  useEffect(() => {
    if (state.kind !== 'ready') return;
    // the ready render commits this div before the effect
    const container = containerRef.current as HTMLDivElement;

    const epoch = String(++mapEpoch.current);
    delete container.dataset.mapReady;
    container.dataset.mapEpoch = epoch;

    const map = new Map({
      container,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [8.23, 46.8],
      zoom: 7,
      fadeDuration: 0,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });

    map.addControl(new NavigationControl(), 'top-right');

    for (const place of state.places) {
      const popup = new Popup({ offset: 18, closeButton: true, maxWidth: '240px' });
      const content = document.createElement('div');
      content.style.cssText = 'font-size:14px;line-height:1.35;color:#072440;';
      const title = document.createElement('strong');
      const label = placeLabel(place.name, translate('screens/payment', 'Location'));
      title.textContent = label;
      content.appendChild(title);
      if (typeof place.category === 'string' && place.category.length > 0) {
        const category = document.createElement('div');
        category.textContent = place.category;
        category.style.cssText = 'margin-top:2px;color:#65728A;';
        content.appendChild(category);
      }
      popup.setDOMContent(content);

      new Marker({ element: markerElement(label), anchor: 'bottom' })
        .setLngLat([place.lon, place.lat])
        .setPopup(popup)
        .addTo(map);
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
        { padding: { top: 48, right: 48, bottom: 40, left: 40 }, maxZoom: 12, animate: false },
      );
    } else {
      for (const place of state.places) {
        map.setCenter([place.lon, place.lat]);
        map.setZoom(12);
      }
    }

    map.once('idle', () => {
      if (container.dataset.mapEpoch === epoch) container.dataset.mapReady = 'true';
    });

    return () => {
      delete container.dataset.mapReady;
      map.remove();
    };
  }, [state, translate]);

  if (state.kind === 'error') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-dfxGray-300 px-6">
        <p className="max-w-sm rounded-md bg-white px-4 py-3 text-center text-sm text-dfxGray-800 shadow">
          {translate('screens/payment', 'The location list could not be loaded.')}
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-dfxGray-300">
      <style>
        {'.spar-place-marker:focus{outline:none}' +
          '.spar-place-marker:focus-visible{outline:2px solid #072440;outline-offset:2px}' +
          '.maplibregl-popup-close-button{color:#072440;font-size:18px;line-height:18px;width:22px;height:22px;padding:0}' +
          '.maplibregl-popup-close-button:focus,.maplibregl-popup-close-button:focus-visible{outline:none}'}
      </style>
      <div ref={containerRef} className="w-full h-full" />
      {state.kind === 'ready' && state.places.length === 0 && (
        <p
          className={
            'pointer-events-none absolute left-1/2 top-1/2 z-10 max-w-sm -translate-x-1/2 -translate-y-1/2 ' +
            'rounded-md bg-white/95 px-4 py-3 text-center text-sm text-dfxGray-800 shadow'
          }
        >
          {translate('screens/payment', 'No locations published yet.')}
        </p>
      )}
    </div>
  );
}
