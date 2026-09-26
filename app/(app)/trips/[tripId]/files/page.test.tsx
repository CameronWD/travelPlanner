import { describe, it, expect, vi } from "vitest";

// files/page.tsx is an async server component with DB calls.
// We test the section-header class constant to assert Space Grotesk is applied.

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { attachment: { findMany: vi.fn().mockResolvedValue([]) } },
}));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));
vi.mock("@/lib/enums", () => ({
  TARGET_TYPES: [],
  TargetType: {},
}));
vi.mock("@/components/ui/empty-state", () => ({
  EmptyState: ({ title, tone }: { title: string; tone?: string }) => (
    <div data-testid="empty-state" data-tone={tone}>{title}</div>
  ),
}));
vi.mock("@/components/trip/attachment-list", () => ({
  AttachmentList: () => null,
}));

import { render, screen } from "@testing-library/react";

const { default: FilesPage, FILES_SECTION_HEADER_CLASS, FILES_TITLE_CLASS } = await import("./page");

describe("Files page section-header typography", () => {
  it("section-header label carries font-display (Space Grotesk) class", () => {
    expect(FILES_SECTION_HEADER_CLASS).toContain("font-display");
  });

  it("section-header label carries font-bold", () => {
    expect(FILES_SECTION_HEADER_CLASS).toContain("font-bold");
  });
});

describe("Files kit shape (Task 14)", () => {
  it("title uses the kit display type (extrabold, 28px → 4xl)", () => {
    expect(FILES_TITLE_CLASS).toContain("font-extrabold");
    expect(FILES_TITLE_CLASS).toContain("sm:text-4xl");
  });

  it("section label uses the kit Label type", () => {
    expect(FILES_SECTION_HEADER_CLASS).toContain("text-label");
  });

  it("no files at all renders the EmptyState (sun tile, as the kit's Files hub tile)", async () => {
    render(await FilesPage({ params: Promise.resolve({ tripId: "t1" }) }));
    expect(screen.getByRole("heading", { level: 2, name: "Files" })).toBeInTheDocument();
    const empty = screen.getByTestId("empty-state");
    expect(empty).toHaveTextContent("No files yet");
    expect(empty).toHaveAttribute("data-tone", "sun");
  });
});
