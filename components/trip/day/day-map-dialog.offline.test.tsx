import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { setMatchMedia } from "@/test/setup";

vi.mock("@/components/trip/day-map", () => {
  throw new Error("ChunkLoadError");
});

const { DayMapDialog } = await import("./day-map-dialog");

describe("DayMapDialog offline", () => {
  it("fails soft with the map-unavailable message when the map bundle cannot load", async () => {
    setMatchMedia(true);
    const model = { points: [{ kind: "item" as const, id: "i1", lat: 1, lng: 2, label: "Castle", order: 1 }], routePoints: [], perItemPrev: {} };
    render(<DayMapDialog open onOpenChange={() => {}} tripId="t1" model={model} />);
    expect(await screen.findByText("The map isn’t available right now.")).toBeInTheDocument();
  });
});
