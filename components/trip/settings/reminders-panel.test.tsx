import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/digest", () => ({
  setDigestEnabled: vi.fn().mockResolvedValue({ ok: true }),
  sendTestDigest: vi.fn().mockResolvedValue({ ok: true, sent: 1, placeholder: false }),
}));

// Stubbed so these tests are about the panel's own branching, not the push
// API detection inside EnableNotifications (which has its own tests and
// renders an "unavailable" state under jsdom).
vi.mock("@/components/trip/enable-notifications", () => ({
  EnableNotifications: () => <button type="button">Enable trip reminders</button>,
}));

// The browser's own zone decides whether the stored one is still current. It
// cannot be set by moving the test runner's clock, so it is stubbed; the
// default agrees with the zone most of these tests store, so only the tests
// that are *about* a device having moved see a mismatch.
vi.mock("@/lib/tz", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tz")>()),
  deviceTimeZone: vi.fn(() => "Europe/Rome"),
}));

import { setDigestEnabled, sendTestDigest } from "@/server/actions/digest";
import { deviceTimeZone } from "@/lib/tz";
import { RemindersPanel } from "./reminders-panel";

const SUBSCRIBED_AT = new Date("2026-09-03T10:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(setDigestEnabled).mockResolvedValue({ ok: true });
  vi.mocked(sendTestDigest).mockResolvedValue({ ok: true, sent: 1, placeholder: false });
  vi.mocked(deviceTimeZone).mockReturnValue("Europe/Rome");
});

afterEach(() => {
  // Whether a zone is served moves with daylight saving, so those tests pin
  // the date — put it back or the rest of the file drifts with the calendar.
  vi.useRealTimers();
});

