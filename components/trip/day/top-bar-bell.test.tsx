import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/components/trip/notification-bell", () => ({
  NotificationBell: ({ tripId, unreadCount }: { tripId: string; unreadCount: number }) => <button aria-label="Notifications" data-trip={tripId} data-unread={unreadCount} />,
}));

import { TopBarBell } from "@/components/trip/day/top-bar-bell";

afterEach(() => {
  cleanup();
  document.getElementById("top-bar-trip-slot")?.remove();
});

function addSlot() {
  const slot = document.createElement("div");
  slot.id = "top-bar-trip-slot";
  document.body.appendChild(slot);
  return slot;
}

describe("TopBarBell", () => {
  it("renders the bell inside the top bar's trip slot", () => {
    const slot = addSlot();
    render(<TopBarBell tripId="t1" unreadCount={3} recent={[]} />);
    const bell = screen.getByRole("button", { name: "Notifications" });
    expect(slot).toContainElement(bell);
    expect(bell).toHaveAttribute("data-unread", "3");
  });
  it("renders no bell when there is no slot", () => {
    render(<TopBarBell tripId="t1" unreadCount={3} recent={[]} />);
    expect(screen.queryByRole("button", { name: "Notifications" })).toBeNull();
  });
  it("removes the bell when it unmounts", () => {
    const slot = addSlot();
    const { unmount } = render(<TopBarBell tripId="t1" unreadCount={0} recent={[]} />);
    expect(slot.children).toHaveLength(1);
    unmount();
    expect(slot.children).toHaveLength(0);
  });
});
