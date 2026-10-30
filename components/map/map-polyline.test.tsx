import { describe, expect, it, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";

const mock = await vi.hoisted(async () => (await import("@/test/google-maps-mock")).createGoogleMapsMock());
vi.mock("@vis.gl/react-google-maps", () => mock.module);

import { MapPolyline } from "./map-polyline";

// Google's documented example: (38.5,-120.2), (40.7,-120.95), (43.252,-126.453)
const ENCODED = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

beforeEach(() => mock.reset());

describe("MapPolyline encodedPath", () => {
  it("decodes the encoded path and prefers it over path", () => {
    render(<MapPolyline path={[{ lat: 1, lng: 1 }]} encodedPath={ENCODED} color="#000" weight={3} />);
    const path = mock.recorded.polylines[0].options.path as { lat: number; lng: number }[];
    expect(path).toHaveLength(3);
    expect(path[0]).toEqual({ lat: 38.5, lng: -120.2 });
    expect(path[2]).toEqual({ lat: 43.252, lng: -126.453 });
  });

  it("uses path when there is no encodedPath", () => {
    render(<MapPolyline path={[{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }]} color="#000" weight={3} />);
    expect(mock.recorded.polylines[0].options.path).toEqual([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }]);
  });
});
