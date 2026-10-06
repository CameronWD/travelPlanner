import { afterEach, describe, expect, it, vi } from "vitest";
import { expectAccessCheckedBeforeWrite } from "@/test/helpers/access-order";

/**
 * Tests for the trips server actions.
 *
 * We mock:
 *   - lib/db → so we can assert Prisma call shapes without hitting the database
 *   - lib/guards → so requireUser/requireTripAccess return predictable values
 *   - next/navigation → so redirect() is interceptable (it throws in Next.js)
 *   - next/cache → so revalidatePath is a spy
 */

const {
  requireUserMock,
  requireTripAccessMock,
  redirectMock,
  revalidatePathMock,
  tripCreateMock,
  tripUpdateMock,
  tripDeleteMock,
  tripFindUniqueMock,
  memberCreateMock,
  memberDeleteManyMock,
  memberFindUniqueMock,
  tripMemberFindFirstMock,
  userFindUniqueMock,
  userFindManyMock,
  inviteDeleteManyMock,
  inviteCreateMock,
  chapterCreateMock,
  stopCreateMock,
  itemCreateMock,
  transportCreateMock,
  checklistItemCreateMock,
  dayTitleCreateMock,
  forkFindManyMock,
  recomputeChapterSpansMock,
  recordActivityMock,
  transactionMock,
  attachmentFindManyMock,
  storageDeleteMock,
  storageSaveMock,
  scheduleBlobDeletionMock,
  geocodePlaceDetailedMock,
  paceNominatimMock,
  assignTripSlugMock,
} = vi.hoisted(() => {
  const tripCreateMock = vi.fn();
  const tripUpdateMock = vi.fn();
  const tripDeleteMock = vi.fn();
  const tripFindUniqueMock = vi.fn();
  const memberCreateMock = vi.fn();
  const memberDeleteManyMock = vi.fn().mockResolvedValue({ count: 1 });
  // The REMOVAL TARGET's membership row (I1). Defaults to a non-owner, which
  // is what every pre-existing removeTripMember test means by "a Traveller".
  const memberFindUniqueMock = vi.fn().mockResolvedValue({ role: "member" });
  const tripMemberFindFirstMock = vi.fn();
  const userFindUniqueMock = vi.fn().mockResolvedValue(null);
  const userFindManyMock = vi.fn().mockResolvedValue([]);
  const inviteDeleteManyMock = vi.fn().mockResolvedValue({ count: 0 });
  const inviteCreateMock = vi.fn();
  const chapterCreateMock = vi.fn();
  const stopCreateMock = vi.fn();
  const itemCreateMock = vi.fn();
  const transportCreateMock = vi.fn();
  const checklistItemCreateMock = vi.fn();
  // Duplicate (ADR: "Dropped by Duplicate, which resets every date" —
  // CONTEXT.md "Day title") must never write DayTitle rows; this mock lets a
  // test assert that directly instead of only by omission.
  const dayTitleCreateMock = vi.fn();
  const forkFindManyMock = vi.fn().mockResolvedValue([]);
  const recomputeChapterSpansMock = vi.fn().mockResolvedValue(undefined);
  const recordActivityMock = vi.fn().mockResolvedValue(undefined);
  const attachmentFindManyMock = vi.fn().mockResolvedValue([]);
  const storageDeleteMock = vi.fn().mockResolvedValue(undefined);
  const storageSaveMock = vi.fn().mockResolvedValue(undefined);
  const scheduleBlobDeletionMock = vi.fn().mockResolvedValue(undefined);

  // $transaction executes the callback synchronously-ish in tests;
  // we simulate it by calling the callback with a fake tx object.
  const transactionMock = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      trip: { create: tripCreateMock, update: tripUpdateMock },
      tripMember: { create: memberCreateMock },
      chapter: { create: chapterCreateMock },
      stop: { create: stopCreateMock },
      item: { create: itemCreateMock },
      transport: { create: transportCreateMock },
      checklistItem: { create: checklistItemCreateMock },
      dayTitle: { create: dayTitleCreateMock },
      fork: { findMany: forkFindManyMock },
      invite: { create: inviteCreateMock },
    };
    return cb(tx);
  });

  return {
    requireUserMock: vi.fn(),
    requireTripAccessMock: vi.fn().mockResolvedValue({
      user: { id: "user-1", email: "you@example.com" },
      membership: { role: "owner" },
    }),
    redirectMock: vi.fn(() => {
      throw new Error("NEXT_REDIRECT");
    }),
    revalidatePathMock: vi.fn(),
    tripCreateMock,
    tripUpdateMock,
    tripDeleteMock,
    tripFindUniqueMock,
    memberCreateMock,
    memberDeleteManyMock,
    memberFindUniqueMock,
    tripMemberFindFirstMock,
    userFindUniqueMock,
    userFindManyMock,
    inviteDeleteManyMock,
    inviteCreateMock,
    chapterCreateMock,
    stopCreateMock,
    itemCreateMock,
    transportCreateMock,
    checklistItemCreateMock,
    dayTitleCreateMock,
    forkFindManyMock,
    recomputeChapterSpansMock,
    recordActivityMock,
    transactionMock,
    attachmentFindManyMock,
    storageDeleteMock,
    storageSaveMock,
    scheduleBlobDeletionMock,
    geocodePlaceDetailedMock: vi.fn(),
    paceNominatimMock: vi.fn(),
    assignTripSlugMock: vi.fn().mockResolvedValue("japan-2026"),
  };
});

