import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the Digest settings server actions (Task 7).
 *
 * Mocks: lib/db, lib/guards, lib/digest-dispatch, lib/push, lib/tz, next/cache
 */

const {
  requireTripAccessMock,
  revalidatePathMock,
  digestPreferenceFindUniqueMock,
  digestPreferenceUpsertMock,
  pushSubscriptionFindManyMock,
  dispatchDigestMock,
  isPushConfiguredMock,
  todayISOInZoneMock,
} = vi.hoisted(() => ({
  requireTripAccessMock: vi.fn().mockResolvedValue({
    user: { id: "user-1" },
    membership: { role: "owner" },
  }),
  revalidatePathMock: vi.fn(),
  digestPreferenceFindUniqueMock: vi.fn(),
  digestPreferenceUpsertMock: vi.fn(),
  pushSubscriptionFindManyMock: vi.fn(),
  dispatchDigestMock: vi.fn(),
  isPushConfiguredMock: vi.fn(),
  todayISOInZoneMock: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({
  requireTripAccess: requireTripAccessMock,
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
} from "@/server/actions/digest";

const TRIP_ID = "trip-1";
const USER_ID = "user-1";

afterEach(() => {
  vi.clearAllMocks();
  requireTripAccessMock.mockResolvedValue({
    user: { id: USER_ID },
    membership: { role: "owner" },
  });
  isPushConfiguredMock.mockReturnValue(true);
  todayISOInZoneMock.mockReturnValue("2026-09-17");
});

// ---------------------------------------------------------------------------
// Auth ordering — first statement in all three actions
// ---------------------------------------------------------------------------

describe("auth ordering", () => {
  it("getDigestSettings calls requireTripAccess first", async () => {
    digestPreferenceFindUniqueMock.mockResolvedValue(null);
    pushSubscriptionFindManyMock.mockResolvedValue([]);
    await getDigestSettings(TRIP_ID);
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("setDigestEnabled calls requireTripAccess first", async () => {
    digestPreferenceUpsertMock.mockResolvedValue({});
    await setDigestEnabled(TRIP_ID, true);
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("sendTestDigest calls requireTripAccess first", async () => {
    pushSubscriptionFindManyMock.mockResolvedValue([
      { timezone: "Europe/London", createdAt: new Date("2026-01-01") },
    ]);
    dispatchDigestMock.mockResolvedValue({ sent: 1, skipped: false });
    await sendTestDigest(TRIP_ID);
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
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
    pushSubscriptionFindManyMock.mockResolvedValue([]);

    const result = await getDigestSettings(TRIP_ID);

    expect(result.enabled).toBe(true);
    expect(digestPreferenceFindUniqueMock).toHaveBeenCalledWith({
      where: { userId_tripId: { userId: USER_ID, tripId: TRIP_ID } },
      select: { enabled: true },
    });
  });

  it("reports enabled: false when the preference row says so", async () => {
    digestPreferenceFindUniqueMock.mockResolvedValue({ enabled: false });
    pushSubscriptionFindManyMock.mockResolvedValue([]);

    const result = await getDigestSettings(TRIP_ID);

    expect(result.enabled).toBe(false);
  });

  it("reports device: null when the user has no subscriptions", async () => {
    digestPreferenceFindUniqueMock.mockResolvedValue(null);
    pushSubscriptionFindManyMock.mockResolvedValue([]);

    const result = await getDigestSettings(TRIP_ID);

    expect(result.device).toBeNull();
  });

  it("reports the most recently subscribed device's timezone and createdAt", async () => {
    digestPreferenceFindUniqueMock.mockResolvedValue(null);
    const newest = new Date("2026-09-01T00:00:00Z");
    const older = new Date("2026-01-01T00:00:00Z");
    // Simulate DB ordering by createdAt desc — newest first.
    pushSubscriptionFindManyMock.mockResolvedValue([
      { timezone: "Asia/Tokyo", createdAt: newest },
      { timezone: "Europe/London", createdAt: older },
    ]);

    const result = await getDigestSettings(TRIP_ID);

    expect(result.device).toEqual({ timezone: "Asia/Tokyo", subscribedAt: newest });
    expect(pushSubscriptionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID },
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("surfaces a null timezone honestly rather than inventing a default", async () => {
    digestPreferenceFindUniqueMock.mockResolvedValue(null);
    const createdAt = new Date("2026-09-01T00:00:00Z");
    pushSubscriptionFindManyMock.mockResolvedValue([
      { timezone: null, createdAt },
    ]);

    const result = await getDigestSettings(TRIP_ID);

    expect(result.device).toEqual({ timezone: null, subscribedAt: createdAt });
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

  it("forces the dispatch so a test never consumes the real slot", async () => {
    pushSubscriptionFindManyMock.mockResolvedValue([
      { timezone: "Europe/London", createdAt: new Date("2026-01-01") },
    ]);
    dispatchDigestMock.mockResolvedValue({ sent: 1, skipped: false, placeholder: true });

    await sendTestDigest(TRIP_ID);

    expect(dispatchDigestMock).toHaveBeenCalledWith(
      expect.objectContaining({ force: true, tripId: TRIP_ID }),
    );
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
