import { describe, it, expect, vi } from "vitest";

// files/page.tsx is an async server component with DB calls.
// We test the section-header class constant to assert Space Grotesk is applied.

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { attachment: { findMany: vi.fn().mockResolvedValue([]) } },
}));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));
vi.mock("@/lib/trip-shell-reads", () => ({ readTripShell: vi.fn(async () => ({ name: "Christmas in Europe", members: [] })) }));
vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: async (id: string) => id }));
vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => <div data-testid="trip-header-trailing" /> }));
vi.mock("@/lib/enums", () => ({
  TARGET_TYPES: ["TRIP", "STOP", "ITEM", "TRANSPORT", "ACCOMMODATION", "JOURNAL", "MARKER"],
  TargetType: {},
}));
vi.mock("@/components/ui/empty-state", () => ({
  EmptyState: ({ title, tone }: { title: string; tone?: string }) => (
    <div data-testid="empty-state" data-tone={tone}>{title}</div>
  ),
}));
vi.mock("@/components/trip/attachment-list", () => ({
  AttachmentList: ({ attachments, targetType }: { attachments: Array<{ id: string; filename: string; owner?: { label: string; href: string | null } | null }>; targetType: string }) => (
    <ul data-testid={`list-${targetType}`}>
      {attachments.map((a) => (
        <li key={a.id}>
          {a.filename}
          {a.owner ? (a.owner.href ? <a href={a.owner.href}>{a.owner.label}</a> : <span>{a.owner.label}</span>) : null}
        </li>
      ))}
    </ul>
  ),
}));
const loadFileOwnersMock = vi.hoisted(() => vi.fn().mockResolvedValue(new Map()));
vi.mock("@/lib/files-index-loader", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/files-index-loader")>();
  return { ...real, loadFileOwners: loadFileOwnersMock };
});

import { render, screen } from "@testing-library/react";

const { default: FilesPage, FILES_SECTION_HEADER_CLASS } = await import("./page");

describe("Files page section-header typography", () => {
  it("section-header label carries font-display (Space Grotesk) class", () => {
    expect(FILES_SECTION_HEADER_CLASS).toContain("font-display");
  });

  it("section-header label carries font-bold", () => {
    expect(FILES_SECTION_HEADER_CLASS).toContain("font-bold");
  });
});

describe("Files kit shape (Task 14)", () => {
  it("section label uses the kit Label type", () => {
    expect(FILES_SECTION_HEADER_CLASS).toContain("text-label");
  });

  it("no files at all renders the EmptyState (sun tile, as the kit's Files hub tile)", async () => {
    render(await FilesPage({ params: Promise.resolve({ tripId: "t1" }) }));
    expect(screen.getByRole("heading", { level: 1, name: "Files" })).toBeInTheDocument();
    const empty = screen.getByTestId("empty-state");
    expect(empty).toHaveTextContent("No files yet");
    expect(empty).toHaveAttribute("data-tone", "sun");
  });

  it("carries the trip name as eyebrow and the bell cluster", async () => {
    render(await FilesPage({ params: Promise.resolve({ tripId: "t1" }) }));
    expect(screen.getByText("Christmas in Europe")).toBeInTheDocument();
    expect(screen.getByTestId("trip-header-trailing")).toBeInTheDocument();
  });

  it("names each file's owner with a link, labels Items as Things to do, and marks a gone owner (removed)", async () => {
    const { db } = await import("@/lib/db");
    (db.attachment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "f1", filename: "rome.pdf", title: null, mime: "application/pdf", size: 1, url: "/u/1", targetType: "STOP", targetId: "s-rome", uploadedById: "u1", createdAt: new Date() },
      { id: "f2", filename: "ticket.pdf", title: null, mime: "application/pdf", size: 1, url: "/u/2", targetType: "ITEM", targetId: "i-gone", uploadedById: "u1", createdAt: new Date() },
      { id: "f3", filename: "trip.pdf", title: null, mime: "application/pdf", size: 1, url: "/u/3", targetType: "TRIP", targetId: null, uploadedById: "u1", createdAt: new Date() },
    ]);
    loadFileOwnersMock.mockResolvedValue(new Map([["STOP:s-rome", { label: "Rome", href: "/trips/t1/plan#open=s-rome" }]]));
    render(await FilesPage({ params: Promise.resolve({ tripId: "t1" }) }));
    expect(screen.getByRole("link", { name: "Rome" }).getAttribute("href")).toBe("/trips/t1/plan#open=s-rome");
    expect(screen.getByText("(removed)")).toBeInTheDocument();
    expect(screen.getByText("Things to do")).toBeInTheDocument();
    expect(screen.queryByText("Activities")).toBeNull();
    expect(loadFileOwnersMock).toHaveBeenCalledWith("t1", "t1", [
      { targetType: "STOP", targetId: "s-rome" },
      { targetType: "ITEM", targetId: "i-gone" },
    ]);
  });
});
