import { render, screen } from "@testing-library/react";
import { it, expect, vi, describe } from "vitest";
import userEvent from "@testing-library/user-event";

// StopCard transitively imports the notes server action (via NoteThread),
// which reaches next-auth. Stub it so the component renders under jsdom.
vi.mock("@/server/actions/notes", () => ({
  addNote: vi.fn(),
  deleteNote: vi.fn(),
}));
vi.mock("@/server/actions/attachments", () => ({
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));

// ItemFormDialog calls createItem — stub it so StopCard tests don't hit the
// real server action.
vi.mock("@/server/actions/items", () => ({
  createItem: vi.fn().mockResolvedValue({ success: true }),
  updateItem: vi.fn().mockResolvedValue({ success: true }),
}));
import { createItem } from "@/server/actions/items";

import { StopCard } from "./stop-card";

const base = { id: "a", name: "Rome", country: "Italy", sortOrder: 0, chapterId: null, notes: null, lat: null, lng: null };

const roughStop = { ...base, timezone: null, arriveDate: null, departDate: null, nights: 3, pinned: false };
const scheduledStop = { ...base, timezone: "Europe/Rome", arriveDate: "2026-07-10", departDate: "2026-07-13", nights: null, pinned: false };

it("shows a nights badge for a rough stop and no date range", () => {
  render(<StopCard stop={{ ...base, timezone: null, arriveDate: null, departDate: null, nights: 3, pinned: false }} isFirst isLast onEdit={() => {}} onMoveUp={() => {}} onMoveDown={() => {}} onDelete={() => {}} />);
  expect(screen.getByText(/3 nights/i)).toBeInTheDocument();
});

it("shows the date range and a pin control for a scheduled stop", () => {
  render(<StopCard stop={{ ...base, timezone: "Europe/Rome", arriveDate: "2026-07-10", departDate: "2026-07-13", nights: null, pinned: false }} isFirst isLast onEdit={() => {}} onMoveUp={() => {}} onMoveDown={() => {}} onDelete={() => {}} onTogglePin={() => {}} />);
  expect(screen.getByText(/Jul/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /pin/i })).toBeInTheDocument();
});

// Task 5 tests — drag handle slot + retire desktop arrows

it("renders a drag handle for a rough stop when dragHandle is provided", () => {
  render(
    <StopCard
      stop={roughStop}
      isFirst={false}
      isLast={false}
      onMoveUp={() => {}}
      onMoveDown={() => {}}
      dragHandle={<button data-testid="dh" />}
    />,
  );
  expect(screen.getByTestId("dh")).toBeInTheDocument();
});

it("renders a drag handle for a scheduled stop when dragHandle is provided (ADR 0021)", () => {
  // ADR 0021 reverses the ADR 0014 rough-only rule: scheduled stops are
  // draggable now, so the handle renders whenever it is provided.
  render(
    <StopCard
      stop={scheduledStop}
      isFirst={false}
      isLast={false}
      onMoveUp={() => {}}
      onMoveDown={() => {}}
      dragHandle={<button data-testid="dh" />}
    />,
  );
  expect(screen.getByTestId("dh")).toBeInTheDocument();
});

it("does not render inline Move-up/Move-down buttons for a rough stop (retired)", () => {
  render(
    <StopCard
      stop={roughStop}
      isFirst={false}
      isLast={false}
      onMoveUp={() => {}}
      onMoveDown={() => {}}
    />,
  );
  expect(screen.queryByLabelText(`Move ${roughStop.name} up`)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(`Move ${roughStop.name} down`)).not.toBeInTheDocument();
});

it("does not render inline Move-up/Move-down buttons for a scheduled stop (retired)", () => {
  render(
    <StopCard
      stop={scheduledStop}
      isFirst={false}
      isLast={false}
      onMoveUp={() => {}}
      onMoveDown={() => {}}
    />,
  );
  expect(screen.queryByLabelText(`Move ${scheduledStop.name} up`)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(`Move ${scheduledStop.name} down`)).not.toBeInTheDocument();
});

it("rough stop overflow menu includes Move up and Move down", async () => {
  const user = userEvent.setup();
  render(
    <StopCard
      stop={roughStop}
      isFirst={false}
      isLast={false}
      onMoveUp={() => {}}
      onMoveDown={() => {}}
    />,
  );
  // Open the overflow menu — the sm:hidden one is the mobile one; there may
  // be multiple triggers if the scheduled-actions menu also renders.
  // We look for the trigger whose label matches the stop.
  const trigger = screen.getByRole("button", { name: `More actions for ${roughStop.name}` });
  await user.click(trigger);
  expect(await screen.findByRole("menuitem", { name: "Move up" })).toBeInTheDocument();
  expect(await screen.findByRole("menuitem", { name: "Move down" })).toBeInTheDocument();
});

it("scheduled stop overflow menu does NOT include Move up or Move down", async () => {
  const user = userEvent.setup();
  render(
    <StopCard
      stop={scheduledStop}
      isFirst={false}
      isLast={false}
      onMoveUp={() => {}}
      onMoveDown={() => {}}
      onAdjustDates={() => {}}
      onMakeRough={() => {}}
    />,
  );
  // There may be two overflow triggers (sm:hidden + hidden sm:block); click the first.
  const triggers = screen.getAllByRole("button", { name: `More actions for ${scheduledStop.name}` });
  await user.click(triggers[0]);
  // Should show Adjust dates / Make rough but NOT Move up/down
  expect(await screen.findByRole("menuitem", { name: "Adjust dates" })).toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: "Move up" })).not.toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: "Move down" })).not.toBeInTheDocument();
});

// Task 11: "Clear dates" primary action on scheduled stops

