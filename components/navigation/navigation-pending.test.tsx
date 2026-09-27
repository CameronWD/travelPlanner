import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

const mockUsePathname = vi.fn(() => "/trips/t1");
const mockUseSearchParams = vi.fn(() => new URLSearchParams());
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}));

import { NavigationPendingProvider, useBeginNavigation, useEffectivePathname, useNavigationPending, pathnameOf, PENDING_NAVIGATION_TIMEOUT_MS } from "./navigation-pending";

function Probe({ to }: { to: string }) {
  const begin = useBeginNavigation();
  const pending = useNavigationPending();
  const effective = useEffectivePathname();
  return (
    <div>
      <button onClick={() => begin(to)}>go</button>
      <output data-testid="pending">{pending?.href ?? "none"}</output>
      <output data-testid="effective">{effective}</output>
    </div>
  );
}

beforeEach(() => {
  mockUsePathname.mockReturnValue("/trips/t1");
  mockUseSearchParams.mockReturnValue(new URLSearchParams());
});
afterEach(() => vi.useRealTimers());

describe("NavigationPendingProvider", () => {
  it("records a begun navigation and lights its pathname as the effective one", () => {
    render(<NavigationPendingProvider><Probe to="/trips/t1/plan?plan=f1" /></NavigationPendingProvider>);
    expect(screen.getByTestId("effective")).toHaveTextContent("/trips/t1");
    fireEvent.click(screen.getByText("go"));
    expect(screen.getByTestId("pending")).toHaveTextContent("/trips/t1/plan?plan=f1");
    expect(screen.getByTestId("effective")).toHaveTextContent("/trips/t1/plan");
  });

  it("settles when the URL changes", () => {
    const { rerender } = render(<NavigationPendingProvider><Probe to="/trips/t1/plan" /></NavigationPendingProvider>);
    fireEvent.click(screen.getByText("go"));
    expect(screen.getByTestId("pending")).toHaveTextContent("/trips/t1/plan");
    mockUsePathname.mockReturnValue("/trips/t1/plan");
    rerender(<NavigationPendingProvider><Probe to="/trips/t1/plan" /></NavigationPendingProvider>);
    expect(screen.getByTestId("pending")).toHaveTextContent("none");
    expect(screen.getByTestId("effective")).toHaveTextContent("/trips/t1/plan");
  });

  it("is a no-op for the URL already shown (tapping the active tab), including a hash-only link", () => {
    render(<NavigationPendingProvider><Probe to="/trips/t1" /></NavigationPendingProvider>);
    fireEvent.click(screen.getByText("go"));
    expect(screen.getByTestId("pending")).toHaveTextContent("none");
    render(<NavigationPendingProvider><Probe to="#stop-1" /></NavigationPendingProvider>);
    fireEvent.click(screen.getAllByText("go")[1]);
    expect(screen.getAllByTestId("pending")[1]).toHaveTextContent("none");
  });

  it("treats a ?search change as a different place", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("plan=f1"));
    render(<NavigationPendingProvider><Probe to="/trips/t1" /></NavigationPendingProvider>);
    fireEvent.click(screen.getByText("go"));
    expect(screen.getByTestId("pending")).toHaveTextContent("/trips/t1");
  });

  it("gives up on a navigation that never lands after the safety timeout", () => {
    vi.useFakeTimers();
    render(<NavigationPendingProvider><Probe to="/trips/t1/plan" /></NavigationPendingProvider>);
    fireEvent.click(screen.getByText("go"));
    act(() => { vi.advanceTimersByTime(PENDING_NAVIGATION_TIMEOUT_MS + 1); });
    expect(screen.getByTestId("pending")).toHaveTextContent("none");
  });

  it("works without a provider (tests and boundary shells): nothing pending, real pathname", () => {
    render(<Probe to="/trips/t1/plan" />);
    fireEvent.click(screen.getByText("go"));
    expect(screen.getByTestId("pending")).toHaveTextContent("none");
    expect(screen.getByTestId("effective")).toHaveTextContent("/trips/t1");
  });
});

describe("pathnameOf", () => {
  it.each([
    ["/trips/t1/plan?plan=f1#stop-2", "/trips/t1/plan"],
    ["/trips/t1", "/trips/t1"],
    ["?plan=f1", "/"],
  ])("%s → %s", (href, expected) => {
    expect(pathnameOf(href)).toBe(expected);
  });
});
