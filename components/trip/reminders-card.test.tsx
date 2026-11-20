import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * RemindersCard — a Trip's dated notes.
 *
 * The card must never read the machine clock: every relative label is derived
 * from the `today` prop the server computes in the trip's timezone. These tests
 * deliberately pass a `today` that is nowhere near the real date, so a stray
 * `new Date()` in the component would fail them.
 */

const { addReminderMock, deleteReminderMock, updateReminderMock } = vi.hoisted(() => ({
  updateReminderMock: vi.fn().mockResolvedValue({ success: true }),
  addReminderMock: vi.fn().mockResolvedValue({ success: true, id: "r-new" }),
  deleteReminderMock: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/server/actions/reminders", () => ({
  addReminder: addReminderMock,
  deleteReminder: deleteReminderMock,
  updateReminder: updateReminderMock,
}));

vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
import { toast } from "@/components/ui/use-toast";
import { addReminder } from "@/server/actions/reminders";

import { RemindersCard } from "./reminders-card";
import { reminderItem } from "@/test/helpers/reminder-item";

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
        reminders={[reminderItem({ id: "r1", title: "Print the insurance docs", date: TODAY, stopId: null, stopName: null })]}
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
        reminders={[reminderItem({ id: "r1", title: "Pack", date: "2026-11-29", stopId: null, stopName: null })]}
      />,
    );
    expect(screen.getByText("tomorrow")).toBeInTheDocument();
  });

  it("labels a reminder two days out as 'in 2 days'", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[reminderItem({ id: "r1", title: "Collect currency", date: "2026-11-30", stopId: null, stopName: null })]}
      />,
    );
    expect(screen.getByText("in 2 days")).toBeInTheDocument();
  });

  it("shows a whole-day label only — never a time (a Reminder has no time)", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[reminderItem({ id: "r1", title: "Collect currency", date: "2026-11-30", stopId: null, stopName: null })]}
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
          reminderItem({ id: "r1", title: "Apply for ETIAS", date: "2026-10-16", stopId: null, stopName: null }),
          reminderItem({ id: "r2", title: "Print the insurance docs", date: TODAY, stopId: null, stopName: null }),
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
        reminders={[reminderItem({ id: "r1", title: "Apply for ETIAS", date: "2026-10-16", stopId: null, stopName: null })]}
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
        reminders={[reminderItem({ id: "r1", title: "Print docs", date: "not-a-date", stopId: null, stopName: null })]}
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
          reminderItem({ id: "r1", title: "Print docs", date: "not-a-date", stopId: null, stopName: null }),
          reminderItem({ id: "r2", title: "Pack", date: "2026-11-29", stopId: null, stopName: null }),
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
  it("the closed control reads as a link, not as disabled, and opens the form", () => {
    render(<RemindersCard tripId="trip-7" today={TODAY} reminders={[]} />);
    const add = screen.getByRole("button", { name: "Add Reminder" });
    expect(add).toHaveClass("text-foreground");
    expect(add).not.toHaveClass("text-muted-foreground");
    fireEvent.click(add);
    expect(screen.getByLabelText("Reminder title")).toBeInTheDocument();
  });

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

  // AUDIT.md Checklists: restyled onto the 2px border / hard-shadow card, off
  // the older shadow-soft/70%-border/40%-tint treatment.
  it("is the 2px hard-shadow card with a display heading", () => {
    const { container } = render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[reminderItem({ id: "r1", title: "Pack", date: "2026-11-29", stopId: null, stopName: null })]}
      />,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("shadow-hard-3");
    expect(card.className).toContain("border-2");
    expect(screen.getByRole("heading", { level: 2, name: "Reminders" }).className).toContain("font-extrabold");
    expect(container.innerHTML).not.toMatch(/shadow-soft|border-border\/70|bg-card\/40/);
  });

  // I-2: in the 21.25rem home aside a long title must wrap, not ellipsis —
  // the card is the only place a Reminder's text is shown (truncation rule 1).
  it("wraps a long reminder title instead of truncating it", () => {
    const long = "Book the overnight sleeper from Vienna to Venice before the Christmas rush";
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[reminderItem({ id: "r1", title: long, date: "2026-11-29", stopId: null, stopName: null })]}
      />,
    );
    const title = screen.getByText(long);
    expect(title.className).not.toMatch(/\btruncate\b/);
    expect(title.className).toMatch(/\bbreak-words\b/);
    expect(title.parentElement!.className).toMatch(/\bmin-w-0\b/);
  });

  it("gives Got it a 44px touch target", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[reminderItem({ id: "r1", title: "Pack", date: "2026-11-29", stopId: null, stopName: null })]}
      />,
    );
    expect(screen.getByRole("button", { name: /^Got it/ }).className).toMatch(/\bmin-h-11\b/);
  });
});

