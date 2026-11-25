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
    expect(screen.getByRole("heading", { name: "Day by day" })).toBeInTheDocument();
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
    expect(name.className).toMatch(/sm:truncate/);
    expect(name.className).not.toMatch(/(^|\s)truncate/);
    const dates = within(open).getByText(/5 Dec.*–.*10 Dec/);
    expect(dates.className).not.toMatch(/hidden/);
    expect(dates.className).toMatch(/text-muted-foreground/);
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

  it("Show opens a folded stop and folds the open one", async () => {
    render(<DayByDay stops={stops} initialOpenId="par" />, { wrapper: MotionProvider });
    await userEvent.click(within(screen.getByText("Ritz +1 · 3 plans").closest("[data-stop-folded]") as HTMLElement).getByRole("button", { name: /show/i }));
    expect(screen.getByText("Borough Market")).toBeInTheDocument();
    // The old stop folds away (MOTION.md S7), inert while it goes.
    expect(screen.getByText("Louvre").closest("[inert]")).not.toBeNull();
    await waitFor(() => expect(screen.queryByText("Louvre")).not.toBeInTheDocument());
  });

  it("the stop index opens and scrolls to a stop", async () => {
    render(<DayByDay stops={stops} initialOpenId="par" />);
    const index = screen.getByRole("navigation", { name: "Stops" });
    await userEvent.click(within(index).getByRole("button", { name: /London/ }));
    expect(scrollToId).toHaveBeenCalledWith("share-stop-lon", expect.objectContaining({ reduced: expect.any(Boolean) }));
    expect(screen.getByText("Borough Market")).toBeInTheDocument();
  });

  it("the mobile picker names the open stop and switches it", async () => {
    render(<DayByDay stops={stops} initialOpenId="par" />);
    await userEvent.click(screen.getByRole("button", { name: "Paris" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "London" }));
    expect(scrollToId).toHaveBeenCalledWith("share-stop-lon", expect.objectContaining({ reduced: expect.any(Boolean) }));
    expect(screen.getByText("Borough Market")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Louvre")).not.toBeInTheDocument());
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

  it("uses no banned styles", () => {
    const { container } = render(<DayByDay stops={stops} initialOpenId="par" />);
    expect(container.innerHTML).not.toMatch(/shadow-soft|bg-card\/40|border-border\/70/);
  });
});
