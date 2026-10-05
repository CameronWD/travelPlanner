import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TallyCard, TallyStrip } from "./tally-card";
import type { TravelStats } from "@/lib/travel-stats";

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

  it("steps the headline down, then drops the second cell row, as the card's own box shrinks (Resolves-Feedback cmutai0m4000604l8mtbi92xt)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const css = fs.readFileSync(path.resolve(__dirname, "../../app/globals.css"), "utf-8");
    expect(css).toMatch(/\.tally-card\s*\{\s*container-type:\s*size;\s*\}/);

    const shrinkHeadline = css.match(/@container \(max-height: 260px\) \{([\s\S]*?)\n\}/)?.[1];
    expect(shrinkHeadline).toBeTruthy();
    expect(shrinkHeadline).toMatch(/\.tally-headline-num\s*\{\s*font-size:\s*32px;\s*\}/);
    expect(shrinkHeadline).toMatch(/\.tally-headline-label\s*\{\s*font-size:\s*14px;\s*\}/);

    const dropRow2 = css.match(/@container \(max-height: 217px\) \{([\s\S]*?)\n\}/)?.[1];
    expect(dropRow2).toBeTruthy();
    expect(dropRow2).toMatch(/\.tally-cell-row2\s*\{\s*display:\s*none;\s*\}/);

    // The drop-row2 threshold must be below the shrink-headline one — it's a
    // second, deeper step down, not an alternative.
    const blocks = [...css.matchAll(/@container \(max-height: (\d+)px\) \{([\s\S]*?)\n\}/g)];
    const shrinkAt = Number(blocks.find((b) => b[2].includes("tally-headline-num"))?.[1]);
    const dropAt = Number(blocks.find((b) => b[2].includes("tally-cell-row2"))?.[1]);
    expect(dropAt).toBeLessThan(shrinkAt);
  });
});
