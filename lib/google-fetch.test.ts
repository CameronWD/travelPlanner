import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "./google-fetch";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => {
  fetchMock.mockReset();
  vi.useRealTimers();
});

describe("fetchJson", () => {
  it("returns the body", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ a: 1 }) });
    expect(await fetchJson("u")).toEqual({ ok: true, body: { a: 1 } });
  });
  it("tells http, network, parse and timeout apart", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    expect(await fetchJson("u")).toEqual({ ok: false, reason: "http" });
    fetchMock.mockRejectedValueOnce(new Error("x"));
    expect(await fetchJson("u")).toEqual({ ok: false, reason: "network" });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => { throw new Error("x"); } });
    expect(await fetchJson("u")).toEqual({ ok: false, reason: "parse" });
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce((_u: string, init: RequestInit) => new Promise((_r, rej) => {
      init.signal!.addEventListener("abort", () => rej(new Error("a")));
    }));
    const p = fetchJson("u");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await p).toEqual({ ok: false, reason: "timeout" });
  });
});
