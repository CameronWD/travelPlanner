import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DayMapModel } from "@/lib/day-map";
import { setMatchMedia } from "@/test/setup";

vi.mock("@/components/trip/day-map", () => ({
  DayMap: ({ highlightId, fill }: { highlightId?: string; fill?: boolean }) => (
    <div data-testid="day-map" data-highlight={highlightId ?? ""} data-fill={String(!!fill)} />
  ),
}));

const usage = vi.hoisted(() => ({ recordUsageAction: vi.fn() }));
vi.mock("@/lib/usage/client", () => usage);

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
  routePoints: [
    { kind: "item", id: "i1", lat: 1, lng: 2, label: "Castle", order: 1 },
    { kind: "item", id: "i2", lat: 1.1, lng: 2.1, label: "Pastel de nata", order: 2 },
  ],
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

  it("the route buttons sit in the places column", async () => {
    setMatchMedia(wide);
    render(<DayMapButton tripId="t1" model={model} size="desktop" />);
    await userEvent.click(screen.getByRole("button", { name: "Day map" }));
    const column = (await screen.findByTestId("places-column"));
    expect(within(column).getByRole("link", { name: "Google Maps" })).toBeInTheDocument();
  });

  it("records one Day map opening per tap, and none when ?map=1 opens it", async () => {
    setMatchMedia(wide);
    usage.recordUsageAction.mockClear();
    window.history.replaceState(null, "", "/?map=1");
    const { unmount } = render(<DayMapButton tripId="t1" model={model} size="desktop" />);
    expect(await screen.findByRole("dialog", { name: "Day map" })).toBeInTheDocument();
    expect(usage.recordUsageAction).not.toHaveBeenCalled();
    unmount();
    window.history.replaceState(null, "", "/");
    render(<DayMapButton tripId="t1" model={model} size="desktop" />);
    await userEvent.click(screen.getByRole("button", { name: "Day map" }));
    expect(usage.recordUsageAction.mock.calls).toEqual([["day-map-opened"]]);
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

  it("on a phone the dialog shows the route buttons under the map and no place list", async () => {
    setMatchMedia(false);
    window.history.replaceState(null, "", "/?map=1");
    render(<DayMapButton tripId="t1" model={{ ...model, routePoints: model.points.slice(0, 2) }} size="phone" />);
    await screen.findByRole("dialog");
    expect(screen.getByTestId("places-column").className.split(" ")).toEqual(expect.arrayContaining(["hidden", "lg:flex"]));
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
  const harbourPin = { kind: "item" as const, id: "h1", lat: 3, lng: 4, label: "Harbour", order: 1 };
  const harbour: DayMapModel = { ...model, points: [harbourPin], routePoints: [harbourPin] };
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
  it("the places list starts with the start Accommodation and shows the time between rows", async () => {
    setMatchMedia(wide);
    const navona = { kind: "accommodation" as const, id: "navona", lat: 1, lng: 2, label: "The Club Navona" };
    const pantheon = { kind: "item" as const, id: "pantheon", lat: 1.1, lng: 2.1, label: "Pantheon", order: 1 };
    const trevi = { kind: "item" as const, id: "trevi", lat: 1.2, lng: 2.2, label: "Trevi Fountain", order: 2 };
    const tonight = { kind: "accommodation" as const, id: "tonight", lat: 1.3, lng: 2.3, label: "Casa Tonight" };
    const dep = { kind: "transport-dep" as const, id: "t1", lat: 1.4, lng: 2.4, label: "Termini" };
    const arr = { kind: "transport-arr" as const, id: "t1", lat: 1.5, lng: 2.5, label: "Fiumicino" };
    const day: DayMapModel = {
      points: [pantheon, trevi, navona, tonight, dep, arr],
      routePoints: [navona, pantheon, trevi],
      perItemPrev: {},
      hops: [
        { fromId: "navona", toId: "pantheon", polyline: null, estimated: false, minutes: 6, mode: "walk" },
        { fromId: "pantheon", toId: "trevi", polyline: null, estimated: false, minutes: null, mode: null },
      ],
    };
    render(<DayMapDialog open onOpenChange={() => {}} tripId="t1" model={day} />);
    const rows = await screen.findAllByRole("listitem");
    expect(rows.map((li) => within(li).getByRole("button").textContent)).toEqual([
      "The Club Navona", "1Pantheon", "2Trevi Fountain", "Casa Tonight", "Termini", "Fiumicino",
    ]);
    expect(rows[1]).toHaveTextContent("6 min walk");
    expect(rows[0]).not.toHaveTextContent("min");
    expect(rows[2]).not.toHaveTextContent("min");
    expect(rows[3]).not.toHaveTextContent("min");
  });

  it("shows no list item for anything the map was not given (a hidden Surprise never reaches it)", async () => {
    setMatchMedia(wide);
    render(<DayMapDialog open onOpenChange={() => {}} tripId="t1" model={{ ...model, points: model.points.slice(0, 1), routePoints: model.routePoints.slice(0, 1) }} />);
    expect(await screen.findAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText("Pastel de nata")).toBeNull();
  });
});
