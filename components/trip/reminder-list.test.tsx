import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { reminderItem } from "@/test/helpers/reminder-item";

const { deleteReminder, updateReminder } = vi.hoisted(() => ({
  deleteReminder: vi.fn().mockResolvedValue({ success: true }),
  updateReminder: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("@/server/actions/reminders", () => ({ addReminder: vi.fn(), deleteReminder, updateReminder }));

import { ReminderList } from "./reminder-list";

describe("ReminderList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists each Reminder with its day and folded notes", () => {
    render(<ReminderList reminders={[reminderItem({ id: "r1", title: "Book the Louvre", date: "2026-11-20", notes: "Timed entry" })]} />);
    expect(screen.getByRole("list", { name: "Reminders" })).toBeInTheDocument();
    expect(screen.getByText("Book the Louvre")).toBeInTheDocument();
    expect(screen.getByText("Fri 20 Nov")).toBeInTheDocument();
    expect(screen.getByText("Timed entry")).not.toBeVisible();
  });

  it("offers Add a reminder only when it can, as a non-submitting button", async () => {
    const onAdd = vi.fn();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const { rerender } = render(<ReminderList reminders={[]} />);
    expect(screen.queryByRole("button", { name: "Add a reminder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    rerender(<form onSubmit={onSubmit}><ReminderList reminders={[]} onAdd={onAdd} /></form>);
    await userEvent.setup().click(screen.getByRole("button", { name: "Add a reminder" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Delete asks first, then calls deleteReminder with the id", async () => {
    const user = userEvent.setup();
    render(<ReminderList reminders={[reminderItem({ id: "r1", title: "Book the Louvre", date: "2026-11-20" })]} />);
    await user.click(screen.getByRole("button", { name: "Delete reminder: Book the Louvre" }));
    expect(deleteReminder).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteReminder).toHaveBeenCalledWith("r1"));
  });

  it("Cancelling the confirm deletes nothing", async () => {
    const user = userEvent.setup();
    render(<ReminderList reminders={[reminderItem({ id: "r1", title: "Book the Louvre", date: "2026-11-20" })]} />);
    await user.click(screen.getByRole("button", { name: "Delete reminder: Book the Louvre" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(deleteReminder).not.toHaveBeenCalled();
  });

  it("Edit opens the dialog prefilled and saves through updateReminder without submitting an outer form", async () => {
    const user = userEvent.setup();
    const outerSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={outerSubmit}>
        <ReminderList reminders={[reminderItem({ id: "r1", title: "Book the Louvre", date: "2026-11-20", notes: "Timed" })]} />
      </form>,
    );
    await user.click(screen.getByRole("button", { name: "Edit reminder: Book the Louvre" }));
    expect(await screen.findByRole("heading", { name: "Edit reminder" })).toBeInTheDocument();
    expect(screen.getByLabelText(/reminder title/i)).toHaveValue("Book the Louvre");
    await user.click(screen.getByRole("button", { name: /save reminder/i }));
    await waitFor(() => expect(updateReminder).toHaveBeenCalledWith("r1", { title: "Book the Louvre", date: "2026-11-20", notes: "Timed" }));
    expect(outerSubmit).not.toHaveBeenCalled();
  });

  it("lists a past Reminder dimmed under Earlier, with Delete", () => {
    render(
      <ReminderList
        reminders={[
          reminderItem({ id: "r1", title: "Soon", date: "2026-11-20" }),
          reminderItem({ id: "r0", title: "Gone by", date: "2026-11-10", past: true }),
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Earlier" })).toBeInTheDocument();
    const earlier = screen.getByRole("list", { name: "Earlier reminders" });
    expect(within(earlier).getByText("Gone by")).toBeInTheDocument();
    expect(earlier.querySelector("li")).toHaveClass("opacity-60");
    expect(within(earlier).getByRole("button", { name: "Delete reminder: Gone by" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Reminders" })).queryByText("Gone by")).not.toBeInTheDocument();
  });

  it("shows a dismissed Reminder muted with Dismissed and Bring back, which un-dismisses", async () => {
    const user = userEvent.setup();
    render(<ReminderList reminders={[reminderItem({ id: "r1", title: "Print docs", date: "2026-11-20", dismissed: true })]} />);
    expect(screen.getByText("Dismissed")).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveClass("opacity-60");
    await user.click(screen.getByRole("button", { name: "Bring back reminder: Print docs" }));
    await waitFor(() => expect(updateReminder).toHaveBeenCalledWith("r1", { dismissed: false }));
  });

  it("offers no Bring back on a live Reminder", () => {
    render(<ReminderList reminders={[reminderItem({ id: "r1", title: "Print docs", date: "2026-11-20" })]} />);
    expect(screen.queryByText("Dismissed")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Bring back/ })).not.toBeInTheDocument();
  });
});
