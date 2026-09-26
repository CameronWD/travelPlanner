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
        reminders={[{ id: "r1", title: "Print the insurance docs", date: TODAY, stopId: null, stopName: null }]}
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
        reminders={[{ id: "r1", title: "Pack", date: "2026-11-29", stopId: null, stopName: null }]}
      />,
    );
    expect(screen.getByText("tomorrow")).toBeInTheDocument();
  });

  it("labels a reminder two days out as 'in 2 days'", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[{ id: "r1", title: "Collect currency", date: "2026-11-30", stopId: null, stopName: null }]}
      />,
    );
    expect(screen.getByText("in 2 days")).toBeInTheDocument();
  });

  it("shows a whole-day label only — never a time (a Reminder has no time)", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[{ id: "r1", title: "Collect currency", date: "2026-11-30", stopId: null, stopName: null }]}
      />,
    );
    expect(screen.queryByText(/\d{1,2}:\d{2}/)).not.toBeInTheDocument();
  });

});

describe("RemindersCard does not linger", () => {
  // A Reminder is said once, on its day, and is not something you complete
  // (CONTEXT.md "Reminder"). A "Passed" drawer would make it a task and
  // duplicate the Checklist, so the card must not grow one back.
  it("renders no Passed section, even with a reminder dated before today", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[
          { id: "r1", title: "Apply for ETIAS", date: "2026-10-16", stopId: null, stopName: null },
          { id: "r2", title: "Print the insurance docs", date: TODAY, stopId: null, stopName: null },
        ]}
      />,
    );

    expect(screen.queryByText(/^Passed/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Passed reminders" }),
    ).not.toBeInTheDocument();
    expect(document.querySelector("details")).toBeNull();
  });

  it("shows the empty state when there is nothing upcoming", () => {
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[]} />);
    expect(screen.getByText("No upcoming reminders.")).toBeInTheDocument();
  });

  // `listRemindersForTrip` queries `date >= today`, so a past-dated Reminder
  // shouldn't reach this card in practice — but if one does (a stale prop, a
  // clock skew), the card must not do arithmetic on it out loud. Pin the
  // absence of the bad string rather than just the presence of a good one: a
  // component that rendered nothing at all would also pass a check that only
  // looked for "no label".
  it("shows no relative label for a reminder dated before today, and never '-N days'", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[{ id: "r1", title: "Apply for ETIAS", date: "2026-10-16", stopId: null, stopName: null }]}
      />,
    );

    expect(screen.getByText("Apply for ETIAS")).toBeInTheDocument();
    expect(screen.queryByText(/-\d+ days/)).not.toBeInTheDocument();
  });
});

describe("RemindersCard malformed stored date", () => {
  // Reminder.date is a plain String column and parseISODate throws on anything
  // that isn't YYYY-MM-DD. This card renders on every phase of Home, so a
  // single bad legacy row must not take the whole front door down with it.
  it("still renders, showing the raw stored value and no relative label", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[{ id: "r1", title: "Print docs", date: "not-a-date", stopId: null, stopName: null }]}
      />,
    );

    expect(screen.getByText("Print docs")).toBeInTheDocument();
    expect(screen.getByText("not-a-date")).toBeInTheDocument();
    expect(screen.queryByText("today")).not.toBeInTheDocument();
    expect(screen.queryByText("passed")).not.toBeInTheDocument();
  });

  it("keeps the rest of the card working alongside a bad row", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[
          { id: "r1", title: "Print docs", date: "not-a-date", stopId: null, stopName: null },
          { id: "r2", title: "Pack", date: "2026-11-29", stopId: null, stopName: null },
        ]}
      />,
    );

    expect(screen.getByText("tomorrow")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Reminder" }),
    ).toBeInTheDocument();
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

