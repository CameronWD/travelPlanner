import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/trip/note-thread", () => ({ NoteThread: () => <div>note thread</div> }));
vi.mock("@/components/trip/attachment-list", () => ({ AttachmentList: () => <div>attachment list</div> }));

import { StopExtrasDialog } from "./stop-extras-dialog";

describe("StopExtrasDialog (spec D2)", () => {
  const base = { onOpenChange: vi.fn(), tripId: "t1", stopId: "par", stopName: "Paris", notes: [], attachments: [], currentUserId: "u1",
    reminders: [{ id: "r1", title: "Book the Louvre", date: "2026-11-20", stopId: "par", stopName: "Paris" }] };
  it("notes hosts the NoteThread", () => {
    render(<StopExtrasDialog kind="notes" {...base} />);
    expect(screen.getByRole("dialog", { name: "Notes · Paris" })).toHaveTextContent("note thread");
  });
  it("files hosts the AttachmentList", () => {
    render(<StopExtrasDialog kind="files" {...base} />);
    expect(screen.getByRole("dialog", { name: "Files · Paris" })).toHaveTextContent("attachment list");
  });
  it("reminders lists them with their day and offers Add a reminder", async () => {
    const onAddReminder = vi.fn();
    render(<StopExtrasDialog kind="reminders" {...base} onAddReminder={onAddReminder} />);
    expect(screen.getByText("Book the Louvre")).toBeInTheDocument();
    expect(screen.getByText("Fri 20 Nov")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add a reminder" }));
    expect(onAddReminder).toHaveBeenCalled();
  });
  it("closed when kind is null", () => {
    render(<StopExtrasDialog kind={null} {...base} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
