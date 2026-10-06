import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HUE_CLASSES } from "@/lib/hues";
import { stopHue } from "@/lib/stop-colours";
import { StopRow, type StopRowProps } from "./stop-row";

const DATED = {
  id: "r", name: "Rome", country: "Italy", timezone: "Europe/Rome", arriveDate: "2026-12-15", departDate: "2026-12-22",
  nights: null, pinned: false, chapterId: null, sortOrder: 2, notes: null, lat: 41.9, lng: 12.5,
};
const ROUGH = { ...DATED, id: "m", name: "Munich", country: "Germany", arriveDate: null, departDate: null, nights: 5, timezone: null, lat: null, lng: null };
const COVERED = { kind: "covered" as const, name: "Hotel Artemide", totalNights: 7, coveredNights: 7, extra: 0, checkInTime: "15:00" };

function renderRow(p: Partial<StopRowProps> = {}) {
  const props: StopRowProps = {
    stop: DATED, number: 3, open: false, onToggle: vi.fn(), bodyId: "body-r", stay: COVERED,
    plansCount: 4, ideasCount: 3, menuGroups: [[{ key: "edit", label: "Edit name & place", onSelect: vi.fn() }]], ...p,
  };
  return { props, ...render(<StopRow {...props}>{p.children ?? <p>open body</p>}</StopRow>) };
}

