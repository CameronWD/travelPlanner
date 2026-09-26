import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// checklists/page.tsx is an async server component with DB calls. It now
// delegates the tabs-vs-grid layout entirely to ChecklistsLayout (LA-017,
// tested in checklists-layout.test.tsx); this file covers what the page
// itself still owns: data plumbing into the three panels and the kit title.

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    checklistItem: { findMany: vi.fn(async () => []) },
    tripMember: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn(async () => ({})) }));
vi.mock("@/lib/ai", () => ({ isAiConfigured: vi.fn(() => false) }));
vi.mock("@/lib/checklists", () => ({ sortChecklist: (items: unknown[]) => items }));
vi.mock("@/server/actions/checklists", () => ({ listTemplates: vi.fn(async () => []) }));
vi.mock("@/components/trip/checklist", () => ({ Checklist: () => <div data-testid="checklist" /> }));
vi.mock("@/components/trip/packing-templates-bar", () => ({ PackingTemplatesBar: () => null }));
vi.mock("@/components/trip/ai-packing-suggestions", () => ({ AiPackingSuggestions: () => null }));
vi.mock("@/components/trip/ai-booking-parser", () => ({ AiBookingParser: () => <div data-testid="booking-parser" /> }));
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

const { CHECKLISTS_TITLE_CLASS } = await import("./page");
const { default: ChecklistsPage } = await import("./page");

describe("Checklists kit shape (Task 14)", () => {
  it("title uses the kit display type (extrabold, 28px → 4xl)", () => {
    expect(CHECKLISTS_TITLE_CLASS).toContain("font-extrabold");
    expect(CHECKLISTS_TITLE_CLASS).toContain("text-[28px]");
    expect(CHECKLISTS_TITLE_CLASS).toContain("sm:text-4xl");
  });
});

describe("ChecklistsPage panels (LA-017)", () => {
  it("hands ChecklistsLayout the three panels with their content", async () => {
    const jsx = await ChecklistsPage({ params: Promise.resolve({ tripId: "trip-1" }) });
    render(jsx);

    expect(screen.getByTestId("checklists-layout")).toBeInTheDocument();
    expect(screen.getByTestId("panel-pretrip")).toBeInTheDocument();
    expect(screen.getByTestId("panel-packing")).toBeInTheDocument();
    expect(screen.getByTestId("panel-booking")).toBeInTheDocument();
    expect(screen.getAllByTestId("checklist").length).toBe(2);
    expect(screen.getByTestId("booking-parser")).toBeInTheDocument();
  });
});
