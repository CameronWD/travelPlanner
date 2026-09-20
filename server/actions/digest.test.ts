import { afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "../../test/helpers/access-order";

/**
 * Tests for the Digest settings server actions (Task 7).
 *
 * Mocks: lib/db, lib/guards, lib/digest-dispatch, lib/push, lib/tz, next/cache
 */

const {
  requireTripAccessMock,
  requireUserMock,
  revalidatePathMock,
  digestPreferenceFindUniqueMock,
  digestPreferenceUpsertMock,
  pushSubscriptionFindManyMock,
  pushSubscriptionCountMock,
  tripFindManyMock,
  dispatchDigestMock,
  isPushConfiguredMock,
  todayISOInZoneMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  }),
  requireUserMock: vi.fn().mockResolvedValue({ id: "user-1" }),
  revalidatePathMock: vi.fn(),
  digestPreferenceFindUniqueMock: vi.fn(),
  digestPreferenceUpsertMock: vi.fn(),
  pushSubscriptionFindManyMock: vi.fn(),
  pushSubscriptionCountMock: vi.fn(),
  tripFindManyMock: vi.fn(),
  dispatchDigestMock: vi.fn(),
  isPushConfiguredMock: vi.fn(),
  todayISOInZoneMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({
  requireTripAccess: requireTripAccessMock,
  requireUser: requireUserMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/db", () => ({
  db: {
    digestPreference: {
      findUnique: digestPreferenceFindUniqueMock,
      upsert: digestPreferenceUpsertMock,
    },
    pushSubscription: {
      findMany: pushSubscriptionFindManyMock,
      count: pushSubscriptionCountMock,
    },
    trip: {
      findMany: tripFindManyMock,
    },
  },
}));
vi.mock("@/lib/digest-dispatch", () => ({
  dispatchDigest: dispatchDigestMock,
}));
vi.mock("@/lib/push", () => ({
  isPushConfigured: isPushConfiguredMock,
}));
vi.mock("@/lib/tz", () => ({
  todayISOInZone: todayISOInZoneMock,
}));

// Import after mocks
import {
  getDigestSettings,
  setDigestEnabled,
  sendTestDigest,
  listDigestSettingsForUser,
} from "@/server/actions/digest";

const TRIP_ID = "trip-1";
const USER_ID = "user-1";

afterEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({
    user: { id: USER_ID },
    membership: { role: "owner" },
  });
  requireUserMock.mockResolvedValue({ id: USER_ID });
  isPushConfiguredMock.mockReturnValue(true);
  todayISOInZoneMock.mockReturnValue("2026-09-17");
});

// ---------------------------------------------------------------------------
// Auth ordering — first statement in all three actions
// ---------------------------------------------------------------------------

describe("auth ordering", () => {
  it("getDigestSettings calls requireTripAccess first", async () => {
    digestPreferenceFindUniqueMock.mockResolvedValue(null);
    pushSubscriptionCountMock.mockResolvedValue(0);
    await getDigestSettings(TRIP_ID);
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("setDigestEnabled calls requireTripAccess first", async () => {
    digestPreferenceUpsertMock.mockResolvedValue({});
    await setDigestEnabled(TRIP_ID, true);
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, digestPreferenceUpsertMock);
  });

  it("sendTestDigest calls requireTripAccess first", async () => {
    pushSubscriptionFindManyMock.mockResolvedValue([
      { timezone: "Europe/London", createdAt: new Date("2026-01-01") },
    ]);
    dispatchDigestMock.mockResolvedValue({ sent: 1, skipped: false });
    await sendTestDigest(TRIP_ID);
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, dispatchDigestMock);
  });

  it("sendTestDigest checks access even when push is not configured", async () => {
    isPushConfiguredMock.mockReturnValue(false);
    await sendTestDigest(TRIP_ID);
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });
});

// ---------------------------------------------------------------------------
// getDigestSettings
// ---------------------------------------------------------------------------

