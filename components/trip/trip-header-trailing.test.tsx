import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const shell = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));
const today = vi.hoisted(() => ({ current: "2026-10-10" }));
vi.mock("@/lib/trip-shell-reads", () => ({
  readTripShell: vi.fn(async () => shell.current),
  readUnreadActivityCount: vi.fn(async () => 2),
  readRecentActivity: vi.fn(async () => []),
  readForks: vi.fn(async () => [{ id: "f1", name: "B", sortOrder: 0 }]),
}));
vi.mock("@/lib/trip-today", () => ({ tripTodayISO: () => today.current }));
vi.mock("@/components/trip/fork-switcher", () => ({
  ForkSwitcher: ({ forks }: { forks: unknown[] }) => <div data-testid="fork-switcher" data-count={forks.length} />,
}));
vi.mock("@/components/trip/share-chooser", () => ({ ShareTripButton: () => <button aria-label="Share" /> }));
vi.mock("@/components/trip/notification-bell", () => ({
  NotificationBell: ({ unreadCount }: { unreadCount: number }) => <div data-testid="bell" data-unread={unreadCount} />,
}));
vi.mock("@/components/shell/trip-switcher", () => ({
  TripSwitcherFromContext: ({ variant }: { variant: string }) => <div data-testid={`switcher-${variant}`} />,
}));

import { TripHeaderTrailing } from "./trip-header-trailing";
import { readForks } from "@/lib/trip-shell-reads";

const TRIP = { id: "t1", name: "EU", startDate: "2026-12-04", endDate: "2027-01-08", homeCurrency: "AUD", forksEnabled: true, members: [], stops: [] };

beforeEach(() => {
  vi.clearAllMocks();
  shell.current = TRIP;
  today.current = "2026-10-10";
});

async function renderIt() {
  const el = await TripHeaderTrailing({ tripId: "t1", slug: "eu" });
  if (el) render(el);
  return el;
}

describe("TripHeaderTrailing", () => {
  it("renders the switcher pill (768–1279 only), the fork switcher and the bell", async () => {
    await renderIt();
    const pill = screen.getByTestId("switcher-pill").parentElement!;
    for (const c of ["hidden", "md:flex", "xl:hidden"]) expect(pill.className.split(/\s+/)).toContain(c);
    expect(screen.getByTestId("fork-switcher")).toHaveAttribute("data-count", "1");
    expect(screen.getByTestId("bell")).toHaveAttribute("data-unread", "2");
  });

  it("drops the fork switcher when plan variants are off, without listing forks", async () => {
    shell.current = { ...TRIP, forksEnabled: false };
    await renderIt();
    expect(screen.queryByTestId("fork-switcher")).toBeNull();
    expect(readForks).not.toHaveBeenCalled();
  });

  it("drops the fork switcher while travelling and once past", async () => {
    today.current = "2026-12-10";
    await renderIt();
    expect(screen.queryByTestId("fork-switcher")).toBeNull();
  });

  it("renders nothing for a missing trip", async () => {
    shell.current = null;
    expect(await renderIt()).toBeNull();
  });
});
