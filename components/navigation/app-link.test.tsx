import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockUsePathname = vi.fn(() => "/trips/t1");
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => new URLSearchParams(),
}));
// A next/link stand-in that behaves like the real one for what AppLink needs:
// a plain left click is a client navigation and runs onNavigate; a
// modifier-click is left to the browser (no onNavigate). onClick runs for both.
type MockLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  onNavigate?: (e: { preventDefault: () => void }) => void;
  transitionTypes?: string[];
};
vi.mock("next/link", () => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip the Link-only prop before it reaches the DOM
  default: ({ href, children, onNavigate, onClick, transitionTypes: _transitionTypes, ...rest }: MockLinkProps) => (
    <a
      href={href}
      onClick={(e: React.MouseEvent<HTMLAnchorElement> & { navPrevented?: boolean }) => {
        onClick?.(e);
        e.preventDefault();
        if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
          onNavigate?.({
            preventDefault() {
              e.navPrevented = true;
            },
          });
        }
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));

import { AppLink } from "./app-link";
import { NavigationPendingProvider, useNavigationPending } from "./navigation-pending";

function Pending() {
  const p = useNavigationPending();
  return <output data-testid="pending">{p?.href ?? "none"}</output>;
}

describe("AppLink", () => {
  it("reports a plain click to the pending context and takes pendingClassName while in flight", () => {
    render(
      <NavigationPendingProvider>
        <AppLink href="/trips/t1/plan" className="base" pendingClassName="lit">Plan</AppLink>
        <Pending />
      </NavigationPendingProvider>,
    );
    const link = screen.getByText("Plan");
    expect(link).toHaveClass("base");
    expect(link).not.toHaveClass("lit");
    fireEvent.click(link);
    expect(screen.getByTestId("pending")).toHaveTextContent("/trips/t1/plan");
    expect(link).toHaveClass("lit");
  });

  it("does not report a modifier-click (new tab)", () => {
    render(
      <NavigationPendingProvider>
        <AppLink href="/trips/t1/plan">Plan</AppLink>
        <Pending />
      </NavigationPendingProvider>,
    );
    fireEvent.click(screen.getByText("Plan"), { metaKey: true });
    expect(screen.getByTestId("pending")).toHaveTextContent("none");
  });

  it("does not report a navigation the caller's onNavigate prevented", () => {
    render(
      <NavigationPendingProvider>
        <AppLink href="/trips/t1/plan" onNavigate={(e) => e.preventDefault()}>Plan</AppLink>
        <Pending />
      </NavigationPendingProvider>,
    );
    fireEvent.click(screen.getByText("Plan"));
    expect(screen.getByTestId("pending")).toHaveTextContent("none");
  });

  it("renders as a plain link without a provider", () => {
    render(<AppLink href="/trips">Trips</AppLink>);
    expect(screen.getByText("Trips")).toHaveAttribute("href", "/trips");
  });
});
