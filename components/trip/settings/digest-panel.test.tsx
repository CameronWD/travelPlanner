import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LocalDeviceState } from "@/components/account/device-state";
import type { DeviceSummary } from "@/server/actions/devices";

vi.mock("@/server/actions/digest", () => ({
  setDigestEnabled: vi.fn().mockResolvedValue({ ok: true }),
  sendTestDigest: vi.fn().mockResolvedValue({ ok: true, sent: 1, placeholder: false }),
}));

const readLocalDeviceStateMock = vi.hoisted(() => vi.fn());
vi.mock("@/components/account/device-state", () => ({
  readLocalDeviceState: readLocalDeviceStateMock,
}));

const listDevicesMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/devices", () => ({
  listDevices: listDevicesMock,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
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
import { DigestPanel } from "./digest-panel";

const SUBSCRIBED_AT = new Date("2026-09-03T10:00:00Z");

/** This browser holds a live PushSubscription. */
function subscribedHere(overrides: Partial<LocalDeviceState> = {}): LocalDeviceState {
  return {
    permission: "granted",
    endpoint: "https://push.example.com/this-browser",
    keys: { p256dh: "p", auth: "a" },
    needsInstall: false,
    ...overrides,
  };
}

/** This browser holds no subscription at all. */
function notSubscribedHere(overrides: Partial<LocalDeviceState> = {}): LocalDeviceState {
  return {
    permission: "default",
    endpoint: null,
    keys: null,
    needsInstall: false,
    ...overrides,
  };
}

/** A row as `listDevices` (server/actions/devices.ts) returns it. */
function deviceRow(overrides: Partial<DeviceSummary> = {}): DeviceSummary {
  return {
    id: "sub-1",
    label: null,
    timezone: "Europe/Rome",
    subscribedAt: SUBSCRIBED_AT,
    lastSeenAt: SUBSCRIBED_AT,
    isThisDevice: false,
    stale: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(setDigestEnabled).mockResolvedValue({ ok: true });
  vi.mocked(sendTestDigest).mockResolvedValue({ ok: true, sent: 1, placeholder: false });
  vi.mocked(deviceTimeZone).mockReturnValue("Europe/Rome");
  // A safe default so every test's `readLocalDeviceState().then(...)` has
  // something to resolve to, even tests that don't care about the device
  // line at all.
  readLocalDeviceStateMock.mockResolvedValue(notSubscribedHere());
  listDevicesMock.mockResolvedValue([]);
});

afterEach(() => {
  // Whether a zone is served moves with daylight saving, so those tests pin
  // the date — put it back or the rest of the file drifts with the calendar.
  vi.useRealTimers();
});

