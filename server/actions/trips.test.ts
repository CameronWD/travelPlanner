import { afterEach, describe, expect, it, vi } from "vitest";

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
  chapterCreateMock,
  stopCreateMock,
  itemCreateMock,
  transportCreateMock,
  checklistItemCreateMock,
  transactionMock,
  attachmentFindManyMock,
  storageDeleteMock,
  storageSaveMock,
  geocodePlaceDetailedMock,
} = vi.hoisted(() => {
  const tripCreateMock = vi.fn();
  const tripUpdateMock = vi.fn();
  const tripDeleteMock = vi.fn();
  const tripFindUniqueMock = vi.fn();
  const memberCreateMock = vi.fn();
  const chapterCreateMock = vi.fn();
  const stopCreateMock = vi.fn();
  const itemCreateMock = vi.fn();
  const transportCreateMock = vi.fn();
  const checklistItemCreateMock = vi.fn();
  const attachmentFindManyMock = vi.fn().mockResolvedValue([]);
  const storageDeleteMock = vi.fn().mockResolvedValue(undefined);
  const storageSaveMock = vi.fn().mockResolvedValue(undefined);

  // $transaction executes the callback synchronously-ish in tests;
  // we simulate it by calling the callback with a fake tx object.
  const transactionMock = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      trip: { create: tripCreateMock },
      tripMember: { create: memberCreateMock },
      chapter: { create: chapterCreateMock },
      stop: { create: stopCreateMock },
      item: { create: itemCreateMock },
      transport: { create: transportCreateMock },
      checklistItem: { create: checklistItemCreateMock },
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
    chapterCreateMock,
    stopCreateMock,
    itemCreateMock,
    transportCreateMock,
    checklistItemCreateMock,
    transactionMock,
    attachmentFindManyMock,
    storageDeleteMock,
    storageSaveMock,
    geocodePlaceDetailedMock: vi.fn(),
  };
});

vi.mock("@/lib/guards", () => ({
  requireUser: requireUserMock,
  requireTripAccess: requireTripAccessMock,
}));
vi.mock("@/lib/geocode", () => ({
  geocodePlaceDetailed: geocodePlaceDetailedMock,
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
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/server/actions/activity", () => ({ recordActivity: vi.fn().mockResolvedValue(undefined) }));

import { createTrip, updateTrip, deleteTrip, setTripHardEndDate, duplicateTrip } from "./trips";

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

    // createTrip will call redirect() which throws — catch it.
    await expect(createTrip(VALID_INPUT)).rejects.toThrow("NEXT_REDIRECT");

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

    // Assert the redirect goes to the right path.
    expect(redirectMock).toHaveBeenCalledWith(`/trips/${newTrip.id}`);
  });

  it("creates a date-less trip", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    tripCreateMock.mockResolvedValue({ id: "trip-dateless", name: "Europe someday" });
    memberCreateMock.mockResolvedValue({});

    await expect(createTrip({ name: "Europe someday", homeCurrency: "AUD" })).rejects.toThrow("NEXT_REDIRECT");

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

    await expect(createTrip(VALID_INPUT)).rejects.toThrow("NEXT_REDIRECT");

    expect(tripCreateMock).toHaveBeenCalledOnce();
    // storage.save must NOT be called — no cover was provided
    expect(storageSaveMock).not.toHaveBeenCalled();
    // trip.update must NOT be called for coverImageKey
    expect(tripUpdateMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith(`/trips/${newTrip.id}`);
  });

  it("saves the cover and sets coverImageKey when a valid PNG is passed", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    const newTrip = { id: "trip-with-cover", name: "Japan 2026" };
    tripCreateMock.mockResolvedValue(newTrip);
    memberCreateMock.mockResolvedValue({});
    tripUpdateMock.mockResolvedValue({});

    const imageFile = new File([new Uint8Array([1, 2, 3])], "hero.png", { type: "image/png" });

    await expect(createTrip(VALID_INPUT, imageFile)).rejects.toThrow("NEXT_REDIRECT");

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

    await expect(createTrip(VALID_INPUT, pdfFile)).rejects.toThrow("NEXT_REDIRECT");

    // Trip was created
    expect(tripCreateMock).toHaveBeenCalledOnce();
    // But cover was rejected silently — save NOT called
    expect(storageSaveMock).not.toHaveBeenCalled();
    expect(tripUpdateMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith(`/trips/${newTrip.id}`);
  });

  it("geocodes homeName at creation and stores coords in the trip row", async () => {
    requireUserMock.mockResolvedValue({ id: "user-1", email: "you@example.com" });
    geocodePlaceDetailedMock.mockResolvedValueOnce({
      name: "Sydney", lat: -33.86, lng: 151.2, city: "Sydney", country: "Australia", countryCode: "au",
    });
    const newTrip = { id: "trip-home", name: "Down Under" };
    tripCreateMock.mockResolvedValue(newTrip);
    memberCreateMock.mockResolvedValue({});

    await expect(
      createTrip({ name: "Down Under", homeCurrency: "AUD", homeName: "Sydney" }),
    ).rejects.toThrow("NEXT_REDIRECT");

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

    await expect(createTrip({ name: "Wanderer", homeCurrency: "AUD" })).rejects.toThrow("NEXT_REDIRECT");

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

    await expect(
      createTrip({ name: "Wanderer", homeCurrency: "AUD", homeName: "Nowheresville" }),
    ).rejects.toThrow("NEXT_REDIRECT");

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

    await expect(
      createTrip({ name: "One-way", homeCurrency: "AUD", roundTrip: false }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(tripCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ roundTrip: false }),
    });
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
});

