import { describe, it, expect, vi } from "vitest";
import { act, render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plane } from "lucide-react";

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/server/actions/day-titles", () => ({ setDayTitle: vi.fn(async () => ({ success: true })) }));
vi.mock("@/components/trip/make-it-fit", () => ({ MakeItFit: () => <button>Make it fit</button> }));
vi.mock("@/server/actions/trips", () => ({ setTripHardEndDate: vi.fn() }));

import { PlanRiseIn } from "./plan-rise-in";
import { StopRow, type StopRowProps } from "./stop-row";
import { DaySection } from "./day-section";
import type { StopDayItem } from "@/lib/stop-days";
import { IdeasBox } from "./ideas-box";
import { FitTile } from "./fit-tile";
import { LegPill } from "./leg-pill";
import { StopActionsSheet } from "./stop-actions-sheet";
import { PickDaySheet } from "./mobile/pick-day-sheet";
import { StopSheet } from "./mobile/stop-sheet";
import { daySlots } from "@/lib/plan/day-density";
import { setDayTitle } from "@/server/actions/day-titles";
import type { PlanSummary } from "@/lib/plan-overview";

const BANNED = /shadow-soft|border-border\/70|bg-card\/40/;

/** React listens for whichever of the two names jsdom's CSS support implies. */
function endAnimation(el: HTMLElement) {
  act(() => {
    for (const type of ["animationend", "webkitAnimationEnd"]) el.dispatchEvent(new Event(type, { bubbles: true }));
  });
}

const PARIS = {
  id: "par", name: "Paris", country: "France", timezone: "Europe/Paris", arriveDate: "2026-12-10", departDate: "2026-12-14",
  nights: null, pinned: false, chapterId: null, sortOrder: 1, notes: null, lat: null, lng: null,
};
const ITEMS = [{ id: "a", title: "Louvre", category: "SIGHTSEEING", date: "2026-12-11", startTime: "10:00" }];
const SLOTS = daySlots(PARIS, [
  { id: "a", date: "2026-12-11", category: "FOOD" },
  { id: "b", date: "2026-12-11", category: "SIGHTSEEING" },
], { "2026-12-12": { title: "Versailles day" } });

describe("P1 page enters", () => {
  it("staggers by 40ms per index, capped at 8 rows", () => {
    const { container, rerender } = render(<PlanRiseIn index={2}>row</PlanRiseIn>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("tp-rise-in");
    expect(el.className).toContain("tp-stagger");
    expect(el.getAttribute("style")).toContain("--tp-delay: 80ms");
    rerender(<PlanRiseIn index={9}>row</PlanRiseIn>);
    expect((container.firstElementChild as HTMLElement).className).not.toContain("tp-rise-in");
    expect(container.innerHTML).not.toMatch(BANNED);
  });

  it("an explicit delay for the rail tiles", () => {
    const { container } = render(<PlanRiseIn delayMs={120}>tile</PlanRiseIn>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain("tp-rise-in");
    expect(el.getAttribute("style")).toContain("--tp-delay: 120ms");
  });

  it("drops the entrance once it has played, so a display:none → shown list doesn't replay it", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<PlanRiseIn index={0}>row</PlanRiseIn>);
      expect((container.firstElementChild as HTMLElement).className).toContain("tp-rise-in");
      act(() => vi.advanceTimersByTime(1000));
      expect((container.firstElementChild as HTMLElement).className).not.toContain("tp-rise-in");
    } finally {
      vi.useRealTimers();
    }
  });
});

const DATED = { ...PARIS, id: "r", name: "Rome", arriveDate: "2026-12-15", departDate: "2026-12-22", sortOrder: 2 };
function renderRow(p: Partial<StopRowProps> = {}) {
  const props: StopRowProps = {
    stop: DATED, number: 3, open: false, onToggle: vi.fn(), bodyId: "body-r", stay: null,
    plansCount: 0, ideasCount: 0, menuGroups: [[{ key: "edit", label: "Edit name & place", onSelect: vi.fn() }]], ...p,
  };
  return render(<StopRow {...props}><p>open body</p></StopRow>);
}

