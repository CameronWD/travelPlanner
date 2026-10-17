import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/reminders", () => ({
  addReminder: vi.fn().mockResolvedValue({ success: true, id: "rem-new" }),
}));
import { addReminder } from "@/server/actions/reminders";

import { AddReminderDialog } from "./add-reminder-dialog";

const baseProps = {
  tripId: "trip-1",
  about: { stopId: "s1" } as const,
  open: true,
  onOpenChange: vi.fn(),
};

describe("AddReminderDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders with an 'Add a Reminder' heading, a title field and a date field — no Stop picker (the Stop is fixed)", () => {
    render(<AddReminderDialog {...baseProps} />);
    expect(
      screen.getByRole("heading", { name: /add a reminder/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/reminder title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/stop/i)).not.toBeInTheDocument();
  });

  it("submitting with an empty date shows the validation error and does not call the action", async () => {
    const user = userEvent.setup();
    render(<AddReminderDialog {...baseProps} />);

    await user.type(screen.getByLabelText(/reminder title/i), "Reconfirm the tour");
    await user.click(screen.getByRole("button", { name: /add reminder/i }));

    expect(
      await screen.findByText("Reminder date must be a date (YYYY-MM-DD)"),
    ).toBeInTheDocument();
    expect(addReminder).not.toHaveBeenCalled();
  });

  it("submitting with a date calls addReminder with the hidden stopId", async () => {
    const user = userEvent.setup();
    render(<AddReminderDialog {...baseProps} />);

    await user.type(screen.getByLabelText(/reminder title/i), "Reconfirm the tour");
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-12-05" } });
    await user.click(screen.getByRole("button", { name: /add reminder/i }));

    await waitFor(() => {
      expect(addReminder).toHaveBeenCalledWith("trip-1", {
        title: "Reconfirm the tour",
        date: "2026-12-05",
        stopId: "s1",
      });
    });
  });

  it("closes the dialog on a successful save", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddReminderDialog {...baseProps} onOpenChange={onOpenChange} />);

    await user.type(screen.getByLabelText(/reminder title/i), "Reconfirm the tour");
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-12-05" } });
    await user.click(screen.getByRole("button", { name: /add reminder/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
  it("about an Item or a leg, it submits that id (F8)", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<AddReminderDialog {...baseProps} about={{ itemId: "i1" }} />);
    await user.type(screen.getByLabelText(/reminder title/i), "Book table");
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-12-05" } });
    await user.click(screen.getByRole("button", { name: /add reminder/i }));
    await waitFor(() => expect(addReminder).toHaveBeenCalledWith("trip-1", { title: "Book table", date: "2026-12-05", itemId: "i1" }));
    unmount();
    vi.mocked(addReminder).mockClear();
    render(<AddReminderDialog {...baseProps} about={{ transportId: "t1" }} />);
    await user.type(screen.getByLabelText(/reminder title/i), "Seats");
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-12-05" } });
    await user.click(screen.getByRole("button", { name: /add reminder/i }));
    await waitFor(() => expect(addReminder).toHaveBeenCalledWith("trip-1", { title: "Seats", date: "2026-12-05", transportId: "t1" }));
  });

  it("sends notes when given (F8)", async () => {
    const user = userEvent.setup();
    render(<AddReminderDialog {...baseProps} />);
    await user.type(screen.getByLabelText(/reminder title/i), "Reconfirm the tour");
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-12-05" } });
    await user.type(screen.getByLabelText(/^notes/i), "Ask for Wayan");
    await user.click(screen.getByRole("button", { name: /add reminder/i }));
    await waitFor(() =>
      expect(addReminder).toHaveBeenCalledWith("trip-1", { title: "Reconfirm the tour", date: "2026-12-05", notes: "Ask for Wayan", stopId: "s1" }),
    );
  });
});
