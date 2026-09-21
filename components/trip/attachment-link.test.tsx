import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/standalone", () => ({ isStandalone: vi.fn() }));

import { isStandalone } from "@/lib/standalone";
import { AttachmentLink } from "./attachment-link";

const mockIsStandalone = isStandalone as unknown as ReturnType<typeof vi.fn>;

/**
 * Dispatches a click on `el` and reports whether the component's handler
 * prevented it — without letting jsdom attempt the real navigation a plain
 * `<a href>` would otherwise try (jsdom logs "Not implemented: navigation to
 * another Document" for that, which is noise, not signal).
 *
 * The listener sits on `document` and only runs in the bubble phase, after
 * the component's own `onClick` (attached to the `<a>`, closer to the
 * target) has already run and set `defaultPrevented` — so the value it
 * records is the real verdict. It then calls `preventDefault()` itself,
 * purely to stop jsdom acting on whatever verdict it captured.
 */
function clickAndCapture(el: HTMLElement, init?: MouseEventInit): boolean {
  let prevented = false;
  function recordAndSuppress(e: Event) {
    prevented = e.defaultPrevented;
    e.preventDefault();
  }
  document.addEventListener("click", recordAndSuppress);
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  document.removeEventListener("click", recordAndSuppress);
  return prevented;
}

describe("AttachmentLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Truthy by default so the window.open-blocked fallback (tested below)
    // only fires in the test that deliberately asks for it.
    vi.stubGlobal("open", vi.fn().mockReturnValue({} as Window));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens a previewable file in a new tab in an ordinary browser tab", () => {
    mockIsStandalone.mockReturnValue(false);
    render(
      <AttachmentLink href="/api/attachments/a1" mime="application/pdf" label="View ticket.pdf">
        ticket.pdf
      </AttachmentLink>,
    );
    const link = screen.getByRole("link", { name: "View ticket.pdf" });
    const prevented = clickAndCapture(link);
    expect(window.open).toHaveBeenCalledWith("/api/attachments/a1", "_blank", "noopener");
    expect(prevented).toBe(true);
  });

  it("stays in-app inside the installed PWA, so the offline cache can serve it (ADR 0043)", () => {
    mockIsStandalone.mockReturnValue(true);
    render(
      <AttachmentLink href="/api/attachments/a1" mime="application/pdf" label="View ticket.pdf">
        ticket.pdf
      </AttachmentLink>,
    );
    const link = screen.getByRole("link", { name: "View ticket.pdf" });
    const prevented = clickAndCapture(link);
    expect(window.open).not.toHaveBeenCalled();
    expect(prevented).toBe(false);
  });

  it("leaves a downloadable file alone — a download never navigates", () => {
    mockIsStandalone.mockReturnValue(false);
    render(
      <AttachmentLink href="/api/attachments/a2" mime="application/msword" label="View notes.docx">
        notes.docx
      </AttachmentLink>,
    );
    const link = screen.getByRole("link", { name: "View notes.docx" });
    const prevented = clickAndCapture(link);
    expect(window.open).not.toHaveBeenCalled();
    expect(prevented).toBe(false);
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

  it("leaves a modified click (⌘-click, Ctrl-click, etc.) to the browser", () => {
    // A modifier held during the click is the Traveller telling the browser
    // how to open the link — background tab, new window. Any one of them
    // should be enough to back off.
    mockIsStandalone.mockReturnValue(false);
    render(
      <AttachmentLink href="/api/attachments/a1" mime="application/pdf" label="View ticket.pdf">
        ticket.pdf
      </AttachmentLink>,
    );
    const link = screen.getByRole("link", { name: "View ticket.pdf" });
    const prevented = clickAndCapture(link, { metaKey: true });
    expect(window.open).not.toHaveBeenCalled();
    expect(prevented).toBe(false);
  });

  it("falls back to a same-tab navigation when window.open is blocked", () => {
    mockIsStandalone.mockReturnValue(false);
    vi.stubGlobal("open", vi.fn().mockReturnValue(null));
    // jsdom throws on real navigation via `location.href =`; stub location
    // so the fallback assignment can be observed instead of attempted.
    vi.stubGlobal("location", { href: "" });
    render(
      <AttachmentLink href="/api/attachments/a1" mime="application/pdf" label="View ticket.pdf">
        ticket.pdf
      </AttachmentLink>,
    );
    const link = screen.getByRole("link", { name: "View ticket.pdf" });
    const prevented = clickAndCapture(link);
    expect(window.open).toHaveBeenCalledWith("/api/attachments/a1", "_blank", "noopener");
    expect(window.location.href).toBe("/api/attachments/a1");
    expect(prevented).toBe(true);
  });
});
