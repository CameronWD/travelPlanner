import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/stops", () => ({ createStop: vi.fn(async () => ({ success: true })) }));

const comboCapture = vi.hoisted(() => ({ props: undefined as Record<string, unknown> | undefined }));
vi.mock("@/components/ui/place-combobox", () => ({
  PlaceCombobox: (p: { value: string; onValueChange: (t: string) => void; onPick: (x: unknown) => void; rankNear?: unknown }) => {
    comboCapture.props = p;
    return (
      <div>
        <input aria-label="Place" value={p.value} onChange={(e) => p.onValueChange(e.target.value)} />
        <button type="button" onClick={() => p.onPick({ name: "Florence", region: "Tuscany, Italy", lat: 43.77, lng: 11.25, countryCode: "it" })}>pick Florence</button>
      </div>
    );
  },
}));
vi.mock("@/components/ui/range-calendar", () => ({
  RangeCalendar: (p: { onChange: (r: { start?: string; end?: string }) => void }) => (
    <>
      <button type="button" onClick={() => p.onChange({ start: "2026-12-22", end: "2026-12-24" })}>pick range</button>
      <button type="button" onClick={() => p.onChange({ start: "2026-12-12", end: "2026-12-14" })}>pick mid range</button>
      <button type="button" onClick={() => p.onChange({ start: "2026-12-01", end: "2026-12-05" })}>pick early range</button>
    </>
  ),
}));

import { AddStopSheet } from "./add-stop-sheet";
import { createStop } from "@/server/actions/stops";

const STOPS = [
  { id: "par", name: "Paris", sortOrder: 0, arriveDate: "2026-12-10", departDate: "2026-12-15", nights: null, pinned: false, lat: 48.85, lng: 2.35 },
  { id: "rom", name: "Rome", sortOrder: 1, arriveDate: "2026-12-15", departDate: "2026-12-22", nights: null, pinned: false, lat: 41.9, lng: 12.5 },
];
// The plan ends 22 Dec, so a 5-night stop after Rome lands exactly on the hard end.
const base = { open: true, onOpenChange: vi.fn(), tripId: "t1", forkId: null, stops: STOPS, hardEndDate: "2026-12-27", tripStartDate: "2026-12-10" };

beforeEach(() => vi.clearAllMocks());