vi.mock("@/lib/guards", async () => {
  // isTripOwnerOrAdmin (ARCH-BND-3) lives in lib/access.ts, which is
  // framework/db-free, so it can be imported for real here — unlike
  // lib/guards.ts itself, which also imports lib/auth (next-auth →
  // next/server), a module graph this test file never otherwise loads. Only
  // requireUser/requireTripAccess need session/db mocking.
  const { isTripOwnerOrAdmin } = await import("@/lib/access");
  return {
    requireUser: requireUserMock,
    requireTripAccess: requireTripAccessMock,
    isTripOwnerOrAdmin,
  };
});
vi.mock("@/lib/geocode", () => ({
  geocodePlaceDetailed: geocodePlaceDetailedMock,
  paceNominatim: paceNominatimMock,
}));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: transactionMock,
    trip: {
      create: tripCreateMock,
      update: tripUpdateMock,
      delete: tripDeleteMock,
      findUnique: tripFindUniqueMock,
    },
    attachment: {
      findMany: attachmentFindManyMock,
    },
    tripMember: {
      deleteMany: memberDeleteManyMock,
      findUnique: memberFindUniqueMock,
      findFirst: tripMemberFindFirstMock,
    },
    user: {
      findUnique: userFindUniqueMock,
      findMany: userFindManyMock,
    },
    invite: {
      deleteMany: inviteDeleteManyMock,
      create: inviteCreateMock,
    },
  },
}));
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({ delete: storageDeleteMock, save: storageSaveMock }),
  // Keep the real implementations of the pure helpers so cover logic can use them.
  generateKey: (scope: { trip: string } | { globe: string }, uniqueId: string, filename: string) => {
    const prefix = "trip" in scope ? `trips/${scope.trip}` : `globes/${scope.globe}`;
    return `${prefix}/${uniqueId}-${filename}`;
  },
  validateUpload: ({ mime, size }: { mime: string; size: number }) => {
    const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "text/plain"]);
    if (!ALLOWED.has(mime)) return { ok: false, error: `File type "${mime}" is not allowed.` };
    if (size > 10 * 1024 * 1024) return { ok: false, error: "File is too large." };
    return { ok: true };
  },
}));
vi.mock("@/lib/blob-retention", () => ({ scheduleBlobDeletion: scheduleBlobDeletionMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/server/actions/activity", () => ({ recordActivity: recordActivityMock }));
vi.mock("@/server/actions/stop-flow", () => ({ recomputeChapterSpans: recomputeChapterSpansMock }));
vi.mock("@/lib/trip-slug-store", () => ({ assignTripSlug: assignTripSlugMock }));
const { routeStopsFromShareMock } = vi.hoisted(() => ({ routeStopsFromShareMock: vi.fn() }));
vi.mock("@/server/actions/copy-route-from-share", () => ({ routeStopsFromShare: routeStopsFromShareMock }));

import {
  createTrip,
  updateTrip,
  deleteTrip,
  restoreTrip,
  setTripHardEndDate,
  duplicateTrip,
  setChaptersEnabled,
  setForksEnabled,
  removeTripMember,
  leaveTrip,
} from "./trips";

const VALID_INPUT = {
  name: "Japan 2026",
  startDate: "2026-03-01",
  endDate: "2026-03-14",
  homeCurrency: "AUD",
};

const TRIP_ID = "trip-abc";

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createTrip
// ---------------------------------------------------------------------------

describe("createTrip", () => {
  it("creates a Trip and an owner TripMember for the current user on valid input", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });

    const newTrip = { id: "trip-123", name: "Japan 2026" };
    tripCreateMock.mockResolvedValue(newTrip);
    memberCreateMock.mockResolvedValue({});

    const r = await createTrip(VALID_INPUT);
    expect(r.success).toBe(true);

    // Assert that Trip.create was called with the right payload.
    expect(tripCreateMock).toHaveBeenCalledOnce();
    expect(tripCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Japan 2026",
        startDate: "2026-03-01",
        endDate: "2026-03-14",
        homeCurrency: "AUD",
        createdById: "user-1",
      }),
    });

    // Assert that TripMember.create was called with role "owner" for the creator.
    expect(memberCreateMock).toHaveBeenCalledOnce();
    expect(memberCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: newTrip.id,
        userId: "user-1",
        role: "owner",
      }),
    });

    // The slug is assigned inside the same transaction, then href is built from it.
    expect(assignTripSlugMock).toHaveBeenCalledWith(expect.anything(), "trip-123", "Japan 2026");

    // No stops were created, so href is trip home regardless of the trip being past.
    expect(r).toEqual({ success: true, tripId: "trip-123", href: "/trips/japan-2026" });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("creates a date-less trip", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    tripCreateMock.mockResolvedValue({ id: "trip-dateless", name: "Europe someday" });
    memberCreateMock.mockResolvedValue({});

    const r = await createTrip({ name: "Europe someday", homeCurrency: "AUD" });
    expect(r.success).toBe(true);

    expect(tripCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Europe someday", startDate: null, endDate: null }),
    });
  });

  it("returns a validation error when name is empty", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });

    const result = await createTrip({ ...VALID_INPUT, name: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.name).toBeDefined();
      expect(result.errors.name!.length).toBeGreaterThan(0);
    }

    // No DB calls should have been made.
    expect(tripCreateMock).not.toHaveBeenCalled();
    expect(memberCreateMock).not.toHaveBeenCalled();
  });

  it("returns a validation error when endDate is before startDate", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });

    const result = await createTrip({
      ...VALID_INPUT,
      startDate: "2026-03-14",
      endDate: "2026-03-01",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.endDate).toBeDefined();
    }
    expect(tripCreateMock).not.toHaveBeenCalled();
  });

  it("returns a validation error for an unknown currency", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });

    const result = await createTrip({
      ...VALID_INPUT,
      homeCurrency: "ZZZ",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.homeCurrency).toBeDefined();
    }
    expect(tripCreateMock).not.toHaveBeenCalled();
  });

  it("creates the trip without cover when no coverFile is passed", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    const newTrip = { id: "trip-no-cover", name: "Japan 2026" };
    tripCreateMock.mockResolvedValue(newTrip);
    memberCreateMock.mockResolvedValue({});

    const r = await createTrip(VALID_INPUT);

    expect(tripCreateMock).toHaveBeenCalledOnce();
    // storage.save must NOT be called — no cover was provided
    expect(storageSaveMock).not.toHaveBeenCalled();
    // trip.update must NOT be called for coverImageKey
    expect(tripUpdateMock).not.toHaveBeenCalled();
    expect(r).toEqual({ success: true, tripId: "trip-no-cover", href: "/trips/japan-2026" });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("saves the cover and sets coverImageKey when a valid PNG is passed", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    const newTrip = { id: "trip-with-cover", name: "Japan 2026" };
    tripCreateMock.mockResolvedValue(newTrip);
    memberCreateMock.mockResolvedValue({});
    tripUpdateMock.mockResolvedValue({});

    const imageFile = new File([new Uint8Array([1, 2, 3])], "hero.png", { type: "image/png" });

    await createTrip(VALID_INPUT, imageFile);

    // storage.save should have been called once
    expect(storageSaveMock).toHaveBeenCalledOnce();
    // db.trip.update should have been called to set coverImageKey
    expect(tripUpdateMock).toHaveBeenCalledOnce();
    expect(tripUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: newTrip.id },
        data: expect.objectContaining({ coverImageKey: expect.stringMatching(/^trips\/trip-with-cover\//) }),
      }),
    );
  });

  it("still creates the trip but does NOT call storage.save when a non-image file is passed", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    const newTrip = { id: "trip-bad-cover", name: "Japan 2026" };
    tripCreateMock.mockResolvedValue(newTrip);
    memberCreateMock.mockResolvedValue({});

    const pdfFile = new File(["data"], "document.pdf", { type: "application/pdf" });

    const r = await createTrip(VALID_INPUT, pdfFile);

    // Trip was created
    expect(tripCreateMock).toHaveBeenCalledOnce();
    // But cover was rejected silently — save NOT called
    expect(storageSaveMock).not.toHaveBeenCalled();
    expect(tripUpdateMock).not.toHaveBeenCalled();
    expect(r).toEqual({ success: true, tripId: "trip-bad-cover", href: "/trips/japan-2026" });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("geocodes homeName at creation and stores coords in the trip row", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    geocodePlaceDetailedMock.mockResolvedValueOnce({
      name: "Sydney", lat: -33.86, lng: 151.2, city: "Sydney", country: "Australia", countryCode: "au",
    });
    const newTrip = { id: "trip-home", name: "Down Under" };
    tripCreateMock.mockResolvedValue(newTrip);
    memberCreateMock.mockResolvedValue({});

    await createTrip({ name: "Down Under", homeCurrency: "AUD", homeName: "Sydney" });

    expect(geocodePlaceDetailedMock).toHaveBeenCalledWith("Sydney");
    expect(tripCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        homeName: "Sydney",
        homeLat: -33.86,
        homeLng: 151.2,
        homeCountryCode: "au",
      }),
    });
  });

  it("creates the trip without home fields when homeName is omitted", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    tripCreateMock.mockResolvedValue({ id: "trip-no-home", name: "Wanderer" });
    memberCreateMock.mockResolvedValue({});

    await createTrip({ name: "Wanderer", homeCurrency: "AUD" });

    expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
    expect(tripCreateMock).toHaveBeenCalledWith({
      data: expect.not.objectContaining({ homeName: expect.anything() }),
    });
  });

  it("creates the trip with home fields omitted when geocode fails (best-effort)", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    geocodePlaceDetailedMock.mockResolvedValueOnce(null);
    tripCreateMock.mockResolvedValue({ id: "trip-geo-fail", name: "Wanderer" });
    memberCreateMock.mockResolvedValue({});

    await createTrip({ name: "Wanderer", homeCurrency: "AUD", homeName: "Nowheresville" });

    expect(geocodePlaceDetailedMock).toHaveBeenCalledWith("Nowheresville");
    // homeName is still stored even when geocode returns null; coords are null
    expect(tripCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        homeName: "Nowheresville",
        homeLat: null,
        homeLng: null,
        homeCountryCode: null,
      }),
    });
  });

  it("honours roundTrip when provided at creation", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    tripCreateMock.mockResolvedValue({ id: "trip-rt", name: "One-way" });
    memberCreateMock.mockResolvedValue({});

    await createTrip({ name: "One-way", homeCurrency: "AUD", roundTrip: false });

    expect(tripCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ roundTrip: false }),
    });
  });

  it("stores a rough month on a date-less trip", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });
    tripCreateMock.mockResolvedValue({ id: "trip-r" });
    await createTrip({ name: "Japan", homeCurrency: "AUD", roughMonth: "2027-04" });
    expect(tripCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ roughMonth: "2027-04", startDate: null }) });
  });

  it("drops a rough month when a start date is given (CONTEXT.md Rough month)", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });
    tripCreateMock.mockResolvedValue({ id: "trip-r" });
    await createTrip({ ...VALID_INPUT, roughMonth: "2027-04" });
    expect(tripCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ roughMonth: null, startDate: "2026-03-01" }) });
  });

  it("uses picked home coordinates without geocoding", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });
    tripCreateMock.mockResolvedValue({ id: "trip-h" });
    await createTrip({ name: "Japan", homeCurrency: "AUD", homeName: "Sydney", homeLat: -33.87, homeLng: 151.21, homeCountryCode: "au" });
    expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
    expect(tripCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ homeName: "Sydney", homeLat: -33.87, homeLng: 151.21, homeCountryCode: "au" }) });
  });

  it("creates rough stops in order and sends the traveller to the Globe", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });
    tripCreateMock.mockResolvedValue({ id: "trip-p" });
    geocodePlaceDetailedMock.mockResolvedValue({ name: "Nara, Japan", lat: 34.68, lng: 135.8, city: "Nara", country: "Japan", countryCode: "jp" });
    const r = await createTrip({
      name: "Kansai", homeCurrency: "AUD", startDate: "2026-04-01", endDate: "2026-04-07",
      stops: [{ name: "Kyoto", lat: 35.01, lng: 135.77, countryCode: "jp" }, { name: "Nara" }],
    });
    expect(geocodePlaceDetailedMock).toHaveBeenCalledTimes(1);
    expect(geocodePlaceDetailedMock).toHaveBeenCalledWith("Nara");
    expect(stopCreateMock).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({ tripId: "trip-p", name: "Kyoto", sortOrder: 0, nights: 3, arriveDate: null, forkId: null }) });
    expect(stopCreateMock).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({ tripId: "trip-p", name: "Nara", sortOrder: 1, lat: 34.68, lng: 135.8, countryCode: "jp" }) });
    expect(r).toEqual({ success: true, tripId: "trip-p", href: "/globe?added=trip-p" });
  });

  it("a stop whose geocode fails is still created with null coords", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });
    tripCreateMock.mockResolvedValue({ id: "trip-q" });
    geocodePlaceDetailedMock.mockResolvedValue(null);
    const r = await createTrip({ name: "Somewhere", homeCurrency: "AUD", startDate: "2026-04-01", endDate: "2026-04-03", stops: [{ name: "Nowhereville" }] });
    expect(stopCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ name: "Nowhereville", lat: null, lng: null, countryCode: null }) });
    expect(r.success && r.href).toBe("/globe?added=trip-q");
  });

  it("paces each rough-Stop geocode and skips located Stops (ADR 0069)", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });
    tripCreateMock.mockResolvedValue({ id: "trip-pace" });
    geocodePlaceDetailedMock.mockResolvedValue(null);
    await createTrip({
      name: "Kansai", homeCurrency: "AUD", startDate: "2026-04-01", endDate: "2026-04-07",
      stops: [{ name: "Kyoto", lat: 35.01, lng: 135.77, countryCode: "jp" }, { name: "Nara" }, { name: "Osaka" }],
    });
    expect(geocodePlaceDetailedMock).toHaveBeenCalledTimes(2);
    expect(paceNominatimMock).toHaveBeenCalledTimes(2);
  });

  it("an undated trip with rough stops returns trip home", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1" });
    tripCreateMock.mockResolvedValue({ id: "trip-u" });
    geocodePlaceDetailedMock.mockResolvedValue({ name: "Nara, Japan", lat: 34.68, lng: 135.8, city: "Nara", country: "Japan", countryCode: "jp" });
    const r = await createTrip({ name: "Someday", homeCurrency: "AUD", stops: [{ name: "Nara" }] });
    expect(stopCreateMock).toHaveBeenCalledOnce();
    expect(r).toEqual({ success: true, tripId: "trip-u", href: "/trips/japan-2026" });
  });

  it("copies a Share link's route server-side, ignoring any client-sent stops (spec §E.3)", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    tripCreateMock.mockResolvedValue({ id: "trip-9", name: "Christmas in Europe (my version)" });
    memberCreateMock.mockResolvedValue({});
    routeStopsFromShareMock.mockResolvedValue({
      linkId: "link-1",
      tripName: "Christmas in Europe",
      stops: [{ name: "London", country: "England", lat: 51.5, lng: -0.1, nights: 5 }],
    });

    const r = await createTrip({
      name: "Christmas in Europe (my version)",
      homeCurrency: "AUD",
      fromShareToken: "tok",
      stops: [{ name: "Injected", nights: 99 }],
    });

    expect(routeStopsFromShareMock).toHaveBeenCalledWith("tok");
    expect(tripCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sourceShareLinkId: "link-1" }) }),
    );
    expect(stopCreateMock).toHaveBeenCalledOnce();
    expect(stopCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: "trip-9", name: "London", country: "England", countryCode: null,
        lat: 51.5, lng: -0.1, nights: 5, arriveDate: null, departDate: null,
      }),
    });
    expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
    expect(r).toEqual({ success: true, tripId: "trip-9", href: "/trips/japan-2026/plan" });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("caps a copied route at the New trip stop limit (30)", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    tripCreateMock.mockResolvedValue({ id: "trip-9", name: "Long (my version)" });
    memberCreateMock.mockResolvedValue({});
    routeStopsFromShareMock.mockResolvedValue({
      linkId: "link-1",
      tripName: "Long",
      stops: Array.from({ length: 35 }, (_, i) => ({ name: `Stop ${i}`, country: "Italy", lat: 41, lng: 12, nights: 1 })),
    });
    await createTrip({ name: "Long (my version)", homeCurrency: "AUD", fromShareToken: "tok" });
    expect(stopCreateMock).toHaveBeenCalledTimes(30);
    expect(stopCreateMock).toHaveBeenLastCalledWith({ data: expect.objectContaining({ name: "Stop 29" }) });
  });

  it("geocodes a copied stop without coordinates by name and country", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    tripCreateMock.mockResolvedValue({ id: "trip-9", name: "Paris (my version)" });
    memberCreateMock.mockResolvedValue({});
    geocodePlaceDetailedMock.mockResolvedValue({ name: "Paris, France", lat: 48.85, lng: 2.35, city: "Paris", country: "France", countryCode: "fr" });
    routeStopsFromShareMock.mockResolvedValue({
      linkId: "link-1",
      tripName: "Paris",
      stops: [{ name: "Paris", country: "France", lat: null, lng: null, nights: 3 }],
    });
    await createTrip({ name: "Paris (my version)", homeCurrency: "AUD", fromShareToken: "tok" });
    expect(geocodePlaceDetailedMock).toHaveBeenCalledWith("Paris, France");
    expect(stopCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ lat: 48.85, lng: 2.35, countryCode: "fr" }) });
  });

  it("refuses a revoked token without creating a trip", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    routeStopsFromShareMock.mockResolvedValue(null);
    const result = await createTrip({ name: "X (my version)", homeCurrency: "AUD", fromShareToken: "gone" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.form?.[0]).toMatch(/isn't available any more/);
    expect(tripCreateMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("leaves sourceShareLinkId unset without a token", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    tripCreateMock.mockResolvedValue({ id: "trip-123", name: "Japan 2026" });
    memberCreateMock.mockResolvedValue({});
    const r = await createTrip(VALID_INPUT);
    expect(r).toEqual({ success: true, tripId: "trip-123", href: "/trips/japan-2026" });
    expect(routeStopsFromShareMock).not.toHaveBeenCalled();
    expect(tripCreateMock.mock.calls[0][0].data.sourceShareLinkId ?? null).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateTrip
// ---------------------------------------------------------------------------

describe("updateTrip", () => {
  it("is access-checked — calls requireTripAccess with the tripId", async () => {
    tripUpdateMock.mockResolvedValue({});

    await updateTrip(TRIP_ID, VALID_INPUT);

    expect(requireTripAccessMock).toHaveBeenCalledOnce();
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, tripUpdateMock);
  });

  it("updates the trip and returns success on valid input", async () => {
    tripUpdateMock.mockResolvedValue({});

    const result = await updateTrip(TRIP_ID, VALID_INPUT);

    expect(result.success).toBe(true);
    expect(tripUpdateMock).toHaveBeenCalledOnce();
    expect(tripUpdateMock).toHaveBeenCalledWith({
      where: { id: TRIP_ID },
      data: expect.objectContaining({
        name: "Japan 2026",
        startDate: "2026-03-01",
        endDate: "2026-03-14",
        homeCurrency: "AUD",
      }),
    });
  });

  it("revalidates trip pages after updating", async () => {
    tripUpdateMock.mockResolvedValue({});

    await updateTrip(TRIP_ID, VALID_INPUT);

    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/settings`);
  });

  it("setting a start date clears the rough month (CONTEXT.md Rough month)", async () => {
    tripUpdateMock.mockResolvedValue({});
    await updateTrip(TRIP_ID, VALID_INPUT);
    expect(tripUpdateMock).toHaveBeenCalledWith({ where: { id: TRIP_ID }, data: expect.objectContaining({ roughMonth: null }) });
  });

  it("saving without a start date leaves the rough month alone", async () => {
    tripUpdateMock.mockResolvedValue({});
    await updateTrip(TRIP_ID, { name: "Japan", homeCurrency: "AUD" });
    expect(tripUpdateMock.mock.calls[0][0].data).not.toHaveProperty("roughMonth");
  });

  it("returns validation error on empty name", async () => {
    const result = await updateTrip(TRIP_ID, { ...VALID_INPUT, name: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.name).toBeDefined();
    }
    expect(tripUpdateMock).not.toHaveBeenCalled();
  });

  it("returns validation error when endDate is before startDate", async () => {
    const result = await updateTrip(TRIP_ID, {
      ...VALID_INPUT,
      startDate: "2026-03-14",
      endDate: "2026-03-01",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.endDate).toBeDefined();
    }
    expect(tripUpdateMock).not.toHaveBeenCalled();
  });

  it("returns validation error for unknown currency", async () => {
    const result = await updateTrip(TRIP_ID, {
      ...VALID_INPUT,
      homeCurrency: "ZZZ",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.homeCurrency).toBeDefined();
    }
    expect(tripUpdateMock).not.toHaveBeenCalled();
  });

  it("geocodes homeName and stores coords on update", async () => {
    geocodePlaceDetailedMock.mockResolvedValueOnce({
      name: "Sydney", lat: -33.86, lng: 151.2, city: "Sydney", country: "Australia", countryCode: "au",
    });
    tripFindUniqueMock.mockResolvedValueOnce({ homeName: null });
    tripUpdateMock.mockResolvedValue({ id: "t1" });

    const result = await updateTrip("t1", {
      name: "Europe 2026", homeCurrency: "AUD", homeName: "Sydney", roundTrip: false,
    });

    expect(result.success).toBe(true);
    expect(geocodePlaceDetailedMock).toHaveBeenCalledWith("Sydney");
    expect(tripUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        homeName: "Sydney", homeLat: -33.86, homeLng: 151.2, homeCountryCode: "au", roundTrip: false,
      }),
    }));
  });

  it("clears home coords when homeName is emptied", async () => {
    tripFindUniqueMock.mockResolvedValueOnce({ homeName: "Sydney" });
    tripUpdateMock.mockResolvedValue({ id: "t1" });

    await updateTrip("t1", { name: "T", homeCurrency: "AUD", homeName: "" });

    expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
    expect(tripUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ homeName: null, homeLat: null, homeLng: null, homeCountryCode: null }),
    }));
  });

  it("name unchanged → coords untouched (not geocoded, coord fields omitted)", async () => {
    tripFindUniqueMock.mockResolvedValueOnce({ homeName: "Sydney" });
    tripUpdateMock.mockResolvedValue({ id: "t1" });

    await updateTrip("t1", { name: "T", homeCurrency: "AUD", homeName: "Sydney" });

    expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
    // coord fields must NOT be present in the update data
    expect(tripUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ homeLat: expect.anything() }),
    }));
    expect(tripUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ homeLng: expect.anything() }),
    }));
    expect(tripUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ homeCountryCode: expect.anything() }),
    }));
  });

  it("homeName key absent (undefined) → home base left unchanged (no geocode, homeName + coords omitted from update)", async () => {
    // tripFindUnique must NOT be called either — we skip the lookup entirely.
    tripUpdateMock.mockResolvedValue({ id: "t1" });

    // Do NOT include the homeName key in the input object at all.
    const inputWithoutHomeName: Parameters<typeof updateTrip>[1] = {
      name: "T",
      homeCurrency: "AUD",
      // homeName intentionally absent
    };

    const result = await updateTrip("t1", inputWithoutHomeName);

    expect(result.success).toBe(true);
    expect(geocodePlaceDetailedMock).not.toHaveBeenCalled();
    // No DB lookup for current homeName when key is absent
    expect(tripFindUniqueMock).not.toHaveBeenCalled();
    // homeName + coord fields must NOT appear in the update payload
    expect(tripUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ homeName: expect.anything() }),
    }));
    expect(tripUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ homeLat: expect.anything() }),
    }));
    expect(tripUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ homeLng: expect.anything() }),
    }));
    expect(tripUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ homeCountryCode: expect.anything() }),
    }));
  });

  it("re-derives the slug from the saved name on every save and returns it (a rename moves it; an unchanged name keeps it)", async () => {
    tripUpdateMock.mockResolvedValue({});
    assignTripSlugMock.mockResolvedValueOnce("new-name");
    const res = await updateTrip(TRIP_ID, { ...VALID_INPUT, name: "New name" });
    expect(assignTripSlugMock).toHaveBeenCalledWith(expect.anything(), TRIP_ID, "New name");
    expect(res).toEqual({ success: true, slug: "new-name" });
  });

  it("assigns the slug after the name is written", async () => {
    tripUpdateMock.mockResolvedValue({});
    await updateTrip(TRIP_ID, VALID_INPUT);
    expect(tripUpdateMock.mock.invocationCallOrder[0]).toBeLessThan(assignTripSlugMock.mock.invocationCallOrder[0]);
  });
});

// ---------------------------------------------------------------------------
// deleteTrip
// ---------------------------------------------------------------------------

describe("deleteTrip", () => {
  it("is access-checked — calls requireTripAccess with the tripId", async () => {
    // owner role — will succeed
    tripUpdateMock.mockResolvedValue({});

    await expect(deleteTrip(TRIP_ID)).rejects.toThrow("NEXT_REDIRECT");

    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, tripUpdateMock);
  });

  it("deleteTrip stamps deletedAt instead of deleting, and schedules no blobs", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "user-1" },
      membership: { role: "owner" },
    });
    tripUpdateMock.mockResolvedValue({});

    await deleteTrip(TRIP_ID).catch(() => {}); // redirect throws

    expect(tripUpdateMock).toHaveBeenCalledWith({ where: { id: TRIP_ID }, data: { deletedAt: expect.any(Date) } });
    expect(tripDeleteMock).not.toHaveBeenCalled();
    expect(scheduleBlobDeletionMock).not.toHaveBeenCalled();
  });

  it("redirects to /trips when caller is owner", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "user-1" },
      membership: { role: "owner" },
    });
    tripUpdateMock.mockResolvedValue({});

    await expect(deleteTrip(TRIP_ID)).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/trips");
  });

  it("returns a forbidden error and does NOT soft-delete when caller is a member (not owner)", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "user-2" },
      membership: { role: "member" },
    });

    const result = await deleteTrip(TRIP_ID);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/owner/i);
    }
    expect(tripUpdateMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("deleteTrip — admin override", () => {
  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  it("lets a non-owner member delete when their email is in ADMIN_EMAILS", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u1", email: "admin@example.com" },
      membership: { userId: "u1", role: "member" },
    });
    tripUpdateMock.mockResolvedValue({});

    await expect(deleteTrip(TRIP_ID)).rejects.toThrow("NEXT_REDIRECT");
    expect(tripUpdateMock).toHaveBeenCalledWith({ where: { id: TRIP_ID }, data: { deletedAt: expect.any(Date) } });
  });

  it("still refuses a non-owner member who is not an admin", async () => {
    delete process.env.ADMIN_EMAILS;
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u2", email: "someone@example.com" },
      membership: { userId: "u2", role: "member" },
    });

    const result = await deleteTrip(TRIP_ID);
    expect(result).toEqual({
      success: false,
      error: "Only the trip owner can delete the trip.",
    });
    expect(tripUpdateMock).not.toHaveBeenCalled();
  });

  it("still requires membership — an admin gets no bypass of requireTripAccess", async () => {
    // requireTripAccess notFound()s for non-members; deleteTrip must not
    // catch or route around that, so the rejection propagates.
    process.env.ADMIN_EMAILS = "admin@example.com";
    requireTripAccessMock.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));

    await expect(deleteTrip("trip_someone_elses")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(tripUpdateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// restoreTrip
// ---------------------------------------------------------------------------

describe("restoreTrip", () => {
  it("refuses a non-owner member", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    tripMemberFindFirstMock.mockResolvedValue({ role: "member" });

    expect(await restoreTrip("t1")).toEqual({ success: false, error: "Only the trip owner can restore the trip." });
    expect(tripUpdateMock).not.toHaveBeenCalled();
  });

  it("refuses a caller with no membership at all", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    tripMemberFindFirstMock.mockResolvedValue(null);

    expect(await restoreTrip("t1")).toEqual({ success: false, error: "Only the trip owner can restore the trip." });
    expect(tripUpdateMock).not.toHaveBeenCalled();
  });

  it("clears deletedAt for the owner and returns the slug", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    tripMemberFindFirstMock.mockResolvedValue({ role: "owner" });
    tripUpdateMock.mockResolvedValue({ slug: "eu-trip" });

    expect(await restoreTrip("t1")).toEqual({ success: true, slug: "eu-trip" });
    expect(tripUpdateMock).toHaveBeenCalledWith({ where: { id: "t1" }, data: { deletedAt: null }, select: { slug: true } });
  });

  it("does not use requireTripAccess (which hides deleted Trips)", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    tripMemberFindFirstMock.mockResolvedValue({ role: "owner" });
    tripUpdateMock.mockResolvedValue({ slug: "eu-trip" });

    await restoreTrip("t1");

    expect(requireTripAccessMock).not.toHaveBeenCalled();
  });

  it("queries tripMember with the caller's userId and the given tripId", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    tripMemberFindFirstMock.mockResolvedValue({ role: "owner" });
    tripUpdateMock.mockResolvedValue({ slug: "eu-trip" });

    await restoreTrip("t1");

    expect(tripMemberFindFirstMock).toHaveBeenCalledWith({
      where: { tripId: "t1", userId: "user-1" },
      select: { role: true },
    });
  });

  it("revalidates /trips on success", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    tripMemberFindFirstMock.mockResolvedValue({ role: "owner" });
    tripUpdateMock.mockResolvedValue({ slug: "eu-trip" });

    await restoreTrip("t1");

    expect(revalidatePathMock).toHaveBeenCalledWith("/trips");
  });

  it("an admin (ADMIN_EMAILS) may restore without being the owner", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    requireUserMock.mockResolvedValue({ id: "user-1", email: "admin@example.com" });
    tripMemberFindFirstMock.mockResolvedValue({ role: "member" });
    tripUpdateMock.mockResolvedValue({ slug: "eu-trip" });

    expect(await restoreTrip("t1")).toEqual({ success: true, slug: "eu-trip" });

    delete process.env.ADMIN_EMAILS;
  });
});

// ---------------------------------------------------------------------------
// setTripHardEndDate
// ---------------------------------------------------------------------------

describe("setTripHardEndDate", () => {
  it("sets the hard end date and revalidates the plan + settings", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01" });
    tripUpdateMock.mockResolvedValue({});
    const r = await setTripHardEndDate(TRIP_ID, "2026-07-20");
    expect(r.success).toBe(true);
    expect(tripUpdateMock).toHaveBeenCalledWith({ where: { id: TRIP_ID }, data: { hardEndDate: "2026-07-20" } });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/plan`);
  });

  it("clears the hard end date when given an empty value", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01" });
    tripUpdateMock.mockResolvedValue({});
    const r = await setTripHardEndDate(TRIP_ID, "");
    expect(r.success).toBe(true);
    expect(tripUpdateMock).toHaveBeenCalledWith({ where: { id: TRIP_ID }, data: { hardEndDate: null } });
  });

  it("rejects a hard end date before the start date", async () => {
    tripFindUniqueMock.mockResolvedValue({ startDate: "2026-07-01" });
    const r = await setTripHardEndDate(TRIP_ID, "2026-06-30");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/on or after the start date/i);
    expect(tripUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed date", async () => {
    const r = await setTripHardEndDate(TRIP_ID, "not-a-date");
    expect(r.success).toBe(false);
    expect(tripUpdateMock).not.toHaveBeenCalled();
  });

  it("returns a clean error when the trip no longer exists", async () => {
    tripFindUniqueMock.mockResolvedValue(null);
    const r = await setTripHardEndDate(TRIP_ID, "2026-07-20");
    expect(r.success).toBe(false);
    expect(tripUpdateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// duplicateTrip
// ---------------------------------------------------------------------------

describe("duplicateTrip", () => {
  it("creates a new trip + owner membership + invites co-travellers, and remaps children", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "user-1", email: "you@example.com" },
      membership: { userId: "user-1", role: "owner" },
    });
    userFindManyMock.mockResolvedValueOnce([{ id: "user-2", email: "co@example.com" }]);
    tripFindUniqueMock.mockResolvedValue({
      id: "src", name: "Europe 2026", homeCurrency: "AUD", drivingWindingFactor: 1.5, drivingAvgSpeedKph: 80,
      members: [{ userId: "user-1", role: "owner" }, { userId: "user-2", role: "member" }],
      chapters: [{ id: "ch1", name: "Italy", colour: "rose", startDate: "2026-08-01", endDate: "2026-08-10", sortOrder: 0 }],
      stops: [
        { id: "s1", name: "Rome", country: "Italy", lat: 41.9, lng: 12.5, timezone: "Europe/Rome",
          arriveDate: "2026-08-01", departDate: "2026-08-04", nights: null, pinned: true,
          sortOrder: 0, chapterId: "ch1", chapterSortOrder: 0, notes: null },
        { id: "s2", name: "Florence", country: "Italy", lat: 43.8, lng: 11.2, timezone: "Europe/Rome",
          arriveDate: "2026-08-04", departDate: "2026-08-07", nights: null, pinned: false,
          sortOrder: 1, chapterId: "ch1", chapterSortOrder: 1, notes: null },
      ],
      items: [{ stopId: "s1", title: "Colosseum", category: "SIGHTSEEING", date: "2026-08-02", startTime: "09:00",
                endTime: null, lat: null, lng: null, countryCode: "it", address: null, link: null, booking: "B", notes: null }],
      transports: [{ fromStopId: "s1", toStopId: "s2", mode: "TRAIN", depPlace: "A", arrPlace: "B",
                     depAt: new Date("2026-08-04T08:00:00Z"), arrAt: new Date("2026-08-04T10:00:00Z"),
                     reference: "R1", notes: "n", depLat: 1, depLng: 2, arrLat: 3, arrLng: 4 }],
      checklistItems: [{ kind: "PRETRIP", text: "Passport", dueDate: "2026-07-01" }],
    });
    tripCreateMock.mockResolvedValue({ id: "new" });
    chapterCreateMock.mockResolvedValue({ id: "new-ch1" });
    stopCreateMock
      .mockResolvedValueOnce({ id: "new-s1" })
      .mockResolvedValueOnce({ id: "new-s2" });
    itemCreateMock.mockResolvedValue({ id: "new-i1" });
    transportCreateMock.mockResolvedValue({ id: "new-t1" });
    checklistItemCreateMock.mockResolvedValue({ id: "new-cl1" });

    assignTripSlugMock.mockResolvedValueOnce("copy-of-europe-2026");
    const result = await duplicateTrip("src", "Copy of Europe 2026");

    expect(result).toEqual({ success: true, tripId: "new", slug: "copy-of-europe-2026" });
    // A fresh slug from the copy's own name (ADR 0018 + 0064).
    expect(assignTripSlugMock).toHaveBeenCalledWith(expect.anything(), "new", "Copy of Europe 2026");
    expect(tripCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: "Copy of Europe 2026", homeCurrency: "AUD", createdById: "user-1" }),
    }));
    // Only the duplicator becomes a member of the copy — no co-traveller membership.
    expect(memberCreateMock).toHaveBeenCalledTimes(1);
    expect(memberCreateMock).toHaveBeenCalledWith({ data: { tripId: "new", userId: "user-1", role: "owner" } });
    // The co-traveller gets a pending Invite instead (ARCH-ADR-1).
    expect(userFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["user-2"] } } }),
    );
    expect(inviteCreateMock).toHaveBeenCalledTimes(1);
    expect(inviteCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: "new",
        email: "co@example.com",
        role: "member",
        token: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    });
    // stops created rough (dates null), remapped to new chapter
    expect(stopCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ tripId: "new", name: "Rome", arriveDate: null, departDate: null, chapterId: "new-ch1" }) });
    expect(stopCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ tripId: "new", name: "Florence", arriveDate: null, departDate: null, chapterId: "new-ch1" }) });
    // item created unscheduled under the remapped stop, countryCode carried through
    expect(itemCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ tripId: "new", stopId: "new-s1", date: null, booking: null, countryCode: "it" }) });
    // transport remapped to new stop ids, dates cleared, anchored after its
    // from-Stop on the copy (spec 2026-10-04 §D)
    expect(transportCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ tripId: "new", fromStopId: "new-s1", toStopId: "new-s2", anchorStopId: "new-s1", depAt: null, arrAt: null, reference: null }) });
    // checklist item copied with dates cleared and done reset
    expect(checklistItemCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ tripId: "new", text: "Passport", done: false, dueDate: null, assignedToId: null }) });
    // Duplicate resets every date (CONTEXT.md "Day title" — "Dropped by
    // Duplicate") — DayTitle rows are never copied onto the new trip's stops.
    expect(dayTitleCreateMock).not.toHaveBeenCalled();
  });

  it("IMPORTANT fix (round 1): normalises a mixed-case source member email before writing the Invite", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "user-1", email: "you@example.com" },
      membership: { userId: "user-1", role: "owner" },
    });
    // User.email is never normalised anywhere — simulate a co-traveller
    // whose account happens to have mixed casing.
    userFindManyMock.mockResolvedValueOnce([{ id: "user-2", email: "Co@Example.com" }]);
    tripFindUniqueMock.mockResolvedValue({
      id: "src", name: "Europe 2026", homeCurrency: "AUD", drivingWindingFactor: 1.5, drivingAvgSpeedKph: 80,
      members: [{ userId: "user-1", role: "owner" }, { userId: "user-2", role: "member" }],
      chapters: [], stops: [], items: [], transports: [], checklistItems: [],
    });
    tripCreateMock.mockResolvedValue({ id: "new" });

    const result = await duplicateTrip("src", "Copy of Europe 2026");

    expect(result).toEqual({ success: true, tripId: "new", slug: "japan-2026" });
    expect(inviteCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: "co@example.com" }),
    });
  });

  it("ARCH-ADR-1: a source member whose email can't be resolved is skipped — no Invite and no membership", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "user-1", email: "you@example.com" },
      membership: { userId: "user-1", role: "owner" },
    });
    // db.user.findMany resolves nothing for user-2 — e.g. a deleted account.
    userFindManyMock.mockResolvedValueOnce([]);
    tripFindUniqueMock.mockResolvedValue({
      id: "src", name: "Europe 2026", homeCurrency: "AUD", drivingWindingFactor: 1.5, drivingAvgSpeedKph: 80,
      members: [{ userId: "user-1", role: "owner" }, { userId: "user-2", role: "member" }],
      chapters: [], stops: [], items: [], transports: [], checklistItems: [],
    });
    tripCreateMock.mockResolvedValue({ id: "new" });

    const result = await duplicateTrip("src", "Copy of Europe 2026");

    expect(result).toEqual({ success: true, tripId: "new", slug: "japan-2026" });
    expect(memberCreateMock).toHaveBeenCalledTimes(1);
    expect(memberCreateMock).toHaveBeenCalledWith({ data: { tripId: "new", userId: "user-1", role: "owner" } });
    expect(inviteCreateMock).not.toHaveBeenCalled();
  });

  it("refuses a non-owner member — a Traveller cannot mint themselves a copy", async () => {
    // HG-12. requireTripAccess proves MEMBERSHIP, not role: before the guard
    // existed, this member sailed straight through to db.trip.findUnique and
    // came out the other side owning a full copy of someone else's trip.
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "user-2", email: "traveller@example.com" },
      membership: { userId: "user-2", role: "member" },
    });

    const result = await duplicateTrip("src", "Stolen copy");

    expect(result).toEqual({
      success: false,
      error: "Only the trip owner can duplicate the trip.",
    });
    // Nothing was even read, let alone written.
    expect(tripFindUniqueMock).not.toHaveBeenCalled();
    expect(tripCreateMock).not.toHaveBeenCalled();
    expect(memberCreateMock).not.toHaveBeenCalled();
  });

  it("denies when the caller lacks access", async () => {
    requireTripAccessMock.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));
    await expect(duplicateTrip("src", "x")).rejects.toThrow();
  });
});