describe("P2 fold / unfold", () => {
  it("the open body is a height-animated motion.div; chevron rotates; toggle fill transitions", () => {
    const { container } = renderRow({ open: true });
    const body = container.querySelector("#body-r")!;
    expect(body).toHaveAttribute("data-motion", "fold");
    expect(body.className).toContain("overflow-hidden");
    const toggle = screen.getByRole("button", { name: "Fold Rome" });
    expect(toggle.className).toContain("transition-colors");
    expect(toggle.querySelector("svg")!.getAttribute("class")).toContain("rotate-180");
  });

  it("folding keeps the body, inert, until its exit finishes", async () => {
    const { container, rerender } = renderRow({ open: true });
    rerender(
      <StopRow stop={DATED} number={3} open={false} onToggle={vi.fn()} bodyId="body-r" stay={null} plansCount={0} ideasCount={0} menuGroups={[]}>
        <p>open body</p>
      </StopRow>,
    );
    const leaving = container.querySelector("#body-r");
    expect(leaving).not.toBeNull();
    expect(leaving).toHaveAttribute("inert");
    await waitFor(() => expect(container.querySelector("#body-r")).toBeNull());
  });
});

const dayProps = {
  tripId: "t1", stopId: "par", dateISO: "2026-12-11", items: [] as StopDayItem[], ideas: [], collapsed: false,
  onCollapsedChange: vi.fn(), showDragHint: false, onAdd: vi.fn(), onEditItem: vi.fn(), onScheduleIdea: vi.fn(),
};

describe("P3 fold a day", () => {
  it("the day's rows sit in a height-animated motion.div; the chevron turns", () => {
    const { container } = render(<DaySection {...dayProps} items={ITEMS} />);
    expect(container.querySelector("[data-motion='day-fold']")!.className).toContain("overflow-hidden");
    const chevron = screen.getByRole("button", { name: "FRI 11 DEC" }).querySelector("svg")!;
    expect(chevron.getAttribute("class")).toContain("transition-transform");
    expect(chevron.getAttribute("class")).not.toContain("-rotate-90");
  });

  it("folding keeps the rows, inert, until their exit finishes", async () => {
    const { container, rerender } = render(<DaySection {...dayProps} items={ITEMS} />);
    rerender(<DaySection {...dayProps} items={ITEMS} collapsed />);
    const leaving = container.querySelector("[data-motion='day-fold']");
    expect(leaving).not.toBeNull();
    expect(leaving).toHaveAttribute("inert");
    await waitFor(() => expect(container.querySelector("[data-motion='day-fold']")).toBeNull());
    expect(screen.getByRole("button", { name: "FRI 11 DEC" }).querySelector("svg")!.getAttribute("class")).toContain("-rotate-90");
  });
});

describe("P5 day title edit", () => {
  it("the saved title pops", async () => {
    const { rerender } = render(<DaySection {...dayProps} dayTitle="Museums" />);
    expect(screen.getByText("Museums").className).not.toContain("tp-pop");
    await userEvent.click(screen.getByRole("button", { name: "Edit the day title, Museums" }));
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Louvre day{Enter}");
    expect(setDayTitle).toHaveBeenCalledWith({ stopId: "par", date: "2026-12-11", title: "Louvre day" });
    // router.refresh() lands the new title as a prop.
    rerender(<DaySection {...dayProps} dayTitle="Louvre day" />);
    expect(screen.getByText("Louvre day").className).toContain("tp-pop");
    // Off once played, so showing the hidden desktop list (a resize) doesn't replay it.
    endAnimation(screen.getByText("Louvre day"));
    expect(screen.getByText("Louvre day").className).not.toContain("tp-pop");
  });
});

describe("P6 drag a plan", () => {
  it("a day under a dragged plan is outlined; the day it lands on flashes", () => {
    render(<DaySection {...dayProps} flash />);
    const section = screen.getByRole("region", { name: "FRI 11 DEC" });
    expect(section.className).toContain("data-[over]:outline-coral");
    expect(section).toHaveAttribute("data-flash");
    expect(section.className).toContain("data-[flash]:tp-day-flash");
  });
});

