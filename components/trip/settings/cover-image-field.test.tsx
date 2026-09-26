import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock("@/server/actions/cover", () => ({
  setTripCover: vi.fn().mockResolvedValue({ success: true }),
  removeTripCover: vi.fn().mockResolvedValue({ success: true }),
  setCoverFocal: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/lib/image-compress", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/image-compress")>();
  return { ...real, compressImage: vi.fn(async (f: File) => f) };
});
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { setTripCover, removeTripCover, setCoverFocal } from "@/server/actions/cover";
import { compressImage } from "@/lib/image-compress";
import { toast } from "@/components/ui/use-toast";
import { CoverImageField } from "./cover-image-field";

function fileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

describe("CoverImageField", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a file input", () => {
    const { container } = render(<CoverImageField tripId="t1" hasCover={false} />);
    expect(fileInput(container)).not.toBeNull();
  });

  it("selecting a file calls setTripCover with FormData containing tripId and the file, then calls router.refresh()", async () => {
    const user = userEvent.setup();
    const { container } = render(<CoverImageField tripId="t1" hasCover={false} />);

    const file = new File(["img-data"], "photo.png", { type: "image/png" });
    await user.upload(fileInput(container), file);

    await waitFor(() => expect(setTripCover).toHaveBeenCalledTimes(1));

    const formData = vi.mocked(setTripCover).mock.calls[0][0];
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get("tripId")).toBe("t1");
    expect(formData.get("file")).toBe(file);

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  it("shows a Remove button when hasCover is true, clicking it calls removeTripCover(tripId); Remove is absent when hasCover is false", async () => {
    const user = userEvent.setup();

    const { rerender } = render(<CoverImageField tripId="t1" hasCover={true} />);
    const removeBtn = screen.getByRole("button", { name: /remove/i });
    expect(removeBtn).toBeInTheDocument();

    await user.click(removeBtn);
    await waitFor(() => expect(removeTripCover).toHaveBeenCalledWith("t1"));

    rerender(<CoverImageField tripId="t1" hasCover={false} />);
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });

  it("compresses the selected file before calling setTripCover", async () => {
    const user = userEvent.setup();
    const compressedFile = new File([new Uint8Array(10)], "photo.webp", { type: "image/webp" });
    vi.mocked(compressImage).mockResolvedValueOnce(compressedFile);
    const { container } = render(<CoverImageField tripId="t1" hasCover={false} />);

    const rawFile = new File([new Uint8Array(5000)], "big.jpg", { type: "image/jpeg" });
    await user.upload(fileInput(container), rawFile);

    await waitFor(() => expect(setTripCover).toHaveBeenCalledTimes(1));
    expect(compressImage).toHaveBeenCalledWith(rawFile);

    const sent = vi.mocked(setTripCover).mock.calls[0][0].get("file") as File;
    expect(sent.name).toBe("photo.webp");
    expect(sent.type).toBe("image/webp");
  });

  it("surfaces the server's own error message when the action fails", async () => {
    const user = userEvent.setup();
    vi.mocked(setTripCover).mockResolvedValueOnce({
      success: false,
      error: "Upload failed — nothing was saved. Please try again.",
    });
    const { container } = render(<CoverImageField tripId="t1" hasCover={false} />);

    await user.upload(
      fileInput(container),
      new File([new Uint8Array(10)], "c.jpg", { type: "image/jpeg" }),
    );

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Upload failed — nothing was saved. Please try again.",
      }),
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("shows the oversize message and never calls the action when compression can't fit the cap", async () => {
    const user = userEvent.setup();
    const stillHuge = new File([new Uint8Array(5 * 1024 * 1024)], "big.heic", { type: "image/heic" });
    vi.mocked(compressImage).mockResolvedValueOnce(stillHuge);
    const { container } = render(<CoverImageField tripId="t1" hasCover={false} />);

    await user.upload(
      fileInput(container),
      new File([new Uint8Array(10)], "big.heic", { type: "image/heic" }),
    );

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/~4 MB/) }),
    );
    expect(setTripCover).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("no longer blames file size for an unexplained throw", async () => {
    const user = userEvent.setup();
    vi.mocked(setTripCover).mockRejectedValueOnce(new Error("boom"));
    const { container } = render(<CoverImageField tripId="t1" hasCover={false} />);

    await user.upload(
      fileInput(container),
      new File([new Uint8Array(10)], "c.jpg", { type: "image/jpeg" }),
    );

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Upload failed. Please try again." }),
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  describe("focal-point picker (spec E2)", () => {
    it("is absent while the trip has no cover photo", () => {
      render(<CoverImageField tripId="t1" hasCover={false} />);
      expect(screen.queryByRole("button", { name: /focal point/i })).not.toBeInTheDocument();
    });

    it("shows the cover photo whole, so a click maps straight onto it", () => {
      render(<CoverImageField tripId="t1" hasCover={true} coverVersion="k1" />);
      const picker = screen.getByRole("button", { name: /focal point/i });
      const img = picker.querySelector("img")!;
      expect(img.getAttribute("src")).toBe("/api/trips/t1/cover?v=k1");
      expect(img.className).toContain("h-auto");
    });

    it("clicking at (25%, 75%) of the preview calls setCoverFocal(tripId, 0.25, 0.75), then refreshes", async () => {
      render(<CoverImageField tripId="t1" hasCover={true} />);
      const picker = screen.getByRole("button", { name: /focal point/i });
      picker.getBoundingClientRect = () =>
        ({ left: 100, top: 20, width: 200, height: 100, right: 300, bottom: 120, x: 100, y: 20, toJSON: () => ({}) }) as DOMRect;
      fireEvent.click(picker, { clientX: 150, clientY: 95 });
      await waitFor(() => expect(setCoverFocal).toHaveBeenCalledWith("t1", 0.25, 0.75));
      await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    });

    it("marks the saved focal point on the preview", () => {
      render(<CoverImageField tripId="t1" hasCover={true} focalX={0.3} focalY={0.6} />);
      const marker = screen.getByTestId("cover-focal-marker");
      expect(marker.style.left).toBe("30%");
      expect(marker.style.top).toBe("60%");
    });
  });
});
