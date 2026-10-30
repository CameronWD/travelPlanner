import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeRoute } from "./routes";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const A = { lat: 35.01, lng: 135.77 };
const B = { lat: 35.02, lng: 135.78 };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "k");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("computeRoute", () => {
  it("posts the field mask, key and body for WALK without a departure", async () => {
    fetchMock.mockResolvedValue(ok({ routes: [{ duration: "600s", distanceMeters: 800, polyline: { encodedPolyline: "abc" } }] }));
    const r = await computeRoute(A, B, "WALK", new Date("2026-11-01T00:00:00Z"));
    expect(r).toEqual({ status: "ok", minutes: 10, distanceM: 800, polyline: "abc" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Goog-Api-Key"]).toBe("k");
    expect(init.headers["X-Goog-FieldMask"]).toBe("routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline");
    expect(JSON.parse(init.body)).toEqual({
      origin: { location: { latLng: { latitude: 35.01, longitude: 135.77 } } },
      destination: { location: { latLng: { latitude: 35.02, longitude: 135.78 } } },
      travelMode: "WALK",
    });
  });

  it("sends no routingPreference or departure for DRIVE", async () => {
    fetchMock.mockResolvedValue(ok({ routes: [{ duration: "60s" }] }));
    await computeRoute(A, B, "DRIVE");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.travelMode).toBe("DRIVE");
    expect(body).not.toHaveProperty("routingPreference");
    expect(body).not.toHaveProperty("departureTime");
  });

  it("sends departureTime as RFC3339 for TRANSIT", async () => {
    fetchMock.mockResolvedValue(ok({ routes: [{ duration: "1234s", distanceMeters: 5000, polyline: { encodedPolyline: "p" } }] }));
    const r = await computeRoute(A, B, "TRANSIT", new Date("2026-11-01T09:15:00Z"));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).departureTime).toBe("2026-11-01T09:15:00.000Z");
    expect(r).toEqual({ status: "ok", minutes: 21, distanceM: 5000, polyline: "p" });
  });

  it("rounds minutes up, including fractional seconds", async () => {
    fetchMock.mockResolvedValue(ok({ routes: [{ duration: "60.5s", distanceMeters: 1 }] }));
    expect((await computeRoute(A, B, "WALK")) as { minutes: number }).toMatchObject({ minutes: 2 });
  });

  it("handles proto3-omitted fields on a zero-length route", async () => {
    fetchMock.mockResolvedValue(ok({ routes: [{ duration: "0s" }] }));
    expect(await computeRoute(A, A, "WALK")).toEqual({ status: "ok", minutes: 0, distanceM: 0, polyline: "" });
  });

  it("reports none for empty or absent routes", async () => {
    fetchMock.mockResolvedValueOnce(ok({ routes: [] }));
    expect(await computeRoute(A, B, "TRANSIT", new Date())).toEqual({ status: "none" });
    fetchMock.mockResolvedValueOnce(ok({}));
    expect(await computeRoute(A, B, "WALK")).toEqual({ status: "none" });
  });

  it("reports error for http failures, network throws, bad json and malformed routes", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) });
    expect(await computeRoute(A, B, "WALK")).toEqual({ status: "error" });
    fetchMock.mockRejectedValueOnce(new Error("down"));
    expect(await computeRoute(A, B, "WALK")).toEqual({ status: "error" });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new Error("bad"); } });
    expect(await computeRoute(A, B, "WALK")).toEqual({ status: "error" });
    fetchMock.mockResolvedValueOnce(ok({ routes: [{ duration: "soon" }] }));
    expect(await computeRoute(A, B, "WALK")).toEqual({ status: "error" });
    fetchMock.mockResolvedValueOnce(ok({ routes: "x" }));
    expect(await computeRoute(A, B, "WALK")).toEqual({ status: "error" });
  });

  it("never fetches without a server key", async () => {
    vi.stubEnv("GOOGLE_MAPS_SERVER_KEY", "");
    expect(await computeRoute(A, B, "WALK")).toEqual({ status: "error" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts after 5 seconds and reports error", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_u: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal!.addEventListener("abort", () => rej(new Error("aborted")));
    }));
    const p = computeRoute(A, B, "WALK");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await p).toEqual({ status: "error" });
  });
});
