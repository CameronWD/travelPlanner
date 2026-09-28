import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/trips",
  useSearchParams: () => new URLSearchParams(),
}));

import { SidebarNav } from "./sidebar-nav";

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
});
