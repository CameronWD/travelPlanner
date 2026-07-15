import { describe, it, expect, vi } from "vitest";

// journal/page.tsx is an async server component with DB calls.
// We test the reading-width wrapper via an exported constant.

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));
vi.mock("@/lib/dates", () => ({ formatLongDate: vi.fn() }));
vi.mock("@/lib/relative-time", () => ({ relativeTime: vi.fn() }));
vi.mock("@/components/ui/empty-state", () => ({ EmptyState: () => null }));

const { JOURNAL_READING_WIDTH_CLASS } = await import("./page");

describe("Journal reading-width cap", () => {
  it("entries column carries max-w-3xl to cap reading line length", () => {
    expect(JOURNAL_READING_WIDTH_CLASS).toContain("max-w-3xl");
  });
});
