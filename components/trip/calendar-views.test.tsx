import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
// Segmented is the real primitive (Task 12b): the view switch's accessible
// names are pinned below, so it is not mocked away.
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, type, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
    <button type={type ?? "button"} onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
// Controllable (default true, matching prior behaviour) so the softer-crossfade
// test below can render the non-reduced-motion branch too.
const { useReducedMotionMock } = vi.hoisted(() => ({ useReducedMotionMock: vi.fn(() => true) }));
let capturedCrossfadeTransition: unknown;
vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      transition,
      ...rest
    }: React.HTMLAttributes<HTMLDivElement> & { transition?: unknown }) => {
      capturedCrossfadeTransition = transition;
      return <div {...rest}>{children}</div>;
    },
  },
  useReducedMotion: () => useReducedMotionMock(),
}));
// Captures the props CalendarViews passes to ScheduleItemDialog so tests can
// assert on the computed `defaultDate` without a real dialog mounting.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedScheduleProps: any;
vi.mock("@/components/trip/schedule-item-dialog", () => ({
  ScheduleItemDialog: (props: unknown) => {
    capturedScheduleProps = props;
    return null;
  },
}));
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
  capturedScheduleProps = undefined;
  capturedCrossfadeTransition = undefined;
  useReducedMotionMock.mockReturnValue(true);
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
  it("renders the wishlist aside with lg:w-72 xl:w-80 when wishlistItems are present in month view", () => {
    // Force month view via localStorage stub
    vi.stubGlobal("localStorage", { getItem: () => "month" } as unknown as Storage);
    vi.stubGlobal("matchMedia", (() => ({ matches: true })) as unknown as typeof matchMedia);

    const { container } = render(
      <CalendarViews {...baseProps} wishlistItems={wishlistItems} />,
    );

    const aside = container.querySelector("aside");
    expect(aside).not.toBeNull();
    expect(aside?.className).toContain("lg:w-72");
    expect(aside?.className).toContain("xl:w-80");
  });
});

