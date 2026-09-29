import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockUsePathname = vi.fn(() => "/trips/nope");
vi.mock("next/navigation", () => ({ usePathname: () => mockUsePathname() }));
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import AppNotFound from "./not-found";

// The sidebar's inline search imports the Search server actions, whose module
// opens the database at import time — stub them (no Postgres in unit tests).
vi.mock("@/server/actions/search", () => ({
  searchTrip: vi.fn(async () => []),
  listMyTrips: vi.fn(async () => []),
}));

beforeEach(() => mockUsePathname.mockReturnValue("/trips/nope"));

describe("the app's not-found page", () => {
  // A bad, deleted or no-longer-shared Trip: the trip layout's guard calls
  // notFound(), so this boundary (not the trip segment's not-found.tsx, which
  // renders inside the trip layout) is what shows. It no longer owns a rail:
  // AppShellRail in the app layout stays on screen above it.
  it.each(["/trips/nope", "/globe/nope"])("renders its content and no rail of its own (%s)", (path) => {
    mockUsePathname.mockReturnValue(path);
    const { container } = render(<AppNotFound />);
    expect(screen.getByRole("link", { name: "Back to trips" })).toBeInTheDocument();
    expect(container.querySelector('nav[aria-label="Teepee"]')).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
