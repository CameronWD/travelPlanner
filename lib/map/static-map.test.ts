import { describe, expect, it } from "vitest";
import { stopHex } from "@/lib/stop-colours";
import { staticMapUrl, type StaticMapStop } from "./static-map";

const base = { key: "K", mapId: "M", width: 600, height: 300, home: null, showReturn: false };
const stop = (n: number, lat: number | null = n, lng: number | null = n): StaticMapStop => ({
  id: `s${n}`,
  lat,
  lng,
  sortOrder: n - 1,
});
const params = (url: string, name: string) =>
  new URL(url).searchParams.getAll(name);
const hex = (n: number) => `0x${stopHex(n - 1, false).replace("#", "")}`;

describe("staticMapUrl", () => {
  it("is null with no located Stops", () => {
    expect(staticMapUrl({ ...base, stops: [] })).toBeNull();
    expect(staticMapUrl({ ...base, stops: [stop(1, null, null)] })).toBeNull();
  });

  it("pins three Stops with numbered labels and one path through all of them", () => {
    const url = staticMapUrl({ ...base, stops: [stop(1), stop(2), stop(3)] })!;
    expect(url.startsWith("https://maps.googleapis.com/maps/api/staticmap?")).toBe(true);
    expect(params(url, "size")).toEqual(["600x300"]);
    expect(params(url, "scale")).toEqual(["2"]);
    expect(params(url, "map_id")).toEqual(["M"]);
    expect(params(url, "key")).toEqual(["K"]);
    expect(params(url, "markers")).toEqual([
      `color:${hex(1)}|label:1|1,1`,
      `color:${hex(2)}|label:2|2,2`,
      `color:${hex(3)}|label:3|3,3`,
    ]);
    expect(params(url, "path")).toEqual(["color:0x1D1D1BFF|weight:3|1,1|2,2|3,3"]);
  });

  it("skips unlocated Stops and numbers the located ones", () => {
    const url = staticMapUrl({ ...base, stops: [stop(1), stop(2, null, null), stop(3)] })!;
    expect(params(url, "markers")).toEqual([
      `color:${hex(1)}|label:1|1,1`,
      `color:${hex(3)}|label:2|3,3`,
    ]);
    expect(params(url, "path")).toEqual(["color:0x1D1D1BFF|weight:3|1,1|3,3"]);
  });

  it("uses an encoded path for a leg that has one", () => {
    const url = staticMapUrl({
      ...base,
      stops: [stop(1), stop(2), stop(3)],
      legPaths: { "s1>s2": "abc|?_" },
    })!;
    expect(params(url, "path")).toEqual([
      "color:0x1D1D1BFF|weight:3|enc:abc|?_",
      "color:0x1D1D1BFF|weight:3|2,2|3,3",
    ]);
  });

  it("labels only the first nine Stops but pins every one", () => {
    const stops = Array.from({ length: 12 }, (_, i) => stop(i + 1));
    const markers = params(staticMapUrl({ ...base, stops })!, "markers");
    expect(markers).toHaveLength(12);
    expect(markers.filter((m) => m.includes("label:"))).toHaveLength(9);
    expect(markers[9]).toBe(`color:${hex(10)}|10,10`);
  });

  it("drops encoded paths, then keeps every marker, when the URL is too long", () => {
    const stops = Array.from({ length: 12 }, (_, i) => stop(i + 1));
    const legPaths: Record<string, string> = {};
    for (let i = 1; i < 12; i++) legPaths[`s${i}>s${i + 1}`] = "a".repeat(900);
    const url = staticMapUrl({ ...base, stops, legPaths })!;
    expect(url.length).toBeLessThanOrEqual(8192);
    expect(url).not.toContain("enc");
    expect(params(url, "markers")).toHaveLength(12);
  });

  it("draws no Home marker or legs when two or more Stops are located", () => {
    const url = staticMapUrl({ ...base, showReturn: true, home: { lat: 9, lng: 9 }, stops: [stop(1), stop(2)] })!;
    expect(params(url, "markers")).toHaveLength(2);
    expect(params(url, "markers").join()).not.toContain("label:H");
    expect(params(url, "path")).toEqual(["color:0x1D1D1BFF|weight:3|1,1|2,2"]);
  });

  it("draws Home and the outbound leg when fewer than two Stops are located", () => {
    const url = staticMapUrl({ ...base, home: { lat: 9, lng: 9 }, stops: [stop(1), stop(2, null, null)] })!;
    expect(params(url, "markers")).toContain("color:0x1D1D1B|label:H|9,9");
    expect(params(url, "path")).toEqual(["color:0x1D1D1BFF|weight:3|9,9|1,1"]);
  });

  it("adds the return leg only when showReturn is set", () => {
    const url = staticMapUrl({ ...base, showReturn: true, home: { lat: 9, lng: 9 }, stops: [stop(1)] })!;
    expect(params(url, "path")).toEqual(["color:0x1D1D1BFF|weight:3|9,9|1,1|9,9"]);
  });

  it("falls back to no Home when the single-Stop URL is still too long", () => {
    const url = staticMapUrl({ ...base, home: { lat: 9, lng: 9 }, mapId: "m".repeat(9000), stops: [stop(1)] })!;
    expect(params(url, "markers")).toEqual([`color:${hex(1)}|label:1|1,1`]);
    expect(params(url, "path")).toEqual([]);
  });

  it("rounds coordinates to six decimal places", () => {
    const url = staticMapUrl({ ...base, stops: [stop(1, 48.123456789, -0.1000004), stop(2, 10, 20.5)] })!;
    expect(params(url, "markers")[0]).toBe(`color:${hex(1)}|label:1|48.123457,-0.1`);
    expect(params(url, "path")).toEqual(["color:0x1D1D1BFF|weight:3|48.123457,-0.1|10,20.5"]);
  });

  it("keeps the single-Stop Home when dropping encoded paths is enough", () => {
    const url = staticMapUrl({
      ...base,
      home: { lat: 9, lng: 9 },
      stops: [stop(1)],
      legPaths: { "s0>s1": "a".repeat(9000) },
    })!;
    expect(url.length).toBeLessThanOrEqual(8192);
    expect(params(url, "markers")).toHaveLength(2);
  });
});
