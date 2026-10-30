import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const mock = await vi.hoisted(async () => (await import("@/test/google-maps-mock")).createGoogleMapsMock());
vi.mock("@vis.gl/react-google-maps", () => mock.module);

import { usePlaceSuggestions } from "./use-place-suggestions";
import { resetMapsAuthForTests } from "@/components/map/maps-auth";

const KYOTO = { placeId: "ChIJKyoto", mainText: "Kyoto", secondaryText: "Kyoto, Japan", lat: 35.01, lng: 135.77, formattedAddress: "Kyoto, Japan", countryCode: "jp", country: "Japan" };

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

  it("a trailing space does not send the same input again", async () => {
    const { result } = renderHook(() => usePlaceSuggestions({ kind: "region" }));
    act(() => result.current.search("Kyo"));
    await waitFor(() => expect(mock.places.requests).toHaveLength(1));
    act(() => result.current.search("Kyo "));
    await new Promise((r) => setTimeout(r, 400));
    expect(mock.places.requests).toHaveLength(1);
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

  it("a pick names the country in full where Google abbreviates it", async () => {
    mock.places.predictions = [{ placeId: "ChIJPdx", mainText: "Portland", secondaryText: "OR, USA", lat: 45.52, lng: -122.68, countryCode: "us", country: "United States" }];
    const { result } = renderHook(() => usePlaceSuggestions({ kind: "region" }));
    act(() => result.current.search("Portl"));
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));
    let picked: { region?: string } | null = null;
    await act(async () => {
      picked = await result.current.pick("ChIJPdx");
    });
    expect(picked!.region).toBe("OR, United States");
  });

  it("a country pick has no region", async () => {
    mock.places.predictions = [{ placeId: "ChIJJp", mainText: "Japan", lat: 36, lng: 138, countryCode: "jp", country: "Japan" }];
    const { result } = renderHook(() => usePlaceSuggestions({ kind: "region" }));
    act(() => result.current.search("Japa"));
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));
    let picked: { region?: string } | null = null;
    await act(async () => {
      picked = await result.current.pick("ChIJJp");
    });
    expect(picked).not.toHaveProperty("region");
  });

  async function pickOne(prediction: Record<string, unknown>) {
    mock.places.predictions = [prediction as never];
    const { result } = renderHook(() => usePlaceSuggestions({ kind: "any" }));
    act(() => result.current.search("abc"));
    await waitFor(() => expect(result.current.suggestions).toHaveLength(1));
    let picked: { city?: string; country?: string } | null = null;
    await act(async () => {
      picked = await result.current.pick(prediction.placeId as string);
    });
    return picked!;
  }

  it("a locality pick carries its city and country", async () => {
    const picked = await pickOne({
      placeId: "ChIJKy", mainText: "Kyoto", secondaryText: "Kyoto Prefecture, Japan", lat: 35.01, lng: 135.77, countryCode: "jp", country: "Japan",
      components: [
        { longText: "Kyoto", shortText: "Kyoto", types: ["locality", "political"] },
        { longText: "Kyoto Prefecture", shortText: "Kyoto Prefecture", types: ["administrative_area_level_1", "political"] },
      ],
    });
    expect(picked).toMatchObject({ city: "Kyoto", country: "Japan" });
  });

  it("a venue pick takes its city from the locality, not the ward", async () => {
    const picked = await pickOne({
      placeId: "ChIJTt", mainText: "Tokyo Tower", secondaryText: "Minato City, Tokyo, Japan", lat: 35.65, lng: 139.74, countryCode: "jp", country: "Japan",
      components: [
        { longText: "Minato City", shortText: "Minato City", types: ["sublocality_level_1", "sublocality", "political"] },
        { longText: "Tokyo", shortText: "Tokyo", types: ["locality", "political"] },
      ],
    });
    expect(picked).toMatchObject({ city: "Tokyo", country: "Japan" });
  });

  it("falls back to the postal town, then the county, then the state", async () => {
    const picked = await pickOne({
      placeId: "ChIJPt", mainText: "Pub", lat: 51, lng: 0, countryCode: "gb", country: "United Kingdom",
      components: [
        { longText: "Greater London", shortText: "Greater London", types: ["administrative_area_level_2"] },
        { longText: "England", shortText: "England", types: ["administrative_area_level_1"] },
        { longText: "London", shortText: "London", types: ["postal_town"] },
      ],
    });
    expect(picked.city).toBe("London");
  });

  it("a pick carries the prediction's place types, which cost nothing", async () => {
    const picked = await pickOne({ placeId: "ChIJIc", mainText: "Ichiran", lat: 35.66, lng: 139.7, types: ["restaurant", "establishment"] });
    expect(picked).toMatchObject({ types: ["restaurant", "establishment"] });
    expect(mock.places.fetchFields).toHaveBeenCalledWith({ fields: ["id", "location", "formattedAddress", "addressComponents"] });
  });

  it("a country pick has the country and no city", async () => {
    const picked = await pickOne({ placeId: "ChIJIe", mainText: "Ireland", lat: 53, lng: -8, countryCode: "ie", country: "Ireland" });
    expect(picked.country).toBe("Ireland");
    expect(picked).not.toHaveProperty("city");
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
