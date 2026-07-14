import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn().mockResolvedValue({ success: true }),
  deleteAttachment: vi.fn().mockResolvedValue({ success: true }),
}));
import { uploadAttachment, deleteAttachment } from "@/server/actions/attachments";

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
    expect(screen.getByText(/browse/i)).toBeInTheDocument();
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
    expect(screen.queryByText(/browse/i)).toBeNull();
    expect(screen.getByText("boarding-pass.pdf")).toBeInTheDocument();
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
});
