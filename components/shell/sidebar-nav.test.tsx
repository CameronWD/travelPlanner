import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const mockUsePathname = vi.fn(() => "/trips");
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => new URLSearchParams(),
}));

import { SidebarNav } from "./sidebar-nav";
import { ShellUserProvider, type ShellUser } from "@/components/shell/shell-user";

const mainNav = () => screen.getByRole("navigation", { name: "Main" });
const tripsRow = () => within(mainNav()).getAllByRole("link").find((a) => a.getAttribute("href") === "/trips")!;

describe("SidebarNav", () => {
  it("shows the Trips row count", () => {
    render(<SidebarNav tripId={null} tripCount={4} />);
    expect(within(tripsRow()).getByText("4")).toBeInTheDocument();
  });

  it("hides the count at 0 trips", () => {
    render(<SidebarNav tripId={null} tripCount={0} />);
    expect(within(tripsRow()).queryByText("0")).toBeNull();
  });

  // Task 10 extra requirement (a): usePathname() returns the slug URL (ADR
  // 0064) once the shell's trip list knows one — the sidebar's rows must be
  // built from that same slug (useTripSlug) so aria-current still lands.
  it("lights Plan on the slug URL, not just the id one", () => {
    const shell: ShellUser = {
      user: { id: "u1", name: "Cam", email: "c@x", image: null },
      isAdmin: false,
      pendingAccessRequests: 0,
      trips: [{ id: "t1", slug: "christmas-in-europe-2026", name: "Christmas in Europe", statusLine: "" }],
      lastTrip: null,
    };
    mockUsePathname.mockReturnValue("/trips/christmas-in-europe-2026/plan");
    render(
      <ShellUserProvider value={shell}>
        <SidebarNav tripId="t1" />
      </ShellUserProvider>,
    );
    const plan = screen.getByRole("link", { name: "Plan" });
    expect(plan).toHaveAttribute("href", "/trips/christmas-in-europe-2026/plan");
    expect(plan).toHaveAttribute("aria-current", "page");
  });

  it("shows the Money count beside Money", () => {
    mockUsePathname.mockReturnValue("/trips/t1/budget");
    render(<SidebarNav tripId="t1" counts={{ Money: <span>6</span> }} />);
    expect(screen.getByRole("link", { name: /Money/ })).toHaveTextContent("6");
  });
});
