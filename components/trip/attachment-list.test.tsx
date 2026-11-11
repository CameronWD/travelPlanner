import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState, type FormEvent } from "react";

vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn().mockResolvedValue({ success: true }),
  deleteAttachment: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/image-compress", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/image-compress")>();
  return { ...real, compressImage: vi.fn(async (f: File) => f) };
});

import { uploadAttachment, deleteAttachment } from "@/server/actions/attachments";
import { compressImage } from "@/lib/image-compress";

vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
import { toast } from "@/components/ui/use-toast";

import { AttachmentList } from "./attachment-list";
import type { AttachmentView } from "./attachment-list";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

type UploadResult = Awaited<ReturnType<typeof uploadAttachment>>;

const sampleAttachments: AttachmentView[] = [
  {
    id: "att-1",
    filename: "boarding-pass.pdf",
    mime: "application/pdf",
    size: 102400,
    url: "https://example.com/boarding-pass.pdf",
    uploadedById: "user-1",
    createdAt: new Date("2026-01-01"),
  },
  {
    id: "att-2",
    filename: "hotel-voucher.jpg",
    mime: "image/jpeg",
    size: 204800,
    url: "https://example.com/hotel-voucher.jpg",
    uploadedById: "user-1",
    createdAt: new Date("2026-01-02"),
  },
];

