import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const mockUsePathname = vi.fn(() => "/trips");
vi.mock("next/navigation", () => ({ usePathname: () => mockUsePathname() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { AppRail, AppRailDock, TripBoundaryRailShell } from "./app-rail";

beforeEach(() => mockUsePathname.mockReturnValue("/trips"));

describe("AppRail", () => {
  it("renders the Teepee rail with Trips, Globe and You", () => {
    render(<AppRail />);
    const rail = screen.getByRole("navigation", { name: "Teepee" });
    const links = within(rail).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["", "/"],
      ["Trips", "/trips"],
      ["Globe", "/globe"],
      ["You", "/account"],
    ]);
  });

  it.each([
    ["/trips", "Trips"],
    ["/trips/new", "Trips"],
    ["/globe", "Globe"],
    ["/globe/g1", "Globe"],
    ["/account", "You"],
  ])("lights the right item on %s", (path, label) => {
    mockUsePathname.mockReturnValue(path);
    render(<AppRail />);
    const current = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map((a) => a.textContent)).toEqual([label]);
  });

  it("lights nothing on a page the rail has no item for", () => {
    mockUsePathname.mockReturnValue("/help");
    render(<AppRail />);
    expect(document.querySelector('[aria-current="page"]')).toBeNull();
  });

  // Inside a Trip, TripNav renders its own rail — never two.
  it.each(["/trips/t1", "/trips/t1/plan", "/trips/t1/more"])("renders nothing inside a Trip (%s)", (path) => {
    mockUsePathname.mockReturnValue(path);
    const { container } = render(<AppRail />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each(["/trips/t1", "/trips", "/help"])("AppRailDock renders Trips, Globe and You regardless of pathname (%s)", (path) => {
    mockUsePathname.mockReturnValue(path);
    render(<AppRailDock />);
    const rail = screen.getByRole("navigation", { name: "Teepee" });
    expect(within(rail).getAllByRole("link").map((a) => a.textContent)).toEqual(["", "Trips", "Globe", "You"]);
  });
});

// A boundary above the trip layout (the app 404, the trips error screen)
// renders when the trip layout itself failed, so neither TripNav nor AppRail
// is there: the shell supplies the rail on a trip path, and only there.
describe("TripBoundaryRailShell", () => {
  it("adds the rail beside the content on a trip path whose layout failed", () => {
    mockUsePathname.mockReturnValue("/trips/nope");
    const { container } = render(<TripBoundaryRailShell><p>Gone</p></TripBoundaryRailShell>);
    expect(screen.getByRole("navigation", { name: "Teepee" })).toBeInTheDocument();
    expect(screen.getByText("Gone")).toBeInTheDocument();
    expect(container.querySelector("[data-rail-shell]")).not.toBeNull();
  });

  it.each(["/trips", "/globe/g1", "/account/x"])("adds nothing where AppRail already renders (%s)", (path) => {
    mockUsePathname.mockReturnValue(path);
    const { container } = render(<TripBoundaryRailShell><p>Gone</p></TripBoundaryRailShell>);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(container.innerHTML).toBe("<p>Gone</p>");
  });
});
