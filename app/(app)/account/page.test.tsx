import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// account/page.tsx is an async server component that fans out to
// listDevices (server/actions/devices) and listDigestSettingsForUser
// (server/actions/digest). Both call requireUser() under the hood — mocking
// @/lib/guards and @/lib/db (rather than the two server actions themselves)
// lets the real actions run, so "requires a signed-in user" is a genuine
// assertion about the page's dependency chain, not just a marker mock saying
// so. DevicesPanel is marker-mocked: its own behaviour is covered by
// devices-panel.test.tsx, and it reads client-only local device state that
// has no place in a server-component test.

const requireUserMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: "user-1" }),
);
const pushSubscriptionFindManyMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const tripFindManyMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));
// Deliberately resolves to `null` by default: a brand-new deployment has no
// CronHeartbeat row at all until the first authorized cron hit lands, and
// getDispatcherHealth (server/actions/cron-health.ts) must render "never run"
// rather than throw when that row is absent.
const cronHeartbeatFindUniqueMock = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock("@/lib/guards", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/db", () => ({
  db: {
    pushSubscription: { findMany: pushSubscriptionFindManyMock },
    trip: { findMany: tripFindManyMock },
    cronHeartbeat: { findUnique: cronHeartbeatFindUniqueMock },
  },
}));
vi.mock("@/components/account/devices-panel", () => ({
  DevicesPanel: () => <div data-testid="devices-panel" />,
}));

import AccountPage, { metadata } from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: "user-1" });
  pushSubscriptionFindManyMock.mockResolvedValue([]);
  tripFindManyMock.mockResolvedValue([]);
  cronHeartbeatFindUniqueMock.mockResolvedValue(null);
});

describe("AccountPage", () => {
  it("has an Account title", () => {
    expect(metadata.title).toBe("Account");
  });

  it("renders both section headings", async () => {
    const jsx = await AccountPage();
    render(jsx);
    expect(screen.getByText("Devices")).toBeInTheDocument();
    expect(
      screen.getByText("Which trips send you a digest"),
    ).toBeInTheDocument();
  });

  it("titles the page with a kit display h1", async () => {
    const jsx = await AccountPage();
    render(jsx);
    const h1 = screen.getByRole("heading", { level: 1, name: "Account" });
    expect(h1.className).toMatch(/font-display/);
    expect(h1.className).toMatch(/font-extrabold/);
  });

  it("puts each panel in its own kit Card, named by its heading", async () => {
    const jsx = await AccountPage();
    render(jsx);
    for (const name of ["Devices", "Which trips send you a digest"]) {
      const region = screen.getByRole("region", { name });
      // Card's kit shape: 2px outline + hard shadow — not the old 1px border.
      expect(region.className).toMatch(/\bborder-2\b/);
      expect(region.className).toMatch(/\bshadow-hard-2\b/);
      expect(screen.getByRole("heading", { name }).tagName).toBe("H3");
    }
  });

  it("lays the two panels out as the kit's two columns on desktop", async () => {
    const jsx = await AccountPage();
    render(jsx);
    const grid = screen.getByRole("region", { name: "Devices" }).parentElement!;
    expect(grid.className).toMatch(/lg:grid-cols-2/);
  });

  it("renders the Devices panel", async () => {
    const jsx = await AccountPage();
    render(jsx);
    expect(screen.getByTestId("devices-panel")).toBeInTheDocument();
  });

  it("renders an unchecked switch for a trip with the digest turned off", async () => {
    tripFindManyMock.mockResolvedValue([
      {
        id: "trip-1",
        name: "Europe Christmas 2026",
        digestPreferences: [{ enabled: false }],
      },
    ]);

    const jsx = await AccountPage();
    render(jsx);

    expect(
      screen.getByRole("switch", { name: "Europe Christmas 2026" }),
    ).not.toBeChecked();
  });

  it("requires a signed-in user before rendering either section", async () => {
    await AccountPage();
    expect(requireUserMock).toHaveBeenCalled();
  });

  it("renders 'never run' for a brand-new deployment with no CronHeartbeat row", async () => {
    cronHeartbeatFindUniqueMock.mockResolvedValue(null);

    const jsx = await AccountPage();
    render(jsx);

    expect(screen.getByText(/never run/)).toBeInTheDocument();
    expect(screen.getByText(/digests are not being sent/i)).toBeInTheDocument();
  });

  it("renders the dispatcher's last-run time once a heartbeat exists", async () => {
    // Both signals fresh — the genuinely healthy state. A row with lastRunAt
    // but no lastSuccessAt is a different, unhealthy state (see the case
    // below) and must not be mistaken for this one (CD-06 fix-round-1).
    const now = new Date();
    cronHeartbeatFindUniqueMock.mockResolvedValue({
      id: "digest",
      lastRunAt: now,
      lastSuccessAt: now,
    });

    const jsx = await AccountPage();
    render(jsx);

    expect(screen.getByText(/last ran/)).toBeInTheDocument();
    expect(screen.queryByText(/digests are not being sent/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/running, but/i)).not.toBeInTheDocument();
  });

  it("warns that nothing has been sent when lastRunAt is fresh but lastSuccessAt is stale", async () => {
    // The route is running (lastRunAt fresh) but the dispatch loop has not
    // completed in a while (lastSuccessAt stale) — CD-06's actual failure
    // mode: a throw inside the scan leaves the route heartbeat healthy while
    // zero Digests go out. This must render the real warning copy, not just
    // the absence of the unrelated "digests are not being sent" phrase.
    cronHeartbeatFindUniqueMock.mockResolvedValue({
      id: "digest",
      lastRunAt: new Date(),
      lastSuccessAt: new Date("2020-01-01T00:00:00.000Z"),
    });

    const jsx = await AccountPage();
    render(jsx);

    expect(screen.getByText(/last ran/)).toBeInTheDocument();
    expect(
      screen.getByText(/running, but nothing has been sent since/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/digests are not being sent/i)).not.toBeInTheDocument();
  });

  it("still renders the Devices card when the CronHeartbeat read fails", async () => {
    // getDispatcherHealth swallows this today, so the page survives by
    // construction — but nothing said so at page level. A refactor that let
    // the throw out would take AccountPage's Promise.all, and with it the
    // whole Devices list, down: exactly the panel a Traveller is on when
    // working out why their Digests stopped (CD-13).
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    cronHeartbeatFindUniqueMock.mockRejectedValue(new Error("relation \"CronHeartbeat\" does not exist"));

    const jsx = await AccountPage();
    render(jsx);

    expect(screen.getByText("Devices")).toBeInTheDocument();
    expect(screen.getByTestId("devices-panel")).toBeInTheDocument();
    expect(screen.getByText("Which trips send you a digest")).toBeInTheDocument();
    // "Never run" is the honest answer when the heartbeat cannot be read.
    expect(screen.getByText(/never run/i)).toBeInTheDocument();
    expect(screen.getByText(/digests are not being sent/i)).toBeInTheDocument();

    errorSpy.mockRestore();
  });
});
