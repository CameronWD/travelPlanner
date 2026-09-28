import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("next/navigation", () => ({ usePathname: () => "/trips", useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/navigation/app-link", () => ({ AppLink: ({ href, children, ...p }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...p}>{children}</a> }));
import { BackToTripCard } from "./back-to-trip-card";

const trips = [{ id: "eu", name: "Christmas in Europe", statusLine: "67 sleeps to go" }, { id: "nz", name: "New Zealand", statusLine: "208 sleeps to go" }];

describe("BackToTripCard", () => {
  it("body links to the trip Home; chevron opens the switcher menu", () => {
    render(<BackToTripCard trip={trips[0]} trips={trips} />);
    expect(screen.getByText("Back to")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Christmas in Europe/ })).toHaveAttribute("href", "/trips/eu");
    expect(screen.getByRole("button", { name: "Switch trip" })).toBeInTheDocument();
  });
});
