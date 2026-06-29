import { render, screen } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";

// StopCard transitively imports the notes server action (via NoteThread),
// which reaches next-auth. Stub it so the component renders under jsdom.
vi.mock("@/server/actions/notes", () => ({
  addNote: vi.fn(),
  deleteNote: vi.fn(),
}));

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

it("does NOT render a drag handle for a scheduled stop even when dragHandle is provided", () => {
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
  expect(screen.queryByTestId("dh")).not.toBeInTheDocument();
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