describe("RemindersCard Stop chip (Task 7: a Reminder about a Stop)", () => {
  it("renders a chip naming the Stop when a reminder has a stopName", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[
          reminderItem({
            id: "r1",
            title: "Reconfirm the tour",
            date: "2026-11-29",
            stopId: "s1",
            stopName: "Denpasar",
          }),
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
        reminders={[reminderItem({ id: "r1", title: "Print docs", date: "2026-11-29", stopId: null, stopName: null })]}
      />,
    );
    expect(screen.queryByText("Denpasar")).not.toBeInTheDocument();
  });

  it("offers an About select in the add form when `about` is provided", async () => {
    render(
      <RemindersCard
        tripId="trip-7"
        today={TODAY}
        reminders={[]}
        about={{ stops: [{ id: "s1", name: "Denpasar" }], items: [], transports: [] }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Reminder" }));
    expect(screen.getByLabelText("About")).toBeInTheDocument();
  });

  it("submits the selected stopId alongside title and date", async () => {
    render(
      <RemindersCard
        tripId="trip-7"
        today={TODAY}
        reminders={[]}
        about={{ stops: [{ id: "s1", name: "Denpasar" }], items: [], transports: [] }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Reminder" }));
    fireEvent.change(screen.getByLabelText("Reminder title"), {
      target: { value: "Reconfirm the tour" },
    });
    fireEvent.change(screen.getByLabelText("Reminder date"), {
      target: { value: "2026-12-05" },
    });
    fireEvent.change(screen.getByLabelText("About"), {
      target: { value: "stop:s1" },
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

  it("omits an about id when no `about` options are provided (unchanged add-form contract)", async () => {
    render(<RemindersCard tripId="trip-7" today={TODAY} reminders={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Reminder" }));
    expect(screen.queryByLabelText("About")).not.toBeInTheDocument();
  });

  it("a chip names the Item or leg a Reminder is about (F8)", () => {
    render(
      <RemindersCard tripId="trip-1" today={TODAY} reminders={[
        reminderItem({ id: "r1", title: "Book table", date: "2026-11-29", itemId: "i1", itemTitle: "Bouchon" }),
        reminderItem({ id: "r2", title: "Seats", date: "2026-11-30", transportId: "t1", transportLabel: "Train Paris → Lyon" }),
      ]} />,
    );
    expect(screen.getByText("Bouchon")).toBeInTheDocument();
    expect(screen.getByText("Train Paris → Lyon")).toBeInTheDocument();
  });

  it("folds a Reminder's notes until tapped (F8)", async () => {
    const user = userEvent.setup();
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[reminderItem({ id: "r1", title: "Ring", date: "2026-11-29", notes: "Door code 4411" })]} />);
    expect(screen.getByText("Door code 4411")).not.toBeVisible();
    await user.click(screen.getByText("Notes"));
    expect(screen.getByText("Door code 4411")).toBeVisible();
  });

  const ABOUT = {
    stops: [{ id: "s1", name: "Denpasar" }],
    items: [{ id: "i1", title: "Temple visit" }],
    transports: [{ id: "t1", label: "Flight Brisbane → Denpasar" }],
  };

  it("offers one About picker over Stops, things to do and legs, and submits the one picked plus notes (F8)", async () => {
    const user = userEvent.setup();
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[]} about={ABOUT} />);
    await user.click(screen.getByRole("button", { name: "Add Reminder" }));
    const select = screen.getByLabelText("About");
    expect(within(select).getByRole("option", { name: "The whole trip" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Temple visit" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reminder title"), { target: { value: "Bring a sarong" } });
    fireEvent.change(screen.getByLabelText("Reminder date"), { target: { value: "2026-12-01" } });
    fireEvent.change(screen.getByLabelText("Reminder notes"), { target: { value: "Shoulders covered" } });
    fireEvent.change(select, { target: { value: "item:i1" } });
    fireEvent.submit(select.closest("form")!);
    await waitFor(() =>
      expect(addReminder).toHaveBeenCalledWith("trip-1", { title: "Bring a sarong", date: "2026-12-01", notes: "Shoulders covered", itemId: "i1" }),
    );
  });

  it("with no notes and no pick it submits only title and date", async () => {
    const user = userEvent.setup();
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[]} about={ABOUT} />);
    await user.click(screen.getByRole("button", { name: "Add Reminder" }));
    fireEvent.change(screen.getByLabelText("Reminder title"), { target: { value: "Pack" } });
    fireEvent.change(screen.getByLabelText("Reminder date"), { target: { value: "2026-12-01" } });
    fireEvent.submit(screen.getByLabelText("Reminder date").closest("form")!);
    await waitFor(() => expect(addReminder).toHaveBeenCalledWith("trip-1", { title: "Pack", date: "2026-12-01" }));
  });
});

describe("RemindersCard Digest opt-in", () => {
  // The Digest opt-in lives on the Trip's Settings page, not on this card.
  it("does not render an enable-notifications control", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[reminderItem({ id: "r1", title: "Pack", date: "2026-11-29", stopId: null, stopName: null })]}
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

describe("RemindersCard Got it", () => {
  it("has Got it and Edit on each row and no Delete", () => {
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[reminderItem({ id: "r1", title: "Pack", date: "2026-11-29" })]} />);
    expect(screen.getByRole("button", { name: /^Got it/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit reminder: Pack" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
  });

  it("dismisses through updateReminder and the row leaves at once", async () => {
    updateReminderMock.mockReturnValueOnce(new Promise(() => {}));
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[reminderItem({ id: "r1", title: "Pack", date: "2026-11-29" })]} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /^Got it/ }));
    await waitFor(() => expect(updateReminderMock).toHaveBeenCalledWith("r1", { dismissed: true }));
    await waitFor(() => expect(screen.queryByText("Pack")).not.toBeInTheDocument());
  });

  it("toasts the server's reason when dismissing is refused", async () => {
    updateReminderMock.mockResolvedValueOnce({ success: false, errors: { _: ["Couldn't find that reminder."] } });
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[reminderItem({ id: "r1", title: "Pack", date: "2026-11-29" })]} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /^Got it/ }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "Couldn't find that reminder." }),
    );
  });
});