describe("AddStopSheet (PLAN.md §7.4)", () => {
  it("a dialog titled Add a stop; the CTA waits for a place; free text works", async () => {
    render(<AddStopSheet {...base} defaultRange={{ arriveDate: "2026-12-22", departDate: "2026-12-24" }} />);
    expect(screen.getByRole("dialog", { name: "Add a stop" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Add / })).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox", { name: "Place" }), "Lucca");
    expect(screen.getByRole("button", { name: "Add Lucca" })).toBeEnabled();
  });

  it("is a full-height-minus-118px sheet on phones and a 560px dialog from sm", () => {
    render(<AddStopSheet {...base} />);
    const cls = screen.getByRole("dialog", { name: "Add a stop" }).className;
    expect(cls).toContain("sm:max-w-[560px]");
    expect(cls).toContain("max-sm:h-[calc(100dvh-118px)]");
  });

  it("starts on Exact dates when the trip has a start, Roughly when nothing is dated", () => {
    const { unmount } = render(<AddStopSheet {...base} />);
    expect(screen.getByRole("radio", { name: "Exact dates" })).toHaveAttribute("aria-checked", "true");
    unmount();
    render(<AddStopSheet {...base} tripStartDate={undefined} stops={STOPS.map((s) => ({ ...s, arriveDate: null, departDate: null, nights: 2 }))} />);
    expect(screen.getByRole("radio", { name: "Roughly" })).toHaveAttribute("aria-checked", "true");
  });

  it("Exact dates without a range keeps the CTA disabled", async () => {
    render(<AddStopSheet {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "pick Florence" }));
    expect(screen.getByRole("button", { name: "Add Florence" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "pick range" }));
    expect(screen.getByRole("button", { name: "Add Florence" })).toBeEnabled();
  });

  it("Enter in the place field submits nothing while the CTA is disabled", async () => {
    render(<AddStopSheet {...base} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Place" }), "Lucca{Enter}");
    expect(createStop).not.toHaveBeenCalled();
  });

  it("ranks results near the route's centre", () => {
    render(<AddStopSheet {...base} />);
    expect(comboCapture.props!.rankNear).toEqual({ lat: (48.85 + 41.9) / 2, lng: (2.35 + 12.5) / 2 });
  });

  it("Roughly: a 44px nights stepper with a 34px number, and the live consequence line", async () => {
    render(<AddStopSheet {...base} />);
    await userEvent.click(screen.getByRole("radio", { name: "Roughly" }));
    const stepper = screen.getByRole("group", { name: "Nights" });
    expect(stepper.className).toContain("[&_button]:size-11");
    expect(stepper.className).toContain("[&_[aria-live]]:text-[34px]");
    await userEvent.click(screen.getByRole("button", { name: "Increase Nights" }));
    await userEvent.click(screen.getByRole("button", { name: "Increase Nights" }));
    expect(screen.getByText("Lands on Tue 22 – Sun 27 Dec. 0 nights spare after this.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Increase Nights" }));
    await userEvent.click(screen.getByRole("button", { name: "Increase Nights" }));
    expect(screen.getByText("Pushes you 2 nights past Sun 27 Dec.").className).toContain("text-coral-text");
  });

  it("Roughly: GOES AFTER is a select defaulting to the last stop, and submits a rough stop after it", async () => {
    const onOpenChange = vi.fn();
    render(<AddStopSheet {...base} onOpenChange={onOpenChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Roughly" }));
    expect(screen.getByRole("combobox", { name: "Goes after" })).toHaveTextContent("Rome");
    await userEvent.click(screen.getByRole("button", { name: "pick Florence" }));
    await userEvent.click(screen.getByRole("button", { name: "Add Florence" }));
    expect(createStop).toHaveBeenCalledTimes(1);
    expect(createStop).toHaveBeenCalledWith("t1", { mode: "rough", name: "Florence", country: "Italy", nights: 3, lat: 43.77, lng: 11.25, countryCode: "it" }, undefined, "rom");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Exact dates: submits a scheduled stop with a guessed timezone", async () => {
    render(<AddStopSheet {...base} forkId="fork-1" />);
    await userEvent.click(screen.getByRole("radio", { name: "Exact dates" }));
    await userEvent.click(screen.getByRole("button", { name: "pick Florence" }));
    await userEvent.click(screen.getByRole("button", { name: "pick range" }));
    await userEvent.click(screen.getByRole("button", { name: "Add Florence" }));
    expect(createStop).toHaveBeenCalledTimes(1);
    expect(createStop).toHaveBeenCalledWith(
      "t1",
      { mode: "scheduled", name: "Florence", country: "Italy", timezone: "Europe/Rome", arriveDate: "2026-12-22", departDate: "2026-12-24", lat: 43.77, lng: 11.25, countryCode: "it" },
      "fork-1",
      "rom",
    );
  });

  it("free text submits the name alone, and a failed save shows the error and stays open", async () => {
    vi.mocked(createStop).mockResolvedValueOnce({ success: false, errors: { name: ["Stop name is required"] } });
    const onOpenChange = vi.fn();
    render(<AddStopSheet {...base} onOpenChange={onOpenChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Roughly" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Place" }), "Lucca");
    await userEvent.click(screen.getByRole("button", { name: "Add Lucca" }));
    expect(createStop).toHaveBeenCalledWith("t1", { mode: "rough", name: "Lucca", nights: 3 }, undefined, "rom");
    expect(await screen.findByRole("alert")).toHaveTextContent("Stop name is required");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("with no stops there is no GOES AFTER and the stop goes first", async () => {
    render(<AddStopSheet {...base} stops={[]} />);
    expect(screen.queryByRole("combobox", { name: "Goes after" })).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: "Roughly" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Place" }), "Lucca");
    await userEvent.click(screen.getByRole("button", { name: "Add Lucca" }));
    expect(createStop).toHaveBeenCalledWith("t1", { mode: "rough", name: "Lucca", nights: 3 }, undefined, undefined);
  });

  it("Exact dates: GOES AFTER is read-only and follows the range; a rough stop between Paris and Rome stays put", async () => {
    const X = { id: "x", name: "Lyon", sortOrder: 1, arriveDate: null, departDate: null, nights: 2, pinned: false, lat: null, lng: null };
    const plan = [STOPS[0], X, { ...STOPS[1], sortOrder: 2 }];
    render(<AddStopSheet {...base} stops={plan} hardEndDate={null} />);
    expect(screen.queryByRole("combobox", { name: "Goes after" })).toBeNull();
    expect(screen.getByTestId("goes-after")).toHaveTextContent("Pick dates to place it.");
    await userEvent.click(screen.getByRole("button", { name: "pick mid range" }));
    expect(screen.getByTestId("goes-after")).toHaveTextContent(/^Goes after Paris/);
    await userEvent.click(screen.getByRole("button", { name: "pick early range" }));
    expect(screen.getByTestId("goes-after")).toHaveTextContent(/^Goes first/);
    await userEvent.click(screen.getByRole("button", { name: "pick range" }));
    expect(screen.getByTestId("goes-after")).toHaveTextContent(/^Goes after Rome/);
    await userEvent.click(screen.getByRole("button", { name: "pick Florence" }));
    await userEvent.click(screen.getByRole("button", { name: "Add Florence" }));
    // After Rome, not after the rough Lyon: Lyon keeps its slot between Paris and Rome.
    expect(createStop).toHaveBeenCalledWith("t1", expect.objectContaining({ mode: "scheduled" }), undefined, "rom");
  });

  it("Exact dates: the consequence line reflects the picked range", async () => {
    render(<AddStopSheet {...base} />);
    expect(screen.queryByText(/^Lands on/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "pick range" }));
    expect(screen.getByText("Lands on Tue 22 – Thu 24 Dec. 3 nights spare after this.")).toBeInTheDocument();
  });

  it("uses no banned soft classes", () => {
    render(<AddStopSheet {...base} />);
    expect(document.body.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});
