import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

const setTripCoverMock = vi.fn();
const removeTripCoverMock = vi.fn();
vi.mock("@/server/actions/cover", () => ({
  setTripCover: (...args: unknown[]) => setTripCoverMock(...args),
  removeTripCover: (...args: unknown[]) => removeTripCoverMock(...args),
}));

import { CoverImageField } from "./cover-image-field";

beforeEach(() => {
  vi.clearAllMocks();
  setTripCoverMock.mockResolvedValue({ success: true });
  removeTripCoverMock.mockResolvedValue({ success: true });
});

describe("CoverImageField", () => {
  it("renders a file input", () => {
    render(<CoverImageField tripId="t1" hasCover={false} />);
    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
  });

  it("selecting a file calls setTripCover with FormData containing tripId and the file, then calls router.refresh()", async () => {
    const user = userEvent.setup();
    render(<CoverImageField tripId="t1" hasCover={false} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    const file = new File(["img-data"], "photo.png", { type: "image/png" });
    await user.upload(fileInput, file);

    await waitFor(() => expect(setTripCoverMock).toHaveBeenCalledTimes(1));

    const formData: FormData = setTripCoverMock.mock.calls[0][0];
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get("tripId")).toBe("t1");
    expect(formData.get("file")).toBe(file);

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  it("shows a Remove button when hasCover is true, clicking it calls removeTripCover(tripId); Remove is absent when hasCover is false", async () => {
    const user = userEvent.setup();

    // hasCover = true: Remove button present
    const { rerender } = render(<CoverImageField tripId="t1" hasCover={true} />);
    const removeBtn = screen.getByRole("button", { name: /remove/i });
    expect(removeBtn).toBeInTheDocument();

    await user.click(removeBtn);
    await waitFor(() => expect(removeTripCoverMock).toHaveBeenCalledWith("t1"));

    // hasCover = false: Remove button absent
    rerender(<CoverImageField tripId="t1" hasCover={false} />);
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });
});
