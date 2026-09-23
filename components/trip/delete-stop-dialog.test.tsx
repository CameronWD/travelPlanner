import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mock server actions BEFORE importing the component (hoisting)
// ---------------------------------------------------------------------------

vi.mock("@/server/actions/stops", () => ({
  previewStopDeletion: vi.fn(),
  deleteStop: vi.fn(),
}));
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));

import { previewStopDeletion, deleteStop } from "@/server/actions/stops";
import type { StopDeletionPreview } from "@/server/actions/stops";
import { toast } from "@/components/ui/use-toast";
import { DeleteStopDialog } from "./delete-stop-dialog";
import { formatMoney } from "@/lib/money";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PREVIEW_NO_LOSSES: StopDeletionPreview = {
  accommodations: [],
  unpaidCosts: [],
  attachmentCount: 0,
  noteCount: 0,
};

const PREVIEW_WITH_LOSSES: StopDeletionPreview = {
  accommodations: [
    { id: "acc-1", name: "Hotel Bristol", hasConfirmation: true },
    { id: "acc-2", name: "Hostel Nomad", hasConfirmation: false },
  ],
  unpaidCosts: [{ id: "cost-1", label: "Museum tickets", costMinor: 4200, currency: "EUR" }],
  attachmentCount: 2,
  noteCount: 1,
};

const DEFAULT_PROPS = {
  stopId: "stop-1",
  stopName: "Rome",
  open: true,
  onOpenChange: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DeleteStopDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (deleteStop as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
  });

  it("shows a loading state while the preview is being fetched", () => {
    (previewStopDeletion as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    render(<DeleteStopDialog {...DEFAULT_PROPS} />);

    expect(screen.getByText(/loading preview/i)).toBeInTheDocument();
  });

  it("renders a dialog title containing the stop name", async () => {
    (previewStopDeletion as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      preview: PREVIEW_NO_LOSSES,
    });

    render(<DeleteStopDialog {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText(/Delete "Rome"\?/)).toBeInTheDocument();
    });
  });

  it("does NOT render a loss list when the preview has nothing to lose", async () => {
    (previewStopDeletion as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      preview: PREVIEW_NO_LOSSES,
    });

    render(<DeleteStopDialog {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText(/this can.t be undone/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/will also destroy/i)).not.toBeInTheDocument();
  });

  it("itemises Accommodations, unpaid Costs, attachment and note counts when the preview has losses", async () => {
    (previewStopDeletion as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      preview: PREVIEW_WITH_LOSSES,
    });

    render(<DeleteStopDialog {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText(/deleting this stop will also destroy/i)).toBeInTheDocument();
    });

    // Accommodation that holds a confirmation number says so...
    expect(screen.getByText(/Hotel Bristol — holds a confirmation number/)).toBeInTheDocument();
    // ...but one that doesn't, doesn't claim to.
    expect(screen.getByText("Hostel Nomad")).toBeInTheDocument();
    expect(screen.queryByText(/Hostel Nomad — holds/)).not.toBeInTheDocument();

    // Unpaid cost, formatted via the shared money helper. formatMoney embeds
    // a non-breaking space between currency code and amount, which RTL's
    // string-matcher normalizer doesn't collapse to match a plain literal —
    // so match loosely on textContent instead of an exact getByText string.
    expect(screen.getByText(/Museum tickets/).textContent).toContain(formatMoney(4200, "EUR"));

    // Attachment / note counts.
    expect(screen.getByText(/2 files/)).toBeInTheDocument();
    expect(screen.getByText(/1 note/)).toBeInTheDocument();
  });

  it("never renders a confirmation number VALUE, even when one exists", async () => {
    const preview: StopDeletionPreview = {
      accommodations: [{ id: "acc-1", name: "Hotel Bristol", hasConfirmation: true }],
      unpaidCosts: [],
      attachmentCount: 0,
      noteCount: 0,
    };
    (previewStopDeletion as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      preview,
    });

    const { container } = render(<DeleteStopDialog {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText(/holds a confirmation number/)).toBeInTheDocument();
    });
    // The preview type has no field to even carry a raw value (StopDeletionPreview
    // only has `hasConfirmation: boolean`), so this is belt-and-braces: confirm
    // nothing resembling a confirmation code renders in the DOM.
    expect(container.textContent).not.toMatch(/[A-Z0-9]{6,}/);
  });

  it("does not add a name-typing gate — Delete is enabled as soon as the preview loads", async () => {
    (previewStopDeletion as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      preview: PREVIEW_WITH_LOSSES,
    });

    render(<DeleteStopDialog {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
    });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("calls deleteStop with the stop id when Delete is clicked", async () => {
    const user = userEvent.setup();
    (previewStopDeletion as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      preview: PREVIEW_NO_LOSSES,
    });

    render(<DeleteStopDialog {...DEFAULT_PROPS} />);

    const deleteBtn = await screen.findByRole("button", { name: "Delete" });
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(deleteStop).toHaveBeenCalledWith("stop-1");
    });
  });

  it("closes the dialog after a successful delete", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    (previewStopDeletion as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      preview: PREVIEW_NO_LOSSES,
    });

    render(<DeleteStopDialog {...DEFAULT_PROPS} onOpenChange={onOpenChange} />);

    const deleteBtn = await screen.findByRole("button", { name: "Delete" });
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("ARCH-DAT-1: surfaces the server refusal as a toast when deleteStop resolves success:false", async () => {
    const user = userEvent.setup();
    (previewStopDeletion as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      preview: PREVIEW_NO_LOSSES,
    });
    (deleteStop as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      errors: { _: ["Only the trip owner can delete a Stop."] },
    });

    render(<DeleteStopDialog {...DEFAULT_PROPS} />);

    const deleteBtn = await screen.findByRole("button", { name: "Delete" });
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: "Only the trip owner can delete a Stop.",
        }),
      );
    });
  });

  it("shows an error message when previewStopDeletion rejects, but Delete still works", async () => {
    const user = userEvent.setup();
    (previewStopDeletion as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

    render(<DeleteStopDialog {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText(/could not load preview/i)).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole("button", { name: "Delete" });
    expect(deleteBtn).toBeEnabled();
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(deleteStop).toHaveBeenCalledWith("stop-1");
    });
  });

  it("renders nothing when closed", () => {
    render(<DeleteStopDialog {...DEFAULT_PROPS} open={false} />);
    expect(screen.queryByText(/Delete "Rome"/)).not.toBeInTheDocument();
    expect(previewStopDeletion).not.toHaveBeenCalled();
  });
});