describe("RemindersCard kit shape", () => {
  it("renders inside the kit Card shape — 2px border, hard shadow", () => {
    const { container } = render(
      <RemindersCard tripId="trip-1" today={TODAY} reminders={[]} />,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toMatch(/\bborder-2\b/);
    expect(card.className).toMatch(/\bshadow-hard-\d\b/);
  });

  // I-2: in the 21.25rem home aside a long title must wrap, not ellipsis —
  // the card is the only place a Reminder's text is shown (truncation rule 1).
  it("wraps a long reminder title instead of truncating it", () => {
    const long = "Book the overnight sleeper from Vienna to Venice before the Christmas rush";
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[{ id: "r1", title: long, date: "2026-11-29", stopId: null, stopName: null }]}
      />,
    );
    const title = screen.getByText(long);
    expect(title.className).not.toMatch(/\btruncate\b/);
    expect(title.className).toMatch(/\bbreak-words\b/);
    expect(title.parentElement!.className).toMatch(/\bmin-w-0\b/);
  });

  it("gives the delete button a 44px touch target", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[{ id: "r1", title: "Pack", date: "2026-11-29", stopId: null, stopName: null }]}
      />,
    );
    const del = screen.getByRole("button", { name: "Delete reminder: Pack" });
    expect(del.className).toMatch(/\bsize-11\b/);
  });
});

describe("RemindersCard Stop chip (Task 7: a Reminder about a Stop)", () => {
  it("renders a chip naming the Stop when a reminder has a stopName", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[
          {
            id: "r1",
            title: "Reconfirm the tour",
            date: "2026-11-29",
            stopId: "s1",
            stopName: "Denpasar",
          },
        ]}
      />,
    );
    expect(screen.getByText("Denpasar")).toBeInTheDocument();
  });

  it("renders no chip for a reminder about the Trip as a whole (no stopName)", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[{ id: "r1", title: "Print docs", date: "2026-11-29", stopId: null, stopName: null }]}
      />,
    );
    expect(screen.queryByText("Denpasar")).not.toBeInTheDocument();
  });

  it("offers a Stop select in the add form when `stops` is provided", async () => {
    render(
      <RemindersCard
        tripId="trip-7"
        today={TODAY}
        reminders={[]}
        stops={[{ id: "s1", name: "Denpasar" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Reminder" }));
    expect(screen.getByLabelText("Stop")).toBeInTheDocument();
  });

  it("submits the selected stopId alongside title and date", async () => {
    render(
      <RemindersCard
        tripId="trip-7"
        today={TODAY}
        reminders={[]}
        stops={[{ id: "s1", name: "Denpasar" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Reminder" }));
    fireEvent.change(screen.getByLabelText("Reminder title"), {
      target: { value: "Reconfirm the tour" },
    });
    fireEvent.change(screen.getByLabelText("Reminder date"), {
      target: { value: "2026-12-05" },
    });
    fireEvent.change(screen.getByLabelText("Stop"), {
      target: { value: "s1" },
    });
    fireEvent.submit(screen.getByLabelText("Reminder date").closest("form")!);

    await waitFor(() => {
      expect(addReminderMock).toHaveBeenCalledWith("trip-7", {
        title: "Reconfirm the tour",
        date: "2026-12-05",
        stopId: "s1",
      });
    });
  });

  it("omits stopId when no stops are provided (unchanged add-form contract)", async () => {
    render(<RemindersCard tripId="trip-7" today={TODAY} reminders={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Reminder" }));
    expect(screen.queryByLabelText("Stop")).not.toBeInTheDocument();
  });
});

describe("RemindersCard Digest opt-in", () => {
  // The Digest opt-in lives on the Trip's Settings page, not on this card.
  it("does not render an enable-notifications control", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[{ id: "r1", title: "Pack", date: "2026-11-29", stopId: null, stopName: null }]}
      />,
    );
    // Assert the absence of the specific control, not of any copy containing
    // "enable" — a broad matcher would make queryByText throw on multiple
    // matches instead of failing cleanly once the card's wording grows.
    expect(
      screen.queryByRole("button", { name: "Enable trip reminders" }),
    ).not.toBeInTheDocument();
  });
});
