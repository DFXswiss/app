const mockMap = jest.fn();
const mockMarker = jest.fn();
const mockSetLngLat = jest.fn();
const mockPopup = jest.fn();
const mockNavigationControl = jest.fn();
const mockLngLatBounds = jest.fn();
const mockMapAddControl = jest.fn();
const mockMapSetCenter = jest.fn();
const mockMapSetZoom = jest.fn();
const mockMapFitBounds = jest.fn();
const mockMapRemove = jest.fn();
const mockIdleCallbacks: Array<() => void> = [];

function flushIdleCallbacks() {
  for (const callback of mockIdleCallbacks) {
    callback();
  }
  mockIdleCallbacks.length = 0;
}

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, key: string) => key,
  }),
}));

jest.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

jest.mock('maplibre-gl', () => {
  function Map(...args: unknown[]) {
    mockMap(...args);
    return {
      addControl: mockMapAddControl,
      once: (event: string, callback: () => void) => {
        if (event === 'idle') {
          mockIdleCallbacks.push(callback);
        }
      },
      setCenter: mockMapSetCenter,
      setZoom: mockMapSetZoom,
      fitBounds: mockMapFitBounds,
      remove: mockMapRemove,
    };
  }
  function Marker(...args: unknown[]) {
    mockMarker(...args);
    const marker = {
      setLngLat: (...lngLat: unknown[]) => {
        mockSetLngLat(...lngLat);
        return marker;
      },
      setPopup: () => marker,
      addTo: () => marker,
    };
    return marker;
  }
  function Popup(...args: unknown[]) {
    mockPopup(...args);
    return {
      setDOMContent: () => ({}),
    };
  }
  function NavigationControl(...args: unknown[]) {
    mockNavigationControl(...args);
  }
  function LngLatBounds(...args: unknown[]) {
    mockLngLatBounds(...args);
    return {
      extend: jest.fn().mockReturnThis(),
    };
  }
  return {
    __esModule: true,
    Map,
    Marker,
    Popup,
    NavigationControl,
    LngLatBounds,
    default: {
      Map,
      Marker,
      Popup,
      NavigationControl,
      LngLatBounds,
    },
  };
});

import { act, render, screen, waitFor } from '@testing-library/react';
import { publishMapLibreWorker, SparPlaceMap } from 'src/components/payment/spar-place-map';

const FILTERS_URL = 'https://api.opencryptopay.io/map/filters';
const PLACES_URL = 'https://api.opencryptopay.io/map/places?shopName=SPAR&country=CH';
const UNFILTERED_PLACES_URL = 'https://api.opencryptopay.io/map/places';

const SWISS_SPAR = {
  shopName: 'SPAR',
  name: 'SPAR Beispiel',
  lat: 47.37,
  lon: 8.54,
  category: 'shopping',
  country: 'CH',
};

const DROPPED_PLACES = [
  null,
  1,
  { shopName: 1, country: 'CH', name: 'x', lat: 47.37, lon: 8.54 },
  { shopName: '', country: 'CH', name: 'x', lat: 47.37, lon: 8.54 },
  { shopName: 'Migros', country: 'CH', name: 'Migros', lat: 47.37, lon: 8.54, category: 'shopping' },
  { shopName: 'SPAR', name: 'no country', lat: 47.37, lon: 8.54 },
  { shopName: 'SPAR', country: 'LI', name: 'SPAR Vaduz', lat: 47.14, lon: 9.52 },
  { shopName: 'SPAR', country: 'ch', name: 'lower', lat: 47.37, lon: 8.54 },
  { shopName: 'SPAR', country: 'CH', name: 'x', lat: 'x', lon: 8.54 },
  { shopName: 'SPAR', country: 'CH', name: 'x', lat: Number.NaN, lon: 8.54 },
  { shopName: 'SPAR', country: 'CH', name: 'x', lat: -91, lon: 8.54 },
  { shopName: 'SPAR', country: 'CH', name: 'x', lat: 91, lon: 8.54 },
  { shopName: 'SPAR', country: 'CH', name: 'x', lat: 47.37, lon: 'x' },
  { shopName: 'SPAR', country: 'CH', name: 'x', lat: 47.37, lon: Number.NaN },
  { shopName: 'SPAR', country: 'CH', name: 'x', lat: 47.37, lon: -181 },
  { shopName: 'SPAR', country: 'CH', name: 'x', lat: 47.37, lon: 181 },
  { shopName: 'SPAR', country: 'CH', name: 'Out of range', lat: 99, lon: 8.54 },
];

function fetchCalls(): [string, RequestInit][] {
  return (global.fetch as jest.Mock).mock.calls as [string, RequestInit][];
}

function placesCalls(): [string, RequestInit][] {
  return fetchCalls().filter(([url]) => url === PLACES_URL);
}

function placesUrls(): string[] {
  return placesCalls().map(([url]) => url);
}

