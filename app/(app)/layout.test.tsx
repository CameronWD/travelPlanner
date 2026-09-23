import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ── Module mocks (must be declared before any imports of the mocked modules) ──

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

// layout.tsx pulls in @/lib/invites and @/lib/globe-invites, which both import
// @/lib/db at module scope. lib/db.ts now throws at import time when
// DATABASE_URL is unset (which it is under vitest) — mock it so this render
// test doesn't need a real database, same as every other test in the suite.
//
// `accessRequest.findMany` is the one query listAccessRequests (called from
// layout.tsx for the Admin nav badge) can reach — real for a non-admin
// session (isAdminEmail short-circuits first, so it's never called at all),
// but reachable when a test signs in as an ADMIN_EMAILS operator.
const accessRequestFindManyMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("@/lib/db", () => ({
  db: { accessRequest: { findMany: accessRequestFindManyMock } },
}));

// The shell now mounts the Feedback launcher, a client component that reads the
// current route — so this mock has to cover usePathname as well as redirect.
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  usePathname: vi.fn(() => "/trips"),
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
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

// ThemeToggle is a client component; stub it to avoid
// client-only hooks in the jsdom test environment.
vi.mock("@/components/ui/theme-toggle", () => ({
  ThemeToggle: () => <button>ThemeToggle</button>,
}));

vi.mock("@/components/command-palette-mount", () => ({ CommandPaletteMount: () => null }));
vi.mock("@/components/command-palette-trigger", () => ({ CommandPaletteTrigger: () => null }));

// ── Imports (after mocks) ──

import { auth } from "@/lib/auth";
import AppLayout from "./layout";

// ── Shared test fixture ──

const SIGNED_IN_SESSION = {
  user: { id: "user-1", name: "Alice Test", email: "alice@example.com", image: null },
};

const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: signed-in user
  vi.mocked(auth).mockResolvedValue(SIGNED_IN_SESSION as never);
  accessRequestFindManyMock.mockResolvedValue([]);
  delete process.env.ADMIN_EMAILS;
});

afterEach(() => {
  if (ORIGINAL_ADMIN_EMAILS === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS;
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

  it("renders the Teepee wordmark link when authenticated", async () => {
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    expect(screen.getByText("Teepee")).toBeInTheDocument();
  });

  it("renders the avatar trigger button for the user menu", async () => {
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    // The avatar dropdown trigger button should be in the DOM
    expect(screen.getByRole("button", { name: /traveller menu/i })).toBeInTheDocument();
  });

  it("renders the tent SVG wordmark", async () => {
    const ui = await AppLayout({ children: <div /> });
    const { container } = render(ui as React.ReactElement);
    expect(container.querySelector("svg[data-testid='tent-icon']")).toBeInTheDocument();
    expect(screen.getByText("Teepee")).toBeInTheDocument();
  });

  it("ramps the content width up on large screens", async () => {
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    const main = screen.getByTestId("app-main");
    expect(main.className).toContain("max-w-5xl");
    expect(main.className).toContain("lg:max-w-6xl");
    expect(main.className).toContain("2xl:max-w-7xl");
  });

  it("mounts the feedback launcher for a signed-in traveller", async () => {
    render(await AppLayout({ children: <div /> }));
    expect(
      screen.getByRole("button", { name: /leave feedback/i }),
    ).toBeInTheDocument();
  });

  it("offers a Help link in the traveller dropdown", async () => {
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    // Link text matches the established "How to use TEEPEE" title used on the
    // /help pages themselves (see app/(app)/help/page.tsx), not the word "Help".
    const link = screen.getByRole("link", { name: /how to use teepee/i });
    expect(link.getAttribute("href")).toBe("/help");
  });

  it("offers an Account link in the traveller dropdown, above Sign out", async () => {
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    const link = screen.getByRole("link", { name: /^account$/i });
    expect(link.getAttribute("href")).toBe("/account");
  });

  it("offers a What's new link in the traveller dropdown", async () => {
    // /whats-new is the only route in this feature reachable exclusively
    // through this menu (the card links to /trips or a Trip's Home, never
    // here directly), which makes this the one drift test in the set that
    // actually guards a route with no other way in.
    const ui = await AppLayout({ children: <div /> });
    render(ui as React.ReactElement);
    const link = screen.getByRole("link", { name: /what's new/i });
    expect(link.getAttribute("href")).toBe("/whats-new");
  });

  // ARCH-TEN-3c: /admin exists now, and must be discoverable — but only for
  // an ADMIN_EMAILS operator. Hiding it from everyone else is not access
  // control (requireAdmin() on the route and every action still is); this is
  // purely "can the operator find their own console."
  describe("the Admin nav entry", () => {
    it("is absent for an ordinary traveller", async () => {
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      expect(screen.queryByRole("link", { name: /^admin/i })).not.toBeInTheDocument();
    });

    it("appears for an ADMIN_EMAILS operator, linking to /admin", async () => {
      process.env.ADMIN_EMAILS = "alice@example.com";
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      const link = screen.getByRole("link", { name: /^admin/i });
      expect(link.getAttribute("href")).toBe("/admin");
    });

    // Load-bearing, not decorative: notifyAdmins' push only reaches the
    // operator if they have a Device registered, so this count is often the
    // ONLY way they learn a request is waiting.
    it("shows a pending-count badge when Access requests are waiting", async () => {
      process.env.ADMIN_EMAILS = "alice@example.com";
      accessRequestFindManyMock.mockResolvedValue([
        { id: "ar1", email: "a@example.com", name: null, image: null, createdAt: new Date(), lastAttemptAt: new Date(), attempts: 1 },
        { id: "ar2", email: "b@example.com", name: null, image: null, createdAt: new Date(), lastAttemptAt: new Date(), attempts: 1 },
      ]);
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("shows no badge when there are no pending Access requests", async () => {
      process.env.ADMIN_EMAILS = "alice@example.com";
      accessRequestFindManyMock.mockResolvedValue([]);
      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);
      const link = screen.getByRole("link", { name: /^admin/i });
      // Just "Admin" — no trailing count.
      expect(link.textContent?.trim()).toBe("Admin");
    });

    // The route must stay discoverable even when the count itself can't be
    // read — a DB hiccup on the badge must never take the whole link with it.
    it("still renders the Admin link even if the pending-count query fails", async () => {
      process.env.ADMIN_EMAILS = "alice@example.com";
      accessRequestFindManyMock.mockRejectedValue(new Error("db down"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const ui = await AppLayout({ children: <div /> });
      render(ui as React.ReactElement);

      expect(screen.getByRole("link", { name: /^admin/i }).getAttribute("href")).toBe("/admin");
      errorSpy.mockRestore();
    });
  });
});
