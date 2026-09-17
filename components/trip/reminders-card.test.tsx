import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * RemindersCard — a Trip's dated notes.
 *
 * The card must never read the machine clock: every relative label is derived
 * from the `today` prop the server computes in the trip's timezone. These tests
 * deliberately pass a `today` that is nowhere near the real date, so a stray
 * `new Date()` in the component would fail them.
 */

const { addReminderMock, deleteReminderMock } = vi.hoisted(() => ({
  addReminderMock: vi.fn().mockResolvedValue({ success: true, id: "r-new" }),
  deleteReminderMock: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/server/actions/reminders", () => ({
  addReminder: addReminderMock,
  deleteReminder: deleteReminderMock,
}));

import { RemindersCard } from "./reminders-card";

const TODAY = "2026-11-28";

afterEach(() => {
  vi.clearAllMocks();
});

describe("RemindersCard relative labels", () => {
  it("labels a reminder dated today as 'today'", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[{ id: "r1", title: "Print the insurance docs", date: TODAY }]}
      />,
    );
    expect(screen.getByText("Print the insurance docs")).toBeInTheDocument();
    expect(screen.getByText("today")).toBeInTheDocument();
  });

  it("labels the next day as 'tomorrow'", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[{ id: "r1", title: "Pack", date: "2026-11-29" }]}
      />,
    );
    expect(screen.getByText("tomorrow")).toBeInTheDocument();
  });

  it("labels a reminder two days out as 'in 2 days'", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[{ id: "r1", title: "Collect currency", date: "2026-11-30" }]}
      />,
    );
    expect(screen.getByText("in 2 days")).toBeInTheDocument();
  });

  it("shows a whole-day label only — never a time (a Reminder has no time)", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[{ id: "r1", title: "Collect currency", date: "2026-11-30" }]}
      />,
    );
    expect(screen.queryByText(/\d{1,2}:\d{2}/)).not.toBeInTheDocument();
  });
});

describe("RemindersCard passed section", () => {
  it("puts a reminder dated before today under 'Passed', not in the upcoming list", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[
          { id: "r1", title: "Apply for ETIAS", date: "2026-10-16" },
          { id: "r2", title: "Print the insurance docs", date: TODAY },
        ]}
      />,
    );

    expect(screen.getByText("Passed (1)")).toBeInTheDocument();

    const passed = screen.getByRole("list", { name: "Passed reminders" });
    expect(passed).toHaveTextContent("Apply for ETIAS");

    const upcoming = screen.getByRole("list", { name: "Upcoming reminders" });
    expect(upcoming).not.toHaveTextContent("Apply for ETIAS");
    expect(upcoming).toHaveTextContent("Print the insurance docs");
  });

  it("labels a passed reminder 'passed'", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[{ id: "r1", title: "Apply for ETIAS", date: "2026-10-16" }]}
      />,
    );
    expect(screen.getByText("passed")).toBeInTheDocument();
  });

  it("omits the Passed section entirely when nothing has passed", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[{ id: "r1", title: "Pack", date: "2026-11-29" }]}
      />,
    );
    expect(screen.queryByText(/^Passed/)).not.toBeInTheDocument();
  });

  it("shows the empty state when there is nothing upcoming", () => {
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[]} />);
    expect(screen.getByText("No upcoming reminders.")).toBeInTheDocument();
  });
});

describe("RemindersCard add form", () => {
  it("submits { title, date } — a date field, never a datetime", async () => {
    render(<RemindersCard tripId="trip-7" today={TODAY} reminders={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Add Reminder" }));

    const dateInput = screen.getByLabelText("Reminder date");
    expect(dateInput).toHaveAttribute("type", "date");

    fireEvent.change(screen.getByLabelText("Reminder title"), {
      target: { value: "Print docs" },
    });
    fireEvent.change(dateInput, { target: { value: "2026-12-05" } });
    fireEvent.submit(dateInput.closest("form")!);

    await waitFor(() => {
      expect(addReminderMock).toHaveBeenCalledWith("trip-7", {
        title: "Print docs",
        date: "2026-12-05",
      });
    });
  });
});

describe("RemindersCard Digest opt-in", () => {
  // The Digest opt-in lives on the Trip's Settings page, not on this card.
  it("does not render an enable-notifications control", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[{ id: "r1", title: "Pack", date: "2026-11-29" }]}
      />,
    );
    expect(screen.queryByText(/daily digest/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/enable/i)).not.toBeInTheDocument();
  });
});
