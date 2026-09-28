import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/navigation/navigation-pending", () => ({
  useNavState: () => ({ pathname: "/globe", effectivePathname: "/globe", pendingPathname: null }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/globe",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/navigation/app-link", () => ({
  AppLink: ({ href, children, ...p }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...p}>{children}</a>
  ),
}));

import { AppTabBar } from "./app-tab-bar";

describe("AppTabBar", () => {
  it("has Trips, Globe and You, with Globe current, on a sun bar", () => {
    render(<AppTabBar />);
    const nav = screen.getByRole("navigation", { name: "Teepee" });
    expect(nav.className).toContain("bg-sun");
    expect(screen.getByRole("link", { name: "Trips" })).toHaveAttribute("href", "/trips");
    expect(screen.getByRole("link", { name: "Globe" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "You" })).toHaveAttribute("href", "/account");
    expect(nav.querySelectorAll("svg")).toHaveLength(3);
  });
});
