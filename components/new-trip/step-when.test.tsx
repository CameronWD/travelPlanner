import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StepWhen } from "./step-when";
import { StepHarness, currentDraft } from "./step-harness.test-utils";

const motionFlags = vi.hoisted(() => ({ reduce: false }));
vi.mock("motion/react", async (orig) => ({ ...(await orig<typeof import("motion/react")>()), useReducedMotion: () => motionFlags.reduce }));

const day = (name: string) => screen.getByRole("button", { name });

describe("StepWhen", () => {
  it("offers Exact dates · Roughly · Not sure yet, Exact first", () => {
    render(<StepHarness Step={StepWhen} />);
    expect(screen.getByRole("radio", { name: "Exact dates" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Roughly" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Not sure yet" })).toBeInTheDocument();
  });

  it("the active mode wears the one shared pill (MOTION N9)", async () => {
    render(<StepHarness Step={StepWhen} />);
    const pills = () => document.querySelectorAll("[data-mode-pill]");
    expect(pills()).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "Exact dates" }).contains(pills()[0])).toBe(true);
    await userEvent.click(screen.getByRole("radio", { name: "Roughly" }));
    expect(pills()).toHaveLength(1);
    expect(screen.getByRole("radio", { name: "Roughly" }).contains(pills()[0])).toBe(true);
  });

  it("focuses its heading on arrival", () => {
    render(<StepHarness Step={StepWhen} />);
    expect(screen.getByRole("heading", { level: 2, name: "When are you going?" })).toHaveFocus();
  });

  it("exact: only days after today, the range lands in the draft, the summary and the phone strip show", async () => {
    render(<StepHarness Step={StepWhen} />);
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
    await userEvent.click(day("Thu 15 Oct 2026"));
    await userEvent.click(day("Tue 20 Oct 2026"));
    expect(currentDraft()).toMatchObject({ startDate: "2026-10-15", endDate: "2026-10-20" });
    expect(screen.getByText("Thu 15 Oct – Tue 20 Oct · 5 nights")).toBeInTheDocument();
    expect(within(screen.getByTestId("countdown-strip")).getByText("15")).toBeInTheDocument();
  });

  it("the phone strip grows in from zero height, phones only (MOTION N7)", async () => {
    render(<StepHarness Step={StepWhen} />);
    await userEvent.click(day("Thu 15 Oct 2026"));
    await userEvent.click(day("Tue 20 Oct 2026"));
    const wrap = screen.getByTestId("countdown-strip").parentElement!;
    expect(wrap.className).toMatch(/\boverflow-hidden\b/);
    expect(wrap.className).toMatch(/\bmd:hidden\b/);
    expect(wrap.style.height).toBe("0px");
    await waitFor(() => expect(wrap.style.height).toBe("auto"));
  });

  it("roughly: twelve month chips from this month; a chip sets the rough month", async () => {
    render(<StepHarness Step={StepWhen} />);
    await userEvent.click(screen.getByRole("radio", { name: "Roughly" }));
    const chips = within(await screen.findByRole("list", { name: "Months" })).getAllByRole("button");
    expect(chips).toHaveLength(12);
    expect(chips[0]).toHaveTextContent("Sep");
    await userEvent.click(screen.getByRole("button", { name: "April 2027" }));
    expect(currentDraft()).toMatchObject({ dateMode: "rough", roughMonth: "2027-04" });
    expect(screen.getByRole("button", { name: "April 2027" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/How long/)).toBeNull();
  });

  it("not sure yet: one reassuring line", async () => {
    render(<StepHarness Step={StepWhen} />);
    await userEvent.click(screen.getByRole("radio", { name: "Not sure yet" }));
    expect(await screen.findByText("No problem. Add dates when you've picked your stops.")).toBeInTheDocument();
    expect(currentDraft().dateMode).toBe("none");
  });

  it("shows a date error under the grid", () => {
    render(<StepHarness Step={StepWhen} errors={{ dates: "Pick the day you get back" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Pick the day you get back");
  });

  it("past mode: no modes, the last two months up to today, and asks when you went", () => {
    render(<StepHarness Step={StepWhen} initial={{ past: true }} />);
    expect(screen.getByRole("heading", { level: 2, name: "When did you go?" })).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByRole("heading", { name: "August 2026" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "September 2026" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Next month" }).at(-1)).toBeDisabled();
    expect(screen.queryByTestId("countdown-strip")).toBeNull();
  });

  it("Continue submits the step", async () => {
    const onNext = vi.fn();
    render(<StepHarness Step={StepWhen} onNext={onNext} />);
    await userEvent.click(screen.getByRole("button", { name: /^Continue/ }));
    expect(onNext).toHaveBeenCalled();
  });
});

describe("StepWhen — panel height (MOTION N9)", () => {
  let resize: ((height: number) => void) | null = null;
  function stubResizeObserver() {
    vi.stubGlobal("ResizeObserver", class {
      constructor(private cb: ResizeObserverCallback) {}
      observe() {
        resize = (height) => act(() => this.cb([{ borderBoxSize: [{ blockSize: height }] } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver));
      }
      unobserve() {}
      disconnect() {}
    });
  }
  const box = () => document.querySelector("[data-auto-height]") as HTMLElement;
  const px = () => parseFloat(box().style.height);
  afterEach(() => {
    vi.unstubAllGlobals();
    motionFlags.reduce = false;
    resize = null;
  });

  it("tweens to the new panel's height on a mode change, and does not jump there", async () => {
    stubResizeObserver();
    render(<StepHarness Step={StepWhen} />);
    resize!(400);
    await waitFor(() => expect(box().style.height).toBe("400px"));
    await userEvent.click(screen.getByRole("radio", { name: "Not sure yet" }));
    resize!(40);
    await new Promise((r) => setTimeout(r, 80));
    expect(px()).toBeGreaterThan(40);
    expect(px()).toBeLessThan(400);
    expect(box().style.overflow).toBe("hidden");
    await waitFor(() => expect(box().style.height).toBe("40px"));
    await waitFor(() => expect(box().style.overflow).toBe(""));
  });

  it("snaps under reduced motion", async () => {
    motionFlags.reduce = true;
    stubResizeObserver();
    render(<StepHarness Step={StepWhen} />);
    resize!(400);
    await waitFor(() => expect(box().style.height).toBe("400px"));
    resize!(40);
    await new Promise((r) => setTimeout(r, 30));
    expect(box().style.height).toBe("40px");
  });
});

