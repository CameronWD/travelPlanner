import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/lib/standalone", () => ({ isStandalone: vi.fn() }));

import { isStandalone } from "@/lib/standalone";
import { AttachmentLink } from "./attachment-link";

const mockIsStandalone = isStandalone as unknown as ReturnType<typeof vi.fn>;

describe("AttachmentLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("open", vi.fn());
  });

  it("opens a previewable file in a new tab in an ordinary browser tab", () => {
    mockIsStandalone.mockReturnValue(false);
    render(
      <AttachmentLink href="/api/attachments/a1" mime="application/pdf" label="View ticket.pdf">
        ticket.pdf
      </AttachmentLink>,
    );
    const link = screen.getByRole("link", { name: "View ticket.pdf" });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(window.open).toHaveBeenCalledWith("/api/attachments/a1", "_blank", "noopener");
    expect(event.defaultPrevented).toBe(true);
  });

  it("stays in-app inside the installed PWA, so the offline cache can serve it (ADR 0043)", () => {
    mockIsStandalone.mockReturnValue(true);
    render(
      <AttachmentLink href="/api/attachments/a1" mime="application/pdf" label="View ticket.pdf">
        ticket.pdf
      </AttachmentLink>,
    );
    const link = screen.getByRole("link", { name: "View ticket.pdf" });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(window.open).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves a downloadable file alone — a download never navigates", () => {
    mockIsStandalone.mockReturnValue(false);
    render(
      <AttachmentLink href="/api/attachments/a2" mime="application/msword" label="View notes.docx">
        notes.docx
      </AttachmentLink>,
    );
    const link = screen.getByRole("link", { name: "View notes.docx" });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(window.open).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("never renders a target attribute, whatever the context", () => {
    // ADR 0043's invariant: the decision is made at click time, so the markup
    // is identical in both contexts and needs no hydration-sensitive branch.
    mockIsStandalone.mockReturnValue(false);
    render(
      <AttachmentLink href="/api/attachments/a1" mime="application/pdf" label="View ticket.pdf">
        ticket.pdf
      </AttachmentLink>,
    );
    expect(screen.getByRole("link", { name: "View ticket.pdf" })).not.toHaveAttribute("target");
  });
});
