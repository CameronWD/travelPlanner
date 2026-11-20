import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DayMapModel } from "@/lib/day-map";
import { setMatchMedia } from "@/test/setup";

vi.mock("@/components/trip/day-map", () => ({
  DayMap: ({ highlightId, fill }: { highlightId?: string; fill?: boolean }) => (
    <div data-testid="day-map" data-highlight={highlightId ?? ""} data-fill={String(!!fill)} />
  ),
}));

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

const { DayMapButton, DayMapDialog } = await import("./day-map-dialog");
const { DayCarouselContext, DayPanelContext } = await import("./day-carousel");

const model: DayMapModel = {
  points: [
    { kind: "item", id: "i1", lat: 1, lng: 2, label: "Castle", order: 1 },
    { kind: "item", id: "i2", lat: 1.1, lng: 2.1, label: "Pastel de nata", order: 2 },
    { kind: "accommodation", id: "a1", lat: 1.2, lng: 2.2, label: "Hotel" },
  ],
  routePoints: [],
  perItemPrev: {},
};
const empty: DayMapModel = { points: [], routePoints: [], perItemPrev: {} };

const wide = (q: string) => q === "(min-width: 1024px)" || q === "(min-width: 768px)";

afterEach(() => {
  nav.pathname = "/";
  window.history.replaceState(null, "", "/");
  setMatchMedia((q) => q === "(min-width: 640px)");
});

