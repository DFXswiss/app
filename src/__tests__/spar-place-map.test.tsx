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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { publishMapLibreWorker, SparPlaceMap } from 'src/components/payment/spar-place-map';

const FILTERS_URL = 'https://api.opencryptopay.io/map/filters';
const PLACES_PREFIX = 'https://api.opencryptopay.io/map/places';
const SPAR_PLACES_URL = 'https://api.opencryptopay.io/map/places?shopName=SPAR';
const SPAR_CH_PLACES_URL = 'https://api.opencryptopay.io/map/places?shopName=SPAR&country=CH';
const OTHERS_PLACES_URL = 'https://api.opencryptopay.io/map/places?shopName=others';
const UNFILTERED_PLACES_URL = 'https://api.opencryptopay.io/map/places';

const FILTERS = {
  shopNames: ['SPAR', 'others'],
  countries: ['CH', 'LI'],
  blockchains: [],
  assets: [],
};

const SPAR_EXAMPLE = {
  shopName: 'SPAR',
  name: 'SPAR Beispiel',
  lat: 47.37,
  lon: 8.54,
  category: 'shopping',
  country: 'CH',
};

const PLACES_FIXTURE = {
  places: [
    { shopName: 'Migros', name: 'Migros', lat: 47.37, lon: 8.54, category: 'shopping' },
    { shopName: 'SPAR', name: 'Out of range', lat: 99, lon: 8.54, category: 'shopping' },
    SPAR_EXAMPLE,
  ],
};

function fetchCalls(): [string, RequestInit][] {
  return (global.fetch as jest.Mock).mock.calls as [string, RequestInit][];
}

function placesCalls(): [string, RequestInit][] {
  return fetchCalls().filter(([url]) => url.startsWith(PLACES_PREFIX));
}

function placesUrls(): string[] {
  return placesCalls().map(([url]) => url);
}

function expectNoOriginAndNoUnfilteredPlaces() {
  const urls = fetchCalls().map(([url]) => url);
  expect(urls).not.toContain(UNFILTERED_PLACES_URL);
  for (const url of urls) {
    expect(url).not.toContain('origin=');
  }
}

