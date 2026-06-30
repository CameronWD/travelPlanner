import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalendarFeedPanel } from "./calendar-feed-panel";

vi.mock("@/server/actions/calendar-feed", () => ({
  createCalendarFeed: vi.fn(async () => ({ token: "new-token" })),
  rotateCalendarFeed: vi.fn(async () => ({ token: "rotated-token" })),
  revokeCalendarFeed: vi.fn(async () => undefined),
  updateCalendarFeedFilter: vi.fn(async () => undefined),
}));

import { rotateCalendarFeed, updateCalendarFeedFilter } from "@/server/actions/calendar-feed";

describe("CalendarFeedPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the type checkboxes with the checked state from initialFilter", () => {
    render(
      <CalendarFeedPanel
        tripId="trip-1"
        initialToken="tok-abc"
        initialFilter={{
          includeTransport: false,
          includeAccommodation: true,
          includeActivities: true,
        }}
      />,
    );

    const transport = screen.getByRole("checkbox", { name: "Transport" });
    const accommodation = screen.getByRole("checkbox", { name: "Accommodation" });
    const activities = screen.getByRole("checkbox", { name: "Activities" });

    expect(transport).not.toBeChecked();
    expect(accommodation).toBeChecked();
    expect(activities).toBeChecked();
  });

  it("persists the new flag set when a checkbox is toggled", async () => {
    const user = userEvent.setup();
    render(
      <CalendarFeedPanel
        tripId="trip-1"
        initialToken="tok-abc"
        initialFilter={{
          includeTransport: false,
          includeAccommodation: true,
          includeActivities: true,
        }}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Transport" }));

    expect(updateCalendarFeedFilter).toHaveBeenCalledWith("trip-1", {
      includeTransport: true,
      includeAccommodation: true,
      includeActivities: true,
    });
  });

  it("does not show the checkboxes without a feed (shows the create prompt instead)", () => {
    render(<CalendarFeedPanel tripId="trip-1" initialToken={null} />);

    expect(
      screen.queryByRole("checkbox", { name: "Transport" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create calendar feed/i }),
    ).toBeInTheDocument();
  });

  it("Regenerate shows a confirmation dialog with the warning copy before firing", async () => {
    const user = userEvent.setup();
    render(<CalendarFeedPanel tripId="trip-1" initialToken="tok-abc" />);

    // Click Regenerate — must NOT call rotateCalendarFeed yet
    await user.click(screen.getByRole("button", { name: /regenerate/i }));

    // Dialog should appear with the correct title and description
    expect(
      await screen.findByText("Regenerate calendar feed?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /invalidates the current calendar URL — anyone subscribed will need the new link/i,
      ),
    ).toBeInTheDocument();

    // rotateCalendarFeed must NOT have been called yet
    expect(rotateCalendarFeed).not.toHaveBeenCalled();

    // Confirm — now it should fire
    await user.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(rotateCalendarFeed).toHaveBeenCalledWith("trip-1");
  });

  it("Regenerate does NOT fire when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    render(<CalendarFeedPanel tripId="trip-1" initialToken="tok-abc" />);

    await user.click(screen.getByRole("button", { name: /regenerate/i }));
    await screen.findByText("Regenerate calendar feed?");

    // Cancel
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(rotateCalendarFeed).not.toHaveBeenCalled();
  });
});