// ---------------------------------------------------------------------------
// deleteTrip
// ---------------------------------------------------------------------------

describe("deleteTrip", () => {
  it("is access-checked — calls requireTripAccess with the tripId", async () => {
    // owner role — will succeed
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: null });
    tripDeleteMock.mockResolvedValue({});

    await expect(deleteTrip(TRIP_ID)).rejects.toThrow("NEXT_REDIRECT");

    expect(requireTripAccessMock).toHaveBeenCalledWith(TRIP_ID);
  });

  it("deletes the trip and redirects to /trips when caller is owner", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "user-1" },
      membership: { role: "owner" },
    });
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: null });
    tripDeleteMock.mockResolvedValue({});

    await expect(deleteTrip(TRIP_ID)).rejects.toThrow("NEXT_REDIRECT");

    expect(tripDeleteMock).toHaveBeenCalledOnce();
    expect(tripDeleteMock).toHaveBeenCalledWith({ where: { id: TRIP_ID } });
    expect(redirectMock).toHaveBeenCalledWith("/trips");
  });

  it("deletes attachment blobs before cascading the trip rows away", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "user-1" },
      membership: { role: "owner" },
    });
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: null });
    attachmentFindManyMock.mockResolvedValueOnce([
      { storageKey: "trips/trip-abc/k1" },
      { storageKey: "trips/trip-abc/k2" },
    ]);
    tripDeleteMock.mockResolvedValue({});

    await expect(deleteTrip(TRIP_ID)).rejects.toThrow("NEXT_REDIRECT");

    expect(storageDeleteMock).toHaveBeenCalledWith("trips/trip-abc/k1");
    expect(storageDeleteMock).toHaveBeenCalledWith("trips/trip-abc/k2");
    expect(tripDeleteMock).toHaveBeenCalledWith({ where: { id: TRIP_ID } });
  });

  it("deletes the cover blob when the trip has a coverImageKey", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "user-1" },
      membership: { role: "owner" },
    });
    tripFindUniqueMock.mockResolvedValue({ coverImageKey: "trips/trip-abc/uuid-cover.jpg" });
    attachmentFindManyMock.mockResolvedValueOnce([]);
    tripDeleteMock.mockResolvedValue({});

    await expect(deleteTrip(TRIP_ID)).rejects.toThrow("NEXT_REDIRECT");

    expect(storageDeleteMock).toHaveBeenCalledWith("trips/trip-abc/uuid-cover.jpg");
    expect(tripDeleteMock).toHaveBeenCalledWith({ where: { id: TRIP_ID } });
  });

  it("returns a forbidden error and does NOT delete when caller is a member (not owner)", async () => {
    requireTripAccessMock.mockResolvedValueOnce({
      user: { id: "user-2" },
      membership: { role: "member" },
    });

    const result = await deleteTrip(TRIP_ID);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/owner/i);
    }
    expect(tripDeleteMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
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
  it("creates a new trip + owner membership + copies co-travellers, and remaps children", async () => {
    requireTripAccessMock.mockResolvedValue({ user: { id: "user-1" }, membership: { role: "member" } });
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
                endTime: null, lat: null, lng: null, address: null, link: null, booking: "B", notes: null }],
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

    const result = await duplicateTrip("src", "Copy of Europe 2026");

    expect(result).toEqual({ success: true, tripId: "new" });
    expect(tripCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: "Copy of Europe 2026", homeCurrency: "AUD", createdById: "user-1" }),
    }));
    // owner + one co-traveller membership
    expect(memberCreateMock).toHaveBeenCalledWith({ data: { tripId: "new", userId: "user-1", role: "owner" } });
    expect(memberCreateMock).toHaveBeenCalledWith({ data: { tripId: "new", userId: "user-2", role: "member" } });
    // stops created rough (dates null), remapped to new chapter
    expect(stopCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ tripId: "new", name: "Rome", arriveDate: null, departDate: null, chapterId: "new-ch1" }) });
    expect(stopCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ tripId: "new", name: "Florence", arriveDate: null, departDate: null, chapterId: "new-ch1" }) });
    // item created unscheduled under the remapped stop
    expect(itemCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ tripId: "new", stopId: "new-s1", date: null, booking: null }) });
    // transport remapped to new stop ids, dates cleared
    expect(transportCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ tripId: "new", fromStopId: "new-s1", toStopId: "new-s2", depAt: null, arrAt: null, reference: null }) });
    // checklist item copied with dates cleared and done reset
    expect(checklistItemCreateMock).toHaveBeenCalledWith({ data: expect.objectContaining({ tripId: "new", text: "Passport", done: false, dueDate: null, assignedToId: null }) });
  });

  it("denies when the caller lacks access", async () => {
    requireTripAccessMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(duplicateTrip("src", "x")).rejects.toThrow();
  });
});
