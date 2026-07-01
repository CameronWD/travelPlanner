import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mock server actions BEFORE importing the component (hoisting)
// ---------------------------------------------------------------------------

vi.mock("@/server/actions/forks", () => ({
  getPromotionPreview: vi.fn(),
  promoteFork: vi.fn(),
}));

import {
  getPromotionPreview,
  promoteFork,
} from "@/server/actions/forks";
import type { PromotionPreview } from "@/server/actions/forks";
import { PromoteForkDialog } from "./promote-fork-dialog";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PREVIEW_NO_LOSSES: PromotionPreview = {
  lossList: [],
  deltas: {
    stopCount: 2,
    nightTotal: -1,
    budgetHomeMinor: 5000,
    flagWarnings: 0,
    flagInfos: 0,
    transitMinutes: 60,
    drivingMinutes: 0,
    flightCount: 1,
    projectedEndDays: -1,
  },
};

const PREVIEW_WITH_LOSSES: PromotionPreview = {
  lossList: [
    { kind: "PAID_COST", label: "Hotel deposit" },
    { kind: "CONFIRMATION", label: "Marriott Sydney" },
    { kind: "ATTACHMENT", label: "booking-receipt.pdf" },
  ],
  deltas: {
    stopCount: 0,
    nightTotal: 3,
    budgetHomeMinor: -20000,
    flagWarnings: 1,
    flagInfos: 0,
    transitMinutes: 0,
    drivingMinutes: 0,
    flightCount: 0,
    projectedEndDays: 3,
  },
};

