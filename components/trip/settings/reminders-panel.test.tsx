import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/server/actions/digest", () => ({
  setDigestEnabled: vi.fn().mockResolvedValue({ ok: true }),
  sendTestDigest: vi.fn().mockResolvedValue({ ok: true, sent: 1 }),
}));

// Stubbed so these tests are about the panel's own branching, not the push
// API detection inside EnableNotifications (which has its own tests and
// renders an "unavailable" state under jsdom).
vi.mock("@/components/trip/enable-notifications", () => ({
  EnableNotifications: () => <button type="button">Enable trip reminders</button>,
}));

import { setDigestEnabled, sendTestDigest } from "@/server/actions/digest";
import { RemindersPanel } from "./reminders-panel";

const SUBSCRIBED_AT = new Date("2026-09-03T10:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(setDigestEnabled).mockResolvedValue({ ok: true });
  vi.mocked(sendTestDigest).mockResolvedValue({ ok: true, sent: 1 });
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

  it("reports how many devices a successful test reached", async () => {
    const user = userEvent.setup();
    vi.mocked(sendTestDigest).mockResolvedValue({ ok: true, sent: 2 });

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

    expect(await screen.findByText(/sent to 2 devices/i)).toBeInTheDocument();
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
