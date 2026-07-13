import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
vi.mock("@/server/actions/attachments", () => ({ uploadAttachment: vi.fn(), deleteAttachment: vi.fn() }));
import { AttachmentPopover } from "@/components/trip/attachment-popover";
import type { AttachmentView } from "@/components/trip/attachment-list";

const sampleAttachments: AttachmentView[] = [
  {
    id: "a1",
    filename: "boarding.pdf",
    mime: "application/pdf",
    size: 10,
    url: "/api/attachments/a1",
    uploadedById: "user-1",
    createdAt: new Date("2026-01-01"),
  },
];

describe("AttachmentPopover", () => {
  it("shows the count and opens the list", async () => {
    render(
      <AttachmentPopover
        tripId="t1"
        targetType="TRANSPORT"
        targetId="tr1"
        attachments={sampleAttachments}
      />,
    );
    const trigger = screen.getByRole("button", { name: /attachment/i });
    expect(trigger).toHaveTextContent("1");
    await userEvent.click(trigger);
    expect(screen.getByText("boarding.pdf")).toBeInTheDocument();
  });

  it("shows no count when attachments array is empty", () => {
    render(
      <AttachmentPopover
        tripId="t1"
        targetType="STOP"
        targetId="s1"
        attachments={[]}
      />,
    );
    const trigger = screen.getByRole("button", { name: /attachment/i });
    // no count badge — only the icon
    expect(trigger).not.toHaveTextContent(/\d/);
  });
});