describe("RemindersCard Undo and Dismissed", () => {
  const undoOf = (title: string) => {
    const call = vi.mocked(toast).mock.calls.find(([t]) => t.title === "Dismissed" && t.description === title);
    return (call![0].action as React.ReactElement<{ onClick: () => void }>).props.onClick;
  };

  it("Got it toasts Dismissed with an Undo, which brings the Reminder back even after the row has left", async () => {
    const pack = reminderItem({ id: "r1", title: "Pack", date: "2026-11-29" });
    const { rerender } = render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[pack]} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /^Got it/ }));
    await waitFor(() => expect(updateReminderMock).toHaveBeenCalledWith("r1", { dismissed: true }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Dismissed", description: "Pack" })));
    rerender(<RemindersCard tripId="trip-1" today={TODAY} reminders={[]} />);
    expect(screen.queryByText("Pack")).not.toBeInTheDocument();
    undoOf("Pack")();
    await waitFor(() => expect(updateReminderMock).toHaveBeenCalledWith("r1", { dismissed: false }));
    rerender(<RemindersCard tripId="trip-1" today={TODAY} reminders={[pack]} />);
    expect(await screen.findByText("Pack")).toBeInTheDocument();
  });

  it("forgets a dismissed Reminder once the list drops it, so one brought back elsewhere reappears", async () => {
    updateReminderMock.mockResolvedValue({ success: true });
    const a = reminderItem({ id: "ra", title: "Pack", date: "2026-11-29" });
    const b = reminderItem({ id: "rb", title: "Print", date: "2026-11-30" });
    const { rerender } = render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[a, b]} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /^Got it.*Pack/ }));
    await waitFor(() => expect(updateReminderMock).toHaveBeenCalledWith("ra", { dismissed: true }));
    expect(screen.queryByText("Pack")).not.toBeInTheDocument();
    rerender(<RemindersCard tripId="trip-1" today={TODAY} reminders={[a, b]} />);
    expect(screen.queryByText("Pack")).not.toBeInTheDocument();
    rerender(<RemindersCard tripId="trip-1" today={TODAY} reminders={[b]} />);
    rerender(<RemindersCard tripId="trip-1" today={TODAY} reminders={[a, b]} />);
    expect(screen.getByText("Pack")).toBeInTheDocument();
  });

  it("lists the Trip's dismissed Reminders folded under Dismissed (n), each with Bring back", async () => {
    updateReminderMock.mockReturnValueOnce(new Promise(() => {}));
    const visa = reminderItem({ id: "d1", title: "Visa photos", date: "2026-12-02", dismissed: true });
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[]} dismissed={[visa]} />);
    const fold = screen.getByText("Dismissed (1)").closest("details")!;
    expect(fold).not.toHaveAttribute("open");
    const list = within(fold).getByRole("list", { name: "Dismissed reminders", hidden: true });
    expect(within(list).getByText("Visa photos", { exact: false })).toBeInTheDocument();
    await userEvent.setup().click(within(list).getByRole("button", { name: "Bring back reminder: Visa photos", hidden: true }));
    await waitFor(() => expect(updateReminderMock).toHaveBeenCalledWith("d1", { dismissed: false }));
    await waitFor(() => expect(screen.queryByText("Visa photos")).not.toBeInTheDocument());
  });

  it("shows no Dismissed fold when nothing is dismissed", () => {
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[]} dismissed={[]} />);
    expect(screen.queryByText(/^Dismissed/)).not.toBeInTheDocument();
  });
});

