import { describe, it, expect, vi } from "vitest";

// The chapters module imports next-auth transitively; mock the minimum set so
// it loads cleanly in the jsdom/node test environment.
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    chapter: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), createMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    stop: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    trip: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/server/actions/activity", () => ({ recordActivity: vi.fn() }));

import { canAssignToChapter } from "./chapters";

describe("canAssignToChapter", () => {
  it("allows rough stops", () => expect(canAssignToChapter({ arriveDate: null })).toBe(true));
  it("blocks dated stops", () => expect(canAssignToChapter({ arriveDate: "2026-07-03" })).toBe(false));
});
