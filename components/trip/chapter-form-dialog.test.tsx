import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/chapters", () => ({
  createChapter: vi.fn().mockResolvedValue({ success: true }),
  updateChapter: vi.fn().mockResolvedValue({ success: true }),
}));
import { createChapter, updateChapter } from "@/server/actions/chapters";

import { ChapterFormDialog } from "./chapter-form-dialog";
import type { ChapterFormDialogChapter } from "./chapter-form-dialog";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const baseProps = {
  tripId: "trip-1",
  open: true,
  onOpenChange: vi.fn(),
};

const existingChapter: ChapterFormDialogChapter = {
  id: "chapter-99",
  name: "France",
  colour: "blue",
  startDate: "2026-06-01",
  endDate: "2026-06-15",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ChapterFormDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  // -------------------------------------------------------------------------
  // Case 1: renders in add mode with the correct heading
  // -------------------------------------------------------------------------
  it("renders in add mode with the correct heading", () => {
    render(<ChapterFormDialog {...baseProps} />);
    expect(
      screen.getByRole("heading", { name: /add chapter/i }),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 2: renders the name field
  // -------------------------------------------------------------------------
  it("renders the name field when open", () => {
    render(<ChapterFormDialog {...baseProps} />);
    expect(screen.getByPlaceholderText(/e\.g\. france/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 3: submitting calls createChapter with the entered name
  // -------------------------------------------------------------------------
  it("submitting calls createChapter with the entered name", async () => {
    const user = userEvent.setup();
    render(<ChapterFormDialog {...baseProps} />);

    const nameInput = screen.getByPlaceholderText(/e\.g\. france/i);
    await user.type(nameInput, "Germany");

    await user.click(screen.getByRole("button", { name: /add chapter/i }));

    expect(createChapter).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ name: "Germany" }),
      undefined,
      undefined,
    );
    expect(createChapter).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Case 4: submitting with empty name still calls createChapter (no client-side guard)
  // -------------------------------------------------------------------------
  it("submitting with empty name still calls createChapter (server-side validation)", async () => {
    const user = userEvent.setup();
    render(<ChapterFormDialog {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /add chapter/i }));

    expect(createChapter).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ name: "" }),
      undefined,
      undefined,
    );
  });

  // -------------------------------------------------------------------------
  // Case 5: edit mode — heading shows chapter name, updateChapter is called
  // -------------------------------------------------------------------------
  it("in edit mode renders the correct heading and calls updateChapter on submit", async () => {
    const user = userEvent.setup();
    render(<ChapterFormDialog {...baseProps} chapter={existingChapter} />);

    expect(
      screen.getByRole("heading", { name: /edit france/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(updateChapter).toHaveBeenCalledWith(
      "chapter-99",
      expect.objectContaining({ name: "France" }),
    );
    expect(createChapter).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Case 6: server-returned field error is displayed
  // -------------------------------------------------------------------------
  it("renders a server-returned name field error after submit", async () => {
    const { createChapter: mockCreateChapter } = await import(
      "@/server/actions/chapters"
    );
    (mockCreateChapter as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { name: ["Name is required"] },
    });

    const user = userEvent.setup();
    render(<ChapterFormDialog {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /add chapter/i }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Case 7: server-returned _form error appears with role=alert
  // -------------------------------------------------------------------------
  it("a server-returned _form error appears with role=alert", async () => {
    const { createChapter: mockCreateChapter } = await import(
      "@/server/actions/chapters"
    );
    (mockCreateChapter as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      errors: { _form: ["Something went wrong on the server"] },
    });

    const user = userEvent.setup();
    render(<ChapterFormDialog {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /add chapter/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong on the server");
  });

  // -------------------------------------------------------------------------
  // Case 8: forkId is forwarded to createChapter
  // -------------------------------------------------------------------------
  it("forwards forkId to createChapter when provided", async () => {
    const user = userEvent.setup();
    render(<ChapterFormDialog {...baseProps} forkId="fork-42" />);

    const nameInput = screen.getByPlaceholderText(/e\.g\. france/i);
    await user.type(nameInput, "Italy");

    await user.click(screen.getByRole("button", { name: /add chapter/i }));

    expect(createChapter).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({ name: "Italy" }),
      undefined,
      "fork-42",
    );
  });
});
