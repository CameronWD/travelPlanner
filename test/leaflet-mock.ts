import { vi } from "vitest";

/**
 * Hand-rolled Leaflet test double.
 *
 * Leaflet must never run for real in jsdom (it reaches for layout APIs jsdom
 * does not implement). This records every call the map components make, so
 * tests can assert on lifecycle — in particular that a theme change does NOT
 * destroy and rebuild the map.
 *
 * Usage — inside a `beforeEach`, NOT a hoisted top-level `vi.mock`:
 *
 *   const hoisted = vi.hoisted(() => ({ leaflet: null as ReturnType<typeof createLeafletMock> | null }));
 *   beforeEach(() => {
 *     hoisted.leaflet = createLeafletMock();
 *     vi.doMock("leaflet", () => hoisted.leaflet!.module);
 *   });
 *
 * Why `vi.doMock` in `beforeEach` and not a hoisted `vi.mock`: the map
 * components dynamically `import("leaflet")` inside an effect, and Vitest
 * resolves a dynamically-imported specifier once and caches it for the rest
 * of the test file. A hoisted `vi.mock` factory therefore only ever runs
 * once per file — every test after the first would silently resolve the
 * FIRST test's cached module instead of its own fresh mock, and fail with
 * "no map was ever built" even though the component behaved correctly.
 * `vi.doMock` re-registers the factory before each test so the next dynamic
 * import picks up the current mock instance.
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

export interface FakePolyline {
  latlngs: unknown;
  options: Record<string, unknown>;
  addTo: ReturnType<typeof vi.fn>;
  setStyle: ReturnType<typeof vi.fn>;
}

export interface FakeMap {
  options: Record<string, unknown>;
  remove: ReturnType<typeof vi.fn>;
  fitBounds: ReturnType<typeof vi.fn>;
  setView: ReturnType<typeof vi.fn>;
  flyTo: ReturnType<typeof vi.fn>;
  getZoom: ReturnType<typeof vi.fn>;
  setZoom: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  closePopup: ReturnType<typeof vi.fn>;
}

export function createLeafletMock() {
  const maps: FakeMap[] = [];
  const tileLayers: FakeTileLayer[] = [];
  const markers: FakeMarker[] = [];

  // Overridable by a test (before `render`) via `setNextMapZoom`, to exercise
  // post-`fitBounds` zoom-clamping logic. Defaults to 5 (a plausible "already
  // fine" zoom) so existing tests that don't care about zoom are unaffected.
  let nextMapZoom = 5;

  const map = vi.fn((_el: unknown, options: Record<string, unknown> = {}) => {
    const instance: FakeMap = {
      options,
      remove: vi.fn(),
      fitBounds: vi.fn(),
      setView: vi.fn(),
      flyTo: vi.fn(),
      getZoom: vi.fn(() => nextMapZoom),
      setZoom: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      closePopup: vi.fn(),
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

  const polylines: FakePolyline[] = [];
  const polyline = vi.fn((latlngs: unknown, options: Record<string, unknown>) => {
    const instance = {} as FakePolyline;
    instance.latlngs = latlngs;
    instance.options = options;
    instance.addTo = vi.fn(() => instance);
    instance.setStyle = vi.fn();
    polylines.push(instance);
    return instance;
  });
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

  return {
    module: { default: L },
    L,
    maps,
    tileLayers,
    markers,
    polylines,
    /** Set the zoom the NEXT created map's `getZoom()` returns (default 5). */
    setNextMapZoom: (zoom: number) => {
      nextMapZoom = zoom;
    },
  };
}