describe("DayMapButton", () => {
  it("renders nothing when the day has no located entry", () => {
    setMatchMedia(wide);
    const { container } = render(<DayMapButton tripId="t1" model={empty} size="desktop" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("opens the Day map over the page when pressed, with the day's places listed in order", async () => {
    setMatchMedia(wide);
    render(<DayMapButton tripId="t1" model={model} size="desktop" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Day map" }));
    expect(await screen.findByRole("dialog", { name: "Day map" })).toBeInTheDocument();
    expect(await screen.findByTestId("day-map")).toHaveAttribute("data-fill", "true");
    const names = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(names).toEqual(["1Castle", "2Pastel de nata", "Hotel"]);
  });

  it("pads the places list so the first row's focus ring is not clipped", async () => {
    setMatchMedia(wide);
    render(<DayMapButton tripId="t1" model={model} size="desktop" />);
    await userEvent.click(screen.getByRole("button", { name: "Day map" }));
    expect(await screen.findByRole("list", { name: "Today’s places" })).toHaveClass("p-1.5");
  });

  it("clicking a place in the list highlights its pin", async () => {
    setMatchMedia(wide);
    render(<DayMapButton tripId="t1" model={model} size="desktop" />);
    await userEvent.click(screen.getByRole("button", { name: "Day map" }));
    await userEvent.click(await screen.findByRole("button", { name: /Pastel de nata/ }));
    expect(await screen.findByTestId("day-map")).toHaveAttribute("data-highlight", "i2");
  });

  it("opens on load when the URL has ?map=1, and closing removes the param without navigating", async () => {
    setMatchMedia(wide);
    window.history.replaceState(null, "", "/trips/t/day/2026-01-05?map=1&x=2");
    render(<DayMapButton tripId="t1" model={model} size="desktop" />);
    expect(await screen.findByRole("dialog", { name: "Day map" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.search).toBe("?x=2");
  });

  it("only the card that matches the viewport mounts the dialog", () => {
    setMatchMedia(wide);
    window.history.replaceState(null, "", "/?map=1");
    render(<DayMapButton tripId="t1" model={model} size="phone" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays closed when the screen turns after the Traveller closed it", async () => {
    setMatchMedia(false);
    window.history.replaceState(null, "", "/?map=1");
    const phone = render(<DayMapButton tripId="t1" model={model} size="phone" />);
    const desktop = render(<DayMapButton tripId="t1" model={model} size="desktop" />);
    await screen.findByRole("dialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    setMatchMedia(wide);
    phone.rerender(<DayMapButton tripId="t1" model={model} size="phone" />);
    desktop.rerender(<DayMapButton tripId="t1" model={model} size="desktop" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("on a phone the dialog shows the route links under the map and no place list", async () => {
    setMatchMedia(false);
    window.history.replaceState(null, "", "/?map=1");
    render(<DayMapButton tripId="t1" model={{ ...model, routePoints: model.points.slice(0, 2) }} size="phone" />);
    await screen.findByRole("dialog");
    expect(screen.getByRole("list", { hidden: true }).className.split(" ")).toEqual(expect.arrayContaining(["hidden", "lg:flex"]));
    expect(screen.getByTestId("day-map")).toHaveAttribute("data-fill", "true");
  });

  it("on a phone the dialog is the full-screen frame", async () => {
    setMatchMedia(false);
    window.history.replaceState(null, "", "/?map=1");
    render(<DayMapButton tripId="t1" model={model} size="phone" />);
    expect((await screen.findByRole("dialog")).className).toMatch(/max-sm:h-\[100dvh\]/);
  });
});

describe("DayMapButton in the carousel", () => {
  const harbour: DayMapModel = { ...model, points: [{ kind: "item", id: "h1", lat: 3, lng: 4, label: "Harbour", order: 1 }] };
  function inCarousel(current: () => string, subscribeDay: (cb: (iso: string) => void) => () => void) {
    const api = { goTo: () => true, step: () => true, current, subscribeDay, subscribe: () => () => {}, isMoving: () => false };
    return (
      <DayCarouselContext.Provider value={api}>
        <DayPanelContext.Provider value="2026-12-12">
          <DayMapButton tripId="t1" model={model} size="desktop" shown />
        </DayPanelContext.Provider>
        <DayPanelContext.Provider value="2026-12-13">
          <DayMapButton tripId="t1" model={harbour} size="desktop" shown={false} />
        </DayPanelContext.Provider>
      </DayCarouselContext.Provider>
    );
  }

  it("only the day in view mounts the dialog, whatever the page's own date says, and it follows the day in view", async () => {
    setMatchMedia(wide);
    window.history.replaceState(null, "", "/?map=1");
    let inView = "2026-12-13";
    const heard = new Set<(iso: string) => void>();
    const tell = (iso: string) => heard.forEach((cb) => cb(iso));
    render(inCarousel(() => inView, (cb) => { heard.add(cb); return () => heard.delete(cb); }));
    expect(await screen.findAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByText("Harbour")).toBeInTheDocument();
    expect(screen.queryByText("Castle")).toBeNull();
    act(() => {
      inView = "2026-12-12";
      tell(inView);
    });
    expect(await screen.findByText("Castle")).toBeInTheDocument();
    expect(screen.queryByText("Harbour")).toBeNull();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});

describe("DayMapButton between a swipe's settle and its landing", () => {
  it("opens for the day on screen without touching the address, which would undo the navigation in flight, and writes ?map=1 once it lands", async () => {
    setMatchMedia(wide);
    nav.pathname = "/trips/t1/day/2026-12-12";
    window.history.replaceState(null, "", nav.pathname);
    const replace = vi.spyOn(window.history, "replaceState");
    const api = { goTo: () => true, step: () => true, current: () => "2026-12-13", subscribeDay: () => () => {}, subscribe: () => () => {}, isMoving: () => false };
    const tree = () => (
      <DayCarouselContext.Provider value={api}>
        <DayPanelContext.Provider value="2026-12-13">
          <DayMapButton tripId="t1" model={model} size="desktop" shown={false} />
        </DayPanelContext.Provider>
      </DayCarouselContext.Provider>
    );
    const { rerender } = render(tree());
    await userEvent.click(screen.getByRole("button", { name: "Day map" }));
    expect(await screen.findByRole("dialog", { name: "Day map" })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    nav.pathname = "/trips/t1/day/2026-12-13";
    window.history.pushState(null, "", nav.pathname);
    rerender(tree());
    await waitFor(() => expect(window.location.search).toBe("?map=1"));
    expect(screen.getByRole("dialog", { name: "Day map" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.search).toBe("");
    replace.mockRestore();
  });
});

describe("DayMapDialog", () => {
  it("shows no list item for anything the map was not given (a hidden Surprise never reaches it)", async () => {
    setMatchMedia(wide);
    render(<DayMapDialog open onOpenChange={() => {}} tripId="t1" model={{ ...model, points: model.points.slice(0, 1) }} />);
    expect(await screen.findAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText("Pastel de nata")).toBeNull();
  });
});
