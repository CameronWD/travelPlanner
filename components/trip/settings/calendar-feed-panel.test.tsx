import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalendarFeedPanel } from "./calendar-feed-panel";

vi.mock("@/server/actions/calendar-feed", () => ({
  createCalendarFeed: vi.fn(async () => ({ token: "new-token" })),
  rotateCalendarFeed: vi.fn(async () => ({ token: "rotated-token" })),
  revokeCalendarFeed: vi.fn(async () => undefined),
  updateCalendarFeedFilter: vi.fn(async () => undefined),
  updateCalendarFeedAlarms: vi.fn(async () => undefined),
}));

import {
  rotateCalendarFeed,
  updateCalendarFeedFilter,
  updateCalendarFeedAlarms,
} from "@/server/actions/calendar-feed";

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

  it("persists the new alarm flags when 'Alarm before departures' is toggled off", async () => {
    const user = userEvent.setup();
    render(
      <CalendarFeedPanel
        tripId="trip-1"
        initialToken="tok-abc"
        initialAlarms={{ alarmTransport: true, alarmCheckOut: true }}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Alarm before departures" }));

    expect(updateCalendarFeedAlarms).toHaveBeenCalledWith("trip-1", {
      alarmTransport: false,
      alarmCheckOut: true,
    });
  });

  it("renders the iOS Remove Alerts instruction verbatim", () => {
    render(<CalendarFeedPanel tripId="trip-1" initialToken="tok-abc" />);

    expect(screen.getByText(/On iPhone, do this once:/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Settings → Apps → Calendar → Accounts → Subscribed Calendars → this trip →/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/turn/)).toBeInTheDocument();
    expect(screen.getByText("Remove Alerts")).toBeInTheDocument();
    expect(
      screen.getByText(/iOS strips alarms from subscribed calendars by default/),
    ).toBeInTheDocument();
  });

  // LA-051: this card's body copy is prose, not a label — it needs the same
  // reading-measure cap as the rest of Settings, or it runs the full width
  // of the (now two-column) card on a wide screen.
  describe("reading-measure cap (LA-051)", () => {
    it("caps the no-feed-yet copy", () => {
      render(<CalendarFeedPanel tripId="trip-1" initialToken={null} />);
      expect(screen.getByText(/No calendar feed active/).className).toContain("max-w-reading");
    });

    it("caps the iOS instructions and the one-way explainer", () => {
      render(<CalendarFeedPanel tripId="trip-1" initialToken="tok-abc" />);
      const iosParagraph = screen.getByText(/On iPhone, do this once:/).closest("p");
      expect(iosParagraph?.className).toContain("max-w-reading");
      expect(screen.getByText(/One-way: your itinerary publishes/).className).toContain(
        "max-w-reading",
      );
    });
  });
});
