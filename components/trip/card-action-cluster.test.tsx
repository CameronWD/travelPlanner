import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/notes", () => ({
  addNote: vi.fn(),
  deleteNote: vi.fn(),
}));
vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));

import { CardActionCluster } from "./card-action-cluster";

const base = {
  tripId: "t1",
  targetType: "ACCOMMODATION" as const,
  targetId: "x1",
  editLabel: "Edit The Grand Hotel",
  deleteLabel: "Delete The Grand Hotel",
  moreLabel: "More actions for The Grand Hotel",
  currentUserId: "u1",
  notes: [],
  attachments: [],
};

describe("CardActionCluster", () => {
  it("renders a single Edit button when onEdit is provided", () => {
    render(<CardActionCluster {...base} onEdit={() => {}} onDelete={() => {}} />);
    expect(screen.getByRole("button", { name: "Edit The Grand Hotel" })).toBeInTheDocument();
  });

  it("renders the mobile overflow trigger", () => {
    render(<CardActionCluster {...base} onEdit={() => {}} onDelete={() => {}} />);
    expect(
      screen.getByRole("button", { name: "More actions for The Grand Hotel" }),
    ).toBeInTheDocument();
  });

  it("folds Notes, Attachments, and Delete into the overflow menu", async () => {
    const user = userEvent.setup();
    render(<CardActionCluster {...base} onEdit={() => {}} onDelete={() => {}} />);
    await user.click(
      screen.getByRole("button", { name: "More actions for The Grand Hotel" }),
    );
    expect(await screen.findByRole("menuitem", { name: /notes/i })).toBeInTheDocument();
    expect(await screen.findByRole("menuitem", { name: /attachments/i })).toBeInTheDocument();
    expect(await screen.findByRole("menuitem", { name: /delete/i })).toBeInTheDocument();
  });

  it("opens the notes bottom sheet from the overflow menu", async () => {
    const user = userEvent.setup();
    render(<CardActionCluster {...base} onEdit={() => {}} onDelete={() => {}} />);
    await user.click(
      screen.getByRole("button", { name: "More actions for The Grand Hotel" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: /notes/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/add a note/i)).toBeInTheDocument();
  });

  it("omits the overflow menu entirely when nothing foldable is provided", () => {
    render(
      <CardActionCluster
        tripId="t1"
        targetType="ACCOMMODATION"
        targetId="x1"
        editLabel="Edit X"
        deleteLabel="Delete X"
        moreLabel="More actions for X"
        onEdit={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: "More actions for X" })).not.toBeInTheDocument();
  });
});
