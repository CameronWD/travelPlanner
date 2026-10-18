import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setReviewPermission = vi.fn();
vi.mock("@/server/actions/review-permission", () => ({
  get setReviewPermission() { return setReviewPermission; },
}));

import { ReviewPermissionsPanel } from "./review-permissions";
import type { ReviewPermissionView } from "@/server/actions/review-permission";

const rows: ReviewPermissionView[] = [
  { userId: "u1", email: "cam@example.com", name: "Cam", permission: "UNLIMITED" },
  { userId: "u2", email: "pat@example.com", name: "Pat", permission: "OFF" },
];

const group = (email: string) => screen.getByRole("radiogroup", { name: `Reviews for ${email}` });

describe("ReviewPermissionsPanel (R12)", () => {
  beforeEach(() => {
    setReviewPermission.mockReset().mockResolvedValue({ success: true, permission: "LIMITED" });
  });

  it("shows each account with Off, Limited and Unlimited, its current one on", () => {
    render(<ReviewPermissionsPanel initial={rows} />);
    expect(screen.getByText("Cam")).toBeInTheDocument();
    expect(screen.getByText("pat@example.com")).toBeInTheDocument();
    expect(within(group("cam@example.com")).getByRole("radio", { name: "Unlimited" })).toHaveAttribute("aria-checked", "true");
    expect(within(group("pat@example.com")).getByRole("radio", { name: "Off" })).toHaveAttribute("aria-checked", "true");
    expect(within(group("pat@example.com")).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Off", "Limited", "Unlimited"]);
  });

  it("saves a change on click", async () => {
    render(<ReviewPermissionsPanel initial={rows} />);
    await userEvent.click(within(group("pat@example.com")).getByRole("radio", { name: "Limited" }));
    expect(setReviewPermission).toHaveBeenCalledWith("u2", "LIMITED");
    await waitFor(() =>
      expect(within(group("pat@example.com")).getByRole("radio", { name: "Limited" })).toHaveAttribute("aria-checked", "true"),
    );
  });

  it("puts the old value back and names the account in the refusal message", async () => {
    setReviewPermission.mockResolvedValue({ success: false, errors: { _: ["That account no longer exists."] } });
    render(<ReviewPermissionsPanel initial={rows} />);
    await userEvent.click(within(group("pat@example.com")).getByRole("radio", { name: "Unlimited" }));
    expect(await screen.findByText("Pat: That account no longer exists.")).toBeInTheDocument();
    expect(within(group("pat@example.com")).getByRole("radio", { name: "Off" })).toHaveAttribute("aria-checked", "true");
  });

  it("ignores a click on the value already on (Radix sends an empty value)", async () => {
    render(<ReviewPermissionsPanel initial={rows} />);
    await userEvent.click(within(group("cam@example.com")).getByRole("radio", { name: "Unlimited" }));
    expect(setReviewPermission).not.toHaveBeenCalled();
  });

  it("has an empty state", () => {
    render(<ReviewPermissionsPanel initial={[]} />);
    expect(screen.getByText("No accounts yet.")).toBeInTheDocument();
  });

  // Fix round 1: pending is a Set of ids, not one id, so finishing row A's
  // save doesn't re-enable row B's control while row B's own save is still in flight.
  it("keeps row B disabled while its own save is in flight, even after row A's finishes first", async () => {
    let resolveB: (r: { success: true; permission: "UNLIMITED" }) => void = () => {};
    setReviewPermission.mockImplementation((userId: string) => {
      if (userId === "u1") return Promise.resolve({ success: true, permission: "LIMITED" });
      return new Promise((resolve) => {
        resolveB = resolve;
      });
    });
    render(<ReviewPermissionsPanel initial={rows} />);

    await userEvent.click(within(group("pat@example.com")).getByRole("radio", { name: "Unlimited" })); // u2, row B, stays pending
    await userEvent.click(within(group("cam@example.com")).getByRole("radio", { name: "Off" })); // u1, row A, resolves immediately

    await waitFor(() => expect(within(group("cam@example.com")).getByRole("radio", { name: "Off" })).not.toBeDisabled());
    expect(within(group("pat@example.com")).getByRole("radio", { name: "Unlimited" })).toBeDisabled();

    resolveB({ success: true, permission: "UNLIMITED" });
    await waitFor(() => expect(within(group("pat@example.com")).getByRole("radio", { name: "Unlimited" })).not.toBeDisabled());
  });
});
