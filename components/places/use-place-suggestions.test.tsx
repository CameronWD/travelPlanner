import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const mock = await vi.hoisted(async () => (await import("@/test/google-maps-mock")).createGoogleMapsMock());
vi.mock("@vis.gl/react-google-maps", () => mock.module);

import { usePlaceSuggestions } from "./use-place-suggestions";
import { resetMapsAuthForTests } from "@/components/map/maps-auth";

const KYOTO = { placeId: "ChIJKyoto", mainText: "Kyoto", secondaryText: "Kyoto, Japan", lat: 35.01, lng: 135.77, formattedAddress: "Kyoto, Japan", countryCode: "jp" };

beforeEach(() => {
  mock.reset();
  mock.places.predictions = [KYOTO];
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "k");
  resetMapsAuthForTests();
  delete window.gm_authFailure;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("usePlaceSuggestions", () => {
  it("lists each prediction's id, main text and secondary text", async () => {
    const { result } = renderHook(() => usePlaceSuggestions({ kind: "region" }));
    act(() => result.current.search("Kyo"));
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.suggestions).toEqual([{ id: "ChIJKyoto", mainText: "Kyoto", secondaryText: "Kyoto, Japan" }]);
  });

  it("says empty when Google has nothing", async () => {
    mock.places.predictions = [];
    const { result } = renderHook(() => usePlaceSuggestions({ kind: "region" }));
    act(() => result.current.search("Zzzq"));
    await waitFor(() => expect(result.current.status).toBe("empty"));
  });

  it("searches what was typed before the places library loaded once it arrives", async () => {
    mock.places.loaded = false;
    const { result, rerender } = renderHook(() => usePlaceSuggestions({ kind: "region" }));
    act(() => result.current.search("Kyo"));
    await new Promise((r) => setTimeout(r, 400));
    expect(mock.places.fetchAutocompleteSuggestions).not.toHaveBeenCalled();
    mock.places.loaded = true;
    rerender();
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));
    expect(mock.places.requests[0].input).toBe("Kyo");
  });

  it("biases to near within 50 km", async () => {
    const { result } = renderHook(() => usePlaceSuggestions({ kind: "venue", near: { lat: 35, lng: 135.7 } }));
    act(() => result.current.search("Ichiran"));
    await waitFor(() => expect(mock.places.requests).toHaveLength(1));
    expect(mock.places.requests[0].locationBias).toEqual({ center: { lat: 35, lng: 135.7 }, radius: 50000 });
  });

  it("is unavailable when the Maps library failed to load", () => {
    mock.status.current = mock.module.APILoadingStatus.FAILED;
    const { result } = renderHook(() => usePlaceSuggestions({ kind: "region" }));
    expect(result.current.available).toBe(false);
  });

  it("a pick with no location returns no place", async () => {
    mock.places.predictions = [{ ...KYOTO, lat: undefined, lng: undefined }];
    const { result } = renderHook(() => usePlaceSuggestions({ kind: "region" }));
    act(() => result.current.search("Kyo"));
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));
    let picked: unknown = "unset";
    await act(async () => {
      picked = await result.current.pick("ChIJKyoto");
    });
    expect(picked).toBeNull();
  });

  it("a pick leaves out what Google didn't give", async () => {
    mock.places.predictions = [{ placeId: "ChIJJp", mainText: "Japan", lat: 36, lng: 138 }];
    const { result } = renderHook(() => usePlaceSuggestions({ kind: "region" }));
    act(() => result.current.search("Japa"));
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));
    let picked: unknown;
    await act(async () => {
      picked = await result.current.pick("ChIJJp");
    });
    expect(picked).toEqual({ name: "Japan", lat: 36, lng: 138, placeId: "ChIJJp" });
  });

  it("reset starts a new session", async () => {
    const { result } = renderHook(() => usePlaceSuggestions({ kind: "region" }));
    act(() => result.current.search("Kyo"));
    await waitFor(() => expect(mock.places.requests).toHaveLength(1));
    act(() => result.current.reset());
    expect(result.current.suggestions).toEqual([]);
    act(() => result.current.search("Kyot"));
    await waitFor(() => expect(mock.places.requests).toHaveLength(2));
    expect(mock.places.requests[1].sessionToken).not.toBe(mock.places.requests[0].sessionToken);
    expect(mock.places.tokens).toHaveLength(2);
  });
});
