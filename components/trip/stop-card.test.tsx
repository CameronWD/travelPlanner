import { cleanup, render, screen, within } from "@testing-library/react";
import type * as React from "react";
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
  scheduleItem: vi.fn().mockResolvedValue({ success: true }),
  unscheduleItem: vi.fn().mockResolvedValue({ success: true, mode: "unslotted", sourceItemId: null }),
  rescheduleItem: vi.fn().mockResolvedValue({ success: true }),
}));
import { createItem, scheduleItem } from "@/server/actions/items";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/server/actions/costs", () => ({
  createCost: vi.fn().mockResolvedValue({ success: true }),
  updateCost: vi.fn().mockResolvedValue({ success: true }),
  deleteCost: vi.fn().mockResolvedValue({ success: true }),
}));

import { StopCard, STOP_CARD_ROW_CLASS, type StopCardStop } from "./stop-card";

const base = { id: "a", name: "Rome", country: "Italy", sortOrder: 0, chapterId: null, notes: null, lat: null, lng: null };

const roughStop = { ...base, timezone: null, arriveDate: null, departDate: null, nights: 3, pinned: false };
const scheduledStop = { ...base, timezone: "Europe/Rome", arriveDate: "2026-07-10", departDate: "2026-07-13", nights: null, pinned: false };

it("shows a compact nights pill for a rough stop and no date range", () => {
  render(<StopCard stop={{ ...base, timezone: null, arriveDate: null, departDate: null, nights: 3, pinned: false }} isFirst isLast onEdit={() => {}} onMoveUp={() => {}} onMoveDown={() => {}} onDelete={() => {}} />);
  // Task 1: night count is now spelled out ("~3 nights")
  expect(screen.getByText(/^~3 nights$/)).toBeInTheDocument();
});

it("shows the date range and a pin control for a scheduled stop", async () => {
  const user = userEvent.setup();
  render(<StopCard stop={{ ...base, timezone: "Europe/Rome", arriveDate: "2026-07-10", departDate: "2026-07-13", nights: null, pinned: false }} isFirst isLast onEdit={() => {}} onMoveUp={() => {}} onMoveDown={() => {}} onDelete={() => {}} onTogglePin={() => {}} />);
  expect(screen.getByText(/Jul/)).toBeInTheDocument();
  // Pin lives in the overflow menu now (beta feedback Task 6).
  await user.click(screen.getByRole("button", { name: "More actions for Rome" }));
  expect(await screen.findByRole("menuitem", { name: "Pin dates" })).toBeInTheDocument();
});

it("stop title may wrap; it never truncates at a single breakpoint", () => {
  render(<StopCard stop={scheduledStop} isFirst isLast onEdit={() => {}} onMoveUp={() => {}} onMoveDown={() => {}} onDelete={() => {}} />);
  const h3 = screen.getByRole("heading", { level: 3, name: /Rome/ });
  expect(h3.className).not.toContain("truncate");
  expect(h3.className).toContain("min-w-0");
});

it("ARCH-DAT-1: hides the Delete control when onDelete is omitted (non-owner)", async () => {
  const user = userEvent.setup();
  render(<StopCard stop={roughStop} isFirst isLast onEdit={() => {}} onMoveUp={() => {}} onMoveDown={() => {}} />);
  expect(screen.queryByRole("button", { name: /^Delete Rome$/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "More actions for Rome" }));
  expect(await screen.findByRole("menu")).toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: /Delete/ })).not.toBeInTheDocument();
});

// LA-037: the card's size-8 icon buttons get an invisible 44px coarse-pointer
// tap target, same pattern as Task 1's `tap-target` utility.
it("gives the Edit icon button a 44px tap target (LA-037)", () => {
  render(<StopCard stop={scheduledStop} isFirst isLast onEdit={() => {}} onMoveUp={() => {}} onMoveDown={() => {}} onDelete={() => {}} />);
  expect(screen.getByRole("button", { name: /^Edit Rome$/ }).className).toContain("tap-target");
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

// Task 11 (bug #8): clearing a scheduled stop's dates is one tap away. Since
// beta feedback Task 6 it is the overflow menu's "Make rough" item rather
// than a separate inline "Clear dates" button.

it("does NOT render an inline 'Clear dates' button on a scheduled stop", () => {
  render(
    <StopCard
      stop={scheduledStop}
      isFirst={false}
      isLast={false}
      onMakeRough={() => {}}
    />,
  );
  expect(
    screen.queryByRole("button", { name: `Clear dates for ${scheduledStop.name}` }),
  ).not.toBeInTheDocument();
});

it("does NOT offer Make rough on a rough stop", async () => {
  const user = userEvent.setup();
  render(
    <StopCard
      stop={roughStop}
      isFirst={false}
      isLast={false}
      onMakeRough={() => {}}
    />,
  );
  expect(screen.queryByRole("button", { name: /clear dates/i })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: `More actions for ${roughStop.name}` }));
  expect(await screen.findByRole("menu")).toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: "Make rough" })).not.toBeInTheDocument();
});

