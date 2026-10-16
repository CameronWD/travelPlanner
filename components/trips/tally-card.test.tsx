import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { AtRule } from "postcss";
import { TallyCard, TallyStrip } from "./tally-card";
import type { TravelStats } from "@/lib/travel-stats";
import { atRule, atRules, decls, findRules, rule } from "@/test/helpers/css";

const pair = (done: number, planned: number) => ({ done, planned });
const stats: TravelStats = {
  countries: { done: ["fr", "it", "nz"], planned: ["id", "jp"] },
  places: pair(4, 12), trips: pair(1, 3), nightsAway: pair(9, 45), accommodationNights: pair(0, 20),
  transport: { FLIGHT: pair(2, 6), TRAIN: pair(0, 3), BUS: pair(0, 0), FERRY: pair(0, 0), CAR: pair(0, 0) },
  distanceKm: pair(2140, 36309), longestTrip: null, mostVisitedCountry: null, farthestFromHome: null,
};

beforeEach(() => localStorage.clear());

describe("TallyCard", () => {
  it("defaults to Been when a trip is done and persists a switch", () => {
    render(<TallyCard stats={stats} hasDoneTrip />);
    expect(screen.getByRole("radio", { name: "Been" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Planned" }));
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/on the list/)).toBeInTheDocument();
    expect(localStorage.getItem("teepee:tally-mode")).toBe("planned");
  });
  it("reads the saved mode", () => {
    localStorage.setItem("teepee:tally-mode", "planned");
    render(<TallyCard stats={stats} hasDoneTrip />);
    expect(screen.getByRole("radio", { name: "Planned" })).toHaveAttribute("aria-checked", "true");
  });
  it("never shows 0 countries: with none done it starts in Planned", () => {
    render(<TallyCard stats={{ ...stats, countries: { done: [], planned: ["jp"] } }} hasDoneTrip={false} />);
    expect(screen.getByRole("radio", { name: "Planned" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText("0")).toBeNull();
  });
  it("never shows 0 countries: disables the empty side and ignores clicks on it", () => {
    render(<TallyCard stats={{ ...stats, countries: { done: ["fr"], planned: [] } }} hasDoneTrip />);
    expect(screen.getByRole("radio", { name: "Planned" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Planned" }));
    expect(screen.getByRole("radio", { name: "Been" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText("0")).toBeNull();
  });
  it("never shows 0 countries: renders a dash when both sides are empty", () => {
    render(<TallyCard stats={{ ...stats, countries: { done: [], planned: [] } }} hasDoneTrip={false} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
  });
});

describe("TallyStrip", () => {
  it("shows countries, nights and short km with a mode label", () => {
    render(<TallyStrip stats={stats} hasDoneTrip={false} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("36k km")).toBeInTheDocument();
    expect(screen.getByText("planned")).toBeInTheDocument();
  });
});

describe("TallyCard's own-height compaction (app/globals.css, spec 2026-10-05 §B amendment)", () => {
  it("renders the marker classNames the container-query rules key off", () => {
    const { container } = render(<TallyCard stats={stats} hasDoneTrip />);
    expect(container.querySelector(".tally-card")).toBeInTheDocument();
    expect(container.querySelector(".tally-body")).toBeInTheDocument();
    expect(container.querySelector(".tally-headline-num")).toBeInTheDocument();
    expect(container.querySelector(".tally-headline-label")).toBeInTheDocument();
    // Second row of a 2-col grid of 4 cells is indices 2 and 3.
    expect(container.querySelectorAll(".tally-cell-row2")).toHaveLength(2);
  });

  it("steps the headline down, then drops the second cell row, as the card's own box shrinks (Resolves-Feedback cmutai0m4000604l8mtbi92xt)", () => {
    expect(decls(rule(".tally-card"))).toEqual({ "container-type": "size" });

    const shrinkHeadline = atRule("container", "(max-height: 260px)");
    expect(decls(rule(".tally-headline-num", shrinkHeadline))).toEqual({ "font-size": "32px" });
    expect(decls(rule(".tally-headline-label", shrinkHeadline))).toEqual({ "font-size": "14px" });

    const dropRow2 = atRule("container", "(max-height: 217px)");
    expect(decls(rule(".tally-cell-row2", dropRow2))).toEqual({ display: "none" });

    // The drop-row2 threshold must be below the shrink-headline one — it's a
    // second, deeper step down, not an alternative.
    const maxHeight = (a: AtRule) => Number(/max-height: (\d+)px/.exec(a.params)?.[1]);
    const steps = atRules("container").filter((a) => a.params.includes("max-height"));
    const shrinkAt = maxHeight(steps.find((a) => findRules(".tally-headline-num", a).length > 0)!);
    const dropAt = maxHeight(steps.find((a) => findRules(".tally-cell-row2", a).length > 0)!);
    expect(dropAt).toBeLessThan(shrinkAt);
  });
});
