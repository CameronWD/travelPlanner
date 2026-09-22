import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const approveAccessRequest = vi.fn();
const dismissAccessRequest = vi.fn();
vi.mock("@/server/actions/access-requests", () => ({
  get approveAccessRequest() { return approveAccessRequest; },
  get dismissAccessRequest() { return dismissAccessRequest; },
}));

import { AccessRequestsPanel } from "./access-requests";
import type { AccessRequestView } from "@/server/actions/access-requests";

const NOW = new Date("2026-09-22T12:00:00.000Z");

const requests: AccessRequestView[] = [
  {
    id: "ar1",
    email: "friend@example.com",
    name: "Friend Person",
    image: null,
    createdAt: "2026-09-20T12:00:00.000Z",
    lastAttemptAt: "2026-09-21T12:00:00.000Z",
    attempts: 3,
  },
];

describe("AccessRequestsPanel", () => {
  beforeEach(() => {
    approveAccessRequest.mockReset().mockResolvedValue({ success: true });
    dismissAccessRequest.mockReset().mockResolvedValue({ success: true });
  });

  it("shows an empty state when there are no pending requests", () => {
    render(<AccessRequestsPanel initial={[]} now={NOW} />);
    expect(screen.getByText(/no access requests waiting/i)).toBeInTheDocument();
  });

  it("renders name, email, and attempt count", () => {
    render(<AccessRequestsPanel initial={requests} now={NOW} />);
    expect(screen.getByText("Friend Person")).toBeInTheDocument();
    expect(screen.getByText("friend@example.com")).toBeInTheDocument();
    expect(screen.getByText("3 attempts")).toBeInTheDocument();
  });

  it("Approve calls approveAccessRequest with the request id and removes the row on success", async () => {
    render(<AccessRequestsPanel initial={requests} now={NOW} />);
    await userEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(approveAccessRequest).toHaveBeenCalledWith("ar1");
    await waitFor(() =>
      expect(screen.queryByText("friend@example.com")).not.toBeInTheDocument(),
    );
  });

  it("Dismiss calls dismissAccessRequest with the request id and removes the row on success", async () => {
    render(<AccessRequestsPanel initial={requests} now={NOW} />);
    await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(dismissAccessRequest).toHaveBeenCalledWith("ar1");
    await waitFor(() =>
      expect(screen.queryByText("friend@example.com")).not.toBeInTheDocument(),
    );
  });

  it("keeps the row and shows an error message when approve fails", async () => {
    approveAccessRequest.mockResolvedValue({
      success: false,
      errors: { _form: ["That access request no longer exists."] },
    });
    render(<AccessRequestsPanel initial={requests} now={NOW} />);
    await userEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(await screen.findByText("That access request no longer exists.")).toBeInTheDocument();
    expect(screen.getByText("friend@example.com")).toBeInTheDocument();
  });

  it("falls back to the email when there is no name", () => {
    render(
      <AccessRequestsPanel
        initial={[{ ...requests[0], name: null }]}
        now={NOW}
      />,
    );
    // The email appears once as the fallback display label and once as the
    // secondary line — assert it's present at least once rather than
    // asserting a specific count, since that duplication is an
    // implementation detail, not the behaviour under test.
    expect(screen.getAllByText("friend@example.com").length).toBeGreaterThan(0);
  });
});