it("the menu's 'Make rough' item calls onMakeRough with the stop id", async () => {
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
  await user.click(screen.getByRole("button", { name: `More actions for ${scheduledStop.name}` }));
  await user.click(await screen.findByRole("menuitem", { name: "Make rough" }));
  expect(onMakeRough).toHaveBeenCalledOnce();
  expect(onMakeRough).toHaveBeenCalledWith(scheduledStop.id);
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
    expect(screen.getByRole("button", { name: "Add Thing to Do" })).toBeInTheDocument();
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
    const btn = screen.getByRole("button", { name: "Add Thing to Do" });
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
    await user.click(screen.getByRole("button", { name: "Add Thing to Do" }));
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

    await user.click(screen.getByRole("button", { name: "Add Thing to Do" }));
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

// ---------------------------------------------------------------------------
// Task 3 (fix/modal-mobile-styling): mobile action row decluttering
// ---------------------------------------------------------------------------
// Named distinctly from the file's existing `roughStop`/`base` fixtures above
// to avoid shadowing them at module scope.

const mobileStop: StopCardStop = {
  id: "stop-1",
  name: "Germany",
  country: "Germany",
  timezone: null,
  arriveDate: null,
  departDate: null,
  nights: 4,
  pinned: false,
  chapterId: null,
  notes: null,
  lat: null,
  lng: null,
  sortOrder: 0,
};

function renderMobileStopCard(overrides = {}) {
  return render(
    <StopCard
      stop={mobileStop}
      isFirst={false}
      isLast={false}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onStartChapter={vi.fn()}
      onMoveUp={vi.fn()}
      onMoveDown={vi.fn()}
      tripId="trip-1"
      currentUserId="user-1"
      notes={[
        {
          id: "note-1",
          body: "Remember the castle tour",
          createdAt: new Date("2026-07-01T00:00:00Z"),
          author: { id: "user-1", name: "Cam", image: null },
        },
      ]}
      attachments={[]}
      {...overrides}
    />,
  );
}

describe("StopCard mobile actions", () => {
  it("folds Notes, Attachments and Delete into the overflow menu", async () => {
    const user = userEvent.setup();
    renderMobileStopCard();

    // A rough stop renders a single overflow menu (desktop menu is scheduled-only).
    await user.click(screen.getByRole("button", { name: /More actions for Germany/ }));

    expect(await screen.findByRole("menuitem", { name: /Notes \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Attachments/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Delete/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Start a chapter here/ })).toBeInTheDocument();
  });

  it("opens the note thread as a sheet from the overflow menu", async () => {
    const user = userEvent.setup();
    renderMobileStopCard();

    await user.click(screen.getByRole("button", { name: /More actions for Germany/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Notes \(1\)/ }));

    // The notes sheet (a Dialog) is now open with the thread content.
    expect(await screen.findByText("Remember the castle tour")).toBeInTheDocument();
  });

  it("routes Delete through onDelete", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    renderMobileStopCard({ onDelete });

    await user.click(screen.getByRole("button", { name: /More actions for Germany/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Delete/ }));

    expect(onDelete).toHaveBeenCalledWith("stop-1");
  });
});

// ---------------------------------------------------------------------------
// Task 10: StopCard hue band + "Nn" pill + things-to-do dots
// ---------------------------------------------------------------------------

describe("Task 10 — StopCard Bold-Modular anatomy", () => {
  it("scheduled stop card has a left hue border class from stopBandBorderClass(sortOrder)", () => {
    // sortOrder 0 → sky palette → border-l-sky-400
    const { container } = render(
      <StopCard
        stop={{ ...scheduledStop, sortOrder: 0 }}
        isFirst={false}
        isLast={false}
      />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/border-l-hue-sky/);
    expect(card.className).toMatch(/border-l-4/);
  });

  it("rough stop card also gets the hue border class (dashed + hued)", () => {
    // sortOrder 1 → amber palette → border-l-amber-400
    const { container } = render(
      <StopCard
        stop={{ ...roughStop, sortOrder: 1 }}
        isFirst={false}
        isLast={false}
      />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/border-l-hue-sun/);
    expect(card.className).toMatch(/border-l-4/);
    // Still dashed for rough stops
    expect(card.className).toMatch(/border-dashed/);
  });

  it("renders a compact 'Nn' nights pill (e.g. '3n') for a rough stop", () => {
    render(
      <StopCard
        stop={{ ...roughStop, nights: 3, sortOrder: 0 }}
        isFirst={false}
        isLast={false}
      />,
    );
    // Task 1: night count is now spelled out ("~3 nights")
    expect(screen.getByText(/^~3 nights$/)).toBeInTheDocument();
  });

  it("renders a compact 'Nn' nights pill for a scheduled stop", () => {
    // 3 nights between Jul 10 and Jul 13
    render(
      <StopCard
        stop={{ ...scheduledStop, sortOrder: 0 }}
        isFirst={false}
        isLast={false}
      />,
    );
    // Task 1: night count is now spelled out ("3 nights")
    expect(screen.getByText(/^3 nights$/)).toBeInTheDocument();
  });

  it("groups things to do by Category, with a real CategoryPill chip on each row and no dot", () => {
    const thingsToDo = [
      { id: "ttd-1", title: "Try pasta", category: "FOOD", date: null, stopId: "a" },
      { id: "ttd-2", title: "Visit the Colosseum", category: "SIGHTSEEING", date: null, stopId: "a" },
      { id: "ttd-3", title: "Try gelato", category: "FOOD", date: null, stopId: "a" },
    ];
    const { container } = render(
      <StopCard
        stop={scheduledStop}
        isFirst={false}
        isLast={false}
        tripId="trip-1"
        stops={[{ id: "a", name: "Rome" }]}
        thingsToDo={thingsToDo}
        forkId={null}
      />,
    );
    // Group headings appear in CATEGORIES order: Sightseeing, then Food & Drink.
    const groups = screen.getAllByTestId("things-group");
    expect(groups).toHaveLength(2);
    const headings = screen.getAllByRole("heading", { level: 4 });
    expect(headings.map((h) => h.textContent)).toEqual(["Sightseeing", "Food & Drink"]);

    // Each row carries a real CategoryPill chip (its label text), not a dot.
    expect(screen.getByText("Try pasta").closest("li")?.textContent).toContain("Food & Drink");
    expect(screen.getByText("Try gelato").closest("li")?.textContent).toContain("Food & Drink");
    expect(screen.getByText("Visit the Colosseum").closest("li")?.textContent).toContain("Sightseeing");
    expect(container.querySelectorAll("[data-testid='thing-dot']")).toHaveLength(0);
  });

  it("'+ Add thing to do' link has text-primary class (coral styling)", () => {
    render(
      <StopCard
        stop={roughStop}
        isFirst={false}
        isLast={false}
        tripId="trip-1"
        stops={[{ id: "a", name: "Rome" }]}
        thingsToDo={[]}
        forkId={null}
      />,
    );
    const btn = screen.getByRole("button", { name: "Add Thing to Do" });
    expect(btn.className).toMatch(/text-primary/);
  });

  it("things-to-do row shows right-aligned time when startTime is present", () => {
    const thingsToDo = [
      {
        id: "ttd-timed",
        title: "Sunrise hike",
        category: "SIGHTSEEING",
        date: null,
        stopId: "a",
        startTime: "06:00",
      },
    ];
    render(
      <StopCard
        stop={{ ...roughStop, sortOrder: 0 }}
        isFirst={false}
        isLast={false}
        tripId="trip-1"
        stops={[{ id: "a", name: "Rome" }]}
        thingsToDo={thingsToDo}
        forkId={null}
      />,
    );
    expect(screen.getByText("06:00")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Day-aware plan editor (grilling 2026-09-13)
// ---------------------------------------------------------------------------

describe("day rows (scheduled stops)", () => {
  const dayItems = [
    { id: "d1", title: "Colosseum", category: "SIGHTSEEING", date: "2026-07-11", startTime: "10:00", stopId: "a" },
  ];

  it("renders a day row for every day of the stay, including empty ones", () => {
    render(
      <StopCard stop={scheduledStop} isFirst isLast tripId="t1" dayItems={dayItems} />,
    );
    // 10 → 13 Jul inclusive = 4 rows
    expect(screen.getByRole("button", { name: /Fri 10 Jul/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sat 11 Jul/ })).toHaveTextContent("Colosseum");
    expect(screen.getByRole("button", { name: /Sun 12 Jul/ })).toHaveTextContent(/nothing planned/i);
    expect(screen.getByRole("button", { name: /Mon 13 Jul/ })).toBeInTheDocument();
  });

  it("renders no day rows on a rough stop", () => {
    render(<StopCard stop={roughStop} isFirst isLast tripId="t1" dayItems={[]} />);
    expect(screen.queryByTestId("stop-day-list")).not.toBeInTheDocument();
  });
});

describe("things to do section", () => {
  const thing = { id: "th1", title: "Trevi Fountain", category: "SIGHTSEEING", stopId: "a" };

  it("labels the dateless pool 'Things to do'", () => {
    render(
      <StopCard stop={scheduledStop} isFirst isLast tripId="t1" thingsToDo={[thing]} />,
    );
    expect(screen.getByText("Things to do")).toBeInTheDocument();
    expect(screen.getByText("Trevi Fountain")).toBeInTheDocument();
  });

  it("schedules a thing-to-do onto a picked day", async () => {
    const user = userEvent.setup();
    render(
      <StopCard stop={scheduledStop} isFirst isLast tripId="t1" thingsToDo={[thing]} />,
    );
    await user.click(screen.getByRole("button", { name: "Pick a day for Trevi Fountain" }));
    await user.click(await screen.findByRole("menuitem", { name: "Sat 11 Jul" }));
    expect(scheduleItem).toHaveBeenCalledWith("th1", { date: "2026-07-11" });
  });

  it("preserves a timed thing-to-do's startTime/endTime when scheduling onto a picked day", async () => {
    const user = userEvent.setup();
    const timedThing = { id: "th2", title: "Sunrise run", category: "ACTIVITY", stopId: "a", startTime: "06:00" };
    render(
      <StopCard stop={scheduledStop} isFirst isLast tripId="t1" thingsToDo={[timedThing]} />,
    );
    await user.click(screen.getByRole("button", { name: "Pick a day for Sunrise run" }));
    await user.click(await screen.findByRole("menuitem", { name: "Sat 11 Jul" }));
    expect(scheduleItem).toHaveBeenCalledWith("th2", { date: "2026-07-11", startTime: "06:00" });
  });

  it("shows no pick-a-day control on a rough stop (no days exist yet)", () => {
    render(<StopCard stop={roughStop} isFirst isLast tripId="t1" thingsToDo={[thing]} />);
    expect(
      screen.queryByRole("button", { name: "Pick a day for Trevi Fountain" }),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Task 19 (HG-02/HG-10): the map pin means one thing — has a location
// ---------------------------------------------------------------------------

describe("Task 19 — map pin is not decorative", () => {
  it("shows exactly one map pin on a stop with a location — the map link's", () => {
    // HG-02/HG-10: a decorative pin next to the country plus MapLink's real
    // one meant two identical glyphs in a row meaning different things, while
    // help-legend.tsx teaches the pin as "has a location".
    const { container } = render(
      <StopCard
        stop={{ ...scheduledStop, lat: 41.9, lng: 12.5 }}
        isFirst isLast onEdit={() => {}} onMoveUp={() => {}} onMoveDown={() => {}} onDelete={() => {}}
      />,
    );
    expect(container.querySelectorAll("svg.lucide-map-pin")).toHaveLength(1);
    expect(container.querySelector('a[aria-label^="Open"]')).not.toBeNull();
  });

  it("shows no map pin at all on a stop with no location", () => {
    const { container } = render(
      <StopCard
        stop={{ ...scheduledStop, lat: null, lng: null }}
        isFirst isLast onEdit={() => {}} onMoveUp={() => {}} onMoveDown={() => {}} onDelete={() => {}}
      />,
    );
    expect(container.querySelectorAll("svg.lucide-map-pin")).toHaveLength(0);
    // The country still reads fine as plain text.
    expect(screen.getByText("Italy")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Beta feedback Task 5: Accommodation lives inside the Stop card
// ─────────────────────────────────────────────────────────────────────────────

describe("Where you're staying (Accommodation inside the Stop card)", () => {
  it("renders the given accommodations inside the section, before the things-to-do list", () => {
    render(
      <StopCard
        stop={scheduledStop}
        isFirst={false}
        isLast={false}
        tripId="trip-1"
        stops={[{ id: "a", name: "Rome" }]}
        thingsToDo={[{ id: "ttd-1", title: "Visit the Colosseum", category: "SIGHTSEEING", date: null, stopId: "a" }]}
        forkId={null}
        accommodations={<div data-testid="acc-row">Hotel Artemide</div>}
        onAddAccommodation={() => {}}
      />,
    );
    const section = screen.getByTestId("stop-staying");
    expect(section).toHaveAccessibleName("Where you're staying");
    expect(section).toContainElement(screen.getByTestId("acc-row"));
    expect(section).not.toHaveTextContent("No bed yet");
    const firstGroup = screen.getAllByTestId("things-group")[0];
    expect(section.compareDocumentPosition(firstGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows 'No bed yet' when there are no accommodations, and the add button calls onAddAccommodation", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <StopCard stop={roughStop} isFirst isLast onAddAccommodation={onAdd} />,
    );
    const section = screen.getByTestId("stop-staying");
    expect(section).toHaveTextContent("No bed yet");
    await user.click(within(section).getByRole("button", { name: "Add accommodation" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Beta feedback Task 6: the Stop card follows the kit's DPlan row — place,
// dates & nights, staying tile, actions — with two visible icon buttons and
// one overflow menu holding the rest.
// ─────────────────────────────────────────────────────────────────────────────

describe("Stop card row (kit DPlan) with an overflow menu", () => {
  function renderRow(overrides: Partial<React.ComponentProps<typeof StopCard>> = {}) {
    const handlers = {
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onStartChapter: vi.fn(),
      onAssignToChapter: vi.fn(),
      onTogglePin: vi.fn(),
      onMakeRough: vi.fn(),
      onAdjustDates: vi.fn(),
      onMoveUp: vi.fn(),
      onMoveDown: vi.fn(),
    };
    render(
      <StopCard
        stop={scheduledStop}
        isFirst={false}
        isLast={false}
        tripId="trip-1"
        stops={[{ id: "a", name: "Rome" }]}
        thingsToDo={[]}
        forkId={null}
        {...handlers}
        {...overrides}
      />,
    );
    return handlers;
  }

  async function openMenu(user: ReturnType<typeof userEvent.setup>, name = "Rome") {
    await user.click(screen.getByRole("button", { name: `More actions for ${name}` }));
    return within(await screen.findByRole("menu"));
  }

  it("the header carries STOP_CARD_ROW_CLASS on top of the unchanged phone stack", () => {
    renderRow();
    const header = screen.getByTestId("stop-card-header");
    expect(header.className).toContain(STOP_CARD_ROW_CLASS);
    expect(header.className).toContain("flex flex-col gap-3");
    expect(STOP_CARD_ROW_CLASS).toBe(
      "lg:grid lg:grid-cols-[minmax(0,1fr)_14rem_13rem_auto] lg:items-center lg:gap-4",
    );
  });

  it("the place text block takes the free width (min-w-0 flex-1)", () => {
    renderRow();
    const place = screen.getByTestId("stop-card-place");
    expect(place.className).toContain("min-w-0");
    expect(place.className).toContain("flex-1");
    expect(place).toContainElement(screen.getByRole("heading", { level: 3, name: "Rome" }));
  });

  it("shows exactly two icon buttons outside the menu: Edit and Add thing to do", () => {
    renderRow();
    const header = screen.getByTestId("stop-card-header");
    const names = within(header)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"))
      .filter((n) => n !== "More actions for Rome");
    expect(names).toEqual(["Edit Rome", "Add thing to do"]);
    // None of the old inline icon buttons survive outside the menu.
    for (const gone of ["Start a chapter here", "Pin Rome", "Unpin Rome", "Clear dates for Rome", "Delete Rome"]) {
      expect(screen.queryByRole("button", { name: gone })).not.toBeInTheDocument();
    }
    expect(screen.getAllByRole("button", { name: "More actions for Rome" })).toHaveLength(1);
  });

  it("opening 'More actions for Rome' lists the rest, Delete Rome and Pin dates included", async () => {
    const user = userEvent.setup();
    renderRow();
    const menu = await openMenu(user);
    const labels = menu.getAllByRole("menuitem").map((i) => i.textContent);
    expect(labels).toEqual([
      "Start a chapter here",
      expect.stringMatching(/^Assign to chapter/),
      "Pin dates",
      "Adjust dates",
      "Make rough",
      "Delete Rome",
    ]);
    expect(menu.getByRole("menuitem", { name: "Delete Rome" })).toBeInTheDocument();
    expect(menu.getByRole("menuitem", { name: "Pin dates" })).toBeInTheDocument();
  });

  it("a pinned stop's menu offers Unpin dates", async () => {
    const user = userEvent.setup();
    renderRow({ stop: { ...scheduledStop, pinned: true } });
    const menu = await openMenu(user);
    expect(menu.getByRole("menuitem", { name: "Unpin dates" })).toBeInTheDocument();
  });

  it.each([
    ["Start a chapter here", "onStartChapter", scheduledStop],
    ["Pin dates", "onTogglePin", scheduledStop.id],
    ["Adjust dates", "onAdjustDates", scheduledStop],
    ["Make rough", "onMakeRough", scheduledStop.id],
    ["Delete Rome", "onDelete", scheduledStop.id],
  ] as const)("menu item %s calls %s unchanged", async (label, handler, arg) => {
    const user = userEvent.setup();
    const handlers = renderRow();
    const menu = await openMenu(user);
    await user.click(menu.getByRole("menuitem", { name: label }));
    expect(handlers[handler]).toHaveBeenCalledOnce();
    expect(handlers[handler]).toHaveBeenCalledWith(arg);
  });

  it("a rough stop's menu assigns to a chapter; no date actions", async () => {
    const user = userEvent.setup();
    const handlers = renderRow({ stop: roughStop });
    const menu = await openMenu(user);
    expect(menu.queryByRole("menuitem", { name: /Pin dates|Adjust dates|Make rough/ })).not.toBeInTheDocument();
    await user.click(menu.getByRole("menuitem", { name: "Assign to chapter" }));
    expect(handlers.onAssignToChapter).toHaveBeenCalledWith(roughStop);
  });

  it("Edit stays a visible button and calls onEdit with the stop", async () => {
    const user = userEvent.setup();
    const handlers = renderRow();
    await user.click(screen.getByRole("button", { name: "Edit Rome" }));
    expect(handlers.onEdit).toHaveBeenCalledWith(scheduledStop);
  });

  it("the Add thing to do icon button opens the add dialog", async () => {
    const user = userEvent.setup();
    renderRow();
    await user.click(screen.getByRole("button", { name: "Add thing to do" }));
    expect(await screen.findByRole("heading", { name: /add item/i })).toBeInTheDocument();
  });

  it("offers 'Add a reminder' only when onAddReminder is provided, and passes the stop", async () => {
    const user = userEvent.setup();
    renderRow();
    let menu = await openMenu(user);
    expect(menu.queryByRole("menuitem", { name: "Add a reminder" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    cleanup();

    const onAddReminder = vi.fn();
    renderRow({ onAddReminder });
    menu = await openMenu(user);
    const labels = menu.getAllByRole("menuitem").map((i) => i.textContent);
    expect(labels.indexOf("Add a reminder")).toBe(labels.indexOf("Delete Rome") - 1);
    await user.click(menu.getByRole("menuitem", { name: "Add a reminder" }));
    expect(onAddReminder).toHaveBeenCalledWith(scheduledStop);
  });

  // Task 7: a Reminder about this Stop, listed under a small "Reminders" line.
  it("lists the Stop's reminders under a 'Reminders' line", () => {
    renderRow({
      reminders: [{ id: "rem-1", title: "Reconfirm the tour", date: "2026-07-11" }],
    });
    expect(screen.getByText("Reminders")).toBeInTheDocument();
    expect(screen.getByText("Reconfirm the tour")).toBeInTheDocument();
  });

  it("renders no Reminders line when there are none for the Stop", () => {
    renderRow({ reminders: [] });
    expect(screen.queryByText("Reminders")).not.toBeInTheDocument();
  });

  it("the staying tile names the first Accommodation", () => {
    renderRow({
      accommodations: <div>Hotel Artemide</div>,
      accommodationName: "Hotel Artemide",
      onAddAccommodation: () => {},
    });
    const tile = screen.getByTestId("stop-staying-tile");
    expect(tile).toHaveTextContent("Hotel Artemide");
    expect(tile).not.toHaveTextContent("No bed yet");
    expect(screen.getByTestId("stop-card-header")).toContainElement(tile);
  });

  it("the staying tile says 'No bed yet' on a rough stop with none", () => {
    renderRow({ stop: roughStop, onAddAccommodation: () => {} });
    expect(screen.getByTestId("stop-staying-tile")).toHaveTextContent("No bed yet");
  });

  it("no staying tile when the caller does not wire Accommodation in", () => {
    renderRow();
    expect(screen.queryByTestId("stop-staying-tile")).not.toBeInTheDocument();
  });
});
