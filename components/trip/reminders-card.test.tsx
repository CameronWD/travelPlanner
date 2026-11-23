import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setMatchMedia } from "@/test/setup";

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

const { mediaQueryUnresolved } = vi.hoisted(() => ({ mediaQueryUnresolved: { value: false } }));
vi.mock("@/components/ui/use-media-query", async (orig) => {
  const actual = await orig<typeof import("@/components/ui/use-media-query")>();
  return { ...actual, useMediaQuery: (q: string) => (mediaQueryUnresolved.value ? null : actual.useMediaQuery(q)) };
});

vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));
import { toast } from "@/components/ui/use-toast";
import { addReminder } from "@/server/actions/reminders";
vi.mock("@/lib/usage/client", () => ({ recordUsageAction: vi.fn() }));
import { recordUsageAction } from "@/lib/usage/client";

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
    expect(title.closest("li")!.className).toMatch(/\bmin-w-0\b/);
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

describe("RemindersCard readable widths", () => {
  it("keeps the open add form to max-w-md", async () => {
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[]} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Add Reminder" }));
    expect(screen.getByRole("textbox", { name: "Reminder title" }).closest("form")!.className).toContain("max-w-md");
  });

  it("keeps a Reminder's text column to a readable width", () => {
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[reminderItem({ id: "r1", title: "Pack", date: "2026-11-29" })]} />);
    expect(screen.getByText("Pack").closest("li")!.className).toContain("[&_p]:max-w-prose");
  });
});

