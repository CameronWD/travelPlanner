import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FitTile, FitStrip } from "./fit-tile";
import type { PlanSummary } from "@/lib/plan-overview";

vi.mock("@/components/trip/make-it-fit", () => ({ MakeItFit: () => <button>Make it fit</button> }));
vi.mock("@/server/actions/trips", () => ({ setTripHardEndDate: vi.fn() }));

const S = (over: Partial<PlanSummary> = {}): PlanSummary => ({
  stopCount: 6, roughCount: 1, scheduledNights: 28, projectedNights: 33, spanStart: "2026-12-04",
  scheduledEnd: "2027-01-01", projectedEnd: "2027-01-06", hardEndDate: "2027-01-08", hardEndState: "ok", hardEndSlackNights: 2, ...over,
});
const base = { tripId: "t1", startDate: "2026-12-04", fitStops: [], isOwner: true };

describe("FitTile (PLAN.md §6.2)", () => {
  it("ok: teal, the number, words in a live region, pill, home-by trigger, bar and legend", () => {
    const { container } = render(<FitTile {...base} summary={S()} />);
    expect(container.firstElementChild!.className).toContain("bg-teal");
    expect(screen.getByText("2").className).toMatch(/font-display/);
    const live = screen.getByRole("status");
    expect(live).toHaveTextContent("nights spare");
    expect(live.querySelector("button")).toBeNull();
    expect(screen.getByText("FITS YOUR DATES")).toBeInTheDocument();
    // A pill never wraps onto two lines beside the home-by trigger.
    expect(screen.getByText("FITS YOUR DATES").className).toMatch(/whitespace-nowrap.*shrink-0|shrink-0.*whitespace-nowrap/);
    expect(screen.getByRole("button", { name: /Edit home-by date/ })).toHaveTextContent("Home by Fri 8 Jan");
    expect(screen.getByText("28 set · ~5 rough")).toBeInTheDocument();
    expect(screen.getByText("of 35")).toBeInTheDocument();
    expect(container.querySelector("[data-bar-set]")).not.toBeNull();
  });
  it("approaching 0: sun, right on it", () => {
    const { container } = render(<FitTile {...base} summary={S({ hardEndState: "approaching", hardEndSlackNights: 0 })} />);
    expect(container.firstElementChild!.className).toContain("bg-sun");
    expect(screen.getByRole("status")).toHaveTextContent("right on it");
  });
  it("over: coral, RUNS OVER, Make it fit outside the live region", () => {
    const { container } = render(<FitTile {...base} summary={S({ hardEndState: "over", hardEndSlackNights: -2, projectedNights: 37 })} />);
    expect(container.firstElementChild!.className).toContain("bg-coral");
    expect(screen.getByText("RUNS OVER")).toBeInTheDocument();
    const fit = screen.getByRole("button", { name: "Make it fit" });
    expect(screen.getByRole("status")).not.toContainElement(fit);
    expect(container.querySelector("[data-bar-over]")).not.toBeNull();
  });
  it("unset: the trigger reads Set a home-by date; dormant explains", () => {
    const { rerender } = render(<FitTile {...base} summary={S({ hardEndState: "unset", hardEndSlackNights: null, hardEndDate: null })} />);
    expect(screen.getByRole("button", { name: "Set a home-by date" })).toBeInTheDocument();
    rerender(<FitTile {...base} summary={S({ hardEndState: "dormant", hardEndSlackNights: null })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Set a start date to check this");
  });
  it("uses no banned soft classes", () => {
    const { container } = render(<FitTile {...base} summary={S()} />);
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });

  it("never renders the hard end date as ISO — the home-by trigger uses the repo's formatter", () => {
    const { container } = render(<FitTile {...base} summary={S()} />);
    expect(container.innerHTML).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe("FitStrip (PLAN.md §7.1)", () => {
  it("same colour states, number, words, a 14px bar and Map ⤢", async () => {
    const onOpenMap = vi.fn();
    const { container } = render(<FitStrip summary={S()} onOpenMap={onOpenMap} />);
    expect(container.firstElementChild!.className).toContain("bg-teal");
    expect(screen.getByText("2").className).toContain("text-[30px]");
    await userEvent.click(screen.getByRole("button", { name: /Map/ }));
    expect(onOpenMap).toHaveBeenCalled();
  });
});
