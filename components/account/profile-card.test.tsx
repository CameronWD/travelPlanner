import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TravellerLike } from "@/lib/traveller";

/**
 * Tests for the Account card (Task 1): a "Display name" input + Save, and
 * the Profile photo controls (CONTEXT.md "Profile photo and display name").
 * Renders through `TravellerAvatar` (Task 2), same as everywhere else.
 */

const { setDisplayNameMock, setProfilePhotoMock, removeProfilePhotoMock } = vi.hoisted(() => ({
  setDisplayNameMock: vi.fn().mockResolvedValue({ success: true }),
  setProfilePhotoMock: vi.fn().mockResolvedValue({ success: true }),
  removeProfilePhotoMock: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/server/actions/profile", () => ({
  setDisplayName: setDisplayNameMock,
  setProfilePhoto: setProfilePhotoMock,
  removeProfilePhoto: removeProfilePhotoMock,
}));

import { ProfileCard } from "./profile-card";

const baseUser: TravellerLike = {
  id: "u1",
  name: "Cameron Williams",
  image: null,
  displayName: null,
  photoKey: null,
  photoUpdatedAt: null,
  email: "cam@example.com",
};

afterEach(() => vi.clearAllMocks());

describe("ProfileCard", () => {
  it("renders the current display name in an input labelled 'Display name'", () => {
    render(<ProfileCard user={{ ...baseUser, displayName: "Cam" }} />);
    const input = screen.getByLabelText("Display name") as HTMLInputElement;
    expect(input.value).toBe("Cam");
  });

  it("falls back to the provider name when no display name is set", () => {
    render(<ProfileCard user={baseUser} />);
    const input = screen.getByLabelText("Display name") as HTMLInputElement;
    expect(input.value).toBe("Cameron Williams");
  });

  it("shows no 'Remove photo' button when there is no photo", () => {
    render(<ProfileCard user={baseUser} />);
    expect(
      screen.queryByRole("button", { name: "Remove photo" }),
    ).not.toBeInTheDocument();
  });

  it("shows a 'Remove photo' button when a photo is set", () => {
    render(
      <ProfileCard
        user={{ ...baseUser, photoKey: "users/u1/x.png", photoUpdatedAt: new Date(1) }}
      />,
    );
    expect(screen.getByRole("button", { name: "Remove photo" })).toBeInTheDocument();
  });

  it("calls setDisplayName with the edited name on Save", async () => {
    const user = userEvent.setup();
    render(<ProfileCard user={baseUser} />);
    const input = screen.getByLabelText("Display name");
    await user.clear(input);
    await user.type(input, "Cam");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(setDisplayNameMock).toHaveBeenCalledWith("Cam");
  });

  it("calls removeProfilePhoto when 'Remove photo' is pressed", async () => {
    const user = userEvent.setup();
    render(
      <ProfileCard
        user={{ ...baseUser, photoKey: "users/u1/x.png", photoUpdatedAt: new Date(1) }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(removeProfilePhotoMock).toHaveBeenCalled();
  });

  // Fix round 1 (Important): all three buttons are `size="sm"` (36px,
  // components/ui/button.tsx) — on a coarse pointer each needs the same
  // 44px-hit-area overlay devices-panel.tsx's SM_HIT already provides
  // (design-ask D1), not a locally-duplicated copy of the class string.
  it("grows every button's hit area to 44px on a coarse pointer (SM_HIT, reused from devices-panel)", () => {
    render(
      <ProfileCard
        user={{ ...baseUser, photoKey: "users/u1/x.png", photoUpdatedAt: new Date(1) }}
      />,
    );
    for (const name of ["Change photo", "Remove photo", "Save"]) {
      const button = screen.getByRole("button", { name });
      expect(button.className).toMatch(/pointer-coarse:after:absolute/);
      expect(button.className).toMatch(/pointer-coarse:after:content-\[''\]/);
    }
  });
});
