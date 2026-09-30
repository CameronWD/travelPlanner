import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireUser, search } = vi.hoisted(() => ({ requireUser: vi.fn(), search: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requireUser }));
vi.mock("@/lib/geocode", () => ({ searchPlacesWithStatus: search }));

import { findPlaces } from "./places";

describe("findPlaces", () => {
  beforeEach(() => {
    requireUser.mockReset().mockResolvedValue({ id: "u1" });
    search.mockReset().mockResolvedValue({ status: "ok", candidates: [] });
  });
  it("is session-gated before it searches", async () => {
    requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(findPlaces("Sydney")).rejects.toThrow();
    expect(search).not.toHaveBeenCalled();
  });
  it("searches five results", async () => {
    await findPlaces("Sydney");
    expect(search).toHaveBeenCalledWith("Sydney", 5);
  });
  it("refuses a non-string and caps the query length", async () => {
    expect(await findPlaces(42 as unknown as string)).toEqual({ status: "ok", candidates: [] });
    await findPlaces("x".repeat(500));
    expect(search.mock.calls[0][0]).toHaveLength(200);
  });
});
