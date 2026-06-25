import { it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock("@/server/actions/activity", () => ({ markAllRead: vi.fn() }));
import { markAllRead } from "@/server/actions/activity";
import { MarkReadOnView } from "./mark-read-on-view";

beforeEach(() => vi.clearAllMocks());

it("refreshes after a successful mark-read", async () => {
  (markAllRead as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  render(<MarkReadOnView tripId="trip-1" />);
  await waitFor(() => expect(refreshMock).toHaveBeenCalled());
});

it("does not throw and does not refresh when mark-read fails", async () => {
  (markAllRead as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("nope"));
  render(<MarkReadOnView tripId="trip-1" />);
  await waitFor(() => expect(markAllRead).toHaveBeenCalled());
  expect(refreshMock).not.toHaveBeenCalled();
});