describe("DigestPanel", () => {
  it("toggling the switch saves the inverted value", async () => {
    const user = userEvent.setup();
    render(
      <DigestPanel
        tripId="t1"
        initial={{
          enabled: true,
          devices: [{ timezone: "Australia/Sydney", subscribedAt: SUBSCRIBED_AT, label: null }],
        }}
      />,
    );

    await user.click(await screen.findByLabelText(/your digest for this trip/i));

    expect(setDigestEnabled).toHaveBeenCalledWith("t1", false);
  });

  it("turns the digest back on when it starts off", async () => {
    const user = userEvent.setup();
    render(
      <DigestPanel
        tripId="t1"
        initial={{
          enabled: false,
          devices: [{ timezone: "Australia/Sydney", subscribedAt: SUBSCRIBED_AT, label: null }],
        }}
      />,
    );

    await user.click(await screen.findByLabelText(/your digest for this trip/i));

    expect(setDigestEnabled).toHaveBeenCalledWith("t1", true);
  });

  // ── The device-state line ──────────────────────────────────────────────

  it("says the device will receive it, with its zone, when this browser is the one known device", async () => {
    readLocalDeviceStateMock.mockResolvedValue(subscribedHere());
    listDevicesMock.mockResolvedValue([
      deviceRow({ isThisDevice: true, timezone: "Europe/Rome", label: "iPhone" }),
    ]);

    render(
      <DigestPanel
        tripId="t1"
        initial={{
          enabled: true,
          devices: [{ timezone: "Europe/Rome", subscribedAt: SUBSCRIBED_AT, label: "iPhone" }],
        }}
      />,
    );

    expect(await screen.findByText("This device will receive it · Europe/Rome")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /manage devices/i })).not.toBeInTheDocument();
  });

  it("says this device isn't set up, and links to Account, when it holds no subscription but other devices exist", async () => {
    readLocalDeviceStateMock.mockResolvedValue(notSubscribedHere());
    listDevicesMock.mockResolvedValue([deviceRow({ isThisDevice: false, timezone: "Europe/Rome" })]);

    render(
      <DigestPanel
        tripId="t1"
        initial={{
          enabled: true,
          devices: [{ timezone: "Europe/Rome", subscribedAt: SUBSCRIBED_AT, label: "iPhone" }],
        }}
      />,
    );

    expect(
      await screen.findByText("This device isn’t set up to receive your digest."),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /manage devices/i });
    expect(link).toHaveAttribute("href", "/account");
    expect(screen.queryByText(/this device will receive it/i)).not.toBeInTheDocument();
  });

  it("never offers its own Enable control — that control lives on Account now", async () => {
    readLocalDeviceStateMock.mockResolvedValue(notSubscribedHere());
    listDevicesMock.mockResolvedValue([]);

    render(
      <DigestPanel tripId="t1" initial={{ enabled: true, devices: [] }} />,
    );

    await screen.findByText(/no device is set up yet/i);
    expect(
      screen.queryByRole("button", { name: /enable on this device/i }),
    ).not.toBeInTheDocument();
  });

  it("says no device is set up yet when the account has none on file at all", async () => {
    readLocalDeviceStateMock.mockResolvedValue(notSubscribedHere());
    listDevicesMock.mockResolvedValue([]);

    render(<DigestPanel tripId="t1" initial={{ enabled: true, devices: [] }} />);

    expect(
      await screen.findByText("No device is set up yet, so there’s nowhere to send this."),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /manage devices/i });
    expect(link).toHaveAttribute("href", "/account");
  });

  // The scenario the brief flagged as ambiguous: this browser has a live
  // subscription, but the account has zero devices on file (e.g. the server
  // row was removed and DeviceSync has not yet re-healed it). The
  // server-authoritative fact — "Send me a test" would fail right now with
  // no device to reach — wins over the browser's optimistic local belief.
  // This now falls out of `listDevices` itself returning an empty list,
  // rather than a special case comparing counts.
  it("says no device is set up yet even when this browser believes it holds a subscription", async () => {
    readLocalDeviceStateMock.mockResolvedValue(subscribedHere());
    listDevicesMock.mockResolvedValue([]);

    render(<DigestPanel tripId="t1" initial={{ enabled: true, devices: [] }} />);

    expect(
      await screen.findByText("No device is set up yet, so there’s nowhere to send this."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/this device will receive it/i)).not.toBeInTheDocument();
  });

  // Fix round 1 finding #1/#3: attribution must work at ANY device count,
  // via the server's own `isThisDevice`, never a "devices.length === 1"
  // heuristic (which silenced every warning for a two-device traveller, and
  // could misattribute at n=1 too if the one row on file wasn't actually
  // this browser's).
  it("attributes the stored zone correctly via isThisDevice among several devices on file", async () => {
    readLocalDeviceStateMock.mockResolvedValue(subscribedHere());
    listDevicesMock.mockResolvedValue([
      deviceRow({ id: "sub-brisbane", isThisDevice: true, timezone: "Australia/Brisbane", label: "iPhone" }),
      deviceRow({ id: "sub-vienna", isThisDevice: false, timezone: "Europe/Vienna", label: "Mac" }),
    ]);

    render(
      <DigestPanel
        tripId="t1"
        initial={{
          enabled: true,
          devices: [
            { timezone: "Australia/Brisbane", subscribedAt: SUBSCRIBED_AT, label: "iPhone" },
            { timezone: "Europe/Vienna", subscribedAt: SUBSCRIBED_AT, label: "Mac" },
          ],
        }}
      />,
    );

    expect(
      await screen.findByText("This device will receive it · Australia/Brisbane"),
    ).toBeInTheDocument();
  });

  // Fix round 1 finding #4: invert the old "skip warnings at 2+ devices"
  // test — with isThisDevice available, the stale-zone warning MUST render
  // once the server identifies which of several devices is this one.
  it("renders the stale-zone warning for a multi-device traveller once isThisDevice identifies this browser", async () => {
    readLocalDeviceStateMock.mockResolvedValue(subscribedHere());
    vi.mocked(deviceTimeZone).mockReturnValue("Europe/Vienna");
    listDevicesMock.mockResolvedValue([
      deviceRow({ id: "sub-brisbane", isThisDevice: true, timezone: "Australia/Brisbane", label: "iPhone" }),
      deviceRow({ id: "sub-mac", isThisDevice: false, timezone: null, label: "Mac" }),
    ]);

    render(
      <DigestPanel
        tripId="t1"
        initial={{
          enabled: true,
          devices: [
            { timezone: "Australia/Brisbane", subscribedAt: SUBSCRIBED_AT, label: "iPhone" },
            { timezone: null, subscribedAt: SUBSCRIBED_AT, label: "Mac" },
          ],
        }}
      />,
    );

    expect(
      await screen.findByText(/still scheduled against Australia\/Brisbane/),
    ).toBeInTheDocument();
    expect(screen.getByText(/You are in Europe\/Vienna/)).toBeInTheDocument();
  });

  // Fix round 1 finding #2: when no row's `isThisDevice` is true — a stale
  // local subscription with no matching server row, even while other devices
  // ARE on file — the panel must not fabricate a zone by falling back to
  // this browser's own live zone. That reads as "This device will receive
  // it" over a device the dispatcher cannot actually reach.
  it("shows no zone, and no zone-specific warnings, when this browser's subscription matches no server row", async () => {
    readLocalDeviceStateMock.mockResolvedValue(subscribedHere());
    vi.mocked(deviceTimeZone).mockReturnValue("Europe/Vienna");
    listDevicesMock.mockResolvedValue([
      deviceRow({ id: "sub-brisbane", isThisDevice: false, timezone: "Australia/Brisbane", label: "iPhone" }),
      deviceRow({ id: "sub-mac", isThisDevice: false, timezone: null, label: "Mac" }),
    ]);

    render(
      <DigestPanel
        tripId="t1"
        initial={{
          enabled: true,
          devices: [
            { timezone: "Australia/Brisbane", subscribedAt: SUBSCRIBED_AT, label: "iPhone" },
            { timezone: null, subscribedAt: SUBSCRIBED_AT, label: "Mac" },
          ],
        }}
      />,
    );

    expect(await screen.findByText("This device will receive it")).toBeInTheDocument();
    expect(screen.queryByText(/This device will receive it ·/)).not.toBeInTheDocument();
    expect(screen.queryByText(/still scheduled against/)).not.toBeInTheDocument();
    expect(screen.queryByText(/skipped every run/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nothing is scheduled to reach/)).not.toBeInTheDocument();
  });

  it("says a device with no timezone is never dispatched to", async () => {
    readLocalDeviceStateMock.mockResolvedValue(subscribedHere());
    listDevicesMock.mockResolvedValue([deviceRow({ isThisDevice: true, timezone: null })]);

    render(
      <DigestPanel
        tripId="t1"
        initial={{
          enabled: true,
          devices: [{ timezone: null, subscribedAt: SUBSCRIBED_AT, label: null }],
        }}
      />,
    );

    expect(await screen.findByText("This device will receive it")).toBeInTheDocument();
    expect(screen.getByText(/skipped every run/i)).toBeInTheDocument();
  });

  it("renders the test send's error verbatim rather than a generic failure", async () => {
    const user = userEvent.setup();
    vi.mocked(sendTestDigest).mockResolvedValue({
      ok: false,
      error: "Push is not configured on this deployment — the VAPID keys are missing.",
    });

    render(<DigestPanel tripId="t1" initial={{ enabled: true, devices: [] }} />);

    await user.click(await screen.findByRole("button", { name: /send me a test/i }));

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

    render(<DigestPanel tripId="t1" initial={{ enabled: true, devices: [] }} />);

    await user.click(await screen.findByRole("button", { name: /send me a test/i }));

    expect(
      await screen.findByText("No device is subscribed yet. Press Enable first."),
    ).toBeInTheDocument();
  });

  it("names the real digest when a successful test carried content", async () => {
    const user = userEvent.setup();
    vi.mocked(sendTestDigest).mockResolvedValue({ ok: true, sent: 2, placeholder: false });

    render(
      <DigestPanel
        tripId="t1"
        initial={{
          enabled: true,
          devices: [{ timezone: "Europe/Rome", subscribedAt: SUBSCRIBED_AT, label: null }],
        }}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /send me a test/i }));

    expect(await screen.findByText("Sent today's digest to 2 devices.")).toBeInTheDocument();
  });

  it("says a quiet day is a quiet day when the test was a placeholder", async () => {
    const user = userEvent.setup();
    vi.mocked(sendTestDigest).mockResolvedValue({ ok: true, sent: 1, placeholder: true });

    render(
      <DigestPanel
        tripId="t1"
        initial={{
          enabled: true,
          devices: [{ timezone: "Europe/Rome", subscribedAt: SUBSCRIBED_AT, label: null }],
        }}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /send me a test/i }));

    // The push arrived, so this is not an error — but the Traveller still
    // needs to know why it did not look like a digest.
    expect(
      await screen.findByText(
        "Sent a test to 1 device. There's nothing to report today, so your real digest would stay silent.",
      ),
    ).toBeInTheDocument();
  });

  it("mentions the travel-day morning digest, not just the evening one", async () => {
    render(
      <DigestPanel
        tripId="t1"
        initial={{
          enabled: true,
          devices: [{ timezone: "Europe/Rome", subscribedAt: SUBSCRIBED_AT, label: null }],
        }}
      />,
    );

    // A dawn push nobody was told about reads as a bug, so the copy has to
    // name it: evening always, plus a short one around 7am on a travel day.
    expect(await screen.findByText(/one push in the evening/i)).toBeInTheDocument();
    expect(screen.getByText(/around 7am/i)).toBeInTheDocument();
    expect(screen.getByText(/travel day/i)).toBeInTheDocument();
  });

  it("rolls the switch back and explains itself when the save fails", async () => {
    const user = userEvent.setup();
    vi.mocked(setDigestEnabled).mockRejectedValue(new Error("offline"));

    render(
      <DigestPanel
        tripId="t1"
        initial={{
          enabled: true,
          devices: [{ timezone: "Europe/Rome", subscribedAt: SUBSCRIBED_AT, label: null }],
        }}
      />,
    );

    const toggle = await screen.findByLabelText(/your digest for this trip/i);
    await user.click(toggle);

    expect(await screen.findByText(/couldn't save that/i)).toBeInTheDocument();
    // Rolled back: the checkbox must not claim a state the server refused.
    expect(toggle).toBeChecked();
  });

  it("says so when the stored zone is not the zone this device is in", async () => {
    // The actual trip: both travellers enable in Brisbane in October and fly
    // to Europe on 1 December. Reading the digest as scheduled against
    // Brisbane while standing in Vienna is a lie — that is 11:00 Vienna.
    readLocalDeviceStateMock.mockResolvedValue(subscribedHere());
    vi.mocked(deviceTimeZone).mockReturnValue("Europe/Vienna");
    listDevicesMock.mockResolvedValue([deviceRow({ isThisDevice: true, timezone: "Australia/Brisbane" })]);

    render(
      <DigestPanel
        tripId="t1"
        initial={{
          enabled: true,
          devices: [{ timezone: "Australia/Brisbane", subscribedAt: SUBSCRIBED_AT, label: null }],
        }}
      />,
    );

    expect(
      await screen.findByText("This device will receive it · Australia/Brisbane"),
    ).toBeInTheDocument();
    expect(screen.getByText(/You are in Europe\/Vienna/)).toBeInTheDocument();
    expect(screen.getByText(/still scheduled against Australia\/Brisbane/)).toBeInTheDocument();
    // The concrete part of the warning — what hour it actually arrives at —
    // must survive, not just the fact that a mismatch exists.
    expect(screen.getByText(/arrives at 8pm Australia\/Brisbane/)).toBeInTheDocument();
  });

  it("does not cry drift when the stored zone is the one this device is in", async () => {
    readLocalDeviceStateMock.mockResolvedValue(subscribedHere());
    vi.mocked(deviceTimeZone).mockReturnValue("Australia/Brisbane");
    listDevicesMock.mockResolvedValue([deviceRow({ isThisDevice: true, timezone: "Australia/Brisbane" })]);

    render(
      <DigestPanel
        tripId="t1"
        initial={{
          enabled: true,
          devices: [{ timezone: "Australia/Brisbane", subscribedAt: SUBSCRIBED_AT, label: null }],
        }}
      />,
    );

    expect(
      await screen.findByText("This device will receive it · Australia/Brisbane"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/still scheduled against/)).not.toBeInTheDocument();
  });

  it("leaves a device with no stored zone to its own warning", async () => {
    // "You are in X but it is scheduled against nothing" is noise on top of
    // the harder problem the null-timezone warning already states.
    readLocalDeviceStateMock.mockResolvedValue(subscribedHere());
    vi.mocked(deviceTimeZone).mockReturnValue("Europe/Vienna");
    listDevicesMock.mockResolvedValue([deviceRow({ isThisDevice: true, timezone: null })]);

    render(
      <DigestPanel
        tripId="t1"
        initial={{
          enabled: true,
          devices: [{ timezone: null, subscribedAt: SUBSCRIBED_AT, label: null }],
        }}
      />,
    );

    expect(await screen.findByText(/skipped every run/i)).toBeInTheDocument();
    expect(screen.queryByText(/still scheduled against/)).not.toBeInTheDocument();
  });

  it("says when the schedule reaches the stored zone at no hour at all", async () => {
    // A device in America/New_York under EST: the cron's UTC hours land at
    // 01:00, 04:00, 05:00, 14:00 and 15:00 local, none of them in a window.
    // The cron considers it every run and reaches it never, silently.
    vi.setSystemTime(new Date("2026-12-05T12:00:00Z"));
    readLocalDeviceStateMock.mockResolvedValue(subscribedHere());
    vi.mocked(deviceTimeZone).mockReturnValue("America/New_York");
    listDevicesMock.mockResolvedValue([deviceRow({ isThisDevice: true, timezone: "America/New_York" })]);

    render(
      <DigestPanel
        tripId="t1"
        initial={{
          enabled: true,
          devices: [{ timezone: "America/New_York", subscribedAt: SUBSCRIBED_AT, label: null }],
        }}
      />,
    );

    expect(
      await screen.findByText(/Nothing is scheduled to reach America\/New_York/),
    ).toBeInTheDocument();
  });

  it("stays quiet for a zone the schedule does reach", async () => {
    vi.setSystemTime(new Date("2026-12-05T12:00:00Z"));
    readLocalDeviceStateMock.mockResolvedValue(subscribedHere());
    vi.mocked(deviceTimeZone).mockReturnValue("Europe/Rome");
    listDevicesMock.mockResolvedValue([deviceRow({ isThisDevice: true, timezone: "Europe/Rome" })]);

    render(
      <DigestPanel
        tripId="t1"
        initial={{
          enabled: true,
          devices: [{ timezone: "Europe/Rome", subscribedAt: SUBSCRIBED_AT, label: null }],
        }}
      />,
    );

    await screen.findByText("This device will receive it · Europe/Rome");
    expect(screen.queryByText(/Nothing is scheduled to reach/)).not.toBeInTheDocument();
  });

  it("explains that a silent day is by design", async () => {
    render(
      <DigestPanel
        tripId="t1"
        initial={{
          enabled: true,
          devices: [{ timezone: "Europe/Rome", subscribedAt: SUBSCRIBED_AT, label: null }],
        }}
      />,
    );

    expect(
      await screen.findByText(/only sent when there is something to say/i),
    ).toBeInTheDocument();
  });
});
