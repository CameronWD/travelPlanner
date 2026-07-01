import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Module mocks (must be declared before component imports) ──

vi.mock("@/server/actions/forks", () => ({
  createFork: vi.fn().mockResolvedValue({ success: true, forkId: "fork-new" }),
  renameFork: vi.fn().mockResolvedValue({ success: true }),
  discardFork: vi.fn().mockResolvedValue({ success: true }),
}));

const mockPush = vi.fn();
const mockUsePathname = vi.fn(() => "/trips/t1/plan");
const mockUseSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}));

// Stub Radix DropdownMenu so content always renders (not just when open)
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children?: React.ReactNode; asChild?: boolean }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div role="menu">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    children?: React.ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
  }) => (
    <div
      role="menuitem"
      aria-disabled={disabled}
      onClick={disabled ? undefined : onSelect}
      {...props}
    >
      {children}
    </div>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

// Stub Dialog components to always render
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children }: { children: React.ReactNode; asChild?: boolean }) => <>{children}</>,
}));

import { createFork, discardFork } from "@/server/actions/forks";
import { ForkSwitcher, type ForkItem } from "./fork-switcher";

// ── Shared fixtures ──

const FORKS: ForkItem[] = [
  { id: "fork-1", name: "Variant 1" },
  { id: "fork-2", name: "Variant 2" },
];

const baseProps = {
  tripId: "t1",
  forks: FORKS,
  phase: "planning" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUsePathname.mockReturnValue("/trips/t1/plan");
  mockUseSearchParams.mockReturnValue(new URLSearchParams());
});

// ── Tests ──