describe("RemindersCard Delete inside Edit", () => {
  it("asks first, then deletes", async () => {
    const user = userEvent.setup();
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[reminderItem({ id: "r1", title: "Pack", date: "2026-11-29" })]} />);
    await user.click(screen.getByRole("button", { name: "Edit reminder: Pack" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Delete this reminder?")).toBeInTheDocument();
    expect(deleteReminderMock).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteReminderMock).toHaveBeenCalledWith("r1"));
  });
});

describe("RemindersCard Earlier", () => {
  it("lists past Reminders under Earlier, newest first, each dismissable and editable", async () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[
          reminderItem({ id: "n", title: "Next up", date: "2026-12-01" }),
          reminderItem({ id: "p1", title: "Older one", date: "2026-11-01", past: true }),
          reminderItem({ id: "p2", title: "Newer one", date: "2026-11-20", past: true }),
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Earlier" })).toBeInTheDocument();
    const earlier = screen.getByRole("list", { name: "Earlier reminders" });
    expect(within(earlier).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("Newer one"),
      expect.stringContaining("Older one"),
    ]);
    expect(within(screen.getByRole("list", { name: "Upcoming reminders" })).queryByText("Older one")).not.toBeInTheDocument();
    await userEvent.setup().click(within(earlier).getByRole("button", { name: /^Got it.*Newer one/ }));
    await waitFor(() => expect(updateReminderMock).toHaveBeenCalledWith("p2", { dismissed: true }));
    await userEvent.setup().click(within(earlier).getByRole("button", { name: "Edit reminder: Older one" }));
    expect(await screen.findByRole("heading", { name: "Edit Reminder" })).toBeInTheDocument();
  });

  it("shows no Earlier heading when nothing is past", () => {
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[reminderItem({ id: "n", title: "Next up", date: "2026-12-01" })]} />);
    expect(screen.queryByRole("heading", { name: "Earlier" })).not.toBeInTheDocument();
  });
});