function expectOnlySwissSparRequest() {
  const urls = fetchCalls().map(([url]) => url);
  expect(urls).toEqual([PLACES_URL]);
  expect(urls).not.toContain(FILTERS_URL);
  expect(urls).not.toContain(UNFILTERED_PLACES_URL);
  for (const url of urls) {
    expect(url).not.toContain('origin=');
    expect(url).not.toContain('shopName=others');
  }
  expect(placesCalls()[0][1]).toEqual(expect.objectContaining({ credentials: 'omit' }));
  expect(placesCalls()[0][1].signal).toBeInstanceOf(AbortSignal);
}

function mockMapApis(placesBody: unknown) {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url === PLACES_URL) {
      return Promise.resolve({
        ok: true,
        json: async () => placesBody,
      });
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('SparPlaceMap', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIdleCallbacks.length = 0;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('requests SPAR shops in Switzerland and plots only that pin', async () => {
    mockMapApis({ places: [...DROPPED_PLACES, SWISS_SPAR] });

    render(<SparPlaceMap />);

    await waitFor(() => {
      expect(mockSetLngLat).toHaveBeenCalledWith([8.54, 47.37]);
    });

    expectOnlySwissSparRequest();
    expect(mockSetLngLat).toHaveBeenCalledTimes(1);
    expect(mockMapSetCenter).toHaveBeenCalledWith([8.54, 47.37]);
    expect(mockMapSetZoom).toHaveBeenCalledWith(12);
    expect(mockMapFitBounds).not.toHaveBeenCalled();
    expect(mockMap).toHaveBeenCalledTimes(1);
    expect(mockSetLngLat).not.toHaveBeenCalledWith([9.52, 47.14]);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows the load error and does not construct a map when the place request fails', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === PLACES_URL) return Promise.reject(new Error('network'));
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    expect(await screen.findByText('The location list could not be loaded.')).toBeInTheDocument();
    expectOnlySwissSparRequest();
    expect(mockMap).not.toHaveBeenCalled();
    expect(mockSetLngLat).not.toHaveBeenCalled();
  });

  it('shows the load error when the place request rejects with a non-error', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === PLACES_URL) return Promise.reject('network');
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    expect(await screen.findByText('The location list could not be loaded.')).toBeInTheDocument();
    expectOnlySwissSparRequest();
    expect(mockMap).not.toHaveBeenCalled();
  });

  it('shows the load error and does not construct a map when the places response is not ok', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === PLACES_URL) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ places: [SWISS_SPAR] }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    expect(await screen.findByText('The location list could not be loaded.')).toBeInTheDocument();
    expectOnlySwissSparRequest();
    expect(mockMap).not.toHaveBeenCalled();
  });

  it('shows the load error and does not construct a map when the places body has no place list', async () => {
    mockMapApis({});

    render(<SparPlaceMap />);

    expect(await screen.findByText('The location list could not be loaded.')).toBeInTheDocument();
    expectOnlySwissSparRequest();
    expect(mockMap).not.toHaveBeenCalled();
  });

  it('shows the load error and does not construct a map when the places body is null', async () => {
    mockMapApis(null);

    render(<SparPlaceMap />);

    expect(await screen.findByText('The location list could not be loaded.')).toBeInTheDocument();
    expectOnlySwissSparRequest();
    expect(mockMap).not.toHaveBeenCalled();
  });

  it('shows the load error and does not construct a map when the places body is a number', async () => {
    mockMapApis(1);

    render(<SparPlaceMap />);

    expect(await screen.findByText('The location list could not be loaded.')).toBeInTheDocument();
    expectOnlySwissSparRequest();
    expect(mockMap).not.toHaveBeenCalled();
  });

  it('shows that no locations are published when the list is empty', async () => {
    mockMapApis({ places: [] });

    render(<SparPlaceMap />);

    expect(await screen.findByText('No locations published yet.')).toBeInTheDocument();
    expectOnlySwissSparRequest();
    expect(mockMap).toHaveBeenCalledTimes(1);
    expect(mockSetLngLat).not.toHaveBeenCalled();
    expect(mockMapFitBounds).not.toHaveBeenCalled();
    expect(mockMapSetCenter).not.toHaveBeenCalled();
    expect(screen.queryByRole('list', { name: 'Locations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText('The location list could not be loaded.')).not.toBeInTheDocument();
  });

  it('fits bounds for two pins and marks the map ready after idle', async () => {
    mockMapApis({
      places: [
        SWISS_SPAR,
        { shopName: 'SPAR', country: 'CH', name: '', lat: 47.05, lon: 8.31, category: '' },
        { shopName: 'SPAR', country: 'CH', name: 1, lat: 47.5, lon: 8.7, category: 1 },
      ],
    });

    render(<SparPlaceMap />);

    await waitFor(() => {
      expect(mockMapFitBounds).toHaveBeenCalled();
    });
    expect(mockMapSetCenter).not.toHaveBeenCalled();
    expectOnlySwissSparRequest();

    const labels = mockMarker.mock.calls.map(([options]) =>
      (options as { element: HTMLElement }).element.getAttribute('aria-label'),
    );
    expect(labels).toContain('SPAR Beispiel');
    expect(labels).toContain('Location');
    expect(screen.queryByRole('list', { name: 'Locations' })).not.toBeInTheDocument();
    expect(screen.queryByText('SPAR Beispiel')).not.toBeInTheDocument();
    expect(screen.queryByText('Location')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    const container = (mockMap.mock.calls[0][0] as { container: HTMLDivElement }).container;
    const epoch = container.dataset.mapEpoch;
    flushIdleCallbacks();
    expect(container.dataset.mapReady).toBe('true');
    expect(container.dataset.mapEpoch).toBe(epoch);
  });

  it('does not mark a stale map epoch as ready', async () => {
    mockMapApis({ places: [SWISS_SPAR] });

    const { rerender } = render(<SparPlaceMap />);

    await waitFor(() => {
      expect(mockMap).toHaveBeenCalledTimes(1);
    });
    const staleIdle = mockIdleCallbacks[0];
    if (typeof staleIdle !== 'function') {
      throw new Error('expected an idle callback');
    }

    rerender(<SparPlaceMap />);

    await waitFor(() => {
      expect(mockMap).toHaveBeenCalledTimes(2);
    });

    staleIdle();
    const container = (mockMap.mock.calls[0][0] as { container: HTMLDivElement }).container;
    expect(container.dataset.mapReady).not.toBe('true');
    expectOnlySwissSparRequest();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('does not show a load error when the place response arrives after unmount', async () => {
    let resolvePlaces: (value: unknown) => void = () => undefined;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === PLACES_URL) {
        return new Promise((resolve) => {
          resolvePlaces = resolve;
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    const { unmount } = render(<SparPlaceMap />);
    await waitFor(() => {
      expect(placesUrls()).toEqual([PLACES_URL]);
    });
    unmount();
    resolvePlaces({
      ok: true,
      json: async () => ({ places: [SWISS_SPAR] }),
    });
    await flush();
    expect(screen.queryByText('The location list could not be loaded.')).not.toBeInTheDocument();
    expect(mockMap).not.toHaveBeenCalled();
    expectOnlySwissSparRequest();
  });

  it('does not show a load error when place json resolves after unmount', async () => {
    let jsonStarted = false;
    let resolveJson: (value: unknown) => void = () => undefined;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === PLACES_URL) {
        return Promise.resolve({
          ok: true,
          json: () => {
            jsonStarted = true;
            return new Promise((resolve) => {
              resolveJson = resolve;
            });
          },
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    const { unmount } = render(<SparPlaceMap />);
    await waitFor(() => {
      expect(jsonStarted).toBe(true);
    });
    unmount();
    resolveJson({ places: [SWISS_SPAR] });
    await flush();
    expect(screen.queryByText('The location list could not be loaded.')).not.toBeInTheDocument();
    expect(mockMap).not.toHaveBeenCalled();
    expectOnlySwissSparRequest();
  });

  it('does not show a load error when the places fetch is aborted while mounted', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === PLACES_URL) {
        const error = new Error('aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    await waitFor(() => {
      expect(placesUrls()).toEqual([PLACES_URL]);
    });
    await flush();
    expect(screen.queryByText('The location list could not be loaded.')).not.toBeInTheDocument();
    expect(mockMap).not.toHaveBeenCalled();
    expectOnlySwissSparRequest();
  });

  it('does not show a load error when an aborted places fetch rejects', async () => {
    let rejectPlaces: (error: Error) => void = () => undefined;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === PLACES_URL) {
        return new Promise((_resolve, reject) => {
          rejectPlaces = reject;
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    const { unmount } = render(<SparPlaceMap />);
    await waitFor(() => {
      expect(placesUrls()).toEqual([PLACES_URL]);
    });
    unmount();
    rejectPlaces(new Error('network'));
    await flush();
    expect(screen.queryByText('The location list could not be loaded.')).not.toBeInTheDocument();
    expect(mockMap).not.toHaveBeenCalled();
    expectOnlySwissSparRequest();
  });

  it('does not throw when setWorker is not a function', () => {
    expect(() => publishMapLibreWorker(undefined, 'https://cdn.example')).not.toThrow();
  });

  it('uses an empty public URL when publicUrl is undefined', () => {
    const setWorker = jest.fn();
    publishMapLibreWorker(setWorker, undefined);
    expect(setWorker).toHaveBeenCalledWith('/maplibre-gl-worker.mjs');
  });

  it('prefixes the worker URL with the public URL', () => {
    const setWorker = jest.fn();
    publishMapLibreWorker(setWorker, 'https://cdn.example');
    expect(setWorker).toHaveBeenCalledWith('https://cdn.example/maplibre-gl-worker.mjs');
  });
});

describe('maplibre-gl mock', () => {
  it('runs every function in the committed mock module', async () => {
    const maplibre = await import('src/__mocks__/maplibre-gl');
    const map = maplibre.Map();
    map.addControl();
    map.setCenter();
    map.setZoom();
    map.fitBounds();
    map.remove();
    const marker = maplibre.Marker();
    marker.setLngLat();
    marker.setPopup();
    marker.addTo();
    const popup = maplibre.Popup();
    popup.setDOMContent();
    maplibre.NavigationControl();
    const bounds = maplibre.LngLatBounds();
    bounds.extend();
    maplibre.default.Map();
  });
});
