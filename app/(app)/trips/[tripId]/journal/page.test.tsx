import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

// journal/page.tsx is an async server component with DB calls.
// We test the reading-width wrapper via an exported constant, plus (ARCH-DAT-6
// fix round 1, Finding 2) the multi-entry-per-date read path — a regression
// test pinning that every Traveller's entry for a date renders, not just one.

const {
  requireTripAccessMock,
  journalEntryFindManyMock,
  attachmentFindManyMock,
  loadJournalWindowMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn(),
  journalEntryFindManyMock: vi.fn(),
  attachmentFindManyMock: vi.fn(),
  loadJournalWindowMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    journalEntry: { findMany: journalEntryFindManyMock },
    attachment: { findMany: attachmentFindManyMock },
  },
}));
vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: async (id: string) => id }));
vi.mock("@/lib/trip-shell-reads", () => ({ readTripShell: vi.fn(async () => ({ name: "Christmas in Europe", members: [] })) }));
vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => <div data-testid="trip-header-trailing" /> }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: requireTripAccessMock }));
vi.mock("@/lib/journal-window-loader", () => ({ loadJournalWindow: loadJournalWindowMock }));
vi.mock("@/lib/dates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dates")>();
  return { ...actual, formatLongDate: (d: string) => d, formatDayLabel: (d: string) => d };
});
vi.mock("@/lib/relative-time", () => ({ relativeTime: () => "just now" }));
// The editor is a heavy "use client" component with its own server-action
// imports — mocked here so this suite stays a page-level test, not a
// re-test of JournalEditor's own behaviour (covered by journal-editor.test.tsx).
// Renders its own `photo` (if any) as a real <img>, alt-texted by filename,
// so fix round 1's "viewer's photo renders exactly once" regression test
// can find it exactly the way the real PhotoSlot would.
vi.mock("@/components/trip/journal-editor", () => ({
  JournalEditor: ({
    initialBody,
    photo,
    extraPhotos = [],
  }: {
    initialBody: string;
    photo: { filename: string } | null;
    extraPhotos?: { filename: string }[];
  }) => (
    <div data-testid="journal-editor">
      {initialBody}
      {photo ? <img alt={photo.filename} src="" /> : null}
      {extraPhotos.map((p) => (
        // eslint-disable-next-line @next/next/no-img-element -- test double for the editor's own <img>
        <img key={p.filename} alt={p.filename} data-extra="" src="" />
      ))}
    </div>
  ),
}));
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
  useLinkStatus: () => ({ pending: false }),
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

const photoRow = (id: string, uploadedById: string, date = "2026-01-05") => ({
  id,
  targetId: date,
  filename: `${id}.jpg`,
  mime: "image/jpeg",
  size: 1,
  url: `/api/attachments/${id}`,
  uploadedById,
  createdAt: new Date("2026-01-05T09:00:00Z"),
  uploadedBy: { id: uploadedById, name: uploadedById === "me" ? "Cam" : "Alex", image: null },
});

