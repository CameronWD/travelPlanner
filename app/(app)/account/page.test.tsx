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

vi.mock("@/lib/guards", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/db", () => ({
  db: {
    pushSubscription: { findMany: pushSubscriptionFindManyMock },
    trip: { findMany: tripFindManyMock },
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

  it("renders the Devices panel", async () => {
    const jsx = await AccountPage();
    render(jsx);
    expect(screen.getByTestId("devices-panel")).toBeInTheDocument();
  });

  it("renders an unchecked box for a trip with the digest turned off", async () => {
    tripFindManyMock.mockResolvedValue([
      {
        id: "trip-1",
        name: "Europe Christmas 2026",
        digestPreferences: [{ enabled: false }],
      },
    ]);

    const jsx = await AccountPage();
    render(jsx);

    expect(screen.getByLabelText("Europe Christmas 2026")).not.toBeChecked();
  });

  it("requires a signed-in user before rendering either section", async () => {
    await AccountPage();
    expect(requireUserMock).toHaveBeenCalled();
  });
});
