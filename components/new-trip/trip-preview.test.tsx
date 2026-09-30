import { describe, it, expect } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import { TripPreview, TripPreviewMini, CountdownStrip } from "./trip-preview";

const base = { past: false, step: 1 as const, name: "Japan at Christmas", dateMode: "exact" as const, today: "2026-09-28" };

describe("TripPreview", () => {
  it("is decorative: aria-hidden and inert", () => {
    render(<TripPreview {...base} />);
    const el = screen.getByTestId("trip-preview");
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el).toHaveAttribute("inert");
  });
  it("renders the hero card with the live name, the skeleton and the stamp (name is unstamped, so it repeats the title)", () => {
    render(<TripPreview {...base} />);
    const el = screen.getByTestId("trip-preview");
    expect(within(el).getByText("ON YOUR TRIPS PAGE", { exact: false })).toBeInTheDocument();
    expect(within(el).getByText("NEW TRIP")).toBeInTheDocument();
    expect(el.querySelector("[data-preview-skeleton]")).not.toBeNull();
    // Two copies of the name (desktop + mobile h2) plus the stamp's own place text
    // (stampPlace with no stops just echoes the name) — three total, proving the
    // stamp actually renders rather than this being a duplicate of the title check.
    expect(within(el).getAllByText("Japan at Christmas")).toHaveLength(3);
    expect(el.querySelector("article")?.className).toMatch(/md:w-\[420px\]/);
  });
  it("exact dates show the countdown", () => {
    render(<TripPreview {...base} step={2} startDate="2026-12-04" endDate="2027-01-08" />);
    const el = screen.getByTestId("trip-preview");
    expect(within(el).getAllByText("4 Dec – 8 Jan").length).toBeGreaterThan(0);
    expect(within(el).getByText("04 DEC 26")).toBeInTheDocument();
  });
  it("a cover photo replaces the stamp (only the two title copies remain, not three)", () => {
    render(<TripPreview {...base} coverUrl="blob:cover" />);
    const el = screen.getByTestId("trip-preview");
    expect(el.querySelector("img")?.getAttribute("src")).toBe("blob:cover");
    expect(within(el).getAllByText("Japan at Christmas")).toHaveLength(2);
  });
  it("step 4 shows Add your first stop", () => {
    render(<TripPreview {...base} step={4} />);
    expect(within(screen.getByTestId("trip-preview")).getByText("Add your first stop")).toBeInTheDocument();
  });
});

describe("TripPreview motion (MOTION N5–N7, N11)", () => {
  it("a thunk key plays the stamp press and the polaroid wiggle (MOTION N6)", () => {
    const { container } = render(<TripPreview {...base} startDate="2026-12-04" endDate="2027-01-08" thunkKey={1} />);
    expect(container.querySelector(".tp-stamp-thunk")).not.toBeNull();
    expect(container.querySelector("[data-polaroid].tp-wiggle, .tp-wiggle [data-polaroid]")).not.toBeNull();
  });
  it("without a thunk key, no press", () => {
    const { container } = render(<TripPreview {...base} />);
    expect(container.querySelector(".tp-stamp-thunk")).toBeNull();
    expect(container.querySelector(".tp-wiggle")).toBeNull();
  });
  it("the stamp pops afresh when its (debounced) name changes, not on every keystroke (MOTION N5)", () => {
    const { container, rerender } = render(<TripPreview {...base} name="Jap" stampName="Jap" />);
    const first = container.querySelector("[data-stamp-pop]");
    expect(first?.className).toMatch(/\btp-pop\b/);
    rerender(<TripPreview {...base} name="Japan" stampName="Jap" />);
    expect(container.querySelector("[data-stamp-pop]")).toBe(first);
    rerender(<TripPreview {...base} name="Japan" stampName="Japan" />);
    const next = container.querySelector("[data-stamp-pop]");
    expect(next).not.toBe(first);
    expect(next?.textContent).toContain("Japan");
  });
  it("the countdown counts up to the sleeps (MOTION N7)", async () => {
    render(<TripPreview {...base} step={2} startDate="2026-12-04" endDate="2027-01-08" />);
    expect(await within(screen.getByTestId("trip-preview")).findByText("67", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByText(/sleeps/).className).toMatch(/\btp-fade-in\b/);
  });
  it("a date change tweens from the old number to the new one, not from 0", async () => {
    const { rerender } = render(<TripPreview {...base} step={2} startDate="2026-12-04" endDate="2027-01-08" />);
    await within(screen.getByTestId("trip-preview")).findByText("67", {}, { timeout: 2000 });
    rerender(<TripPreview {...base} step={2} startDate="2026-12-14" endDate="2027-01-08" />);
    const n = () => Number(screen.getByTestId("trip-preview").querySelector("[data-count-up]")!.textContent);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(n()).toBeGreaterThanOrEqual(67);
    expect(await within(screen.getByTestId("trip-preview")).findByText("77", {}, { timeout: 2000 })).toBeInTheDocument();
  });
});

describe("TripPreviewMini / CountdownStrip", () => {
  it("the mini card is phones-only and tilted", () => {
    render(<TripPreviewMini {...base} />);
    const el = screen.getByTestId("trip-preview-mini");
    expect(el.className).toMatch(/\bmd:hidden\b/);
    expect(el.className).toMatch(/-rotate-2/);
  });
  it("the countdown strip reads sleeps, range and nights", () => {
    render(<CountdownStrip startDate="2026-12-04" endDate="2027-01-08" today="2026-09-28" />);
    expect(screen.getByText("67")).toBeInTheDocument();
    expect(screen.getByText("4 Dec – 8 Jan")).toBeInTheDocument();
    expect(screen.getByText("35 nights")).toBeInTheDocument();
  });
});
