import type { ComponentProps } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setMatchMedia } from "@/test/setup";
import type { RouteMapStop } from "@/components/trip/route-map";
import { PlanMiniMap } from "./plan-mini-map";
import { PlanBody } from "./plan-body";

vi.mock("@/components/trip/route-map-loader", () => ({
  RouteMapLoader: (p: { onStopClick?: (id: string) => void; home: unknown }) => (
    <button data-testid="map" data-home={String(!!p.home)} onClick={() => p.onStopClick?.("s1")}>
      map
    </button>
  ),
}));

const STOPS: RouteMapStop[] = [
  { id: "s1", name: "Tokyo", lat: 35.68, lng: 139.76, arriveDate: "2026-01-01", departDate: "2026-01-04", sortOrder: 0 },
  { id: "s2", name: "Kyoto", lat: 35.01, lng: 135.77, arriveDate: "2026-01-04", departDate: "2026-01-07", sortOrder: 1 },
];

const HOME = { name: "Sydney", lat: -33.87, lng: 151.21 };

function renderMiniMap(overrides: Partial<ComponentProps<typeof PlanMiniMap>> = {}) {
  return render(
    <PlanBody initialOpen={[]} today="2030-01-01">
      <PlanMiniMap stops={STOPS} home={HOME} farHome={null} {...overrides} />
    </PlanBody>,
  );
}

describe("PlanMiniMap", () => {
  it("renders nothing with fewer than two located stops", () => {
    const { container } = renderMiniMap({ stops: [STOPS[0]] });
    expect(container).toBeEmptyDOMElement();
  });

  it("the tile is 210px tall with a 22px radius", () => {
    const { container } = renderMiniMap();
    const tile = container.querySelector("div.relative")!;
    expect(tile.className).toMatch(/h-\[210px\]/);
    expect(tile.className).toMatch(/rounded-\[22px\]/);
  });

  it('"Open map" opens the Route map dialog', async () => {
    const user = userEvent.setup();
    renderMiniMap();
    await user.click(screen.getByRole("button", { name: /Open map/ }));
    expect(screen.getByRole("dialog", { name: "Route map" })).toBeInTheDocument();
  });

  it("shows a quiet + <home> pill and excludes a far home from the tile map's fit", () => {
    renderMiniMap({ farHome: { name: "Sydney" } });
    expect(screen.getByText(/\+ Sydney/)).toBeInTheDocument();
    expect(screen.getByTestId("map")).toHaveAttribute("data-home", "false");
  });

  it("a pin click on the tile jumps to and rings that Stop", async () => {
    setMatchMedia(() => true);
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    const target = document.createElement("div");
    target.id = "stop-s1";
    document.body.appendChild(target);

    const user = userEvent.setup();
    renderMiniMap();
    await user.click(screen.getByTestId("map"));

    expect(target.getAttribute("data-highlight")).toBe("true");
    document.body.removeChild(target);
  });

  it("has no soft shadows, translucent cards or 70% borders", () => {
    const { container } = renderMiniMap();
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });
  it("isolates the tile's stacking context so the Open map button stays under dialogs (spec 2026-10-01 §C)", () => {
    const { container } = renderMiniMap();
    const tile = container.querySelector("div.relative")!;
    expect(tile.className).toMatch(/(^|\s)isolate(\s|$)/);
  });
});
