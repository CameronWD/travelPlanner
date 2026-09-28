import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DayHeader, WIDEST_HEADING } from "@/components/trip/day/day-header";
import { dayHeading } from "@/lib/day-view-model";

// vi.hoisted: the mock factory runs when ./day-header is first imported,
// which is before a plain top-level `const` here would be initialised.
const hoisted = vi.hoisted(() => ({ links: [] as Array<Record<string, unknown>> }));
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, onNavigate: _n, transitionTypes, ...r }: { href: string; children: React.ReactNode } & Record<string, unknown>) => {
    hoisted.links.push({ href, transitionTypes });
    return <a href={href} {...r}>{children}</a>;
  },
}));
vi.mock("@/components/trip/notification-bell", () => ({ NotificationBell: () => <button aria-label="Notifications" /> }));
vi.mock("@/components/shell/trip-switcher", () => ({ TripSwitcherFromContext: () => <button aria-label="Switch trip" /> }));

describe("DayHeader", () => {
  it("WIDEST_HEADING is what dayHeading produces for the widest plausible date", () => {
    expect(dayHeading("2026-12-30", "2025-12-20", "2026-12-31")).toBe(WIDEST_HEADING);
  });
  it("h1 is the date; eyebrow and sub line; arrows are links with day labels; disabled at the boundary", () => {
    render(<DayHeader tripId="t1" eyebrow="DAY 9 OF 36 · EUROPE" heading="Sat 12 Dec" subLine="Strasbourg, France · CET · night 3 of 4" subLineCompact="Strasbourg · CET · night 3 of 4" dayTitle={null} prevHref="/trips/t1/day/2026-12-11" nextHref={null} prevLabel="Previous day: Fri 11 Dec" nextLabel={null} unreadCount={0} recent={[]} members={[]} addButton={<button>+ Add to this day</button>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Sat 12 Dec" })).toBeInTheDocument();
    expect(screen.getByText("DAY 9 OF 36 · EUROPE")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous day: Fri 11 Dec" })).toHaveAttribute("href", "/trips/t1/day/2026-12-11");
    expect(screen.getByLabelText("Next day")).toHaveAttribute("aria-disabled", "true");
    // 12px radius (this repo's rounded-xl is 24px, which would make a pill).
    expect(screen.getByRole("link", { name: "Previous day: Fri 11 Dec" }).className.split(/\s+/)).toContain("rounded-[12px]");
    expect(screen.getByLabelText("Next day").className.split(/\s+/)).toContain("rounded-[12px]");
    expect(screen.getByText("Strasbourg, France · CET · night 3 of 4").className).toContain("md:block");
    expect(screen.getByText("Strasbourg · CET · night 3 of 4").className).toContain("md:hidden");
  });
  it("shows the Day title and the right-hand bell, members link and add button", () => {
    const members = [{ id: "u1", name: "Cam", email: "c@x", image: null }];
    render(<DayHeader tripId="t1" eyebrow="E" heading="Sat 12 Dec" subLine="" subLineCompact="" dayTitle="Christmas markets" prevHref={null} nextHref="/trips/t1/day/2026-12-13" prevLabel={null} nextLabel="Next day: Sun 13 Dec" unreadCount={2} recent={[]} members={members} addButton={<button>+ Add to this day</button>} />);
    expect(screen.getByText("Christmas markets")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous day")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: "Next day: Sun 13 Dec" })).toHaveAttribute("href", "/trips/t1/day/2026-12-13");
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Trip members (1)" })).toHaveAttribute("href", "/trips/t1/settings#travellers");
    expect(screen.getByRole("button", { name: "+ Add to this day" })).toBeInTheDocument();
  });
  it("tags the arrows' navigations as day-back / day-forward for the body's View Transition (ADR 0063)", () => {
    hoisted.links.length = 0;
    render(<DayHeader tripId="t1" eyebrow="E" heading="Sat 12 Dec" subLine="" subLineCompact="" dayTitle={null} prevHref="/trips/t1/day/2026-12-11" nextHref="/trips/t1/day/2026-12-13" prevLabel="Previous day: Fri 11 Dec" nextLabel="Next day: Sun 13 Dec" unreadCount={0} recent={[]} members={[]} addButton={<button>+</button>} />);
    expect(hoisted.links.find((l) => l.href === "/trips/t1/day/2026-12-11")?.transitionTypes).toEqual(["day-back"]);
    expect(hoisted.links.find((l) => l.href === "/trips/t1/day/2026-12-13")?.transitionTypes).toEqual(["day-forward"]);
  });
  it("below lg, a top bar carries the switcher pill and the bell (the trip header is hidden on this route)", () => {
    render(<DayHeader tripId="t1" tripName="Christmas in Europe" eyebrow="E" heading="Sat 12 Dec" subLine="" subLineCompact="" dayTitle={null} prevHref={null} nextHref={null} prevLabel={null} nextLabel={null} unreadCount={0} recent={[]} members={[]} addButton={<button>+ Add to this day</button>} />);
    const bar = document.querySelector('[data-slot="day-trip-switcher"]') as HTMLElement;
    expect(bar.className).toContain("xl:hidden");
    expect(bar.querySelector('[aria-label="Switch trip"]')).not.toBeNull();
    const bell = bar.querySelector('[aria-label="Notifications"]') as HTMLElement;
    expect(bell.parentElement!.className).toContain("lg:hidden");
    expect(screen.getAllByRole("button", { name: "Notifications" })).toHaveLength(2);
  });
  describe("the arrows stay put between days (spec 2026-09-28 D2)", () => {
    const base = { tripId: "t1", prevHref: "/trips/t1/day/2026-12-11", nextHref: "/trips/t1/day/2026-12-13", prevLabel: "Previous day: Fri 11 Dec", nextLabel: "Next day: Sun 13 Dec", unreadCount: 0, recent: [], members: [], addButton: <button>+</button> };
    const variants = [
      { eyebrow: "DAY 9 OF 36 · EUROPE", heading: "Sat 12 Dec", subLine: "Strasbourg, France · CET · night 3 of 4", subLineCompact: "Strasbourg · CET · night 3 of 4", dayTitle: null },
      { eyebrow: "DAY 9 OF 36", heading: "Wed 30 Dec 2026", subLine: "", subLineCompact: "", dayTitle: null },
      { eyebrow: "DAY 10 OF 36 · A VERY LONG CHAPTER NAME THAT GOES ON", heading: "Sun 13 Dec", subLine: "Colmar", subLineCompact: "Colmar", dayTitle: "Christmas markets" },
      { eyebrow: "DAY 11 OF 36 · TRAVEL DAY", heading: "Mon 14 Dec", subLine: "Colmar → Basel · CET", subLineCompact: "Colmar → Basel · CET", dayTitle: "" },
    ];
    function shape() {
      const block = document.querySelector('[data-slot="day-title-block"]') as HTMLElement;
      const children = Array.from(block.children).map((c) => `${c.tagName}:${c.className}`);
      const row = block.parentElement as HTMLElement;
      const prev = screen.getByRole("link", { name: /Previous day/ });
      const next = screen.getByRole("link", { name: /Next day/ });
      return { row: row.className, children, prev: prev.className, next: next.className };
    }
    it("renders the same row, block and arrow classes whatever the day's text", () => {
      const shapes = variants.map((v) => {
        const { unmount } = render(<DayHeader {...base} {...v} />);
        const s = shape();
        unmount();
        return s;
      });
      for (const s of shapes.slice(1)) expect(s).toEqual(shapes[0]);
    });
    it("phone: arrows are pinned to the row's edges by a 44px | 1fr | 44px grid; desktop keeps the arrows beside the title", () => {
      render(<DayHeader {...base} {...variants[0]} />);
      const row = (document.querySelector('[data-slot="day-title-block"]') as HTMLElement).parentElement as HTMLElement;
      expect(row.className).toContain("grid-cols-[2.75rem_minmax(0,1fr)_2.75rem]");
      expect(row.className).toContain("md:flex");
    });
    it("desktop: a ghost of the widest heading sizes the block so the date's width never moves the arrows", () => {
      render(<DayHeader {...base} {...variants[0]} />);
      const ghost = document.querySelector('[data-slot="day-heading-ghost"]') as HTMLElement;
      expect(ghost).toHaveTextContent("Wed 30 Dec 2026");
      expect(ghost).toHaveAttribute("aria-hidden", "true");
      expect(ghost.className).toContain("hidden");
      expect(ghost.className).toContain("md:block");
      expect(ghost.className).toContain("h-0");
    });
    it("the title and sub-line slots are always rendered with a fixed height, empty when the day has none", () => {
      render(<DayHeader {...base} {...variants[1]} />);
      const title = document.querySelector('[data-slot="day-title-line"]') as HTMLElement;
      expect(title).toBeInTheDocument();
      expect(title.className).toContain("h-5");
      expect(title).toHaveTextContent("");
      const subs = document.querySelectorAll('[data-slot="day-sub-line"]');
      expect(subs).toHaveLength(2);
      for (const s of Array.from(subs)) expect(s.className).toContain("h-5");
    });
    it("only the ghost and the date size the block: text lines are w-0 min-w-full, and the block never shrinks at md+", () => {
      render(<DayHeader {...base} {...variants[2]} />);
      const block = document.querySelector('[data-slot="day-title-block"]') as HTMLElement;
      expect(block.className).toContain("md:shrink-0");
      const lines = [screen.getByText(variants[2].eyebrow), document.querySelector('[data-slot="day-title-line"]')!, ...Array.from(document.querySelectorAll('[data-slot="day-sub-line"]'))];
      for (const l of lines) {
        expect(l.className.split(/\s+/)).toContain("w-0");
        expect(l.className.split(/\s+/)).toContain("min-w-full");
        expect(l.className.split(/\s+/)).not.toContain("w-full");
      }
    });
  });
});