const idea = (id: string, title: string) => ({ id, title, category: "SIGHTSEEING", startTime: null, endTime: null });

describe("P7 schedule an idea", () => {
  it("a scheduled idea's chip leaves inert, and the count follows", async () => {
    const ideas = [idea("i1", "Orsay"), idea("i2", "Sainte-Chapelle")];
    const { rerender } = render(<IdeasBox ideas={ideas} onOpen={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText("2 IDEAS")).toBeInTheDocument();
    rerender(<IdeasBox ideas={[ideas[1]]} onOpen={vi.fn()} onAdd={vi.fn()} />);
    const leaving = document.querySelector('[data-idea="i1"]');
    expect(leaving).not.toBeNull();
    expect(leaving).toHaveAttribute("inert");
    await waitFor(() => expect(document.querySelector('[data-idea="i1"]')).toBeNull());
    await waitFor(() => expect(screen.getByText("1 IDEA")).toBeInTheDocument());
  });

  it("a row new to the day rises in; the ones already there don't", () => {
    const { container, rerender } = render(<DaySection {...dayProps} items={ITEMS} />);
    expect(container.querySelector("[data-row]")!.className).not.toContain("tp-rise-in");
    rerender(<DaySection {...dayProps} items={[...ITEMS, { id: "n", title: "Orsay", category: "SIGHTSEEING", date: "2026-12-11" }]} />);
    const rows = container.querySelectorAll("[data-row]");
    expect(rows[0].className).not.toContain("tp-rise-in");
    expect(rows[1].className).toContain("tp-rise-in");
    endAnimation(rows[1] as HTMLElement);
    expect(container.querySelectorAll("[data-row]")[1].className).not.toContain("tp-rise-in");
  });
});

describe("P8 leg pill add", () => {
  it("the missing pill's Add label nudges on hover", () => {
    const missing = { icon: null, label: "How are you getting to Florence?", sub: "Add", missing: true, accessibleName: "Add transport" };
    render(<LegPill label={missing} onClick={vi.fn()} />);
    const pill = screen.getByRole("button", { name: "Add transport" });
    expect(pill.className).toMatch(/(^|\s)group(\s|$)/);
    expect(within(pill).getByText("Add").className).toContain("group-hover:translate-x-0.5");
  });

  it("a real leg's pill has no Add label to nudge", () => {
    const flight = { icon: Plane, label: "Flight", sub: "Tue 15 Dec", missing: false, accessibleName: "Flight" };
    render(<LegPill label={flight} onClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Flight" }).querySelector('[class*="group-hover:translate-x"]')).toBeNull();
  });
});

const S = (over: Partial<PlanSummary> = {}): PlanSummary => ({
  stopCount: 6, roughCount: 1, scheduledNights: 28, projectedNights: 33, spanStart: "2026-12-04",
  scheduledEnd: "2027-01-01", projectedEnd: "2027-01-06", hardEndDate: "2027-01-08", hardEndState: "ok", hardEndSlackNights: 2, ...over,
});
const fitBase = { tripId: "t1", startDate: "2026-12-04", fitStops: [], isOwner: true };

describe("P10 Fit tile state change", () => {
  it("cross-fades its fill and wiggles once on crossing into over", () => {
    const { container, rerender } = render(<FitTile {...fitBase} summary={S()} />);
    const first = container.firstElementChild as HTMLElement;
    expect(first.className).toContain("transition-colors");
    expect(first.className).toContain("duration-[var(--dur-slow)]");
    expect(first.className).not.toContain("tp-wiggle");
    rerender(<FitTile {...fitBase} summary={S({ hardEndState: "over", hardEndSlackNights: -2, projectedNights: 37 })} />);
    expect((container.firstElementChild as HTMLElement).className).toContain("tp-wiggle");
    endAnimation(container.firstElementChild as HTMLElement);
    expect((container.firstElementChild as HTMLElement).className).not.toContain("tp-wiggle");
  });

  it("the big number renders its value from the first paint (tweened after)", () => {
    render(<FitTile {...fitBase} summary={S()} />);
    expect(screen.getByText("2").className).toMatch(/font-display/);
  });
});

describe("P12 mobile sheets", () => {
  const groups = [[{ key: "edit", label: "Edit name & place", onSelect: vi.fn() }]];

  it("bottom sheets dim to 45% and carry a drag handle that dismisses", () => {
    const onOpenChange = vi.fn();
    render(<StopActionsSheet open onOpenChange={onOpenChange} number={3} hue="coral" rough={false} name="Rome" meta="" groups={groups} />);
    const overlay = document.querySelector("[data-sheet-overlay]") as HTMLElement;
    expect(overlay.className).toContain("bg-foreground/45");
    const handle = document.querySelector("[data-drag-handle]") as HTMLElement;
    expect(handle.className).toContain("touch-none");
    expect(document.querySelectorAll('[role="dialog"] .rounded-full.bg-border')).toHaveLength(1);
    handle.setPointerCapture = vi.fn();
    fireEvent.pointerDown(handle, { clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 600, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: 600, pointerId: 1 });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("the actions sheet, which draws no ✕, still has a screen-reader Close", async () => {
    const onOpenChange = vi.fn();
    render(<StopActionsSheet open onOpenChange={onOpenChange} number={3} hue="coral" rough={false} name="Rome" meta="" groups={groups} />);
    const close = screen.getByRole("button", { name: "Close" });
    expect(close.className).toContain("sr-only");
    await userEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("the pick-a-day sheet: 45% scrim, a visible ✕ that closes it", async () => {
    const onOpenChange = vi.fn();
    render(<PickDaySheet open onOpenChange={onOpenChange} title="Orsay" slots={SLOTS} stop={PARIS} onPick={vi.fn()} />);
    expect((document.querySelector("[data-sheet-overlay]") as HTMLElement).className).toContain("bg-foreground/45");
    const close = screen.getByRole("button", { name: "Close" });
    expect(close.className).not.toContain("sr-only");
    await userEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("the pick-a-day sheet: a drag on the handle past 30% closes it; a short slow one springs back", () => {
    const onOpenChange = vi.fn();
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    try {
      render(<PickDaySheet open onOpenChange={onOpenChange} title="Orsay" slots={SLOTS} stop={PARIS} onPick={vi.fn()} />);
      const dialog = screen.getByRole("dialog");
      dialog.getBoundingClientRect = () => ({ height: 1000 }) as DOMRect;
      const handle = dialog.querySelector("[data-drag-handle]") as HTMLElement;
      handle.setPointerCapture = vi.fn();

      fireEvent.pointerDown(handle, { clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientY: 150, pointerId: 1 });
      expect(dialog.style.transform).toBe("translateY(150px)");
      now.mockReturnValue(5_000);
      fireEvent.pointerUp(handle, { clientY: 150, pointerId: 1 });
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(dialog.style.transform).toBe("");

      now.mockReturnValue(0);
      fireEvent.pointerDown(handle, { clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientY: 400, pointerId: 1 });
      now.mockReturnValue(5_000);
      fireEvent.pointerUp(handle, { clientY: 400, pointerId: 1 });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    } finally {
      now.mockRestore();
    }
  });

  it("the stop sheet's Segmented uses a shared sliding pill", async () => {
    render(
      <StopSheet
        open onClose={vi.fn()} stop={{ ...PARIS, departDate: "2026-12-12" }} number={2} slots={daySlots({ arriveDate: "2026-12-10", departDate: "2026-12-12" }, [])}
        dayItems={[]} ideas={[]} stay={null} accommodationRows={null} onAddStay={vi.fn()} onEditItem={vi.fn()} onAddPlan={vi.fn()}
        onOpenIdea={vi.fn()} onEditDates={vi.fn()} onActions={vi.fn()}
      />,
    );
    const days = screen.getByRole("radio", { name: "Days" });
    expect(days.querySelector('[data-slot="stop-tab-pill"]')).not.toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: /Stay/ }));
    expect(days.querySelector('[data-slot="stop-tab-pill"]')).toBeNull();
    expect(screen.getByRole("radio", { name: /Stay/ }).querySelector('[data-slot="stop-tab-pill"]')).not.toBeNull();
  });
});

