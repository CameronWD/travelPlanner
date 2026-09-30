import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { PlanBody, useRegisterPlanActions, type PlanActions } from "./plan-body";
import { PlanAddStopButton, PlanFitStrip, PlanHeaderActions, PlanMobileExtras } from "./plan-header-actions";
import { summarizePlan } from "@/lib/plan-overview";
import { TAB_BAR_MENU_COLLISION_PADDING } from "@/components/ui/tab-bar";

vi.mock("@/components/trip/ai-booking-parser", () => ({ AiBookingParser: () => <div>parser</div> }));
vi.mock("@/components/trip/make-it-fit", () => ({ MakeItFit: () => null }));
vi.mock("@/server/actions/trips", () => ({ setTripHardEndDate: vi.fn() }));
vi.mock("@/components/plan/plan-mini-map", () => ({
  PlanMapDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="map-dialog" /> : null),
}));

// Radix hands collisionPadding to its popper, never to the DOM, so record the
// props the real DropdownMenuContent receives. Rendering is passed through.
const menuCapture = vi.hoisted(() => ({ contents: [] as Array<Record<string, unknown>> }));
vi.mock("@/components/ui/dropdown-menu", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/dropdown-menu")>();
  const { forwardRef, createElement } = await import("react");
  const Recorded = forwardRef<HTMLDivElement, React.ComponentProps<typeof actual.DropdownMenuContent>>((props, ref) => {
    menuCapture.contents.push(props as Record<string, unknown>);
    return createElement(actual.DropdownMenuContent, { ...props, ref });
  });
  return { ...actual, DropdownMenuContent: Recorded };
});

function Registrar({ actions }: { actions: Partial<PlanActions> }) {
  useRegisterPlanActions(actions);
  return null;
}

function setup(ui: React.ReactElement) {
  const actions = { addStop: vi.fn(), newChapter: vi.fn(), suggestChapters: vi.fn() };
  const utils = render(
    <PlanBody initialOpen={[]} today="2030-01-01">
      <Registrar actions={actions} />
      {ui}
    </PlanBody>,
  );
  return { actions, ...utils };
}

describe("PlanHeaderActions", () => {
  it("orders Chapters, Paste a booking, Add a stop", () => {
    setup(<PlanHeaderActions tripId="t1" chaptersEnabled aiConfigured />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Chapters", "Paste a booking", "Add a stop"]);
  });

  it("Add a stop is the ink primary and calls addStop", async () => {
    const { actions } = setup(<PlanHeaderActions tripId="t1" chaptersEnabled aiConfigured />);
    const add = screen.getByRole("button", { name: "Add a stop" });
    expect(add.className).toContain("shadow-cta");
    await userEvent.click(add);
    expect(actions.addStop).toHaveBeenCalledTimes(1);
  });

  it("Paste a booking opens the parser in a dialog", async () => {
    setup(<PlanHeaderActions tripId="t1" chaptersEnabled aiConfigured />);
    await userEvent.click(screen.getByRole("button", { name: "Paste a booking" }));
    const dialog = await screen.findByRole("dialog", { name: "Paste a booking" });
    expect(dialog).toHaveTextContent("parser");
  });

  it("no Paste a booking without AI", () => {
    setup(<PlanHeaderActions tripId="t1" chaptersEnabled aiConfigured={false} />);
    expect(screen.queryByRole("button", { name: "Paste a booking" })).toBeNull();
  });

  it("Chapters offers exactly New chapter and Suggest from countries, and calls them", async () => {
    const user = userEvent.setup();
    const { actions } = setup(<PlanHeaderActions tripId="t1" chaptersEnabled aiConfigured={false} />);
    await user.click(screen.getByRole("button", { name: "Chapters" }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["New Chapter", "Suggest from countries"]);
    expect(screen.queryByText("Turn off chapters")).toBeNull();
    expect(screen.queryByText("Group into chapters…")).toBeNull();
    await user.click(screen.getByRole("menuitem", { name: "New Chapter" }));
    expect(actions.newChapter).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Chapters" }));
    await user.click(await screen.findByRole("menuitem", { name: "Suggest from countries" }));
    expect(actions.suggestChapters).toHaveBeenCalledTimes(1);
  });

  it("keeps the open Chapters menu clear of the fixed mobile tab bar", async () => {
    setup(<PlanHeaderActions tripId="t1" chaptersEnabled aiConfigured={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Chapters" }));
    await screen.findByRole("menu");
    expect(menuCapture.contents.at(-1)!.collisionPadding).toEqual(TAB_BAR_MENU_COLLISION_PADDING);
  });

  it("no Chapters button at all when chapters are off", () => {
    setup(<PlanHeaderActions tripId="t1" chaptersEnabled={false} aiConfigured />);
    expect(screen.queryByRole("button", { name: /chapters/i })).toBeNull();
  });

  it("has no soft shadows, translucent cards or 70% borders", () => {
    const { container } = setup(<PlanHeaderActions tripId="t1" chaptersEnabled aiConfigured />);
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});

describe("PlanMobileExtras", () => {
  it("is lg:hidden and holds Chapters and Paste a booking", () => {
    const { container } = setup(<PlanMobileExtras tripId="t1" chaptersEnabled aiConfigured />);
    expect((container.firstElementChild as HTMLElement).className).toContain("lg:hidden");
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Chapters", "Paste a booking"]);
  });

  it("no Chapters button when chapters are off", () => {
    setup(<PlanMobileExtras tripId="t1" chaptersEnabled={false} aiConfigured />);
    expect(screen.queryByRole("button", { name: /chapters/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Paste a booking" })).toBeInTheDocument();
  });

  it("renders nothing when neither applies", () => {
    const { container } = setup(<PlanMobileExtras tripId="t1" chaptersEnabled={false} aiConfigured={false} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("PlanAddStopButton", () => {
  it("round: a 44px round button named Add a stop that calls addStop", async () => {
    const { actions } = setup(<PlanAddStopButton variant="round" />);
    const btn = screen.getByRole("button", { name: "Add a stop" });
    expect(btn.className).toContain("size-11");
    expect(btn.className).toContain("rounded-full");
    await userEvent.click(btn);
    expect(actions.addStop).toHaveBeenCalledTimes(1);
  });

  it("has no soft shadows, translucent cards or 70% borders", () => {
    const { container } = setup(<PlanAddStopButton variant="round" />);
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
});

describe("PlanFitStrip", () => {
  const summary = summarizePlan({
    stops: [
      { id: "a", arriveDate: "2026-12-10", departDate: "2026-12-13", nights: null, pinned: false, sortOrder: 0 },
      { id: "b", arriveDate: "2026-12-13", departDate: "2026-12-16", nights: null, pinned: false, sortOrder: 1 },
    ],
    startDate: "2026-12-10",
    hardEndDate: null,
  });
  const mapStop = (id: string, sortOrder: number) => ({ id, name: id, lat: 1, lng: sortOrder, arriveDate: "2026-12-10", departDate: "2026-12-13", sortOrder });

  it("the Map button opens the full route map with two or more stops", async () => {
    setup(<PlanFitStrip summary={summary} stops={[mapStop("a", 0), mapStop("b", 1)]} home={null} />);
    expect(screen.queryByTestId("map-dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /map/i }));
    expect(screen.getByTestId("map-dialog")).toBeInTheDocument();
  });

  it("offers no Map button with fewer than two stops", () => {
    setup(<PlanFitStrip summary={summary} stops={[mapStop("a", 0)]} home={null} />);
    expect(screen.queryByRole("button", { name: /map/i })).toBeNull();
  });
});
