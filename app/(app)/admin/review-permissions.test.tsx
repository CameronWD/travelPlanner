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

  it("puts the old value back and says why when the save is refused", async () => {
    setReviewPermission.mockResolvedValue({ success: false, errors: { _: ["That account no longer exists."] } });
    render(<ReviewPermissionsPanel initial={rows} />);
    await userEvent.click(within(group("pat@example.com")).getByRole("radio", { name: "Unlimited" }));
    expect(await screen.findByText("That account no longer exists.")).toBeInTheDocument();
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
});
