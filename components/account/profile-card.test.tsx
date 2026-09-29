import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TravellerLike } from "@/lib/traveller";

/**
 * Tests for the Account card (Task 1): a "Display name" input + Save, and
 * the Profile photo controls (CONTEXT.md "Profile photo and display name").
 * Renders through `TravellerAvatar` (Task 2), same as everywhere else.
 */

const {
  setDisplayNameMock,
  setProfilePhotoMock,
  setProfilePhotoFocalMock,
  removeProfilePhotoMock,
  compressImageMock,
} = vi.hoisted(() => ({
  setDisplayNameMock: vi.fn().mockResolvedValue({ success: true }),
  setProfilePhotoMock: vi.fn().mockResolvedValue({ success: true }),
  setProfilePhotoFocalMock: vi.fn(async () => ({ success: true })),
  removeProfilePhotoMock: vi.fn().mockResolvedValue({ success: true }),
  compressImageMock: vi.fn(),
}));

vi.mock("@/server/actions/profile", () => ({
  setDisplayName: setDisplayNameMock,
  setProfilePhoto: setProfilePhotoMock,
  setProfilePhotoFocal: setProfilePhotoFocalMock,
  removeProfilePhoto: removeProfilePhotoMock,
}));
vi.mock("@/lib/image-compress", () => ({ compressImage: compressImageMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
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

  it("offers Reposition when there is a photo, opening the focus picker; none without a photo", async () => {
    const user = userEvent.setup();
    const picker = { name: "Choose the part of your photo to keep in view" };
    const { rerender } = render(
      <ProfileCard user={{ ...baseUser, photoKey: "k", photoUpdatedAt: new Date(0) }} />,
    );
    expect(screen.queryByRole("button", picker)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Reposition" }));
    expect(screen.getByRole("button", picker)).toBeInTheDocument();
    rerender(<ProfileCard key="no-photo" user={{ ...baseUser, photoKey: null }} />);
    expect(screen.queryByRole("button", { name: "Reposition" })).toBeNull();
    expect(screen.queryByRole("button", picker)).toBeNull();
  });

  it("uploads the compressed picture as-is (no square crop) so it can be reframed later", async () => {
    const user = userEvent.setup();
    const compressed = new File(["compressed"], "orig.jpg", { type: "image/jpeg" });
    compressImageMock.mockResolvedValue(compressed);
    // Give the browser a working canvas, so any square re-encode before
    // upload would actually produce a different File (jsdom has none, and a
    // crop that silently fell back to the original would pass vacuously).
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 200, height: 100 })));
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((cb) => cb(new Blob(["square"], { type: "image/jpeg" })));
    try {
      render(<ProfileCard user={baseUser} />);
      await user.upload(
        screen.getByLabelText("Profile photo"),
        new File(["raw"], "raw.jpg", { type: "image/jpeg" }),
      );
      expect(setProfilePhotoMock).toHaveBeenCalledOnce();
      const fd = setProfilePhotoMock.mock.calls[0]![0] as FormData;
      expect(fd.get("file")).toBe(compressed);
      // The picker opens on the fresh picture so it can be framed right away.
      expect(
        await screen.findByRole("button", { name: "Choose the part of your photo to keep in view" }),
      ).toBeInTheDocument();
    } finally {
      getContext.mockRestore();
      toBlob.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("saves the point picked on the photo as fractions across and down", async () => {
    const user = userEvent.setup();
    render(<ProfileCard user={{ ...baseUser, photoKey: "k", photoUpdatedAt: new Date(0) }} />);
    await user.click(screen.getByRole("button", { name: "Reposition" }));
    const picker = screen.getByRole("button", {
      name: "Choose the part of your photo to keep in view",
    });
    vi.spyOn(picker, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
    } as DOMRect);
    fireEvent.pointerDown(picker, { clientX: 50, clientY: 80 });
    fireEvent.pointerUp(picker, { clientX: 50, clientY: 80 });
    await waitFor(() => expect(setProfilePhotoFocalMock).toHaveBeenCalledWith(0.25, 0.8));
    expect(screen.getByTestId("profile-focal-marker").style.left).toBe("25%");
  });
});
