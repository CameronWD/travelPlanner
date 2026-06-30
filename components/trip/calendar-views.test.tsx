import { describe, it, expect, vi, afterEach } from "vitest";

// Mock heavy server/client imports that resolveView() doesn't need but that
// the module's other exports pull in transitively.
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/server/actions/items", () => ({ rescheduleItem: vi.fn() }));
vi.mock("@/components/trip/agenda-view", () => ({ AgendaView: vi.fn() }));
vi.mock("@/components/trip/month-grid", () => ({ MonthGrid: vi.fn() }));
vi.mock("@/components/ui/segmented", () => ({
  Segmented: vi.fn(),
  SegmentedItem: vi.fn(),
}));
vi.mock("@/components/ui/button", () => ({ Button: vi.fn() }));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
vi.mock("motion/react", () => ({
  AnimatePresence: vi.fn(),
  motion: { div: vi.fn() },
}));

import { resolveView } from "./calendar-views";

/**
 * resolveView() reads:
 *   - window.localStorage.getItem("trip-planner-calendar-view")
 *   - window.matchMedia("(min-width: 768px)").matches
 *
 * We stub both on `window` to keep the stubs scoped.
 */
function mockEnv(minWidthMatches: boolean, stored: string | null) {
  vi.stubGlobal(
    "localStorage",
    { getItem: () => stored } as unknown as Storage,
  );
  vi.stubGlobal(
    "matchMedia",
    ((() => ({ matches: minWidthMatches })) as unknown as typeof matchMedia),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("resolveView", () => {
  it("defaults to agenda on a mobile-width viewport", () => {
    mockEnv(false, null);
    expect(resolveView()).toBe("agenda");
  });

  it("defaults to month on a desktop-width viewport", () => {
    mockEnv(true, null);
    expect(resolveView()).toBe("month");
  });

  it("respects a stored explicit choice over the viewport default", () => {
    // mobile viewport, but user explicitly chose "month"
    mockEnv(false, "month");
    expect(resolveView()).toBe("month");
  });
});
