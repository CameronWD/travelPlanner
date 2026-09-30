import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RightNowCard, NextRow, type RightNowProps } from "./right-now-card";

const base: RightNowProps = {
  timeZone: "Europe/Paris",
  localDateISO: "2026-12-12",
  nowHHMM: "14:20",
  place: { kind: "stop", name: "Paris", country: "France", night: 3, nights: 5, dayTitle: "Versailles day", next: { name: "Rome", weekday: "Tue" } },
  rows: [
    { key: "a", time: "08:40", title: "RER to Versailles", sub: null, kind: "item", category: "GETTING_AROUND", mode: null, done: true },
    { key: "b", time: "09:30", title: "Palace + gardens", sub: null, kind: "item", category: "SIGHTSEEING", mode: null, done: false },
  ],
  dayTitle: "Versailles day",
  tonight: "Hôtel Grands Boulevards",
};

describe("RightNowCard (SHARE.md §4)", () => {
  it("heads with RIGHT NOW and the local time, then the place and sub line", () => {
    render(<RightNowCard {...base} />);
    expect(screen.getByText("Right now")).toBeInTheDocument();
    expect(screen.getByText("14:20")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "In Paris" })).toBeInTheDocument();
    expect(screen.getByText("France · Night 3 of 5 · then Rome on Tue")).toBeInTheDocument();
  });
  it("lists today with done rows struck, and tonight's stay without an address", () => {
    const { container } = render(<RightNowCard {...base} />);
    expect(screen.getByText("RER to Versailles").className).toMatch(/\btp-strike\b/);
    expect(screen.getByText("Tonight")).toBeInTheDocument();
    expect(screen.getByText("Hôtel Grands Boulevards")).toBeInTheDocument();
    expect(container.querySelector("[data-slot='right-now']")!.className).toMatch(/\bshadow-hard-5\b/);
  });
  it("staggers the done rows' strikes in list order (MOTION.md S6)", () => {
    const rows = [
      { ...base.rows![0], key: "d1", title: "First done" },
      { ...base.rows![1], key: "u1", title: "Not yet" },
      { ...base.rows![0], key: "d2", title: "Second done" },
    ];
    render(<RightNowCard {...base} rows={rows} />);
    expect(screen.getByText("First done").style.getPropertyValue("--tp-i")).toBe("0");
    expect(screen.getByText("Second done").style.getPropertyValue("--tp-i")).toBe("1");
  });
  it("caps the list at 5 rows and says how many more", () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ ...base.rows![1], key: `r${i}`, title: `Thing ${i}` }));
    render(<RightNowCard {...base} rows={rows} />);
    expect(screen.getByText("Thing 4")).toBeInTheDocument();
    expect(screen.queryByText("Thing 5")).not.toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });
  it("skips the list entirely when daily plans are off", () => {
    render(<RightNowCard {...base} rows={null} />);
    expect(screen.queryByText("RER to Versailles")).not.toBeInTheDocument();
  });
  it("leg in progress: Travelling to …, lands at local time", () => {
    render(<RightNowCard {...base} place={{ kind: "leg", toName: "Rome", mode: "FLIGHT", landsAt: "12:15" }} />);
    expect(screen.getByRole("heading", { name: "Travelling to Rome" })).toBeInTheDocument();
    expect(screen.getByText("Flight · lands 12:15 local")).toBeInTheDocument();
  });
});

describe("NextRow", () => {
  it("shows NEXT, the stop and the outgoing leg", () => {
    render(<NextRow next={{ name: "Rome", dotClass: "bg-hue-coral", right: { mode: "FLIGHT", label: "Tue 15 Dec · 10:05" } }} />);
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(screen.getByText("Rome")).toBeInTheDocument();
    expect(screen.getByText("Tue 15 Dec · 10:05")).toBeInTheDocument();
  });
});
