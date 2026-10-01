import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/welcome", () => ({
  markWelcomeSeen: vi.fn(async () => ({ success: true })),
}));

import { markWelcomeSeen } from "@/server/actions/welcome";
import { WelcomeDialog, WELCOME_COPY } from "./welcome-dialog";
import { subscribeAttention } from "@/lib/attention";

const BODY =
  "It's early days and I need as much feedback as I can get. The speech-bubble button in the bottom corner opens a Feedback note from any page. Big or small, I want to hear it all.";

describe("WelcomeDialog (spec 2026-10-01 §G)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens on mount with the verbatim title, body and one Got it button", () => {
    render(<WelcomeDialog />);
    const dialog = screen.getByRole("dialog", { name: "Welcome to Teepee." });
    expect(dialog).toHaveTextContent(BODY);
    expect(screen.getByRole("button", { name: "Got it" })).toBeInTheDocument();
    expect(WELCOME_COPY).toEqual({ title: "Welcome to Teepee.", body: BODY, button: "Got it" });
    // One action button; the kit's X is chrome, not a second action.
    const buttons = screen.getAllByRole("button").filter((b) => b.textContent !== "Close");
    expect(buttons).toHaveLength(1);
  });

  it("Got it closes it and marks the Welcome seen", async () => {
    render(<WelcomeDialog />);
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(markWelcomeSeen).toHaveBeenCalledTimes(1);
  });

  it("the X marks it seen too", async () => {
    render(<WelcomeDialog />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(markWelcomeSeen).toHaveBeenCalledTimes(1);
  });

  it("Escape marks it seen too — no way to dismiss into never-seen", async () => {
    render(<WelcomeDialog />);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(markWelcomeSeen).toHaveBeenCalledTimes(1);
  });

  it("stays closed when the write fails offline (it returns on the next load instead)", async () => {
    let rejectWrite!: (reason: Error) => void;
    (markWelcomeSeen as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectWrite = reject;
      }),
    );
    render(<WelcomeDialog />);
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await act(async () => {
      rejectWrite(new Error("offline"));
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks the Feedback launcher for attention when it closes", async () => {
    const seen: string[] = [];
    const off = subscribeAttention((t) => seen.push(t));
    try {
      render(<WelcomeDialog />);
      await userEvent.click(screen.getByRole("button", { name: "Got it" }));
      expect(seen).toEqual(["feedback"]);
    } finally {
      off();
    }
  });

  it("a tap outside the sheet marks it seen too", async () => {
    render(<WelcomeDialog />);
    // Radix attaches its outside-pointerdown listener on a macrotask after mount.
    await new Promise((r) => setTimeout(r, 0));
    // This Radix defers a primary-button outside pointerdown until the click
    // that ends the tap, so the test sends both, as a real tap does.
    fireEvent.pointerDown(document.body, { button: 0, pointerType: "touch" });
    fireEvent.click(document.body);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(markWelcomeSeen).toHaveBeenCalledTimes(1);
  });
});