describe("RemindersPanel", () => {
  it("toggling the switch saves the inverted value", async () => {
    const user = userEvent.setup();
    render(
      <RemindersPanel
        tripId="t1"
        initial={{
          enabled: true,
          device: { timezone: "Australia/Sydney", subscribedAt: SUBSCRIBED_AT },
        }}
      />,
    );

    await user.click(screen.getByLabelText(/your digest/i));

    expect(setDigestEnabled).toHaveBeenCalledWith("t1", false);
  });

  it("turns the digest back on when it starts off", async () => {
    const user = userEvent.setup();
    render(
      <RemindersPanel
        tripId="t1"
        initial={{
          enabled: false,
          device: { timezone: "Australia/Sydney", subscribedAt: SUBSCRIBED_AT },
        }}
      />,
    );

    await user.click(screen.getByLabelText(/your digest/i));

    expect(setDigestEnabled).toHaveBeenCalledWith("t1", true);
  });

  it("shows the device timezone when a device is subscribed", () => {
    render(
      <RemindersPanel
        tripId="t1"
        initial={{
          enabled: true,
          device: { timezone: "Europe/Rome", subscribedAt: SUBSCRIBED_AT },
        }}
      />,
    );

    expect(screen.getByText(/8pm · Europe\/Rome/)).toBeInTheDocument();
    expect(screen.getByText(/Europe\/Rome · subscribed/)).toBeInTheDocument();
  });

  it("offers the enable button only when no device is subscribed", () => {
    const { unmount } = render(
      <RemindersPanel tripId="t1" initial={{ enabled: true, device: null }} />,
    );
    expect(
      screen.getByRole("button", { name: /enable trip reminders/i }),
    ).toBeInTheDocument();
    unmount();

    render(
      <RemindersPanel
        tripId="t1"
        initial={{
          enabled: true,
          device: { timezone: "Europe/Rome", subscribedAt: SUBSCRIBED_AT },
        }}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /enable trip reminders/i }),
    ).not.toBeInTheDocument();
  });

  it("says a device with no timezone is never dispatched to", () => {
    render(
      <RemindersPanel
        tripId="t1"
        initial={{
          enabled: true,
          device: { timezone: null, subscribedAt: SUBSCRIBED_AT },
        }}
      />,
    );

    expect(screen.getByText(/timezone unknown · subscribed/i)).toBeInTheDocument();
    expect(screen.getByText(/skipped every run/i)).toBeInTheDocument();
  });

  it("renders the test send's error verbatim rather than a generic failure", async () => {
    const user = userEvent.setup();
    vi.mocked(sendTestDigest).mockResolvedValue({
      ok: false,
      error: "Push is not configured on this deployment — the VAPID keys are missing.",
    });

    render(
      <RemindersPanel tripId="t1" initial={{ enabled: true, device: null }} />,
    );

    await user.click(screen.getByRole("button", { name: /send me a test/i }));

    expect(sendTestDigest).toHaveBeenCalledWith("t1");
    expect(
      await screen.findByText(
        "Push is not configured on this deployment — the VAPID keys are missing.",
      ),
    ).toBeInTheDocument();
  });

  it("surfaces the no-device error verbatim too", async () => {
    const user = userEvent.setup();
    vi.mocked(sendTestDigest).mockResolvedValue({
      ok: false,
      error: "No device is subscribed yet. Press Enable first.",
    });

    render(
      <RemindersPanel tripId="t1" initial={{ enabled: true, device: null }} />,
    );

    await user.click(screen.getByRole("button", { name: /send me a test/i }));

    expect(
      await screen.findByText("No device is subscribed yet. Press Enable first."),
    ).toBeInTheDocument();
  });

  it("names the real digest when a successful test carried content", async () => {
    const user = userEvent.setup();
    vi.mocked(sendTestDigest).mockResolvedValue({ ok: true, sent: 2, placeholder: false });

    render(
      <RemindersPanel
        tripId="t1"
        initial={{
          enabled: true,
          device: { timezone: "Europe/Rome", subscribedAt: SUBSCRIBED_AT },
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /send me a test/i }));

    expect(await screen.findByText("Sent today's digest to 2 devices.")).toBeInTheDocument();
  });

  it("says a quiet day is a quiet day when the test was a placeholder", async () => {
    const user = userEvent.setup();
    vi.mocked(sendTestDigest).mockResolvedValue({ ok: true, sent: 1, placeholder: true });

    render(
      <RemindersPanel
        tripId="t1"
        initial={{
          enabled: true,
          device: { timezone: "Europe/Rome", subscribedAt: SUBSCRIBED_AT },
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /send me a test/i }));

    // The push arrived, so this is not an error — but the Traveller still
    // needs to know why it did not look like a digest.
    expect(
      await screen.findByText(
        "Sent a test to 1 device. There's nothing to report today, so your real digest would stay silent.",
      ),
    ).toBeInTheDocument();
  });

  it("mentions the travel-day morning digest, not just the evening one", () => {
    render(
      <RemindersPanel
        tripId="t1"
        initial={{
          enabled: true,
          device: { timezone: "Europe/Rome", subscribedAt: SUBSCRIBED_AT },
        }}
      />,
    );

    // A dawn push nobody was told about reads as a bug, so the copy has to
    // name it: evening always, plus a short one around 7am on a travel day.
    expect(screen.getByText(/one push in the evening/i)).toBeInTheDocument();
    expect(screen.getByText(/around 7am/i)).toBeInTheDocument();
    expect(screen.getByText(/travel day/i)).toBeInTheDocument();
  });

  it("rolls the switch back and explains itself when the save fails", async () => {
    const user = userEvent.setup();
    vi.mocked(setDigestEnabled).mockRejectedValue(new Error("offline"));

    render(
      <RemindersPanel
        tripId="t1"
        initial={{
          enabled: true,
          device: { timezone: "Europe/Rome", subscribedAt: SUBSCRIBED_AT },
        }}
      />,
    );

    const toggle = screen.getByLabelText(/your digest/i);
    await user.click(toggle);

    expect(await screen.findByText(/couldn't save that/i)).toBeInTheDocument();
    // Rolled back: the checkbox must not claim a state the server refused.
    expect(toggle).toBeChecked();
  });

  it("says so when the stored zone is not the zone this device is in", () => {
    // The actual trip: both travellers enable in Brisbane in October and fly
    // to Europe on 1 December. Reading "8pm · Australia/Brisbane" back as
    // current is a lie — that is 11:00 Vienna.
    vi.mocked(deviceTimeZone).mockReturnValue("Europe/Vienna");

    render(
      <RemindersPanel
        tripId="t1"
        initial={{
          enabled: true,
          device: { timezone: "Australia/Brisbane", subscribedAt: SUBSCRIBED_AT },
        }}
      />,
    );

    expect(
      screen.getByText(/8pm · Australia\/Brisbane — not this device's zone/),
    ).toBeInTheDocument();
    expect(screen.getByText(/You are in Europe\/Vienna/)).toBeInTheDocument();
  });

  it("does not cry drift when the stored zone is the one this device is in", () => {
    vi.mocked(deviceTimeZone).mockReturnValue("Australia/Brisbane");

    render(
      <RemindersPanel
        tripId="t1"
        initial={{
          enabled: true,
          device: { timezone: "Australia/Brisbane", subscribedAt: SUBSCRIBED_AT },
        }}
      />,
    );

    expect(screen.getByText("8pm · Australia/Brisbane")).toBeInTheDocument();
    expect(screen.queryByText(/not this device's zone/)).not.toBeInTheDocument();
  });

  it("leaves a device with no stored zone to its own warning", () => {
    // "You are in X but it is scheduled against null" is noise on top of the
    // harder problem the null-timezone warning already states.
    vi.mocked(deviceTimeZone).mockReturnValue("Europe/Vienna");

    render(
      <RemindersPanel
        tripId="t1"
        initial={{
          enabled: true,
          device: { timezone: null, subscribedAt: SUBSCRIBED_AT },
        }}
      />,
    );

    expect(screen.getByText(/skipped every run/i)).toBeInTheDocument();
    expect(screen.queryByText(/not this device's zone/)).not.toBeInTheDocument();
  });

  it("says when the schedule reaches the stored zone at no hour at all", () => {
    // A device in America/New_York under EST: the cron's UTC hours land at
    // 01:00, 04:00, 05:00, 14:00 and 15:00 local, none of them in a window.
    // The cron considers it every run and reaches it never, silently.
    vi.setSystemTime(new Date("2026-12-05T12:00:00Z"));
    vi.mocked(deviceTimeZone).mockReturnValue("America/New_York");

    render(
      <RemindersPanel
        tripId="t1"
        initial={{
          enabled: true,
          device: { timezone: "America/New_York", subscribedAt: SUBSCRIBED_AT },
        }}
      />,
    );

    expect(
      screen.getByText(/Nothing is scheduled to reach America\/New_York/),
    ).toBeInTheDocument();
  });

  it("stays quiet for a zone the schedule does reach", () => {
    vi.setSystemTime(new Date("2026-12-05T12:00:00Z"));
    vi.mocked(deviceTimeZone).mockReturnValue("Europe/Rome");

    render(
      <RemindersPanel
        tripId="t1"
        initial={{
          enabled: true,
          device: { timezone: "Europe/Rome", subscribedAt: SUBSCRIBED_AT },
        }}
      />,
    );

    expect(screen.queryByText(/Nothing is scheduled to reach/)).not.toBeInTheDocument();
  });

  it("explains that a silent day is by design", () => {
    render(
      <RemindersPanel
        tripId="t1"
        initial={{
          enabled: true,
          device: { timezone: "Europe/Rome", subscribedAt: SUBSCRIBED_AT },
        }}
      />,
    );

    expect(
      screen.getByText(/only sent when there is something to say/i),
    ).toBeInTheDocument();
  });
});