describe("Journal page — final review #1 / #10", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccessMock.mockResolvedValue({ user: { id: "me" }, membership: {} });
    loadJournalWindowMock.mockResolvedValue({
      startDate: "2026-01-05",
      endDate: "2030-01-01",
      today: "2026-01-05",
    });
  });

  it("hands the viewer's legacy photos beyond the first to the editor as extras", async () => {
    journalEntryFindManyMock.mockResolvedValue([]);
    attachmentFindManyMock.mockResolvedValue([photoRow("m1", "me"), photoRow("m2", "me"), photoRow("m3", "me")]);

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    const editor = screen.getByTestId("journal-editor");
    expect(within(editor).getByAltText("m1.jpg")).not.toHaveAttribute("data-extra");
    expect(within(editor).getByAltText("m2.jpg")).toHaveAttribute("data-extra");
    expect(within(editor).getByAltText("m3.jpg")).toHaveAttribute("data-extra");
  });

  it("does not count or show a blank switch-only row with no photo", async () => {
    journalEntryFindManyMock.mockResolvedValue([
      {
        id: "blank-them",
        date: "2026-01-05",
        body: "",
        hiddenFromShares: true,
        updatedAt: new Date("2026-01-05T21:00:00Z"),
        authorId: "them",
        author: { id: "them", name: "Alex", image: null },
      },
      {
        id: "blank-me",
        date: "2026-01-05",
        body: "",
        hiddenFromShares: true,
        updatedAt: new Date("2026-01-05T21:00:00Z"),
        authorId: "me",
        author: { id: "me", name: "Cam", image: null },
      },
    ]);
    attachmentFindManyMock.mockResolvedValue([]);

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    expect(screen.getByText("0 entries")).toBeInTheDocument();
    expect(screen.queryByText(/Alex/)).toBeNull();
    // The viewer still gets their (blank) editor on a writable day.
    expect(screen.getByTestId("journal-editor")).toBeInTheDocument();
  });

  it("counts a blank row that rides with a photo", async () => {
    journalEntryFindManyMock.mockResolvedValue([
      {
        id: "blank-them",
        date: "2026-01-05",
        body: "",
        hiddenFromShares: false,
        updatedAt: new Date("2026-01-05T21:00:00Z"),
        authorId: "them",
        author: { id: "them", name: "Alex", image: null },
      },
    ]);
    attachmentFindManyMock.mockResolvedValue([photoRow("t1", "them")]);

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    expect(screen.getByText("1 entry · 1 photo")).toBeInTheDocument();
  });
});

