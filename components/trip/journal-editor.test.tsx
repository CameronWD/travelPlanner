import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/journal", () => ({
  saveJournalEntry: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn().mockResolvedValue({ success: true }),
  deleteAttachment: vi.fn().mockResolvedValue({ success: true }),
}));

import { saveJournalEntry } from "@/server/actions/journal";
import { JournalEditor } from "./journal-editor";

const BASE_PROPS = {
  tripId: "trip-1",
  date: "2026-06-01",
  initialBody: "Hello world",
  photos: [],
};

describe("JournalEditor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a 'Saving…' status and then 'Saved' status after a blur-save", async () => {
    const user = userEvent.setup();
    render(<JournalEditor {...BASE_PROPS} />);

    const textarea = screen.getByRole("textbox", { name: /journal entry/i });

    // Change the body so blur triggers a save
    await user.clear(textarea);
    await user.type(textarea, "Updated text");

    // Trigger blur to fire autosave
    await user.tab();

    // The status element should appear (Saving… or Saved)
    const status = await waitFor(() => screen.getByRole("status"));
    expect(status).toBeTruthy();
    expect(saveJournalEntry).toHaveBeenCalledWith(
      "trip-1",
      "2026-06-01",
      "Updated text",
    );

    // After resolution the status should show "Saved"
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toMatch(/saved/i);
    });
  });

  it("does not trigger a save on blur when the body is unchanged", async () => {
    const user = userEvent.setup();
    render(<JournalEditor {...BASE_PROPS} />);

    const textarea = screen.getByRole("textbox", { name: /journal entry/i });
    // Focus then blur without changing the content
    await user.click(textarea);
    await user.tab();

    expect(saveJournalEntry).not.toHaveBeenCalled();
  });
});