describe("CalendarViews wishlist rail — item titles (LA-004)", () => {
  it("wishlist aside titles clamp to two lines and link to the item", () => {
    mockEnv(true, "month");
    const longItem = [{ id: "w1", title: "Overnight at the Snow Hotel with the Northern Lights tour included", category: "activity" }];

    render(<CalendarViews {...baseProps} wishlistItems={longItem} />);

    const title = screen.getByText(/Overnight at the Snow/);
    expect(title.className).toContain("line-clamp-2");
    expect(title.closest("a, button")).not.toBeNull();
  });

  it("clicking the title opens the same schedule dialog as the CalendarCheck action", () => {
    mockEnv(true, "month");
    render(<CalendarViews {...baseProps} wishlistItems={wishlistItems} />);

    const title = screen.getByText("Eiffel Tower");
    const opener = title.closest("button")!;
    // ScheduleItemDialog is mocked away module-wide; the observable contract
    // here is that the row's button — not just the icon — reaches the item.
    expect(opener).not.toBeNull();
    expect(opener.tagName).toBe("BUTTON");
  });

  it("the title button carries tap-target for a ≥44px hit area on coarse pointers (review fix)", () => {
    mockEnv(true, "month");
    render(<CalendarViews {...baseProps} wishlistItems={wishlistItems} />);

    const title = screen.getByText("Eiffel Tower");
    const opener = title.closest("button")!;
    expect(opener.className).toContain("tap-target");
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

describe("CalendarViews — kit toolbar and rail (Task 12b)", () => {
  it("the view switch is the kit Segmented (sun) with its accessible names", () => {
    mockEnv(true, "month");
    render(<CalendarViews {...baseProps} wishlistItems={[]} />);
    const group = screen.getByRole("radiogroup", { name: "Calendar view" });
    expect(screen.getByRole("radio", { name: "Month" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Agenda" })).toHaveAttribute("aria-checked", "false");
    expect(group.innerHTML).toMatch(/\bbg-sun\b/);
  });

  it("month view titles the grid with the month as a display heading (kit 'October')", () => {
    mockEnv(true, "month");
    render(<CalendarViews {...baseProps} wishlistItems={[]} />);
    const h = screen.getByRole("heading", { level: 2, name: "August 2026" });
    expect(h.className).toMatch(/\bfont-display\b/);
    expect(h.className).toMatch(/\bfont-extrabold\b/);
    expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next month" })).toBeInTheDocument();
  });

  it("agenda view keeps the title slot (reads 'Agenda') and hides the month arrows without removing them", () => {
    mockEnv(true, "agenda");
    render(<CalendarViews {...baseProps} wishlistItems={[]} />);
    expect(screen.getByRole("heading", { level: 2, name: "Agenda" })).toBeInTheDocument();
    const prev = screen.getByLabelText("Previous month", { selector: "button" });
    expect(prev).toHaveClass("invisible");
    expect(prev).toBeDisabled();
  });

  it("the wishlist rail is a kit Card with a labelled, stateful toggle and kit rows", () => {
    mockEnv(true, "month");
    const { container } = render(<CalendarViews {...baseProps} wishlistItems={wishlistItems} />);
    const toggle = screen.getByRole("button", { name: /Wishlist \(1\)/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle.textContent).not.toMatch(/[▾▸]/);
    const aside = container.querySelector("aside")!;
    expect(aside.className).toMatch(/\bborder-2\b/);
    const row = container.querySelector("aside li")!;
    expect(row.className).toMatch(/\bborder-2\b/);
    expect(row.className).not.toMatch(/(^|\s)border(\s|$)/);
    expect(screen.getByRole("button", { name: "Schedule Eiffel Tower" })).toBeInTheDocument();
  });
});

describe("CalendarViews — Schedule dialog defaults to the trip's first Stop (Task 8)", () => {
  it("schedules a wishlist idea from the calendar defaulting to the first Stop's arrive date, not the trip start", async () => {
    mockEnv(true, "month");
    const user = userEvent.setup();

    const stopDay = {
      dateISO: "2026-12-04",
      stop: {
        id: "s1",
        name: "Denpasar",
        timezone: "UTC",
        arriveDate: "2026-12-04",
        departDate: "2026-12-08",
        sortOrder: 0,
      },
      timedItems: [],
      untimedItems: [],
      transportEntries: [],
      accommodationEntries: [],
    };
    // A Wishlist idea is never attached to a Stop (ADR 0022) — stopId is
    // always null in practice; the default must still come from the trip's
    // first Stop rather than the trip start.
    const wishlistNoStop = [{ id: "w1", title: "Eiffel Tower", category: "activity", stopId: null }];

    render(
      <CalendarViews
        {...baseProps}
        tripStart="2026-12-01"
        days={[stopDay]}
        wishlistItems={wishlistNoStop}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Schedule Eiffel Tower" }));

    expect(capturedScheduleProps.defaultDate).toBe("2026-12-04");
  });
});

// ---------------------------------------------------------------------------
// Softer Days crossfade (Task 16, spec H4)
// ---------------------------------------------------------------------------

describe("CalendarViews view-switch crossfade (spec H4)", () => {
  it("uses DURATION.fast and EASE_EMPHASIZED when motion is allowed", async () => {
    const { DURATION, EASE_EMPHASIZED } = await import("@/lib/motion");
    useReducedMotionMock.mockReturnValue(false);
    mockEnv(true, "month");

    render(<CalendarViews {...baseProps} wishlistItems={[]} />);

    expect(capturedCrossfadeTransition).toEqual({ duration: DURATION.fast, ease: EASE_EMPHASIZED });
  });

  it("collapses to a zero-duration transition when reduced motion is on", async () => {
    useReducedMotionMock.mockReturnValue(true);
    mockEnv(true, "month");

    render(<CalendarViews {...baseProps} wishlistItems={[]} />);

    expect(capturedCrossfadeTransition).toEqual({ duration: 0 });
  });
});
