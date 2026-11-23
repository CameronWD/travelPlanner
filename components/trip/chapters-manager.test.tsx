import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/chapters", () => ({
  deleteChapter: vi.fn(),
  suggestChaptersFromCountries: vi.fn(),
}));
vi.mock("./chapter-form-dialog", () => ({ ChapterFormDialog: () => null }));

import { deleteChapter } from "@/server/actions/chapters";
import { ChaptersManager } from "./chapters-manager";

const chapters = [{ id: "c1", name: "Alps", colour: "teal", startDate: null, endDate: null }] as never;

describe("ChaptersManager delete in flight", () => {
  beforeEach(() => vi.clearAllMocks());
  it("marks the row's delete busy until the action settles", async () => {
    let resolve!: (v: { success: true }) => void;
    vi.mocked(deleteChapter).mockReturnValueOnce(new Promise((r) => { resolve = r; }) as never);
    const user = userEvent.setup();
    render(<ChaptersManager tripId="t1" chapters={chapters} />);
    const del = screen.getByRole("button", { name: "Delete Alps" });
    await user.click(del);
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(del).toHaveAttribute("aria-busy", "true"));
    expect(del).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit Alps" })).toBeDisabled();
    del.click();
    expect(deleteChapter).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ success: true }));
    await waitFor(() => expect(del).not.toHaveAttribute("aria-busy"));
  });
});
