import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/journal", () => ({
  saveJournalEntry: vi.fn().mockResolvedValue({ success: true }),
  deleteJournalEntry: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn().mockResolvedValue({ success: true }),
  deleteAttachment: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/lib/image-compress", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/image-compress")>();
  return { ...real, compressImage: vi.fn(async (f: File) => f) };
});

import { saveJournalEntry, deleteJournalEntry } from "@/server/actions/journal";
import { uploadAttachment } from "@/server/actions/attachments";
import { compressImage } from "@/lib/image-compress";
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

    it("never uses 'Member' language in visible or assistive-tech copy", () => {
      const { container } = render(
        <JournalEditor {...BASE_PROPS} updatedAt={new Date("2026-06-01T10:00:00Z")} />,
      );
      expect(container.textContent).not.toMatch(/\bmember\b/i);
      expect(document.body.innerHTML).not.toMatch(/aria-label="[^"]*member[^"]*"/i);
    });
  });
});
