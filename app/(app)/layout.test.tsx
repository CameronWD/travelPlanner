import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ── Module mocks (must be declared before any imports of the mocked modules) ──

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

vi.mock("@/lib/discreet-server", () => ({
  getDiscreetState: vi.fn(),
}));

// next/link renders a plain <a> in jsdom
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Stub Radix DropdownMenu so DropdownMenuContent always renders its children
// (the real component only renders content when the menu is open).
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children, ...props }: React.HTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => <button {...props}>{children}</button>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => <div {...props}>{children}</div>,
}));

// ThemeToggle and DiscreetToggle are client components; stub them to avoid
// client-only hooks in the jsdom test environment.
vi.mock("@/components/ui/theme-toggle", () => ({
  ThemeToggle: () => <button>ThemeToggle</button>,
}));

vi.mock("@/components/discreet/discreet-toggle", () => ({
  DiscreetToggle: ({ discreet, label }: { discreet: boolean; label: string }) => (
    <div data-testid="discreet-toggle" data-discreet={discreet} data-label={label}>DiscreetToggle</div>
  ),
}));

vi.mock("@/components/command-palette-mount", () => ({ CommandPaletteMount: () => null }));
vi.mock("@/components/command-palette-trigger", () => ({ CommandPaletteTrigger: () => null }));

// ── Imports (after mocks) ──

import { auth } from "@/lib/auth";
import { getDiscreetState } from "@/lib/discreet-server";
import AppLayout from "./layout";

// ── Shared test fixture ──

const SIGNED_IN_SESSION = {
  user: { id: "user-1", name: "Alice Test", email: "alice@example.com", image: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: signed-in user
  vi.mocked(auth).mockResolvedValue(SIGNED_IN_SESSION as never);
  // Default: discreet mode off
  vi.mocked(getDiscreetState).mockResolvedValue({ discreet: false, label: "Workspace" });
});

// ── Tests ──

describe("AppLayout", () => {
  it("redirects to /signin when no session", async () => {
    const { redirect } = await import("next/navigation");
    vi.mocked(auth).mockResolvedValue(null as never);
    // redirect() is mocked and doesn't throw; the component may error after the
    // redirect call because session is null. Only suppress the expected
    // TypeError from destructuring a null session; rethrow anything unexpected.
    try {
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
    } catch (e) {
      if (!(e instanceof TypeError)) throw e;
    }
    expect(redirect).toHaveBeenCalledWith("/signin");
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it("renders the TEEPEE wordmark link when authenticated", async () => {
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    expect(screen.getByText("TEEPEE")).toBeInTheDocument();
  });

  it("renders the avatar trigger button for the user menu", async () => {
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    // The avatar dropdown trigger button should be in the DOM
    expect(screen.getByRole("button", { name: /traveller menu/i })).toBeInTheDocument();
  });

  it("shows the TEEPEE wordmark when discreet is off", async () => {
    vi.mocked(getDiscreetState).mockResolvedValue({ discreet: false, label: "Workspace" });
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    expect(screen.getByText("TEEPEE")).toBeInTheDocument();
  });

  it("ramps the content width up on large screens", async () => {
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    const main = screen.getByTestId("app-main");
    expect(main.className).toContain("max-w-5xl");
    expect(main.className).toContain("lg:max-w-6xl");
    expect(main.className).toContain("2xl:max-w-7xl");
  });

  it("shows the neutral label and no TEEPEE when discreet is on", async () => {
    vi.mocked(getDiscreetState).mockResolvedValue({ discreet: true, label: "Q3 Tracker" });
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    expect(screen.getByText("Q3 Tracker")).toBeInTheDocument();
    expect(screen.queryByText("TEEPEE")).not.toBeInTheDocument();
    expect(document.querySelector(".discreet")).toBeInTheDocument();
    expect(screen.getByTestId("discreet-toggle")).toHaveAttribute("data-discreet", "true");
  });
});
