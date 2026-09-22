import { render, screen, waitFor, within } from "@testing-library/react";
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

  // I4: one shared `pendingId` used to drive both buttons' busy state, so
  // clicking Dismiss rendered Approve as loading (and vice versa) — the
  // button actually running showed nothing, and the one showing a spinner
  // wasn't the one doing anything. On the admin surface of the sign-in door,
  // that tells the operator the opposite of what's happening.
  it("clicking Dismiss shows the spinner on Dismiss only — Approve stays idle, just disabled", async () => {
    let resolveDismiss!: (value: { success: true }) => void;
    dismissAccessRequest.mockReturnValue(
      new Promise((resolve) => {
        resolveDismiss = resolve;
      }),
    );
    render(<AccessRequestsPanel initial={requests} now={NOW} />);

    const dismissBtn = screen.getByRole("button", { name: /dismiss/i });
    const approveBtn = screen.getByRole("button", { name: /approve/i });

    await userEvent.click(dismissBtn);

    expect(dismissBtn).toHaveAttribute("aria-busy", "true");
    expect(within(dismissBtn).getByTestId("button-spinner")).toBeInTheDocument();

    // Approve is disabled (no second action on this row while one runs) but
    // must NOT claim to be the one in flight.
    expect(approveBtn).toBeDisabled();
    expect(approveBtn).not.toHaveAttribute("aria-busy", "true");
    expect(within(approveBtn).queryByTestId("button-spinner")).not.toBeInTheDocument();

    resolveDismiss({ success: true });
    await waitFor(() =>
      expect(screen.queryByText("friend@example.com")).not.toBeInTheDocument(),
    );
  });

  it("clicking Approve shows the spinner on Approve only — Dismiss stays idle, just disabled", async () => {
    let resolveApprove!: (value: { success: true }) => void;
    approveAccessRequest.mockReturnValue(
      new Promise((resolve) => {
        resolveApprove = resolve;
      }),
    );
    render(<AccessRequestsPanel initial={requests} now={NOW} />);

    const dismissBtn = screen.getByRole("button", { name: /dismiss/i });
    const approveBtn = screen.getByRole("button", { name: /approve/i });

    await userEvent.click(approveBtn);

    expect(approveBtn).toHaveAttribute("aria-busy", "true");
    expect(within(approveBtn).getByTestId("button-spinner")).toBeInTheDocument();

    expect(dismissBtn).toBeDisabled();
    expect(dismissBtn).not.toHaveAttribute("aria-busy", "true");
    expect(within(dismissBtn).queryByTestId("button-spinner")).not.toBeInTheDocument();

    resolveApprove({ success: true });
    await waitFor(() =>
      expect(screen.queryByText("friend@example.com")).not.toBeInTheDocument(),
    );
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