it("renders a visible 'Clear dates' button on a scheduled stop when onMakeRough is provided", () => {
  render(
    <StopCard
      stop={scheduledStop}
      isFirst={false}
      isLast={false}
      onMakeRough={() => {}}
    />,
  );
  expect(
    screen.getByRole("button", { name: `Clear dates for ${scheduledStop.name}` }),
  ).toBeInTheDocument();
});

it("does NOT render a 'Clear dates' button on a rough stop", () => {
  render(
    <StopCard
      stop={roughStop}
      isFirst={false}
      isLast={false}
      onMakeRough={() => {}}
    />,
  );
  expect(
    screen.queryByRole("button", { name: /clear dates/i }),
  ).not.toBeInTheDocument();
});

it("'Clear dates' button calls onMakeRough with the stop id", async () => {
  const user = userEvent.setup();
  const onMakeRough = vi.fn();
  render(
    <StopCard
      stop={scheduledStop}
      isFirst={false}
      isLast={false}
      onMakeRough={onMakeRough}
    />,
  );
  await user.click(screen.getByRole("button", { name: `Clear dates for ${scheduledStop.name}` }));
  expect(onMakeRough).toHaveBeenCalledOnce();
  expect(onMakeRough).toHaveBeenCalledWith(scheduledStop.id);
});

it("overflow 'Make rough' entry is still present alongside 'Clear dates'", async () => {
  const user = userEvent.setup();
  render(
    <StopCard
      stop={scheduledStop}
      isFirst={false}
      isLast={false}
      onMakeRough={() => {}}
      onAdjustDates={() => {}}
    />,
  );
  const triggers = screen.getAllByRole("button", { name: `More actions for ${scheduledStop.name}` });
  await user.click(triggers[0]);
  expect(await screen.findByRole("menuitem", { name: "Make rough" })).toBeInTheDocument();
});

// ---------------------------------------------------------------------------
// Task 15: "Add a thing to do" under each stop (ADR 0022)
// ---------------------------------------------------------------------------

// stops fixture whose id matches roughStop.id so the pre-select test works
const stopsForRough = [{ id: "a", name: "Rome" }];

describe("Task 15 — things to do under a stop", () => {
  it("renders existing things-to-do items under the stop card", () => {
    const thingsToDo = [
      { id: "ttd-1", title: "Visit the Colosseum", category: "SIGHTSEEING", date: null, stopId: "a" },
      { id: "ttd-2", title: "Try pasta", category: "FOOD", date: null, stopId: "a" },
    ];
    render(
      <StopCard
        stop={roughStop}
        isFirst={false}
        isLast={false}
        tripId="trip-1"
        stops={stopsForRough}
        thingsToDo={thingsToDo}
        forkId={null}
        homeCurrency="AUD"
      />,
    );
    expect(screen.getByText("Visit the Colosseum")).toBeInTheDocument();
    expect(screen.getByText("Try pasta")).toBeInTheDocument();
  });

  it("renders an 'Add Thing to Do' button (not 'Activity') under the stop card", () => {
    render(
      <StopCard
        stop={roughStop}
        isFirst={false}
        isLast={false}
        tripId="trip-1"
        stops={stopsForRough}
        thingsToDo={[]}
        forkId={null}
        homeCurrency="AUD"
      />,
    );
    expect(screen.getByRole("button", { name: /add thing to do/i })).toBeInTheDocument();
    // Must NOT say "Activity"
    expect(screen.queryByRole("button", { name: /activity/i })).not.toBeInTheDocument();
  });

  it("the label is exactly 'Add Thing to Do', never 'Activity'", () => {
    render(
      <StopCard
        stop={roughStop}
        isFirst={false}
        isLast={false}
        tripId="trip-1"
        stops={stopsForRough}
        thingsToDo={[]}
        forkId={null}
      />,
    );
    const btn = screen.getByRole("button", { name: /add thing to do/i });
    expect(btn.textContent).toContain("Add Thing to Do");
    expect(btn.textContent).not.toMatch(/activity/i);
  });

  it("clicking 'Add Thing to Do' opens the ItemFormDialog with the stop pre-selected", async () => {
    const user = userEvent.setup();
    render(
      <StopCard
        stop={roughStop}
        isFirst={false}
        isLast={false}
        tripId="trip-1"
        stops={stopsForRough}
        thingsToDo={[]}
        forkId="fork-1"
        homeCurrency="AUD"
      />,
    );
    await user.click(screen.getByRole("button", { name: /add thing to do/i }));
    // Dialog should open — its title is "Add Item"
    expect(await screen.findByRole("heading", { name: /add item/i })).toBeInTheDocument();
  });

  it("submitting the dialog calls createItem with the stop's id, date null, and forkId", async () => {
    const user = userEvent.setup();
    (createItem as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    render(
      <StopCard
        stop={roughStop}
        isFirst={false}
        isLast={false}
        tripId="trip-1"
        stops={stopsForRough}
        thingsToDo={[]}
        forkId="fork-1"
        homeCurrency="AUD"
      />,
    );

    await user.click(screen.getByRole("button", { name: /add thing to do/i }));
    const titleInput = await screen.findByPlaceholderText(/visit the night market/i);
    await user.type(titleInput, "Street art tour");

    await user.click(screen.getByRole("button", { name: /add item/i }));

    // roughStop.id === "a" which is the defaultStopId passed to ItemFormDialog
    expect(createItem).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        stopId: "a",
        date: undefined,
      }),
      "fork-1",
    );
  });

  it("does NOT render the 'Add Thing to Do' button when tripId is not provided", () => {
    render(
      <StopCard
        stop={roughStop}
        isFirst={false}
        isLast={false}
      />,
    );
    expect(screen.queryByRole("button", { name: /add thing to do/i })).not.toBeInTheDocument();
  });
});
