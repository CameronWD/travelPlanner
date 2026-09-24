import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// journal/page.tsx is an async server component with DB calls.
// We test the reading-width wrapper via an exported constant, plus (ARCH-DAT-6
// fix round 1, Finding 2) the multi-entry-per-date read path — a regression
// test pinning that every Traveller's entry for a date renders, not just one.

const { requireTripAccessMock, journalEntryFindManyMock, attachmentFindManyMock } =
  vi.hoisted(() => ({
    requireTripAccessMock: vi.fn(),
    journalEntryFindManyMock: vi.fn(),
    attachmentFindManyMock: vi.fn(),
  }));

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    journalEntry: { findMany: journalEntryFindManyMock },
    attachment: { findMany: attachmentFindManyMock },
  },
}));
vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("@/lib/dates", () => ({ formatLongDate: (d: string) => d }));
vi.mock("@/lib/relative-time", () => ({ relativeTime: () => "just now" }));
vi.mock("@/components/ui/empty-state", () => ({
  EmptyState: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  ),
}));
// next/link renders a plain <a> in jsdom
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children?: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const { JOURNAL_READING_WIDTH_CLASS } = await import("./page");
const JournalPage = (await import("./page")).default;

describe("Journal reading-width cap", () => {
  it("entries column carries max-w-3xl to cap reading line length", () => {
    expect(JOURNAL_READING_WIDTH_CLASS).toContain("max-w-3xl");
  });
});

describe("Journal page — every Traveller's entry per date (ARCH-DAT-6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccessMock.mockResolvedValue({ user: { id: "me" }, membership: {} });
    attachmentFindManyMock.mockResolvedValue([]);
  });

  it("renders both Travellers' entries for a shared date, each attributed to its author", async () => {
    journalEntryFindManyMock.mockResolvedValue([
      {
        id: "entry-me",
        date: "2026-01-05",
        body: "My account of the day",
        updatedAt: new Date("2026-01-05T20:00:00Z"),
        author: { id: "me", name: "Cam", image: null },
      },
      {
        id: "entry-them",
        date: "2026-01-05",
        body: "Their account of the day",
        updatedAt: new Date("2026-01-05T21:00:00Z"),
        author: { id: "them", name: "Alex", image: null },
      },
    ]);

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    // Both bodies present — a Map<date, entry> keyed by date (the pre-fix
    // shape) would silently drop one of these in favour of the other.
    expect(screen.getByText("My account of the day")).toBeInTheDocument();
    expect(screen.getByText("Their account of the day")).toBeInTheDocument();

    // Both authors attributed.
    expect(screen.getByText(/Cam/)).toBeInTheDocument();
    expect(screen.getByText(/Alex/)).toBeInTheDocument();

    // "2 entries" — the entry count reflects both, not a collapsed one.
    expect(screen.getByText("2 entries")).toBeInTheDocument();
  });

  it("keeps entries for different dates on their own date headings", async () => {
    journalEntryFindManyMock.mockResolvedValue([
      {
        id: "entry-day1",
        date: "2026-01-05",
        body: "Day one notes",
        updatedAt: new Date("2026-01-05T20:00:00Z"),
        author: { id: "me", name: "Cam", image: null },
      },
      {
        id: "entry-day2",
        date: "2026-01-06",
        body: "Day two notes",
        updatedAt: new Date("2026-01-06T20:00:00Z"),
        author: { id: "me", name: "Cam", image: null },
      },
    ]);

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    expect(screen.getByText("Day one notes")).toBeInTheDocument();
    expect(screen.getByText("Day two notes")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /2026-01-0[56]/ })).toHaveLength(2);
  });
});

describe("Journal page — Playground kit shape (Task 13)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccessMock.mockResolvedValue({ user: { id: "me" }, membership: {} });
  });

  it("renders each date as a kit Card whose title is a heading linking to the day", async () => {
    journalEntryFindManyMock.mockResolvedValue([
      {
        id: "entry-1",
        date: "2026-01-05",
        body: "Day one notes",
        updatedAt: new Date("2026-01-05T20:00:00Z"),
        author: { id: "me", name: "Cam", image: null },
      },
    ]);
    attachmentFindManyMock.mockResolvedValue([]);

    const { container } = render(
      await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }),
    );

    const heading = screen.getByRole("heading", { level: 3, name: "2026-01-05" });
    expect(heading.querySelector("a")?.getAttribute("href")).toBe("/trips/trip-1/day/2026-01-05");
    const card = heading.closest("[data-slot='journal-day']");
    expect(card).toBeTruthy();
    expect(card?.className).toMatch(/border-2/);
    expect(card?.className).toMatch(/shadow-hard-\d/);
    // The entry inside the day card is not a second nested Card.
    expect(card?.querySelectorAll(".shadow-hard-2, .shadow-hard-3")).toHaveLength(0);
    // Kit grid: one column on phones, two from md.
    expect(container.querySelector(".md\\:grid-cols-2")).toBeTruthy();
  });

  it("gives every photo alt text and counts photos in the kit summary line", async () => {
    journalEntryFindManyMock.mockResolvedValue([]);
    attachmentFindManyMock.mockResolvedValue([
      { id: "p1", targetId: "2026-01-05", filename: "igloo.jpg", mime: "image/jpeg", size: 1, url: "/api/attachments/p1" },
      { id: "p2", targetId: "2026-01-05", filename: "aurora.jpg", mime: "image/jpeg", size: 1, url: "/api/attachments/p2" },
    ]);

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    expect(screen.getByAltText("igloo.jpg")).toBeInTheDocument();
    expect(screen.getByAltText("aurora.jpg")).toBeInTheDocument();
    expect(screen.getByText("0 entries · 2 photos")).toBeInTheDocument();
    // A photos-only date still gets its heading.
    expect(screen.getByRole("heading", { level: 3, name: "2026-01-05" })).toBeInTheDocument();
  });

  it("renders the kit EmptyState when there are no entries and no photos", async () => {
    journalEntryFindManyMock.mockResolvedValue([]);
    attachmentFindManyMock.mockResolvedValue([]);

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No journal entries yet" })).toBeInTheDocument();
  });
});