describe("Journal page — every Traveller's entry per date (ARCH-DAT-6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccessMock.mockResolvedValue({ user: { id: "me" }, membership: {} });
    attachmentFindManyMock.mockResolvedValue([]);
  });

  it("renders both Travellers' entries for a shared date — the caller's own editable, the other read-only and attributed", async () => {
    loadJournalWindowMock.mockResolvedValue({
      startDate: "2026-01-05",
      endDate: "2030-01-01",
      today: "2026-01-05",
    });
    journalEntryFindManyMock.mockResolvedValue([
      {
        id: "entry-me",
        date: "2026-01-05",
        body: "My account of the day",
        updatedAt: new Date("2026-01-05T20:00:00Z"),
        authorId: "me",
        author: { id: "me", name: "Cam", image: null },
      },
      {
        id: "entry-them",
        date: "2026-01-05",
        body: "Their account of the day",
        updatedAt: new Date("2026-01-05T21:00:00Z"),
        authorId: "them",
        author: { id: "them", name: "Alex", image: null },
      },
    ]);

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    // Both bodies present — a Map<date, entry> keyed by date (the pre-fix
    // shape) would silently drop one of these in favour of the other.
    expect(screen.getByText("My account of the day")).toBeInTheDocument();
    expect(screen.getByText("Their account of the day")).toBeInTheDocument();

    // The caller's own entry renders through the editable JournalEditor;
    // the other Traveller's stays read-only, attributed.
    expect(screen.getByTestId("journal-editor").textContent).toBe("My account of the day");
    expect(screen.getByText(/Alex/)).toBeInTheDocument();

    // "2 entries" — the entry count reflects both, not a collapsed one.
    expect(screen.getByText("2 entries")).toBeInTheDocument();
  });

  it("keeps entries for different dates on their own date headings", async () => {
    loadJournalWindowMock.mockResolvedValue({
      startDate: "2026-01-05",
      endDate: "2030-01-01",
      today: "2026-01-06",
    });
    journalEntryFindManyMock.mockResolvedValue([
      {
        id: "entry-day1",
        date: "2026-01-05",
        body: "Day one notes",
        updatedAt: new Date("2026-01-05T20:00:00Z"),
        authorId: "me",
        author: { id: "me", name: "Cam", image: null },
      },
      {
        id: "entry-day2",
        date: "2026-01-06",
        body: "Day two notes",
        updatedAt: new Date("2026-01-06T20:00:00Z"),
        authorId: "me",
        author: { id: "me", name: "Cam", image: null },
      },
    ]);

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    expect(screen.getByText("Day one notes")).toBeInTheDocument();
    expect(screen.getByText("Day two notes")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /2026-01-0[56]/ })).toHaveLength(2);
  });

  it("orders days newest-arrived-first", async () => {
    loadJournalWindowMock.mockResolvedValue({
      startDate: "2026-01-05",
      endDate: "2030-01-01",
      today: "2026-01-06",
    });
    journalEntryFindManyMock.mockResolvedValue([
      {
        id: "entry-day1",
        date: "2026-01-05",
        body: "Day one notes",
        updatedAt: new Date("2026-01-05T20:00:00Z"),
        authorId: "them",
        author: { id: "them", name: "Alex", image: null },
      },
      {
        id: "entry-day2",
        date: "2026-01-06",
        body: "Day two notes",
        updatedAt: new Date("2026-01-06T20:00:00Z"),
        authorId: "them",
        author: { id: "them", name: "Alex", image: null },
      },
    ]);

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["2026-01-06", "2026-01-05"]);
  });

  // Fix round 1, Finding 1: spec §K — a day shows every Traveller's note AND
  // photo side by side. The viewer's own photo must render exactly once
  // (through their own editable card), and a co-Traveller's photo must sit
  // inside *their* card, not the viewer's.
  it("renders the viewer's photo exactly once, and a co-Traveller's photo inside their own card", async () => {
    loadJournalWindowMock.mockResolvedValue({
      startDate: "2026-01-05",
      endDate: "2030-01-01",
      today: "2026-01-05",
    });
    journalEntryFindManyMock.mockResolvedValue([
      {
        id: "entry-them",
        date: "2026-01-05",
        body: "Their account of the day",
        updatedAt: new Date("2026-01-05T21:00:00Z"),
        authorId: "them",
        author: { id: "them", name: "Alex", image: null },
      },
    ]);
    attachmentFindManyMock.mockResolvedValue([
      {
        id: "photo-me",
        targetId: "2026-01-05",
        filename: "mine.jpg",
        mime: "image/jpeg",
        size: 1,
        url: "/api/attachments/photo-me",
        uploadedById: "me",
        createdAt: new Date("2026-01-05T09:00:00Z"),
        uploadedBy: { id: "me", name: "Cam", image: null },
      },
      {
        id: "photo-them",
        targetId: "2026-01-05",
        filename: "theirs.jpg",
        mime: "image/jpeg",
        size: 1,
        url: "/api/attachments/photo-them",
        uploadedById: "them",
        createdAt: new Date("2026-01-05T09:00:00Z"),
        uploadedBy: { id: "them", name: "Alex", image: null },
      },
    ]);

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    expect(screen.getAllByAltText("mine.jpg")).toHaveLength(1);
    expect(screen.getAllByAltText("theirs.jpg")).toHaveLength(1);

    // The viewer's photo sits inside their own editable card...
    const editor = screen.getByTestId("journal-editor");
    expect(within(editor).getByAltText("mine.jpg")).toBeInTheDocument();
    // ...never inside the editor (the old shared strip is gone).
    expect(within(editor).queryByAltText("theirs.jpg")).toBeNull();
  });

  // Fix round 1, Finding 1: a co-Traveller who only ever added a photo (no
  // note, no JournalEntry row) still gets a card — uploadedById always
  // exists on an Attachment, so that's their photo's home.
  it("gives a photo-only co-Traveller (no note) their own attributed card", async () => {
    loadJournalWindowMock.mockResolvedValue({
      startDate: "2026-01-05",
      endDate: "2030-01-01",
      today: "2026-01-05",
    });
    journalEntryFindManyMock.mockResolvedValue([]);
    attachmentFindManyMock.mockResolvedValue([
      {
        id: "photo-them",
        targetId: "2026-01-05",
        filename: "theirs.jpg",
        mime: "image/jpeg",
        size: 1,
        url: "/api/attachments/photo-them",
        uploadedById: "them",
        createdAt: new Date("2026-01-05T09:00:00Z"),
        uploadedBy: { id: "them", name: "Alex", image: null },
      },
    ]);

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    expect(screen.getByAltText("theirs.jpg")).toBeInTheDocument();
    expect(screen.getByText(/Alex/)).toBeInTheDocument();
  });
});

