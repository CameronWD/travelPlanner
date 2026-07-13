/**
 * Smoke tests for StopsManager — regression gate for the delete confirm flow.
 *
 * Covers: confirm dialog appears on delete, action NOT called on cancel,
 * action IS called on confirm.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/stops", () => ({
  deleteStop: vi.fn().mockResolvedValue({ success: true }),
  moveStop: vi.fn().mockResolvedValue({ success: true }),
  createStop: vi.fn().mockResolvedValue({ success: true }),
  updateStop: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/server/actions/notes", () => ({
  addNote: vi.fn().mockResolvedValue({ success: true }),
  deleteNote: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn().mockResolvedValue({ success: true }),
  deleteAttachment: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/server/actions/items", () => ({
  createItem: vi.fn().mockResolvedValue({ success: true }),
  updateItem: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/server/actions/costs", () => ({
  createCost: vi.fn().mockResolvedValue({ success: true }),
  updateCost: vi.fn().mockResolvedValue({ success: true }),
  deleteCost: vi.fn().mockResolvedValue({ success: true }),
}));

import { deleteStop } from "@/server/actions/stops";
import { StopsManager } from "./stops-manager";
import type { StopCardStop } from "./stop-card";

const seedStops: StopCardStop[] = [
  {
    id: "stop-1",
    name: "Paris",
    country: "France",
    sortOrder: 0,
    chapterId: null,
    notes: null,
    lat: null,
    lng: null,
    timezone: null,
    arriveDate: null,
    departDate: null,
    nights: 3,
    pinned: false,
  },
];

describe("StopsManager — delete confirm flow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clicking delete shows the confirm dialog naming the stop", async () => {
    const user = userEvent.setup();
    render(<StopsManager tripId="trip-1" initialStops={seedStops} />);

    await user.click(screen.getByRole("button", { name: /delete paris/i }));

    expect(
      await screen.findByRole("heading", { name: /Delete "Paris"/i }),
    ).toBeInTheDocument();
    expect(deleteStop).not.toHaveBeenCalled();
  });

  it("cancelling the dialog does NOT call deleteStop", async () => {
    const user = userEvent.setup();
    render(<StopsManager tripId="trip-1" initialStops={seedStops} />);

    await user.click(screen.getByRole("button", { name: /delete paris/i }));
    await screen.findByRole("heading", { name: /Delete "Paris"/i });

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(deleteStop).not.toHaveBeenCalled();
  });

  it("confirming the dialog calls deleteStop with the stop id", async () => {
    const user = userEvent.setup();
    render(<StopsManager tripId="trip-1" initialStops={seedStops} />);

    await user.click(screen.getByRole("button", { name: /delete paris/i }));
    await screen.findByRole("heading", { name: /Delete "Paris"/i });

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteStop).toHaveBeenCalledWith("stop-1");
  });
});
