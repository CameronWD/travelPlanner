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
import { DayStrip } from "./day-strip";
import { PlanBody } from "./plan-body";
import { StopOpenBody } from "./stop-open-body";
import { SelectedDay } from "./selected-day";
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

function renderStrip(p: Partial<React.ComponentProps<typeof DayStrip>> = {}) {
  const props = { stopId: "par", slots: SLOTS, selected: "2026-12-11", onSelect: vi.fn(), onOpen: vi.fn(), panelId: "panel-par", ...p };
  return render(<DayStrip {...props} />);
}

describe("P3 select a day", () => {
  it("slots lift with a bounce on transform, shadow and fill", () => {
    renderStrip();
    const tab = screen.getByRole("tab", { name: /FRI 11/ });
    expect(tab.className).toContain("transition-[transform,translate,scale,box-shadow,background-color]");
    expect(tab.className).toContain("ease-bounce");
    expect(tab.className).toContain("duration-[var(--dur-base)]");
  });

  it("the panel is keyed by date, so a new selection cross-fades in a new motion.div", async () => {
    const { container } = render(
      <PlanBody initialOpen={["par"]} today="2026-12-30">
        <StopOpenBody
          tripId="t1" stop={PARIS} slots={daySlots(PARIS, ITEMS)} dayItems={ITEMS} ideas={[]} stay={null}
          counts={{ files: 0, notes: 0, reminders: 0 }} showDragHint={false}
          onOpenStay={vi.fn()} onAddStay={vi.fn()} onAddIdea={vi.fn()} onScheduleIdea={vi.fn()} onAddPlan={vi.fn()}
          onEditItem={vi.fn()} onGiveDates={vi.fn()} onOpenExtras={vi.fn()}
        />
      </PlanBody>,
    );
    expect(container.querySelector("[data-day]")).toHaveAttribute("data-day", "2026-12-11");
    await userEvent.click(screen.getByRole("tab", { name: /SAT 12/ }));
    await waitFor(() => expect(container.querySelector("[data-day]")).toHaveAttribute("data-day", "2026-12-12"));
    expect(container.querySelectorAll("[data-day]")).toHaveLength(1);
  });
});

describe("P4 strip overflow", () => {
  it("the arrows fade over --dur-fast", () => {
    const many = daySlots({ arriveDate: "2026-12-01", departDate: "2026-12-20" }, []);
    renderStrip({ slots: many, selected: "2026-12-01" });
    expect(screen.getByRole("button", { name: "Later days" }).className).toContain("transition-opacity duration-[var(--dur-fast)]");
  });
});

describe("P5 day title edit", () => {
  const dayProps = {
    tripId: "t1", stopId: "par", dateISO: "2026-12-11", items: [], ideasCount: 0, panelId: "panel-par",
    tabId: "panel-par-tab-2026-12-11", showDragHint: false, onAdd: vi.fn(), onEditItem: vi.fn(), onPickIdea: vi.fn(),
  };

  it("the saved title pops", async () => {
    const { rerender } = render(<SelectedDay {...dayProps} dayTitle="Museums" />);
    expect(screen.getByText("Museums").className).not.toContain("tp-pop");
    await userEvent.click(screen.getByRole("button", { name: "Edit the day title, Museums" }));
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Louvre day{Enter}");
    expect(setDayTitle).toHaveBeenCalledWith({ stopId: "par", date: "2026-12-11", title: "Louvre day" });
    // router.refresh() lands the new title as a prop.
    rerender(<SelectedDay {...dayProps} dayTitle="Louvre day" />);
    expect(screen.getByText("Louvre day").className).toContain("tp-pop");
    // Off once played, so showing the hidden desktop list (a resize) doesn't replay it.
    endAnimation(screen.getByText("Louvre day"));
    expect(screen.getByText("Louvre day").className).not.toContain("tp-pop");
  });

  it("the strip band scales in from the left when a day is titled", () => {
    renderStrip();
    const titled = screen.getByRole("tab", { name: /SAT 12/ }).querySelector("[data-band]")!;
    expect(titled.className).toContain("origin-left");
    expect(titled.className).toContain("transition-transform");
    expect(titled.className).toContain("scale-x-100");
    const untitled = screen.getByRole("tab", { name: /FRI 11/ }).querySelector("[data-band]")!;
    expect(untitled.className).toContain("scale-x-0");
  });
});

