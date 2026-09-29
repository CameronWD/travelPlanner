import { describe, it, expect, vi, beforeEach } from "vitest";
const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { trip: { findUnique } } }));
import { tripSlugFor } from "./trip-slug-read";

describe("tripSlugFor", () => {
  beforeEach(() => findUnique.mockReset());
  it("returns the Trip's slug", async () => {
    findUnique.mockResolvedValue({ slug: "christmas-in-europe-2026" });
    expect(await tripSlugFor("t1")).toBe("christmas-in-europe-2026");
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "t1" }, select: { slug: true } });
  });
  it("falls back to the id for a Trip with no slug yet (created during a deploy window)", async () => {
    findUnique.mockResolvedValue({ slug: null });
    expect(await tripSlugFor("t2")).toBe("t2");
    findUnique.mockResolvedValue(null);
    expect(await tripSlugFor("t3")).toBe("t3");
  });
});
