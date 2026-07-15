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

const { CHECKLISTS_READING_WIDTH_CLASS } = await import("./page");

describe("Checklists reading-width cap", () => {
  it("tabs+content column carries max-w-3xl to cap reading line length", () => {
    expect(CHECKLISTS_READING_WIDTH_CLASS).toContain("max-w-3xl");
  });
});
