import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { scrollToId } = vi.hoisted(() => ({ scrollToId: vi.fn() }));
vi.mock("@/lib/scroll-to", () => ({ scrollToId }));

vi.mock("./viewer-time", () => ({ ViewerArrival: ({ instant }: { instant: string }) => <i data-testid="viewer-arrival">{instant}</i> }));

import { DayByDay, type DayByDayStop } from "./day-by-day";
import { MotionProvider } from "@/components/ui/motion-provider";

const row = (title: string) => ({ key: title, time: "10:00", title, sub: null, kind: "item" as const, category: "SIGHTSEEING", mode: null, done: false });
const stops: DayByDayStop[] = [
  { id: "lon", name: "London", summary: "Ritz +1 · 3 plans", number: 1, sortOrder: 0, arriveDate: "2026-12-05", departDate: "2026-12-10", nights: 5, status: "past",
    days: [{ dateISO: "2026-12-05", isToday: false, title: null, rows: [row("Borough Market")] }],
    legAfter: { mode: "TRAIN", label: "Train to Paris", when: "Thu 10 Dec · St Pancras 09:31 → Gare du Nord 12:47", number: null, arrivesAt: "2026-12-10T11:47:00.000Z", arrivesLocal: "2026-12-10 12:47" } },
  { id: "par", name: "Paris", summary: null, number: 2, sortOrder: 1, arriveDate: "2026-12-10", departDate: "2026-12-15", nights: 5, status: "current",
    days: [
      { dateISO: "2026-12-11", isToday: false, title: null, rows: [row("Louvre")] },
      { dateISO: "2026-12-12", isToday: true, title: "Versailles day", rows: [row("Palace + gardens")] },
    ],
    legAfter: null },
];