describe("duplicateTrip — admin override", () => {
  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  it("lets a non-owner member duplicate when their email is in ADMIN_EMAILS (ADR 0045)", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u-admin", email: "admin@example.com" },
      membership: { userId: "u-admin", role: "member" },
    });
    tripFindUniqueMock.mockResolvedValue({
      id: "src", name: "Europe 2026", homeCurrency: "AUD",
      drivingWindingFactor: 1.5, drivingAvgSpeedKph: 80,
      members: [{ userId: "user-1", role: "owner" }],
      chapters: [], stops: [], items: [], transports: [], checklistItems: [],
    });
    tripCreateMock.mockResolvedValue({ id: "new" });

    const result = await duplicateTrip("src", "Admin copy");

    expect(result).toEqual({ success: true, tripId: "new", slug: "japan-2026" });
  });

  it("still requires membership — an admin gets no bypass of requireTripAccess", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    requireTripAccessMock.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));

    await expect(duplicateTrip("someone_elses", "x")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(tripCreateMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// setChaptersEnabled
// ---------------------------------------------------------------------------

describe("setChaptersEnabled", () => {
  it("is access-checked — calls requireTripAccess with the tripId", async () => {
    tripUpdateMock.mockResolvedValue({});

    await setChaptersEnabled(TRIP_ID, true);

    expect(requireTripAccessMock).toHaveBeenCalledOnce();
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, tripUpdateMock);
  });

  it("enabling: updates the trip AND recomputes chapter spans for the real plan and every fork", async () => {
    tripUpdateMock.mockResolvedValue({});
    forkFindManyMock.mockResolvedValueOnce([{ id: "fork-1" }, { id: "fork-2" }]);

    const result = await setChaptersEnabled(TRIP_ID, true);

    expect(result.success).toBe(true);
    expect(tripUpdateMock).toHaveBeenCalledWith({
      where: { id: TRIP_ID },
      data: { chaptersEnabled: true },
    });

    // Real plan (forkId null) + every fork got recomputed.
    expect(recomputeChapterSpansMock).toHaveBeenCalledWith(expect.anything(), TRIP_ID, null);
    expect(recomputeChapterSpansMock).toHaveBeenCalledWith(expect.anything(), TRIP_ID, "fork-1");
    expect(recomputeChapterSpansMock).toHaveBeenCalledWith(expect.anything(), TRIP_ID, "fork-2");
    expect(recomputeChapterSpansMock).toHaveBeenCalledTimes(3);

    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: TRIP_ID,
        changes: { summary: "Turned chapters on" },
      }),
    );

    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/plan`);
  });

  it("enabling with no forks: recomputes only the real plan", async () => {
    tripUpdateMock.mockResolvedValue({});
    forkFindManyMock.mockResolvedValueOnce([]);

    await setChaptersEnabled(TRIP_ID, true);

    expect(recomputeChapterSpansMock).toHaveBeenCalledTimes(1);
    expect(recomputeChapterSpansMock).toHaveBeenCalledWith(expect.anything(), TRIP_ID, null);
  });

  it("disabling: only updates the trip — no span recompute", async () => {
    tripUpdateMock.mockResolvedValue({});

    const result = await setChaptersEnabled(TRIP_ID, false);

    expect(result.success).toBe(true);
    expect(tripUpdateMock).toHaveBeenCalledWith({
      where: { id: TRIP_ID },
      data: { chaptersEnabled: false },
    });
    expect(recomputeChapterSpansMock).not.toHaveBeenCalled();
    expect(forkFindManyMock).not.toHaveBeenCalled();

    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: TRIP_ID,
        changes: { summary: "Turned chapters off" },
      }),
    );

    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/plan`);
  });
});

