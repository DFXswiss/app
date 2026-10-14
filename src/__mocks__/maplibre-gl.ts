const marker = {
  setLngLat: () => marker,
  setPopup: () => marker,
  addTo: () => marker,
};

const maplibre = {
  Map: function Map() {
    return {
      addControl: () => undefined,
      setCenter: () => undefined,
      setZoom: () => undefined,
      fitBounds: () => undefined,
      remove: () => undefined,
    };
  },
  Marker: function Marker() {
    return marker;
  },
  Popup: function Popup() {
    return { setDOMContent: () => undefined };
  },
  NavigationControl: function NavigationControl() {
    return undefined;
  },
  LngLatBounds: function LngLatBounds() {
    return { extend: () => undefined };
  },
};

export const Map = maplibre.Map;
export const Marker = maplibre.Marker;
export const Popup = maplibre.Popup;
export const NavigationControl = maplibre.NavigationControl;
export const LngLatBounds = maplibre.LngLatBounds;
export default maplibre;
