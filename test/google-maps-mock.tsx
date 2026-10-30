import * as React from "react";
import { vi } from "vitest";

/**
 * Hand-rolled `@vis.gl/react-google-maps` test double — Google's script never
 * loads in jsdom/happy-dom. Records what the map components pass so tests can
 * assert on it. The components import the library statically, so a hoisted
 * `vi.mock` is enough; build the mock at hoist time and `reset()` it per test:
 *
 *   const mock = await vi.hoisted(async () =>
 *     (await import("@/test/google-maps-mock")).createGoogleMapsMock());
 *   vi.mock("@vis.gl/react-google-maps", () => mock.module);
 *   beforeEach(() => mock.reset());
 */

type Props = Record<string, unknown>;

const ColorScheme = { DARK: "DARK", LIGHT: "LIGHT", FOLLOW_SYSTEM: "FOLLOW_SYSTEM" } as const;
const APILoadingStatus = {
  NOT_LOADED: "NOT_LOADED",
  LOADING: "LOADING",
  LOADED: "LOADED",
  FAILED: "FAILED",
  AUTH_FAILURE: "AUTH_FAILURE",
} as const;

type FakePolyline = {
  options: Props;
  setMap: ReturnType<typeof vi.fn>;
  setOptions: ReturnType<typeof vi.fn>;
};

export type FakePrediction = {
  placeId: string;
  mainText: string;
  secondaryText?: string;
  lat?: number;
  lng?: number;
  formattedAddress?: string;
  countryCode?: string;
};

function withoutChildren(props: Props) {
  const rest = { ...props };
  delete rest.children;
  return rest;
}

export function createGoogleMapsMock() {
  const status = { current: APILoadingStatus.LOADED as string };
  const markerStub = { stub: "advanced-marker" };
  const markerRef = vi.fn();

  const map = {
    fitBounds: vi.fn(),
    setCenter: vi.fn(),
    setZoom: vi.fn(),
    getZoom: vi.fn(() => 5),
    panTo: vi.fn(),
    addListener: vi.fn(() => ({ remove: vi.fn() })),
  };

  const recorded = {
    map: [] as Props[],
    mapMounts: 0,
    markers: [] as Props[],
    infoWindows: [] as Props[],
    polylines: [] as FakePolyline[],
  };

  const providers: Props[] = [];

  function APIProvider(props: Props & { children?: React.ReactNode }) {
    providers.push(withoutChildren(props));
    return <>{props.children}</>;
  }

  const places = {
    loaded: true,
    predictions: [] as FakePrediction[],
    requests: [] as google.maps.places.AutocompleteRequest[],
    tokens: [] as object[],
    fetchFields: vi.fn(),
    fetchAutocompleteSuggestions: vi.fn(),
  };

  function fakePlace(p: FakePrediction) {
    return {
      fetchFields: places.fetchFields,
      id: p.placeId,
      location: p.lat === undefined || p.lng === undefined ? null : { lat: () => p.lat, lng: () => p.lng },
      formattedAddress: p.formattedAddress ?? null,
      addressComponents: p.countryCode ? [{ longText: p.countryCode, shortText: p.countryCode.toUpperCase(), types: ["country", "political"] }] : [],
      regularOpeningHours: null,
      websiteURI: null,
      businessStatus: null,
    };
  }

  function defaultSuggestions(request: google.maps.places.AutocompleteRequest) {
    places.requests.push(request);
    return Promise.resolve({
      suggestions: places.predictions.map((p) => ({
        placePrediction: {
          placeId: p.placeId,
          mainText: { text: p.mainText },
          secondaryText: p.secondaryText === undefined ? null : { text: p.secondaryText },
          text: { text: [p.mainText, p.secondaryText].filter(Boolean).join(", ") },
          toPlace: () => fakePlace(p),
        },
      })),
    });
  }

  class AutocompleteSessionToken {
    constructor() {
      places.tokens.push(this);
    }
  }

  const placesLibrary = {
    AutocompleteSuggestion: { fetchAutocompleteSuggestions: places.fetchAutocompleteSuggestions },
    AutocompleteSessionToken,
  };

  function resetPlaces() {
    places.loaded = true;
    places.predictions = [];
    places.requests = [];
    places.tokens = [];
    places.fetchFields.mockReset().mockImplementation(() => Promise.resolve({}));
    places.fetchAutocompleteSuggestions.mockReset().mockImplementation(defaultSuggestions);
  }

  function Map(props: Props & { className?: string; children?: React.ReactNode }) {
    recorded.map.push(withoutChildren(props));
    React.useEffect(() => {
      recorded.mapMounts += 1;
    }, []);
    return (
      <div data-testid="gmap" className={props.className}>
        {props.children}
      </div>
    );
  }

  function AdvancedMarker(props: Props & { title?: string; onClick?: () => void; children?: React.ReactNode }) {
    const rest = withoutChildren(props);
    delete rest.ref;
    recorded.markers.push(rest);
    return (
      <div data-testid="marker" title={props.title} onClick={props.onClick}>
        {props.children}
      </div>
    );
  }

  function InfoWindow(props: Props & { children?: React.ReactNode }) {
    recorded.infoWindows.push(withoutChildren(props));
    return <div role="dialog">{props.children}</div>;
  }

  class LatLngBounds {
    points: google.maps.LatLngLiteral[] = [];
    extend(point: google.maps.LatLngLiteral) {
      this.points.push(point);
      return this;
    }
  }

  class Polyline implements FakePolyline {
    options: Props;
    setMap = vi.fn();
    setOptions = vi.fn((next: Props) => {
      this.options = { ...this.options, ...next };
    });
    constructor(options: Props = {}) {
      this.options = options;
      recorded.polylines.push(this);
    }
  }

  const SymbolPath = {
    CIRCLE: 0,
    FORWARD_CLOSED_ARROW: 1,
    FORWARD_OPEN_ARROW: 2,
    BACKWARD_CLOSED_ARROW: 3,
    BACKWARD_OPEN_ARROW: 4,
  };

  function installGlobal() {
    (globalThis as unknown as { google: unknown }).google = { maps: { LatLngBounds, Polyline, SymbolPath } };
  }

  const standIn = {
    APIProvider,
    Map,
    AdvancedMarker,
    InfoWindow,
    useAdvancedMarkerRef: () => [markerRef, markerStub] as const,
    useMap: () => map,
    useApiLoadingStatus: () => status.current,
    useMapsLibrary: (name: string) => (name === "places" && places.loaded ? placesLibrary : null),
    ColorScheme,
    APILoadingStatus,
  };

  function reset() {
    status.current = APILoadingStatus.LOADED;
    recorded.map = [];
    recorded.mapMounts = 0;
    recorded.markers = [];
    recorded.infoWindows = [];
    recorded.polylines = [];
    providers.length = 0;
    resetPlaces();
    markerRef.mockClear();
    for (const fn of Object.values(map)) fn.mockReset();
    installGlobal();
  }

  resetPlaces();
  installGlobal();

  return { module: standIn, map, status, markerStub, recorded, providers, places, reset };
}