// ---------------------------------------------------------------------------
// setForksEnabled
// ---------------------------------------------------------------------------

describe("setForksEnabled", () => {
  it("is access-checked — calls requireTripAccess with the tripId", async () => {
    tripUpdateMock.mockResolvedValue({});

    await setForksEnabled(TRIP_ID, true);

    expect(requireTripAccessMock).toHaveBeenCalledOnce();
    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
    expectAccessCheckedBeforeWrite(requireTripAccessMock, tripUpdateMock);
  });

  it("enabling: flips the flag, logs 'Turned plan variants on', revalidates the trip", async () => {
    tripUpdateMock.mockResolvedValue({});

    const result = await setForksEnabled(TRIP_ID, true);

    expect(result.success).toBe(true);
    expect(tripUpdateMock).toHaveBeenCalledWith({
      where: { id: TRIP_ID },
      data: { forksEnabled: true },
    });
    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: TRIP_ID,
        entityType: "FORK",
        changes: { summary: "Turned plan variants on" },
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}`, "layout");
  });

  it("disabling: only flips the flag — existing Forks are left untouched", async () => {
    tripUpdateMock.mockResolvedValue({});

    const result = await setForksEnabled(TRIP_ID, false);

    expect(result.success).toBe(true);
    expect(tripUpdateMock).toHaveBeenCalledWith({
      where: { id: TRIP_ID },
      data: { forksEnabled: false },
    });
    expect(forkFindManyMock).not.toHaveBeenCalled();
    expect(recomputeChapterSpansMock).not.toHaveBeenCalled();
    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({ changes: { summary: "Turned plan variants off" } }),
    );
  });
});

// ---------------------------------------------------------------------------
// removeTripMember
// ---------------------------------------------------------------------------

describe("removeTripMember", () => {
  it("ARCH-DAT-1: the owner can remove a Traveller", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u1", email: "owner@example.com" },
      membership: { role: "owner" },
    });
    userFindUniqueMock.mockResolvedValueOnce({ email: "traveller@example.com" });

    const result = await removeTripMember("t1", "u2");

    expect(result.success).toBe(true);
    expect(memberDeleteManyMock).toHaveBeenCalledWith({ where: { tripId: "t1", userId: "u2" } });
  });

  it("ARCH-DAT-1: a plain Traveller cannot remove anyone else", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u2", email: "traveller@example.com" },
      membership: { role: "member" },
    });

    const result = await removeTripMember("t1", "u3");

    expect(result.success).toBe(false);
    expect(memberDeleteManyMock).not.toHaveBeenCalled();
  });

  it("ARCH-DAT-1: the owner cannot remove themselves", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u1", email: "owner@example.com" },
      membership: { role: "owner" },
    });

    const result = await removeTripMember("t1", "u1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/transfer/i);
    }
    expect(memberDeleteManyMock).not.toHaveBeenCalled();
  });

  it("deletes a pending Invite for the removed Traveller's email on this trip", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u1", email: "owner@example.com" },
      membership: { role: "owner" },
    });
    userFindUniqueMock.mockResolvedValueOnce({ email: "Traveller@Example.com" });

    await removeTripMember("t1", "u2");

    expect(userFindUniqueMock).toHaveBeenCalledWith({ where: { id: "u2" }, select: { email: true } });
    expect(inviteDeleteManyMock).toHaveBeenCalledWith({
      where: { tripId: "t1", email: "traveller@example.com", acceptedAt: null },
    });
  });

  it("still removes the membership row when the removed user can't be found for invite cleanup", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u1", email: "owner@example.com" },
      membership: { role: "owner" },
    });
    userFindUniqueMock.mockResolvedValueOnce(null);

    const result = await removeTripMember("t1", "u2");

    expect(result.success).toBe(true);
    expect(memberDeleteManyMock).toHaveBeenCalledWith({ where: { tripId: "t1", userId: "u2" } });
    expect(inviteDeleteManyMock).not.toHaveBeenCalled();
  });

  it("revalidates the trip's settings and home pages after removal", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u1", email: "owner@example.com" },
      membership: { role: "owner" },
    });
    userFindUniqueMock.mockResolvedValueOnce(null);

    await removeTripMember(TRIP_ID, "u2");

    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/settings`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}`);
  });

  it("is access-checked BEFORE the mutation — the trap this action is the first to risk", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u1", email: "owner@example.com" },
      membership: { role: "owner" },
    });
    userFindUniqueMock.mockResolvedValueOnce(null);

    await removeTripMember(TRIP_ID, "u2");

    expectAccessCheckedBeforeWrite(requireTripAccessMock, memberDeleteManyMock);
    // requireTripAccess (the cache()-memoised guard) must be called exactly
    // once — a second call in the same request would read the stale,
    // pre-removal membership table (see lib/guards.ts's warning).
    expect(requireTripAccessMock).toHaveBeenCalledOnce();
  });

  it("lets an ADMIN_EMAILS operator remove a Traveller even without the owner role", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u-admin", email: "admin@example.com" },
      membership: { role: "member" },
    });
    userFindUniqueMock.mockResolvedValueOnce(null);

    const result = await removeTripMember("t1", "u2");

    expect(result.success).toBe(true);
    expect(memberDeleteManyMock).toHaveBeenCalledWith({ where: { tripId: "t1", userId: "u2" } });
    delete process.env.ADMIN_EMAILS;
  });

  // I1 (final fix wave). The gate admits an ADMIN_EMAILS operator and the
  // self-check only ever protected the CALLER, so nothing stopped an admin
  // who is not the owner from removing the Trip's owner — leaving a Trip with
  // Travellers on it and no owner, which can never again be deleted,
  // duplicated, invited to, have a Stop deleted or a fork promoted, with no
  // ownership transfer to recover with.
  it("refuses to remove the trip's OWNER, even for an ADMIN_EMAILS operator", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u-admin", email: "admin@example.com" },
      membership: { role: "member" },
    });
    memberFindUniqueMock.mockResolvedValueOnce({ role: "owner" });

    const result = await removeTripMember("t1", "u-owner");

    expect(result).toEqual({
      success: false,
      error:
        "You can't remove the trip's owner — a trip with no owner could never be deleted, duplicated or invited to again.",
    });
    expect(memberDeleteManyMock).not.toHaveBeenCalled();
    expect(inviteDeleteManyMock).not.toHaveBeenCalled();
    delete process.env.ADMIN_EMAILS;
  });

  it("refuses to remove the trip's OWNER when another owner-role caller tries it", async () => {
    // Belt-and-braces: the self-check only fires when the target IS the
    // caller, so a second owner-role row (or a future transfer bug) must be
    // caught by the target's role, not by identity.
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u1", email: "owner@example.com" },
      membership: { role: "owner" },
    });
    memberFindUniqueMock.mockResolvedValueOnce({ role: "owner" });

    const result = await removeTripMember("t1", "u-other-owner");

    expect(result.success).toBe(false);
    expect(memberDeleteManyMock).not.toHaveBeenCalled();
  });

  it("looks the target's role up by the (tripId, userId) membership key", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u1", email: "owner@example.com" },
      membership: { role: "owner" },
    });
    userFindUniqueMock.mockResolvedValueOnce(null);

    await removeTripMember("t1", "u2");

    expect(memberFindUniqueMock).toHaveBeenCalledWith({
      where: { tripId_userId: { tripId: "t1", userId: "u2" } },
      select: { role: true },
    });
  });
});

// ---------------------------------------------------------------------------
// leaveTrip
// ---------------------------------------------------------------------------

describe("leaveTrip", () => {
  it("ARCH-DAT-1: a Traveller can leave", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u2", email: "traveller@example.com" },
      membership: { role: "member" },
    });

    const result = await leaveTrip("t1");

    expect(result.success).toBe(true);
    expect(memberDeleteManyMock).toHaveBeenCalledWith({ where: { tripId: "t1", userId: "u2" } });
  });

  it("ARCH-DAT-1: the owner cannot leave without transferring ownership", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u1", email: "owner@example.com" },
      membership: { role: "owner" },
    });

    const result = await leaveTrip("t1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/transfer/i);
    }
    expect(memberDeleteManyMock).not.toHaveBeenCalled();
  });

  it("deletes a pending Invite for the leaving Traveller's own email on this trip", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u2", email: "Traveller@Example.com" },
      membership: { role: "member" },
    });

    await leaveTrip("t1");

    expect(inviteDeleteManyMock).toHaveBeenCalledWith({
      where: { tripId: "t1", email: "traveller@example.com", acceptedAt: null },
    });
  });

  it("revalidates the trip's settings, home, and the trips list after leaving", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u2", email: "traveller@example.com" },
      membership: { role: "member" },
    });

    await leaveTrip(TRIP_ID);

    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}/settings`);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/trips/${TRIP_ID}`);
    expect(revalidatePathMock).toHaveBeenCalledWith("/trips");
  });

  it("is access-checked BEFORE the mutation, called exactly once (no stale re-check)", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "u2", email: "traveller@example.com" },
      membership: { role: "member" },
    });

    await leaveTrip(TRIP_ID);

    expectAccessCheckedBeforeWrite(requireTripAccessMock, memberDeleteManyMock);
    expect(requireTripAccessMock).toHaveBeenCalledOnce();
  });
});
