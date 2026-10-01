import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

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
import { ShellUserProvider, type ShellUser } from "@/components/shell/shell-user";
import { EMPTY_ADMIN_QUEUE } from "@/lib/admin-queue";

const SHELL: ShellUser = {
  user: { id: "u1", name: "Alice", image: null, email: "a@example.com" },
  isAdmin: true,
  adminQueue: { accessRequests: 1, feedbackNeedingReview: 1 },
  trips: [],
  lastTrip: null,
};

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

  // Spec 2026-10-02 §B: outside a Trip a phone has no avatar, so the You tab
  // is where the Admin queue dot lives — /trips is where a phone lands.
  it("marks the You tab and names the count for an Admin with an Admin queue", () => {
    render(
      <ShellUserProvider value={SHELL}>
        <AppTabBar />
      </ShellUserProvider>,
    );
    const you = screen.getByRole("link", { name: "You, 2 waiting in Admin" });
    expect(you).toHaveAttribute("href", "/account");
    expect(within(you).getByTestId("admin-queue-dot")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "You" })).toBeNull();
  });

  it("shows no dot for an Admin with an empty queue", () => {
    render(
      <ShellUserProvider value={{ ...SHELL, adminQueue: EMPTY_ADMIN_QUEUE }}>
        <AppTabBar />
      </ShellUserProvider>,
    );
    expect(screen.getByRole("link", { name: "You" })).toBeInTheDocument();
    expect(screen.queryByTestId("admin-queue-dot")).toBeNull();
  });

  // Review Focus 4.
  it("shows no dot for an ordinary traveller whatever the counts say", () => {
    render(
      <ShellUserProvider value={{ ...SHELL, isAdmin: false }}>
        <AppTabBar />
      </ShellUserProvider>,
    );
    expect(screen.getByRole("link", { name: "You" })).toBeInTheDocument();
    expect(screen.queryByTestId("admin-queue-dot")).toBeNull();
  });
});