describe("Journal page — lets you write any arrived day (spec K ruling)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccessMock.mockResolvedValue({ user: { id: "me" }, membership: {} });
    journalEntryFindManyMock.mockResolvedValue([]);
    attachmentFindManyMock.mockResolvedValue([]);
  });

  it("shows the viewer's own editable card for every arrived day, even ones with no entries yet", async () => {
    loadJournalWindowMock.mockResolvedValue({
      startDate: "2026-01-01",
      endDate: "2030-01-01",
      today: "2026-01-03",
    });

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    // Every one of the three arrived days (Jan 1, 2, 3) gets a heading and
    // a blank editable card — nobody has written anything yet.
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["2026-01-03", "2026-01-02", "2026-01-01"]);
    expect(screen.getAllByTestId("journal-editor")).toHaveLength(3);
    for (const editor of screen.getAllByTestId("journal-editor")) {
      expect(editor.textContent).toBe("");
    }
  });

  it("does not add an editable card for a date outside the writable window even if it carries legacy data", async () => {
    // Window covers only 2026-01-05; a legacy entry sits on 2026-01-01
    // (before the window's start — e.g. pre-dates window enforcement).
    loadJournalWindowMock.mockResolvedValue({
      startDate: "2026-01-05",
      endDate: "2030-01-01",
      today: "2026-01-05",
    });
    journalEntryFindManyMock.mockResolvedValue([
      {
        id: "legacy-entry",
        date: "2026-01-01",
        body: "Legacy note",
        updatedAt: new Date("2026-01-01T20:00:00Z"),
        authorId: "them",
        author: { id: "them", name: "Alex", image: null },
      },
    ]);

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    // Both dates appear (the legacy one for reading, today's for writing),
    // but only the writable one gets an editor.
    expect(screen.getByRole("heading", { level: 3, name: "2026-01-05" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "2026-01-01" })).toBeInTheDocument();
    expect(screen.getAllByTestId("journal-editor")).toHaveLength(1);
    expect(screen.getByText("Legacy note")).toBeInTheDocument();
  });
});

describe("Journal page — before day 1 (spec K)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccessMock.mockResolvedValue({ user: { id: "me" }, membership: {} });
    journalEntryFindManyMock.mockResolvedValue([]);
    attachmentFindManyMock.mockResolvedValue([]);
  });

  it("shows 'Opens on day 1' before the Trip's first day has arrived", async () => {
    loadJournalWindowMock.mockResolvedValue({
      startDate: "2026-06-01",
      endDate: "2026-06-10",
      today: "2026-05-20",
    });

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Opens on day 1 — 2026-06-01" }),
    ).toBeInTheDocument();
  });

  it("shows the viewer's own editable card, not the day-1 gate or the generic empty state, once the Trip has started with nothing written yet", async () => {
    loadJournalWindowMock.mockResolvedValue({
      startDate: "2026-06-01",
      endDate: "2026-06-10",
      today: "2026-06-01",
    });

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    expect(screen.queryByText(/Opens on day 1/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "No journal entries yet" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "2026-06-01" })).toBeInTheDocument();
    expect(screen.getByTestId("journal-editor").textContent).toBe("");
  });

  it("shows the generic empty state (not the day-1 gate) for a date-less Trip", async () => {
    loadJournalWindowMock.mockResolvedValue({ startDate: null, endDate: null, today: "2026-06-01" });

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    expect(screen.queryByText(/Opens on day 1/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No journal entries yet" })).toBeInTheDocument();
  });
});

