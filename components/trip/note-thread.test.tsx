/**
 * Smoke tests for NoteThread — regression gate for the delete confirm flow.
 *
 * Covers: confirm dialog appears on delete, action NOT called on cancel,
 * action IS called on confirm.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/notes", () => ({
  addNote: vi.fn().mockResolvedValue({ success: true }),
  deleteNote: vi.fn().mockResolvedValue({ success: true }),
}));

import { deleteNote } from "@/server/actions/notes";
import { NoteThread } from "./note-thread";
import type { NoteView } from "./note-thread";

const seedNotes: NoteView[] = [
  {
    id: "note-1",
    body: "Remember to book tickets in advance.",
    createdAt: new Date("2026-01-01T10:00:00Z"),
    author: { id: "user-1", name: "Alice", image: null },
  },
];

function renderInline() {
  return render(
    <NoteThread
      tripId="trip-1"
      targetType="STOP"
      targetId="stop-1"
      notes={seedNotes}
      currentUserId="user-1"
      inline
    />,
  );
}

describe("NoteThread — delete confirm flow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clicking delete shows the confirm dialog with the note excerpt", async () => {
    const user = userEvent.setup();
    renderInline();

    await user.click(screen.getByRole("button", { name: /delete note/i }));

    expect(
      await screen.findByRole("heading", { name: /Delete "Remember to book tickets in advance/i }),
    ).toBeInTheDocument();
    expect(deleteNote).not.toHaveBeenCalled();
  });

  it("cancelling the dialog does NOT call deleteNote", async () => {
    const user = userEvent.setup();
    renderInline();

    await user.click(screen.getByRole("button", { name: /delete note/i }));
    await screen.findByRole("heading", { name: /delete/i });

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(deleteNote).not.toHaveBeenCalled();
  });

  it("confirming the dialog calls deleteNote with the note id", async () => {
    const user = userEvent.setup();
    renderInline();

    await user.click(screen.getByRole("button", { name: /delete note/i }));
    await screen.findByRole("heading", { name: /delete/i });

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteNote).toHaveBeenCalledWith("note-1");
  });
});