describe("getDigestSettings", () => {
  it("reports enabled: true when no preference row exists", async () => {
    digestPreferenceFindUniqueMock.mockResolvedValue(null);
    pushSubscriptionCountMock.mockResolvedValue(0);

    const result = await getDigestSettings(TRIP_ID);

    expect(result.enabled).toBe(true);
    expect(digestPreferenceFindUniqueMock).toHaveBeenCalledWith({
      where: { userId_tripId: { userId: USER_ID, tripId: TRIP_ID } },
      select: { enabled: true },
    });
  });

  it("reports enabled: false when the preference row says so", async () => {
    digestPreferenceFindUniqueMock.mockResolvedValue({ enabled: false });
    pushSubscriptionCountMock.mockResolvedValue(0);

    const result = await getDigestSettings(TRIP_ID);

    expect(result.enabled).toBe(false);
  });

  it("reports deviceCount: 0 when the user has no subscriptions", async () => {
    digestPreferenceFindUniqueMock.mockResolvedValue(null);
    pushSubscriptionCountMock.mockResolvedValue(0);

    const result = await getDigestSettings(TRIP_ID);

    expect(result.deviceCount).toBe(0);
  });

  // Two sources of truth for "how many devices" (this `count()` and
  // `DevicesPanel`'s own `listDevices` findMany) is exactly the shape that
  // produced the 2026-09-17 incident, so this is a `count()`, not a
  // `findMany()` — pin the query shape, not just the number it returns.
  it("counts this user's own subscriptions via count(), not findMany()", async () => {
    digestPreferenceFindUniqueMock.mockResolvedValue(null);
    pushSubscriptionCountMock.mockResolvedValue(2);

    const result = await getDigestSettings(TRIP_ID);

    expect(result.deviceCount).toBe(2);
    expect(pushSubscriptionCountMock).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
    expect(pushSubscriptionFindManyMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// setDigestEnabled
// ---------------------------------------------------------------------------

describe("setDigestEnabled", () => {
  it("upserts on the (userId, tripId) unique with the right create/update", async () => {
    digestPreferenceUpsertMock.mockResolvedValue({});

    const result = await setDigestEnabled(TRIP_ID, false);

    expect(digestPreferenceUpsertMock).toHaveBeenCalledWith({
      where: { userId_tripId: { userId: USER_ID, tripId: TRIP_ID } },
      create: { userId: USER_ID, tripId: TRIP_ID, enabled: false },
      update: { enabled: false },
    });
    expect(result).toEqual({ ok: true });
  });

  it("revalidates the trip's settings path", async () => {
    digestPreferenceUpsertMock.mockResolvedValue({});

    await setDigestEnabled(TRIP_ID, true);

    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/settings`);
  });
});

// ---------------------------------------------------------------------------
// sendTestDigest
// ---------------------------------------------------------------------------

describe("sendTestDigest", () => {
  it("passes force: true, slot EVENING, and the device-zoned local date", async () => {
    pushSubscriptionFindManyMock.mockResolvedValue([
      { timezone: "Europe/London", createdAt: new Date("2026-01-01") },
    ]);
    todayISOInZoneMock.mockReturnValue("2026-09-17");
    dispatchDigestMock.mockResolvedValue({ sent: 2, skipped: false });

    const result = await sendTestDigest(TRIP_ID);

    expect(todayISOInZoneMock).toHaveBeenCalledWith("Europe/London");
    expect(dispatchDigestMock).toHaveBeenCalledWith({
      userId: USER_ID,
      tripId: TRIP_ID,
      localDate: "2026-09-17",
      slot: "EVENING",
      force: true,
    });
    expect(result).toEqual({ ok: true, sent: 2, placeholder: false });
  });

  it("falls back to UTC when the device's timezone is null", async () => {
    pushSubscriptionFindManyMock.mockResolvedValue([
      { timezone: null, createdAt: new Date("2026-01-01") },
    ]);
    dispatchDigestMock.mockResolvedValue({ sent: 1, skipped: false });

    await sendTestDigest(TRIP_ID);

    expect(todayISOInZoneMock).toHaveBeenCalledWith("UTC");
  });

  it("returns the push-not-configured error and never calls dispatchDigest", async () => {
    isPushConfiguredMock.mockReturnValue(false);

    const result = await sendTestDigest(TRIP_ID);

    expect(result).toEqual({
      ok: false,
      error: "Push is not configured on this deployment — the VAPID keys are missing.",
    });
    expect(dispatchDigestMock).not.toHaveBeenCalled();
  });

  it("returns the no-device error and never calls dispatchDigest", async () => {
    pushSubscriptionFindManyMock.mockResolvedValue([]);

    const result = await sendTestDigest(TRIP_ID);

    expect(result).toEqual({
      ok: false,
      error: "No device is subscribed yet. Press Enable first.",
    });
    expect(dispatchDigestMock).not.toHaveBeenCalled();
  });

  it("reports a placeholder send as a success, not as nothing-to-send", async () => {
    pushSubscriptionFindManyMock.mockResolvedValue([
      { timezone: "Europe/London", createdAt: new Date("2026-01-01") },
    ]);
    dispatchDigestMock.mockResolvedValue({ sent: 1, skipped: false, placeholder: true });

    const result = await sendTestDigest(TRIP_ID);

    expect(result).toEqual({ ok: true, sent: 1, placeholder: true });
  });

  it("still fails when a test reached no device at all", async () => {
    pushSubscriptionFindManyMock.mockResolvedValue([
      { timezone: "Europe/London", createdAt: new Date("2026-01-01") },
    ]);
    dispatchDigestMock.mockResolvedValue({ sent: 0, skipped: false, placeholder: true });

    const result = await sendTestDigest(TRIP_ID);

    // Removing the empty-content refusal must not weaken the rule that this
    // never claims success when nothing was delivered.
    expect(result).toEqual({
      ok: false,
      error: "The test Digest could not be delivered.",
    });
  });

  it("never returns ok: true when dispatch reports zero sent for any reason", async () => {
    pushSubscriptionFindManyMock.mockResolvedValue([
      { timezone: "Europe/London", createdAt: new Date("2026-01-01") },
    ]);
    dispatchDigestMock.mockResolvedValue({ sent: 0, skipped: false });

    const result = await sendTestDigest(TRIP_ID);

    expect(result.ok).toBe(false);
  });

  it("returns ok: true with the sent count when dispatch actually delivers", async () => {
    pushSubscriptionFindManyMock.mockResolvedValue([
      { timezone: "Europe/London", createdAt: new Date("2026-01-01") },
    ]);
    dispatchDigestMock.mockResolvedValue({ sent: 3, skipped: false });

    const result = await sendTestDigest(TRIP_ID);

    expect(result).toEqual({ ok: true, sent: 3, placeholder: false });
  });
});

// ---------------------------------------------------------------------------
// listDigestSettingsForUser
// ---------------------------------------------------------------------------

describe("listDigestSettingsForUser", () => {
  it("lists every trip the traveller is on, defaulting a missing preference to on", async () => {
    tripFindManyMock.mockResolvedValue([
      { id: "trip-1", name: "Europe Christmas 2026", digestPreferences: [{ enabled: false }] },
      { id: "trip-2", name: "Japan 2027", digestPreferences: [] },
    ]);

    const result = await listDigestSettingsForUser();

    // A MISSING row means enabled — subscribing a Device is itself the opt-in,
    // so an absent preference must never read as a false "off".
    expect(result).toEqual([
      { tripId: "trip-1", tripName: "Europe Christmas 2026", enabled: false },
      { tripId: "trip-2", tripName: "Japan 2027", enabled: true },
    ]);
  });

  it("requires a signed-in user before querying anything", async () => {
    tripFindManyMock.mockResolvedValue([]);

    await listDigestSettingsForUser();

    expect(requireUserMock).toHaveBeenCalled();
  });

  // Strengthened beyond the brief: the brief's own test would still pass for
  // an implementation that fetched EVERY trip in the database (not just this
  // traveller's) or read someone else's DigestPreference row, since the db
  // call is mocked and returns whatever it's told regardless of the query
  // shape. "Every trip the traveller is on" is the guarantee the describe
  // block names — pin the query itself, not just its mocked output.
  it("scopes the query to this traveller's own membership and preference rows", async () => {
    tripFindManyMock.mockResolvedValue([]);

    await listDigestSettingsForUser();

    expect(tripFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { members: { some: { userId: USER_ID } } },
        select: expect.objectContaining({
          digestPreferences: expect.objectContaining({
            where: { userId: USER_ID },
          }),
        }),
      }),
    );
  });
});