describe("StopRow (PLAN.md §3)", () => {
  it("keeps the jump-list anchor and never shrinks", () => {
    const { container } = renderRow();
    const card = container.querySelector("#stop-r")!;
    expect(card).toHaveAttribute("data-stop-id", "r");
    expect(card.className).toMatch(/scroll-mt-6/);
    expect(card.className).toMatch(/flex-none/);
    expect(card.className).toMatch(/rounded-\[20px\]/);
    expect(card.className).toMatch(/shadow-hard-4/);
  });

  it("number tile in the stop colour, name, country, map pin", () => {
    renderRow();
    const tile = screen.getByText("3");
    expect(tile.className).toContain(HUE_CLASSES[stopHue(2)].fill);
    expect(screen.getByRole("heading", { name: "Rome" })).toBeInTheDocument();
    expect(screen.getByText("Italy")).toBeInTheDocument();
  });

  it("dates, nights pill and chips", () => {
    renderRow();
    expect(screen.getByText("Tue 15 – Tue 22 Dec")).toBeInTheDocument();
    expect(screen.getByText("7 nights")).toBeInTheDocument();
    expect(screen.getByText("Hotel Artemide")).toBeInTheDocument();
    expect(screen.getByText("4 plans")).toBeInTheDocument();
    expect(screen.getByText("3 ideas")).toBeInTheDocument();
  });

  it("a one-night stay reads singular", () => {
    renderRow({ stop: { ...DATED, arriveDate: "2026-12-15", departDate: "2026-12-16" } });
    expect(screen.getByText("1 night")).toBeInTheDocument();
  });

  it("hides zero counts; partial and no-bed stay chips", () => {
    const { rerender, props } = renderRow({ plansCount: 0, ideasCount: 0, stay: { ...COVERED, kind: "partial", coveredNights: 5 } });
    expect(screen.queryByText(/plans?$/)).toBeNull();
    const partial = screen.getByText(/Hotel Artemide · 2 nights open/);
    expect(partial.closest("[data-chip]")!.className).toContain("bg-sun/30");
    rerender(<StopRow {...props} stay={{ ...COVERED, kind: "none", name: null, coveredNights: 0 }} />);
    const none = screen.getByText("No bed yet");
    expect(none.closest("[data-chip]")!.className).toMatch(/border-dashed/);
    expect(none.closest("[data-chip]")!.className).toContain("bg-coral/20");
  });

  it("fold toggle: aria, sun when open, body only when open", async () => {
    const { props, rerender } = renderRow();
    const toggle = screen.getByRole("button", { name: "Open Rome" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "body-r");
    expect(screen.queryByText("open body")).toBeNull();
    await userEvent.click(toggle);
    expect(props.onToggle).toHaveBeenCalled();
    rerender(<StopRow {...props} open><p>open body</p></StopRow>);
    const fold = screen.getByRole("button", { name: "Fold Rome" });
    expect(fold.className).toContain("bg-sun");
    expect(document.getElementById("body-r")).toContainElement(screen.getByText("open body"));
  });

  it("the ⋯ menu is the grouped MoreActionsMenu", () => {
    renderRow();
    expect(screen.getByRole("button", { name: "More actions for Rome" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit Rome$/ })).toBeNull();
  });

  it("a same-day visit says so", () => {
    renderRow({ stop: { ...DATED, departDate: "2026-12-15" }, stay: null });
    expect(screen.getByText("Same day")).toBeInTheDocument();
  });

  it("a rough stop: dashed, muted tile, Rough + ~5n, handle, no stay chip", () => {
    const { container } = renderRow({ stop: ROUGH, stay: null, dragHandle: <button>drag Munich</button> });
    const card = container.querySelector("#stop-m")!;
    expect(card.className).toMatch(/border-dashed/);
    expect(card.className).toContain("bg-background");
    expect(card.className).not.toMatch(/shadow-hard/);
    expect(screen.getByText("Rough")).toBeInTheDocument();
    expect(screen.getByText("~5 nights")).toBeInTheDocument();
    expect(screen.getByText("3").className).toContain("bg-muted");
    expect(screen.getByRole("button", { name: "drag Munich" })).toBeInTheDocument();
    expect(screen.queryByText("No bed yet")).toBeNull();
  });

  it("shows the stop's own notes as a one-line preview", () => {
    renderRow({ stop: { ...DATED, notes: "Book the Vatican early" } });
    expect(screen.getByText("Book the Vatican early").className).toMatch(/truncate/);
  });

  it("uses no banned soft classes", () => {
    const { container } = renderRow({ open: true });
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});

describe("StopRow header click (spec 2026-10-05 §G)", () => {
  const GRIP = <button type="button" aria-label="Reorder Rome">≡</button>;

  it("a click anywhere on the header toggles, once", async () => {
    const { props } = renderRow();
    await userEvent.click(screen.getByRole("heading", { name: "Rome" }));
    expect(props.onToggle).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByText("Tue 15 – Tue 22 Dec"));
    expect(props.onToggle).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByText("4 plans"));
    expect(props.onToggle).toHaveBeenCalledTimes(3);
  });

  it("the chevron toggles once, not twice", async () => {
    const { props } = renderRow();
    await userEvent.click(screen.getByRole("button", { name: "Open Rome" }));
    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });

  it("the ⋯ menu and its items, the map pin and the drag handle never toggle", async () => {
    const onSelect = vi.fn();
    const { props } = renderRow({ dragHandle: GRIP, menuGroups: [[{ key: "edit", label: "Edit name & place", onSelect }]] });
    await userEvent.click(screen.getByRole("button", { name: "More actions for Rome" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit name & place" }));
    expect(onSelect).toHaveBeenCalled();
    const pin = screen.getByRole("link", { name: /in Maps/ });
    pin.addEventListener("click", (e) => e.preventDefault());
    await userEvent.click(pin);
    await userEvent.click(screen.getByRole("button", { name: "Reorder Rome" }));
    expect(props.onToggle).not.toHaveBeenCalled();
  });

  it("a press that starts on the grip and is released over the header isn't a toggle", () => {
    const { props } = renderRow({ dragHandle: GRIP });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Reorder Rome" }));
    fireEvent.click(screen.getByTestId("stop-row-header"));
    expect(props.onToggle).not.toHaveBeenCalled();
    const name = screen.getByRole("heading", { name: "Rome" });
    fireEvent.pointerDown(name);
    fireEvent.click(name);
    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });

  it("selecting the Stop's name to copy it doesn't toggle", async () => {
    const spy = vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => "Rome" } as Selection);
    const { props } = renderRow();
    await userEvent.click(screen.getByRole("heading", { name: "Rome" }));
    expect(props.onToggle).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("no extra role or tab stop: the keyboard toggles through the chevron only, once", async () => {
    const { props } = renderRow();
    const header = screen.getByTestId("stop-row-header");
    expect(header).not.toHaveAttribute("role");
    expect(header).not.toHaveAttribute("tabindex");
    expect(header.className).toContain("cursor-pointer");
    screen.getByRole("button", { name: "Open Rome" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });
});

describe("StopRow stay chip (spec 2026-10-05 §G)", () => {
  it("is a button that opens the stay, and doesn't toggle the row", async () => {
    const onOpenStay = vi.fn();
    const { props } = renderRow({ onOpenStay });
    await userEvent.click(screen.getByRole("button", { name: "Stay in Rome: Hotel Artemide" }));
    expect(onOpenStay).toHaveBeenCalledTimes(1);
    expect(props.onToggle).not.toHaveBeenCalled();
  });

  it("partial names the open nights", () => {
    renderRow({ onOpenStay: vi.fn(), stay: { ...COVERED, kind: "partial", coveredNights: 5 } });
    expect(screen.getByRole("button", { name: "Stay in Rome: Hotel Artemide, 2 nights open" })).toBeInTheDocument();
  });

  it("No bed yet opens it ready to add one, keeping the dashed coral chip", async () => {
    const onOpenStay = vi.fn();
    renderRow({ onOpenStay, stay: { ...COVERED, kind: "none", name: null, coveredNights: 0 } });
    const chip = screen.getByRole("button", { name: "No bed yet in Rome — add a stay" });
    expect(chip).toHaveAttribute("data-chip");
    expect(chip.className).toMatch(/border-dashed/);
    expect(chip.className).toContain("bg-coral/20");
    await userEvent.click(chip);
    expect(onOpenStay).toHaveBeenCalledTimes(1);
  });

  it("without onOpenStay it stays a plain chip", () => {
    renderRow();
    expect(screen.queryByRole("button", { name: /^Stay in Rome/ })).toBeNull();
    expect(screen.getByText("Hotel Artemide").closest("[data-chip]")!.tagName).toBe("SPAN");
  });
});

describe("nights stepper (spec 2026-10-06 §N)", () => {
  it("a scheduled Stop steps its nights without folding the row", async () => {
    const onSetNights = vi.fn();
    const { props } = renderRow({ onSetNights });
    await userEvent.click(screen.getByRole("button", { name: "Increase Nights in Rome" }));
    expect(onSetNights).toHaveBeenCalledWith(8);
    expect(props.onToggle).not.toHaveBeenCalled();
  });
  it("a rough Stop steps its rough nights", async () => {
    const onSetNights = vi.fn();
    renderRow({ stop: ROUGH, onSetNights });
    await userEvent.click(screen.getByRole("button", { name: "Decrease Nights in Munich" }));
    expect(onSetNights).toHaveBeenCalledWith(4);
  });
  it("a Pinned Stop is not disabled — changing its own nights is the Traveller's choice", () => {
    renderRow({ stop: { ...DATED, pinned: true }, onSetNights: vi.fn() });
    expect(screen.getByRole("button", { name: "Increase Nights in Rome" })).not.toBeDisabled();
  });
  it("clicking the number doesn't fold the row", async () => {
    const { props } = renderRow({ onSetNights: vi.fn() });
    await userEvent.click(screen.getByRole("group", { name: "Nights in Rome" }));
    expect(props.onToggle).not.toHaveBeenCalled();
  });
});
