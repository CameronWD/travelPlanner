import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DayHeader } from "@/components/trip/day/day-header";

vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode } & Record<string, unknown>) => <a href={href} {...r}>{children}</a> }));
vi.mock("@/components/trip/notification-bell", () => ({ NotificationBell: () => <button aria-label="Notifications" /> }));
vi.mock("@/components/shell/trip-switcher", () => ({ TripSwitcherFromContext: () => null }));

describe("DayHeader", () => {
  it("h1 is the date; eyebrow and sub line; arrows are links with day labels; disabled at the boundary", () => {
    render(<DayHeader tripId="t1" eyebrow="DAY 9 OF 36 · EUROPE" heading="Sat 12 Dec" subLine="Strasbourg, France · CET · night 3 of 4" subLineCompact="Strasbourg · CET · night 3 of 4" dayTitle={null} prevHref="/trips/t1/day/2026-12-11" nextHref={null} prevLabel="Previous day: Fri 11 Dec" nextLabel={null} unreadCount={0} recent={[]} members={[]} addButton={<button>+ Add to this day</button>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Sat 12 Dec" })).toBeInTheDocument();
    expect(screen.getByText("DAY 9 OF 36 · EUROPE")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous day: Fri 11 Dec" })).toHaveAttribute("href", "/trips/t1/day/2026-12-11");
    expect(screen.getByLabelText("Next day")).toHaveAttribute("aria-disabled", "true");
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
});