describe("AttachmentList", () => {
  beforeEach(() => vi.clearAllMocks());
  // Unmounting uploads whatever is still staged; let that settle before the
  // next test clears the mocks.
  afterEach(async () => {
    cleanup();
    await new Promise((r) => setTimeout(r, 0));
  });

  it("renders attachment filenames", () => {
    render(
      <AttachmentList
        tripId="trip-1"
        targetType="TRIP"
        attachments={sampleAttachments}
      />,
    );
    expect(screen.getByText("boarding-pass.pdf")).toBeInTheDocument();
    expect(screen.getByText("hotel-voucher.jpg")).toBeInTheDocument();
  });

  it("uploads a globe-scoped attachment with globeId and no tripId", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AttachmentList globeId="g1" targetType="MARKER" targetId="m1" attachments={[]} />,
    );
    await user.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["x"], "tickets.pdf", { type: "application/pdf" }),
    );
    expect(uploadAttachment).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Add 1 file" }));
    expect(uploadAttachment).toHaveBeenCalledTimes(1);
    const fd = vi.mocked(uploadAttachment).mock.calls[0][0] as FormData;
    expect(fd.get("globeId")).toBe("g1");
    expect(fd.get("tripId")).toBeNull();
    expect(fd.get("targetType")).toBe("MARKER");
    expect(fd.get("targetId")).toBe("m1");
  });

  it("uploads a trip-scoped attachment with tripId and no globeId", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} />,
    );
    await user.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["x"], "insurance.pdf", { type: "application/pdf" }),
    );
    expect(uploadAttachment).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Add 1 file" }));
    expect(uploadAttachment).toHaveBeenCalledTimes(1);
    const fd = vi.mocked(uploadAttachment).mock.calls[0][0] as FormData;
    expect(fd.get("tripId")).toBe("trip-1");
    expect(fd.get("globeId")).toBeNull();
  });

  it("delete shows a confirmation dialog naming the file and fires only after confirming", async () => {
    const user = userEvent.setup();
    render(
      <AttachmentList
        tripId="trip-1"
        targetType="TRIP"
        attachments={sampleAttachments}
      />,
    );

    // Click the delete button for the first attachment
    await user.click(
      screen.getByRole("button", { name: /delete boarding-pass\.pdf/i }),
    );

    // Dialog title should appear with the filename
    expect(
      await screen.findByRole("heading", { name: /Delete "boarding-pass\.pdf"\?/i }),
    ).toBeInTheDocument();

    // deleteAttachment must NOT have been called yet
    expect(deleteAttachment).not.toHaveBeenCalled();

    // Confirm deletion
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteAttachment).toHaveBeenCalledWith("att-1");
  });

  it("shows a full dropzone in non-compact mode", () => {
    const { container } = render(
      <AttachmentList tripId="t" targetType="TRIP" attachments={[{ id: "a", filename: "x.pdf", mime: "application/pdf", size: 1000, url: "/x", uploadedById: "u1", createdAt: new Date() }]} />,
    );
    expect(container.querySelector(".border-dashed")).toBeTruthy();
    expect(screen.getByText(/tap or drop files/i)).toBeInTheDocument();
  });

  it("hides the upload trigger when showUpload={false} but still lists files", () => {
    render(
      <AttachmentList
        tripId="trip-1"
        targetType="STOP"
        attachments={[sampleAttachments[0]]}
        showUpload={false}
      />,
    );
    expect(screen.queryByText(/tap or drop files/i)).toBeNull();
    expect(screen.getByText("boarding-pass.pdf")).toBeInTheDocument();
  });

  it("shows '· added {date}' in non-compact mode using the createdAt field", () => {
    render(
      <AttachmentList
        tripId="trip-1"
        targetType="TRIP"
        attachments={[
          {
            id: "att-date",
            filename: "ticket.pdf",
            mime: "application/pdf",
            size: 1024,
            url: "/ticket.pdf",
            uploadedById: "u1",
            // 1 Jan 2026 UTC
            createdAt: new Date("2026-01-01T00:00:00Z"),
          },
        ]}
      />,
    );
    // Should render the added-date annotation
    expect(screen.getByText(/added 1 Jan 2026/i)).toBeInTheDocument();
  });

  it("does NOT show '· added {date}' in compact mode", () => {
    render(
      <AttachmentList
        tripId="trip-1"
        targetType="TRIP"
        compact
        attachments={[
          {
            id: "att-date2",
            filename: "compact.pdf",
            mime: "application/pdf",
            size: 1024,
            url: "/compact.pdf",
            uploadedById: "u1",
            createdAt: new Date("2026-01-01T00:00:00Z"),
          },
        ]}
      />,
    );
    expect(screen.queryByText(/added 1 Jan 2026/i)).toBeNull();
  });

  it("delete does NOT fire when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    render(
      <AttachmentList
        tripId="trip-1"
        targetType="TRIP"
        attachments={sampleAttachments}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /delete boarding-pass\.pdf/i }),
    );
    await screen.findByRole("heading", { name: /Delete "boarding-pass\.pdf"\?/i });

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(deleteAttachment).not.toHaveBeenCalled();
  });

  it("compresses an image before uploading it", async () => {
    const user = userEvent.setup();
    const compressed = new File([new Uint8Array(10)], "photo.webp", { type: "image/webp" });
    vi.mocked(compressImage).mockResolvedValueOnce(compressed);
    const { container } = render(
      <AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} />,
    );

    const raw = new File([new Uint8Array(5000)], "big.jpg", { type: "image/jpeg" });
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, raw);

    expect(compressImage).toHaveBeenCalledWith(raw);
    expect(uploadAttachment).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Add 1 file" }));
    await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(1));
    const fd = vi.mocked(uploadAttachment).mock.calls[0][0] as FormData;
    expect((fd.get("file") as File).name).toBe("photo.webp");
  });

  it("shows the oversize message and never calls the server when compression can't fit the cap", async () => {
    const user = userEvent.setup();
    vi.mocked(compressImage).mockResolvedValueOnce(
      new File([new Uint8Array(5 * 1024 * 1024)], "big.webp", { type: "image/webp" }),
    );
    const { container } = render(
      <AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} />,
    );

    await user.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File([new Uint8Array(10)], "big.jpg", { type: "image/jpeg" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/~4 MB/);
    expect(screen.getByRole("button", { name: "Add files" })).toBeDisabled();
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  describe("staging tray", () => {
    const pdf = (name: string) => new File(["x"], name, { type: "application/pdf" });
    const jpg = (name: string) => new File(["x"], name, { type: "image/jpeg" });
    const fileInput = (c: HTMLElement) => c.querySelector('input[type="file"]') as HTMLInputElement;

    it("stages several picked files with a title box each, filename as placeholder", async () => {
      const user = userEvent.setup();
      const { container } = render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} />);
      await user.upload(fileInput(container), [pdf("a.pdf"), jpg("b.jpg")]);
      expect(await screen.findByRole("textbox", { name: "Title for a.pdf" })).toHaveAttribute("placeholder", "a.pdf");
      expect(screen.getByRole("textbox", { name: "Title for b.jpg" })).toHaveAttribute("placeholder", "b.jpg");
      expect(screen.getByRole("button", { name: "Add 2 files" })).toBeInTheDocument();
      expect(fileInput(container)).toHaveAttribute("multiple");
    });

    it("sends each file in its own request with its title, in order", async () => {
      const user = userEvent.setup();
      const { container } = render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} />);
      await user.upload(fileInput(container), [pdf("a.pdf"), jpg("b.jpg")]);
      await user.type(await screen.findByRole("textbox", { name: "Title for a.pdf" }), "Flight");
      await user.click(screen.getByRole("button", { name: "Add 2 files" }));
      await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(2));
      const [a, b] = vi.mocked(uploadAttachment).mock.calls.map((c) => c[0] as FormData);
      expect(a.get("title")).toBe("Flight");
      expect((a.get("file") as File).name).toBe("a.pdf");
      expect((b.get("file") as File).name).toBe("b.jpg");
      expect(b.get("title")).toBe("");
      await waitFor(() => expect(screen.queryByText("Ready to add")).toBeNull());
    });

    it("refuses a disallowed type on staging and never sends it", async () => {
      const user = userEvent.setup({ applyAccept: false });
      const { container } = render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} />);
      await user.upload(fileInput(container), [new File(["x"], "clip.mp4", { type: "video/mp4" }), pdf("a.pdf")]);
      expect(await screen.findByText("Only PDFs, photos or text files can be added.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Add 1 file" }));
      await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(1));
      expect(((vi.mocked(uploadAttachment).mock.calls[0][0] as FormData).get("file") as File).name).toBe("a.pdf");
    });

    it("keeps a server-rejected file in the tray with its reason and still uploads the rest", async () => {
      const user = userEvent.setup();
      vi.mocked(uploadAttachment)
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, errors: { _: ["This trip is out of space."] } })
        .mockResolvedValueOnce({ success: true });
      const { container } = render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} />);
      await user.upload(fileInput(container), [pdf("a.pdf"), pdf("b.pdf"), pdf("c.pdf")]);
      await user.click(await screen.findByRole("button", { name: "Add 3 files" }));
      await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(3));
      expect(await screen.findByText("This trip is out of space.")).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Title for b.pdf" })).toBeInTheDocument();
      expect(screen.queryByRole("textbox", { name: "Title for a.pdf" })).toBeNull();
      expect(screen.queryByRole("textbox", { name: "Title for c.pdf" })).toBeNull();
      expect(screen.getByRole("button", { name: "Add 1 file" })).toBeInTheDocument();
    });

    it("remove takes a file out of the tray", async () => {
      const user = userEvent.setup();
      const { container } = render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} />);
      await user.upload(fileInput(container), [pdf("a.pdf"), pdf("b.pdf")]);
      await user.click(await screen.findByRole("button", { name: "Remove a.pdf" }));
      expect(screen.getByRole("button", { name: "Add 1 file" })).toBeInTheDocument();
    });

    it("resets the file input so the same file can be picked again", async () => {
      const user = userEvent.setup();
      const { container } = render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} />);
      await user.upload(fileInput(container), pdf("a.pdf"));
      expect(fileInput(container).value).toBe("");
    });

    it.each([
      ["compact", true],
      ["full", false],
    ])("%s: Enter in a title box and the tray's buttons never submit a surrounding form", async (_l, compact) => {
      const user = userEvent.setup();
      const onSubmit = vi.fn((e: FormEvent) => e.preventDefault());
      const { container } = render(
        <form onSubmit={onSubmit}>
          <AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} compact={compact} />
          <button type="submit">Save</button>
        </form>,
      );
      await user.upload(fileInput(container), [pdf("a.pdf"), pdf("b.pdf")]);
      await user.type(await screen.findByRole("textbox", { name: "Title for a.pdf" }), "x{Enter}");
      expect(onSubmit).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Remove a.pdf" }));
      await user.click(screen.getByRole("button", { name: "Add 1 file" }));
      await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(1));
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("retrying a server-rejected file uploads it and clears its error", async () => {
      const user = userEvent.setup();
      vi.mocked(uploadAttachment)
        .mockResolvedValueOnce({ success: false, errors: { _: ["This trip is out of space."] } })
        .mockResolvedValueOnce({ success: true });
      const { container } = render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} />);
      await user.upload(fileInput(container), pdf("a.pdf"));
      await user.click(await screen.findByRole("button", { name: "Add 1 file" }));
      expect(await screen.findByText("This trip is out of space.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Add 1 file" }));
      await waitFor(() => expect(screen.queryByText("Ready to add")).toBeNull());
      expect(uploadAttachment).toHaveBeenCalledTimes(2);
      expect(screen.queryByText("This trip is out of space.")).toBeNull();
    });

    it("prepares picked files one at a time, showing each row as it is checked", async () => {
      const user = userEvent.setup();
      const prepared = [deferred<File>(), deferred<File>(), deferred<File>()];
      prepared.forEach((d) => vi.mocked(compressImage).mockImplementationOnce(() => d.promise));
      const files = [jpg("a.jpg"), jpg("b.jpg"), jpg("c.jpg")];
      const { container } = render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} />);
      await user.upload(fileInput(container), files);

      expect(compressImage).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Preparing…")).toBeInTheDocument();
      await act(async () => prepared[0].resolve(files[0]));
      expect(await screen.findByRole("textbox", { name: "Title for a.jpg" })).toBeInTheDocument();
      expect(compressImage).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("textbox", { name: "Title for c.jpg" })).toBeNull();

      await act(async () => prepared[1].resolve(files[1]));
      await waitFor(() => expect(compressImage).toHaveBeenCalledTimes(3));
      await act(async () => prepared[2].resolve(files[2]));
      expect(await screen.findByRole("button", { name: "Add 3 files" })).toBeInTheDocument();
      expect(screen.queryByText("Preparing…")).toBeNull();
    });

    it("title boxes inside a Field get their own ids, not the Field's", async () => {
      const user = userEvent.setup();
      const { container } = render(
        <Field label="Attachments">
          <AttachmentList tripId="trip-1" targetType="ITEM" targetId="i1" attachments={[]} compact />
        </Field>,
      );
      await user.upload(fileInput(container), [pdf("a.pdf"), pdf("b.pdf")]);
      const a = await screen.findByRole("textbox", { name: "Title for a.pdf" });
      const b = screen.getByRole("textbox", { name: "Title for b.pdf" });
      const fieldId = screen.getByText("Attachments").getAttribute("for");
      expect(a.id).toBeTruthy();
      expect(b.id).toBeTruthy();
      expect(a.id).not.toBe(b.id);
      expect(a.id).not.toBe(fieldId);
      expect(b.id).not.toBe(fieldId);
    });

    describe("when the tray goes away", () => {
      const sentNames = () =>
        vi.mocked(uploadAttachment).mock.calls.map((c) => ((c[0] as FormData).get("file") as File).name);

      it("uploads a staged file with its title and toasts the count", async () => {
        const user = userEvent.setup();
        const { container, unmount } = render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} />);
        await user.upload(fileInput(container), pdf("a.pdf"));
        await user.type(await screen.findByRole("textbox", { name: "Title for a.pdf" }), "Flight");
        unmount();
        await waitFor(() => expect(toast).toHaveBeenCalledWith({ variant: "success", title: "Added 1 file" }));
        expect(uploadAttachment).toHaveBeenCalledTimes(1);
        const fd = vi.mocked(uploadAttachment).mock.calls[0][0] as FormData;
        expect((fd.get("file") as File).name).toBe("a.pdf");
        expect(fd.get("title")).toBe("Flight");
        expect(fd.get("tripId")).toBe("trip-1");
      });

      it("toasts each server rejection by name with its reason", async () => {
        const user = userEvent.setup();
        vi.mocked(uploadAttachment)
          .mockResolvedValueOnce({ success: false, errors: { _: ["This trip is out of space."] } })
          .mockResolvedValueOnce({ success: true });
        const { container, unmount } = render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} />);
        await user.upload(fileInput(container), [pdf("a.pdf"), pdf("b.pdf")]);
        await user.type(await screen.findByRole("textbox", { name: "Title for a.pdf" }), "Flight");
        unmount();
        await waitFor(() =>
          expect(toast).toHaveBeenCalledWith({
            variant: "destructive",
            title: "Couldn't add Flight",
            description: "This trip is out of space.",
          }),
        );
        await waitFor(() => expect(toast).toHaveBeenCalledWith({ variant: "success", title: "Added 1 file" }));
        expect(toast).toHaveBeenCalledTimes(2);
      });

      it("never sends a file that failed its staging check", async () => {
        const user = userEvent.setup({ applyAccept: false });
        const { container, unmount } = render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} />);
        await user.upload(fileInput(container), [new File(["x"], "clip.mp4", { type: "video/mp4" }), pdf("a.pdf")]);
        await screen.findByRole("button", { name: "Add 1 file" });
        unmount();
        await waitFor(() => expect(toast).toHaveBeenCalledWith({ variant: "success", title: "Added 1 file" }));
        expect(sentNames()).toEqual(["a.pdf"]);
      });

      it("a batch already uploading carries on, one request at a time, nothing sent twice", async () => {
        const user = userEvent.setup();
        const replies = [deferred<UploadResult>(), deferred<UploadResult>(), deferred<UploadResult>()];
        replies.forEach((d) => vi.mocked(uploadAttachment).mockImplementationOnce(() => d.promise));
        const { container, unmount } = render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} />);
        await user.upload(fileInput(container), [pdf("a.pdf"), pdf("b.pdf"), pdf("c.pdf")]);
        await user.click(await screen.findByRole("button", { name: "Add 3 files" }));
        await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(1));
        unmount();
        await new Promise((r) => setTimeout(r, 0));
        expect(uploadAttachment).toHaveBeenCalledTimes(1);

        replies[0].resolve({ success: true });
        await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(2));
        await new Promise((r) => setTimeout(r, 0));
        expect(uploadAttachment).toHaveBeenCalledTimes(2);
        replies[1].resolve({ success: false, errors: { _: ["This trip is out of space."] } });
        await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(3));
        replies[2].resolve({ success: true });

        await waitFor(() => expect(toast).toHaveBeenCalledWith({ variant: "success", title: "Added 2 files" }));
        expect(toast).toHaveBeenCalledWith({
          variant: "destructive",
          title: "Couldn't add b.pdf",
          description: "This trip is out of space.",
        });
        expect(sentNames()).toEqual(["a.pdf", "b.pdf", "c.pdf"]);
      });

      it("a file still being prepared is uploaded once it is ready", async () => {
        const user = userEvent.setup();
        const prepared = deferred<File>();
        vi.mocked(compressImage).mockImplementationOnce(() => prepared.promise);
        const { container, unmount } = render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} />);
        const photo = jpg("a.jpg");
        await user.upload(fileInput(container), photo);
        unmount();
        prepared.resolve(photo);
        await waitFor(() => expect(toast).toHaveBeenCalledWith({ variant: "success", title: "Added 1 file" }));
        expect(sentNames()).toEqual(["a.jpg"]);
      });

      it("a file that fails its check after the tray is gone is toasted, not sent", async () => {
        const user = userEvent.setup();
        const prepared = deferred<File>();
        vi.mocked(compressImage).mockImplementationOnce(() => prepared.promise);
        const { container, unmount } = render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} />);
        await user.upload(fileInput(container), jpg("a.jpg"));
        unmount();
        prepared.resolve(new File([new Uint8Array(5 * 1024 * 1024)], "a.webp", { type: "image/webp" }));
        await waitFor(() =>
          expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({ variant: "destructive", title: "Couldn't add a.webp" }),
          ),
        );
        expect(uploadAttachment).not.toHaveBeenCalled();
      });

      it("StrictMode's dev remount neither uploads nor toasts", async () => {
        const user = userEvent.setup();
        const { container } = render(
          <StrictMode>
            <AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} />
          </StrictMode>,
        );
        await user.upload(fileInput(container), pdf("a.pdf"));
        expect(await screen.findByRole("button", { name: "Add 1 file" })).toBeInTheDocument();
        await new Promise((r) => setTimeout(r, 0));
        expect(uploadAttachment).not.toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();
      });

      it("saving a FormDialog with a file staged uploads it", async () => {
        const user = userEvent.setup();
        function Host() {
          const [open, setOpen] = useState(true);
          return (
            <FormDialog open={open} onOpenChange={setOpen} title="Edit item">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setOpen(false);
                }}
              >
                <AttachmentList tripId="trip-1" targetType="ITEM" targetId="i1" attachments={[]} compact />
                <button type="submit">Save</button>
              </form>
            </FormDialog>
          );
        }
        render(<Host />);
        await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, pdf("a.pdf"));
        await user.type(await screen.findByRole("textbox", { name: "Title for a.pdf" }), "Flight");
        await user.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        await waitFor(() => expect(toast).toHaveBeenCalledWith({ variant: "success", title: "Added 1 file" }));
        const fd = vi.mocked(uploadAttachment).mock.calls[0][0] as FormData;
        expect(uploadAttachment).toHaveBeenCalledTimes(1);
        expect((fd.get("file") as File).name).toBe("a.pdf");
        expect(fd.get("title")).toBe("Flight");
        expect(fd.get("targetId")).toBe("i1");
      });
    });

    describe.each([
      ["compact", true],
      ["full", false],
    ])("drag and drop (%s)", (_layout, compact) => {
      const target = () =>
        document.querySelector(`label[for="${document.querySelector('input[type="file"]')!.id}"]`) as HTMLElement;

      it("dropping files onto the upload target stages them", async () => {
        render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} compact={compact} />);
        fireEvent.drop(target(), {
          dataTransfer: { files: [pdf("a.pdf"), new File(["x"], "b.png", { type: "image/png" })] },
        });
        expect(await screen.findByRole("button", { name: "Add 2 files" })).toBeInTheDocument();
        expect(uploadAttachment).not.toHaveBeenCalled();
      });

      it("highlights the target while dragging and clears it on drop", async () => {
        render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} compact={compact} />);
        expect(target()).not.toHaveAttribute("data-dragging");
        fireEvent.dragOver(target(), { dataTransfer: { files: [] } });
        expect(target()).toHaveAttribute("data-dragging", "true");
        fireEvent.drop(target(), { dataTransfer: { files: [pdf("a.pdf")] } });
        expect(target()).not.toHaveAttribute("data-dragging");
        await screen.findByRole("button", { name: "Add 1 file" });
      });

      it("a dropped file of a disallowed type is refused on its row", async () => {
        render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} compact={compact} />);
        fireEvent.drop(target(), {
          dataTransfer: { files: [new File(["x"], "clip.mp4", { type: "video/mp4" })] },
        });
        expect(await screen.findByText("Only PDFs, photos or text files can be added.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /^Add/ })).toBeDisabled();
      });

      it("dragleave clears the highlight", () => {
        render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} compact={compact} />);
        fireEvent.dragOver(target(), { dataTransfer: { files: [] } });
        fireEvent.dragLeave(target());
        expect(target()).not.toHaveAttribute("data-dragging");
      });

      it("dragging over a child of the target keeps the highlight", () => {
        render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} compact={compact} />);
        fireEvent.dragOver(target(), { dataTransfer: { files: [] } });
        const leave = createEvent.dragLeave(target());
        Object.defineProperty(leave, "relatedTarget", { value: target().querySelector("svg") });
        fireEvent(target(), leave);
        expect(target()).toHaveAttribute("data-dragging", "true");
      });

      it("while uploading, the target still takes drops and stages them for later", async () => {
        const user = userEvent.setup();
        const reply = deferred<UploadResult>();
        vi.mocked(uploadAttachment).mockImplementationOnce(() => reply.promise);
        const { container } = render(
          <AttachmentList tripId="trip-1" targetType="TRIP" attachments={[]} compact={compact} />,
        );
        await user.upload(fileInput(container), pdf("a.pdf"));
        await user.click(await screen.findByRole("button", { name: "Add 1 file" }));
        await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(1));
        expect(target()).not.toHaveClass("pointer-events-none");

        fireEvent.dragOver(target(), { dataTransfer: { files: [] } });
        expect(target()).toHaveAttribute("data-dragging", "true");
        fireEvent.drop(target(), { dataTransfer: { files: [pdf("b.pdf")] } });
        expect(await screen.findByRole("textbox", { name: "Title for b.pdf" })).toBeInTheDocument();

        await act(async () => reply.resolve({ success: true }));
        await waitFor(() => expect(screen.queryByRole("textbox", { name: "Title for a.pdf" })).toBeNull());
        expect(screen.getByRole("button", { name: "Add 1 file" })).toBeEnabled();
        expect(uploadAttachment).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ── Playground kit restyle (Task 14) ──────────────────────────────────────

  it("non-compact files are kit Cards in a grid, the upload tile first", () => {
    const { container } = render(
      <AttachmentList tripId="trip-1" targetType="TRIP" attachments={sampleAttachments} />,
    );
    const grid = container.querySelector('[data-slot="file-grid"]');
    expect(grid).not.toBeNull();
    expect(grid).toHaveClass("grid", "lg:grid-cols-3");
    const cards = grid!.querySelectorAll('[data-slot="file-card"]');
    expect(cards).toHaveLength(2);
    for (const card of cards) expect(card).toHaveClass("border-2", "shadow-hard-2");
    // The dashed upload tile is the grid's first cell.
    expect(grid!.firstElementChild!.querySelector('input[type="file"]')).not.toBeNull();
    expect(grid!.firstElementChild!.querySelector("label")).toHaveClass("border-dashed");
  });

  it("phone cards stack like desktop — tile and actions on top, name and meta full-width with a title (W12, LA-123)", () => {
    const { container } = render(
      <AttachmentList tripId="trip-1" targetType="TRIP" attachments={sampleAttachments} showUpload={false} />,
    );
    const card = container.querySelector('[data-slot="file-card"]') as HTMLElement;
    const classes = card.className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["flex-col", "items-start", "sm:flex-row", "sm:items-center", "md:flex-col", "md:items-start"]));
    expect(classes).not.toContain("items-center");
    const actions = screen.getByRole("button", { name: "Delete boarding-pass.pdf" }).parentElement!;
    expect(actions.className.split(/\s+/)).toEqual(expect.arrayContaining(["absolute", "right-2", "top-2", "sm:static", "md:absolute", "md:right-2", "md:top-2"]));
    const name = screen.getByText("boarding-pass.pdf", { selector: "p" });
    expect(name).toHaveAttribute("title", "boarding-pass.pdf");
    expect(name.parentElement!.className.split(/\s+/)).toEqual(expect.arrayContaining(["w-full", "min-w-0", "sm:w-auto", "sm:flex-1", "md:w-full"]));
  });

  it("each file card has a type tile (PDF / IMG) toned by what the file belongs to", () => {
    render(
      <AttachmentList tripId="trip-1" targetType="TRANSPORT" attachments={sampleAttachments} showUpload={false} />,
    );
    const pdf = screen.getByText("PDF", { selector: '[data-slot="file-tile"]' });
    const img = screen.getByText("IMG", { selector: '[data-slot="file-tile"]' });
    expect(pdf).toHaveClass("bg-coral", "text-on-accent");
    expect(img).toHaveClass("bg-coral");
    expect(pdf).toHaveAttribute("aria-hidden", "true");
  });

  it("file links and delete buttons are named with the file name and have 44px targets", () => {
    render(
      <AttachmentList tripId="trip-1" targetType="TRIP" attachments={sampleAttachments} />,
    );
    const link = screen.getByRole("link", { name: "View boarding-pass.pdf" });
    expect(link).toHaveAttribute("href", "https://example.com/boarding-pass.pdf");
    expect(link).toHaveClass("size-11");
    const del = screen.getByRole("button", { name: "Delete hotel-voucher.jpg" });
    expect(del).toHaveClass("size-11");
  });

  it("compact mode keeps its dense list (no kit file cards)", () => {
    const { container } = render(
      <AttachmentList tripId="trip-1" targetType="TRIP" compact attachments={sampleAttachments} />,
    );
    expect(container.querySelector('[data-slot="file-card"]')).toBeNull();
    expect(screen.getByRole("link", { name: "View boarding-pass.pdf" })).toBeInTheDocument();
  });

  it("shows the title in place of the filename when set, with the filename beneath — both layouts", () => {
    const titled: AttachmentView = { ...sampleAttachments[0], id: "t1", filename: "scan-0012.pdf", title: "Hotel voucher" };
    const { unmount } = render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[titled]} showUpload={false} />);
    expect(screen.getByText("Hotel voucher")).toBeInTheDocument();
    expect(screen.getByText(/scan-0012\.pdf/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Hotel voucher" })).toBeInTheDocument();
    unmount();
    render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[titled]} showUpload={false} compact />);
    expect(screen.getByText("Hotel voucher")).toBeInTheDocument();
    expect(screen.getByText("scan-0012.pdf")).toBeInTheDocument();
  });

  it("falls back to the filename when there is no title", () => {
    render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={[{ ...sampleAttachments[0], title: null }]} showUpload={false} />);
    expect(screen.getByText("boarding-pass.pdf")).toBeInTheDocument();
  });

  // Spec 2026-10-04 §K: the Transport, Item, Accommodation and Stop edit
  // dialogs all render this list INSIDE their <form>. A <button> with no
  // type is a submit button, so the trash icon used to save the entity and
  // close the dialog — unmounting the "Delete …?" confirm before it could
  // be answered.
  it.each([
    ["compact", true],
    ["full", false],
  ])("%s: its file buttons never submit a surrounding form", async (_layout, compact) => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: FormEvent) => e.preventDefault());
    const onRename = vi.fn();
    const onLink = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <AttachmentList
          tripId="trip-1"
          targetType="TRANSPORT"
          targetId="transport-1"
          attachments={[sampleAttachments[0]]}
          compact={compact}
          onRename={onRename}
          onLink={onLink}
        />
      </form>,
    );

    for (const name of [
      /rename boarding-pass\.pdf/i,
      /link boarding-pass\.pdf to an item/i,
      /delete boarding-pass\.pdf/i,
    ]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("type", "button");
    }

    await user.click(screen.getByRole("button", { name: /rename boarding-pass\.pdf/i }));
    await user.click(screen.getByRole("button", { name: /link boarding-pass\.pdf to an item/i }));
    await user.click(screen.getByRole("button", { name: /delete boarding-pass\.pdf/i }));

    expect(
      await screen.findByRole("heading", { name: /Delete "boarding-pass\.pdf"\?/i }),
    ).toBeInTheDocument();
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onLink).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteAttachment).toHaveBeenCalledWith("att-1");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("toasts the server's reason when deleteAttachment refuses (spec 2026-10-06 §E)", async () => {
    vi.mocked(deleteAttachment).mockResolvedValueOnce({
      success: false,
      errors: { _: ["You can't delete someone else's file."] },
    });
    const user = userEvent.setup();
    render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={sampleAttachments} />);
    await user.click(screen.getByRole("button", { name: /delete boarding-pass\.pdf/i }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "You can't delete someone else's file." }),
    );
  });
});
