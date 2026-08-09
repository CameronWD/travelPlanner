import { vi } from "vitest";

/**
 * Hand-rolled Leaflet test double.
 *
 * Leaflet must never run for real in jsdom (it reaches for layout APIs jsdom
 * does not implement). This records every call the map components make, so
 * tests can assert on lifecycle — in particular that a theme change does NOT
 * destroy and rebuild the map.
 *
 * Usage:
 *   const leaflet = createLeafletMock();
 *   vi.mock("leaflet", () => leaflet.module);   // must be hoisted via vi.hoisted
 */
export interface FakeTileLayer {
  url: string;
  options: Record<string, unknown>;
  setUrl: ReturnType<typeof vi.fn>;
  addTo: ReturnType<typeof vi.fn>;
}

export interface FakeMarker {
  latlng: [number, number];
  options: Record<string, unknown>;
  addTo: ReturnType<typeof vi.fn>;
  bindPopup: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  setIcon: ReturnType<typeof vi.fn>;
  setZIndexOffset: ReturnType<typeof vi.fn>;
  openPopup: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

export interface FakeMap {
  remove: ReturnType<typeof vi.fn>;
  fitBounds: ReturnType<typeof vi.fn>;
  setView: ReturnType<typeof vi.fn>;
  flyTo: ReturnType<typeof vi.fn>;
  getZoom: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
}

export function createLeafletMock() {
  const maps: FakeMap[] = [];
  const tileLayers: FakeTileLayer[] = [];
  const markers: FakeMarker[] = [];

  const map = vi.fn(() => {
    const instance: FakeMap = {
      remove: vi.fn(),
      fitBounds: vi.fn(),
      setView: vi.fn(),
      flyTo: vi.fn(),
      getZoom: vi.fn(() => 5),
      on: vi.fn(),
      off: vi.fn(),
    };
    maps.push(instance);
    return instance;
  });

  const tileLayer = vi.fn((url: string, options: Record<string, unknown>) => {
    const layer = {} as FakeTileLayer;
    layer.url = url;
    layer.options = options;
    layer.setUrl = vi.fn((next: string) => {
      layer.url = next;
    });
    layer.addTo = vi.fn(() => layer);
    tileLayers.push(layer);
    return layer;
  });

  const marker = vi.fn((latlng: [number, number], options: Record<string, unknown>) => {
    const instance = {} as FakeMarker;
    instance.latlng = latlng;
    instance.options = options;
    instance.addTo = vi.fn(() => instance);
    instance.bindPopup = vi.fn(() => instance);
    instance.on = vi.fn(() => instance);
    instance.setIcon = vi.fn();
    instance.setZIndexOffset = vi.fn();
    instance.openPopup = vi.fn();
    instance.remove = vi.fn();
    markers.push(instance);
    return instance;
  });

  const polyline = vi.fn(() => ({ addTo: vi.fn() }));
  const divIcon = vi.fn((opts: unknown) => opts);
  const latLngBounds = vi.fn((coords: unknown) => coords);

  const L = {
    map,
    tileLayer,
    marker,
    polyline,
    divIcon,
    latLngBounds,
    Icon: { Default: { prototype: { _getIconUrl: () => "" }, mergeOptions: vi.fn() } },
  };

  return { module: { default: L }, L, maps, tileLayers, markers };
}
