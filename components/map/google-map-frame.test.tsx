import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { APILoadingStatus, ColorScheme } from "@vis.gl/react-google-maps";

const mock = await vi.hoisted(async () => (await import("@/test/google-maps-mock")).createGoogleMapsMock());
vi.mock("@vis.gl/react-google-maps", () => mock.module);

import { GoogleMapFrame } from "./google-map-frame";
import { resetMapsAuthForTests } from "./maps-auth";
import { HtmlPin } from "./html-pin";
import { MapPolyline } from "./map-polyline";
import { MapUnavailable } from "./map-unavailable";
import { FIT_SINGLE_ZOOM, useFitBounds } from "./use-fit-bounds";

const FALLBACK = <p>No map today</p>;

function last<T>(items: T[]): T {
  return items[items.length - 1];
}

beforeEach(() => {
  mock.reset();
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "k");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "m");
  resetMapsAuthForTests();
  delete window.gm_authFailure;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GoogleMapFrame", () => {
  it("renders the fallback when there is no config", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "");
    render(<GoogleMapFrame fallback={FALLBACK} dark={false} />);
    expect(screen.getByText("No map today")).toBeInTheDocument();
    expect(screen.queryByTestId("gmap")).not.toBeInTheDocument();
  });

  it("calls onFail when there is no config", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "");
    const onFail = vi.fn();
    render(<GoogleMapFrame fallback={null} dark={false} onFail={onFail} />);
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it("renders the map with the map id and a light colour scheme", () => {
    render(<GoogleMapFrame fallback={FALLBACK} dark={false} />);
    expect(screen.getByTestId("gmap")).toHaveClass("tp-map");
    const props = last(mock.recorded.map);
    expect(props.mapId).toBe("m");
    expect(props.colorScheme).toBe(ColorScheme.LIGHT);
    expect(props.disableDefaultUI).toBe(true);
    expect(props.zoomControl).toBe(true);
    expect(props.clickableIcons).toBe(false);
  });

  it("starts on a world view when the caller gives no camera", () => {
    render(<GoogleMapFrame fallback={FALLBACK} dark={false} />);
    expect(last(mock.recorded.map)).toMatchObject({ defaultCenter: { lat: 20, lng: 0 }, defaultZoom: 2 });
  });

  it("lets the caller's camera and controls win over the defaults", () => {
    render(
      <GoogleMapFrame fallback={FALLBACK} dark={false} mapProps={{ defaultCenter: { lat: 1, lng: 2 }, defaultZoom: 5, zoomControl: false }} />,
    );
    expect(last(mock.recorded.map)).toMatchObject({ defaultCenter: { lat: 1, lng: 2 }, defaultZoom: 5, zoomControl: false });
  });

  it("remounts the map in the dark scheme when dark flips", () => {
    const { rerender } = render(<GoogleMapFrame fallback={FALLBACK} dark={false} />);
    rerender(<GoogleMapFrame fallback={FALLBACK} dark />);
    expect(last(mock.recorded.map).colorScheme).toBe(ColorScheme.DARK);
    expect(mock.recorded.mapMounts).toBe(2);
  });

  it("puts the caller's className and style on the box around the map", () => {
    render(<GoogleMapFrame fallback={FALLBACK} dark={false} className="h-[200px]" style={{ height: 300 }} />);
    const box = screen.getByTestId("gmap").parentElement!;
    expect(box).toHaveClass("h-[200px]");
    expect(box).toHaveStyle({ height: "300px" });
  });

  it("falls back and calls onFail when the API fails to load", () => {
    mock.status.current = APILoadingStatus.FAILED;
    const onFail = vi.fn();
    render(<GoogleMapFrame fallback={FALLBACK} dark={false} onFail={onFail} />);
    expect(screen.getByText("No map today")).toBeInTheDocument();
    expect(screen.queryByTestId("gmap")).not.toBeInTheDocument();
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it("falls back when Google calls gm_authFailure", () => {
    const onFail = vi.fn();
    render(<GoogleMapFrame fallback={FALLBACK} dark={false} onFail={onFail} />);
    act(() => window.gm_authFailure!());
    expect(screen.getByText("No map today")).toBeInTheDocument();
    expect(screen.queryByTestId("gmap")).not.toBeInTheDocument();
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it("falls back at once when Google refused the key before this frame mounted", () => {
    const first = render(<GoogleMapFrame fallback={FALLBACK} dark={false} />);
    act(() => window.gm_authFailure!());
    first.unmount();
    const onFail = vi.fn();
    render(<GoogleMapFrame fallback={FALLBACK} dark={false} onFail={onFail} />);
    expect(screen.getByText("No map today")).toBeInTheDocument();
    expect(screen.queryByTestId("gmap")).not.toBeInTheDocument();
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it("falls back in every mounted frame on one gm_authFailure", () => {
    render(
      <>
        <GoogleMapFrame fallback={<p>First fallback</p>} dark={false} />
        <GoogleMapFrame fallback={<p>Second fallback</p>} dark={false} />
      </>,
    );
    expect(screen.getAllByTestId("gmap")).toHaveLength(2);
    act(() => window.gm_authFailure!());
    expect(screen.getByText("First fallback")).toBeInTheDocument();
    expect(screen.getByText("Second fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("gmap")).not.toBeInTheDocument();
  });

  it("still calls a gm_authFailure handler installed before it", () => {
    const previous = vi.fn();
    window.gm_authFailure = previous;
    const { unmount } = render(<GoogleMapFrame fallback={FALLBACK} dark={false} />);
    unmount();
    render(<GoogleMapFrame fallback={FALLBACK} dark={false} />);
    act(() => window.gm_authFailure!());
    expect(previous).toHaveBeenCalledTimes(1);
    expect(screen.getByText("No map today")).toBeInTheDocument();
  });

  it("falls back when a child throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Boom(): never {
      throw new Error("dead maps library");
    }
    const onFail = vi.fn();
    render(
      <main>
        <h1>Trip</h1>
        <GoogleMapFrame fallback={FALLBACK} dark={false} onFail={onFail}>
          <Boom />
        </GoogleMapFrame>
      </main>,
    );
    expect(screen.getByText("No map today")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Trip" })).toBeInTheDocument();
    expect(onFail).toHaveBeenCalledTimes(1);
  });
});

describe("MapUnavailable", () => {
  it("says the map is unavailable above the caller's list", () => {
    render(
      <MapUnavailable>
        <ol>
          <li>Tokyo</li>
        </ol>
      </MapUnavailable>,
    );
    const box = screen.getByText("The map isn't available right now.").closest("[data-map-fallback]");
    expect(box).toContainElement(screen.getByRole("list"));
  });
});

describe("HtmlPin", () => {
  const POSITION = { lat: 35.68, lng: 139.76 };

  it("mounts the pin HTML in a tp-map-pin wrapper", () => {
    render(<HtmlPin position={POSITION} html="<span>1</span>" title="Tokyo" />);
    const marker = screen.getByTestId("marker");
    expect(marker).toHaveAttribute("title", "Tokyo");
    expect(marker.querySelector(".tp-map-pin")!.innerHTML).toBe("<span>1</span>");
    expect(last(mock.recorded.markers).position).toEqual(POSITION);
  });

  it("anchors the pin at its centre", () => {
    render(<HtmlPin position={POSITION} html="<span>1</span>" />);
    const props = last(mock.recorded.markers);
    expect(props.anchorLeft).toBe("-50%");
    expect(props.anchorTop).toBe("-50%");
  });

  it("renders the popup beside the marker, anchored to it", () => {
    render(
      <HtmlPin position={POSITION} html="<span>1</span>" open>
        <p>Tokyo, 3 nights</p>
      </HtmlPin>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Tokyo, 3 nights");
    expect(screen.getByTestId("marker")).not.toContainElement(dialog);
    expect(last(mock.recorded.infoWindows).anchor).toBe(mock.markerStub);
  });

  it("shows no popup while closed", () => {
    render(
      <HtmlPin position={POSITION} html="<span>1</span>">
        <p>Tokyo, 3 nights</p>
      </HtmlPin>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("MapPolyline", () => {
  const PATH = [
    { lat: 35.68, lng: 139.76 },
    { lat: 35.01, lng: 135.77 },
  ];

  it("draws a solid line on the map and removes it on unmount", () => {
    const { unmount } = render(<MapPolyline path={PATH} color="#f00" weight={3} opacity={0.8} geodesic />);
    const line = mock.recorded.polylines[0];
    expect(line.setMap).toHaveBeenCalledWith(mock.map);
    expect(line.options).toMatchObject({ path: PATH, strokeColor: "#f00", strokeWeight: 3, strokeOpacity: 0.8, geodesic: true });
    unmount();
    expect(line.setMap).toHaveBeenLastCalledWith(null);
  });

  it("draws a dashed line as repeated dash symbols", () => {
    render(<MapPolyline path={PATH} color="#f00" weight={2} dashed />);
    const options = mock.recorded.polylines[0].options;
    expect(options.strokeOpacity).toBe(0);
    expect(options.icons).toEqual([
      { icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 2 }, offset: "0", repeat: "10px" },
    ]);
  });

  it("updates the same line in place when its props change", () => {
    const { rerender } = render(<MapPolyline path={PATH} color="#f00" weight={3} />);
    rerender(<MapPolyline path={PATH} color="#0f0" weight={3} />);
    expect(mock.recorded.polylines).toHaveLength(1);
    expect(mock.recorded.polylines[0].options.strokeColor).toBe("#0f0");
  });
});

describe("useFitBounds", () => {
  function Probe({ points, maxZoom }: { points: google.maps.LatLngLiteral[]; maxZoom?: number }) {
    useFitBounds(points, { maxZoom });
    return null;
  }

  it("centres on a single point at FIT_SINGLE_ZOOM", () => {
    render(
      <GoogleMapFrame fallback={FALLBACK} dark={false}>
        <Probe points={[{ lat: 35.68, lng: 139.76 }]} />
      </GoogleMapFrame>,
    );
    expect(FIT_SINGLE_ZOOM).toBe(12);
    expect(mock.map.setCenter).toHaveBeenCalledWith({ lat: 35.68, lng: 139.76 });
    expect(mock.map.setZoom).toHaveBeenCalledWith(12);
    expect(mock.map.fitBounds).not.toHaveBeenCalled();
  });

  it("fits two points with padding 40", () => {
    const points = [
      { lat: 35.68, lng: 139.76 },
      { lat: 35.01, lng: 135.77 },
    ];
    render(
      <GoogleMapFrame fallback={FALLBACK} dark={false}>
        <Probe points={points} />
      </GoogleMapFrame>,
    );
    expect(mock.map.fitBounds).toHaveBeenCalledTimes(1);
    const [bounds, padding] = mock.map.fitBounds.mock.calls[0];
    expect(bounds.points).toEqual(points);
    expect(padding).toBe(40);
  });

  it("does nothing with no points", () => {
    render(
      <GoogleMapFrame fallback={FALLBACK} dark={false}>
        <Probe points={[]} />
      </GoogleMapFrame>,
    );
    expect(mock.map.setCenter).not.toHaveBeenCalled();
    expect(mock.map.setZoom).not.toHaveBeenCalled();
    expect(mock.map.fitBounds).not.toHaveBeenCalled();
  });

  it("clamps to maxZoom once the fit settles", () => {
    render(<Probe points={[{ lat: 1, lng: 2 }, { lat: 1.001, lng: 2.001 }]} maxZoom={14} />);
    const [event, onIdle] = mock.map.addListener.mock.calls[0] as unknown as [string, () => void];
    expect(event).toBe("idle");
    mock.map.getZoom.mockReturnValue(19);
    onIdle();
    expect(mock.map.setZoom).toHaveBeenCalledWith(14);
  });

  it("drops a pending maxZoom clamp when the points change or it unmounts", () => {
    const remove = vi.fn();
    mock.map.addListener.mockReturnValue({ remove });
    const { rerender, unmount } = render(<Probe points={[{ lat: 1, lng: 2 }, { lat: 1.001, lng: 2.001 }]} maxZoom={14} />);
    rerender(<Probe points={[{ lat: 3, lng: 4 }, { lat: 3.001, lng: 4.001 }]} maxZoom={14} />);
    expect(remove).toHaveBeenCalledTimes(1);
    unmount();
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it("does not refit when the same points arrive as a new array", () => {
    const { rerender } = render(<Probe points={[{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }]} />);
    rerender(<Probe points={[{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }]} />);
    expect(mock.map.fitBounds).toHaveBeenCalledTimes(1);
    rerender(<Probe points={[{ lat: 1, lng: 2 }, { lat: 5, lng: 6 }]} />);
    expect(mock.map.fitBounds).toHaveBeenCalledTimes(2);
  });
});
