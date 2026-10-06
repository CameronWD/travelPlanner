import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// checklists/page.tsx is an async server component with DB calls. It now
// delegates the tabs-vs-grid layout entirely to ChecklistsLayout (LA-017,
// tested in checklists-layout.test.tsx); this file covers what the page
// itself still owns: data plumbing into the panels, the PageHeader and its
// meta counts.

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    trip: {
      findUnique: vi.fn(async () => ({ name: "Christmas in Europe", startDate: "2026-12-04" })),
    },
    checklistItem: { findMany: vi.fn(async () => []) },
    tripMember: { findMany: vi.fn(async () => []) },
    stop: {
      findMany: vi.fn(async () => [
        { id: "s1", name: "Paris", sortOrder: 0, timezone: "Europe/Paris", arriveDate: "2099-01-01", departDate: "2099-01-05" },
      ]),
    },
  },
}));
const listRemindersForTrip = vi.hoisted(() =>
  vi.fn(async () => [{ id: "r1", title: "Print insurance", date: "2099-01-01", stopId: null, stopName: null }]),
);
vi.mock("@/server/actions/reminders", () => ({ listRemindersForTrip }));
vi.mock("@/components/trip/reminders-card", () => ({
  RemindersCard: (p: { tripId: string; reminders: { title: string }[]; today: string; stops?: { name: string }[] }) => (
    <div data-testid="reminders-card" data-today={p.today}>
      {p.reminders.map((r) => r.title).join(",")}|{(p.stops ?? []).map((s) => s.name).join(",")}
    </div>
  ),
}));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn(async () => ({})) }));
vi.mock("@/lib/ai", () => ({ isAiConfigured: vi.fn(() => false) }));
vi.mock("@/lib/checklists", () => ({ sortChecklist: (items: unknown[]) => items }));
vi.mock("@/server/actions/checklists", () => ({ listTemplates: vi.fn(async () => []) }));
vi.mock("@/components/trip/checklist", () => ({ Checklist: () => <div data-testid="checklist" /> }));
vi.mock("@/components/trip/shopping-list", () => ({ ShoppingList: () => <div data-testid="shopping-list" /> }));
vi.mock("@/components/trip/packing-templates-bar", () => ({ PackingTemplatesBar: () => null }));
vi.mock("@/components/trip/ai-packing-suggestions", () => ({ AiPackingSuggestions: () => null }));
vi.mock("@/components/trip/trip-header-trailing", () => ({ TripHeaderTrailing: () => null }));
vi.mock("@/lib/trip-slug-read", () => ({ tripSlugFor: vi.fn(async () => "trip-1") }));
vi.mock("./checklists-layout", () => ({
  ChecklistsLayout: ({ panels }: { panels: { value: string; label: React.ReactNode; content: React.ReactNode }[] }) => (
    <div data-testid="checklists-layout">
      {panels.map((p) => (
        <div key={p.value} data-testid={`panel-${p.value}`}>
          <div data-testid={`panel-${p.value}-label`}>{p.label}</div>
          {p.content}
        </div>
      ))}
    </div>
  ),
}));

const { default: ChecklistsPage } = await import("./page");

describe("ChecklistsPage panels (LA-017)", () => {
  it("hands ChecklistsLayout the two panels with their content — the Booking parser tab is gone (it lives in Plan)", async () => {
    const jsx = await ChecklistsPage({ params: Promise.resolve({ tripId: "trip-1" }) });
    render(jsx);

    expect(screen.getByTestId("checklists-layout")).toBeInTheDocument();
    expect(screen.getByTestId("panel-pretrip")).toBeInTheDocument();
    expect(screen.getByTestId("panel-packing")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-booking")).toBeNull();
    expect(screen.queryByTestId("booking-parser")).toBeNull();
    expect(screen.getAllByTestId("checklist").length).toBe(2);
  });
});

describe("ChecklistsPage Reminders (Task 16 fix — the desktop Home has no Reminders panel)", () => {
  it("renders the Reminders card outside the tab panels, with the trip-local today and the Stops", async () => {
    const { todayISOInZone } = await import("@/lib/tz");
    const jsx = await ChecklistsPage({ params: Promise.resolve({ tripId: "trip-1" }) });
    render(jsx);
    const card = screen.getByTestId("reminders-card");
    expect(card.textContent).toBe("Print insurance|Paris");
    expect(card.closest('[data-testid="checklists-layout"]')).toBeNull();
    const today = todayISOInZone("Europe/Paris");
    expect(card).toHaveAttribute("data-today", today);
    expect(listRemindersForTrip).toHaveBeenCalledWith("trip-1", today);
  });
});

describe("checklistsMeta (AUDIT.md Checklists)", () => {
  it("to do · packed of total, dropping empty halves", async () => {
    const { checklistsMeta } = await import("./page");
    const pre = [{ done: false }, { done: false }, { done: false }, { done: false }, { done: true }];
    const pack = [...Array(12).fill({ done: true }), ...Array(18).fill({ done: false })];
    expect(checklistsMeta(pre, pack)).toBe("4 to do · 12 packed of 30");
    expect(checklistsMeta(pre, [])).toBe("4 to do");
    expect(checklistsMeta([], pack)).toBe("12 packed of 30");
    expect(checklistsMeta([], [])).toBeUndefined();
  });
});

describe("ChecklistsPage PageHeader (AUDIT.md Checklists)", () => {
  it("renders the PageHeader h1 with the trip eyebrow", async () => {
    render(await ChecklistsPage({ params: Promise.resolve({ tripId: "trip-1" }) }));
    expect(screen.getByRole("heading", { level: 1, name: "Checklists" })).toBeInTheDocument();
    expect(screen.getByText("Christmas in Europe 2026")).toBeInTheDocument();
  });
});

describe("ChecklistsPage Shopping tab (Task 13, spec §G)", () => {
  it("renders a Shopping tab whose badge counts NEEDED packing + unticked standalone items", async () => {
    const { db } = await import("@/lib/db");
    (db.checklistItem.findMany as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([
      {
        id: "pack-1",
        kind: "PACKING",
        text: "Jacket",
        done: false,
        dueDate: null,
        sortOrder: 0,
        buy: "NEEDED",
        assignedTo: null,
      },
      {
        id: "shop-1",
        kind: "SHOPPING",
        text: "Snacks",
        done: false,
        dueDate: null,
        sortOrder: 0,
        buy: null,
        assignedTo: null,
      },
    ]);

    render(await ChecklistsPage({ params: Promise.resolve({ tripId: "trip-1" }) }));

    expect(screen.getByTestId("panel-shopping")).toBeInTheDocument();
    expect(screen.getByTestId("panel-shopping-label").textContent).toContain("Shopping");
    expect(screen.getByTestId("panel-shopping-label").textContent).toContain("2");
  });
});

describe("ChecklistsPage reads (spec 2026-10-06 §C)", () => {
  it("issues every read in one wave after the access check", async () => {
    vi.clearAllMocks();
    const { db } = await import("@/lib/db");
    let release!: (v: unknown) => void;
    vi.mocked(db.trip.findUnique).mockImplementationOnce((() => new Promise((r) => { release = r; })) as never);
    const pending = ChecklistsPage({ params: Promise.resolve({ tripId: "trip-1" }) });
    await vi.waitFor(() => {
      expect(db.checklistItem.findMany).toHaveBeenCalled();
      expect(db.tripMember.findMany).toHaveBeenCalled();
      expect(db.stop.findMany).toHaveBeenCalled();
    });
    release({ name: "Christmas in Europe", startDate: "2026-12-04" });
    await pending;
  });
});
