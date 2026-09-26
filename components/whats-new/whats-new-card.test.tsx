import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("@/server/actions/release-notes", () => ({
  dismissWhatsNew: vi.fn(async () => ({ success: true })),
}));

import { dismissWhatsNew } from "@/server/actions/release-notes";
import { WhatsNewCard } from "./whats-new-card";

const NOTES = [
  { publishedAt: "2026-09-21T12:00:00Z", text: "Alpha" },
  { publishedAt: "2026-09-21T11:00:00Z", text: "Bravo" },
  { publishedAt: "2026-09-21T10:00:00Z", text: "Charlie" },
];

describe("WhatsNewCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when there is no unread news", () => {
    const { container } = render(<WhatsNewCard notes={[]} totalUnread={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists the notes it was given", () => {
    render(<WhatsNewCard notes={NOTES} totalUnread={3} />);
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Bravo")).toBeTruthy();
    expect(screen.getByText("Charlie")).toBeTruthy();
  });

  it("points at the full list when more went unshown than fitted", () => {
    render(<WhatsNewCard notes={NOTES} totalUnread={7} />);
    const link = screen.getByRole("link", { name: /4 more/i });
    expect(link.getAttribute("href")).toBe("/whats-new");
  });

  it("does not offer an overflow link when everything unread is on the card", () => {
    render(<WhatsNewCard notes={NOTES} totalUnread={3} />);
    expect(screen.queryByRole("link", { name: /more/i })).toBeNull();
  });

  it("dismisses the whole release, not just the notes it showed", async () => {
    render(<WhatsNewCard notes={NOTES} totalUnread={7} />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss what's new/i }));
    await waitFor(() => expect(dismissWhatsNew).toHaveBeenCalledTimes(1));
  });

  it("hides immediately on dismiss, without waiting for the server", async () => {
    render(<WhatsNewCard notes={NOTES} totalUnread={3} />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss what's new/i }));
    await waitFor(() => expect(screen.queryByText("Alpha")).toBeNull());
  });

  it("applies a caller className to its root, so a page can space it from what follows", () => {
    const { container } = render(<WhatsNewCard notes={NOTES} totalUnread={1} className="mb-6" />);
    expect(container.firstElementChild).toHaveClass("mb-6");
  });

  it("stays hidden when the dismiss fails offline", async () => {
    let rejectDismiss!: (reason: Error) => void;
    (dismissWhatsNew as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectDismiss = reject;
      }),
    );

    render(<WhatsNewCard notes={NOTES} totalUnread={3} />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss what's new/i }));

    // Hidden the instant it is clicked, before the server has answered.
    expect(screen.queryByText("Alpha")).toBeNull();

    // Now let the write fail. The card must NOT come back under the cursor —
    // it returns on the next online load instead.
    await act(async () => {
      rejectDismiss(new Error("offline"));
    });
    expect(screen.queryByText("Alpha")).toBeNull();
  });
});