describe("P6 drag a plan", () => {
  it("a slot under the drag scales and tints; the landing slot flashes and its new dot pops", () => {
    renderStrip({ flashDate: "2026-12-11" });
    const fri = screen.getByRole("tab", { name: /FRI 11/ });
    expect(fri.className).toContain("data-[over]:scale-[1.06]");
    expect(fri.className).toContain("data-[over]:bg-coral/40");
    expect(fri).toHaveAttribute("data-flash");
    expect(fri.className).toContain("data-[flash]:tp-slot-flash");
    expect(fri.querySelector(".tp-pop")).toBeNull();
    expect(screen.getByRole("tab", { name: /SAT 12/ })).not.toHaveAttribute("data-flash");
  });

  it("the slot's dot count ticks up with a pop on its newest dot when a plan lands", () => {
    const { rerender } = renderStrip({ selected: "2026-12-10" });
    const withOneMore = daySlots(PARIS, [
      { id: "a", date: "2026-12-11", category: "FOOD" },
      { id: "b", date: "2026-12-11", category: "SIGHTSEEING" },
      { id: "c", date: "2026-12-11", category: "FOOD" },
    ], { "2026-12-12": { title: "Versailles day" } });
    rerender(<DayStrip stopId="par" slots={withOneMore} selected="2026-12-10" onSelect={vi.fn()} onOpen={vi.fn()} panelId="panel-par" />);
    const dots = screen.getByRole("tab", { name: /FRI 11/ }).querySelectorAll("[data-dot]");
    expect(dots[dots.length - 1].className).toContain("tp-pop");
    expect(dots[0].className).not.toContain("tp-pop");
    expect(screen.getByRole("tab", { name: /SAT 12/ }).querySelector(".tp-pop")).toBeNull();
    endAnimation(dots[dots.length - 1] as HTMLElement);
    expect(screen.getByRole("tab", { name: /FRI 11/ }).querySelector(".tp-pop")).toBeNull();
  });
});

const idea = (id: string, title: string) => ({ id, title, category: "SIGHTSEEING", startTime: null, endTime: null });

describe("P7 schedule an idea", () => {
  it("a scheduled idea's chip leaves inert, and the count follows", async () => {
    const ideas = [idea("i1", "Orsay"), idea("i2", "Sainte-Chapelle")];
    const days = ["2026-12-10"];
    const { rerender } = render(<IdeasBox ideas={ideas} days={days} onPick={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText("2 IDEAS")).toBeInTheDocument();
    rerender(<IdeasBox ideas={[ideas[1]]} days={days} onPick={vi.fn()} onAdd={vi.fn()} />);
    const leaving = document.querySelector('[data-idea="i1"]');
    expect(leaving).not.toBeNull();
    expect(leaving).toHaveAttribute("inert");
    await waitFor(() => expect(document.querySelector('[data-idea="i1"]')).toBeNull());
    await waitFor(() => expect(screen.getByText("1 IDEA")).toBeInTheDocument());
  });

  it("a row new to the selected day rises in; the ones already there don't", () => {
    const base = {
      tripId: "t1", stopId: "par", dateISO: "2026-12-11", ideasCount: 0, panelId: "p", tabId: "t", showDragHint: false,
      onAdd: vi.fn(), onEditItem: vi.fn(), onPickIdea: vi.fn(),
    };
    const { container, rerender } = render(<SelectedDay {...base} items={ITEMS} />);
    expect(container.querySelector("[data-row]")!.className).not.toContain("tp-rise-in");
    rerender(<SelectedDay {...base} items={[...ITEMS, { id: "n", title: "Orsay", category: "SIGHTSEEING", date: "2026-12-11" }]} />);
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
        onPickDay={vi.fn()} onEditDates={vi.fn()} onActions={vi.fn()}
      />,
    );
    const days = screen.getByRole("radio", { name: "Days" });
    expect(days.querySelector('[data-slot="stop-tab-pill"]')).not.toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: /Stay/ }));
    expect(days.querySelector('[data-slot="stop-tab-pill"]')).toBeNull();
    expect(screen.getByRole("radio", { name: /Stay/ }).querySelector('[data-slot="stop-tab-pill"]')).not.toBeNull();
  });
});

