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
vi.mock("@/components/ui/empty-state", () => ({ EmptyState: () => null }));
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