describe("ForkSwitcher", () => {
  // -------------------------------------------------------------------------
  // 1. Renders plans in the menu
  // -------------------------------------------------------------------------
  it("lists Real plan and all fork names", () => {
    render(<ForkSwitcher {...baseProps} />);
    // "Real plan" appears twice: once in the trigger, once in the menu item
    const realPlanEls = screen.getAllByText("Real plan");
    expect(realPlanEls.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Variant 1")).toBeInTheDocument();
    expect(screen.getByText("Variant 2")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 2. Trigger label matches active plan
  // -------------------------------------------------------------------------
  it("shows Real plan as the active label when no forkId is selected", () => {
    // searchParams has no ?plan= param — real plan is active
    render(<ForkSwitcher {...baseProps} />);
    // The trigger button shows the active plan name
    const trigger = screen.getByRole("button", { name: /active plan: real plan/i });
    expect(trigger).toBeInTheDocument();
  });

  it("shows the active fork name when a fork is selected", () => {
    // Simulate ?plan=fork-1 in URL
    mockUseSearchParams.mockReturnValue(new URLSearchParams("plan=fork-1"));
    render(<ForkSwitcher {...baseProps} />);
    const trigger = screen.getByRole("button", { name: /active plan: variant 1/i });
    expect(trigger).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 3. Selecting a fork navigates with ?plan=
  // -------------------------------------------------------------------------
  it("navigates to ?plan=<forkId> when a fork is selected", async () => {
    const user = userEvent.setup();
    render(<ForkSwitcher {...baseProps} />);
    await user.click(screen.getByText("Variant 1"));
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("plan=fork-1"),
    );
  });

  it("clears the ?plan= param when Real plan is selected", async () => {
    const user = userEvent.setup();
    mockUseSearchParams.mockReturnValue(new URLSearchParams("plan=fork-1"));
    render(<ForkSwitcher {...baseProps} />);
    // Click "Real plan" menu item
    const realPlanItems = screen.getAllByText("Real plan");
    // The menu item is the one inside the menu (not the trigger span)
    const menuItem = realPlanItems.find((el) => el.closest('[role="menuitem"]'));
    if (menuItem) await user.click(menuItem);
    expect(mockPush).toHaveBeenCalledWith(
      expect.not.stringContaining("plan="),
    );
  });

  // -------------------------------------------------------------------------
  // 4. New variant calls createFork
  // -------------------------------------------------------------------------
  it("calls createFork when New variant is clicked", async () => {
    const user = userEvent.setup();
    render(<ForkSwitcher {...baseProps} forks={[]} />);
    await user.click(screen.getByText("New variant"));
    expect(createFork).toHaveBeenCalledWith("t1");
  });

  it("navigates to the new fork after creation", async () => {
    const user = userEvent.setup();
    render(<ForkSwitcher {...baseProps} forks={[]} />);
    await user.click(screen.getByText("New variant"));
    // createFork resolves to { success: true, forkId: "fork-new" }
    await vi.waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining("plan=fork-new"),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 5. Cap: 4 forks → "New variant" disabled, nudge shown
  // -------------------------------------------------------------------------
  it("disables New variant and shows nudge when at the 4-fork cap", () => {
    const atCapForks: ForkItem[] = [
      { id: "f1", name: "V1" },
      { id: "f2", name: "V2" },
      { id: "f3", name: "V3" },
      { id: "f4", name: "V4" },
    ];
    render(<ForkSwitcher {...baseProps} forks={atCapForks} />);
    expect(screen.getByText(/discard a variant first/i)).toBeInTheDocument();
    const newVariantItem = screen.getByRole("menuitem", { name: /discard a variant first/i });
    expect(newVariantItem).toHaveAttribute("aria-disabled", "true");
  });

  // -------------------------------------------------------------------------
  // 6. Travelling/past phase → switcher is hidden
  // -------------------------------------------------------------------------
  it("renders nothing when phase is travelling", () => {
    const { container } = render(
      <ForkSwitcher {...baseProps} phase="travelling" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when phase is past", () => {
    const { container } = render(
      <ForkSwitcher {...baseProps} phase="past" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // -------------------------------------------------------------------------
  // 7. Visible for sketching / planning / final-prep phases
  // -------------------------------------------------------------------------
  it("renders the switcher for sketching phase", () => {
    render(<ForkSwitcher {...baseProps} phase="sketching" />);
    expect(screen.getByRole("button", { name: /open plan switcher/i })).toBeInTheDocument();
  });

  it("renders the switcher for final-prep phase", () => {
    render(<ForkSwitcher {...baseProps} phase="final-prep" />);
    expect(screen.getByRole("button", { name: /open plan switcher/i })).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 8. Compare link navigates to /compare
  // -------------------------------------------------------------------------
  it("navigates to the compare page when Compare plans is clicked", async () => {
    const user = userEvent.setup();
    render(<ForkSwitcher {...baseProps} />);
    await user.click(screen.getByText("Compare plans"));
    expect(mockPush).toHaveBeenCalledWith("/trips/t1/compare");
  });

  // -------------------------------------------------------------------------
  // 9. Rename opens dialog
  // -------------------------------------------------------------------------
  it("opens the rename dialog when rename button is clicked", async () => {
    const user = userEvent.setup();
    render(<ForkSwitcher {...baseProps} />);
    const renameBtn = screen.getByRole("button", { name: /rename variant 1/i });
    await user.click(renameBtn);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /rename variant/i })).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 10. Discard opens confirm dialog
  // -------------------------------------------------------------------------
  it("opens the discard confirm dialog when discard button is clicked", async () => {
    const user = userEvent.setup();
    render(<ForkSwitcher {...baseProps} />);
    const discardBtn = screen.getByRole("button", { name: /discard variant 1/i });
    await user.click(discardBtn);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/discard.*variant 1/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 11. Discard calls discardFork
  // -------------------------------------------------------------------------
  it("calls discardFork when confirm is clicked in discard dialog", async () => {
    const user = userEvent.setup();
    render(<ForkSwitcher {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /discard variant 1/i }));
    // The confirm button text is exactly "Discard variant" (inside the dialog)
    const confirmBtn = screen.getByRole("button", { name: /^discard variant$/i });
    await user.click(confirmBtn);
    expect(discardFork).toHaveBeenCalledWith("fork-1");
  });

  // -------------------------------------------------------------------------
  // 12. Discarding the active fork navigates to real plan
  // -------------------------------------------------------------------------
  it("navigates to the real plan after discarding the active fork", async () => {
    const user = userEvent.setup();
    // Set ?plan=fork-1 to simulate the active fork being fork-1
    mockUseSearchParams.mockReturnValue(new URLSearchParams("plan=fork-1"));
    render(<ForkSwitcher {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /discard variant 1/i }));
    const confirmBtn = screen.getByRole("button", { name: /^discard variant$/i });
    await user.click(confirmBtn);
    await vi.waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.not.stringContaining("plan="),
      );
    });
  });
});
