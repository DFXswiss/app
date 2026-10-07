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
import { SparPlaceMap } from 'src/components/payment/spar-place-map';

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

    const chCall = placesCalls().find(([url]) => url === SPAR_CH_PLACES_URL);
    expect(chCall?.[1]).toEqual(expect.objectContaining({ credentials: 'omit' }));
    expectNoOriginAndNoUnfilteredPlaces();
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

    expect(await screen.findByText('The place list could not be loaded.')).toBeInTheDocument();
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

    expect(await screen.findByText('The place list could not be loaded.')).toBeInTheDocument();
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
    expect(screen.queryByText('The place list could not be loaded.')).not.toBeInTheDocument();
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
    expect(screen.queryByText('The place list could not be loaded.')).not.toBeInTheDocument();
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

    expect(await screen.findByText('The place list could not be loaded.')).toBeInTheDocument();
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

    expect(await screen.findByText('The place list could not be loaded.')).toBeInTheDocument();
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

    expect(await screen.findByText('The place list could not be loaded.')).toBeInTheDocument();
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

    expect(await screen.findByText('The place list could not be loaded.')).toBeInTheDocument();
    expect(placesCalls()[0][0]).toBe(SPAR_PLACES_URL);
    expectNoOriginAndNoUnfilteredPlaces();
    expect(mockMap).not.toHaveBeenCalled();
  });
});
