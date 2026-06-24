import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationBell, type RecentActivity } from "./notification-bell";

vi.mock("@/server/actions/activity", () => ({
  markAllRead: vi.fn().mockResolvedValue(undefined),
}));

import { markAllRead } from "@/server/actions/activity";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const baseActivity: RecentActivity = {
  id: "act-1",
  verb: "CREATED",
  entityType: "STOP",
  entityLabel: "Paris",
  changes: null,
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
  actor: { name: "Alice", image: null },
};

describe("NotificationBell", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows unread badge when unreadCount > 0", () => {
    render(
      <NotificationBell tripId="t1" unreadCount={3} recent={[baseActivity]} />,
    );
    // Badge is a span with aria-hidden; find all aria-hidden spans and pick the one with a number
    const badgeSpans = Array.from(
      document.querySelectorAll('span[aria-hidden="true"]'),
    ).filter((el) => /\d|9\+/.test(el.textContent ?? ""));
    expect(badgeSpans).toHaveLength(1);
    expect(badgeSpans[0].textContent).toBe("3");
  });

  it("caps badge display at '9+' for large counts", () => {
    render(
      <NotificationBell tripId="t1" unreadCount={12} recent={[baseActivity]} />,
    );
    const badgeSpans = Array.from(
      document.querySelectorAll('span[aria-hidden="true"]'),
    ).filter((el) => /\d|9\+/.test(el.textContent ?? ""));
    expect(badgeSpans).toHaveLength(1);
    expect(badgeSpans[0].textContent).toBe("9+");
  });

  it("does not render a badge when unreadCount is 0", () => {
    render(
      <NotificationBell tripId="t1" unreadCount={0} recent={[baseActivity]} />,
    );
    // No badge span should exist
    const badgeSpans = Array.from(
      document.querySelectorAll('span[aria-hidden="true"]'),
    ).filter((el) => /\d|9\+/.test(el.textContent ?? ""));
    expect(badgeSpans).toHaveLength(0);
  });

  it("shows a recent item's headline text when the menu is open", async () => {
    const user = userEvent.setup();
    render(
      <NotificationBell tripId="t1" unreadCount={1} recent={[baseActivity]} />,
    );
    const trigger = screen.getByRole("button", { name: /Notifications/ });
    await user.click(trigger);
    // headline({ verb: "CREATED", entityType: "STOP", entityLabel: "Paris" }) → "added the Paris stop"
    expect(await screen.findByText("added the Paris stop")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("shows empty state when recent is empty", async () => {
    const user = userEvent.setup();
    render(
      <NotificationBell tripId="t1" unreadCount={0} recent={[]} />,
    );
    const trigger = screen.getByRole("button", { name: /Notifications/ });
    await user.click(trigger);
    expect(await screen.findByText("No activity yet.")).toBeInTheDocument();
  });

  it("calls markAllRead with the tripId when 'Mark all read' is clicked", async () => {
    const user = userEvent.setup();
    render(
      <NotificationBell tripId="t1" unreadCount={2} recent={[baseActivity]} />,
    );
    const trigger = screen.getByRole("button", { name: /Notifications/ });
    await user.click(trigger);
    const markBtn = await screen.findByRole("button", { name: "Mark all read" });
    await user.click(markBtn);
    expect(markAllRead).toHaveBeenCalledWith("t1");
  });

  it("renders a 'See all activity' link", async () => {
    const user = userEvent.setup();
    render(
      <NotificationBell tripId="t1" unreadCount={1} recent={[baseActivity]} />,
    );
    const trigger = screen.getByRole("button", { name: /Notifications/ });
    await user.click(trigger);
    const link = await screen.findByRole("link", { name: "See all activity" });
    expect(link).toHaveAttribute("href", "/trips/t1/activity");
  });
});
