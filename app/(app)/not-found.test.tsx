import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const mockUsePathname = vi.fn(() => "/trips/nope");
vi.mock("next/navigation", () => ({ usePathname: () => mockUsePathname() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import AppNotFound from "./not-found";

beforeEach(() => mockUsePathname.mockReturnValue("/trips/nope"));

describe("the app's not-found page", () => {
  // A bad, deleted or no-longer-shared Trip: the trip layout's guard calls
  // notFound() before TripNav mounts, so this boundary (not the trip
  // segment's not-found.tsx, which renders inside the trip layout) is what
  // shows, and AppRail bows out on a trip path.
  it("keeps the rail (Trips, Globe, You) on a trip path", () => {
    render(<AppNotFound />);
    const rail = screen.getByRole("navigation", { name: "Teepee" });
    for (const [name, href] of [["Trips", "/trips"], ["Globe", "/globe"], ["You", "/account"]]) {
      expect(within(rail).getByRole("link", { name }).getAttribute("href")).toBe(href);
    }
    expect(screen.getByRole("link", { name: "Back to trips" })).toBeInTheDocument();
  });

  it("adds no second rail off a trip path, where the layout's AppRail already shows", () => {
    mockUsePathname.mockReturnValue("/globe/nope");
    render(<AppNotFound />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
