import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const mockUsePathname = vi.fn(() => "/trips");
vi.mock("next/navigation", () => ({ usePathname: () => mockUsePathname() }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { AppRail } from "./app-rail";

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
});