describe("RemindersCard Reminder row on a phone", () => {
  const rowOf = (title: string) => screen.getByText(title).closest("li")!;

  it("has one Got it and one Edit per row, in the order title, footer, notes", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[reminderItem({ id: "r1", title: "Pack", date: "2026-11-29", stopId: "s1", stopName: "Denpasar", notes: "Door code" })]}
      />,
    );
    const li = rowOf("Pack");
    expect(within(li).getAllByRole("button", { name: /^Got it/ })).toHaveLength(1);
    expect(within(li).getAllByRole("button", { name: /^Edit reminder/ })).toHaveLength(1);
    const [title, foot, notes] = Array.from(li.children);
    expect(title).toHaveTextContent("Pack");
    expect(foot).toHaveAttribute("data-reminder-foot");
    expect(foot).toHaveTextContent("Denpasar");
    expect(foot).toHaveTextContent("29 Nov");
    expect(within(foot as HTMLElement).getByRole("button", { name: /^Edit reminder/ })).toBeInTheDocument();
    expect(within(foot as HTMLElement).getByRole("button", { name: /^Got it/ })).toBeInTheDocument();
    expect(notes).toHaveTextContent("Notes");
  });

  it("stacks the title above the footer below md and sits them side by side from md", () => {
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[reminderItem({ id: "r1", title: "Pack", date: "2026-11-29" })]} />);
    const cls = rowOf("Pack").className;
    expect(cls).toMatch(/\bflex-col\b/);
    expect(cls).toMatch(/\bmd:grid\b/);
    expect(cls).toContain("md:grid-cols-[minmax(0,auto)_1fr_auto_auto]");
    expect(screen.getByText("Pack").className).toMatch(/\bmd:min-w-0\b/);
    expect(screen.getByText("Pack").closest("li")!.querySelector("[data-reminder-foot]")!.className).toMatch(/\bmd:contents\b/);
  });

  it.each([
    ["no about chip", "Pack", null],
    ["a 200-character unbroken title", "x".repeat(200), "Denpasar"],
  ])("right-aligns the buttons in the footer with %s", (_label, title, stopName) => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[reminderItem({ id: "r1", title, date: "2026-11-29", stopId: stopName ? "s1" : null, stopName })]}
      />,
    );
    const foot = rowOf(title).querySelector("[data-reminder-foot]") as HTMLElement;
    expect(foot).not.toBeNull();
    const actions = foot.querySelector("[data-reminder-actions]") as HTMLElement;
    expect(actions.className).toMatch(/\bml-auto\b/);
    expect(within(actions).getByRole("button", { name: /^Edit reminder/ })).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: /^Got it/ })).toBeInTheDocument();
  });

  it("wraps Edit and Got it as one unit on a phone, and lets them join the md grid", () => {
    render(
      <RemindersCard
        tripId="trip-1"
        today={TODAY}
        reminders={[reminderItem({ id: "r1", title: "Pack", date: "2026-11-29", stopId: "s1", stopName: "Rovaniemi (Lapland)" })]}
      />,
    );
    const actions = rowOf("Pack").querySelector("[data-reminder-actions]") as HTMLElement;
    expect(actions.parentElement).toHaveAttribute("data-reminder-foot");
    expect(actions.className).toMatch(/\bflex\b/);
    expect(actions.className).not.toMatch(/\bflex-wrap\b/);
    expect(actions.className).toMatch(/\bmd:contents\b/);
    expect(within(actions).getByRole("button", { name: /^Edit reminder/ }).className).toMatch(/\bmd:col-start-3\b/);
    expect(within(actions).getByRole("button", { name: /^Got it/ }).className).toMatch(/\bmd:col-start-4\b/);
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

  it("does not remember a Reminder as hidden when its Undo fails after the list already dropped it", async () => {
    updateReminderMock.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false, errors: {} });
    const a = reminderItem({ id: "ra", title: "Pack", date: "2026-11-29" });
    const b = reminderItem({ id: "rb", title: "Print", date: "2026-11-30" });
    const { rerender } = render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[a, b]} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /^Got it.*Pack/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Dismissed", description: "Pack" })));
    rerender(<RemindersCard tripId="trip-1" today={TODAY} reminders={[b]} />);
    undoOf("Pack")();
    await waitFor(() => expect(updateReminderMock).toHaveBeenCalledWith("ra", { dismissed: false }));
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

describe("RemindersCard Add Reminder on a phone", () => {
  const ABOUT = {
    stops: [{ id: "s1", name: "Stop One" }],
    items: [],
    transports: [],
  };
  const onPhone = () => setMatchMedia((q) => q === "(max-width: 767px)");
  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText(/^Reminder title/), "Pack");
    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: "2026-12-01" } });
  };

  afterEach(() => {
    mediaQueryUnresolved.value = false;
    setMatchMedia((q) => q === "(min-width: 640px)");
  });

  it("a tap before the query has resolved still opens the dialog on a phone", async () => {
    onPhone();
    mediaQueryUnresolved.value = true;
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[]} about={ABOUT} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Add Reminder" }));
    expect(screen.getByRole("dialog", { name: "Add a Reminder" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Reminder date")).not.toBeInTheDocument();
  });

  it("a failed save keeps the dialog open with the text and the About pick, and says so", async () => {
    onPhone();
    addReminderMock.mockResolvedValueOnce({ success: false, errors: { _: ["Nope, try again"] } });
    const user = userEvent.setup();
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[]} about={ABOUT} />);
    await user.click(screen.getByRole("button", { name: "Add Reminder" }));
    await fill(user);
    await user.selectOptions(screen.getByLabelText("About"), "Stop One");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add Reminder" }));
    expect(await screen.findByText("Nope, try again")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Reminder title/)).toHaveValue("Pack");
    expect(screen.getByLabelText("About")).toHaveValue("stop:s1");
  });

  it("focus returns to Add Reminder after a save and after Cancel", async () => {
    onPhone();
    const user = userEvent.setup();
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[]} about={ABOUT} />);
    await user.click(screen.getByRole("button", { name: "Add Reminder" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add Reminder" })).toHaveFocus());
    (document.activeElement as HTMLElement).blur();
    await user.click(screen.getByRole("button", { name: "Add Reminder" }));
    await fill(user);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add Reminder" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Add Reminder" })).toHaveFocus());
  });

  it("opens the Add Reminder dialog and no inline form", async () => {
    onPhone();
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[]} about={ABOUT} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Add Reminder" }));
    expect(screen.getByRole("dialog", { name: "Add a Reminder" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Reminder date")).not.toBeInTheDocument();
  });

  it("saves about the Stop picked", async () => {
    onPhone();
    const user = userEvent.setup();
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[]} about={ABOUT} />);
    await user.click(screen.getByRole("button", { name: "Add Reminder" }));
    await fill(user);
    await user.selectOptions(screen.getByLabelText("About"), "Stop One");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add Reminder" }));
    await waitFor(() => expect(addReminder).toHaveBeenCalledWith("trip-1", { title: "Pack", date: "2026-12-01", stopId: "s1" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("sends no about for the whole trip", async () => {
    onPhone();
    const user = userEvent.setup();
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[]} about={ABOUT} />);
    await user.click(screen.getByRole("button", { name: "Add Reminder" }));
    await fill(user);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add Reminder" }));
    await waitFor(() => expect(addReminder).toHaveBeenCalledWith("trip-1", { title: "Pack", date: "2026-12-01" }));
  });

  it("Cancel closes it without a call", async () => {
    onPhone();
    const user = userEvent.setup();
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[]} about={ABOUT} />);
    await user.click(screen.getByRole("button", { name: "Add Reminder" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(addReminder).not.toHaveBeenCalled();
  });

  it("on a desktop it unfolds the inline form and opens no dialog", async () => {
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[]} about={ABOUT} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Add Reminder" }));
    expect(screen.getByLabelText("Reminder date")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("RemindersCard Got it is recorded", () => {
  it("records reminder-got-it once, and Undo records nothing more", async () => {
    vi.mocked(recordUsageAction).mockClear();
    updateReminderMock.mockResolvedValue({ success: true });
    render(<RemindersCard tripId="trip-1" today={TODAY} reminders={[reminderItem({ id: "r1", title: "Pack", date: "2026-11-29" })]} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /^Got it/ }));
    expect(recordUsageAction).toHaveBeenCalledTimes(1);
    expect(recordUsageAction).toHaveBeenCalledWith("reminder-got-it");
    await waitFor(() => expect(updateReminderMock).toHaveBeenCalledWith("r1", { dismissed: true }));
    await waitFor(() => expect(screen.queryByText("Pack")).not.toBeInTheDocument());
    expect(recordUsageAction).toHaveBeenCalledTimes(1);
  });
});
