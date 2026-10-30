import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const mock = await vi.hoisted(async () => (await import("@/test/google-maps-mock")).createGoogleMapsMock());
vi.mock("@vis.gl/react-google-maps", () => mock.module);

import { usePlacesAvailable } from "./places-available";
import { resetMapsAuthForTests } from "@/components/map/maps-auth";

beforeEach(() => {
  mock.reset();
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "k");
  resetMapsAuthForTests();
  delete window.gm_authFailure;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("usePlacesAvailable", () => {
  it("is available with a browser key and no map id", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "");
    expect(renderHook(() => usePlacesAvailable()).result.current).toBe(true);
  });

  it("is unavailable without a browser key", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "");
    expect(renderHook(() => usePlacesAvailable()).result.current).toBe(false);
  });

  it("is unavailable once Google refuses the key", () => {
    const { result } = renderHook(() => usePlacesAvailable());
    expect(result.current).toBe(true);
    act(() => window.gm_authFailure?.());
    expect(result.current).toBe(false);
  });

  it.each([mock.module.APILoadingStatus.FAILED, mock.module.APILoadingStatus.AUTH_FAILURE])("is unavailable when the library load ends %s", (status) => {
    mock.status.current = status;
    expect(renderHook(() => usePlacesAvailable()).result.current).toBe(false);
  });
});
