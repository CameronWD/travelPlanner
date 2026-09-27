import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/journal", () => ({
  saveJournalEntry: vi.fn().mockResolvedValue({ success: true }),
  deleteJournalEntry: vi.fn().mockResolvedValue({ success: true }),
  setJournalShareHidden: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn().mockResolvedValue({ success: true }),
  deleteAttachment: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/lib/image-compress", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/image-compress")>();
  return { ...real, compressImage: vi.fn(async (f: File) => f) };
});

import {
  saveJournalEntry,
  deleteJournalEntry,
  setJournalShareHidden,
} from "@/server/actions/journal";
import { uploadAttachment } from "@/server/actions/attachments";
import { compressImage } from "@/lib/image-compress";
import { JournalEditor } from "./journal-editor";

const BASE_PROPS = {
  tripId: "trip-1",
  date: "2026-06-01",
  initialBody: "Hello world",
  photo: null,
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

  it("compresses the selected photo before calling uploadAttachment", async () => {
    const user = userEvent.setup();
    const compressedFile = new File([new Uint8Array(10)], "photo.webp", { type: "image/webp" });
    vi.mocked(compressImage).mockResolvedValueOnce(compressedFile);
    const { container } = render(<JournalEditor {...BASE_PROPS} />);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    const rawFile = new File([new Uint8Array(5000)], "big.jpg", { type: "image/jpeg" });
    await user.upload(fileInput, rawFile);

    await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(1));

    expect(compressImage).toHaveBeenCalledWith(rawFile);

    const formData = (uploadAttachment as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as FormData;
    const sent = formData.get("file") as File;
    expect(sent.name).toBe("photo.webp");
    expect(sent.type).toBe("image/webp");
  });

  it("shows the oversize message and skips upload when the photo can't be shrunk under the cap", async () => {
    const user = userEvent.setup();
    const stillHuge = new File([new Uint8Array(5 * 1024 * 1024)], "big.jpg", { type: "image/webp" });
    vi.mocked(compressImage).mockResolvedValueOnce(stillHuge);
    const { container } = render(<JournalEditor {...BASE_PROPS} />);

    await user.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File([new Uint8Array(10)], "big.jpg", { type: "image/jpeg" }),
    );

    expect(await screen.findByText(/~4 MB/)).toBeInTheDocument();
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  // ARCH-DAT-6: removing an entry is an explicit, confirmed action —
  // blanking the textarea must never silently delete (covered by the
  // server-action tests); this component-level suite covers the separate
  // "Remove entry" affordance.
  describe("removing an entry", () => {
    it("does not show a remove control when there is no saved entry yet", () => {
      render(<JournalEditor {...BASE_PROPS} initialBody="" updatedAt={null} />);
      expect(
        screen.queryByRole("button", { name: /remove/i }),
      ).not.toBeInTheDocument();
    });

    it("shows a remove control once an entry exists", () => {
      render(<JournalEditor {...BASE_PROPS} updatedAt={new Date("2026-06-01T10:00:00Z")} />);
      expect(
        screen.getByRole("button", { name: /remove/i }),
      ).toBeInTheDocument();
    });

    it("asks for confirmation before deleting, and does not call deleteJournalEntry until confirmed", async () => {
      const user = userEvent.setup();
      render(<JournalEditor {...BASE_PROPS} updatedAt={new Date("2026-06-01T10:00:00Z")} />);

      await user.click(screen.getByRole("button", { name: /remove/i }));

      expect(await screen.findByRole("heading")).toBeInTheDocument();
      expect(deleteJournalEntry).not.toHaveBeenCalled();
    });

    it("does not delete when the confirmation is cancelled", async () => {
      const user = userEvent.setup();
      render(<JournalEditor {...BASE_PROPS} updatedAt={new Date("2026-06-01T10:00:00Z")} />);

      await user.click(screen.getByRole("button", { name: /remove/i }));
      await screen.findByRole("heading");
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(deleteJournalEntry).not.toHaveBeenCalled();
      // The entry is still there — remove control still shown.
      expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
    });

    it("deletes the entry and clears the textarea once confirmed", async () => {
      const user = userEvent.setup();
      render(<JournalEditor {...BASE_PROPS} updatedAt={new Date("2026-06-01T10:00:00Z")} />);

      await user.click(screen.getByRole("button", { name: /remove/i }));
      await screen.findByRole("heading");
      // Two or more buttons could match "remove" loosely — target the dialog's
      // destructive confirm button precisely by its accessible name.
      await user.click(screen.getByRole("button", { name: /^remove$/i }));

      await waitFor(() => expect(deleteJournalEntry).toHaveBeenCalledWith("trip-1", "2026-06-01"));

      const textarea = screen.getByRole("textbox", { name: /journal entry/i });
      await waitFor(() => expect(textarea).toHaveValue(""));

      // Once removed, the remove control itself disappears again.
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: /^remove/i })).not.toBeInTheDocument(),
      );
    });

    it("ARCH-DAT-6 (fix round 1, Finding 1): a slow in-flight save cannot resurrect an entry that was explicitly removed", async () => {
      const callOrder: string[] = [];
      let resolveSave: (() => void) | undefined;
      vi.mocked(saveJournalEntry).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSave = () => {
              callOrder.push("save-resolved");
              resolve({ success: true });
            };
          }),
      );
      vi.mocked(deleteJournalEntry).mockImplementationOnce(async () => {
        callOrder.push("delete-called");
        return { success: true };
      });

      const user = userEvent.setup();
      render(<JournalEditor {...BASE_PROPS} updatedAt={new Date("2026-06-01T10:00:00Z")} />);

      const textarea = screen.getByRole("textbox", { name: /journal entry/i });
      await user.type(textarea, " more");

      // Open the confirm dialog first, while Remove is still enabled (no
      // save has started yet). This deliberately routes around the
      // Remove-button `disabled={isSaving}` guard and the relatedTarget
      // blur-suppression — jsdom faithfully blocks both userEvent and
      // fireEvent clicks on a genuinely disabled button, so there's no way
      // to reproduce the literal same-gesture mousedown→blur→click browser
      // timing footgun here. What this test isolates instead is the actual
      // correctness mechanism the fix relies on: once a save is in flight,
      // however it started, the pending confirm must not let delete run
      // ahead of it.
      const removeButton = screen.getByRole("button", { name: /^remove entry$/i });
      await user.click(removeButton);
      expect(await screen.findByRole("heading")).toBeInTheDocument();

      // Put a slow save in flight *while the confirm dialog is open and
      // awaiting the Traveller's click* — e.g. focus briefly returning to
      // the textarea, or any other blur source the relatedTarget check
      // doesn't cover.
      fireEvent.blur(textarea);
      expect(saveJournalEntry).toHaveBeenCalledTimes(1);

      // Confirm the removal. The dialog's own "Remove" button isn't gated
      // by isSaving, so this always succeeds.
      await user.click(screen.getByRole("button", { name: /^remove$/i }));

      // The save is still in flight (we haven't resolved it) — deleting
      // must wait for it, not race it.
      expect(deleteJournalEntry).not.toHaveBeenCalled();
      expect(callOrder).toEqual([]);

      // Now let the slow save land.
      resolveSave?.();

      await waitFor(() =>
        expect(deleteJournalEntry).toHaveBeenCalledWith("trip-1", "2026-06-01"),
      );
      // The save must resolve strictly before the delete fires — never the
      // other way round, or the confirmed removal could be undone by a
      // stale upsert landing late.
      expect(callOrder).toEqual(["save-resolved", "delete-called"]);
    });

    it("never uses 'Member' language in visible or assistive-tech copy", () => {
      const { container } = render(
        <JournalEditor {...BASE_PROPS} updatedAt={new Date("2026-06-01T10:00:00Z")} />,
      );
      expect(container.textContent).not.toMatch(/\bmember\b/i);
      expect(document.body.innerHTML).not.toMatch(/aria-label="[^"]*member[^"]*"/i);
    });
  });

  describe("Playground kit shell (Task 12a)", () => {
    it("sits in a kit Card (2px outline, hard shadow), not the old soft-shadow card", () => {
      const { container } = render(<JournalEditor {...BASE_PROPS} />);
      const shell = container.querySelector(".shadow-hard-2") as HTMLElement;
      expect(shell).not.toBeNull();
      expect(shell.className).toMatch(/\bborder-2\b/);
      expect(container.innerHTML).not.toMatch(/shadow-soft|rounded-2xl/);
    });

    it("names the icon-only add-photo control", () => {
      render(<JournalEditor {...BASE_PROPS} />);
      expect(screen.getByLabelText("Add a photo")).toBeInTheDocument();
    });
  });

  // Spec K: a visible "n / 500" counter, server-enforced on new/changed text
  // (lib/journal-window.ts JOURNAL_NOTE_MAX). The client mirrors the same
  // rule (journalBodyExceedsLimit) so Save is disabled before the round trip.
  describe("500-char counter (Task 7 / spec K)", () => {
    it("updates the counter as you type", async () => {
      const user = userEvent.setup();
      render(<JournalEditor {...BASE_PROPS} initialBody="" />);

      const textarea = screen.getByRole("textbox", { name: /journal entry/i });
      await user.type(textarea, "Hello");

      expect(screen.getByRole("status").textContent).toContain("5 / 500");
    });

    it("turns the counter destructive and disables Save once new text exceeds 500 characters", async () => {
      const user = userEvent.setup();
      render(<JournalEditor {...BASE_PROPS} initialBody="" />);

      const textarea = screen.getByRole("textbox", { name: /journal entry/i });
      await user.click(textarea);
      fireEvent.change(textarea, { target: { value: "a".repeat(501) } });

      const status = screen.getByRole("status");
      expect(status.textContent).toContain("501 / 500");
      expect(status.querySelector(".text-destructive")).not.toBeNull();

      const saveButton = screen.getByRole("button", { name: /^save$/i });
      expect(saveButton).toBeDisabled();
      expect(
        screen.getByText(/shorten to under 500 to edit/i),
      ).toBeInTheDocument();
    });

    it("does not autosave on blur while new text is over the limit", async () => {
      render(<JournalEditor {...BASE_PROPS} initialBody="" />);
      const textarea = screen.getByRole("textbox", { name: /journal entry/i });
      fireEvent.change(textarea, { target: { value: "a".repeat(501) } });
      fireEvent.blur(textarea);

      expect(saveJournalEntry).not.toHaveBeenCalled();
    });

    it("re-enables Save once the over-limit text is shortened back under the cap", async () => {
      render(<JournalEditor {...BASE_PROPS} initialBody="" />);
      const textarea = screen.getByRole("textbox", { name: /journal entry/i });
      fireEvent.change(textarea, { target: { value: "a".repeat(501) } });
      fireEvent.change(textarea, { target: { value: "a".repeat(400) } });

      expect(screen.getByRole("button", { name: /^save$/i })).not.toBeDisabled();
      expect(screen.queryByText(/shorten to under 500 to edit/i)).not.toBeInTheDocument();
    });

    it("keeps a legacy note already over 500 chars fully visible and editable, with a shorten-to-edit note, but does not block on the unchanged text", async () => {
      const longBody = "x".repeat(600);
      render(<JournalEditor {...BASE_PROPS} initialBody={longBody} updatedAt={new Date("2026-06-01T10:00:00Z")} />);

      const textarea = screen.getByRole("textbox", { name: /journal entry/i }) as HTMLTextAreaElement;
      // Full legacy text is present, not truncated.
      expect(textarea.value).toHaveLength(600);
      expect(screen.getByRole("status").textContent).toContain("600 / 500");
      // Unchanged from what's stored — no unsaved changes, so no destructive
      // Save-blocking state; the shorten note reflects the length regardless.
      expect(screen.getByText(/shorten to under 500 to edit/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
    });

    it("refuses to save a legacy over-limit entry that was edited but is still over the limit", async () => {
      const longBody = "x".repeat(600);
      render(<JournalEditor {...BASE_PROPS} initialBody={longBody} updatedAt={new Date("2026-06-01T10:00:00Z")} />);

      const textarea = screen.getByRole("textbox", { name: /journal entry/i });
      fireEvent.change(textarea, { target: { value: "y".repeat(550) } });

      expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    });
  });

  describe("photo Replace confirmation (Task 7 / spec K)", () => {
    const EXISTING_PHOTO = {
      id: "photo-1",
      filename: "beach.jpg",
      mime: "image/jpeg",
      size: 10,
      url: "/api/attachments/photo-1",
      uploadedById: "me",
      createdAt: new Date("2026-06-01T09:00:00Z"),
    };

    it("asks for confirmation before replacing an existing photo, then uploads with replace=1", async () => {
      const user = userEvent.setup();
      const { container } = render(<JournalEditor {...BASE_PROPS} photo={EXISTING_PHOTO} />);

      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
      await user.upload(fileInput, new File([new Uint8Array(5)], "new.jpg", { type: "image/jpeg" }));

      // Confirmation dialog appears — the codebase's Dialog, not window.confirm.
      expect(await screen.findByRole("heading", { name: /replace your photo/i })).toBeInTheDocument();
      expect(uploadAttachment).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: /^replace$/i }));

      await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(1));
      const formData = (uploadAttachment as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as FormData;
      expect(formData.get("replace")).toBe("1");
    });

    it("does not upload when the replace confirmation is cancelled", async () => {
      const user = userEvent.setup();
      const { container } = render(<JournalEditor {...BASE_PROPS} photo={EXISTING_PHOTO} />);

      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
      await user.upload(fileInput, new File([new Uint8Array(5)], "new.jpg", { type: "image/jpeg" }));

      await screen.findByRole("heading", { name: /replace your photo/i });
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(uploadAttachment).not.toHaveBeenCalled();
    });

    it("uploads without confirmation, and without replace=1, when there is no existing photo", async () => {
      const user = userEvent.setup();
      const { container } = render(<JournalEditor {...BASE_PROPS} photo={null} />);

      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
      await user.upload(fileInput, new File([new Uint8Array(5)], "new.jpg", { type: "image/jpeg" }));

      await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(1));
      const formData = (uploadAttachment as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as FormData;
      expect(formData.get("replace")).toBeNull();
    });

    it("names the Remove control for an existing photo, and calls deleteAttachment for it", async () => {
      const user = userEvent.setup();
      const { deleteAttachment } = await import("@/server/actions/attachments");
      render(<JournalEditor {...BASE_PROPS} photo={EXISTING_PHOTO} />);

      await user.click(screen.getByRole("button", { name: /remove photo beach\.jpg/i }));

      await waitFor(() => expect(deleteAttachment).toHaveBeenCalledWith("photo-1"));
    });
  });

  describe("'Keep off Share links' switch (spec L)", () => {
    it("defaults to off when no hiddenFromShares prop is given", () => {
      render(<JournalEditor {...BASE_PROPS} />);
      expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    });

    it("starts checked when hiddenFromShares is true", () => {
      render(<JournalEditor {...BASE_PROPS} hiddenFromShares />);
      expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    });

    it("calls setJournalShareHidden with the new value when toggled", async () => {
      const user = userEvent.setup();
      render(<JournalEditor {...BASE_PROPS} />);

      await user.click(screen.getByRole("switch"));

      expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
      await waitFor(() =>
        expect(setJournalShareHidden).toHaveBeenCalledWith("trip-1", "2026-06-01", true),
      );
    });

    // Fix round 1, Finding 4: the switch "applies immediately" (optimistic),
    // but a save that actually fails must roll the switch back and surface
    // the error — silently ignoring the result would leave it showing a
    // state that was never persisted.
    it("rolls the switch back and surfaces an error when setJournalShareHidden fails", async () => {
      vi.mocked(setJournalShareHidden).mockResolvedValueOnce({
        success: false,
        errors: { _: ["Could not update Share link visibility."] },
      });
      const user = userEvent.setup();
      render(<JournalEditor {...BASE_PROPS} />);

      await user.click(screen.getByRole("switch"));

      await waitFor(() =>
        expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false"),
      );
      expect(
        screen.getByText("Could not update Share link visibility."),
      ).toBeInTheDocument();
    });

    it("clears a previous error once a later toggle succeeds", async () => {
      vi.mocked(setJournalShareHidden).mockResolvedValueOnce({
        success: false,
        errors: { _: ["Could not update Share link visibility."] },
      });
      const user = userEvent.setup();
      render(<JournalEditor {...BASE_PROPS} />);

      await user.click(screen.getByRole("switch"));
      await waitFor(() =>
        expect(screen.getByText("Could not update Share link visibility.")).toBeInTheDocument(),
      );

      await user.click(screen.getByRole("switch"));

      await waitFor(() =>
        expect(
          screen.queryByText("Could not update Share link visibility."),
        ).not.toBeInTheDocument(),
      );
      expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    });
  });

  describe("framed shell (Task 7)", () => {
    it("wraps in a kit Card by default", () => {
      const { container } = render(<JournalEditor {...BASE_PROPS} />);
      expect(container.querySelector(".shadow-hard-2")).not.toBeNull();
    });

    it("renders bare (no nested Card) when framed=false", () => {
      const { container } = render(<JournalEditor {...BASE_PROPS} framed={false} />);
      expect(container.querySelector(".shadow-hard-2")).toBeNull();
    });
  });
});
