import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn().mockResolvedValue({ success: true }),
  deleteAttachment: vi.fn().mockResolvedValue({ success: true }),
}));
import { deleteAttachment } from "@/server/actions/attachments";

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
