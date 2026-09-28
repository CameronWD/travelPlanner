import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CoverAddPhoto } from "./cover-add-photo";

vi.mock("@/components/trip/home/desktop/cover-uploader-dialog", () => ({
  CoverUploaderDialog: ({ trigger }: { trigger: React.ReactElement }) => trigger,
}));

/**
 * I6: on a coarse pointer (phone/tablet), the trips-page "Add photo" / "Change"
 * pill must be hidden entirely, not just invisible-but-still-tappable — it
 * used to sit `absolute inset-0` over the whole polaroid with
 * `pointer-coarse:opacity-100`, hijacking every tap on the cover.
 */
describe("CoverAddPhoto", () => {
  it("hides the trigger on coarse pointers, but keeps hover/focus reveal for fine pointers", async () => {
    render(<CoverAddPhoto tripId="t1" hasCover={false} />);
    const trigger = await waitFor(() => screen.getByRole("button", { name: /Add photo/ }));
    expect(trigger.className).toContain("pointer-coarse:hidden");
    expect(trigger.className).not.toContain("pointer-coarse:opacity-100");
    expect(trigger.className).toContain("hover:opacity-100");
    expect(trigger.className).toContain("focus-visible:opacity-100");
  });
});
