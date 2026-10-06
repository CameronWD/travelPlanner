import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plane } from "lucide-react";
import { LegPill, LegRow } from "./leg-pill";

const FLIGHT = { icon: Plane, label: "Flight CDG → FCO", sub: "Tue 15 Dec 10:05", missing: false, accessibleName: "Flight from Paris to Rome, Tuesday 15 December 10:05. Edit." };
const MISSING = { icon: null, label: "How are you getting to Florence?", sub: "Add", missing: true, accessibleName: "Add transport from Rome to Florence" };

describe("LegRow / LegPill (PLAN.md §2)", () => {
  it("a solid connector for legs, dashed otherwise; 52px desktop, 40px compact", () => {
    const { container, rerender } = render(<LegRow kind="legs" />);
    const row = container.firstElementChild as HTMLElement;
    expect(row).toHaveAttribute("data-leg-kind", "legs");
    expect(row.className).toContain("min-h-[52px]");
    expect(row.querySelector("[data-connector]")!.className).not.toMatch(/border-dashed/);
    rerender(<LegRow kind="line" compact />);
    expect((container.firstElementChild as HTMLElement).className).toContain("min-h-10");
    expect(container.querySelector("[data-connector]")!.className).toMatch(/border-dashed/);
  });

  it("a transport pill: icon, label, sub, spoken name, click", async () => {
    const onClick = vi.fn();
    render(<LegPill label={FLIGHT} onClick={onClick} />);
    const pill = screen.getByRole("button", { name: FLIGHT.accessibleName });
    expect(pill.className).toContain("h-[34px]");
    expect(pill.className).toContain("bg-card");
    expect(pill.className).toContain("whitespace-nowrap");
    expect(pill.className).toContain("tap-target");
    expect(screen.getByText("Tue 15 Dec 10:05").className).toContain("tabular-nums");
    await userEvent.click(pill);
    expect(onClick).toHaveBeenCalled();
  });

  it("the missing pill is dashed on paper with a coral Add", () => {
    render(<LegPill label={MISSING} onClick={vi.fn()} />);
    const pill = screen.getByRole("button", { name: "Add transport from Rome to Florence" });
    expect(pill.className).toMatch(/border-dashed/);
    expect(pill.className).toContain("bg-background");
    expect(screen.getByText("Add").className).toContain("text-coral-text");
  });

  it("compact: 28px, text-xs; the missing one reads + Add transport", () => {
    render(<LegPill label={MISSING} onClick={vi.fn()} compact />);
    const pill = screen.getByRole("button", { name: "Add transport from Rome to Florence" });
    expect(pill.className).toContain("h-7");
    expect(pill.className).toContain("tap-target");
    expect(pill).toHaveTextContent("Add transport");
  });

  it("uses no banned soft classes", () => {
    const { container } = render(<LegRow kind="legs"><LegPill label={FLIGHT} onClick={vi.fn()} /></LegRow>);
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});

const TRAIN_A = { icon: Plane, label: "Train", sub: "Tue 15 Dec", missing: false, accessibleName: "Train from Paris to Milano Centrale. Edit." };
const TRAIN_B = { icon: Plane, label: "Train", sub: "Tue 15 Dec", missing: false, accessibleName: "Train from Milano Centrale to Bologna. Edit." };
const TRAIN_C = { icon: Plane, label: "Train", sub: "Tue 15 Dec", missing: false, accessibleName: "Train from Bologna to Rome. Edit." };

describe("LegRow — metro line (spec 2026-10-05 §F)", () => {
  it("a single leg looks as it does now, plus its station dot", () => {
    const { container } = render(<LegRow kind="legs"><LegPill label={FLIGHT} onClick={vi.fn()} /></LegRow>);
    expect(container.querySelectorAll("[data-leg-station]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-station-dot]")).toHaveLength(1);
    expect(container.querySelector("[data-changeover]")).toBeNull();
    const pill = screen.getByRole("button", { name: FLIGHT.accessibleName });
    expect(pill.className).toContain("h-[34px]");
    expect(container.querySelector("[data-station-dot]")).toHaveAttribute("aria-hidden");
  });

  it("three legs stack vertically, one per line, in the order given, each with a dot", () => {
    const { container } = render(
      <LegRow kind="legs">
        <LegPill key="a" label={TRAIN_A} onClick={vi.fn()} />
        <LegPill key="b" label={TRAIN_B} onClick={vi.fn()} />
        <LegPill key="c" label={TRAIN_C} onClick={vi.fn()} />
      </LegRow>,
    );
    const stack = container.querySelector("[data-leg-stack]") as HTMLElement;
    expect(stack.className).toContain("flex-col");
    expect(stack.className).not.toContain("flex-wrap");
    const stations = [...container.querySelectorAll("[data-leg-station]")] as HTMLElement[];
    expect(stations.map((s) => within(s).getByRole("button").getAttribute("aria-label"))).toEqual([
      TRAIN_A.accessibleName,
      TRAIN_B.accessibleName,
      TRAIN_C.accessibleName,
    ]);
    expect(container.querySelectorAll("[data-station-dot]")).toHaveLength(3);
  });

  it("a known change-over shows as small text by that leg's dot", () => {
    const { container } = render(
      <LegRow kind="legs" changeovers={[null, "Milano Centrale", null]}>
        <LegPill key="a" label={TRAIN_A} onClick={vi.fn()} />
        <LegPill key="b" label={TRAIN_B} onClick={vi.fn()} />
        <LegPill key="c" label={TRAIN_C} onClick={vi.fn()} />
      </LegRow>,
    );
    const stations = [...container.querySelectorAll("[data-leg-station]")] as HTMLElement[];
    const note = within(stations[1]).getByText("Change at Milano Centrale");
    expect(note).toHaveAttribute("data-changeover");
    expect(note.className).toContain("text-muted-foreground");
    expect(stations[0].querySelector("[data-changeover]")).toBeNull();
    expect(stations[2].querySelector("[data-changeover]")).toBeNull();
  });

  it("an unknown change-over shows nothing", () => {
    const { container } = render(
      <LegRow kind="legs" changeovers={[null, null]}>
        <LegPill key="a" label={TRAIN_A} onClick={vi.fn()} />
        <LegPill key="b" label={TRAIN_B} onClick={vi.fn()} />
      </LegRow>,
    );
    expect(container.querySelector("[data-changeover]")).toBeNull();
    expect(container.querySelectorAll("[data-station-dot]")).toHaveLength(2);
  });

  it("compact and desktop each centre the dot on their own connector", () => {
    const { container, rerender } = render(<LegRow kind="legs"><LegPill label={FLIGHT} onClick={vi.fn()} /></LegRow>);
    expect(container.querySelector("[data-leg-stack]")!.className).toContain("ml-[18px]");
    expect(container.querySelector("[data-station-dot]")!.className).toContain("left-[-19px]");
    rerender(<LegRow kind="legs" compact><LegPill label={FLIGHT} onClick={vi.fn()} compact /></LegRow>);
    expect(container.querySelector("[data-leg-stack]")!.className).toContain("ml-3");
    expect(container.querySelector("[data-station-dot]")!.className).toContain("left-[-13px]");
  });

  it("the missing prompt and the bare line get no dot", () => {
    const { container, rerender } = render(<LegRow kind="missing"><LegPill label={MISSING} onClick={vi.fn()} /></LegRow>);
    expect(container.querySelector("[data-station-dot]")).toBeNull();
    expect(screen.getByRole("button", { name: MISSING.accessibleName })).toBeInTheDocument();
    rerender(<LegRow kind="line" />);
    expect(container.querySelector("[data-leg-stack]")).toBeNull();
  });
});
