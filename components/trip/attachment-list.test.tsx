import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEvent } from "react";

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
    // Kit copy (was "Drop files or browse"); nothing handles a drop, so "tap to add".
    expect(screen.getByText(/tap to add a file/i)).toBeInTheDocument();
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
    expect(screen.queryByText(/tap to add a file/i)).toBeNull();
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
    expect(uploadAttachment).not.toHaveBeenCalled();
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
    vi.mocked(deleteAttachment).mockResolvedValueOnce({ success: false, error: "You can't delete someone else's file." });
    const user = userEvent.setup();
    render(<AttachmentList tripId="trip-1" targetType="TRIP" attachments={sampleAttachments} />);
    await user.click(screen.getByRole("button", { name: /delete boarding-pass\.pdf/i }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "You can't delete someone else's file." }),
    );
  });
});