function mockMapApis(placesBody: unknown) {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url === FILTERS_URL) {
      return Promise.resolve({
        ok: true,
        json: async () => FILTERS,
      });
    }
    if (typeof url === 'string' && url.startsWith(`${PLACES_PREFIX}?`)) {
      return Promise.resolve({
        ok: true,
        json: async () => placesBody,
      });
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
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

  it('fetches SPAR places after filters and plots only matching in-range coordinates', async () => {
    mockMapApis(PLACES_FIXTURE);

    render(<SparPlaceMap />);

    await waitFor(() => {
      expect(mockSetLngLat).toHaveBeenCalledWith([8.54, 47.37]);
    });

    expect(global.fetch).toHaveBeenCalledWith(FILTERS_URL, expect.objectContaining({ credentials: 'omit' }));
    expect(placesCalls()[0][0]).toBe(SPAR_PLACES_URL);
    expect(placesCalls()[0][1]).toEqual(expect.objectContaining({ credentials: 'omit' }));
    expectNoOriginAndNoUnfilteredPlaces();
    expect(mockSetLngLat).toHaveBeenCalledTimes(1);
    expect(mockMap).toHaveBeenCalledTimes(1);
  });

  it('requests SPAR places for CH when that country is chosen', async () => {
    const liPlace = {
      shopName: 'SPAR',
      name: 'SPAR Vaduz',
      lat: 47.14,
      lon: 9.52,
      category: 'shopping',
      country: 'LI',
    };
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => FILTERS,
        });
      }
      if (url === SPAR_CH_PLACES_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            places: [SPAR_EXAMPLE, liPlace],
          }),
        });
      }
      if (typeof url === 'string' && url.startsWith(`${PLACES_PREFIX}?`)) {
        return Promise.resolve({
          ok: true,
          json: async () => PLACES_FIXTURE,
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    await screen.findByLabelText('Country');
    await waitFor(() => {
      expect(placesUrls()).toContain(SPAR_PLACES_URL);
    });

    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'CH' } });

    await waitFor(() => {
      expect(placesUrls()).toContain(SPAR_CH_PLACES_URL);
    });

    const chCall = placesCalls().find(([url]) => url === SPAR_CH_PLACES_URL);
    expect(chCall?.[1]).toEqual(expect.objectContaining({ credentials: 'omit' }));
    expectNoOriginAndNoUnfilteredPlaces();

    await waitFor(() => {
      expect(mockSetLngLat).toHaveBeenCalledWith([8.54, 47.37]);
      expect(mockSetLngLat).not.toHaveBeenCalledWith([9.52, 47.14]);
    });
  });

  it('requests others places when Others is chosen', async () => {
    mockMapApis(PLACES_FIXTURE);

    render(<SparPlaceMap />);

    await screen.findByLabelText('Shop');
    await waitFor(() => {
      expect(placesUrls()).toContain(SPAR_PLACES_URL);
    });

    fireEvent.change(screen.getByLabelText('Shop'), { target: { value: 'others' } });

    await waitFor(() => {
      expect(placesUrls()).toContain(OTHERS_PLACES_URL);
    });

    const othersCall = placesCalls().find(([url]) => url === OTHERS_PLACES_URL);
    expect(othersCall?.[1]).toEqual(expect.objectContaining({ credentials: 'omit' }));
    expectNoOriginAndNoUnfilteredPlaces();
  });

  it('shows the load error and does not fetch places when filters fail', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return Promise.reject(new Error('network'));
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    expect(await screen.findByText('The location list could not be loaded.')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(FILTERS_URL, expect.objectContaining({ credentials: 'omit' }));
    expect(placesCalls()).toHaveLength(0);
    expect(mockMap).not.toHaveBeenCalled();
    expect(mockSetLngLat).not.toHaveBeenCalled();
  });

  it('shows the load error and does not construct a map when the place request fails', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => FILTERS,
        });
      }
      if (typeof url === 'string' && url.startsWith(`${PLACES_PREFIX}?`)) {
        return Promise.reject(new Error('network'));
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    expect(await screen.findByText('The location list could not be loaded.')).toBeInTheDocument();
    expect(placesCalls()[0][0]).toBe(SPAR_PLACES_URL);
    expect(mockMap).not.toHaveBeenCalled();
    expect(mockSetLngLat).not.toHaveBeenCalled();
  });

  it('shows that no locations are published when the list is empty', async () => {
    mockMapApis({ places: [] });

    render(<SparPlaceMap />);

    expect(await screen.findByText('No locations published yet.')).toBeInTheDocument();
    expect(placesCalls()[0][0]).toBe(SPAR_PLACES_URL);
    expect(mockSetLngLat).not.toHaveBeenCalled();
  });

  it('aborts the open SPAR request when the country changes and does not show a load error', async () => {
    const pending: Array<() => void> = [];
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => FILTERS,
        });
      }
      if (url === SPAR_PLACES_URL) {
        return new Promise<void>((resolve) => {
          pending.push(resolve);
        }).then(() => ({
          ok: true,
          json: async () => PLACES_FIXTURE,
        }));
      }
      if (typeof url === 'string' && url.startsWith(`${PLACES_PREFIX}?`)) {
        return Promise.resolve({
          ok: true,
          json: async () => PLACES_FIXTURE,
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    await screen.findByLabelText('Country');
    await waitFor(() => {
      expect(placesUrls()).toContain(SPAR_PLACES_URL);
    });

    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'CH' } });

    await waitFor(() => {
      const openSpar = placesCalls().filter(([url]) => url === SPAR_PLACES_URL);
      expect(openSpar.length).toBeGreaterThan(0);
      expect(openSpar.every(([, init]) => init.signal instanceof AbortSignal && init.signal.aborted)).toBe(true);
    });

    for (const resolve of pending) resolve();

    await waitFor(() => {
      expect(placesUrls()).toContain(SPAR_CH_PLACES_URL);
    });
    expect(screen.queryByText('The location list could not be loaded.')).not.toBeInTheDocument();
    expectNoOriginAndNoUnfilteredPlaces();
  });

  it('aborts the open SPAR request when the shop changes and does not show a load error', async () => {
    const pending: Array<() => void> = [];
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => FILTERS,
        });
      }
      if (url === SPAR_PLACES_URL) {
        return new Promise<void>((resolve) => {
          pending.push(resolve);
        }).then(() => ({
          ok: true,
          json: async () => PLACES_FIXTURE,
        }));
      }
      if (typeof url === 'string' && url.startsWith(`${PLACES_PREFIX}?`)) {
        return Promise.resolve({
          ok: true,
          json: async () => PLACES_FIXTURE,
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    await screen.findByLabelText('Shop');
    await waitFor(() => {
      expect(placesUrls()).toContain(SPAR_PLACES_URL);
    });

    fireEvent.change(screen.getByLabelText('Shop'), { target: { value: 'others' } });

    await waitFor(() => {
      const openSpar = placesCalls().filter(([url]) => url === SPAR_PLACES_URL);
      expect(openSpar.length).toBeGreaterThan(0);
      expect(openSpar.every(([, init]) => init.signal instanceof AbortSignal && init.signal.aborted)).toBe(true);
    });

    for (const resolve of pending) resolve();

    await waitFor(() => {
      expect(placesUrls()).toContain(OTHERS_PLACES_URL);
    });
    expect(screen.queryByText('The location list could not be loaded.')).not.toBeInTheDocument();
    expectNoOriginAndNoUnfilteredPlaces();
  });

  it('shows the load error and does not fetch places when filters are not ok', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return Promise.resolve({
          ok: false,
          json: async () => FILTERS,
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    expect(await screen.findByText('The location list could not be loaded.')).toBeInTheDocument();
    expect(placesCalls()).toHaveLength(0);
    expect(fetchCalls().map(([url]) => url)).not.toContain(UNFILTERED_PLACES_URL);
    expect(mockMap).not.toHaveBeenCalled();
  });

  it('shows the load error and does not fetch places when the filters body has no country list', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    expect(await screen.findByText('The location list could not be loaded.')).toBeInTheDocument();
    expect(placesCalls()).toHaveLength(0);
    expect(fetchCalls().map(([url]) => url)).not.toContain(UNFILTERED_PLACES_URL);
    expect(mockMap).not.toHaveBeenCalled();
  });

  it('shows the load error and does not construct a map when the places response is not ok', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => FILTERS,
        });
      }
      if (typeof url === 'string' && url.startsWith(`${PLACES_PREFIX}?`)) {
        return Promise.resolve({
          ok: false,
          json: async () => PLACES_FIXTURE,
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    expect(await screen.findByText('The location list could not be loaded.')).toBeInTheDocument();
    expect(placesCalls()[0][0]).toBe(SPAR_PLACES_URL);
    expectNoOriginAndNoUnfilteredPlaces();
    expect(mockMap).not.toHaveBeenCalled();
  });

  it('shows the load error and does not construct a map when the places body has no place list', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => FILTERS,
        });
      }
      if (typeof url === 'string' && url.startsWith(`${PLACES_PREFIX}?`)) {
        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    expect(await screen.findByText('The location list could not be loaded.')).toBeInTheDocument();
    expect(placesCalls()[0][0]).toBe(SPAR_PLACES_URL);
    expectNoOriginAndNoUnfilteredPlaces();
    expect(mockMap).not.toHaveBeenCalled();
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

  it('shows the load error and does not fetch places when filters are null', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => null,
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    expect(await screen.findByText('The location list could not be loaded.')).toBeInTheDocument();
    expect(placesCalls()).toHaveLength(0);
    expectNoOriginAndNoUnfilteredPlaces();
    expect(mockMap).not.toHaveBeenCalled();
  });

  it('shows the load error and does not fetch places when filters are a number', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => 1,
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    expect(await screen.findByText('The location list could not be loaded.')).toBeInTheDocument();
    expect(placesCalls()).toHaveLength(0);
    expectNoOriginAndNoUnfilteredPlaces();
    expect(mockMap).not.toHaveBeenCalled();
  });

  it('shows the load error and does not fetch places when a country is not a string', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ countries: ['CH', 1], shopNames: ['SPAR', 'others'] }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    expect(await screen.findByText('The location list could not be loaded.')).toBeInTheDocument();
    expect(placesCalls()).toHaveLength(0);
    expectNoOriginAndNoUnfilteredPlaces();
    expect(mockMap).not.toHaveBeenCalled();
  });

  it('falls back to SPAR and Others when others is missing from shopNames', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ countries: ['CH'], shopNames: ['SPAR'] }),
        });
      }
      if (typeof url === 'string' && url.startsWith(`${PLACES_PREFIX}?`)) {
        return Promise.resolve({
          ok: true,
          json: async () => PLACES_FIXTURE,
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    await screen.findByLabelText('Shop');
    expect(screen.getByRole('option', { name: 'SPAR' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Others' })).toBeInTheDocument();
    expectNoOriginAndNoUnfilteredPlaces();
  });

  it('falls back to SPAR and Others when SPAR is missing from shopNames', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ countries: ['CH'], shopNames: ['others'] }),
        });
      }
      if (typeof url === 'string' && url.startsWith(`${PLACES_PREFIX}?`)) {
        return Promise.resolve({
          ok: true,
          json: async () => PLACES_FIXTURE,
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    await screen.findByLabelText('Shop');
    expect(screen.getByRole('option', { name: 'SPAR' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Others' })).toBeInTheDocument();
    expectNoOriginAndNoUnfilteredPlaces();
  });

  it('falls back to SPAR and Others when shopNames is not an array', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ countries: ['CH'], shopNames: 1 }),
        });
      }
      if (typeof url === 'string' && url.startsWith(`${PLACES_PREFIX}?`)) {
        return Promise.resolve({
          ok: true,
          json: async () => PLACES_FIXTURE,
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    await screen.findByLabelText('Shop');
    expect(screen.getByRole('option', { name: 'SPAR' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Others' })).toBeInTheDocument();
    expectNoOriginAndNoUnfilteredPlaces();
  });

  it('shows the load error and does not construct a map when the places body is null', async () => {
    mockMapApis(null);

    render(<SparPlaceMap />);

    expect(await screen.findByText('The location list could not be loaded.')).toBeInTheDocument();
    expect(placesCalls()[0][0]).toBe(SPAR_PLACES_URL);
    expect(placesCalls()[0][1]).toEqual(expect.objectContaining({ credentials: 'omit' }));
    expectNoOriginAndNoUnfilteredPlaces();
    expect(mockMap).not.toHaveBeenCalled();
  });

  it('shows the load error and does not construct a map when the places body is a number', async () => {
    mockMapApis(1);

    render(<SparPlaceMap />);

    expect(await screen.findByText('The location list could not be loaded.')).toBeInTheDocument();
    expect(placesCalls()[0][0]).toBe(SPAR_PLACES_URL);
    expectNoOriginAndNoUnfilteredPlaces();
    expect(mockMap).not.toHaveBeenCalled();
  });

  it('plots only the in-range SPAR pin and drops invalid places', async () => {
    mockMapApis({
      places: [
        null,
        1,
        { shopName: 1, name: 'x', lat: 47.37, lon: 8.54 },
        { shopName: '', name: 'x', lat: 47.37, lon: 8.54 },
        { shopName: 'SPAR', name: 'x', lat: 'x', lon: 8.54 },
        { shopName: 'SPAR', name: 'x', lat: Number.NaN, lon: 8.54 },
        { shopName: 'SPAR', name: 'x', lat: -91, lon: 8.54 },
        { shopName: 'SPAR', name: 'x', lat: 91, lon: 8.54 },
        { shopName: 'SPAR', name: 'x', lat: 47.37, lon: 'x' },
        { shopName: 'SPAR', name: 'x', lat: 47.37, lon: Number.NaN },
        { shopName: 'SPAR', name: 'x', lat: 47.37, lon: -181 },
        { shopName: 'SPAR', name: 'x', lat: 47.37, lon: 181 },
        { shopName: 'Migros', name: 'Migros', lat: 47.37, lon: 8.54, category: 'shopping' },
        SPAR_EXAMPLE,
      ],
    });

    render(<SparPlaceMap />);

    await waitFor(() => {
      expect(mockSetLngLat).toHaveBeenCalledWith([8.54, 47.37]);
    });
    expect(mockSetLngLat).toHaveBeenCalledTimes(1);
    expectNoOriginAndNoUnfilteredPlaces();
  });

  it('fits bounds for two pins and marks the map ready after idle', async () => {
    mockMapApis({
      places: [
        SPAR_EXAMPLE,
        { shopName: 'SPAR', name: '', lat: 47.05, lon: 8.31, category: '' },
        { shopName: 'SPAR', name: 1, lat: 47.5, lon: 8.7, category: 1 },
      ],
    });

    render(<SparPlaceMap />);

    await waitFor(() => {
      expect(mockMapFitBounds).toHaveBeenCalled();
    });
    expect(mockMapSetCenter).not.toHaveBeenCalled();

    const labels = mockMarker.mock.calls.map(([options]) =>
      (options as { element: HTMLElement }).element.getAttribute('aria-label'),
    );
    expect(labels).toContain('SPAR Beispiel');
    expect(labels).toContain('Location');
    expect(screen.getByRole('list', { name: 'Locations' })).toBeInTheDocument();
    expect(screen.getByText('SPAR Beispiel')).toBeInTheDocument();
    expect(screen.getAllByText('Location')).toHaveLength(2);

    const container = (mockMap.mock.calls[0][0] as { container: HTMLDivElement }).container;
    const epoch = container.dataset.mapEpoch;
    flushIdleCallbacks();
    expect(container.dataset.mapReady).toBe('true');
    expect(container.dataset.mapEpoch).toBe(epoch);
  });

  it('does not mark a stale map epoch as ready', async () => {
    mockMapApis(PLACES_FIXTURE);

    render(<SparPlaceMap />);

    await waitFor(() => {
      expect(mockMap).toHaveBeenCalledTimes(1);
    });
    const staleIdle = mockIdleCallbacks[0];
    if (typeof staleIdle !== 'function') {
      throw new Error('expected an idle callback');
    }

    await screen.findByLabelText('Country');
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'CH' } });

    await waitFor(() => {
      expect(mockMap).toHaveBeenCalledTimes(2);
    });

    staleIdle();
    const container = (mockMap.mock.calls[0][0] as { container: HTMLDivElement }).container;
    expect(container.dataset.mapReady).not.toBe('true');
  });

  it('clears country, ignores unknown country and shop, and can reselect SPAR', async () => {
    mockMapApis(PLACES_FIXTURE);

    render(<SparPlaceMap />);

    await screen.findByLabelText('Country');
    await waitFor(() => {
      expect(placesUrls()).toContain(SPAR_PLACES_URL);
    });

    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'CH' } });
    await waitFor(() => {
      expect(placesUrls()).toContain(SPAR_CH_PLACES_URL);
    });

    fireEvent.change(screen.getByLabelText('Country'), { target: { value: '' } });
    await waitFor(() => {
      expect(placesCalls().filter(([url]) => url === SPAR_PLACES_URL).length).toBeGreaterThan(1);
    });
    expect(placesUrls().some((url) => url.includes('country=') && !url.includes('country=CH'))).toBe(false);

    const urlsBeforeZz = placesUrls().slice();
    const countrySelect = screen.getByLabelText('Country') as HTMLSelectElement;
    const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    if (valueDescriptor === undefined || valueDescriptor.set === undefined) {
      throw new Error('HTMLSelectElement value setter is missing');
    }
    valueDescriptor.set.call(countrySelect, 'ZZ');
    Object.defineProperty(countrySelect, 'value', { configurable: true, writable: true, value: 'ZZ' });
    fireEvent.change(countrySelect, { target: { value: 'ZZ' } });
    expect(placesUrls().some((url) => url.includes('country=ZZ'))).toBe(false);
    expect(placesUrls()).toEqual(urlsBeforeZz);

    fireEvent.change(screen.getByLabelText('Shop'), { target: { value: 'nope' } });
    expect(placesUrls().some((url) => url.includes('shopName=nope'))).toBe(false);
    expect((screen.getByLabelText('Shop') as HTMLSelectElement).value).toBe('SPAR');

    fireEvent.change(screen.getByLabelText('Shop'), { target: { value: 'others' } });
    await waitFor(() => {
      expect(placesUrls()).toContain(OTHERS_PLACES_URL);
    });

    const sparBeforeReselect = placesCalls().filter(([url]) => url === SPAR_PLACES_URL).length;
    fireEvent.change(screen.getByLabelText('Shop'), { target: { value: 'SPAR' } });
    await waitFor(() => {
      expect(placesCalls().filter(([url]) => url === SPAR_PLACES_URL).length).toBeGreaterThan(sparBeforeReselect);
    });
    expectNoOriginAndNoUnfilteredPlaces();
  });

  it('plots only a non-SPAR shop when Others is selected', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => FILTERS,
        });
      }
      if (url === OTHERS_PLACES_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            places: [
              { shopName: 'Volg', name: 'Volg', lat: 46.53, lon: 9.87, category: 'grocery' },
              SPAR_EXAMPLE,
              { shopName: '', name: 'Empty', lat: 47.37, lon: 8.54, category: 'shopping' },
            ],
          }),
        });
      }
      if (typeof url === 'string' && url.startsWith(`${PLACES_PREFIX}?`)) {
        return Promise.resolve({
          ok: true,
          json: async () => PLACES_FIXTURE,
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    await screen.findByLabelText('Shop');
    await waitFor(() => {
      expect(mockSetLngLat).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText('Shop'), { target: { value: 'others' } });

    await waitFor(() => {
      expect(mockSetLngLat).toHaveBeenCalledWith([9.87, 46.53]);
      const lastMapOrder = mockMap.mock.invocationCallOrder[mockMap.mock.invocationCallOrder.length - 1];
      const pinsAfterLastMap = mockSetLngLat.mock.calls
        .filter((_, index) => mockSetLngLat.mock.invocationCallOrder[index] > lastMapOrder)
        .map(([coords]) => coords);
      expect(pinsAfterLastMap).toEqual([[9.87, 46.53]]);
    });
    expectNoOriginAndNoUnfilteredPlaces();
  });

  it('does not show a load error when the filter response arrives after unmount', async () => {
    let resolveFilters: (value: unknown) => void = () => undefined;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return new Promise((resolve) => {
          resolveFilters = resolve;
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    const { unmount } = render(<SparPlaceMap />);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(FILTERS_URL, expect.objectContaining({ credentials: 'omit' }));
    });
    unmount();
    resolveFilters({
      ok: true,
      json: async () => FILTERS,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText('The location list could not be loaded.')).not.toBeInTheDocument();
    expect(placesCalls()).toHaveLength(0);
    expect(mockMap).not.toHaveBeenCalled();
  });

  it('does not show a load error when filter json resolves after unmount', async () => {
    let resolveJson: (value: unknown) => void = () => undefined;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return Promise.resolve({
          ok: true,
          json: () =>
            new Promise((resolve) => {
              resolveJson = resolve;
            }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    const { unmount } = render(<SparPlaceMap />);
    await waitFor(() => {
      expect(resolveJson).toEqual(expect.any(Function));
    });
    unmount();
    resolveJson(FILTERS);
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText('The location list could not be loaded.')).not.toBeInTheDocument();
    expect(placesCalls()).toHaveLength(0);
    expect(mockMap).not.toHaveBeenCalled();
  });

  it('does not show a load error when the filter fetch is aborted while mounted', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        const error = new Error('aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(FILTERS_URL, expect.objectContaining({ credentials: 'omit' }));
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText('The location list could not be loaded.')).not.toBeInTheDocument();
    expect(placesCalls()).toHaveLength(0);
    expect(mockMap).not.toHaveBeenCalled();
  });

  it('does not show a load error when the filter fetch rejects after unmount', async () => {
    let rejectFilters: (error: Error) => void = () => undefined;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return new Promise((_, reject) => {
          rejectFilters = reject;
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    const { unmount } = render(<SparPlaceMap />);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(FILTERS_URL, expect.objectContaining({ credentials: 'omit' }));
    });
    unmount();
    rejectFilters(new Error('network'));
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText('The location list could not be loaded.')).not.toBeInTheDocument();
    expect(placesCalls()).toHaveLength(0);
    expect(mockMap).not.toHaveBeenCalled();
  });

  it('does not show a load error when places json resolves after a shop change abort', async () => {
    let resolveSparJson: (value: unknown) => void = () => undefined;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => FILTERS,
        });
      }
      if (url === SPAR_PLACES_URL) {
        return Promise.resolve({
          ok: true,
          json: () =>
            new Promise((resolve) => {
              resolveSparJson = resolve;
            }),
        });
      }
      if (typeof url === 'string' && url.startsWith(`${PLACES_PREFIX}?`)) {
        return Promise.resolve({
          ok: true,
          json: async () => PLACES_FIXTURE,
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    await screen.findByLabelText('Shop');
    await waitFor(() => {
      expect(resolveSparJson).toEqual(expect.any(Function));
    });

    fireEvent.change(screen.getByLabelText('Shop'), { target: { value: 'others' } });
    await waitFor(() => {
      expect(placesUrls()).toContain(OTHERS_PLACES_URL);
    });

    resolveSparJson(PLACES_FIXTURE);
    await waitFor(() => {
      expect(placesUrls()).toContain(OTHERS_PLACES_URL);
    });
    expect(screen.queryByText('The location list could not be loaded.')).not.toBeInTheDocument();
    expectNoOriginAndNoUnfilteredPlaces();
  });

  it('does not show a load error when the places fetch is aborted while mounted', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => FILTERS,
        });
      }
      if (typeof url === 'string' && url.startsWith(`${PLACES_PREFIX}?`)) {
        const error = new Error('aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    await screen.findByLabelText('Shop');
    await waitFor(() => {
      expect(placesCalls().length).toBeGreaterThan(0);
    });
    expect(placesCalls()[0][1]).toEqual(expect.objectContaining({ credentials: 'omit' }));
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText('The location list could not be loaded.')).not.toBeInTheDocument();
    expect(mockMap).not.toHaveBeenCalled();
    expectNoOriginAndNoUnfilteredPlaces();
  });

  it('does not show a load error when an aborted places fetch rejects', async () => {
    let rejectSpar: (error: Error) => void = () => undefined;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return Promise.resolve({
          ok: true,
          json: async () => FILTERS,
        });
      }
      if (url === SPAR_PLACES_URL) {
        return new Promise((_, reject) => {
          rejectSpar = reject;
        });
      }
      if (typeof url === 'string' && url.startsWith(`${PLACES_PREFIX}?`)) {
        return Promise.resolve({
          ok: true,
          json: async () => PLACES_FIXTURE,
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    await screen.findByLabelText('Shop');
    await waitFor(() => {
      expect(placesUrls()).toContain(SPAR_PLACES_URL);
    });

    fireEvent.change(screen.getByLabelText('Shop'), { target: { value: 'others' } });
    await waitFor(() => {
      expect(placesUrls()).toContain(OTHERS_PLACES_URL);
    });

    await waitFor(() => {
      expect(mockMap).toHaveBeenCalled();
    });
    rejectSpar(new Error('network'));
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText('The location list could not be loaded.')).not.toBeInTheDocument();
    expectNoOriginAndNoUnfilteredPlaces();
  });

  it('shows the load error when the filter fetch rejects with a non-error', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === FILTERS_URL) {
        return Promise.reject('network');
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    render(<SparPlaceMap />);

    expect(await screen.findByText('The location list could not be loaded.')).toBeInTheDocument();
    expect(placesCalls()).toHaveLength(0);
    expect(mockMap).not.toHaveBeenCalled();
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
