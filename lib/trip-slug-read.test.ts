import { describe, it, expect, vi, beforeEach } from "vitest";
const { findUnique, readTripShell } = vi.hoisted(() => ({ findUnique: vi.fn(), readTripShell: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { trip: { findUnique } } }));
vi.mock("@/lib/trip-shell-reads", () => ({ readTripShell }));
import { tripSlugFor } from "./trip-slug-read";

describe("tripSlugFor", () => {
  beforeEach(() => vi.clearAllMocks());
  it("returns the Trip's slug", async () => {
    readTripShell.mockResolvedValue({ slug: "christmas-in-europe-2026" });
    expect(await tripSlugFor("t1")).toBe("christmas-in-europe-2026");
    expect(readTripShell).toHaveBeenCalledWith("t1");
  });
  it("falls back to the id for a Trip with no slug yet (created during a deploy window)", async () => {
    readTripShell.mockResolvedValue({ slug: null });
    expect(await tripSlugFor("t2")).toBe("t2");
    readTripShell.mockResolvedValue(null);
    expect(await tripSlugFor("t3")).toBe("t3");
  });
  it("tripSlugFor reads through readTripShell and never its own query", async () => {
    readTripShell.mockResolvedValue({ slug: "s" });
    await tripSlugFor("t4");
    expect(findUnique).not.toHaveBeenCalled();
  });
});
