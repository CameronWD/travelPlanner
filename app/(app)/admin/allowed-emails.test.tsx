import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const revokeAllowedEmail = vi.fn();
vi.mock("@/server/actions/access-requests", () => ({
  get revokeAllowedEmail() { return revokeAllowedEmail; },
}));

import { AllowedEmailsPanel } from "./allowed-emails";
import type { AllowedEmailView } from "@/server/actions/access-requests";

const NOW = new Date("2026-09-22T12:00:00.000Z");

const entries: AllowedEmailView[] = [
  {
    id: "ae1",
    email: "friend@example.com",
    note: "Approved from an Access request",
    createdAt: "2026-09-01T00:00:00.000Z",
    revocable: true,
  },
  {
    id: "ae2",
    email: "ops@example.com",
    note: "Approved from an Access request",
    createdAt: "2026-08-01T00:00:00.000Z",
    revocable: true,
  },
  {
    id: "env:bootstrap@example.com",
    email: "bootstrap@example.com",
    note: "Set via ALLOWED_EMAILS — not revocable here",
    createdAt: null,
    revocable: false,
  },
];

describe("AllowedEmailsPanel", () => {
  beforeEach(() => {
    revokeAllowedEmail.mockReset().mockResolvedValue({ success: true });
  });

  it("shows an empty state when there are no entries", () => {
    render(<AllowedEmailsPanel initial={[]} now={NOW} viewerEmail={null} />);
    expect(screen.getByText(/no addresses on the allowlist yet/i)).toBeInTheDocument();
  });

  it("renders every entry's email", () => {
    render(<AllowedEmailsPanel initial={entries} now={NOW} viewerEmail={null} />);
    expect(screen.getByText("friend@example.com")).toBeInTheDocument();
    expect(screen.getByText("ops@example.com")).toBeInTheDocument();
    expect(screen.getByText("bootstrap@example.com")).toBeInTheDocument();
  });

  it("offers no Revoke button for a non-revocable (ALLOWED_EMAILS) entry", () => {
    render(<AllowedEmailsPanel initial={entries} now={NOW} viewerEmail={null} />);
    expect(
      screen.queryByRole("button", { name: /revoke bootstrap@example\.com/i }),
    ).not.toBeInTheDocument();
    // The note text also contains "not revocable here" as a substring, so
    // this asserts on the badge specifically rather than the phrase overall.
    expect(screen.getAllByText(/not revocable here/i).length).toBeGreaterThan(0);
  });

  it("Revoke asks for confirmation before calling revokeAllowedEmail", async () => {
    render(<AllowedEmailsPanel initial={entries} now={NOW} viewerEmail={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Revoke friend@example.com" }));

    expect(revokeAllowedEmail).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: /revoke friend@example\.com\?/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(revokeAllowedEmail).toHaveBeenCalledWith("ae1");
    await waitFor(() =>
      expect(screen.queryByText("friend@example.com")).not.toBeInTheDocument(),
    );
  });

  it("cancelling the confirmation does not call revokeAllowedEmail", async () => {
    render(<AllowedEmailsPanel initial={entries} now={NOW} viewerEmail={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Revoke friend@example.com" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(revokeAllowedEmail).not.toHaveBeenCalled();
  });

  // The lockout-in-reverse this whole panel exists to prevent: never even
  // offer the control for the acting admin's own row, on top of the
  // server-side refusal in revokeAllowedEmail itself.
  it("offers no Revoke button for the viewer's own address", () => {
    render(<AllowedEmailsPanel initial={entries} now={NOW} viewerEmail="ops@example.com" />);
    expect(
      screen.queryByRole("button", { name: "Revoke ops@example.com" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/that.?s you/i)).toBeInTheDocument();
    // The other, non-viewer row is unaffected.
    expect(screen.getByRole("button", { name: "Revoke friend@example.com" })).toBeInTheDocument();
  });

  it("keeps the row and shows an error message when revoke fails", async () => {
    revokeAllowedEmail.mockResolvedValue({
      success: false,
      errors: { _form: ["You can't revoke your own address."] },
    });
    render(<AllowedEmailsPanel initial={entries} now={NOW} viewerEmail={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Revoke friend@example.com" }));
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(await screen.findByText("You can't revoke your own address.")).toBeInTheDocument();
    expect(screen.getByText("friend@example.com")).toBeInTheDocument();
  });
});