describe("Journal page header (Task 6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccessMock.mockResolvedValue({ user: { id: "me" }, membership: {} });
  });

  it("renders the h1 Journal with the entries/photos meta on the populated page", async () => {
    loadJournalWindowMock.mockResolvedValue({
      startDate: "2026-01-05",
      endDate: "2030-01-01",
      today: "2026-01-05",
    });
    journalEntryFindManyMock.mockResolvedValue([
      {
        id: "entry-1",
        date: "2026-01-05",
        body: "Day one notes",
        updatedAt: new Date("2026-01-05T20:00:00Z"),
        authorId: "me",
        author: { id: "me", name: "Cam", image: null },
      },
    ]);
    attachmentFindManyMock.mockResolvedValue([photoRow("p1", "me")]);

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    expect(screen.getByRole("heading", { level: 1, name: "Journal" })).toBeInTheDocument();
    expect(screen.getByText("1 entry · 1 photo")).toBeInTheDocument();
  });

  it("still renders the h1 Journal on the 'opens on day 1' empty state", async () => {
    journalEntryFindManyMock.mockResolvedValue([]);
    attachmentFindManyMock.mockResolvedValue([]);
    loadJournalWindowMock.mockResolvedValue({
      startDate: "2026-06-01",
      endDate: "2026-06-10",
      today: "2026-05-20",
    });

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    expect(screen.getByRole("heading", { level: 1, name: "Journal" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Opens on day 1 — 2026-06-01" }),
    ).toBeInTheDocument();
  });

  it("still renders the h1 Journal on the generic 'no entries' empty state", async () => {
    journalEntryFindManyMock.mockResolvedValue([]);
    attachmentFindManyMock.mockResolvedValue([]);
    loadJournalWindowMock.mockResolvedValue({ startDate: null, endDate: null, today: "2026-06-01" });

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    expect(screen.getByRole("heading", { level: 1, name: "Journal" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No journal entries yet" })).toBeInTheDocument();
  });
});

describe("Journal page — Playground kit shape (Task 13)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTripAccessMock.mockResolvedValue({ user: { id: "me" }, membership: {} });
  });

  it("renders each date as a kit Card whose title is a heading linking to the day", async () => {
    loadJournalWindowMock.mockResolvedValue({
      startDate: "2026-01-05",
      endDate: "2030-01-01",
      today: "2026-01-05",
    });
    journalEntryFindManyMock.mockResolvedValue([
      {
        id: "entry-1",
        date: "2026-01-05",
        body: "Day one notes",
        updatedAt: new Date("2026-01-05T20:00:00Z"),
        authorId: "me",
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
    loadJournalWindowMock.mockResolvedValue({
      startDate: "2026-01-05",
      endDate: "2030-01-01",
      today: "2026-01-05",
    });
    journalEntryFindManyMock.mockResolvedValue([]);
    attachmentFindManyMock.mockResolvedValue([
      {
        id: "p1",
        targetId: "2026-01-05",
        filename: "igloo.jpg",
        mime: "image/jpeg",
        size: 1,
        url: "/api/attachments/p1",
        uploadedById: "them",
        createdAt: new Date("2026-01-05T09:00:00Z"),
        uploadedBy: { id: "them", name: "Alex", image: null },
      },
      {
        id: "p2",
        targetId: "2026-01-05",
        filename: "aurora.jpg",
        mime: "image/jpeg",
        size: 1,
        url: "/api/attachments/p2",
        uploadedById: "them",
        createdAt: new Date("2026-01-05T09:05:00Z"),
        uploadedBy: { id: "them", name: "Alex", image: null },
      },
    ]);

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    expect(screen.getByAltText("igloo.jpg")).toBeInTheDocument();
    expect(screen.getByAltText("aurora.jpg")).toBeInTheDocument();
    expect(screen.getByText("0 entries · 2 photos")).toBeInTheDocument();
    // A photos-only date still gets its heading.
    expect(screen.getByRole("heading", { level: 3, name: "2026-01-05" })).toBeInTheDocument();
  });

  it("renders the kit EmptyState when there are no entries and no photos (date-less Trip)", async () => {
    loadJournalWindowMock.mockResolvedValue({ startDate: null, endDate: null, today: "2026-01-05" });
    journalEntryFindManyMock.mockResolvedValue([]);
    attachmentFindManyMock.mockResolvedValue([]);

    render(await JournalPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No journal entries yet" })).toBeInTheDocument();
  });
});
