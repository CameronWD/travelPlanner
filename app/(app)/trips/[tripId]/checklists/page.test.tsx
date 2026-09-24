import { describe, it, expect, vi } from "vitest";

// checklists/page.tsx is an async server component with DB calls.
// We test the reading-width wrapper via an exported constant.

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/guards", () => ({ requireTripAccess: vi.fn() }));
vi.mock("@/lib/ai", () => ({ isAiConfigured: vi.fn() }));
vi.mock("@/lib/checklists", () => ({ sortChecklist: vi.fn() }));
vi.mock("@/server/actions/checklists", () => ({ listTemplates: vi.fn() }));
vi.mock("@/components/ui/tabs", () => ({
  Tabs: () => null,
  TabsList: () => null,
  TabsTrigger: () => null,
  TabsContent: () => null,
}));
vi.mock("@/components/trip/checklist", () => ({ Checklist: () => null }));
vi.mock("@/components/trip/packing-templates-bar", () => ({ PackingTemplatesBar: () => null }));
vi.mock("@/components/trip/ai-packing-suggestions", () => ({ AiPackingSuggestions: () => null }));
vi.mock("@/components/trip/ai-booking-parser", () => ({ AiBookingParser: () => null }));

const { CHECKLISTS_READING_WIDTH_CLASS, CHECKLISTS_TITLE_CLASS, CHECKLISTS_TAB_CLASS, CHECKLISTS_TABS_LIST_CLASS } = await import("./page");

describe("Checklists reading-width cap", () => {
  it("tabs+content column carries max-w-3xl to cap reading line length", () => {
    expect(CHECKLISTS_READING_WIDTH_CLASS).toContain("max-w-3xl");
  });
});

describe("Checklists kit shape (Task 14)", () => {
  it("title uses the kit display type (extrabold, 28px → 4xl)", () => {
    expect(CHECKLISTS_TITLE_CLASS).toContain("font-extrabold");
    expect(CHECKLISTS_TITLE_CLASS).toContain("text-[28px]");
    expect(CHECKLISTS_TITLE_CLASS).toContain("sm:text-4xl");
  });

  it("tabs are the kit teal Segmented with a 44px coarse-pointer hit area", () => {
    expect(CHECKLISTS_TAB_CLASS).toContain("data-[state=active]:bg-teal");
    expect(CHECKLISTS_TAB_CLASS).toContain("data-[state=active]:text-on-accent");
    expect(CHECKLISTS_TAB_CLASS).toContain("pointer-coarse:after:-inset-y-1.5");
  });

  it("tab list stays horizontally scrollable on narrow phones and fits the 44px hit area", () => {
    // Must not override the primitive's overflow-x-auto (360/375px phones scroll the pill).
    expect(CHECKLISTS_TABS_LIST_CLASS).not.toMatch(/overflow-(visible|hidden)/);
    // Touch: the list grows to 48px so its 44px padding box contains the
    // 32px pill + 6px/6px hit-area expansion without clipping.
    expect(CHECKLISTS_TABS_LIST_CLASS).toContain("pointer-coarse:h-12");
    // Triggers must not shrink (whitespace-nowrap text would spill out of the
    // pill); the list scrolls instead.
    expect(CHECKLISTS_TAB_CLASS).toContain("shrink-0");
  });
});