const DEFAULT_PROPS = {
  forkId: "fork-1",
  forkName: "Option B",
  open: true,
  onOpenChange: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PromoteForkDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (promoteFork as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
  });

  // -------------------------------------------------------------------------
  // 1. Loading state — while preview is being fetched
  // -------------------------------------------------------------------------
  it("shows a loading state while the preview is being fetched", () => {
    // Never resolves during this test
    (getPromotionPreview as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );

    render(<PromoteForkDialog {...DEFAULT_PROPS} />);

    expect(screen.getByText(/loading preview/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 2. Dialog title is present for a11y
  // -------------------------------------------------------------------------
  it("renders a dialog title containing the fork name", async () => {
    (getPromotionPreview as ReturnType<typeof vi.fn>).mockResolvedValue(
      PREVIEW_NO_LOSSES,
    );

    render(<PromoteForkDialog {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /option b/i }),
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Delta summary renders correctly (no-loss preview)
  // -------------------------------------------------------------------------
  it("renders the delta summary from the preview", async () => {
    (getPromotionPreview as ReturnType<typeof vi.fn>).mockResolvedValue(
      PREVIEW_NO_LOSSES,
    );

    render(<PromoteForkDialog {...DEFAULT_PROPS} />);

    // Wait for the preview to load
    await waitFor(() => {
      expect(screen.getByText(/changes vs current plan/i)).toBeInTheDocument();
    });

    // +2 stops, -1 night, +USD50.00 budget, +1 flight, projected end -1 day
    expect(screen.getByText(/\+2 stops/)).toBeInTheDocument();
    expect(screen.getByText(/-1 night/)).toBeInTheDocument();
    expect(screen.getByText(/\+1 flight/)).toBeInTheDocument();
    expect(screen.getByText(/projected end -1 day/)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 4. No loss list when lossList is empty
  // -------------------------------------------------------------------------
  it("does NOT render the loss list when lossList is empty", async () => {
    (getPromotionPreview as ReturnType<typeof vi.fn>).mockResolvedValue(
      PREVIEW_NO_LOSSES,
    );

    render(<PromoteForkDialog {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.queryByText(/promoting will discard/i)).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 5. No type-to-confirm when lossList is empty — single confirm button
  // -------------------------------------------------------------------------
  it("shows a single confirm button (no type-to-confirm) when lossList is empty", async () => {
    (getPromotionPreview as ReturnType<typeof vi.fn>).mockResolvedValue(
      PREVIEW_NO_LOSSES,
    );

    render(<PromoteForkDialog {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /promote to real plan/i }),
      ).toBeEnabled();
    });

    // No confirm input
    expect(
      screen.queryByPlaceholderText("Option B"),
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 6. Single confirm fires promoteFork when lossList is empty
  // -------------------------------------------------------------------------
  it("calls promoteFork on confirm click when lossList is empty", async () => {
    const user = userEvent.setup();
    (getPromotionPreview as ReturnType<typeof vi.fn>).mockResolvedValue(
      PREVIEW_NO_LOSSES,
    );

    render(<PromoteForkDialog {...DEFAULT_PROPS} />);

    const confirmBtn = await screen.findByRole("button", {
      name: /promote to real plan/i,
    });
    await user.click(confirmBtn);

    expect(promoteFork).toHaveBeenCalledWith("fork-1");
  });

  // -------------------------------------------------------------------------
  // 7. Loss list renders when lossList is non-empty
  // -------------------------------------------------------------------------
  it("renders the loss list items when lossList is non-empty", async () => {
    (getPromotionPreview as ReturnType<typeof vi.fn>).mockResolvedValue(
      PREVIEW_WITH_LOSSES,
    );

    render(<PromoteForkDialog {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText(/promoting will discard/i)).toBeInTheDocument();
    });

    expect(screen.getByText("Hotel deposit")).toBeInTheDocument();
    expect(screen.getByText("Marriott Sydney")).toBeInTheDocument();
    expect(screen.getByText("booking-receipt.pdf")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 8. Loss-list kind badges render correctly
  // -------------------------------------------------------------------------
  it("renders kind badges for each loss list item", async () => {
    (getPromotionPreview as ReturnType<typeof vi.fn>).mockResolvedValue(
      PREVIEW_WITH_LOSSES,
    );

    render(<PromoteForkDialog {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText("Paid cost")).toBeInTheDocument();
      expect(screen.getAllByText("Booking confirmation")).toHaveLength(1);
      expect(screen.getByText("Attachment")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 9. Type-to-confirm present when lossList is non-empty
  // -------------------------------------------------------------------------
  it("renders the type-to-confirm input when lossList is non-empty", async () => {
    (getPromotionPreview as ReturnType<typeof vi.fn>).mockResolvedValue(
      PREVIEW_WITH_LOSSES,
    );

    render(<PromoteForkDialog {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Option B")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 10. Promote button disabled until fork name typed exactly
  // -------------------------------------------------------------------------
  it("the promote button is disabled until the exact fork name is typed", async () => {
    const user = userEvent.setup();
    (getPromotionPreview as ReturnType<typeof vi.fn>).mockResolvedValue(
      PREVIEW_WITH_LOSSES,
    );

    render(<PromoteForkDialog {...DEFAULT_PROPS} />);

    // Wait for loss list to appear (preview loaded)
    await waitFor(() => {
      expect(screen.getByText(/promoting will discard/i)).toBeInTheDocument();
    });

    const promoteBtn = screen.getByRole("button", { name: /promote anyway/i });

    // Initially disabled (empty input)
    expect(promoteBtn).toBeDisabled();

    // Type wrong name — still disabled
    const input = screen.getByPlaceholderText("Option B");
    await user.type(input, "Option C");
    expect(promoteBtn).toBeDisabled();

    // Clear and type the correct name — now enabled
    await user.clear(input);
    await user.type(input, "Option B");
    expect(promoteBtn).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  // 11. Promote action cannot fire before name is typed
  // -------------------------------------------------------------------------
  it("promoteFork is NOT called if the type-to-confirm is incomplete", async () => {
    (getPromotionPreview as ReturnType<typeof vi.fn>).mockResolvedValue(
      PREVIEW_WITH_LOSSES,
    );

    render(<PromoteForkDialog {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText(/promoting will discard/i)).toBeInTheDocument();
    });

    const promoteBtn = screen.getByRole("button", { name: /promote anyway/i });
    // The button is disabled so keyboard/pointer activation does nothing.
    // We assert it's disabled to prove the gate.
    expect(promoteBtn).toBeDisabled();
    expect(promoteFork).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 12. promoteFork IS called after correct type-to-confirm with losses
  // -------------------------------------------------------------------------
  it("calls promoteFork after the correct fork name is typed and promote is clicked", async () => {
    const user = userEvent.setup();
    (getPromotionPreview as ReturnType<typeof vi.fn>).mockResolvedValue(
      PREVIEW_WITH_LOSSES,
    );

    render(<PromoteForkDialog {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText(/promoting will discard/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Option B");
    await user.type(input, "Option B");

    const promoteBtn = screen.getByRole("button", { name: /promote anyway/i });
    await user.click(promoteBtn);

    expect(promoteFork).toHaveBeenCalledWith("fork-1");
  });

  // -------------------------------------------------------------------------
  // 13. onOpenChange(false) is called on success
  // -------------------------------------------------------------------------
  it("calls onOpenChange(false) after successful promotion", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    (getPromotionPreview as ReturnType<typeof vi.fn>).mockResolvedValue(
      PREVIEW_NO_LOSSES,
    );
    (promoteFork as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    render(
      <PromoteForkDialog
        {...DEFAULT_PROPS}
        onOpenChange={onOpenChange}
      />,
    );

    const confirmBtn = await screen.findByRole("button", {
      name: /promote to real plan/i,
    });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // -------------------------------------------------------------------------
  // 14. Pre-loaded preview (prop) skips fetching
  // -------------------------------------------------------------------------
  it("uses a pre-loaded preview prop and does not call getPromotionPreview", async () => {
    render(
      <PromoteForkDialog
        {...DEFAULT_PROPS}
        preview={PREVIEW_NO_LOSSES}
      />,
    );

    // Delta summary should be visible immediately (no loading state)
    expect(screen.getByText(/changes vs current plan/i)).toBeInTheDocument();
    expect(getPromotionPreview).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 15. Fetch error shows error state
  // -------------------------------------------------------------------------
  it("shows an error message when getPromotionPreview rejects", async () => {
    (getPromotionPreview as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error"),
    );

    render(<PromoteForkDialog {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(
        screen.getByText(/could not load preview/i),
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 16. Identical plans message when all deltas are zero
  // -------------------------------------------------------------------------
  it("shows 'identical plan' message when all deltas are zero", async () => {
    const zeroDeltas: PromotionPreview = {
      lossList: [],
      deltas: {
        stopCount: 0,
        nightTotal: 0,
        budgetHomeMinor: 0,
        flagWarnings: 0,
        flagInfos: 0,
        transitMinutes: 0,
        drivingMinutes: 0,
        flightCount: 0,
        projectedEndDays: 0,
      },
    };

    render(
      <PromoteForkDialog
        {...DEFAULT_PROPS}
        preview={zeroDeltas}
      />,
    );

    expect(
      screen.getByText(/identical to the current plan/i),
    ).toBeInTheDocument();
  });
});