describe("DayByDay (SHARE.md §7)", () => {
  beforeEach(() => scrollToId.mockClear());

  it("draws a leg as the Plan's card on the connector line, with the sun marker, and adds nothing without Home legs", () => {
    const { container } = render(<DayByDay stops={stops} initialOpenId="par" />);
    const rows = container.querySelectorAll("[data-share-leg]");
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector("[data-connector]")).not.toBeNull();
    expect(rows[0].querySelector("[data-station-dot]")!.className).toContain("bg-sun");
    const card = rows[0].querySelector("[data-travel-row]") as HTMLElement;
    expect(card.tagName).toBe("DIV");
    expect(card).toHaveTextContent("Train to Paris");
    expect(card).toHaveTextContent("St Pancras 09:31 → Gare du Nord 12:47");
  });

  it("lets the last Stop touch a Home-back leg, and gap it otherwise", () => {
    const back = { mode: "FLIGHT" as const, label: "Flight home", when: "x", number: null, arrivesAt: null, arrivesLocal: null };
    const withBack = render(<DayByDay stops={stops} initialOpenId="par" homeBack={back} />);
    expect(withBack.container.querySelector("[data-share-stop='par']")!.className).not.toMatch(/mb-3/);
    withBack.unmount();
    const without = render(<DayByDay stops={stops} initialOpenId="par" />);
    expect(without.container.querySelector("[data-share-stop='par']")!.className).not.toMatch(/mb-3/);
  });

  it("gives a Stop its gap only when no leg follows it and it is not last", () => {
    const { container } = render(<DayByDay stops={[{ ...stops[0], legAfter: null }, stops[1]]} initialOpenId="par" />);
    expect(container.querySelector("[data-share-stop='lon']")!.className).toMatch(/mb-3/);
  });

  it("adds the viewer's arrival only to a leg that has an arrival time", () => {
    const homeOut = { mode: "FLIGHT" as const, label: "Flight to London", when: "Fri 4 Dec", number: null, arrivesAt: null, arrivesLocal: null };
    render(<DayByDay stops={stops} initialOpenId="par" homeOut={homeOut} />);
    expect(screen.getAllByTestId("viewer-arrival")).toHaveLength(1);
  });

  it("lists the Home legs above the first Stop and below the last", () => {
    const homeOut = { mode: "FLIGHT" as const, label: "Flight to London", when: "Fri 4 Dec · QF 1", number: null, arrivesAt: null, arrivesLocal: null };
    const homeBack = { mode: "FLIGHT" as const, label: "Flight home", when: "Tue 15 Dec · QF 2", number: null, arrivesAt: null, arrivesLocal: null };
    const { container } = render(<DayByDay stops={stops} initialOpenId="par" homeOut={homeOut} homeBack={homeBack} />);
    const rows = Array.from(container.querySelectorAll("[data-share-leg]"));
    expect(rows).toHaveLength(3);
    const first = container.querySelector("[data-share-stop='lon']") as HTMLElement;
    const last = container.querySelector("[data-share-stop='par']") as HTMLElement;
    expect(rows[0]).toHaveTextContent("Flight to London");
    expect(rows[0].compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rows[2]).toHaveTextContent("Flight home");
    expect(rows[2].compareDocumentPosition(last) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("opens the initial stop with its head band and day rows; others are folded", () => {
    render(<DayByDay stops={stops} initialOpenId="par" />);
    expect(screen.getByRole("heading", { name: "The route" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Day by day" })).not.toBeInTheDocument();
    expect(screen.getAllByTestId("share-day")).toHaveLength(2);
    expect(screen.getByText("Versailles day")).toBeInTheDocument();
    expect(screen.queryByText("Borough Market")).not.toBeInTheDocument();
  });

  it("a closed card shows its number in the Stop's colour, summary, dates and nights chip", () => {
    const { container } = render(<DayByDay stops={[{ ...stops[0], status: "future" }, stops[1]]} initialOpenId="par" />);
    const folded = container.querySelector("[data-stop-folded='lon']") as HTMLElement;
    const marker = within(folded).getByText("1");
    expect(marker.className).toMatch(/rounded-full/);
    expect(marker.className).toMatch(/size-7/);
    expect(marker.className).toMatch(/bg-hue-/);
    expect(within(folded).getByText("Ritz +1 · 3 plans")).toBeInTheDocument();
    expect(within(folded).getByText("5n").className).toMatch(/bg-hue-/);
    expect(within(folded).getAllByText(/5–10 Dec/).length).toBeGreaterThan(0);
  });

  it("a closed card with no summary draws no summary line", () => {
    const { container } = render(<DayByDay stops={[stops[0], { ...stops[1], status: "future" }]} initialOpenId="lon" />);
    const folded = container.querySelector("[data-stop-folded='par']") as HTMLElement;
    expect(folded.querySelector("[data-stop-summary]")).toBeNull();
  });

  it("a folded Stop's name wraps at words only, never mid-word, and keeps its nights chip", () => {
    const long = "Santa Maria della Salute";
    const { container } = render(<DayByDay stops={[{ ...stops[0], name: long, status: "future" }, stops[1]]} initialOpenId="par" />);
    const folded = container.querySelector("[data-stop-folded='lon']") as HTMLElement;
    const name = within(folded).getByText(long);
    const tokens = name.className.split(/\s+/);
    for (const banned of ["truncate", "break-words", "break-all", "[overflow-wrap:anywhere]"]) expect(tokens).not.toContain(banned);
    expect(tokens).toContain("min-w-0");
    expect(within(folded).getByText("5n")).toBeInTheDocument();
  });

  it("a folded Stop stacks on a phone: the summary may wrap, and the dates and chip share one row", () => {
    const { container } = render(<DayByDay stops={[{ ...stops[0], status: "future" }, stops[1]]} initialOpenId="par" />);
    const folded = container.querySelector("[data-stop-folded='lon']") as HTMLElement;
    const summary = within(folded).getByText("Ritz +1 · 3 plans");
    expect(summary.className.split(/\s+/)).not.toContain("truncate");
    const dates = within(folded).getByText(/5–10 Dec/);
    expect(dates.parentElement).toBe(within(folded).getByText("5n").parentElement);
    expect(folded.className).toMatch(/\bgrid\b/);
    expect(folded.className).toMatch(/sm:flex/);
  });

  it("an open Stop's name wraps on a phone with its dates on a muted line under it", () => {
    const long = "A".repeat(40);
    const { container } = render(<DayByDay stops={[{ ...stops[0], name: long }, stops[1]]} initialOpenId="lon" />);
    const open = container.querySelector("[data-stop-open='lon']") as HTMLElement;
    const name = within(open).getByRole("heading", { name: long });
    expect(name.className).toMatch(/break-words/);
    expect(name.className).not.toMatch(/truncate/);
    const dates = within(open).getByText(/5 Dec.*–.*10 Dec/);
    expect(dates.className).not.toMatch(/hidden/);
    expect(dates.className).toMatch(/text-muted-foreground/);
  });

  it("an open card carries the Stop's country on its sub-line", () => {
    const { container } = render(<DayByDay stops={[{ ...stops[0], country: "England" }, stops[1]]} initialOpenId="lon" />);
    expect(within(container.querySelector("[data-stop-open='lon']") as HTMLElement).getByText(/5 Dec.*10 Dec.*5 nights · England/)).toBeInTheDocument();
  });

  it("the Stop index lets a long name wrap and keeps its dates on one line", () => {
    render(<DayByDay stops={[{ ...stops[0], name: "Rovaniemi (Lapland) and the Arctic Circle" }, stops[1]]} initialOpenId="par" />);
    const button = within(screen.getByRole("navigation", { name: "Stops" })).getByRole("button", { name: /Rovaniemi/ });
    const name = within(button).getByText("Rovaniemi (Lapland) and the Arctic Circle");
    expect(name.className.split(/\s+/)).not.toContain("truncate");
    expect(name.className).not.toMatch(/whitespace-nowrap/);
    expect(within(button).getByText(/5–10 Dec/).className).toMatch(/whitespace-nowrap/);
    expect(button.className).toMatch(/min-h-10/);
    expect(button.className).not.toMatch(/(^|\s)h-10/);
  });

  it("marks today with aria-current, a TODAY pill and a sun tint", () => {
    render(<DayByDay stops={stops} initialOpenId="par" />);
    const today = screen.getAllByTestId("share-day").find((d) => d.getAttribute("aria-current") === "date")!;
    expect(within(today).getByText("Today")).toBeInTheDocument();
    expect(today.className).toMatch(/bg-sun\/15/);
  });

  it("past folded stops are dashed and say Done", () => {
    const { container } = render(<DayByDay stops={stops} initialOpenId="par" />);
    const folded = container.querySelector("[data-stop-folded='lon']")!;
    expect(folded.className).toMatch(/border-dashed/);
    expect(within(folded as HTMLElement).getByText("Done")).toBeInTheDocument();
  });

  it("Show opens a folded Stop and leaves the open one open; Hide closes only its own", async () => {
    render(<DayByDay stops={stops} initialOpenId="par" />, { wrapper: MotionProvider });
    await userEvent.click(within(screen.getByText("Ritz +1 · 3 plans").closest("[data-stop-folded]") as HTMLElement).getByRole("button", { name: "Show London" }));
    expect(screen.getByText("Borough Market")).toBeInTheDocument();
    expect(screen.getByText("Louvre")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide London" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Hide Paris" })).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(screen.getByRole("button", { name: "Hide London" }));
    // The closing card folds away (MOTION.md S7), inert while it goes.
    expect(screen.getByText("Borough Market").closest("[inert]")).not.toBeNull();
    await waitFor(() => expect(screen.queryByText("Borough Market")).not.toBeInTheDocument());
    expect(screen.getByText("Louvre")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show London" })).toHaveAttribute("aria-expanded", "false");
  });

  it("the picker and the index add their Stop to the open ones, leaving the rest as they were", async () => {
    const three: DayByDayStop[] = [...stops, { ...stops[1], id: "rom", name: "Rome", number: 3, sortOrder: 2, summary: null, days: [{ dateISO: "2026-12-16", isToday: false, title: null, rows: [row("Colosseum")] }], legAfter: null }];
    render(<DayByDay stops={three} initialOpenId="lon" />, { wrapper: MotionProvider });
    await userEvent.click(screen.getByRole("button", { name: "Show Paris" }));
    expect(screen.getByText("Borough Market")).toBeInTheDocument();
    expect(screen.getByText("Louvre")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Paris" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Rome" }));
    expect(scrollToId).toHaveBeenLastCalledWith("share-stop-rom", expect.anything());
    expect(screen.getByText("Colosseum")).toBeInTheDocument();
    expect(screen.getByText("Borough Market")).toBeInTheDocument();
    expect(screen.getByText("Louvre")).toBeInTheDocument();
    for (const n of ["London", "Paris", "Rome"]) expect(screen.getByRole("button", { name: `Hide ${n}` })).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(within(screen.getByRole("navigation", { name: "Stops" })).getByRole("button", { name: /London/ }));
    expect(scrollToId).toHaveBeenLastCalledWith("share-stop-lon", expect.anything());
    for (const n of ["London", "Paris", "Rome"]) expect(screen.getByRole("button", { name: `Hide ${n}` })).toHaveAttribute("aria-expanded", "true");
  });

  it("the stop index opens and scrolls to a stop", async () => {
    render(<DayByDay stops={stops} initialOpenId="par" />);
    const index = screen.getByRole("navigation", { name: "Stops" });
    await userEvent.click(within(index).getByRole("button", { name: /London/ }));
    expect(scrollToId).toHaveBeenCalledWith("share-stop-lon", expect.objectContaining({ reduced: expect.any(Boolean) }));
    expect(screen.getByText("Borough Market")).toBeInTheDocument();
  });

  it("the mobile picker names the latest open Stop and adds the one picked", async () => {
    render(<DayByDay stops={stops} initialOpenId="par" />);
    await userEvent.click(screen.getByRole("button", { name: "Paris" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "London" }));
    expect(scrollToId).toHaveBeenCalledWith("share-stop-lon", expect.objectContaining({ reduced: expect.any(Boolean) }));
    expect(screen.getByText("Borough Market")).toBeInTheDocument();
    expect(screen.getByText("Louvre")).toBeInTheDocument();
  });

  // The menu portals to <body>, outside the share page's light root, so it
  // must carry the light lock itself (final-review fix wave, item 3).
  it("the mobile picker's menu is locked light, like the page it portals out of", async () => {
    render(<DayByDay stops={stops} initialOpenId="par" />);
    await userEvent.click(screen.getByRole("button", { name: "Paris" }));
    const menu = await screen.findByRole("menu");
    expect(menu).toHaveAttribute("data-theme", "light");
    expect(menu).toHaveClass("light");
  });

  it("draws the leg line with no booking reference", () => {
    render(<DayByDay stops={stops} initialOpenId={null} />);
    expect(screen.getByText("Train to Paris")).toBeInTheDocument();
    expect(screen.getByText("Thu 10 Dec · St Pancras 09:31 → Gare du Nord 12:47")).toBeInTheDocument();
  });

  it("with nothing open (After), every stop is folded", () => {
    render(<DayByDay stops={stops} initialOpenId={null} />);
    expect(screen.queryAllByTestId("share-day")).toHaveLength(0);
  });

  it("gives every small control a tap-target", () => {
    render(<DayByDay stops={stops} initialOpenId="par" />);
    expect(screen.getByRole("button", { name: /hide/i }).className).toMatch(/tap-target/);
    expect(screen.getByRole("button", { name: /show/i }).className).toMatch(/tap-target/);
    const index = screen.getByRole("navigation", { name: "Stops" });
    for (const b of within(index).getAllByRole("button")) expect(b.className).toMatch(/tap-target/);
  });

  it("Hide folds the open stop", async () => {
    render(<DayByDay stops={stops} initialOpenId="par" />);
    await userEvent.click(screen.getByRole("button", { name: /hide/i }));
    await waitFor(() => expect(screen.queryAllByTestId("share-day")).toHaveLength(0));
  });

  it("the stop index has one highlight, on the active row, shared across rows (MOTION.md S8)", async () => {
    const { container } = render(<DayByDay stops={stops} initialOpenId="par" />);
    const index = screen.getByRole("navigation", { name: "Stops" });
    const highlight = () => container.querySelectorAll("[data-slot='stop-index-active']");
    expect(highlight()).toHaveLength(1);
    expect(highlight()[0].closest("button")).toBe(within(index).getByRole("button", { name: /Paris/ }));
    await userEvent.click(within(index).getByRole("button", { name: /London/ }));
    expect(highlight()).toHaveLength(1);
    expect(highlight()[0].closest("button")).toBe(within(index).getByRole("button", { name: /London/ }));
    for (const b of within(index).getAllByRole("button")) expect(b.className).not.toMatch(/bg-teal/);
  });

  it("Show and Hide carry a rotating chevron (MOTION.md S7)", () => {
    render(<DayByDay stops={stops} initialOpenId="par" />);
    expect(screen.getByRole("button", { name: /hide/i }).querySelector("[data-motion='chevron']")).not.toBeNull();
    const folded = screen.getByRole("button", { name: /show/i }).querySelector("[data-motion='chevron']") as HTMLElement;
    // Server-rendered at rest: nothing turns on page load.
    expect(folded.style.transform).not.toContain("180");
    const open = screen.getByRole("button", { name: /hide/i }).querySelector("[data-motion='chevron']") as HTMLElement;
    expect(open.style.transform).toContain("rotate(180deg)");
  });

  it("sizes a day's text column minmax(0,1fr) and breaks a long unbroken title (spec 2026-10-02 §A)", () => {
    const longName = "A".repeat(60);
    const longTitle = "B".repeat(60);
    const longStops: DayByDayStop[] = [
      {
        id: "s1",
        name: longName, summary: null,
        number: 1,
        sortOrder: 0,
        arriveDate: "2026-12-05",
        departDate: "2026-12-06",
        nights: 1,
        status: "current",
        days: [{ dateISO: "2026-12-05", isToday: false, title: longTitle, rows: [row("Something")] }],
        legAfter: null,
      },
    ];
    render(<DayByDay stops={longStops} initialOpenId="s1" />);
    const li = screen.getByTestId("share-day");
    expect(li.className).toMatch(/grid-cols-\[minmax\(0,1fr\)\]/);
    for (const child of Array.from(li.children)) expect(child.className).toMatch(/\bmin-w-0\b/);
    expect(screen.getByText(longTitle).className).toMatch(/\bbreak-words\b/);
  });

  describe("Home at both ends", () => {
    const homeOut = { mode: "FLIGHT" as const, label: "Flight to London", when: "Fri 4 Dec", number: null, arrivesAt: null, arrivesLocal: null };
    const homeBack = { mode: "FLIGHT" as const, label: "Flight home", when: "Tue 15 Dec", number: null, arrivesAt: null, arrivesLocal: null };
    const homes = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>("[data-share-home]"));

    it("puts a solid Home card above the outbound leg and another below the return leg", () => {
      const { container } = render(<DayByDay stops={stops} initialOpenId="par" homeOut={homeOut} homeBack={homeBack} homeName="Gold Coast" />);
      const [top, bottom] = homes(container);
      expect(homes(container)).toHaveLength(2);
      for (const card of [top, bottom]) {
        expect(card).toHaveTextContent("Gold Coast");
        expect(card).toHaveTextContent("Home");
        expect(card.querySelector("svg")).not.toBeNull();
        expect(card.className).not.toMatch(/border-dashed/);
        expect(card.className).toMatch(/rounded-\[18px\].*border-2 border-border bg-card px-4/);
        expect(card.querySelector("span.size-7")!.className).toMatch(/rounded-full border-2 border-border bg-background/);
        expect(card.querySelector("button")).toBeNull();
      }
      const legs = Array.from(container.querySelectorAll("[data-share-leg]"));
      expect(top.compareDocumentPosition(legs[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(bottom.compareDocumentPosition(legs[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeFalsy();
      expect(bottom.compareDocumentPosition(legs[2]) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    });

    it("draws no card without its leg, and none without a Home name", () => {
      const noLegs = render(<DayByDay stops={stops} initialOpenId="par" homeName="Gold Coast" />);
      expect(homes(noLegs.container)).toHaveLength(0);
      noLegs.unmount();
      const onlyOut = render(<DayByDay stops={stops} initialOpenId="par" homeOut={homeOut} homeName="Gold Coast" />);
      expect(homes(onlyOut.container)).toHaveLength(1);
      onlyOut.unmount();
      const noName = render(<DayByDay stops={stops} initialOpenId="par" homeOut={homeOut} homeBack={homeBack} homeName={null} />);
      expect(homes(noName.container)).toHaveLength(0);
      expect(noName.container.querySelectorAll("[data-share-leg]")).toHaveLength(3);
    });
  });

  describe("Stops with no dates", () => {
    const rough = [{ id: "bali", name: "Bali", country: "Indonesia", nights: 4 }, { id: "fiji", name: "Fiji", country: null, nights: null }];

    it("come after the scheduled Stops, and after the Home card, as plain cards with no Show control", () => {
      const homeBack = { mode: "FLIGHT" as const, label: "Flight home", when: "Tue 15 Dec", number: null, arrivesAt: null, arrivesLocal: null };
      const { container } = render(<DayByDay stops={stops} initialOpenId="par" roughStops={rough} homeBack={homeBack} homeName="Gold Coast" />);
      const bali = container.querySelector("[data-share-rough='bali']") as HTMLElement;
      expect(bali).toHaveTextContent("Bali");
      expect(bali).toHaveTextContent("Indonesia · 4 nights");
      expect(bali).toHaveTextContent("Dates to come");
      expect(within(bali).queryByRole("button")).toBeNull();
      expect(container.querySelector("[data-share-rough='fiji']")).toHaveTextContent("Dates to come");
      const home = container.querySelector("[data-share-home]")!;
      expect(home.compareDocumentPosition(bali) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getAllByText("Bali")).toHaveLength(1);
      expect(within(screen.getByRole("navigation", { name: "Stops" })).queryByText("Bali")).toBeNull();
    });
  });

  it("uses no banned styles", () => {
    const { container } = render(<DayByDay stops={stops} initialOpenId="par" />);
    expect(container.innerHTML).not.toMatch(/shadow-soft|bg-card\/40|border-border\/70/);
  });
});
