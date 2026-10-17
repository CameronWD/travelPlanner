import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { reminderItem } from "@/test/helpers/reminder-item";
import { ReminderList } from "./reminder-list";

describe("ReminderList", () => {
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
});
