import { render } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";

// Mock heavy server/client imports that resolveView() doesn't need but that
// the module's other exports pull in transitively.
vi.mock("next/navigation", () => ({ useRouter: vi.fn(() => ({ refresh: vi.fn() })) }));
vi.mock("@/server/actions/items", () => ({ rescheduleItem: vi.fn(), scheduleItem: vi.fn() }));
vi.mock("@/components/trip/agenda-view", () => ({ AgendaView: () => null }));

// Captures the onDropItem callback CalendarViews wires up to MonthGrid so
// tests can invoke the real drop path without simulating HTML5 DnD events
// (MonthGrid itself has no drag-simulation precedent in its own tests).
let capturedOnDropItem: ((itemId: string, dateISO: string) => void) | undefined;
vi.mock("@/components/trip/month-grid", () => ({
  MonthGrid: (props: { onDropItem?: (itemId: string, dateISO: string) => void }) => {
    capturedOnDropItem = props.onDropItem;
    return null;
  },
}));
vi.mock("@/components/ui/segmented", () => ({
  Segmented: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SegmentedItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, type, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
    <button type={type ?? "button"} onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: { div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => <div {...rest}>{children}</div> },
  useReducedMotion: () => true,
}));
vi.mock("@/components/trip/schedule-item-dialog", () => ({ ScheduleItemDialog: () => null }));
vi.mock("@/components/trip/category-dot", () => ({ categoryDotClass: () => "" }));

import React from "react";
import { act } from "react";
import { resolveView, CalendarViews } from "./calendar-views";
import { scheduleItem, rescheduleItem } from "@/server/actions/items";

const scheduleItemMock = vi.mocked(scheduleItem);
const rescheduleItemMock = vi.mocked(rescheduleItem);

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  capturedOnDropItem = undefined;
});

const wishlistItems = [{ id: "w1", title: "Eiffel Tower", category: "activity" }];
const baseProps = {
  tripId: "t1",
  days: [],
  tripStart: "2026-08-01",
  tripEnd: "2026-08-14",
  todayISO: "2026-08-05",
};

describe("CalendarViews wishlist rail width", () => {
  it("renders the wishlist aside with lg:w-64 when wishlistItems are present in month view", () => {
    // Force month view via localStorage stub
    vi.stubGlobal("localStorage", { getItem: () => "month" } as unknown as Storage);
    vi.stubGlobal("matchMedia", (() => ({ matches: true })) as unknown as typeof matchMedia);

    const { container } = render(
      <CalendarViews {...baseProps} wishlistItems={wishlistItems} />,
    );

    const aside = container.querySelector("aside");
    expect(aside).not.toBeNull();
    expect(aside?.className).toContain("lg:w-64");
  });
});

describe("CalendarViews drop routing (ADR 0019 P0-4)", () => {
  it("dropping a wishlist idea on a day calls scheduleItem (copy-in), not rescheduleItem", async () => {
    mockEnv(true, "month");
    scheduleItemMock.mockResolvedValue({ success: true });

    render(<CalendarViews {...baseProps} wishlistItems={wishlistItems} />);
    expect(capturedOnDropItem).toBeTypeOf("function");

    await act(async () => {
      capturedOnDropItem!("w1", "2026-07-02");
    });

    expect(scheduleItemMock).toHaveBeenCalledWith("w1", { date: "2026-07-02" });
    expect(rescheduleItemMock).not.toHaveBeenCalled();
  });

  it("dropping an already-dated item still reschedules in place", async () => {
    mockEnv(true, "month");
    rescheduleItemMock.mockResolvedValue({ success: true });

    render(<CalendarViews {...baseProps} wishlistItems={wishlistItems} />);
    expect(capturedOnDropItem).toBeTypeOf("function");

    await act(async () => {
      capturedOnDropItem!("item-9", "2026-07-03");
    });

    expect(rescheduleItemMock).toHaveBeenCalledWith("item-9", "2026-07-03");
    expect(scheduleItemMock).not.toHaveBeenCalled();
  });
});

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
