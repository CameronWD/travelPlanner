import { describe, it, expect, vi } from "vitest";

// files/page.tsx is an async server component with DB calls.
// We test the section-header class constant to assert Space Grotesk is applied.

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));
vi.mock("@/lib/enums", () => ({
  TARGET_TYPES: [],
  TargetType: {},
}));
vi.mock("@/components/ui/empty-state", () => ({ EmptyState: () => null }));
vi.mock("@/components/trip/attachment-list", () => ({
  AttachmentList: () => null,
}));

const { FILES_SECTION_HEADER_CLASS } = await import("./page");

describe("Files page section-header typography", () => {
  it("section-header label carries font-display (Space Grotesk) class", () => {
    expect(FILES_SECTION_HEADER_CLASS).toContain("font-display");
  });

  it("section-header label carries font-bold", () => {
    expect(FILES_SECTION_HEADER_CLASS).toContain("font-bold");
  });
});
